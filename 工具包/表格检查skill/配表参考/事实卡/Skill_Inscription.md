# 事实卡：Skill / SkillDirector / Inscription

## 0. 元信息

- 源 Excel：`develop/battle/Skill.xlsx`、`develop/battle/SkillDirector.xlsx`
- 最近验证：2026-08-21 / SVN r5020 / Skill、Inscription、Buff、Probability 与 client battle-core 只读核对
- 状态：已验证导航；Effect / Event / Condition 参数位以飞书战斗字典和战斗索引解释为准
- 第一参考：`系统/战斗_总览.md`、`系统/战斗_ECE管线.md`、`系统/战斗_Trigger类型.md`

## 1. 表事实

| 项 | 内容 |
|---|---|
| Skill | 战斗技能主载体，含主动 / 被动 / 变体 |
| SkillDirector | 动作层和 Trigger 编排 |
| Inscription | `Skill.xlsx` 内铭文相关 sheet，铭文通过 SkillID 挂技能变体；属性 / 随机链另见 `事实卡/Inscription_Attribute_Random.md` |
| I18N | 基础 Skill、铭文、Buff、圣物、词缀展示归属不同 |
| 深语义 | `TypeData`、`EventData`、`ConditionParams` 需要按字典解释 |
| Probability | `battle/Probability.xlsx#Probability` 为 Skill / Buff 共用概率常量；`ProbabilityID -> Probability`，既可固定判定也可作累积概率入口 |

## 2. 字段语义

| 字段 | 语义 | 易误判 |
|---|---|---|
| `SkillID` | Skill 主键 | 不从 ID 外观直接反推完整机制 |
| `SkillDirectorID` | 主动技能动作链 | 被动通常不需要 Director |
| `CastEventID` | Skill 行级 Event | 不是描述文字 |
| `Effects#N.TypeID` | Effect 类型 | 参数位不能照搬相邻行 |
| `Effects#N.TypeData` | Effect 参数 | 必须按具体 TypeID 分流 |
| `Effects#N.ConditionID` | 效果条件 | `BC_*` 走 BattleCondition |
| `LogicalTrigger#N.SkillEffects` | 触发的效果序号 | 顺序按源表原始顺序，不自动升序 |
| `Inscription.PrimaryProfession#N.SkillID` | 铭文挂接技能变体 | 变体 Skill 才接 ECE |
| `Inscription.PrimaryProfession#N.WearAttr#M.Type/Data` | 铭文穿戴时直接生效的属性；当前源表已在职业 2 展开第 1 组 | 不是技能效果参数；只汇总当前 `IsUsing` 铭文，属性类型仍需命中 `role/Attribute.xlsx` |

## 3. 跨表引用

| 源字段 | 关系类型 | 目标表 / 字段 | 新增时动作 | 修改 / 删除时反查 |
|---|---|---|---|---|
| `Skill.SkillDirectorID` | 强外键 | `SkillDirector.SkillDirectorID` | 补 Director 和 Trigger | 查 Trigger 子表和效果序号 |
| `Skill.CastEventID` | 战斗事件 | `BattleEvent.ID` | 选择已定义 Event 或补实例 | 查事件参数 |
| `Skill.Effects#N.ConditionID` | 战斗条件 | `BattleCondition.ConditionID` | 选择已定义 Condition 或补实例 | 查条件参数 |
| `Skill.Effects#N.TypeID` | 字典分流 | 飞书 Effect 字典 / 代码实现 | 查参数位 | 参数位未确认时阻塞 |
| `Inscription.PrimaryProfession#N.SkillID` | 强外键 | `Skill.SkillID` | 补变体 Skill | 查 I18N、描述、进阶、共鸣 |
| `Inscription.PrimaryProfession#N.WearAttr#M.Type` | 属性枚举 | `role/Attribute.AttributeID` | 补类型与数值 | 查当前职业、启用状态和角色属性缓存 |
| `InscriptionAdvanced.Attr#1.Type` / `InscriptionResonance.ResonanceAttr#N.Type` | 属性枚举 | `role/Attribute.AttributeID` | 查属性展示和数据类型 | 详见 `事实卡/Inscription_Attribute_Random.md` |
| `Skill.Name` / `Describe` | I18N 文案 | `I18N#Skill` | 基础版补文案 | 铭文变体不要混 |
| `Skill.CastChanceID`、`Skill.Effects#N.ChanceID`、`Buff.Effects#N.ChanceID` | 共享常量引用 | `Probability.ProbabilityID` | 优先复用已有 ID | 修改 / 删除时反查 Skill 与 Buff 全部引用 |

## 4. 玩家可见文案

| 场景 | 主表字段 | I18N sheet | 禁止事项 |
|---|---|---|---|
| 基础 Skill | `Skill.Name` / `Describe` | `I18N#Skill` | 不把内部技能名当玩家文案 |
| 铭文 | `Inscription.Name` / `Describe` | `I18N#Inscription` | 不把四阶描述混写 |
| Buff | `Buff.Name` / `Describe` | `I18N#Buff` | 不把 Buff 备注当事实 |
| 圣物 / 词缀 | 对应主表字段 | `I18N#Relic` / `I18N#Affix` | 不落到 `I18N#Skill` |

## 5. 反向影响

| 改动类型 | 必查反向引用 | 必补支撑 | 阻塞 / 需确认 |
|---|---|---|---|
| 新增 Skill | Inscription / Relic / Affix / Enemy / Director | BattleEvent / BattleCondition / I18N | Effect 参数位未知时阻塞 |
| 改 Director | Skill、Trigger 子表 | TriggerID、SkillEffects | 空效果槽或顺序不明时阻塞 |
| 改 Inscription SkillID | Skill、I18N、进阶、共鸣、描述 | 变体 Skill 和文案 | 品质链不完整时阻塞 |
| 改 Inscription WearAttr | 当前启用铭文、职业分支、角色总属性 | Attribute | proto 未同步或 Type/Data 不成对时阻塞 |
| 改 TypeData | Buff / Skill / Condition / 参数对象 | 字典解释 | 未逐参数确认时阻塞 |

## 6. 验收清单

- `Skill -> SkillDirector -> Trigger -> Effects` 可打印完整链条。
- `SkillEffects` 按源表原始顺序解释。
- `EventID` / `ConditionID` 命中实例表或明确写需新增。
- `TypeID` / `TypeData` 已按字典逐参数解释。
- 铭文四阶名称 / 描述 / SkillID 链完整。
- `WearAttr.Type/Data` 成对、属性枚举有效，并验证未启用铭文不计入总属性。
- I18N 展示归属正确。
- Skill / Buff 的所有 `ChanceID` 能命中 `Probability.ProbabilityID`；不要把概率常量复制进 Skill / Buff 参数位，也不要把固定 / 累积概率语义只凭数值猜定。
