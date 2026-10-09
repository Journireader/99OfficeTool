# 事实卡：SoulStoneDungeon

## 0. 元信息

- 源 Excel：`develop/dungeon/SoulStoneDungeon.xlsx`
- 最近验证：2026-08-21 / SVN r5020 / 4 个 sheet、client proto、配置加载、玩法代码只读核对
- 状态：源表与 client 运行链已接入；正式数值、奖励经济和 server 发布状态按当次任务确认
- 第一参考：`系统/副本.md`、`事实卡/SoulStone.md`、`事实卡/Item_Random_Reward.md`

## 1. 表事实

| Sheet | 表角色 | 主键 / 分组 | 配置粒度 |
|---|---|---|---|
| `c.SoulStoneDungeon` | 全局常量 | struct 键值 | 每日免费次数、挑战消耗、刷新时间、托管条件、战斗时长 |
| `SoulStoneDungeonBoss` | 难度 / Boss 主表 | `BossID` | 排序、解锁、房间、5 个挑战条件、周一至周日掉落规则、结算奖励 |
| `SoulStoneDungeonRoom` | 战斗房间 | `RoomID` | 场景、3 波小怪池、Boss / 辅怪点位 |
| `SoulStoneDungeonDropRule` | 魂石掉落规则 | `DropRuleID` | 骑士 / 巫师分别配置数量、套装、星级、部位权重 |

最短链路：

```text
c.SoulStoneDungeon
  -> SoulStoneDungeonBoss.BossID
  -> RoomID -> SoulStoneDungeonRoom.SceneID + Waves / BossData
  -> SoulStoneDropRuleID#1..#7 -> SoulStoneDungeonDropRule.DropRuleID
  -> Profession -> SetID / Star / Position -> develop/SoulStone.xlsx
  -> Condition / Enemy / Scene / Item / Chest / Reward
```

## 2. 字段语义

| 字段 | 语义 | 易误判 |
|---|---|---|
| `DailyFreeCount` / `ChallengeCost` | 整个功能共享的每日免费次数与免费用尽后的单次消耗 | 不是每个 Boss 各自次数 |
| `BossID` / `SerialNumber` | 难度身份 / UI 排序 | 排序不是解锁等级 |
| `UnlockConditionID` | Boss 层解锁条件 | 继续查 `system/Condition.xlsx` |
| `ChallengeConditionID#1..#5` | 单局 5 个挑战宝箱条件 | 不是 5 个顺序关卡，也不是掉落权重 |
| `SoulStoneDropRuleID#1..#7` | 周一至周日掉落规则 | 第 7 列仍是周日；每个值引用 DropRule 主键 |
| `Knight*Weights` / `Wizard*Weights` | 当前职业对应的数量、套装、星级、部位权重 | 两职业字段不能合并读取；每一维独立抽取 |
| `EnemyNumPlan` / `Waves#N` | 三波小怪数量方案、敌人池和点位池 | 点位数量与抽取数量需闭合 |
| `BossData` / `HelperData` | `点位名,EnemyID` | 不是纯 EnemyID |

## 3. 运行边界

- client 已注册 `SoulStoneDungeonConfig/Boss/Room/DropRule` 四类 bytes，并提供 lobby、挑战、托管、自动分解与战斗核消费。
- 预览 Boss 词缀从 `Room.BossData.EnemyID -> Enemy.Affix` 读取；本表不新增独立词缀列。
- 免费次数优先；耗尽后才读 `ChallengeCost`。托管解锁读 `AutoChallengeConditionID`，不能拿 Boss 解锁条件替代。
- 掉落规则按玩家当前职业选 Knight 或 Wizard 字段；数量、套装、星级、部位四个权重维度分别抽取。

## 4. 禁止推断与验收

- 不要把 `SoulStoneDungeonDropRule` 与 `WorldHuntingDropRule` 当成同一主表；二者结构复用，但主键空间和业务入口独立。
- 不要把周一至周日 7 个 DropRule 当权重列；它们是按日期选择的外键。
- 不要只验每格格式；每个权重维度需检查键不重复、权重和符合当前抽取约定、套装/星级/部位能命中 `SoulStone.xlsx`。
- 验收至少闭合 `Boss -> Room -> Scene/Enemy`、`Boss -> 7 日 DropRule -> SoulStone`、`Boss -> Condition`、结算奖励 -> Item/Chest/Reward 四条链。
