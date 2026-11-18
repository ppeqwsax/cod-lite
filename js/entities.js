/* cod-lite · 玩家与武器状态 */
function Player(spawn) {
  this.x = spawn.x;
  this.y = spawn.y;
  this.angle = spawn.a;
  this.pitch = 0;
  this.vx = 0;
  this.vy = 0;

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
}

Player.prototype.def = function () { return WEAPONS[this.weapon]; };

Player.prototype.respawn = function (spawn) {
  this.x = spawn.x; this.y = spawn.y; this.angle = spawn.a;
  this.pitch = 0; this.vx = 0; this.vy = 0;
  this.hp = G.MAX_HP; this.alive = true;
  this.ammo.rifle = WEAPONS.rifle.mag;
  this.ammo.pistol = WEAPONS.pistol.mag;
  this.reserve.rifle = WEAPONS.rifle.reserve;
  this.reserve.pistol = WEAPONS.pistol.reserve;
  this.weapon = 'rifle';
  this.reloadT = 0; this.fireCd = 0; this.recoil = 0; this.muzzle = 0;
};
