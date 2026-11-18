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

  // 四角的集装箱堆（每块都自动镜像到四个角）
  sym(2, 2, 6, 2, TEX.RED);
  sym(2, 6, 2, 4, TEX.BLUE);
  sym(6, 6, 3, 2, TEX.GREEN);
  sym(10, 2, 2, 5, TEX.BLUE);
  sym(10, 9, 4, 2, TEX.RED);
  sym(3, 11, 3, 2, TEX.GREEN);
  sym(7, 11, 2, 1, TEX.CRATE);
  sym(12, 6, 2, 2, TEX.DOOR);

  // 中央的箱堆
  rect(14, 14, 2, 2, TEX.CRATE);
  rect(16, 15, 2, 2, TEX.CRATE);
  rect(15, 17, 2, 1, TEX.GREEN);
  put(13, 15, TEX.CRATE); put(18, 14, TEX.CRATE);

  // 出生点：四角内侧的空地（格坐标 × TILE = 米），都朝场地中央
  function sp(tx, ty, a) { return { x: tx * G.TILE, y: ty * G.TILE, a: a }; }
  var spawns = [
    sp(15.5, 28.5, -Math.PI / 2),  // 下方中央，朝上
    sp(15.5, 2.5, Math.PI / 2),    // 上方中央，朝下
    sp(3.5, 29.5, -Math.PI / 2),   // 左下角
    sp(28.5, 29.5, -Math.PI / 2)   // 右下角
  ];

  function at(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= W || ty >= H) return TEX.METAL;
    return grid[ty * W + tx];
  }
  /* 每个格子的墙高（格）：围栏矮，集装箱/木箱高 */
  function h(tx, ty) {
    var v = at(tx, ty);
    if (v === TEX.NONE) return 0;
    if (v === TEX.FENCE) return 1.25;
    if (v === TEX.CRATE) return 1.7;
    return 2.4;
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

  return {
    W: W, H: H, grid: grid,
    spawns: spawns,
    at: at, h: h, solid: solid, solidAt: solidAt, blocked: blocked
  };
})();
