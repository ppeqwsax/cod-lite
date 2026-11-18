/* cod-lite · 权威模拟（单机与联机共用同一份 step） */
var Sim = (function () {

  /* 带高度的射线：pitch 让弹道上下走，能越过矮墙、打不中脚下的地面 */
  function castRay3(x, y, z0, pitch, ang, maxDist) {
    var dx = Math.cos(ang), dy = Math.sin(ang);
    var step = 0.06;
    var z, cx, cy;
    for (var t = step; t <= maxDist; t += step) {
      z = z0 + pitch * (t / G.TILE);
      if (z <= 0) {
        return { dist: t, x: x + dx * t, y: y + dy * t, z: 0, hit: true, kind: 'floor' };
      }
      if (z > 14) {
        return { dist: t, x: x + dx * t, y: y + dy * t, z: z, hit: false };
      }
      cx = x + dx * t; cy = y + dy * t;
      var mx = (cx / G.TILE) | 0, my = (cy / G.TILE) | 0;
      if (mx < 0 || my < 0 || mx >= G.MAP_W || my >= G.MAP_H) {
        return { dist: t, x: cx, y: cy, z: z, hit: false };
      }
      if (MapData.solid(mx, my)) {
        /* 只有低于墙顶才算打中，否则子弹从墙顶飞过去 */
        if (z <= MapData.h(mx, my) + 0.02) {
          return { dist: t, x: cx, y: cy, z: z, hit: true, kind: 'wall', tile: MapData.at(mx, my) };
        }
      }
    }
    return { dist: maxDist, x: x + dx * maxDist, y: y + dy * maxDist, z: z0 + pitch * (maxDist / G.TILE), hit: false };
  }

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
      botHits: 0,
      lastHit: null,
      lastKill: null,
      lastKillAt: 0,
      killStreak: 0,
      deathMarks: [],
      match: { target: 25, limit: 300, left: 300, over: false, player: 0, bot: 0 }
    };
    g.players.push(new Player(MapData.spawns[0]));
    g.players[0].side = 0;
    return g;
  }

  function addTracer(g, x0, y0, x1, y1, z1) {
    g.tracers.push({ x0: x0, y0: y0, x1: x1, y1: y1, z1: z1 || 0, t: 0, life: 0.06 });
    if (g.tracers.length > 10) g.tracers.shift();
  }

  function addHitMark(g, x, y, z) { addEffect(g, x, y, z, 'spark'); }

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
      p.deaths = (p.deaths || 0) + 1;
      if (by) {
        by.kills = (by.kills || 0) + 1;
        addScore(g, by.side || 0);
      } else {
        addScore(g, 1 - (p.side || 0));
      }
    }
  }

  function addScore(g, side) {
    if (side === 0) g.match.player++;
    else g.match.bot++;
    if (g.match.player >= g.match.target || g.match.bot >= g.match.target) {
      g.match.over = true;
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

  function addEffect(g, x, y, z, kind) {
    g.effects.push({ x: x, y: y, z: z || 0, t: 0, life: kind === 'spark' ? 0.16 : 0.5, kind: kind });
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

    var spread = (def.spread + (p.moving > 0.35 ? def.moveSpread : 0)) * (1 - (1 - G.ADS_SPREAD) * p.ads);
    var ang = p.angle + (Math.random() - 0.5) * spread * 2;
    var eyeZ = p.eyeM || G.EYE;
    var res = castRay3(p.x, p.y, eyeZ, p.pitch, ang, def.range);
    g.shots++;

    /* 先看有没有打到人（bot 或另一名玩家）：比弹着点近、且弹道高度落在身上才算 */
    var hitBot = null, hitPl = null, hitT = res.hit ? res.dist : def.range;
    function lateral(o, ox, oy) {
      var vx = ox - p.x, vy = oy - p.y;
      var t = vx * Math.cos(ang) + vy * Math.sin(ang);
      if (t <= 0 || t > hitT) return -1;
      var lat = Math.abs(vx * Math.sin(ang) - vy * Math.cos(ang));
      var zAt = eyeZ + p.pitch * (t / G.TILE);
      if (zAt > (o.z || 0) + 1.75 || zAt < (o.z || 0) - 0.1) return -1;
      return lat;
    }
    function testTarget(o) {
      if (!o.alive) return;
      var lat = lateral(o, o.x, o.y);
      /* 联机延迟补偿：对手位置晚一个 RTT 才到，回头看他最近 200ms 的轨迹 */
      if ((lat < 0 || lat > 0.55) && o.def && o.hist && o.hist.length) {
        for (var k = o.hist.length - 1; k >= 0; k--) {
          if (g.time - o.hist[k].t > 0.2) break;
          var l2 = lateral(o, o.hist[k].x, o.hist[k].y);
          if (l2 >= 0 && l2 <= 0.55) { lat = l2; break; }
        }
      }
      if (lat < 0 || lat > 0.55) return;
      var vx = o.x - p.x, vy = o.y - p.y;
      hitT = vx * Math.cos(ang) + vy * Math.sin(ang);
      if (o.def) { hitPl = o; hitBot = null; } else { hitBot = o; hitPl = null; }
    }
    for (var i = 0; i < g.bots.length; i++) testTarget(g.bots[i]);
    for (var pi = 0; pi < g.players.length; pi++) {
      if (g.players[pi] !== p) testTarget(g.players[pi]);
    }

    if (hitPl) {
      /* 打中另一名玩家 */
      g.hits++;
      g.botHits = (g.botHits || 0) + 1;
      var pz = (hitPl.z || 0) + 1.15;
      addEffect(g, p.x + Math.cos(ang) * hitT, p.y + Math.sin(ang) * hitT, pz, 'spark');
      addTracer(g, p.x, p.y, p.x + Math.cos(ang) * hitT, p.y + Math.sin(ang) * hitT, pz);
      var wasAlive = hitPl.alive;
      hitPlayer(g, hitPl, def.dmg, p);
      g.lastHit = { t: g.time, kill: wasAlive && !hitPl.alive };
      if (wasAlive && !hitPl.alive) {
        g.lastKill = { t: g.time, headshot: false, streak: 1, x: hitPl.x, y: hitPl.y, z: hitPl.z || 0 };
        g.lastKillAt = g.time;
        if (!g.deathMarks) g.deathMarks = [];
        g.deathMarks.push({ x: hitPl.x, y: hitPl.y, z: hitPl.z || 0, t: g.time, head: false });
      }
    } else if (hitBot) {
      g.hits++;
      g.botHits = (g.botHits || 0) + 1;
      g.lastHit = { t: g.time, kill: false };
      hitBot.hp -= def.dmg;
      hitBot.hurtAt = g.time;
      var bz = (hitBot.z || 0) + 1.15;
      addEffect(g, p.x + Math.cos(ang) * hitT, p.y + Math.sin(ang) * hitT, bz, 'spark');
      addTracer(g, p.x, p.y, p.x + Math.cos(ang) * hitT, p.y + Math.sin(ang) * hitT, bz);
      if (hitBot.hp <= 0) {
        hitBot.hp = 0;
        hitBot.alive = false;
        hitBot.respawnT = 4.5;
        addScore(g, p.side || 0);
        p.kills = (p.kills || 0) + 1;

        /* ---- 击杀反馈数据 ---- */
        var zAtB = eyeZ + p.pitch * (hitT / G.TILE);
        var headshot = zAtB > (hitBot.z || 0) + 1.45;
        if (!g.lastKillAt || g.time - g.lastKillAt > 3.5) g.killStreak = 0;
        g.killStreak = (g.killStreak || 0) + 1;
        g.lastKillAt = g.time;
        g.lastKill = {
          t: g.time, headshot: headshot, streak: g.killStreak,
          x: hitBot.x, y: hitBot.y, z: hitBot.z || 0
        };
        g.lastHit = { t: g.time, kill: true, headshot: headshot };
        if (!g.deathMarks) g.deathMarks = [];
        g.deathMarks.push({ x: hitBot.x, y: hitBot.y, z: hitBot.z || 0, t: g.time, head: headshot });
        if (g.deathMarks.length > 10) g.deathMarks.shift();
      }
    } else if (res.hit) {
      g.hits++;
      addEffect(g, res.x, res.y, res.z, 'spark');
      g.decals.push({ x: res.x, y: res.y, z: res.z, t: 0, life: 7 });
      if (g.decals.length > 36) g.decals.shift();
      addTracer(g, p.x, p.y, res.x, res.y, res.z);
    } else {
      addTracer(g, p.x, p.y, res.x, res.y, res.z);
    }
    // 后坐力（开镜时更稳）
    var rc = 1 - (1 - G.ADS_RECOIL) * p.ads;
    p.recoil = Math.min(1.2, p.recoil + def.recoil * 0.35 * rc);
    p.pitch = clamp(p.pitch + def.recoil * 0.012 * rc, -G.PITCH_MAX, G.PITCH_MAX);
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

  /* 推进比赛：计时、结束判定、所有人复活、特效寿命 */
  function tickMatch(g, dt) {
    g.time += dt;

    /* 记录玩家近 200ms 轨迹，联机时房主拿它做延迟补偿 */
    for (var hi = 0; hi < g.players.length; hi++) {
      var hp0 = g.players[hi];
      if (!hp0.hist) hp0.hist = [];
      hp0.hist.push({ t: g.time, x: hp0.x, y: hp0.y });
      if (hp0.hist.length > 9) hp0.hist.shift();
    }

    var m = g.match;
    if (!m.over) {
      m.left -= dt;
      if (m.player >= m.target || m.bot >= m.target || m.left <= 0) {
        m.over = true;
        m.left = Math.max(0, m.left);
      }
    }

    for (var q = 0; q < g.players.length; q++) {
      var pl = g.players[q];
      if (!pl.alive) {
        pl.respawnT -= dt;
        if (pl.respawnT <= 0) respawnPlayer(g, pl);
      }
    }

    ageEffects(g, dt);
  }

  function ageEffects(g, dt) {
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

  /* 单步推进一名玩家（不含计时/复活/特效寿命，联机时由房主对两人分别调用） */
  function stepPlayer(g, p, dt, input) {
    input = input || {};
    if (!p.alive) return;

    /* 视角 */
    p.angle = normAngle(p.angle + input.mouseDX * G.MOUSE);
    p.pitch = clamp(p.pitch - input.mouseDY * G.MOUSE * 0.75, -G.PITCH_MAX, G.PITCH_MAX);

    /* 开镜：右键渐进收窄视野，同时降低移速与扩散 */
    var adsTarget = (input.aim && !input.shift) ? 1 : 0;
    var adsK = clamp(dt / G.ADS_TIME, 0, 1);
    p.ads += (adsTarget - p.ads) * clamp(adsK * 3.2, 0, 1);
    if (Math.abs(p.ads - adsTarget) < 0.01) p.ads = adsTarget;
    p.fov = G.FOV + (G.FOV_ADS - G.FOV) * p.ads;

    /* ---------- 蹲 / 滑铲 / 跳跃 ---------- */
    var speedNow = Math.hypot(p.vx, p.vy);
    if (p.slideT <= 0 && input.crouch && !p.crouchHeld && p.onGround && speedNow > G.WALK * 0.8) {
      p.slideT = G.SLIDE_TIME;
      var sl = Math.max(1e-3, speedNow);
      p.vx = p.vx / sl * G.SLIDE_SPEED;
      p.vy = p.vy / sl * G.SLIDE_SPEED;
    }
    p.crouchHeld = !!input.crouch;
    p.crouch = !!input.crouch && p.slideT <= 0;

    if (input.jump && p.onGround) {
      var wasSlide = p.slideT > 0;
      p.vz = G.JUMP_V;
      p.onGround = false;
      if (wasSlide) {
        /* 滑铲接跳：把滑铲动量带进空中，手感更顺 */
        var sp0 = Math.hypot(p.vx, p.vy);
        var lim = G.SLIDE_SPEED * G.SLIDE_JUMP_BOOST;
        if (sp0 > 0.5) {
          var sc2 = Math.min(lim, sp0 * G.SLIDE_JUMP_BOOST) / sp0;
          p.vx *= sc2; p.vy *= sc2;
        }
        p.hopT = G.SLIDE_JUMP_TIME;
      }
      p.slideT = 0;
    }
    if (!p.onGround) {
      p.vz -= G.GRAV * dt;
      p.z += p.vz * dt;
      if (p.z <= 0) { p.z = 0; p.vz = 0; p.onGround = true; }
    }
    if (p.slideT > 0) p.slideT -= dt;
    p.eyeM = p.z + (p.slideT > 0 ? G.EYE_SLIDE : (p.crouch ? G.EYE_CROUCH : G.EYE));

    /* 移动 */
    var fwd = (input.keyW ? 1 : 0) - (input.keyS ? 1 : 0);
    var strafe = (input.keyD ? 1 : 0) - (input.keyA ? 1 : 0);
    var len = Math.hypot(fwd, strafe);
    if (len > 1) { fwd /= len; strafe /= len; }
    var speed = (input.shift ? G.SPRINT : G.WALK);
    if (p.reloadT > 0) speed *= 0.85;
    if (p.crouch) speed *= 0.55;
    if (p.ads > 0.05) speed *= (1 - (1 - G.ADS_SPEED) * p.ads);

    var dirX = Math.cos(p.angle), dirY = Math.sin(p.angle);
    var wishX = dirX * fwd - dirY * strafe;
    var wishY = dirY * fwd + dirX * strafe;

    if (p.slideT > 0) {
      /* 滑铲：保持动量，只做轻微摩擦，转向几乎无效 */
      var sf = clamp(1.15 * dt, 0, 1);
      p.vx -= p.vx * sf * 0.45;
      p.vy -= p.vy * sf * 0.45;
    } else {
      var tvx = wishX * speed, tvy = wishY * speed;
      var k = clamp(G.ACCEL * dt, 0, 1) * (p.onGround ? 1 : G.AIR_ACCEL);
      if (p.hopT > 0) k *= 1.3;          /* 滑铲跳的滞空期转向更跟手 */
      p.vx += (tvx - p.vx) * k;
      p.vy += (tvy - p.vy) * k;
      if (!fwd && !strafe && p.onGround) {
        var f = clamp(G.FRICTION * dt, 0, 1);
        p.vx -= p.vx * f; p.vy -= p.vy * f;
      }
    }
    if (p.hopT > 0) p.hopT -= dt;

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
  }

  function step(g, p, dt, input) {
    tickMatch(g, dt);
    stepPlayer(g, p, dt, input);
  }

  return {
    newGame: newGame,
    step: step,
    stepPlayer: stepPlayer,
    tickMatch: tickMatch,
    ageEffects: ageEffects,
    castRay: castRay,
    castRay3: castRay3,
    startReload: startReload,
    tryFire: tryFire,
    addTracer: addTracer,
    addHitMark: addHitMark,
    rayHitPlayer: rayHitPlayer,
    hitPlayer: hitPlayer,
    respawnPlayer: respawnPlayer
  };
})();
