# 事实卡：WorldHunting

## 0. 元信息

- 源 Excel：`develop/dungeon/WorldHunting.xlsx`、`develop/random/Random.xlsx`
- 最近验证：2026-08-21 / SVN r5020 / 当前 sheet、client proto、client/server 非生成代码只读核对
- 状态：**Excel 当前配表口径已迁移**为 Boss 房 + 按周魂石掉落结构；带 `#弃用` 的旧 sheet 不再用于新增配置。当前 client/server 非生成代码仍消费旧链，属于实现未同步风险
- 第一参考：`系统/副本.md`、`事实卡/SoulStoneDungeon.md`、`事实卡/Item_Random_Reward.md`

## 1. Excel 当前结构

| Sheet | 表角色 | 主键 / 分组 | 当前边界 |
|---|---|---|---|
| `c.WorldHunting` | 世界狩猎常量 | 键值表 | 新旧逻辑共用字段与弃用常量并存 |
| `BossHunting` | Boss 入口、房间、奖励、魂石池和刷新 | `ID` | 新旧字段并存 |
| `HuntingBossRoom` | Boss 房、Boss / 辅怪 | `RoomID` | 新旧逻辑都可能引用 |
| `WorldHuntingDropRule` | 按职业的魂石掉落规则 | `DropRuleID` | 当前 Excel 主表；实现消费未闭合 |
| `ChapterHunting#弃用` | 旧章节入口 | `ChapterID` | Excel 弃用，不新增配置 |
| `HuntingEnemyRoom#弃用` | 旧小怪房 | `HuntingEnemyRoomID` | Excel 弃用，不新增配置 |
| `HuntingTask#弃用` | 旧任务 | `TaskItemConfig.TaskID` | Excel 弃用，不新增配置 |

`random/Random.xlsx` 中的 sheet 已改名为 `WorldHuntingRandom#弃用`，按 Excel 口径不再承接新增配置。当前 server 仍按 `WorldHuntingRandom` 注册和读取，说明实现尚未跟上表结构。

## 2. 当前配表链与实现风险

### 2.1 Excel 当前配表结构

```text
BossHunting.ID
  -> BossRoomID -> HuntingBossRoom.RoomID
  -> SceneID + BossData / HelperData -> Scene / Enemy
  -> Reward#N -> Item / Resource / Chest
  -> SoulStoneChestID#1..#7 -> WorldHuntingDropRule.DropRuleID
  -> 当前职业 -> Knight / Wizard 四组权重
  -> SoulStone.SetID / Star / Position
```

| 字段 | 表头设计语义 | 配置提醒 |
|---|---|---|
| `RespawnTimeMin/Max` | 每个 Boss 房独立随机的刷新区间，秒 | 必须满足 Min <= Max；当前运行消费未闭合 |
| `SoulStoneRandomCount` | 对当日魂石池执行的抽取次数 | 掉落规则允许数量 0，不能直接写成必得数量 |
| `SoulStoneChestID#1..#7` | 周一至周日 DropRule 外键 | 依次指向 `WorldHuntingDropRule.DropRuleID` |
| `Knight/Wizard*Weights` | 当前职业的数量、套装、星级、部位权重 | 四个维度分别抽取，不能合成一个池 |

### 2.2 实现未同步风险

```text
ChapterHunting
  -> BossHunting.ChapterID / EnemyRoomID / TaskID
  -> HuntingEnemyRoom
  -> BossHunting.DropPoolID
  -> Random.WorldHuntingRandom
```

- server 仍注册 `ChapterHunting`、`HuntingEnemyRoom`、`WorldHuntingRandom`，掉落逻辑仍读 `DropPoolID`、`EnemyRoomID` 和旧随机池。
- client 非生成配置列表仍装载 `ChapterHunting`、`HuntingEnemyRoom`、`HuntingTask`，尚未注册 `WorldHuntingDropRule`。
- 因此，配表仍按 Excel 新结构理解；但在实现迁移闭合前，不能宣称新字段已在运行时生效或直接发布。

## 3. 当前配表口径

- 新增配置只使用 `BossHunting`、`HuntingBossRoom`、`WorldHuntingDropRule`；不再向三个 `#弃用` sheet 或 `WorldHuntingRandom#弃用` 增加内容。
- 服务端狩猎结算已走新结构（`GetSoulStoneDungeonDropRuleWeightsByID`，与魂石副本共用抽取逻辑），按 client `develop@14c1f360ca8c` / server `develop@43999d89aeb5` 的只读检索，旧链在非生成代码中已无游戏逻辑消费者。回填前仍按当次基线复核一次即可。
- 若任务是维护旧线上版本，另按该发布分支的历史表和 bytes 处理，不用旧版实现反改 develop Excel 当前结构。
- `WorldHuntingDropRule` 与 `SoulStoneDungeonDropRule` 只复用结构，业务主键和入口独立。
- `SoulStoneChestID` 在目标结构中是 DropRule 外键，不是 Item/Chest ID；`DropPoolID` 属于旧随机池链，两者不可互换。

## 4. 验收清单

- 配表验收：`BossHunting -> HuntingBossRoom -> Scene/Enemy`、七日 DropRule、职业四组权重、常规奖励与魂石掉落全部闭合。
- 弃用验收：三个 `#弃用` sheet 与 `WorldHuntingRandom#弃用` 未被新增内容继续引用。
- 迁移验收：client/server 不再注册或消费旧链后，才可把 `#弃用` 结构写成纯历史数据并停止维护。
- 未完成迁移验收前，只能写“Excel 新结构为当前配表口径，运行时待接入”，不能写“已生效”。
