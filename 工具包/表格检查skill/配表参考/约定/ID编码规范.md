# ID 编码规范

## EnemyId（怪物用途分区）

`EnemyId` 是怪物配置主键，按用途分区；不要和 `Enemy.ResId` / `MonsterResID` / `SkillID` 混用。

| 区间 | 用途 | 编码规则 |
|----|----|----|
| `1~9999` | 测试区块 | 无固定业务规则，保证不重复 |
| `10000~99999` | 特殊配置 | 从前向后递增，用于醒目标记特殊怪物配置 |
| `100000~199999` | 怪物较少的玩法类怪物 | 从 `100000` 开始，每个玩法通常占 `100` 个 ID；数量多时可扩到 `200` 等 |
| `200000~299999` | 主线小怪 | 同模型下，不同角色美术风格按 `+100` 划分；同角色美术风格下，不同武器、毛发等换皮按 `+1` 递增 |
| `300000~399999` | 主线 boss，含召唤小怪 | `3 + Chapter(2位) + Area(1位) + Stage(1位) + BossIndex(1位)`，BossIndex 从 `0` 开始 |
| `400000~599999` | 世界狩猎玩法怪物 | 需要复用主线怪物数据时，区域直接映射主线怪物 ID 首位 `+2` |

世界狩猎小怪若需要按区域固定等级，不能让同一个 `EnemyId` 被多个区域共用，否则固定等级会串用。当前固定等级副本使用 `49 + 区域序号(2位) + 区域内序号(2位)` 段，例如 `490101` 表示世界狩猎固定等级小怪第 1 个区域的第 1 个副本；副本行备注必须记录源怪 ID，`ResId / EnemyAI / Name / CareerType / RareType` 继承源怪，`PlayType` 改为狩猎小怪房，等级类型改固定。

世界狩猎 Boss 若已经使用独立 `50xxxx` 玩法怪物 ID，且该 `EnemyId` 只被一个固定等级区域使用，固定等级时直接修改该行 `Level.Type / Level.MinData / Level.MaxData`；不要额外新开 Boss 固定副本 ID。只有同一 Boss `EnemyId` 被多个不同固定等级区域复用时，才需要重新拆世界狩猎独立 Boss 行并记录源怪 ID。

主线 boss 示例：`301122` = 第 1 章第 1 区域第 2 关第 3 个 boss。

> `200000~299999` 的 `+100` 是角色美术风格段，不是简单模型编号递增；同一 `100` 段内连续 ID 优先理解为同角色美术风格下的换皮变体。

## MonsterResID（6 位）

`Enemy.ResId` 优先视为怪物外观资源层的 `MonsterResID`，表达“哪个模型 + 哪个换皮”，不是 `EnemyId`。

格式：`ModelCode(3位) + SkinCode(3位)`

| ModelCode 区间 | 含义 | 说明 |
|----|----|----|
| `000` | 特殊怪物块 | 预留给宝箱怪等特殊怪物，支持 `0~999` |
| `001~199` | 通用小怪块 | 普通小怪模型 |
| `200~399` | 普通 boss 块 | 有独立 boss 模型和动作的 boss；boss 召唤物如果是普通小怪，应放入通用小怪块 |
| `400~499` | 章节 / 魂装 boss 块 | 通常是有明确唯一性的非通用 boss |
| `500~999` | 保留块 | 暂无明确用途，不能轻易占用 |

表格按数字存储时前导零可能消失，例如概念 ID `000001` 可能显示为 `1`。拼怪物 `SkillID` 前必须补回 6 位。

资源链路：

```text
Enemy.ResId -> MonsterResID -> MonsterModelID / 模型资源配置
```

`MonsterModelID` 是资源模型层索引，不直接用于拼怪物 `SkillID`。

## SkillID（11 位）

前缀 2 位：10/11 怪物 | 21 骑士 | 22 巫师 | 23 猎人 | 31 圣物 | 32 词缀

### 怪物 SkillID / SkillDirectorID

怪物技能 ID 当前为 11 位：

```text
MonsterSkillID = 10 + MonsterResID(6位补零) + SkillType(1位) + SkillSeq(2位)
```

