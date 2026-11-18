# COD-Lite · 货场 1v1（设计框架 v0.1）

> 目标：网页版、像素风、单图（货场 Shipment）、1v1 联机、低延迟、纯静态体积 < 120KB。
> 本文只定义结构与规则，不含实现。确认后再进入 M0。

---

## 1. 范围

| 项 | V1 范围 | 明确不做 |
| --- | --- | --- |
| 地图 | 货场（40m × 40m，集装箱 + 掩体） | 其他地图 |
| 人数 | 1v1 | 2v2 / 4v4 |
| 模式 | 死斗：先到 25 杀，或 5 分钟结束，平局算平 | 占点 / 搜点 / 爆破 |
| 武器 | 步枪（全自动）+ 手枪（半自动） | 霰弹 / 狙 / 投掷物 |
| 生命 | 100 血，5 秒未受伤后每秒回 20 | 护甲 / 连杀奖励 / 技能 |
| 输入 | 键鼠 + Pointer Lock | 手柄 / 触屏 |

## 2. 技术选型

| 层 | 选择 | 理由 |
| --- | --- | --- |
| 渲染 | Canvas 2D + DDA 射线（Wolfenstein 式 2.5D） | 真第一人称、像素感强，无 3D 库，渲染代码 < 4KB |
| 内部分辨率 | 480×270，`image-rendering: pixelated` 放大 | 像素风 + 填充率低，60fps 无压力 |
| 音效 | WebAudio 程序化合成 | 零资源、零请求 |
| 构建 | 无构建，`<script>` 顺序加载 | 与已有项目一致，Pages 直接托管 |
| 传输 | WebRTC DataChannel（P2P 直连） | 直连延迟 15–40ms，比中继好一个数量级 |
| 信令 | Supabase Realtime（已有项目/匿名 key） | 无需新服务；打洞失败时同样走它中继 |
| 托管 | GitHub Pages | 与现有两个项目同流程 |

## 3. 权威模型

**房主权威（Host-Authoritative）**，非确定性锁步。

```
客机                                   房主
输入采样 30Hz ──input(seq)──▶  权威模拟 60Hz（唯一真相）
本地预测（立即可动）              每 20Hz 下发 snapshot
◀──snapshot(tick, ack, players, events)──
按 ack 回滚本地玩家，重放未确认输入
远端玩家做 100–150ms 插值
```

关键取舍：

- **本地玩家预测**：不预测会「粘手」，40ms 输入延迟都能感觉到；
- **命中判定只在房主做**：客机本地只放「枪口闪光 + 子弹线」，命中用 hitmarker 反馈（服务器确认后 100ms 内到达）；
- **延迟补偿**：房主保存最近 250ms 的玩家位置环形缓冲，收到客机开火时按 `now - rtt/2` 回退后做射线，客机不会「打在身后」；
- **公平性**：房主自己有 0 延迟优势，通过给房主渲染加 `rtt/2` 的插值偏移（与客机一致）来抹平。

## 4. 时钟与频率

| 项 | 值 | 说明 |
| --- | --- | --- |
| 模拟 tick | 60Hz 固定步长（1/60s） | 双端同一份 physics（`sim.js`），保证预测一致 |
| 发送输入 | 30Hz | 每包带最近 3 帧冗余，丢包不卡 |
| 下发快照 | 20Hz | 单帧约 120–200 字节（位打包） |
| 远端插值 | 100ms 自适应（60–150ms） | 与 cr-lite 同一套抖动缓冲思路 |
| 延迟补偿窗口 | 最多 250ms | 超出则按 250ms 处理 |
| 超时判负 | 8s 无包 | 与 cr-lite 一致 |

## 5. 数据模型

```js
player = { id, team, x, y, angle, pitch, hp, alive, weapon,
           ammo, reserve, reloading, lastFire, lastHurt,
           respawnAt, kills, deaths, rtt }
event  = { type: 'shot'|'hit'|'kill'|'spawn'|'reload'|'empty'|'hitmark',  ... }
snapshot = { tick, ack, p: [[id, x, y, angle, hp, weapon, ammo]], ev: [...], score: [[k,d]] }
```

位置/角度用定点（1/128 m 精度）打包成 Int16，比 Float32 省一半。

## 6. 协议（位打包，Uint8Array）

