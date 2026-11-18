/* cod-lite · 权威模拟（单机与联机共用同一份 step） */
var Sim = (function () {

  /* 射线求交（格坐标）：返回最近的墙命中点 */
  function castRay(x, y, ang, maxDist) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var tx = x / G.TILE, ty = y / G.TILE;
    var maxT = maxDist / G.TILE;

    var mapX = tx | 0, mapY = ty | 0;
    var deltaX = Math.abs(1 / (dx || 1e-9)), deltaY = Math.abs(1 / (dy || 1e-9));
    var stepX, stepY, sideX, sideY;
    if (dx < 0) { stepX = -1; sideX = (tx - mapX) * deltaX; } else { stepX = 1; sideX = (mapX + 1 - tx) * deltaX; }
    if (dy < 0) { stepY = -1; sideY = (ty - mapY) * deltaY; } else { stepY = 1; sideY = (mapY + 1 - ty) * deltaY; }

    var side = 0, guard = 0;
    while (guard++ < 128) {
      if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
      else { sideY += deltaY; mapY += stepY; side = 1; }
      var d = side === 0 ? sideX - deltaX : sideY - deltaY;
      if (d > maxT) return { dist: maxDist, x: x + dx * maxDist, y: y + dy * maxDist, hit: false };
      if (mapX < 0 || mapY < 0 || mapX >= G.MAP_W || mapY >= G.MAP_H) break;
      if (MapData.solid(mapX, mapY)) {
        var hx = x + dx * (d * G.TILE), hy = y + dy * (d * G.TILE);
        return { dist: d * G.TILE, x: hx, y: hy, hit: true, tile: MapData.at(mapX, mapY) };
      }
    }
    return { dist: maxDist, x: x + dx * maxDist, y: y + dy * maxDist, hit: false };
  }

  function newGame() {
    var g = {
      players: [],
      bots: [],
      effects: [],
      decals: [],       // 墙上的弹孔
      tracers: [],      // 弹道线
      time: 0,
      shots: 0,
      hits: 0,
      match: { target: 25, limit: 300, left: 300, over: false, player: 0, bot: 0 }
    };
    g.players.push(new Player(MapData.spawns[0]));
    return g;
  }

  function addTracer(g, x0, y0, x1, y1) {
    g.tracers.push({ x0: x0, y0: y0, x1: x1, y1: y1, t: 0, life: 0.06 });
    if (g.tracers.length > 10) g.tracers.shift();
  }

  function addHitMark(g, x, y) { addEffect(g, x, y, 'spark'); }

  /* 射线是否打到玩家（bot 开火用） */
  function rayHitPlayer(x, y, ang, maxDist, p) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var vx = p.x - x, vy = p.y - y;
    var t = vx * dx + vy * dy;
    if (t < 0 || t > maxDist) return false;
    return Math.abs(vx * dy - vy * dx) < 0.55;
  }

  function hitPlayer(g, p, dmg, by) {
    if (!p.alive) return;
    p.hp -= dmg;
    p.hurtAt = g.time;
    if (p.hp <= 0) {
      p.hp = 0;
      p.alive = false;
      p.respawnT = 3;
      g.match.bot++;
      if (by) by.kills++;
    }
  }

  function respawnPlayer(g, p) {
    var best = MapData.spawns[0], bestScore = -1;
    for (var i = 0; i < MapData.spawns.length; i++) {
      var s = MapData.spawns[i], dmin = 1e9;
      for (var j = 0; j < g.bots.length; j++) {
        var b = g.bots[j];
        if (!b.alive) continue;
        dmin = Math.min(dmin, dist(s.x, s.y, b.x, b.y));
      }
      if (dmin > bestScore) { bestScore = dmin; best = s; }
    }
    p.respawn(best);
  }

  function addEffect(g, x, y, kind) {
    g.effects.push({ x: x, y: y, t: 0, life: kind === 'spark' ? 0.16 : 0.5, kind: kind });
    if (g.effects.length > 64) g.effects.shift();
  }

  function tryFire(g, p) {
    var def = p.def();
    if (p.fireCd > 0 || p.reloadT > 0) return false;
    if (p.ammo[p.weapon] <= 0) {
      if (p.reserve[p.weapon] > 0) startReload(p);
      return false;
    }
    p.ammo[p.weapon]--;
    p.fireCd = 60 / def.rpm;
    p.muzzle = 0.05;

    var spread = def.spread + (p.moving > 0.35 ? def.moveSpread : 0);
    var ang = p.angle + (Math.random() - 0.5) * spread * 2;
    var res = castRay(p.x, p.y, ang, def.range);
    g.shots++;

    /* 先看有没有打到 bot（比墙近才算） */
    var hitBot = null, hitT = res.hit ? res.dist : def.range;
    for (var i = 0; i < g.bots.length; i++) {
      var b = g.bots[i];
      if (!b.alive) continue;
      var vx = b.x - p.x, vy = b.y - p.y;
      var t = vx * Math.cos(ang) + vy * Math.sin(ang);
      if (t <= 0 || t > hitT) continue;
      if (Math.abs(vx * Math.sin(ang) - vy * Math.cos(ang)) > 0.55) continue;
      hitT = t; hitBot = b;
    }

    if (hitBot) {
      g.hits++;
      hitBot.hp -= def.dmg;
      hitBot.hurtAt = g.time;
      addEffect(g, p.x + Math.cos(ang) * hitT, p.y + Math.sin(ang) * hitT, 'spark');
      addTracer(g, p.x, p.y, p.x + Math.cos(ang) * hitT, p.y + Math.sin(ang) * hitT);
      if (hitBot.hp <= 0) {
        hitBot.hp = 0;
        hitBot.alive = false;
        hitBot.respawnT = 3;
        g.match.player++;
        p.kills = (p.kills || 0) + 1;
      }
    } else if (res.hit) {
      g.hits++;
      addEffect(g, res.x, res.y, 'spark');
      g.decals.push({ x: res.x, y: res.y, t: 0, life: 7 });
      if (g.decals.length > 36) g.decals.shift();
      addTracer(g, p.x, p.y, res.x, res.y);
    } else {
      addTracer(g, p.x, p.y, res.x, res.y);
    }
    // 后坐力
    p.recoil = Math.min(1.2, p.recoil + def.recoil * 0.35);
    p.pitch = clamp(p.pitch + def.recoil * 0.012, -G.PITCH_MAX, G.PITCH_MAX);
    p.lastShot = { x: res.x, y: res.y, hit: res.hit, t: g.time };
    return true;
  }

  function startReload(p) {
    var def = p.def();
    if (p.reloadT > 0) return;
    if (p.ammo[p.weapon] >= def.mag) return;
    if (p.reserve[p.weapon] <= 0) return;
    p.reloadT = def.reload;
  }

  function finishReload(p) {
    var def = p.def();
    var need = def.mag - p.ammo[p.weapon];
    var take = Math.min(need, p.reserve[p.weapon]);
    p.ammo[p.weapon] += take;
    p.reserve[p.weapon] -= take;
  }

  function step(g, p, dt, input) {
    g.time += dt;

    /* 比赛计时 + 结束判定 */
    var m = g.match;
    if (!m.over) {
      m.left -= dt;
      if (m.player >= m.target || m.bot >= m.target || m.left <= 0) {
        m.over = true;
        m.left = Math.max(0, m.left);
      }
    }

    /* 玩家死亡 → 复活倒计时 */
    if (!p.alive) {
      p.respawnT -= dt;
      if (p.respawnT <= 0) respawnPlayer(g, p);
      return;
    }

    /* 视角 */
    p.angle = normAngle(p.angle + input.mouseDX * G.MOUSE);
    p.pitch = clamp(p.pitch - input.mouseDY * G.MOUSE * 0.75, -G.PITCH_MAX, G.PITCH_MAX);

    /* 移动 */
    var fwd = (input.keyW ? 1 : 0) - (input.keyS ? 1 : 0);
    var strafe = (input.keyD ? 1 : 0) - (input.keyA ? 1 : 0);
    var len = Math.hypot(fwd, strafe);
    if (len > 1) { fwd /= len; strafe /= len; }
    var speed = (input.shift ? G.SPRINT : G.WALK);
    if (p.reloadT > 0) speed *= 0.85;

    var dirX = Math.cos(p.angle), dirY = Math.sin(p.angle);
    var wishX = dirX * fwd - dirY * strafe;
    var wishY = dirY * fwd + dirX * strafe;
    var tvx = wishX * speed, tvy = wishY * speed;

    var k = clamp(G.ACCEL * dt, 0, 1);
    p.vx += (tvx - p.vx) * k;
    p.vy += (tvy - p.vy) * k;
    if (!fwd && !strafe) {
      var f = clamp(G.FRICTION * dt, 0, 1);
      p.vx -= p.vx * f; p.vy -= p.vy * f;
    }

    var nx = p.x + p.vx * dt;
    if (!MapData.blocked(nx, p.y, G.R)) p.x = nx; else p.vx = 0;
    var ny = p.y + p.vy * dt;
    if (!MapData.blocked(p.x, ny, G.R)) p.y = ny; else p.vy = 0;

    p.moving = clamp(Math.hypot(p.vx, p.vy) / G.WALK, 0, 1.4);
    p.bob += dt * (6 + p.moving * 8);

    /* 开火 / 换弹 */
    if (p.fireCd > 0) p.fireCd -= dt;
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) { p.reloadT = 0; finishReload(p); }
    }
    if (input.reload) { startReload(p); input.reload = false; }
    if (input.fire) tryFire(g, p);

    p.recoil = Math.max(0, p.recoil - dt * 4.5);
    if (p.muzzle > 0) p.muzzle -= dt;

    /* 回血 */
    if (p.alive && p.hp < G.MAX_HP && g.time - p.hurtAt > G.REGEN_DELAY) {
      p.hp = Math.min(G.MAX_HP, p.hp + G.REGEN_RATE * dt);
    }

    /* 特效寿命 */
    for (var i = g.effects.length - 1; i >= 0; i--) {
      var e = g.effects[i];
      e.t += dt;
      if (e.t >= e.life) g.effects.splice(i, 1);
    }
    for (var j = g.tracers.length - 1; j >= 0; j--) {
      var tr = g.tracers[j];
      tr.t += dt;
      if (tr.t >= tr.life) g.tracers.splice(j, 1);
    }
    for (var k2 = g.decals.length - 1; k2 >= 0; k2--) {
      var dc = g.decals[k2];
      dc.t += dt;
      if (dc.t >= dc.life) g.decals.splice(k2, 1);
    }
  }

  return {
    newGame: newGame,
    step: step,
    castRay: castRay,
    startReload: startReload,
    tryFire: tryFire,
    addTracer: addTracer,
    addHitMark: addHitMark,
    rayHitPlayer: rayHitPlayer,
    hitPlayer: hitPlayer,
    respawnPlayer: respawnPlayer
  };
})();