| 片段 | 位数 | 规则 | 说明 |
|----|----|----|----|
| `10` | 2 | 固定系统码 | 怪物系统当前使用 `10` |
| `MonsterResID` | 6 | 怪物 Res 规则 | 必须补零到 6 位 |
| `SkillType` | 1 | 技能类型 | `1` 普攻 / `2` 技能 / `3` 大招 / `4` 被动 |
| `SkillSeq` | 2 | 同类型内递增 | 从 `00` 开始，同 ResID + 同 SkillType 下不重复 |

怪物新配置以 `10` 系统码为准；如果旧表存在短 ID、临时 ID 或非 `10` 前缀，应作为历史配置或特殊配置单独列入例外清单，不反向改变新规则。

最后 3 位可按技能段理解：

| 范围 | 含义 |
|----|----|
| `100~199` | 普攻 |
| `200~299` | 技能 |
| `300~399` | 大招 |
| `400~499` | 被动 |

怪物侧当前规则：

```text
Skill.SkillID == Skill.SkillDirectorID == SkillDirector.SkillDirectorID
```

新增怪物技能时，先定 `MonsterResID`，再生成 11 位 `SkillID`，`SkillDirectorID` 同值；不要先随意写 `SkillDirectorID` 再反向凑 `SkillID`。

示例：
- `MonsterResID=001001`，普攻第 0 个：`10 + 001001 + 1 + 00 = 10001001100`
- `MonsterResID=204003`，技能第 5 个：`10 + 204003 + 2 + 05 = 10204003205`

> `Skill` 表包含其他系统技能。批量筛怪物技能时，先用 11 位、前缀 `10`、可还原 `MonsterResID` 的规则过滤，再结合是否被怪物引用判断。

### 怪物 TriggerID（12 位）

怪物 Trigger ID 当前为 12 位：

```text
TriggerID = SkillDirectorID(11位) + TriggerOrder(1位)
```

`TriggerOrder` 从 `0` 开始，按 `SkillDirector.LogicalTrigger` 中出现顺序递增；当前只保留 1 位，因此自然容量为 `0~9`。超过 10 个序号时，不能擅自扩成 13 位，必须先确认新规范。

示例：
- `SkillDirectorID=10204003100`
- 第 0 个 Trigger：`102040031000`
- 第 1 个 Trigger：`102040031001`

> Trigger 的查找和判重必须结合 `LogicalTrigger.Type`，详见 `配表参考/系统/战斗_Trigger类型.md`。

### 骑士 SkillID

格式：`21` + `A` + `B` + `C` + `D` + `EEEEE`

| 位 | 含义 | 取值 |
|----|------|------|
| A | 线路 | 1 基础 / 2 核心（历史设计称“怒气”） / 3 职业 / 4 爆发 |
| B | 系别 | 1 武器 / 2 狂暴 / 3 防护 |
| C | 变体 | 0 基础 / 1-3 铭文阶段 |
| D | 阶 | 0 基础 / 1-4 铭文阶段 |
| EEEEE | 序号 | 5 位，各线路范围内唯一 |

### 铭文 InscriptionBuildID

`battle/Skill.xlsx#Inscription.InscriptionBuildID` 当前为 4 位：

| 位 | 含义 | 取值 |
|----|------|------|
| 第 1 位 | 技能 BD 类型 | 1 基础 / 2 核心（历史设计称“怒气”） / 3 职业 / 4 爆发 |
| 第 2 位 | 第几个技能 | 同一 BD 类型下的技能位序号 |
| 第 3 位 | 第几个铭文 | 同一技能位下的铭文槽位序号 |
| 第 4 位 | 第几个品质 | 1 精良 / 2 稀有 / 3 史诗 / 4 传奇 |

示例：`4214` = 爆发类型、第 2 个技能、第 1 个铭文、传奇品质。

### 圣物 SkillID / RelicID

格式：`31` + `P` + `RRR` + `TTT` + `GG`（11 位）

