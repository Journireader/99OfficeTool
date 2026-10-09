# 事实卡：Adventure

## 0. 元信息

- 源 Excel：`develop/adventure/Adventure.xlsx`
- 最近验证：2026-08-21 / SVN r5020 / 源表结构 + client proto / client/server 只读代码
- 状态：导航和运行链路已验证；数值来源和怪物强度按任务确认
- 第一参考：`系统/副本.md`
- 常用联查：`事实卡/Item_Random_Reward.md`、`事实卡/MonsterAI.md`、`事实卡/资源表现链.md`、`事实卡/Condition.md`

## 1. 表事实

| Sheet | 表角色 | 主键 / 分组 | 配置粒度 |
|---|---|---|---|
| `AdventureChapter` | 章节入口和世界地图表现 | `AdventureChapterID` | 章节 -> 区域列表 |
| `AdventureArea` | 区域、解锁、区域地图、装备随机池 | `AdventureAreaID` | 区域 -> 关卡列表 |
| `AdventureBarrier` | 关卡节点、房间引用、掉落等级和地图点位 | `AdventureBarrierID` | 单关卡 |
| `AdventureWeakEnemyRoom` | 小怪房、3 波怪、点位和宝箱怪 | `AdventureWeakEnemyRoomID` | 房间 |
| `AdventureStrongEnemyRoom` | Boss 房、Boss / 辅怪、动画和首领掉落 | `AdventureStrongEnemyRoomID` | 房间 |
| `AdventureDropLevel` | 小怪房掉落等级、经验和掉落池 | `AdventureDropLevelID` | 掉落等级 |

最短链路：

```text
AdventureChapter.AdventureAreaID
  -> AdventureArea.AdventureBarrierID
  -> AdventureBarrier.Fixed_AdventureWeakEnemyRoomID / Random_AdventureWeakEnemyRoomID
  -> AdventureWeakEnemyRoom.SceneID + Waves#N.EnemyID / PosID

AdventureBarrier.AdventureStrongEnemyRoomID
  -> AdventureStrongEnemyRoom.SceneID + BossData / HelperData

AdventureBarrier.AdventureDropLevelID
  -> AdventureDropLevel.ExpDropsData / DropItemRandomID / EntityDrop

EnemyID / BossData / HelperData
  -> battle/Enemy.xlsx#Enemy
  -> Enemy.Level + EnemyAttrGrow
  -> Enemy.ResId + MonsterRes
  -> Enemy.EnemyAI + MonsterAI / Skill
```

## 2. 字段语义

| 字段 | 语义 | 易误判 |
|---|---|---|
| `AdventureChapter.AdventureAreaID` | 分号分隔的区域列表 | 不是单区域外键 |
| `AdventureArea.AdventureBarrierID` | 分号分隔的关卡列表 | 版本范围要从这里顺链判断 |
| `EquipQualityRandomID` / `EquipPartRandomID` | 装备品质 / 部位随机池 | 需查 `random/Random.xlsx` 对应 sheet，同 ID 多行是一组 |
| `UnlockCondID#N` / `GatherCondID` | 条件 key | `GC_*` 需查 `system/Condition.xlsx` |
| `UnlockReward#N.PropType` / `PropID` / `Value` | 区域解锁奖励字段，按奖励类型分流；具体道具类奖励需填 `PropID`，`Value` 为数量 | 不要把 `Value` 当 ItemID；`AdventureArea` 当前第 2 组奖励已补 `UnlockReward#2.PropID` |
| `SpeedItemID` | 加速道具 ID | 需查 `system/Item.xlsx`，不是资源枚举 |
| `EquipQualityFixValue` | 装备掉落品质修正值；标准品质按“玩家当前最低装备品质 + 本值”向区域允许品质上限收敛 | 不是新的品质随机池 ID；仍需与 `EquipQualityRandomID` 一起验证 |
| `Fixed_AdventureWeakEnemyRoomID` | 固定小怪房列表 | 先按顺序激活，不能只看随机池 |
| `Random_AdventureWeakEnemyRoomID` | 随机小怪房列表 | 分号列表，按抽取逻辑使用 |
| `AdventureDropLevelID` | 掉落等级 | 小怪房掉落使用，不等于 Boss 掉落 |
| `BossData` / `HelperData` | 点位名 + EnemyID | 形如 `EnemyPoint_1,301110`；敌人仍需查 `battle/Enemy.xlsx` |
| `Waves#N.EnemyID` | 每波敌人池 | 分号列表，可重复 / 多候选，不是一只怪 |
| `Waves#N.PosID` | 场景预制体点位名 | 不是配置表 ID |
| `BarrierPoint.X/Y` / `LinePoint.X/Y` / `CameraPoint.X/Y` | 地图节点、连线、镜头坐标；r4891 后由旧 `.Pos.X/Y` 改为直接 `.X/Y` | 不是图片资源；回填不得继续使用旧列名 |

## 2.1 代码确认的运行语义

