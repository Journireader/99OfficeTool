# 事实卡：Dungeon / Arena / BloodSearch / Piggy / SoulStoneDungeon

## 0. 元信息

- 源 Excel：`develop/dungeon/*.xlsx`、`develop/adventure/Adventure.xlsx`，含 `GuildTrial.xlsx`、`PetDream.xlsx`、`WorldBoss.xlsx`、`SoulStoneDungeon.xlsx`
- 关联源 Excel：`develop/scene/Scene.xlsx`、`develop/battle/Enemy.xlsx`、`develop/system/Condition.xlsx`、`develop/system/SystemFunction.xlsx`、`develop/system/Item.xlsx`、`develop/random/Random.xlsx`
- 最近验证：2026-08-21 / SVN r5020 / 源表全 sheet + proto + client/server 只读代码
- 状态：入口和主要运行链路已验证；单副本业务规则、数值、奖励经济仍按飞书策划和源表任务确认
- 第一参考：`系统/副本.md`、`约定/配表链路运行模型.md`

## 1. 表事实

| 表 / Sheet | 表角色 | 主键 / 分组 | 运行侧读取 |
|---|---|---|---|
| `Dungeon.xlsx#Dungeon` | 副本入口聚合 | list；`ID` 标识入口 | 客户端副本页展示、功能解锁和窗口跳转 |
| `PiggyDungeon.xlsx#PiggyDungeon` | 金猪牧场主表 | `@cfg:map\|ID` | 服务端按 `ID` 取当前挑战 / 扫荡配置；客户端用 `nextPiggyID` 进战斗 |
| `NewbieDungeon.xlsx#NewBieDungeon` | 新手关底 Boss | `@cfg:map\|ID` | battle-core 按 `ID` 取电梯 / Boss 场景、波次和奖励 |
| `BloodSearch.xlsx#BloodSearchEvent` | 寻血事件主表 | `@cfg:map\|ID` | 服务端 / 客户端按事件 ID 取场景、NPC、奖励和战斗配置 |
| `BloodSearch.xlsx#BloodSearchReward` | 挖矿奖励 | `@cfg:map\|RewardID` | `BloodSearchEvent.RewardID` 列表引用；`NameID/PictureID` 管矿点显示 |
| `BloodSearch.xlsx#BloodSearchDaily` | 每日挖矿奖励 | `@cfg:map\|ID` | 客户端按每日次数展示和领取 |
| `BloodSearch.xlsx#BloodSearchMapPoints` | 地图点位 | `@cfg:map\|MapID` | 地图背景和点位展示 |
| `Arena.xlsx#Arena` | 竞技场全局配置 | `@cfg:struct` | 开放时间、次数、门票、匹配、战斗时间、战令付费等全局配置 |
| `Arena.xlsx#ArenaTier` | 竞技场段位 / 分组 | `@cfg:map\|TierID` | 段位人数、机器人、晋级 / 降级 |
| `Arena.xlsx#ArenaReward` | 排名奖励 | `@cfg:group\|TierID` | 按段位和排名区间取每日 / 每周奖励 |
| `Arena.xlsx#ArenaScoreDiff` | 积分差结算 | `@cfg:list` | 服务端按差值区间计算胜负积分变化 |
| `Arena.xlsx#ArenaBattlePass` | 竞技场战令 | `@cfg:groupmap\|Pid\|Level` | 活跃度等级奖励，活动服务 `actpassarena` 读取 |
| `GuildTrial.xlsx` | 军团试炼 | `GuildTrialConst` + Boss / RankReward | 当前只有 3 个 sheet；挑战费用从 Const 读取，需求拟表名与源表冲突见 `事实卡/Guild_Activity.md` |
| `PetDream.xlsx` | 幻灵梦境 | Group / Stage / Afk / Sprint | 当前 6 个 sheet，源表 / proto / code 已接入；需求文档“配置：无”已过时 |
| `WorldBoss.xlsx` | 世界 Boss | `WorldBoss.ID` | 当前 6 个 sheet，题库、三类奖励和 Buff 随机详见 `事实卡/WorldBoss.md` |
| `SoulStoneDungeon.xlsx` | 魂石副本 | 常量 + Boss / Room / DropRule | 当前 4 个 sheet，按职业与星期选择魂石掉落；详见 `事实卡/SoulStoneDungeon.md` |