| 消息 | 方向 | 长度 | 内容 |
| --- | --- | --- | --- |
| `hello` | C→H | ~20B | 名字、版本 |
| `start` | H→C | ~30B | 双方 id、出生点、地图种子 |
| `input` | C→H | 9B | seq(2) + 最近 3 帧的移动位掩码/角度；buttons(1) |
| `snap` | H→C | 120–200B | tick、ack、两名玩家状态、事件表、比分 |
| `over` | H→C | ~20B | 胜负、最终比分 |
| `ping/pong` | 双向 | 6B | RTT 测量，2s 一次 |

丢包策略：`input`/`snap` 都走 unreliable + unordered 通道（FPS 只要最新），关键事件（start/over/rematch）走 reliable 通道。两个通道，与 cr-lite 的 p2p 同构。

## 7. 地图：货场

- 尺寸：32×32 tile，tile = 1.25m → 40m × 40m；
- 主体：中央一横一竖两条集装箱通道，四角各一处掩体堆；
- 碰撞：所有箱体为 AABB，DDA 射线与 AABB 求交；
- 出生点：4 个，选距离对手最远且互不可视的点；
- 视觉：程序化像素贴图（集装箱的瓦楞条纹、地面黄线、警示条），无外部图片资源。

## 8. 模块划分

```
cod-lite/
  index.html            # 画布 + HUD 骨架
  css/style.css
  js/core.js            # 常量、定点打包、位运算工具、伪随机
  js/map.js             # 货场地图数据、AABB 集合、出生点、可见性
  js/raycast.js         # DDA 渲染：墙、地板、精灵、枪模型
  js/entities.js        # 玩家、武器数值、伤害与死亡
  js/sim.js             # 权威模拟（双端共用，纯函数式 step）
  js/predict.js         # 本地预测 + 回滚重放
  js/net.js             # WebRTC 传输 + 信令 + 中继回退
  js/netplay.js         # 房间、快照缓冲、插值、延迟补偿
  js/input.js           # 键鼠、Pointer Lock、按键映射
  js/hud.js             # 准星、血条、击杀播报、计分板
  js/main.js            # 装配、主循环、菜单
```

依赖方向单向：`core ← map/entities ← sim ← predict/netplay ← main`，`raycast/hud` 只读状态。

## 9. 主循环

```js
// 固定步长 + 追赶，避免高刷屏跑快
acc += dt;
while (acc >= STEP) { sim.step(state, inputs, STEP); acc -= STEP; tick++; }

// 客机：
predicted = predictLocal(state, input);   // 立即执行本地玩家
if (snap.ack > lastAck) { state = rewind(snap); replay(unackedInputs); }
render(state, interpolate(remotePlayers, now - delay));
```

## 10. 里程碑（每个都有可验收产物）

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| **M0** | 地图渲染 + 移动碰撞 + 射击打墙（无敌人） | 60fps；撞墙不穿；弹孔/枪口火焰正常 |
| **M1** | 单机 bot：巡逻/索敌/开火/死亡重生 | bot 能杀我、我能杀 bot，计分正确 |
| **M2** | 双浏览器 P2P 直连：互见移动 + 射击命中 + 重生 | 同机 rtt≈0；跨机 rtt 30–60ms；移动无抖动 |
| **M3** | 完整对局：计时、先到 25 杀、结算、再来一局 | 两端比分/计时始终一致 |
| **M4** | 部署 Pages + 邀请链接 + 中继回退 | 线上双人可玩；禁 WebRTC 时自动降级 |
| **M5** | 打磨：音效、命中反馈、后坐力、开镜、击杀播报 | 手感验收 |

## 11. 风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| WebRTC 打洞失败（约 10–20%） | 只能走中继，延迟 150–300ms | 免费 TURN 兜底；UI 明示「直连 / 中继」；超过 200ms 提示 |
| 房主 0 延迟优势 | 双方体验不对等 | 房主渲染同样加 rtt/2 偏移；开局显示双方 RTT |
| 指针锁定/键鼠 | 移动端不可玩 | 明确「仅桌面」 |
| 每帧快照带宽 | 1v1 无关紧要（~4KB/s） | 位打包；不做 4v4 |
| 预测与权威不一致 | 拉扯/穿墙 | 双端共用 `sim.step`；位移只走权威修正，命中纯权威 |

## 12. 待确认

1. 仅桌面（键鼠 + Pointer Lock）可以吗？
2. 计分：先到 25 杀 / 5 分钟，平局算平 —— 还是改成「限时 5 分钟，杀得多者胜」？
3. 要不要 bot 练习模式（M1 的产物直接复用，人不够时也能自己练枪）？
4. 美术走「纯程序化像素」还是允许我画几张 32×32 的贴图 PNG 放进仓库？
