/* cod-lite · 货场地图（40m × 40m，32×32 格，180° 旋转对称） */
var MapData = (function () {
  var W = G.MAP_W, H = G.MAP_H;
  var grid = new Uint8Array(W * H);

  function put(x, y, v) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    grid[y * W + x] = v;
  }
  function rect(x, y, w, h, v) {
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) put(x + i, y + j, v);
  }
  /* 一块箱体贴 4 个象限（180° 旋转对称） */
  function sym(x, y, w, h, v) {
    rect(x, y, w, h, v);
    rect(W - x - w, y, w, h, v);
    rect(x, H - y - h, w, h, v);
    rect(W - x - w, H - y - h, w, h, v);
  }

  // 外圈：铁丝网围栏（矮墙，上面能看见天空）
  rect(0, 0, W, 1, TEX.FENCE);
  rect(0, H - 1, W, 1, TEX.FENCE);
  rect(0, 0, 1, H, TEX.FENCE);
  rect(W - 1, 0, 1, H, TEX.FENCE);

  // 四角的集装箱（每块自动镜像到四角）—— 数量减半，留出更多开阔通道
  sym(2, 2, 5, 2, TEX.RED);
  sym(3, 7, 2, 3, TEX.BLUE);
  sym(9, 3, 2, 4, TEX.GREEN);
  sym(8, 10, 3, 1, TEX.CRATE);

  // 中央的一小块掩体
  rect(15, 15, 2, 2, TEX.CRATE);

  // 出生点：四角内侧的空地（格坐标 × TILE = 米），都朝场地中央
  function sp(tx, ty, a) { return { x: tx * G.TILE, y: ty * G.TILE, a: a }; }
  var spawns = [
    sp(15.5, 28.5, -Math.PI / 2),  // 下方中央，朝上
    sp(15.5, 2.5, Math.PI / 2),    // 上方中央，朝下
    sp(4.5, 26.5, -Math.PI / 2),   // 左下角空地
    sp(27.5, 26.5, -Math.PI / 2)   // 右下角空地
  ];

  /* 兜底：万一某个出生点被箱子占了，就往外找最近能站的地方 */
  function nearestFree(wx, wy) {
    if (!blocked(wx, wy, G.R)) return { x: wx, y: wy };
    for (var r = 1; r <= 12; r++) {
      for (var a = 0; a < 12; a++) {
        var ang = (a / 12) * Math.PI * 2;
        var nx = wx + Math.cos(ang) * r, ny = wy + Math.sin(ang) * r;
        if (!blocked(nx, ny, G.R)) return { x: nx, y: ny };
      }
    }
    return { x: wx, y: wy };
  }
  spawns.forEach(function (s) {
    var f = nearestFree(s.x, s.y);
    s.x = f.x; s.y = f.y;
  });

  function at(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return TEX.METAL;
    return grid[ty * W + tx];
  }
  /* 每个格子的墙高（格）：围栏矮，集装箱/木箱高 */
  function h(tx, ty) {
    var v = at(tx, ty);
    if (v === TEX.NONE) return 0;
    if (v === TEX.FENCE) return 1.25;
    if (v === TEX.CRATE) return 1.75;
    if (v === TEX.DOOR) return 2.6;
    return 3.15;
  }
  function solid(tx, ty) { return at(tx, ty) !== TEX.NONE; }
  function solidAt(wx, wy) { return solid(Math.floor(wx / G.TILE), Math.floor(wy / G.TILE)); }

  /* 圆 vs 格子的碰撞：分成 x/y 两轴处理，避免贴墙卡死 */
  function blocked(wx, wy, r) {
    var x0 = Math.floor((wx - r) / G.TILE), x1 = Math.floor((wx + r) / G.TILE);
    var y0 = Math.floor((wy - r) / G.TILE), y1 = Math.floor((wy + r) / G.TILE);
    for (var ty = y0; ty <= y1; ty++) {
      for (var tx = x0; tx <= x1; tx++) {
        if (!solid(tx, ty)) continue;
        var cx = clamp(wx, tx * G.TILE, (tx + 1) * G.TILE);
        var cy = clamp(wy, ty * G.TILE, (ty + 1) * G.TILE);
        if (dist2(wx, wy, cx, cy) < r * r) return true;
      }
    }
    return false;
  }

  /* 全图空地格中心（缓存），给复活点选择用 */
  var freeCache = null;
  function freeCells() {
    if (freeCache) return freeCache;
    var out = [];
    for (var ty = 1; ty < H - 1; ty++) {
      for (var tx = 1; tx < W - 1; tx++) {
        if (solid(tx, ty)) continue;
        var wx = (tx + 0.5) * G.TILE, wy = (ty + 0.5) * G.TILE;
        if (!blocked(wx, wy, G.R + 0.05)) out.push({ x: wx, y: wy });
      }
    }
    freeCache = out;
    return out;
  }

  return {
    W: W, H: H, grid: grid,
    spawns: spawns,
    at: at, h: h, solid: solid, solidAt: solidAt, blocked: blocked,
    freeCells: freeCells
  };
})();
