# 战斗 · MonsterAI 表

> 用途：配怪物 AI 行为时直接读这一份。字段定义、参数与运行行为的对应、关联表入口、ID 编码规则，全部在这里。
> 完整 AI 运行逻辑（仇恨详细推导、行为包生成、执行流程、主角 AI 优先级）见飞书 AI 系统原文 `https://www.feishu.cn/docx/B1H1d7X0Fo0clax59r9cwaM4nRb`，本文不重抄。
> 数据源：当前正式源表为 `develop/battle/MonsterAI.xlsx`（25 列）。历史同名目录已删除，不作为参考入口。

---

## 1. 一句话定位

`MonsterAI` 是怪物 AI 行为参数表。每行 = 一套完整的 AI 配置（行为权重 / 行为包大小 / 走位偏好 / 仇恨系数 / 检测频率 / 踱步范围 / 预攻击触发器形状）。`AIId` 为主键；`Enemy.EnemyAI.Type=预攻击随机` 时由 `Enemy.EnemyAI.Value` 引用 `AIId` 决定怪物的行为参数。

---

## 2. 配表视角的最小链路

按奥卡姆剃刀处理：配怪物 AI 时先看最短链路，只有现有表无法表达时才考虑新字段或新规则。

```
Enemy
  ├─ EnemyAI.Type 选择 AI 逻辑类型
  ├─ EnemyAI.Value 在 Type=预攻击随机时引用 MonsterAI.AIId
  ├─ 普攻 / 技能配置决定怪物实际释放哪些 SkillID
  └─ ResId / PlayType / RareType / Attribute / Affix 决定资源、玩法、属性和词缀

MonsterAI
  ├─ 决定行为包怎么抽：普攻 / 技能 / 待机
  ├─ 决定行为包有多长、待机多久、怎么走位
  ├─ 决定仇恨与检测频率的行级覆盖值
  └─ 决定预攻击范围 / 踱步范围的形状和尺寸

Skill → SkillDirector → Trigger → Event / Condition / Effect
  └─ AI 不直接配置这一层；AI 只输出释放 SkillID 的指令
```

配表判断顺序：

1. 先看 `Enemy.EnemyAI.Type`：不是 `[AI逻辑类型]预攻击随机` 时，不要强行套 `MonsterAI`。
2. 再看 `Enemy.EnemyAI.Value`：当 Type=预攻击随机时，Value 必须填可用的 `MonsterAI.AIId`。
3. 再看怪物自己的普攻 / 技能配置：`MonsterAI` 只决定"抽到普攻/技能/待机的概率和节奏"，不决定具体 Skill 效果。
4. 最后才看 `SkillDirector` / ECE 链路：除非需求明确要改技能表现或效果，否则不要把 Trigger/Event/Effect 问题写进 `MonsterAI`。

CD、命中失败、动作中断这类运行时分支不要在 `MonsterAI` 里硬补字段。它们属于技能执行 / 战斗框架逻辑；配表层最多调整行为权重、行为包长度、技能 CD 或怪物技能挂载，不能假设加一个 AI 字段就能改掉执行语义。

---

## 3. 关键决策规则（来自飞书《【FF】AI系统》§六 AI 系统调整）

1. **AI 行为不再运行时按稀有度/玩法/强度计算**。原本"稀有度模板 × 玩法危险系数 × 待机血量动态修正"的运行时归一化算法已废弃，所有 AI 参数行级直接读 MonsterAI 表，配表人为每个怪配一行 `AIId`，权重和参数全部展开写在行级。
2. **除仇恨外，所有 AI 参数指向本表**。仇恨参数（伤害/治疗/距离系数）和检测玩家频率参数仍保留在 `constant/Const.xlsx#ConstComm` 作为兜底默认值；本表的 `HateCoef` / `DetectFrequency` 是行级覆盖，配置即生效。
3. **`PacingSpeed = 0` 表示怪物固定不动**。待机踱步关闭，怪物在原地等待行为切换。

---

## 4. 字段表（25 列）

字段名以当前正式 `battle/MonsterAI.xlsx` 实际入库为准。"业务说明"列写参数→运行行为的映射，不展开运行逻辑全文。

