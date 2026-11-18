/* cod-lite · HUD 与准星 */
var Hud = (function () {
  var el = {};
  var fpsAcc = 0, fpsFrames = 0, fpsShown = 0;

  function init() {
    el.ammo = document.getElementById('ammo');
    el.ammoMax = document.getElementById('ammoMax');
    el.wpn = document.getElementById('wpnName');
    el.hpFill = document.getElementById('hpFill');
    el.hpNum = document.getElementById('hpNum');
    el.fps = document.getElementById('fps');
    el.hint = document.getElementById('hint');
  }

  function update(p, g, dt) {
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc >= 0.4) { fpsShown = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
    if (el.fps) el.fps.textContent = fpsShown + ' FPS';

    var def = p.def();
    if (el.ammo) el.ammo.textContent = p.ammo[p.weapon];
    if (el.ammoMax) el.ammoMax.textContent = '/ ' + p.reserve[p.weapon];
    if (el.wpn) el.wpn.textContent = def.name;
    var pct = clamp(p.hp / G.MAX_HP, 0, 1) * 100;
    if (el.hpFill) el.hpFill.style.width = pct + '%';
    if (el.hpNum) el.hpNum.textContent = Math.ceil(p.hp);
    if (el.hint) el.hint.style.opacity = p.reloadT > 0 ? 1 : 0;
  }

  /* 准星：黑描边保证任何背景都看得清；命中闪红打 X，击杀/爆头用更大的红 X + 扩散环 */
  function drawCrosshair(ctx, p, g) {
    var cx = G.W / 2, cy = G.H / 2;
    var spread = 4 + p.moving * 5 + p.recoil * 7 + (p.reloadT > 0 ? 6 : 0);
    var len = 5;
    var hit = g.lastShot && g.lastShot.hit && (g.time - g.lastShot.t) < 0.09;
    var hk = g.lastHit && (g.time - g.lastHit.t);
    var botHit = !!hk && hk < 0.12;
    var killed = !!(g.lastHit && g.lastHit.kill) && hk < 0.42;

    function ticks(color, w) {
      ctx.strokeStyle = color;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(cx - spread - len, cy + 0.5); ctx.lineTo(cx - spread, cy + 0.5);
      ctx.moveTo(cx + spread, cy + 0.5); ctx.lineTo(cx + spread + len, cy + 0.5);
      ctx.moveTo(cx + 0.5, cy - spread - len); ctx.lineTo(cx + 0.5, cy - spread);
      ctx.moveTo(cx + 0.5, cy + spread); ctx.lineTo(cx + 0.5, cy + spread + len);
      ctx.stroke();
    }

    var strong = killed || botHit;
    ticks('rgba(0,0,0,0.55)', 3);      // 外描边
    ticks(strong ? '#ff3b30' : '#eafff2', 1);
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
    ctx.fillStyle = strong ? '#ff3b30' : '#eafff2';
    ctx.fillRect(cx - 0.5, cy - 0.5, 1, 1);

    if (botHit || hit) {
      var killHit = killed && g.lastHit.kill;
      var r = killHit ? 9 : 5;
      ctx.strokeStyle = killHit ? 'rgba(255,40,40,0.98)' : 'rgba(255,90,80,0.95)';
      ctx.lineWidth = killHit ? 2 : 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - r - 2, cy - r - 2); ctx.lineTo(cx - r, cy - r);
      ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx + r + 2, cy - r - 2);
      ctx.moveTo(cx - r - 2, cy + r + 2); ctx.lineTo(cx - r, cy + r);
      ctx.moveTo(cx + r, cy + r); ctx.lineTo(cx + r + 2, cy + r + 2);
      ctx.stroke();
    }

    /* 击杀：外圈红环扩散 + 中心点闪一下 */
    if (killed) {
      var k = 1 - hk / 0.42;
      ctx.globalAlpha = k;
      ctx.strokeStyle = g.lastHit && g.lastHit.headshot ? '#ffd34d' : '#ff3b30';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(cx, cy, 10 + (1 - k) * 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  return { init: init, update: update, drawCrosshair: drawCrosshair };
})();
