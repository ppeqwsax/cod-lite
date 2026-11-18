/* cod-lite · 单机 BOT：BFS 寻路 + 视线判定 + 瞄准开火 */
var Bot = (function () {
  var W = G.MAP_W, H = G.MAP_H;

  var LEVELS = {
    easy:   { react: 0.55, aim: 0.16, turn: 2.4, speed: 0.62, burst: 4 },
    normal: { react: 0.28, aim: 0.075, turn: 3.2, speed: 0.78, burst: 6 },
    hard:   { react: 0.16, aim: 0.035, turn: 4.2, speed: 0.9, burst: 9 }
  };

  function cellX(v) { return Math.floor(v / G.TILE); }

  /* 4 邻域 BFS，返回格中心世界坐标数组（不含起点格） */
  function findPath(sx, sy, gx, gy) {
    var start = sy * W + sx, goal = gy * W + gx;
    if (MapData.solid(sx, sy) || MapData.solid(gx, gy)) return null;
    var prev = new Int16Array(W * H).fill(-1);
    var seen = new Uint8Array(W * H);
    var queue = [start];
    seen[start] = 1;
    var head = 0, found = false;
    while (head < queue.length) {
      var cur = queue[head++];
      if (cur === goal) { found = true; break; }
      var cx = cur % W, cy = (cur / W) | 0;
      var nbr = [cur - 1, cur + 1, cur - W, cur + W];
      var okX = [cx > 0, cx < W - 1, true, true];
      for (var i = 0; i < 4; i++) {
        if (!okX[i]) continue;
        var n = nbr[i];
        if (n < 0 || n >= W * H || seen[n]) continue;
        var nx = n % W, ny = (n / W) | 0;
        if (MapData.solid(nx, ny)) continue;
        seen[n] = 1;
        prev[n] = cur;
        queue.push(n);
      }
    }
    if (!found) return null;

    var path = [], node = goal, guard = 0;
    while (node !== start && guard++ < 2048) {
      path.push({ x: (node % W + 0.5) * G.TILE, y: (((node / W) | 0) + 0.5) * G.TILE });
      node = prev[node];
      if (node < 0) return null;
    }
    path.reverse();
    return path;
  }

  function randomFreeCell(minDist, fromX, fromY) {
    for (var i = 0; i < 80; i++) {
      var tx = 1 + ((Math.random() * (W - 2)) | 0);
      var ty = 1 + ((Math.random() * (H - 2)) | 0);
      if (MapData.solid(tx, ty)) continue;
      var wx = (tx + 0.5) * G.TILE, wy = (ty + 0.5) * G.TILE;
      if (dist(wx, wy, fromX, fromY) < minDist) continue;
      return { tx: tx, ty: ty };
    }
    return null;
  }

  function create(spawn, level) {
    return {
      name: 'BOT',
      level: LEVELS[level] || LEVELS.normal,
      x: spawn.x, y: spawn.y, angle: spawn.a || 0,
      vx: 0, vy: 0, hp: G.MAX_HP, alive: true,
      weapon: 'rifle',
      fireCd: 0, reloadT: 0, burstLeft: 0, burstCd: 0,
      muzzle: 0, hurtAt: -99,
      path: null, pathI: 0, repathT: 0,
      see: false, seeT: 0, aimErr: 0, aimErrT: 0,
      strafe: 0, strafeT: 0,
      respawnT: 0, kills: 0, deaths: 0
    };
  }

  function canSee(b, p) {
    var d = dist(b.x, b.y, p.x, p.y);
    if (d > 34) return false;
    var ang = Math.atan2(p.y - b.y, p.x - b.x);
    var r = Sim.castRay(b.x, b.y, ang, d + 0.2);
    return !r.hit || r.dist >= d - 0.15;
  }

  function repath(b, p) {
    var here = { tx: cellX(b.x), ty: cellX(b.y) };
    var goal = randomFreeCell(9, p.x, p.y) || { tx: here.tx, ty: here.ty };
    var path = findPath(here.tx, here.ty, goal.tx, goal.ty);
    b.path = path;
    b.pathI = 0;
    b.repathT = 2.5 + Math.random() * 2;
  }

  function update(dt, b, g, p) {
    if (b.fireCd > 0) b.fireCd -= dt;
    if (b.muzzle > 0) b.muzzle -= dt;
    if (b.reloadT > 0) {
      b.reloadT -= dt;
      if (b.reloadT <= 0) b.ammo = b.def ? b.def.mag : 30;
      return;
    }
    if (!b.alive) {
      b.respawnT -= dt;
      if (b.respawnT <= 0) respawn(b, g, p);
      return;
    }

    b.seeT -= dt;
    if (b.seeT <= 0) { b.see = canSee(b, p); b.seeT = 0.18; }

    var def = weaponDefOf(b);
    var speed = G.WALK * b.level.speed;

    if (b.see) {
      /* 战斗中：对准玩家 + 侧移 */
      var want = Math.atan2(p.y - b.y, p.x - b.x);
      var d = angleDiff(want, b.angle);
      var step = b.level.turn * dt;
      b.angle += clamp(d, -step, step);

      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.strafeT = 0.7 + Math.random() * 0.8; }
      var sx = -Math.sin(b.angle) * b.strafe, sy = Math.cos(b.angle) * b.strafe;
      moveBy(b, sx * speed * 0.55 * dt, sy * speed * 0.55 * dt);

      /* 瞄准误差逐渐收敛 */
      b.aimErrT -= dt;
      if (b.aimErrT <= 0) { b.aimErr = (Math.random() - 0.5) * b.level.aim * 2; b.aimErrT = 0.25; }

      if (Math.abs(d) < 0.09 + b.level.aim && b.fireCd <= 0 && dist(b.x, b.y, p.x, p.y) < def.range) {
        enemyFire(g, b, p, def);
      }
    } else {
      /* 巡逻：沿 BFS 路径走，到点/超时重新选点 */
      b.repathT -= dt;
      if (!b.path || b.pathI >= b.path.length || b.repathT <= 0) repath(b, p);
      if (b.path && b.pathI < b.path.length) {
        var wp = b.path[b.pathI];
        var dx = wp.x - b.x, dy = wp.y - b.y;
        var dd = Math.hypot(dx, dy);
        if (dd < 0.35) {
          b.pathI++;
        } else {
          var na = Math.atan2(dy, dx);
          b.angle += clamp(angleDiff(na, b.angle), -b.level.turn * dt, b.level.turn * dt);
          moveBy(b, (dx / dd) * speed * dt, (dy / dd) * speed * dt);
        }
      }
    }
  }

  function moveBy(b, dx, dy) {
    var nx = b.x + dx, ny = b.y + dy;
    if (!MapData.blocked(nx, b.y, G.R)) b.x = nx;
    if (!MapData.blocked(b.x, ny, G.R)) b.y = ny;
  }

  function enemyFire(g, b, p, def) {
    var ang = b.angle + b.aimErr + (Math.random() - 0.5) * def.spread * 2;
    /* 点射：打几发停一下，避免一梭子秒人 */
    if (b.burstLeft <= 0) { b.burstLeft = b.level.burst; }
    b.burstLeft--;
    b.fireCd = b.burstLeft > 0 ? 60 / def.rpm * 1.3 : 0.55 + Math.random() * 0.35;
    b.muzzle = 0.06;

    var wall = Sim.castRay(b.x, b.y, ang, def.range);
    var hit = Sim.rayHitPlayer(b.x, b.y, ang, wall.dist, p);
    if (hit) Sim.hitPlayer(g, p, def.dmg * 0.55, b);
    Sim.addTracer(g, b.x, b.y, hit ? p.x : wall.x, hit ? p.y : wall.y);
    if (!hit && wall.hit) Sim.addHitMark(g, wall.x, wall.y);
  }

  function respawn(b, g, p) {
    var best = null, bestD = -1;
    for (var i = 0; i < MapData.spawns.length; i++) {
      var s = MapData.spawns[i];
      var d = dist(s.x, s.y, p.x, p.y);
      if (d > bestD) { bestD = d; best = s; }
    }
    b.x = best.x; b.y = best.y; b.angle = best.a;
    b.hp = G.MAX_HP; b.alive = true; b.path = null;
    b.fireCd = 0; b.reloadT = 0; b.muzzle = 0;
  }

  function weaponDefOf(b) { return WEAPONS[b.weapon] || WEAPONS.rifle; }

  return { create: create, update: update, findPath: findPath, LEVELS: LEVELS, weaponDef: weaponDefOf };
})();