| 位 | 含义 | 取值 |
|----|------|------|
| P | 部位 | 1 誓印 / 2 战刃 / 3 项圈 / 4 鞭子<br>（旧名映射：誓印=护符、战刃=枷锁；项圈/鞭子未变。2026-04-29 与 `battle/Relic.xlsx` PartType 实际枚举同步） |
| RRR | 序号 | 001-999（每部位容量） |
| TTT | 类型 | 首位：0 等级描述 / 1 火 / 2 冰 / 3 二火 / 4 二冰 / 5 三火 / 6 三冰；后 2 位为子序号 |
| GG | 技能组 | 01-99 |

示例：`31100100101` = 誓印（旧名"护符"）-第 001 件-等级描述 01-技能组 01

### 词缀 SkillID

格式：`32` + `00000` + `AA` + `GG`

| 位 | 含义 | 取值 |
|----|------|------|
| AA | 序号 | 01-30（5 旧 + 25 新） |
| GG | 技能组 | 01-99 |

被动技能范围：词缀 30001-30999、圣物 31001-31999（持续新增，具体数量查 Skill 表）

## MonsterAI.AIId（6 位）

用途：`battle/MonsterAI.xlsx` 的主键；当 `Enemy.EnemyAI.Type=[AI逻辑类型]预攻击随机` 时，`Enemy.EnemyAI.Value` 填本 ID。

格式：`R` + `TT` + `SSS`

| 位 | 含义 | 取值 |
|----|------|------|
| R | 稀有度 | 1 喽啰 / 2 精英 / 3 统领 / 4 首领 |
| TT | 形态 | 00 近战 / 01 远程 / 99 特殊 |
| SSS | 流水号 | 001 起按段递增 |

示例：
- `100001` = 喽啰 / 近战 / 第 001 号
- `101001` = 喽啰 / 远程 / 第 001 号
- `200001` = 精英 / 近战 / 第 001 号
- `300001` = 统领 / 近战 / 第 001 号
- `400001` = 首领 / 近战 / 第 001 号

废除 ID 不删行，在 `MonsterAI` 行备注中标作废，避免 `Enemy.EnemyAI.Value` 引用错位。

## 时装 ID（7 位）

格式：`6TTSSQP`

法师（巫师）独立时装使用职业专用前缀 `605`，格式为 `605SSQP`：SS=资源套装号（03/04），Q=1基础、2进阶，P=1武器、2头部、3胸部、4酒壶。套装003使用 `6050311–6050314` / `6050321–6050324`，套装004使用 `6050411–6050414` / `6050421–6050424`；分别关联 FashionSuitID 3003/3004，HeroResID 3003/3103、3004/3104。下述既有 `6TTSSQP` 投放点规则继续用于原骑士时装，法师 `605` 不按投放点05解释。

| 位 | 含义 | 取值 |
|----|------|------|
| 6 | 时装前缀 | 固定 |
| TT | 投放点 | 00 散件 / 01 装备幻化 / 02 独立套装 |
| SS | 套装序号 | 01-04 |
| Q | 阶级 | 0 无 / 1 基础 / 2 升级 |
| P | 部位 | 1 武器 / 2 头部 / 3 胸部 / 4 酒壶 |

ItemID 映射：`603` + EquipID 后 4 位

## I18N Key 命名规则

| 表 | Key 格式 | 示例 |
|----|---------|------|
| AdornmentClothes | `AdornmentClothes_NameID_{ACID}` | AdornmentClothes_NameID_6020111 |
| Item 名称 | `Item_Name_{ItemID}` | Item_Name_6030101 |
| Item 描述 | `Item_Describe_{ItemID}` | Item_Describe_6030101 |
| FashionSuit | `FashionSuit_NameID_{FashionSuitID}` | FashionSuit_NameID_1001 |
| Skill | `Skill_Name_{SkillID}` / `Skill_Describe_{SkillID}` | Skill_Name_2111010001 |
| Relic | `Relic_LevelDes_{SkillID}` | Relic_LevelDes_3101010111 |
| Affix | `Affix_Name_{AffixID}` / `Affix_Describe_{AffixID}` | Affix_Name_6 |
| Inscription | `Inscription_Name_{N}` / `Inscription_Des1_{N}` | Inscription_Name_1 |

## ID 分配查询

当前最大 ID 以目标源表现有最大值和最新 ID 分配记录为准。

产出前先查分配表确认当前最大 ID，避免重复。
