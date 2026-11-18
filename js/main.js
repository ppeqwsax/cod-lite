/* cod-lite · 装配与主循环 */
(function () {
  var canvas = document.getElementById('screen');
  var menuEl = document.getElementById('menu');
  var pauseEl = document.getElementById('pause');
  var startBtn = document.getElementById('startBtn');
  var resumeBtn = document.getElementById('resumeBtn');

  var game = null;
  var player = null;
  var state = 'menu';           // menu | play | pause
  var gunImg = { rifle: null, pistol: null };
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
    state = 'play';
    show(menuEl, false);
    show(pauseEl, false);
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
    var x = G.W - gw + 34 + bobX + p.recoil * -6;
    var y = G.H - gh + 10 + bobY + p.recoil * 10;
    var rot = p.recoil * -0.03;

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
      var mx = Math.min(x + gw * 0.93, G.W - 8);
      var my = y + gh * 0.3;
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

  /* ---------- 命中火花 ---------- */
  function drawEffects(ctx) {
    for (var i = 0; i < game.effects.length; i++) {
      var e = game.effects[i];
      var s = Render.project(e.x, e.y);
      if (!s) continue;
      var k = 1 - e.t / e.life;
      ctx.globalAlpha = k * 0.9;
      ctx.fillStyle = '#ffd27a';
      var sz = 1 + k * 2;
      ctx.fillRect(s.x - sz, s.y - sz, sz * 2, sz * 2);
      ctx.globalAlpha = k * 0.5;
      ctx.fillStyle = '#fff6d8';
      ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 主循环 ---------- */
  function frame(now) {
    requestAnimationFrame(frame);
    if (!last) last = now;
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (state === 'play' && player) {
      var input = Input.read();
      if (input.pick === 0) player.weapon = 'rifle';
      else if (input.pick === 1) player.weapon = 'pistol';
      Sim.step(game, player, dt, input);
    } else {
      Input.read();
    }

    if (player) {
      Render.drawWorld(player);
      drawEffects(canvas.getContext('2d'));
      if (state === 'play') {
        drawGun(canvas.getContext('2d'), player);
        Hud.drawCrosshair(canvas.getContext('2d'), player, game);
      }
      Hud.update(player, game, dt);
    }
  }

  requestAnimationFrame(frame);
})();