- 服务端先用 `AdventureBarrier.Fixed_AdventureWeakEnemyRoomID` 填固定房间，再从 `Random_AdventureWeakEnemyRoomID` 洗牌补随机房间；随机房间会避免和上一房间立刻重复，并至少补到客户端需要的房间数。
- 客户端小怪房按 `EnemyNumPlans` 随机选一个数量方案；方案中每个值对应一波怪数量。
- 每波从 `Waves#N.EnemyID` 和 `Waves#N.PosID` 池抽取；池抽空后会重新用该波配置池补满继续抽。
- Boss 房直接读 `BossDatas` 和 `HelperDatas`；当前战斗上报的 BossID 取 `BossDatas` 第一项。
- `Enemy.Level.Type` 决定怪物等级来源：固定等级、跟随玩家等级、跟随关卡等级等；取到等级后必须命中 `EnemyAttrGrow`。
- 冒险小怪 / Boss 只提供 EnemyID 和房间上下文；怪物技能、AI、属性、资源继续从 `Enemy -> MonsterRes / Skill / MonsterAI / EnemyAttrGrow` 链路解释。
- `EquipQualityFixValue` 已进入 client proto；独立 proto 工作副本当前仍缺该字段，跨仓发布前必须确认协议源已同步，不能只凭 Excel 列存在判断全链完成。

## 3. 跨表引用

| 源字段 | 关系类型 | 目标表 / 字段 | 新增时动作 | 修改 / 删除时反查 |
|---|---|---|---|---|
| `Name` / `UnlockText` | 文案 key | `system/I18N.xlsx` 对应 Adventure sheet | 补 I18N | 查所有显示入口 |
| `*ImagePath` / `NamePath` / `LineImagePath` | 表现资源 | Picture / 资源表现链 | 确认资源存在与命名 | 查地图 UI 使用 |
| `UnlockCondID#N` / `GatherCondID` | 条件 | `system/Condition.xlsx` | 补条件 key 和参数 | 查入口 / 开放门槛 |
| `UnlockReward#N.*` / `Reward#N.*` / `BoxReward#N.*` | 奖励三元组 | Item / Resource / Reward 分流 | 按 PropType 补支撑 | 查所有发奖来源 |
| `EquipQualityRandomID` / `EquipPartRandomID` | 随机池 | `random/Random.xlsx` | 补同 ID 多行 | 查 AdventureArea 引用 |
| `DropItemRandomID` | 掉落随机池 | `random/Random.xlsx#DropItemRandom` | 补同池多行 | 查 DropLevel 引用 |
| `SceneID` | 场景 | `scene/Scene.xlsx` | 补场景和资源 | 查房间引用 |
| `Waves#N.EnemyID` / `BossData` / `HelperData` | 战斗怪物 | `battle/Enemy.xlsx` -> `MonsterAI` / Skill | 补怪物、AI、技能 | 查所有房间引用 |
| `AnimationID#N` | 动画 | `system/Animation.xlsx` | 补动画配置 | 查房间表现 |

## 4. 禁止推断

- 不要只看 `AdventureBarrier` 就判断版本范围；必须从 `Chapter -> Area -> Barrier` 顺链。
- 不要把小怪房随机列表、敌人波次列表、点位列表当单值字段。
- 不要把 `AdventureDropLevel` 当 Boss 掉落；Boss 房有自己的 `Reward#N.*`。
- 不要因为某个房间暂未被当前章节挂接就删除；可能是历史 / 预留 / 后续版本行。
- 不要用地图坐标字段推断资源存在；资源仍需按表现链查。
- 不要再写 `BarrierPoint.Pos.X/Y`、`LinePoint.Pos.X/Y`、`CameraPoint.Pos.X/Y`；当前 Excel 字段名已改为直接 `.X/Y`。

## 5. 反向影响

| 改动类型 | 必查反向引用 | 必补支撑 | 阻塞 / 需确认 |
|---|---|---|---|
| 新增章节 | Area 列表、地图资源、章节文案 | I18N / Picture | 区域范围未确认时阻塞 |
| 新增区域 | Barrier 列表、随机池、解锁条件、加速道具 | Random / Condition / Item | 数值来源未确认时阻塞 |
| 新增关卡 | 固定 / 随机小怪房、Boss 房、DropLevel、地图点位 | Scene / Enemy / Random / I18N | 房间或掉落缺失时阻塞 |
| 改小怪房 | 引用该房间的所有 Barrier | Enemy / Scene / Animation | 波次点位数量不匹配时阻塞 |
| 改 Boss 房 | 引用该 Boss 房的 Barrier | Enemy / Scene / Animation / Reward | BossData 解析不明时阻塞 |
| 改掉落等级 | 引用该 DropLevel 的 Barrier | Random / Item | 奖励经济未确认时标未检 |

## 6. 验收清单

- `Chapter -> Area -> Barrier -> Room` 链路能从入口走到房间。
- 分号列表字段已拆分校验，不按整格字符串查引用。
- 小怪房 `SceneID`、`Waves#N.EnemyID`、`Waves#N.PosID` 同步检查。
- Boss 房 `BossData / HelperData` 的 EnemyID 能命中 `battle/Enemy.xlsx`。
- 所有关联 Enemy 能命中 `EnemyAttrGrow`、MonsterRes、Skill / MonsterAI 所需支撑。
- 掉落链路区分 `AdventureDropLevel`、`DropItemRandom`、Boss 房奖励和宝箱奖励。
- 涉及解锁、文案、资源、道具、动画时，对应支撑表已列入证据。
- 新增或调整 `EquipQualityFixValue` 时同时验证区域品质上限、玩家最低装备品质样例和对应品质随机池，不允许只读回单列。
