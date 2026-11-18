/* cod-lite · 玩家与武器状态 */
function Player(spawn) {
  this.x = spawn.x;
  this.y = spawn.y;
  this.angle = spawn.a;
  this.pitch = 0;
  this.vx = 0;
  this.vy = 0;
  this.z = 0;          // 脚底离地高度（米）
  this.vz = 0;
  this.onGround = true;
  this.slideT = 0;     // 滑铲剩余时间
  this.crouch = false;
  this.crouchHeld = false;
  this.eyeM = G.EYE;   // 当前眼睛高度（米，模拟里每帧算）
  this.ads = 0;        // 开镜程度 0..1
  this.fov = G.FOV;    // 当前视野（开镜会收窄）

  this.hp = G.MAX_HP;
  this.alive = true;
  this.hurtAt = -99;

  this.weapon = 'rifle';
  this.ammo = { rifle: WEAPONS.rifle.mag, pistol: WEAPONS.pistol.mag };
  this.reserve = { rifle: WEAPONS.rifle.reserve, pistol: WEAPONS.pistol.reserve };

  this.fireCd = 0;
  this.reloadT = 0;      // 剩余换弹时间
  this.recoil = 0;       // 视觉后坐力（0..1）
  this.muzzle = 0;       // 枪口火焰剩余时间
  this.bob = 0;          // 走路摆动相位
  this.moving = 0;       // 0..1 移动强度
  this.kills = 0;
  this.deaths = 0;
  this.respawnT = 0;
  this.hopT = 0;
}

Player.prototype.def = function () { return WEAPONS[this.weapon]; };

Player.prototype.respawn = function (spawn) {
  this.x = spawn.x; this.y = spawn.y; this.angle = spawn.a;
  this.pitch = 0; this.vx = 0; this.vy = 0;
  this.z = 0; this.vz = 0; this.onGround = true;
  this.slideT = 0; this.crouch = false; this.eyeM = G.EYE;
  this.ads = 0; this.fov = G.FOV;
  this.hp = G.MAX_HP; this.alive = true;
  this.ammo.rifle = WEAPONS.rifle.mag;
  this.ammo.pistol = WEAPONS.pistol.mag;
  this.reserve.rifle = WEAPONS.rifle.reserve;
  this.reserve.pistol = WEAPONS.pistol.reserve;
  this.weapon = 'rifle';
  this.reloadT = 0; this.fireCd = 0; this.recoil = 0; this.muzzle = 0;
};