| 字段 | 类型 / 取值 | 含义 | 业务说明 |
|---|---|---|---|
| `AIId` | int，6 位编码 | AI 编号，主键 | 必填、唯一；废除 ID 不删行，在注释里标作废；编码规则见 §5 |
| `AIName` | 字符串（可空） | 备注 | 策划内部使用，不上线，仅供配表识别 |
| `BehaviorWeights` | 字符串 `"普攻权重;技能权重;待机权重"`，三段万分比 | 行为权重 | 行为包按本权重对【普攻 / 技能 / 待机】抽签 `BehaviorCount` 次得到本轮行为序列。样本 `6000;2500;2500` 即普攻偏重，技能/待机各占小头 |
| `BattleStartSkillCD` | int，毫秒 | 开场技能 CD 锁 | 开场禁止 Boss 释放技能的时间控制，空则不额外锁 |
| `SkillGroupCD` | int，毫秒 | 技能组公 CD | 使用技能后多久才能使用另一个技能（不含普攻），优先级高于技能自身 CD |
| `PityTime` | 分号列表，毫秒 | 技能保底 CD | 多技能保底时间，低于公 CD 会导致重复释放风险 |
| `HpUnlockSkill#1.SkillIndex` / `#2` / `#3` | int | 血线解锁技能序号 | 达到血线后解锁第几个技能；序号语义按源表表头与技能顺序确认 |
| `HpUnlockSkill#1.HpPecent` / `#2` / `#3` | int，万分比 | 血线触发百分比 | 每组血线只触发一次 |
| `HpUnlockSkill#1.UnlockCount` / `#2` / `#3` | int | 血线解锁使用次数 | 触发血线解锁技能时增加的使用次数 |
| `BehaviorCount` | int，1~6 | 行为包大小 | 一个行为包内的动作数量；越小反应越快、越像精英；用完重新抽包 |
| `IdleTime` | int，毫秒 | 基础待机时间 | 待机状态计时器初始值；样本 2000（2 秒） |
| `IdleTimeLimit` | int，万分比 | 待机极限参数 | 待机行为概率上限；运行时待机概率不会超过此值。对应飞书旧版"稀有度模板"中的极限参数（喽啰 50%、精英/统领 34%、首领 50%），现已下沉到行级；样本 3400 即 34% |
| `QuadrantWeights` | 字符串 `"1象限;2象限;3象限;4象限"`，四段权重 | 四象限走位权重 | 走位决策按本权重抽象限，决定相对目标的位移方向。第 1 象限 = 自身位置（取踱步移动），其余象限随机选踱步/正常移动。样本 `20;15;15;50` 表示偏好走到对侧（4 象限） |
| `DetectFrequency` | int，毫秒 | 目标检测频率 | 索敌与目标位置轮询周期；行级覆盖 `ConstComm` 默认值；样本 3000（3 秒一次） |
| `HateCoef` | 字符串 `"伤害系数;治疗系数;距离系数"`，三段万分比 | 仇恨系数 | 仇恨公式三系数：`仇恨值 = 对自身的伤害×伤害系数 + 对关联战斗事件的治疗×治疗系数 − 释放距离×距离系数`。行级覆盖 `ConstComm` 默认值；样本 `1000;200;300` |
| `PacingSpeed` | int，万分比（基于本怪物 `MoveSpeed`） | 踱步移动速度 | 待机踱步状态下的移动速度。**取 0 时怪物固定不动**（PacingSpeed=0 是飞书第六章新增的固定语义）；样本 2500 = 25% 移速 |
| `PreAttackTriggerShape` | 字符串枚举 `[触发器形状类型]矩形 / 圆形 / 椭圆 / ...` | 预攻击触发器形状 | 怪物攻击范围的形状；同时也是踱步范围形状（共用一份配置），由 `SkillDirector` 在预攻击阶段读取 |
| `PreAttackTriggerData#1` | int | 触发器数据 1 | 圆 = 半径；矩形 = 宽；椭圆 = 长轴；样本 300 |
| `PreAttackTriggerData#2` | int | 触发器数据 2 | 圆 = 空（仅 #1 即足）；矩形 = 高；椭圆 = 短轴；样本 130 |

---

## 5. AIId 6 位编码

```
位 1   = 稀有度       1=喽啰  2=精英  3=统领  4=首领
位 2-3 = 形态         00=近战 01=远程 99=特殊
位 4-6 = 流水号       001 起按段递增
```

示例：
- `100001` = 喽啰 / 近战 / 第 001 号
- `101001` = 喽啰 / 远程 / 第 001 号
- `200001` = 精英 / 近战 / 第 001 号
- `300001` = 统领 / 近战 / 第 001 号
- `400001` = 首领 / 近战 / 第 001 号

