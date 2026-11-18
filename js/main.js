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
    player.respawn(MapData.spawns[0]);
    game.time = 0;
    game.effects.length = 0;
    game.decals.length = 0;
    game.tracers.length = 0;
    game.match = { target: 25, limit: 300, left: 300, over: false, player: 0, bot: 0 };
    game.bots = [Bot.create(MapData.spawns[1], difficulty)];
    state = 'play';
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
      state = 'pause';
      show(pauseEl, true);
      setStatus('已暂停');
    }
  }

  startBtn.addEventListener('click', startGame);
  againBtn.addEventListener('click', startGame);

  var diffBtns = document.querySelectorAll('.chip[data-diff]');
  for (var di = 0; di < diffBtns.length; di++) {
    diffBtns[di].addEventListener('click', function () {
      difficulty = this.getAttribute('data-diff');
      for (var k = 0; k < diffBtns.length; k++) diffBtns[k].classList.toggle('on', diffBtns[k] === this);
    });
  }
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
    for (var i = 0; i < game.bots.length; i++) {
      var b = game.bots[i];
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
      var w = h * 0.38, cx = feet.x;

      /* 腿 */
      ctx.fillStyle = '#242830';
      ctx.fillRect(cx - w * 0.34, feet.y - h * 0.46, w * 0.3, h * 0.46);
      ctx.fillRect(cx + w * 0.04, feet.y - h * 0.46, w * 0.3, h * 0.46);
      /* 躯干 */
      ctx.fillStyle = b.hurtAt && game.time - b.hurtAt < 0.08 ? '#ffffff' : '#c8483a';
      ctx.fillRect(cx - w * 0.42, feet.y - h * 0.84, w * 0.84, h * 0.4);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(cx - w * 0.42, feet.y - h * 0.6, w * 0.84, h * 0.05);
      /* 头 */
      ctx.fillStyle = '#e6c49b';
      ctx.fillRect(cx - w * 0.21, feet.y - h * 0.99, w * 0.42, h * 0.16);
      /* 枪 */
      ctx.fillStyle = '#20242a';
      ctx.fillRect(cx - w * 0.1, feet.y - h * 0.78, w * 0.95, Math.max(1, h * 0.055));
      /* 枪口火焰 */
      if (b.muzzle > 0) {
        ctx.fillStyle = '#ffe08a';
        var fr = Math.max(2, h * 0.07);
        ctx.beginPath();
        ctx.arc(cx + w * 0.85, feet.y - h * 0.76, fr, 0, Math.PI * 2);
        ctx.fill();
      }
      /* 血条 */
      if (b.hp < G.MAX_HP) {
        var bw = w * 0.9;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(cx - bw / 2, head.y - 6, bw, 3);
        ctx.fillStyle = '#7ce08a';
        ctx.fillRect(cx - bw / 2, head.y - 6, bw * (b.hp / G.MAX_HP), 3);
      }
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
    if (sp) sp.textContent = m.player;
    if (sb) sb.textContent = m.bot;

    if (!player.alive && !m.over) {
      show(deadEl, true);
      if (deadTip) deadTip.textContent = Math.max(0, Math.ceil(player.respawnT)) + ' 秒后重生';
    } else {
      show(deadEl, false);
    }

    if (m.over && state === 'play') {
      state = 'over';
      Input.unlock();
      var win = m.player > m.bot;
      resultTitle.textContent = win ? '胜 利' : '失 败';
      resultTitle.style.color = win ? '#8be08a' : '#ff6b5e';
      resultSub.textContent = '比分 ' + m.player + ' : ' + m.bot + (m.left <= 0 ? '（时间到）' : '');
      show(resultEl, true);
      setStatus('对局结束');
    }
  }
  function frame(now) {    requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (state === 'play' && player) {
      var input = Input.read();
      if (input.pick === 0) player.weapon = 'rifle';
      else if (input.pick === 1) player.weapon = 'pistol';
      Sim.step(game, player, dt, input);
      for (var bi = 0; bi < game.bots.length; bi++) {
        if (!game.match.over) Bot.update(dt, game.bots[bi], game, player);
      }
      updateMatchUI();
    } else {
      Input.read();
    }

    if (player) {
      Render.drawWorld(player);
      drawShots(canvas.getContext('2d'));
      drawBots(canvas.getContext('2d'));
      if (state === 'play') {
        drawGun(canvas.getContext('2d'), player);
        Hud.drawCrosshair(canvas.getContext('2d'), player, game);
      }
      Hud.update(player, game, dt);
    }
  }

  requestAnimationFrame(frame);
})();