## 2. 最短链路

### 2.1 副本入口链

```text
Dungeon.ID
  -> Dungeon.SystemFunctionID
  -> SystemFunction.UnlockCondID / PromptID
  -> Dungeon.WindowID / 业务入口窗口
  -> 对应玩法主表
```

`Dungeon` 是入口聚合，不是具体战斗波次表。具体玩法继续走 Piggy / BloodSearch / Arena / WorldHunting / SoulStoneDungeon / Adventure / NewBieDungeon 的主表。

### 2.2 金猪牧场链

```text
Dungeon / SystemFunction: FEATURE_UNLOCK_TYPE_DUNGEON_COIN
  -> PiggyDungeon.ID
  -> SceneID + GameTime + LevelLimit
  -> EnemyData / BossData -> Enemy
  -> BarrierReward / SweepReward / SweepRandom
  -> Item / Resource / Random / Reward
```

代码确认：

- 服务端把 `EnemyData`、`BossData` 解析成 `EnemyDatas`、`BossDatas`。
- 通关后若存在 `ID+1`，下一关推进到 `ID+1`；否则停在当前 ID。
- 扫荡消耗和广告免费次数来自 `ConstComm`：`FF_PiggyDungeonSweep`、`FF_PiggyDungeonFree`。
- 客户端红点和跨天刷新受 `FEATURE_UNLOCK_TYPE_DUNGEON_COIN` 控制。

### 2.3 新手关底 Boss 链

```text
NewBieDungeon.ID
  -> QueueSceneID / BossSceneID
  -> QueueSceneStart/EndAnimationID + BossSceneStart/EndAnimationID
  -> Waves / BossData
  -> Enemy / Animation / Scene
  -> Reward
```

`NewBieDungeon` 同时有电梯场景和 Boss 场景；不要只配 BossData 就认为新手副本完整。

### 2.4 寻血仪式链

```text
ConstComm BloodSearch_*
  -> BloodSearchMapPoints.MapID / PointsID
  -> BloodSearchEvent.ID
  -> SceneID + NpcData / PrivilegeNpcData -> Enemy
  -> RewardID -> BloodSearchReward
  -> BloodSearchDaily
  -> WinReward / FailReward / Reward
```

代码确认：

- 服务端把 `BloodSearchEvent.NpcData` 解析成单个 `Npc` 出生点。
- client 配置装载会同时解析 `PrivilegeNpcData` 作为特权 NPC；普通与特权 NPC 字段不能互相覆盖。
- `BloodSearchEvent.RewardID` 是奖励 ID 列表，目标是 `BloodSearchReward.RewardID`。
- `BloodSearchReward.NameID -> I18N#BloodSearchReward.Key`，`PictureID` 继续查 Picture；二者只管矿点显示，不改变奖励内容。
- `BloodSearchReward.ConditionID` 表示奖励出现 / 消失条件列表，不能当作纯文案或普通备注。
- 入侵胜利 / 失败直接读 `WinReward` / `FailReward`；入侵奖励加成时间和倍率来自 `ConstComm`。

### 2.5 竞技场链

```text
SystemFunction: FEATURE_UNLOCK_TYPE_ARENA
  -> Arena(struct)
  -> ArenaTier.TierID
  -> ArenaReward.TierID + RankMin/RankMax
  -> ArenaScoreDiff.DiffMin/DiffMax
  -> ArenaBattlePass.Pid + Level
  -> Mail / Loot / PurchaseList / Rank
```

代码确认：

