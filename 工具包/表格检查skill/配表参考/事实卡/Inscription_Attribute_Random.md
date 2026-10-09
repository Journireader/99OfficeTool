# 事实卡：Inscription Attribute / Random

## 0. 元信息

- 源 Excel：`develop/battle/Skill.xlsx`、`develop/random/InscriptionRamdom.xlsx`、`develop/role/Attribute.xlsx`、`develop/system/I18N.xlsx`、`develop/system/Item.xlsx`
- 最近验证：2026-06-07 / SVN r3899 / 只读字段卡与抽样反查
- 状态：已验证导航；铭文技能深链仍以 `事实卡/Skill_Inscription.md` 和战斗索引解释
- 第一参考：`事实卡/Skill_Inscription.md`、`系统/战斗_总览.md`

## 1. 表事实

| 项 | 内容 |
|---|---|
| `Skill.xlsx#Inscription` | 铭文本体；按 `InscriptionBuildID` 组织品质、槽位、职业展示、SkillID 和 ComboSkillID |
| `Skill.xlsx#KnightInscriptionDevelop` | 骑士铭文升级属性；`SkillLvAttr#N.*` 为属性增益 |
| `Skill.xlsx#WizardInscriptionDevelop` | 巫师铭文升级属性；字段结构与骑士类似但数值 / 属性类型可不同 |
| `Skill.xlsx#InscriptionAdvanced` | 铭文进阶属性；按 BuildType + SlotType 配置每阶属性增量 |
| `Skill.xlsx#InscriptionAdvancedNeed` | 铭文进阶消耗 / 门槛 |
| `Skill.xlsx#InscriptionResonance` | 铭文共鸣；按槽位总类型配置共鸣属性和消耗 |
| `Skill.xlsx#InscriptionTotolDraw` | 铭文累计抽取奖励 / 目标 |
| `InscriptionRamdom.xlsx#InscriptionDrawRule` | 铭文抽取规则；消耗与基础 / 保底品质随机池入口 |
| `InscriptionRamdom.xlsx#InscriptionQualityRandom` | 铭文品质随机；同 RandomID 多行组成一组 |
| `role/Attribute.xlsx#Attribute` | 铭文属性枚举、展示、数据类型和战力系数事实源 |

## 2. 字段语义

| 字段 | 语义 | 引用 / 格式 | 易误判 |
|---|---|---|---|
| `Inscription.InscriptionBuildID` | 铭文构筑 ID | 第 1 位基础/核心/职业/爆发，第 2 位技能位，第 3 位槽位，第 4 位品质 | 不等于 SkillID |
| `Inscription.BuildType` | 技能 BD / 槽位类型 | `[技能槽位]...` | 和 SkillID 编码不是同一层 |
| `Inscription.SlotType` | 铭文位置 | `[铭文槽位]...` | 空表示无需外显 |
| `Inscription.QualityType` | 铭文品质 | `[物品品质]精良/稀有/史诗/传奇` | 和抽卡品质随机对齐 |
| `Inscription.JumpID` | 获取途径 | `system/Jump.xlsx#Jump` | 空表示不显示获取按钮 |
| `Inscription.PrimaryProfession#N.Name` | 铭文名称 key | `I18N#Inscription` | 字段存 key，不是正文 |
| `Inscription.PrimaryProfession#N.Describe` | 铭文描述 key | `I18N#Inscription`，支持富文本 | 四品质描述不要混写 |
| `Inscription.PrimaryProfession#N.SkillID` | 铭文挂接技能 | `Skill.xlsx#Skill.SkillID`，分号数组 | 变体 Skill 才进入战斗 ECE |
| `Inscription.PrimaryProfession#N.ComboSkillID` | 连招技能数组 | `Skill.xlsx#Skill.SkillID`，分号数组 | 不等于单个主动技能 |
| `Knight/WizardInscriptionDevelop.SkillLvAttr#N.Type` | 升级属性类型 | `role/Attribute.xlsx#Attribute` | 骑士 / 巫师不能盲复制 |
| `InscriptionAdvanced.Attr#1.Type` | 进阶属性类型 | `role/Attribute.xlsx#Attribute` | `Attr#1.Data` 是每进阶 1 次增加值 |
| `InscriptionResonance.ResonanceAttr#N.Type` | 共鸣属性类型 | `role/Attribute.xlsx#Attribute` | 属性和消耗在同一 sheet，不要漏消耗 |
| `InscriptionDrawRule.BaseRandomID` | 基础品质随机入口 | `InscriptionQualityRandom.RandomID` | 同 ID 多行组成随机组 |
| `Rare/Epic/LegendPityRandomID` | 保底品质随机入口 | `InscriptionQualityRandom.RandomID` | 不同保底段不要共用误读 |
| `InscriptionQualityRandom.Weight` | 品质权重 | 整数；字段说明为同组权重合计 10000 | 不表示概率百分号 |

