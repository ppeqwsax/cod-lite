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

  /* 准星：随移动/后坐力扩张，命中时闪红 */
  function drawCrosshair(ctx, p, g) {
    var cx = G.W / 2, cy = G.H / 2;
    var spread = 4 + p.moving * 5 + p.recoil * 7 + (p.reloadT > 0 ? 6 : 0);
    var len = 4;
    var hit = g.lastShot && g.lastShot.hit && (g.time - g.lastShot.t) < 0.09;
    var col = hit ? 'rgba(255,90,80,0.95)' : 'rgba(210,255,225,0.85)';
    ctx.strokeStyle = col;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - spread - len, cy + 0.5); ctx.lineTo(cx - spread, cy + 0.5);
    ctx.moveTo(cx + spread, cy + 0.5); ctx.lineTo(cx + spread + len, cy + 0.5);
    ctx.moveTo(cx + 0.5, cy - spread - len); ctx.lineTo(cx + 0.5, cy - spread);
    ctx.moveTo(cx + 0.5, cy + spread); ctx.lineTo(cx + 0.5, cy + spread + len);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
  }

  return { init: init, update: update, drawCrosshair: drawCrosshair };
})();
