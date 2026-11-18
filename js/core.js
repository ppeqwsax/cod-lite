/* cod-lite · 常量与工具 */
var G = {
  W: 480,            // 内部渲染宽度（像素）
  H: 270,            // 内部渲染高度
  TILE: 1.25,        // 一格 = 1.25 米
  MAP_W: 32,
  MAP_H: 32,
  FOV: 66 * Math.PI / 180,
  EYE: 0.5,          // 眼睛高度 = 墙高的一半（2.5D 相机）
  R: 0.24,           // 玩家碰撞半径（格）
  WALK: 3.6,         // 格/秒（= 4.5 m/s）
  SPRINT: 4.7,       // 格/秒（= 5.9 m/s）
  ACCEL: 16,
  FRICTION: 12,
  MOUSE: 0.0024,     // 每像素转角（弧度）
  PITCH_MAX: 0.28,   // 伪俯仰上限
  MAX_HP: 100,
  REGEN_DELAY: 5,
  REGEN_RATE: 20
};

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function normAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60), r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

/* 武器数值 */
var WEAPONS = {
  rifle: {
    id: 'rifle', name: 'M4A1', dmg: 26, rpm: 690, mag: 30, reserve: 150,
    auto: true, spread: 0.012, moveSpread: 0.02, recoil: 1.0, reload: 2.1,
    range: 70, sound: 'rifle'
  },
  pistol: {
    id: 'pistol', name: 'M9', dmg: 34, rpm: 430, mag: 12, reserve: 72,
    auto: false, spread: 0.008, moveSpread: 0.014, recoil: 1.5, reload: 1.6,
    range: 50, sound: 'pistol'
  }
};

/* 贴图 id（与 map.js 的格子值一致） */
var TEX = {
  NONE: 0, RED: 1, BLUE: 2, GREEN: 3, CRATE: 4, METAL: 5, DOOR: 6, FLOOR: 7, CEIL: 8
};
