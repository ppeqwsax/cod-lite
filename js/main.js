/* cod-lite · 装配与主循环 */
(function () {
  var canvas = document.getElementById('screen');
  var menuEl = document.getElementById('menu');
  var pauseEl = document.getElementById('pause');
  var startBtn = document.getElementById('startBtn');
  var resumeBtn = document.getElementById('resumeBtn');
  var againBtn = document.getElementById('againBtn');
  var deadEl = document.getElementById('dead');
  var deadTip = document.getElementById('deadTip');
  var resultEl = document.getElementById('result');
  var resultTitle = document.getElementById('resultTitle');
  var resultSub = document.getElementById('resultSub');

  var game = null;
  var player = null;
  var state = 'menu';           // menu | play | pause
  var gunImg = { rifle: null, pistol: null };
  var lastMuzzle = { x: 0, y: 0 };
  var difficulty = 'normal';
  var last = 0;

  Render.init(canvas);
  Hud.init();
  Input.bind(canvas, onLockChange);

  function loadGuns() {
    ['rifle', 'pistol'].forEach(function (k) {
      var im = new Image();
      im.onload = function () { gunImg[k] = im; };
      im.src = 'assets/tex/' + k + '.png';
    });
  }

  Render.load({
    red: 'assets/tex/container_red.png',
    blue: 'assets/tex/container_blue.png',
    green: 'assets/tex/container_green.png',
    crate: 'assets/tex/crate.png',
    metal: 'assets/tex/metal.png',
    door: 'assets/tex/container_door.png',
    fence: 'assets/tex/fence.png',
    floor: 'assets/tex/floor.png',
    ceil: 'assets/tex/ceiling.png'
  }, function () {
    loadGuns();
    boot();
  });

  function boot() {
    game = Sim.newGame();
    player = game.players[0];
    Render.drawWorld(player);
    setStatus('菜单');
    window.COD = {
      get game() { return game; },
      get player() { return player; },
      get state() { return state; },
      get net() { return net; },
      get remoteIn() { return remoteIn; },
      get inCount() { return inCount; },
      start: startGame
    };
  }

  function setStatus(s) {
    var el = document.getElementById('status');
    if (el) el.textContent = s;
  }

  function show(el, on) { if (el) el.classList.toggle('hidden', !on); }

  function startGame() {
    if (!player) return;
    if (online) { endOnline(); }
    if (game.players.length > 1) game.players.length = 1;
    game.remotes = null;
    player = game.players[0];
    player.respawn(MapData.spawns[0]);
    game.time = 0;
    game.effects.length = 0;
    game.decals.length = 0;
    game.tracers.length = 0;
    game.match = { target: 25, limit: 300, left: 300, over: false, player: 0, bot: 0 };
    game.bots = [];
    var spawnOrder = [1, 2, 3, 0];
    for (var bi2 = 0; bi2 < G.BOT_COUNT; bi2++) {
      game.bots.push(Bot.create(MapData.spawns[spawnOrder[bi2 % spawnOrder.length]], difficulty));
    }
    radarNext = 0;
    state = 'play';
    Sfx.unlock();
    show(menuEl, false);
    show(pauseEl, false);
    show(resultEl, false);
    show(deadEl, false);
    setStatus('游戏中');
    Input.lock();
  }

  function onLockChange(locked) {
    if (locked) {
      if (state === 'pause') { state = 'play'; show(pauseEl, false); setStatus('游戏中'); }
      return;
    }
    if (state === 'play') {
      if (online) { setStatus('点击画面继续'); return; }   /* 联机不暂停，避免和对手不同步 */
      state = 'pause';
      show(pauseEl, true);
      setStatus('已暂停');
    }
  }

  startBtn.addEventListener('click', function () {
    if (onlineMode) {
      var code = (roomInput && roomInput.value || '').toUpperCase().trim();
      if (code) joinRoom(code); else createRoom();
      return;
    }
    startGame();
  });
  againBtn.addEventListener('click', function () {
    if (online) { show(resultEl, false); state = 'play'; game.match.over = false; game.match.player = 0; game.match.bot = 0; game.match.left = 300; overSent = false; game.players[0].respawn(MapData.spawns[0]); game.players[1].respawn(MapData.spawns[1]); Input.lock(); return; }
    startGame();
  });

  var diffBtns = document.querySelectorAll('.chip[data-diff]');
  for (var di = 0; di < diffBtns.length; di++) {
    diffBtns[di].addEventListener('click', function () {
      difficulty = this.getAttribute('data-diff');
      for (var k = 0; k < diffBtns.length; k++) diffBtns[k].classList.toggle('on', diffBtns[k] === this);
    });
  }

  /* ---------- 模式 / 房间 ---------- */
  var onlineMode = false;
  var modeSolo = document.getElementById('modeSolo');
  var modeOnline = document.getElementById('modeOnline');
  var onlineBox = document.getElementById('onlineBox');
  var roomInput = document.getElementById('roomInput');
  var createBtn = document.getElementById('createBtn');
  var joinBtn = document.getElementById('joinBtn');
  var soloDiff = document.querySelectorAll('.solo-only');

  function setMode(online_) {
    onlineMode = online_;
    if (modeSolo) modeSolo.classList.toggle('on', !online_);
    if (modeOnline) modeOnline.classList.toggle('on', online_);
    if (onlineBox) onlineBox.classList.toggle('hidden', !online_);
    for (var i = 0; i < soloDiff.length; i++) soloDiff[i].classList.toggle('hidden', online_);
    if (startBtn) startBtn.textContent = online_ ? '开始联机' : '进入训练场';
    if (online_ && !onlineTest) netSet('输入房间码加入，或直接创建房间');
  }

  var onlineTest = /[?&]online=1/.test(location.search);
  if (modeSolo) modeSolo.addEventListener('click', function () { if (!online) setMode(false); });
  if (modeOnline) modeOnline.addEventListener('click', function () { if (!online) setMode(true); });
  if (createBtn) createBtn.addEventListener('click', function () { if (!online) createRoom(); });
  if (joinBtn) joinBtn.addEventListener('click', function () {
    if (online) return;
    var code = (roomInput && roomInput.value || '').toUpperCase().trim();
    if (code) joinRoom(code); else netSet('先输入 5 位房间码');
  });
  if (roomInput) roomInput.addEventListener('input', function () {
    this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  });
  if (onlineTest) setMode(true);
  resumeBtn.addEventListener('click', function () {
    show(pauseEl, false);
    Input.lock();
  });

  /* ---------- 枪械绘制 ---------- */
  function drawGun(ctx, p) {
    var img = gunImg[p.weapon];
    if (!img) return;
    var isRifle = p.weapon === 'rifle';
    var scale = isRifle ? 1.55 : 1.7;
    var gw = img.width * scale, gh = img.height * scale;
    var bobX = Math.sin(p.bob) * 3 * p.moving;
    var bobY = Math.abs(Math.cos(p.bob)) * 3 * p.moving;
    var x = G.W - gw + 26 + bobX + p.recoil * -6;
    var y = G.H - gh + 2 + bobY + p.recoil * 10;
    /* 枪口朝向屏幕中心（准星）——不让枪管横着指右边 */
    var rot = -0.15 + p.recoil * -0.03;

    /* 开镜：枪体向画面中央抬起、摆正，抖动也随之减小 */
    var ads = p.ads || 0;
    if (ads > 0) {
      var adsX = G.W * 0.5 - gw * 0.5, adsY = G.H * 0.50;
      x = x + (adsX - x) * ads;
      y = y + (adsY - y) * ads;
      rot = rot * (1 - ads);
      bobX *= (1 - ads * 0.75);
    }

    ctx.save();
    if (p.reloadT > 0) {
      var def = p.def();
      var k = 1 - p.reloadT / def.reload;
      y += Math.sin(k * Math.PI) * 34;
      rot += Math.sin(k * Math.PI) * 0.5;
    }
    ctx.translate(G.W / 2, G.H);
    ctx.rotate(rot);
    ctx.translate(-G.W / 2, -G.H);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, x | 0, y | 0, gw | 0, gh | 0);

    if (p.muzzle > 0) {
      /* 枪口位置要跟着枪身旋转走，否则火焰会飘在画面外 */
      var lx = x + gw * 0.93 - G.W / 2, ly = y + gh * 0.33 - G.H;
      var cs = Math.cos(rot), sn = Math.sin(rot);
      var mx = G.W / 2 + lx * cs - ly * sn;
      var my = G.H + lx * sn + ly * cs;
      lastMuzzle.x = mx; lastMuzzle.y = my;
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillStyle = 'rgba(255,226,140,0.95)';
      ctx.beginPath();
      for (var i = 0; i < 8; i++) {
        var a = (i / 8) * Math.PI * 2;
        var r = i % 2 ? 5 : 13;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------- 弹着点 / 弹孔 / 弹道 ---------- */
  function drawShots(ctx) {
    var i, s;

    /* 弹孔（贴在墙上，7 秒后消失） */
    for (i = 0; i < game.decals.length; i++) {
      var d = game.decals[i];
      s = Render.project(d.x, d.y, d.z);
      if (!s) continue;
      var a = d.t > d.life - 1 ? (d.life - d.t) : 1;
      ctx.globalAlpha = 0.95 * a;
      var sz = clamp(14 / s.depth, 2, 4.5);
      ctx.fillStyle = '#15181d';
      ctx.fillRect(s.x - sz / 2, s.y - sz / 2, sz, sz);
      ctx.globalAlpha = 0.5 * a;
      ctx.fillStyle = '#cfd6de';
      ctx.fillRect(s.x - sz / 2 - 1, s.y - sz / 2 - 1, 1, sz + 2);
      ctx.fillRect(s.x + sz / 2, s.y - sz / 2 - 1, 1, sz + 2);
    }

    /* 火花 */
    for (i = 0; i < game.effects.length; i++) {
      var e = game.effects[i];
      s = Render.project(e.x, e.y, e.z);
      if (!s) continue;
      var k = 1 - e.t / e.life;
      ctx.globalAlpha = k * 0.95;
      ctx.fillStyle = '#ffd27a';
      var ss = 2 + k * 4;
      ctx.fillRect(s.x - ss, s.y - ss, ss * 2, ss * 2);
      ctx.globalAlpha = k * 0.8;
      ctx.fillStyle = '#fff6d8';
      ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    }

    /* 弹道线：从枪口（屏幕右下的枪管位置）拉到弹着点 */
    for (i = 0; i < game.tracers.length; i++) {
      var tr = game.tracers[i];
      s = Render.project(tr.x1, tr.y1, tr.z1);
      if (!s) continue;
      var kk = 1 - tr.t / tr.life;
      ctx.globalAlpha = kk * 0.75;
      ctx.strokeStyle = '#ffe6a8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lastMuzzle.x || G.W * 0.8, lastMuzzle.y || G.H * 0.86);
      ctx.lineTo(s.x, s.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 敌人（billboard 贴片） ---------- */
  function drawBots(ctx) {
    var p = player;
    var actors = game.bots ? game.bots.slice() : [];
    if (game.remotes) actors = actors.concat(game.remotes);
    for (var i = 0; i < actors.length; i++) {
      var b = actors[i];
      if (!b.alive) continue;
      var dx = b.x - p.x, dy = b.y - p.y;
      var d = Math.hypot(dx, dy);
      if (d > 32) continue;
      var ang = Math.atan2(dy, dx);
      var wall = Sim.castRay(p.x, p.y, ang, d);
      if (wall.hit && wall.dist < d - 0.35) continue;

      var feet = Render.project(b.x, b.y, 0);
      var head = Render.project(b.x, b.y, 1.78);
      if (!feet || !head) continue;
      var h = feet.y - head.y;
      if (h < 3) continue;
      var w = h * 0.36, cx = feet.x;
      var flash = b.hurtAt && game.time - b.hurtAt < 0.08;
      var walk = b.walk || 0;
      var legSwing = Math.sin(walk * 9) * h * 0.035;

      /* 脚下影子，让他看起来站在地上 */
      ctx.fillStyle = 'rgba(0,0,0,0.32)';
      ctx.beginPath();
      ctx.ellipse(cx, feet.y, w * 0.42, Math.max(1.6, h * 0.028), 0, 0, Math.PI * 2);
      ctx.fill();

      /* 腿（带走路摆动） */
      ctx.fillStyle = '#2a2f38';
      ctx.fillRect(cx - w * 0.30, feet.y - h * 0.46 + legSwing, w * 0.24, h * 0.46);
      ctx.fillRect(cx + w * 0.06, feet.y - h * 0.46 - legSwing, w * 0.24, h * 0.46);
      /* 靴子 */
      ctx.fillStyle = '#171a20';
      ctx.fillRect(cx - w * 0.32, feet.y - h * 0.06 + legSwing, w * 0.28, h * 0.06);
      ctx.fillRect(cx + w * 0.04, feet.y - h * 0.06 - legSwing, w * 0.28, h * 0.06);

      /* 躯干（战术背心 + 肩带） */
      ctx.fillStyle = flash ? '#ffffff' : '#b8433a';
      ctx.fillRect(cx - w * 0.40, feet.y - h * 0.86, w * 0.80, h * 0.42);
      ctx.fillStyle = flash ? '#ffffff' : '#7f2f28';
      ctx.fillRect(cx - w * 0.40, feet.y - h * 0.86, w * 0.80, h * 0.06);
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(cx - w * 0.40, feet.y - h * 0.66, w * 0.80, h * 0.035);
      ctx.fillRect(cx - w * 0.06, feet.y - h * 0.84, w * 0.12, h * 0.34);

      /* 手臂（持枪） */
      ctx.fillStyle = flash ? '#ffffff' : '#a13b33';
      ctx.fillRect(cx + w * 0.16, feet.y - h * 0.79, w * 0.34, h * 0.09);
      ctx.fillRect(cx - w * 0.30, feet.y - h * 0.72, w * 0.34, h * 0.09);

      /* 头 + 头盔 */
      ctx.fillStyle = flash ? '#ffffff' : '#e2bd93';
      ctx.fillRect(cx - w * 0.17, feet.y - h * 0.99, w * 0.34, h * 0.14);
      ctx.fillStyle = flash ? '#ffffff' : '#3c4a3a';
      ctx.fillRect(cx - w * 0.20, feet.y - h * 1.02, w * 0.40, h * 0.06);
      ctx.fillStyle = '#2b342b';
      ctx.fillRect(cx - w * 0.17, feet.y - h * 0.94, w * 0.34, h * 0.025);

      /* 枪 */
      ctx.fillStyle = '#1d2127';
      ctx.fillRect(cx + w * 0.02, feet.y - h * 0.74, w * 0.86, Math.max(1, h * 0.05));
      ctx.fillStyle = '#2a2f36';
      ctx.fillRect(cx + w * 0.10, feet.y - h * 0.68, w * 0.22, Math.max(1, h * 0.06));

      /* 枪口火焰 */
      if (b.muzzle > 0) {
        ctx.fillStyle = '#ffe08a';
        var fr = Math.max(2, h * 0.07);
        ctx.beginPath();
        ctx.arc(cx + w * 0.9, feet.y - h * 0.715, fr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,230,160,0.35)';
        ctx.beginPath();
        ctx.arc(cx + w * 0.9, feet.y - h * 0.715, fr * 2, 0, Math.PI * 2);
        ctx.fill();
      }

      /* 血条 */
      if (b.hp < G.MAX_HP) {
        var bw = w * 0.9;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(cx - bw / 2, head.y - 7, bw, 3);
        ctx.fillStyle = b.hp / G.MAX_HP > 0.5 ? '#7ce08a' : (b.hp / G.MAX_HP > 0.25 ? '#ffc451' : '#ff5f5f');
        ctx.fillRect(cx - bw / 2, head.y - 7, bw * Math.max(0, b.hp / G.MAX_HP), 3);
      }
    }
  }

  /* ---------- 小地图（雷达）：每 3 秒扫一次，红点表示敌人大概位置 ---------- */
  var radarBg = null, radarNext = 0, radarPulse = 0, bumpedKillAt = -1;

  function buildRadarBg() {
    var c = document.createElement('canvas');
    c.width = G.MAP_W; c.height = G.MAP_H;
    var g2 = c.getContext('2d');
    for (var y = 0; y < G.MAP_H; y++) {
      for (var x = 0; x < G.MAP_W; x++) {
        if (!MapData.solid(x, y)) continue;
        g2.fillStyle = x === 0 || y === 0 || x === G.MAP_W - 1 || y === G.MAP_H - 1
          ? 'rgba(150,170,190,0.75)' : 'rgba(120,142,168,0.85)';
        g2.fillRect(x, y, 1, 1);
      }
    }
    radarBg = c;
  }

  function drawRadar(ctx) {
    if (!radarBg) buildRadarBg();
    var S = 76, pad = 6;
    var ox = pad, oy = G.H - S - pad;
    var cx = ox + S / 2, cy = oy + S / 2;
    var scale = 3.2;              // 每米像素 → 半径 38px ≈ 9 米

    ctx.save();
    ctx.beginPath();
    ctx.rect(ox, oy, S, S);
    ctx.clip();
    ctx.fillStyle = 'rgba(8,12,16,0.78)';
    ctx.fillRect(ox, oy, S, S);

    /* 地图随视角旋转：前进方向永远朝上 */
    ctx.translate(cx, cy);
    ctx.rotate(-player.angle - Math.PI / 2);
    var sc = scale * G.TILE;
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 0.85;
    ctx.drawImage(radarBg, -player.x * scale, -player.y * scale, G.MAP_W * sc, G.MAP_H * sc);
    ctx.globalAlpha = 1;

    /* 扫描线 */
    var sweep = (game.time / G.RADAR_PULSE) * Math.PI * 2;
    ctx.strokeStyle = 'rgba(130,220,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(sweep) * S, Math.sin(sweep) * S);
    ctx.stroke();

    /* 敌人红点：扫到后定住位置不消失，直到下次扫描更新 */
    var foes = game.remotes || [];
    for (var fi = 0; fi < foes.length; fi++) {
      var fp = foes[fi];
      if (!fp.alive) continue;
      var fdx = fp.x - player.x, fdy = fp.y - player.y;
      if (Math.hypot(fdx, fdy) > 14) continue;
      var frot = -player.angle - Math.PI / 2;
      var frx = fdx * Math.cos(frot) - fdy * Math.sin(frot);
      var fry = fdx * Math.sin(frot) + fdy * Math.cos(frot);
      if (Math.hypot(frx, fry) > S * 0.5) continue;
      var fpx = frx * scale, fpy = fry * scale;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#ff2d2d';
      ctx.beginPath(); ctx.arc(fpx, fpy, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath(); ctx.arc(fpx, fpy, 3.2, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,120,0.85)';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(fpx, fpy, 3.2, 0, Math.PI * 2); ctx.stroke();
    }

    for (var i = 0; i < game.bots.length; i++) {
      var b = game.bots[i];
      if (!b.alive || !b.lastSeen) continue;
      /* 大概位置：取整到 1.5 米 */
      var rx = Math.round(b.lastSeen.x / 1.5) * 1.5, ry = Math.round(b.lastSeen.y / 1.5) * 1.5;
      var dx = rx - player.x, dy = ry - player.y;
      var rot2 = -player.angle - Math.PI / 2;
      var rx2 = dx * Math.cos(rot2) - dy * Math.sin(rot2);
      var ry2 = dx * Math.sin(rot2) + dy * Math.cos(rot2);
      if (Math.hypot(rx2, ry2) > S * 0.5) continue;
      var px2 = rx2 * scale, py2 = ry2 * scale;
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#ff2d2d';
      ctx.beginPath();
      ctx.arc(px2, py2, 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ff3b3b';
      ctx.beginPath();
      ctx.arc(px2, py2, 2.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,120,120,0.85)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(px2, py2, 2.9, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    /* 玩家箭头（永远在正中） */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#8be08a';
    ctx.beginPath();
    ctx.moveTo(0, -4.5);
    ctx.lineTo(3.2, 4);
    ctx.lineTo(0, 2.2);
    ctx.lineTo(-3.2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    /* 距离环 */
    ctx.strokeStyle = 'rgba(140,170,200,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, S * 0.3, 0, Math.PI * 2);
    ctx.stroke();

    /* 边框 */
    ctx.strokeStyle = 'rgba(160,180,205,0.45)';
    ctx.strokeRect(ox + 0.5, oy + 0.5, S - 1, S - 1);
  }

  function updateRadar(dt) {
    radarNext -= dt;
    if (radarNext > 0) return;
    radarNext = G.RADAR_PULSE;
    radarPulse = game.time;
    for (var i = 0; i < game.bots.length; i++) {
      var b = game.bots[i];
      /* 扫到就记住这个位置，之后一直定在那儿，直到下次扫到新的位置 */
      if (b.alive) b.lastSeen = { x: b.x, y: b.y, t: game.time };
    }
  }

  /* ---------- 比分 / 计时 / 结束 ---------- */
  function updateMatchUI() {
    var m = game.match;
    var sec = Math.max(0, Math.ceil(m.left));
    var mm = (sec / 60) | 0, ss = sec % 60;
    var tEl = document.getElementById('timer');
    if (tEl) tEl.textContent = mm + ':' + (ss < 10 ? '0' : '') + ss;
    var sp = document.getElementById('scoreP'), sb = document.getElementById('scoreB');
    var mine = online && mySide === 1 ? m.bot : m.player;
    var theirs = online && mySide === 1 ? m.player : m.bot;
    if (sp) sp.textContent = mine;
    if (sb) sb.textContent = theirs;

    if (!player.alive && !m.over) {
      show(deadEl, true);
      if (deadTip) deadTip.textContent = Math.max(0, Math.ceil(player.respawnT)) + ' 秒后重生';
    } else {
      show(deadEl, false);
    }

    if (m.over && state === 'play') {
      state = 'over';
      Input.unlock();
      var win = mine > theirs;
      var draw = mine === theirs;
      resultTitle.textContent = draw ? '平 局' : (win ? '胜 利' : '失 败');
      resultTitle.style.color = draw ? '#ffc451' : (win ? '#8be08a' : '#ff6b5e');
      resultSub.textContent = '比分 ' + mine + ' : ' + theirs + (m.left <= 0 ? '（时间到）' : '');
      show(resultEl, true);
      setStatus('对局结束');
    }
  }
  /* ---------- 击杀反馈：尸体标记 + 击杀横幅 + 边缘闪光 ---------- */
  function drawKillFx(ctx) {
    var t = game.time;

    /* 敌人倒下的位置留一个叉号，1.6 秒淡出 */
    if (game.deathMarks) {
      for (var i = 0; i < game.deathMarks.length; i++) {
        var dm = game.deathMarks[i];
        var life = t - dm.t;
        if (life < 0 || life > 1.6) continue;
        var pr = Render.project(dm.x, dm.y, (dm.z || 0) + 1.1);
        if (!pr) continue;
        var a = 1 - life / 1.6;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.font = 'bold 13px "Segoe UI", system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText('✕', pr.x + 0.7, pr.y + 0.7);
        ctx.fillStyle = dm.head ? '#ffd34d' : '#ff5a4d';
        ctx.fillText('✕', pr.x, pr.y);
        ctx.restore();
      }
    }

    /* 击杀横幅 */
    var lk = game.lastKill;
    if (!lk) return;
    var dt = t - lk.t;

    if (dt >= 0 && dt < 1.5) {
      var pop = Math.min(1, dt / 0.09);
      var out = dt > 1.15 ? 1 - (dt - 1.15) / 0.35 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, out);
      ctx.translate(G.W / 2, 60 - (1 - pop) * 7);
      var sc = 0.82 + 0.18 * pop;
      ctx.scale(sc, sc);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      var txt = lk.headshot ? '爆 头 击 杀' : '击 杀';
      ctx.font = 'bold 17px "Segoe UI", system-ui';
      ctx.fillStyle = 'rgba(0,0,0,0.62)';
      ctx.fillText(txt, 1, 1);
      ctx.fillStyle = lk.headshot ? '#ffd34d' : '#ff4a3d';
      ctx.fillText(txt, 0, 0);

      if (lk.streak >= 2) {
        var names = ['', '', '双 杀', '三 杀', '四 杀', '五 杀', '大 杀 特 杀'];
        var ns = names[Math.min(lk.streak, 6)];
        ctx.font = 'bold 9px "Segoe UI", system-ui';
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillText(ns, 15, 16);
        ctx.fillStyle = '#ffd34d';
        ctx.fillText(ns, 14, 15);
      }
      ctx.restore();
    }

    /* 击杀瞬间四周泛红 */
    if (dt >= 0 && dt < 0.3) {
      var a2 = 0.22 * (1 - dt / 0.3);
      var grd = ctx.createRadialGradient(G.W / 2, G.H / 2, G.H * 0.42, G.W / 2, G.H / 2, G.H * 0.86);
      grd.addColorStop(0, 'rgba(255,60,40,0)');
      grd.addColorStop(1, 'rgba(255,50,30,' + a2.toFixed(3) + ')');
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, G.W, G.H);
    }
  }

  /* ============================================================
     联机 1v1
     房主：跑完整模拟（两名玩家），20Hz 发快照
     客机：本地预测自己，30Hz 发输入，收到快照后校正/插值
     ============================================================ */
  var net = null, online = false, mySide = 0, remoteIn = {}, overSent = false, inCount = 0;
  var snapAcc = 0, inAcc = 0, pingAcc = 0;

  function netSet(txt) {
    var el = document.getElementById('netStatus');
    if (el) el.textContent = txt;
  }

  function packInput(inp) {
    return {
      w: inp.keyW ? 1 : 0, s: inp.keyS ? 1 : 0, a: inp.keyA ? 1 : 0, d: inp.keyD ? 1 : 0,
      sh: inp.shift ? 1 : 0, jp: inp.jump ? 1 : 0, cr: inp.crouch ? 1 : 0,
      f: inp.fire ? 1 : 0, r: inp.reload ? 1 : 0, ai: inp.aim ? 1 : 0,
      pk: inp.pick || 0, mx: inp.mouseDX || 0, my: inp.mouseDY || 0
    };
  }

  function unpackInput(o) {
    o = o || {};
    return {
      keyW: !!o.w, keyS: !!o.s, keyA: !!o.a, keyD: !!o.d,
      shift: !!o.sh, jump: !!o.jp, crouch: !!o.cr,
      fire: !!o.f, reload: !!o.r, aim: !!o.ai,
      pick: o.pk | 0, mouseDX: o.mx || 0, mouseDY: o.my || 0
    };
  }

  function packPlayer(p) {
    return {
      x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
      a: +p.angle.toFixed(3), p: +p.pitch.toFixed(3),
      hp: Math.round(p.hp), al: p.alive ? 1 : 0, ads: +(p.ads || 0).toFixed(2),
      wp: p.weapon === 'pistol' ? 1 : 0, mz: p.muzzle > 0 ? 1 : 0
    };
  }

  function packSnapshot() {
    var m = game.match;
    return {
      l: +m.left.toFixed(2), p: m.player, b: m.bot, o: m.over ? 1 : 0,
      ps: [packPlayer(game.players[0]), packPlayer(game.players[1])]
    };
  }

  function applySnapshot(d) {
    if (!d || !d.ps) return;
    var m = game.match;
    m.left = d.l; m.player = d.p; m.bot = d.b; m.over = !!d.o;

    for (var i = 0; i < 2; i++) {
      var s = d.ps[i], pl = game.players[i];
      if (!s || !pl) continue;
      if (i === mySide) {
        /* 自己：轻微校正，误差过大才硬同步 */
        pl.hp = s.hp;
        pl.alive = !!s.al;
        var err = Math.hypot(s.x - pl.x, s.y - pl.y);
        if (!s.al || err > 1.8) {
          pl.x = s.x; pl.y = s.y; pl.z = s.z; pl.vx = 0; pl.vy = 0;
        } else {
          pl.x += (s.x - pl.x) * 0.22;
          pl.y += (s.y - pl.y) * 0.22;
          pl.z += (s.z - pl.z) * 0.35;
        }
      } else {
        /* 对手：直接采用权威状态 */
        pl.x = s.x; pl.y = s.y; pl.z = s.z;
        pl.angle = s.a; pl.pitch = s.p;
        pl.hp = s.hp; pl.alive = !!s.al;
        pl.ads = s.ads;
        pl.weapon = s.wp ? 'pistol' : 'rifle';
        pl.muzzle = s.mz ? 0.05 : Math.max(0, (pl.muzzle || 0));
        pl.walk = (pl.walk || 0) + 0.4;
      }
    }
  }

  function startOnlineBattle(role) {
    mySide = role === 'host' ? 0 : 1;
    online = true;
    overSent = false;
    remoteIn = {};
    game = Sim.newGame();
    var p2 = new Player(MapData.spawns[1]);
    p2.side = 1;
    game.players.push(p2);
    game.players[0].side = 0;
    player = game.players[mySide];
    game.bots = [];
    game.remotes = [game.players[1 - mySide]];
    game.match = { target: 25, limit: 300, left: 300, over: false, player: 0, bot: 0 };
    radarNext = 0;
    bumpedKillAt = -1;
    state = 'play';
    Sfx.unlock();
    show(menuEl, false);
    show(pauseEl, false);
    show(resultEl, false);
    show(deadEl, false);
    setStatus(role === 'host' ? '房主 · 对局中' : '客机 · 对局中');
    Input.lock();
  }

  function createRoom() {
    if (net) { net.close(); net = null; }
    net = Net.host({
      peer: function () {
        netSet('对手已连接，开始！');
        mySide = 0;
        if (state === 'menu') startOnlineBattle('host');
      },
      start: function () { },
      link: function (l) {
        netSet(l === 'direct' ? '直连已建立' : (l === 'relay' ? '中转模式（延迟略高）' : '正在连接…'));
      },
      msg: function (m) {
        if (m.t === 'in') { remoteIn = m.d; inCount++; }
        else if (m.t === 'bye') { netSet('对手离开了'); endOnline(); }
      }
    });
    netSet('房间码 ' + net.room + ' · 等待对手…');
    var inp = document.getElementById('roomInput');
    if (inp) inp.value = net.room;
  }

  function joinRoom(code) {
    if (!code) { netSet('先输入房间码'); return; }
    if (net) { net.close(); net = null; }
    net = Net.join(code, {
      peer: function () { },
      start: function () {
        netSet('已连接，开始！');
        if (state === 'menu') startOnlineBattle('guest');
      },
      link: function (l) {
        netSet(l === 'direct' ? '直连已建立' : (l === 'relay' ? '中转模式（延迟略高）' : '正在连接 ' + code + '…'));
      },
      msg: function (m) {
        if (m.t === 'snap') applySnapshot(m.d);
        else if (m.t === 'bye') { netSet('对手离开了'); endOnline(); }
      }
    });
    netSet('正在加入 ' + code + '…');
  }

  function endOnline() {
    online = false;
    if (net) { net.close(); net = null; }
    state = 'menu';
    show(menuEl, true);
    show(resultEl, false);
    show(deadEl, false);
    Input.unlock();
    setStatus('菜单');
  }

  function onlineFrame(dt) {
    var inp = Input.read();
    if (inp.pick === 0 && player.weapon !== 'rifle') player.weapon = 'rifle';
    else if (inp.pick === 1 && player.weapon !== 'pistol') player.weapon = 'pistol';

    if (net && net.role === 'host') {
      Sim.tickMatch(game, dt);
      Sim.stepPlayer(game, game.players[0], dt, inp);
      Sim.stepPlayer(game, game.players[1], dt, unpackInput(remoteIn));
      snapAcc += dt;
      if (snapAcc >= 1 / 20) { snapAcc = 0; net._send({ t: 'snap', d: packSnapshot() }); }
      if (game.match.over && !overSent) { overSent = true; net._send({ t: 'over', d: { p: game.match.player, b: game.match.bot } }); }
    } else if (net && net.role === 'guest') {
      /* 自己先本地跑一遍，手感立刻有反馈 */
      Sim.stepPlayer(game, player, dt, inp);
      Sim.ageEffects(game, dt);
      inAcc += dt;
      if (inAcc >= 1 / 30) { inAcc = 0; net._send({ t: 'in', d: packInput(inp) }); }
    }

    pingAcc += dt;
    if (pingAcc >= 1) { pingAcc = 0; if (net) net.ping(); }

    var linkTxt = net ? (net.link === 'direct' ? '直连' : (net.link === 'relay' ? '中转' : '连接中')) : '';
    setStatus((mySide === 0 ? '房主' : '客机') + ' · ' + linkTxt + (net && net.rtt ? ' · ' + net.rtt + 'ms' : ''));
    updateRadar(dt);
    updateMatchUI();
  }

  function frame(now) {    requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (state === 'play' && player) {
      if (online) {
        onlineFrame(dt);
      } else {
        var input = Input.read();
        if (input.pick === 0) player.weapon = 'rifle';
        else if (input.pick === 1) player.weapon = 'pistol';
        var s0 = game.shots, bh0 = game.botHits || 0, k0 = game.match.player;
        var lk0 = game.lastKill ? game.lastKill.t : -1;
        var hp0 = player.hp, rl0 = player.reloadT;
        Sim.step(game, player, dt, input);
        for (var bi = 0; bi < game.bots.length; bi++) {
          if (!game.match.over) Bot.update(dt, game.bots[bi], game, player);
        }
        /* 音效 */
        if (game.shots > s0) Sfx.shot(player.weapon);
        if ((game.botHits || 0) > bh0) Sfx.hit();
        if (game.match.player > k0 || (game.lastKill && game.lastKill.t !== lk0)) {
          var spEl = document.getElementById('scoreP');
          if (spEl) { spEl.classList.remove('bump'); void spEl.offsetWidth; spEl.classList.add('bump'); }
        }
        if (player.hp < hp0 - 0.5) Sfx.hurt();
        if (player.reloadT > 0 && rl0 === 0) Sfx.reload();
        updateRadar(dt);
        updateMatchUI();
      }
    } else {
      Input.read();
    }

    if (player) {
      /* 任何地方发生击杀都触发一次反馈（音效 + 比分跳动） */
      if (game.lastKill && game.lastKill.t !== bumpedKillAt) {
        bumpedKillAt = game.lastKill.t;
        if (state === 'play') {
          Sfx.killConfirm(!!game.lastKill.headshot);
          var spEl2 = document.getElementById('scoreP');
          if (spEl2) { spEl2.classList.remove('bump'); void spEl2.offsetWidth; spEl2.classList.add('bump'); }
        }
      }
      Render.drawWorld(player);
      drawShots(canvas.getContext('2d'));
      drawBots(canvas.getContext('2d'));
      if (state === 'play') {
        drawGun(canvas.getContext('2d'), player);
        drawRadar(canvas.getContext('2d'));
        Hud.drawCrosshair(canvas.getContext('2d'), player, game);
        drawKillFx(canvas.getContext('2d'));
        /* 受伤红色边缘 + 开镜暗角 */
        var c2 = canvas.getContext('2d');
        var sinceHurt = game.time - player.hurtAt;
        if (sinceHurt < 0.5 && player.hurtAt) {
          c2.save();
          c2.globalAlpha = 0.45 * (1 - sinceHurt / 0.5);
          var grd = c2.createRadialGradient(G.W / 2, G.H / 2, G.H * 0.3, G.W / 2, G.H / 2, G.H * 0.75);
          grd.addColorStop(0, 'rgba(255,0,0,0)');
          grd.addColorStop(1, 'rgba(190,20,20,0.95)');
          c2.fillStyle = grd;
          c2.fillRect(0, 0, G.W, G.H);
          c2.restore();
        }
        if (player.ads > 0.5) {
          c2.save();
          c2.globalAlpha = (player.ads - 0.5) * 0.5;
          c2.fillStyle = '#000';
          c2.fillRect(0, 0, G.W, 10);
          c2.fillRect(0, G.H - 10, G.W, 10);
          c2.restore();
        }
      }
      Hud.update(player, game, dt);
    }
  }

  requestAnimationFrame(frame);
})();
