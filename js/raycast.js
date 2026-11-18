/* cod-lite · 软件射线渲染器（DDA + 地板/天花板投射，写 Uint32 像素缓冲） */
var Render = (function () {
  var canvas, ctx, img, buf;
  var W = G.W, H = G.H;
  var WALLH = 2;                 // 墙高（格）：2 格 = 2.5 米
  var LEVELS = 16;               // 距离明暗级数
  var tex = {};                  // id -> { w, h, mask, levels: [Uint32Array] }
  var ready = false;

  var skyTop = rgb(26, 28, 34), skyBot = rgb(46, 50, 58);

  function rgb(r, g, b) { return (255 << 24) | (b << 16) | (g << 8) | r; }

  /* ---------- 贴图加载 ---------- */
  function loadOne(url, cb) {
    var im = new Image();
    im.onload = function () {
      var c = document.createElement('canvas');
      c.width = im.width; c.height = im.height;
      var g = c.getContext('2d');
      g.drawImage(im, 0, 0);
      var d = g.getImageData(0, 0, im.width, im.height).data;
      var px = new Uint32Array(im.width * im.height);
      for (var i = 0; i < px.length; i++) {
        var o = i * 4;
        px[i] = (255 << 24) | (d[o + 2] << 16) | (d[o + 1] << 8) | d[o];
      }
      cb({ w: im.width, h: im.height, px: px });
    };
    im.onerror = function () { cb(null); };
    im.src = url;
  }

  /* 预生成明暗层级，避免每帧算颜色 */
  function makeLevels(t) {
    var levels = [];
    for (var l = 0; l < LEVELS; l++) {
      var k = 0.46 + 0.54 * Math.pow(l / (LEVELS - 1), 0.8);
      var arr = new Uint32Array(t.px.length);
      for (var i = 0; i < t.px.length; i++) {
        var c = t.px[i];
        var r = (c & 255) * k, g = ((c >> 8) & 255) * k, b = ((c >> 16) & 255) * k;
        arr[i] = (255 << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
      }
      levels.push(arr);
    }
    t.levels = levels;
    return t;
  }

  function load(list, done) {
    var keys = Object.keys(list);
    var left = keys.length;
    keys.forEach(function (k) {
      loadOne(list[k], function (t) {
        if (t) { t.mask = t.w - 1; tex[k] = makeLevels(t); }
        if (--left === 0) { ready = true; done && done(); }
      });
    });
  }

  /* ---------- 初始化 ---------- */
  function init(cv) {
    canvas = cv;
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    img = ctx.createImageData(W, H);
    buf = new Uint32Array(img.data.buffer);
  }

  /* ---------- 世界 → 屏幕 ---------- */
  var cam = { px: 0, py: 0, dirX: 0, dirY: 0, planeX: 0, planeY: 0, horizon: H / 2 };

  function setCamera(p) {
    var tx = p.x / G.TILE, ty = p.y / G.TILE;
    cam.px = tx; cam.py = ty;
    cam.dirX = Math.cos(p.angle); cam.dirY = Math.sin(p.angle);
    var fov = Math.tan(G.FOV / 2);
    cam.planeX = -cam.dirY * fov; cam.planeY = cam.dirX * fov;
    cam.horizon = H / 2 + (p.pitch || 0) * H;
  }

  function project(wx, wy, z) {
    var dx = wx / G.TILE - cam.px, dy = wy / G.TILE - cam.py;
    var invDet = 1 / (cam.planeX * cam.dirY - cam.dirX * cam.planeY);
    var tx = invDet * (cam.dirY * dx - cam.dirX * dy);
    var ty = invDet * (-cam.planeY * dx + cam.planeX * dy);
    if (ty <= 0.02) return null;
    var hz = (z === undefined ? G.EYE : z);
    return {
      x: (W / 2) * (1 + tx / ty),
      y: cam.horizon - (hz - G.EYE) * H / ty,
      depth: ty
    };
  }

  /* ---------- 主渲染 ---------- */
  function drawWorld(p) {
    setCamera(p);
    var horizon = cam.horizon | 0;
    var dirX = cam.dirX, dirY = cam.dirY, planeX = cam.planeX, planeY = cam.planeY;
    var px = cam.px, py = cam.py;

    /* 天空：地平线以上画渐变（露天货场），地面用贴图投射 */
    var floorTex = tex.floor;
    var skyTopC = [58, 78, 104], skyHorC = [150, 166, 186];
    for (var y = 0; y < H; y++) {
      var row = y * W;
      if (y < horizon) {
        var kk = clamp(y / Math.max(1, horizon), 0, 1);
        var col = rgb(
          (skyTopC[0] + (skyHorC[0] - skyTopC[0]) * kk) | 0,
          (skyTopC[1] + (skyHorC[1] - skyTopC[1]) * kk) | 0,
          (skyTopC[2] + (skyHorC[2] - skyTopC[2]) * kk) | 0
        );
        for (var xs = 0; xs < W; xs++) buf[row + xs] = col;
      } else if (floorTex) {
        var d2 = H / Math.max(1, y - horizon);
        var lvl2 = clamp((LEVELS - 1) - (d2 * 0.7) | 0, 1, LEVELS - 1) | 0;
        var arr2 = floorTex.levels[lvl2];
        var stepX2 = d2 * 2 * planeX / W, stepY2 = d2 * 2 * planeY / W;
        var fx2 = px + d2 * (dirX - planeX), fy2 = py + d2 * (dirY - planeY);
        for (var x2 = 0; x2 < W; x2++) {
          var tx2 = (fx2 * 64) & 63, ty2 = (fy2 * 64) & 63;
          buf[row + x2] = arr2[(ty2 << 6) + tx2];
          fx2 += stepX2; fy2 += stepY2;
        }
      } else {
        for (var x3 = 0; x3 < W; x3++) buf[row + x3] = skyBot;
      }
    }

    /* 墙体：逐列 DDA */
    for (var sx = 0; sx < W; sx++) {
      var cameraX = 2 * sx / W - 1;
      var rdx = dirX + planeX * cameraX;
      var rdy = dirY + planeY * cameraX;
      var mapX = px | 0, mapY = py | 0;
      var deltaX = Math.abs(1 / (rdx || 1e-9));
      var deltaY = Math.abs(1 / (rdy || 1e-9));
      var stepX, stepY, sideDistX, sideDistY;
      if (rdx < 0) { stepX = -1; sideDistX = (px - mapX) * deltaX; }
      else { stepX = 1; sideDistX = (mapX + 1 - px) * deltaX; }
      if (rdy < 0) { stepY = -1; sideDistY = (py - mapY) * deltaY; }
      else { stepY = 1; sideDistY = (mapY + 1 - py) * deltaY; }

      var hit = 0, side = 0, guard = 0;
      while (!hit && guard++ < 96) {
        if (sideDistX < sideDistY) { sideDistX += deltaX; mapX += stepX; side = 0; }
        else { sideDistY += deltaY; mapY += stepY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= G.MAP_W || mapY >= G.MAP_H) { hit = 1; break; }
        if (MapData.solid(mapX, mapY)) hit = 1;
      }
      var perp = side === 0 ? (sideDistX - deltaX) : (sideDistY - deltaY);
      if (perp < 0.02) perp = 0.02;

      /* 墙高按格子类型变化：围栏矮、集装箱高；脚踩地面，所以上下沿都跟着算 */
      var wh = MapData.h(mapX, mapY) || WALLH;
      var half = G.EYE * H / perp;                 // 眼睛高度到地面 / 到墙顶的像素量
      var lineH = wh * H / perp;
      var drawStart = horizon + half - lineH;      // 墙顶
      var y0 = Math.max(0, drawStart | 0);
      var y1 = Math.min(H - 1, (horizon + half) | 0);

      var t = tex[TEXNAME(MapData.at(mapX, mapY))];
      if (!t) continue;
      var lvl = (LEVELS - 1) - (perp * 0.85) | 0;
      if (side === 1) lvl -= 2;
      lvl = clamp(lvl, 1, LEVELS - 1);
      var arr3 = t.levels[lvl];

      var wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
      wallX -= Math.floor(wallX);
      var texX = ((wallX * t.w) | 0) & t.mask;
      var stepT = t.h / lineH;
      var texPos = (y0 - drawStart) * stepT;

      for (var yy = y0; yy <= y1; yy++) {
        var texY = ((texPos) | 0) & t.mask;
        texPos += stepT;
        buf[yy * W + sx] = arr3[(texY << 6) + texX];
      }
    }

    ctx.putImageData(img, 0, 0);
  }

  function TEXNAME(v) {
    switch (v) {
      case TEX.RED: return 'red';
      case TEX.BLUE: return 'blue';
      case TEX.GREEN: return 'green';
      case TEX.CRATE: return 'crate';
      case TEX.METAL: return 'metal';
      case TEX.DOOR: return 'door';
      default: return null;
    }
  }

  return {
    init: init,
    load: load,
    drawWorld: drawWorld,
    project: project,
    tex: tex,
    isReady: function () { return ready; },
    W: W, H: H
  };
})();