废除 ID 不删行，在该行注释里标作废，避免 `Enemy.EnemyAI.Value` 引用错位。

> 注：AIId 编码已同步到 `配表参考/约定/ID编码规范.md`，本节保留为 MonsterAI 配表时的就近速查。

---

## 6. 关联表入口

### 6.1 上游：`battle/Enemy.xlsx`

`Enemy.EnemyAI.Type` 为 AI 逻辑类型枚举；当前正式表链从 `battle/Enemy.xlsx` 读取，三种取值：

| Type 取值 | 含义 | EnemyAI.Value 填什么 |
|---|---|---|
| `[AI逻辑类型]预攻击随机` | 标准 AI 行为（行为包 / 行为队列 / 走位执行） | 填 `MonsterAI.AIId` 索引到本表行 |
| `[AI逻辑类型]固定序列` | 按预定义动作序列循环执行 | 由具体玩法实现侧定义 |
| `[AI逻辑类型]矿工逃跑` | 矿工类怪物的逃跑行为 | 由具体实现定义 |

新配怪物 AI 流程：先在本表写一行 `AIId` + 当前 24 个参数字段 → 再到 `Enemy` 对应怪物行设 `EnemyAI.Type=预攻击随机` 并把 `EnemyAI.Value` 填刚写的 `AIId`。

### 6.2 旁路：`constant/Const.xlsx#ConstComm`

仇恨参数（伤害/治疗/距离系数）和目标检测频率参数仍配在 `ConstComm`，作为兜底默认值。本表的 `HateCoef` / `DetectFrequency` 行级写明则按行级生效。

### 6.3 下游：`battle/SkillDirector.xlsx`

`PreAttackTriggerShape` + `PreAttackTriggerData#1/#2` 由 `SkillDirector` 在预攻击阶段读取，决定怪物攻击范围/踱步范围的几何形状与尺寸。

---

## 7. 新增字段 / 改规则前自检

如果想把新的怪物战斗规则塞进 `MonsterAI`，先过这 5 条：

| 问题 | 结论 |
|---|---|
| 这个规则是不是只影响具体技能伤害、Buff、Trigger、动作表现？ | 是 → 去 `Skill` / `SkillDirector` / ECE，不进 `MonsterAI` |
| 这个规则是不是某只怪独有的技能选择或固定序列？ | 是 → 先看 `Enemy.EnemyAI.Type/Value` 或怪物技能挂载，不扩 `MonsterAI` |
| 这个规则是不是多个怪共享的行为节奏、走位、仇恨、检测、预攻击范围？ | 是 → 才考虑放进 `MonsterAI` |
| 能不能用现有 25 列表达？ | 能 → 复用现有字段，不造新列 |
| 新增字段后是否会让同一件事在 `Enemy`、`MonsterAI`、`SkillDirector` 三处都能配？ | 会 → 停，先收敛职责边界 |

一句话：`MonsterAI` 只管"怪物打算怎么行动"，不管"技能命中后发生什么"。

---

## 8. 出处

- **设计文档（完整运行逻辑权威）**：飞书 AI 系统原文 `https://www.feishu.cn/docx/B1H1d7X0Fo0clax59r9cwaM4nRb`
- **飞书源**：`https://forever9.feishu.cn/docx/B1H1d7X0Fo0clax59r9cwaM4nRb`（《【FF】AI系统》），第六章"AI 系统调整"为最新口径
- **配表参考**：本文和 `配表参考/系统/战斗_总览.md`
- **历史决策记录**：V1~V6 字段收敛过程已沉淀到本文字段表和规则说明中。

---

## 9. 入口指针

| 我要... | 第一份读 |
|---|---|
| 配新怪物 AI 行为 | 本文 §2 最小链路 + §4 字段表 + §5 编码 + §6.1 Enemy 关联 |
| 判断一条怪物战斗规则该不该进 MonsterAI | 本文 §2 最小链路 + §7 新增字段 / 改规则前自检 |
| 改仇恨/检测频率默认值 | `constant/Const.xlsx#ConstComm`（行级覆盖才动本表） |
| 看完整 AI 运行逻辑（仇恨公式推导、行为包生成、执行流程、主角 AI） | 飞书 AI 系统原文 `https://www.feishu.cn/docx/B1H1d7X0Fo0clax59r9cwaM4nRb` |
| 在战斗系统总览里找 AI 入口 | `配表参考/系统/战斗_总览.md` §2.2 |
