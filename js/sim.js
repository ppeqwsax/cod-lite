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
      effects: [],
      time: 0,
      shots: 0,
      hits: 0
    };
    g.players.push(new Player(MapData.spawns[0]));
    return g;
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
    if (res.hit) {
      g.hits++;
      addEffect(g, res.x, res.y, 'spark');
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
  }

  return {
    newGame: newGame,
    step: step,
    castRay: castRay,
    startReload: startReload,
    tryFire: tryFire
  };
})();