- `Arena.OpenTime` / `GroupTime` 是时间段数组；服务端按起止时间解析。
- `ArenaTier.PlayerNum` 决定分组人数，候选人数有服务端上限。
- `ArenaScoreDiff` 按差值区间匹配；普通挑战和复仇使用不同字段。
- 客户端战斗房间读 `Arena.SceneID` 和 `Arena.Time`，对手数据来自服务端匹配结果。

## 3. 禁止推断

- 不要把 `Dungeon.ID` 当成具体玩法关卡 ID；它只是入口聚合层。
- 不要把 `SceneID` 当成房间、怪物或奖励；场景只管战斗 / 表现空间。
- 不要只看副本主表奖励字段就停下；`Loot` 仍要按 `PropType / PropID / Value` 分流到 Item / Resource / Chest / Random。
- 不要把 `BloodSearchReward.ConditionID` 当 `system/Condition.ConditionID` 的唯一语义；写入前要按 BloodSearch 代码 / 策划确认出现和消失条件。
- 不要把 Arena 的段位、奖励、积分差、战令压成一张表理解；它们分别管赛制、排名奖励、积分结算和战令奖励。
- 不要按 GuildTrial 需求稿自行新增 `GuildTrial` / `GuildTrialChallengeCost` sheet；r4822 运行侧读取的是 `GuildTrialConst / GuildTrialBoss / GuildTrialRankReward`。
- 不要按 PetDream 需求文档的“配置：无”跳过源表；六类 proto/config 和正式业务代码已存在。
- 不要把 WorldBoss 与 WorldHunting 当同一玩法：前者有答题、大厅、开房、伤害 / 排名奖励和 Buff 随机；后者按当前 Excel 走 Boss 房、独立刷新和按周魂石掉落，旧章节 / 任务链已标 `#弃用` 但程序仍待同步。
- 不要把 `SoulStoneDungeonDropRule` 与 `WorldHuntingDropRule` 合并；结构相似但主键空间、入口和日期选择分别归属各自 workbook。

## 4. 反向影响

| 改动类型 | 必查反向引用 | 必补支撑 | 阻塞 / 需确认 |
|---|---|---|---|
| 新副本入口 | Dungeon、SystemFunction、Window / Jump | Condition / Prompt / Picture | 入口窗口或功能类型未确认 |
| 新 Piggy 关卡 | PiggyDungeon 前后 ID、Scene、Enemy、Reward | ConstComm / Item / Random | BossData / EnemyData 解析失败或奖励不闭合 |
| 新 NewBieDungeon | 场景、动画、Enemy、Reward | Scene / Animation / Enemy | 电梯和 Boss 场景缺任一段 |
| 新 BloodSearch 事件 | MapPoints、Reward、ConstComm、Enemy | Scene / Enemy / Condition / Item | RewardID 或 NpcData 不能解析 |
| 新 SoulStoneDungeon Boss | Room、7 日 DropRule、Condition、Reward | Scene / Enemy / SoulStone / Item | 任一日期规则或职业权重不闭合 |
| 改 Arena 赛制 | ArenaTier、ArenaReward、ArenaScoreDiff、Rank、Mail | Item / Mail / PurchaseList | 影响赛季、结算或支付时需系统负责人确认 |

## 5. 验收清单

- 入口链：`Dungeon -> SystemFunction -> Window/Jump -> 玩法主表` 能闭合。
- 战斗链：`SceneID -> EnemyData/BossData/NpcData -> Enemy -> MonsterAI/Skill/EnemyAttrGrow` 能闭合。
- 奖励链：所有 `Loot / Reward / BarrierReward / SweepReward / WinReward / FailReward` 继续查到 Item / Resource / Chest / Random。
- 时间 / 次数 / 免费刷新类规则已区分主表字段和 `ConstComm` 常量。
- 涉及 Arena 时，`Arena / ArenaTier / ArenaReward / ArenaScoreDiff / ArenaBattlePass` 按职责分别读回。
- 涉及军团试炼、幻灵梦境、世界 Boss、魂石副本时继续读对应 `Guild_Activity.md`、`Pet_System.md`、`WorldBoss.md`、`SoulStoneDungeon.md`，并保留各自状态边界。