## 3. 跨表引用

| 源字段 | 关系类型 | 目标表 / 字段 | 新增时动作 | 修改 / 删除时反查 |
|---|---|---|---|---|
| `Inscription.PrimaryProfession#N.SkillID` | 强外键 | `Skill.SkillID` | 补铭文变体 Skill | 查 Director / Trigger / Buff / I18N |
| `Inscription.PrimaryProfession#N.ComboSkillID` | 强外键数组 | `Skill.SkillID` | 补连招技能链 | 查分号列表每项 |
| `Inscription.PrimaryProfession#N.Name/Describe` | I18N 文案 | `I18N#Inscription.Key` | 补名称 / 描述 | 查四品质描述完整性 |
| `Inscription.JumpID` | 获取入口 | `Jump.JumpID` | 补或确认获取跳转 | 查入口与系统开放 |
| `SkillLvAttr#N.Type` / `Attr#1.Type` / `ResonanceAttr#N.Type` | 属性枚举 | `role/Attribute.AttributeID` | 确认 DataType / I18N / 战力系数 | 查同属性全部铭文成长 |
| `InscriptionDrawRule.Cost#N.*` | 消耗三元组 | `Item` / `Resource` 上下文分流 | 补消耗物品或资源 | 查商店 / 背包 / 获取途径 |
| `BaseRandomID` / `*PityRandomID` | 随机池 | `InscriptionQualityRandom.RandomID` | 补同组品质权重行 | 查抽卡规则和保底段 |

## 4. 反向影响

| 改动类型 | 必查反向引用 | 必补支撑 | 阻塞 / 需确认 |
|---|---|---|---|
| 新增铭文 | Skill、I18N#Inscription、Jump、随机池 | 变体 Skill / 文案 / 图标 | Skill 链不闭合时阻塞 |
| 改升级属性 | `role/Attribute`、骑士 / 巫师对应 sheet | 属性显示 / 战力系数 | 未确认属性枚举时阻塞 |
| 改进阶属性 | InscriptionAdvancedNeed、Attribute | 进阶消耗 / 展示说明 | 增量含义不明时阻塞 |
| 改共鸣属性 | InscriptionResonance 消耗、Attribute | Item / Resource 消耗 | 属性和消耗漏一侧时阻塞 |
| 改抽卡权重 | DrawRule、QualityRandom、Item 消耗 | 同 RandomID 多行完整组 | 保底 RandomID 未闭合时阻塞 |

## 5. 常见误判

- `InscriptionRamdom.xlsx` 文件名当前就是 `Ramdom`，不要自动改成 `Random`。
- 铭文属性类型不是战斗 Effect 参数；属性枚举先查 `role/Attribute.xlsx`。
- `InscriptionAdvanced.Attr#1.Data` 是每进阶 1 次增加值，不是最终总值。
- `SkillLvAttr#N.Data` 的百分比 / 整数展示要回 `Attribute.DataType` 判断。
- 铭文描述落 `I18N#Inscription`，不要和 `I18N#Skill` 混。

## 6. 验收清单

- `InscriptionBuildID -> Name / Describe / SkillID / ComboSkillID` 四项读回。
- 所有 SkillID 分号列表逐项命中 `Skill.xlsx#Skill`。
- `SkillLvAttr / Attr / ResonanceAttr` 的 Type 全部命中 `role/Attribute.xlsx#Attribute`。
- `DrawRule -> InscriptionQualityRandom` 的基础和保底 RandomID 同组多行完整。
- 抽卡消耗三元组按 `PropType + PropID + Value` 分流到 Item / Resource。
- I18N#Inscription、Jump、Item 支撑命中或明确不涉及。
- Relation Gate 未闭合项不得写成通过；战斗深链另走 `ff-battle-index`。

## 7. 未决项

| 项 | 状态 | 影响 | 关闭方式 | 未关闭能否回填 |
|---|---|---|---|---|
| 新增铭文变体 Skill 的 ECE 参数 | 需按字典确认 | 影响战斗表现 | `ff-battle-index` + 战斗字典逐参数确认 | 不建议回填 |
