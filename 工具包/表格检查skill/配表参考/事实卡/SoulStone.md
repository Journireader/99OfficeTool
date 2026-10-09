# 事实卡：SoulStone

## 0. 元信息

- 源 Excel：`develop/develop/SoulStone.xlsx`
- 需求证据：[【FF】魂石-炼魂](https://forever9.feishu.cn/docx/NUtNdYp2To9SRrxqTAAcW4IHnzh)
- 最近验证：2026-08-21 / SVN r5020 / 13 个 sheet、client proto / battle-core 与 server 只读检索
- 状态：既有魂石链已接入；新增职业列和技能参数缩放结构存在协议缺口，必须区分“已生效”与“程序前置”
- 第一参考：`系统/养成数值.md`、`事实卡/Skill_Inscription.md`、`事实卡/Item_Random_Reward.md`

## 1. 表事实

| sheet | 表角色 | 主键 / 分组 | 关键语义 |
|---|---|---|---|
| `SoulStone` | 魂石模板 | `StoneID` | 职业、套装、星级、品质、部位、主 / 副词条范围 |
| `StoneSet` | 套装 | `SetID` 多星级行 | 职业、套装星级、名称、图片、部位和穿戴数量效果 Skill / 属性 |
| `StoneSetSkillParamScale` | 套装技能参数缩放 | `SetID + ProfessionType + WearingNum` | 指定 Effect / Param 槽位与衰减保底；当前程序前置 |
| `StoneSkillEffectDecay` | 等级衰减档 | `GradeID` | `StartLevel` 后每级扣除万分比；client battle-core 已消费 |
| `StoneReinforce` | 强化 | `ReinforceID` | 星级 × 等级属性与单级消耗 |
| `StoneRecast` / `StoneRecastExpend` | 重铸次数 / 消耗 | 星级 / 强化次数 | 可重铸条数与按次数递增消耗 |
| `StoneRefineCond` / `StoneRefineExpend` / `AttrRefine` | 炼魂 | 星级 / 属性类型 | 同套装同部位、星级强化条件、消耗与属性范围 |
| `StoneBreak` | 突破 | `BreakID` | 星级 × 等级突破消耗 |
| `StoneBookTask` / `StoneBookLevel` | 图鉴任务 / 等级 | 任务 ID / Level | 套装任务、奖励和图鉴属性 |

## 2. 运行链

```text
SoulStone.StoneID
  -> StoneSet.SetID
  -> StoneReinforce / StoneBreak
  -> StoneRecast / StoneRefine / AttrRefine
  -> StoneBookTask / StoneBookLevel
  -> Skill / Attribute / Item / Picture / I18N
```

当前 workbook 共 13 个 sheet。client proto 与 battle-core 已定义并消费 `StoneSkillEffectDecay`，以 `StoneSet.Version -> GradeID` 选衰减档；当前只缩放套装 `Wearing.Attrs`。独立 proto 工作副本与 server 生成链仍落后于部分 client 定义，发布前必须统一协议源。

## 3. 稳定口径与禁止推断

- `StoneSet.Wearing#N.Effect` 是套装效果 SkillID，必须反查 `battle/Skill.xlsx`；`Wearing#N.Desc` 是玩家描述入口。
- `SoulStone.ProfessionType`、`StoneSet.ProfessionType/Star/SetDesc/Wearing#2.Attrs` 已存在于 Excel，但当前 proto 定义不完整；未补程序前不得写成职业隔离或新增属性已生效。
- `StoneSetSkillParamScale` 已按“套装 + 职业 + 穿戴件数”收敛为单个技能效果参数位；当前未见 proto / 消费者，属于程序前置，不得与已接入的 `StoneSkillEffectDecay` 混为一张表。
- `StoneSkillEffectDecay.PerLevel` 配正整数万分比，`100` 表示每级扣 1%；`StartLevel` 当级不扣，下一等级开始扣，结果受对应属性/参数保底约束。
- `StoneReinforce` 配的是单级消耗：默认 0 级，升到 L 级累计消耗为 `1..L` 各级之和。
- `SoulStone.AdvancedAttr#N` 与 `AttrRefine` 都是属性范围，属性类型必须命中 `role/Attribute.xlsx`；不要用中文备注代替枚举事实。
- `StoneBookTask.TaskItemConfig.Loot#1` 当前字段只含 `PropType / Value`，不要自行补推 `PropID`；按运行协议和任务类型解释。
- 改 `StoneID` / `SetID` 时必须反查玩家实例、四部位穿戴方案、图鉴、奖励投放和客户端缓存。

## 4. 验收清单

- 13 个 sheet 均存在；其中 `StoneSkillEffectDecay`、`StoneSetSkillParamScale` 为 r4822 后新增结构。
- `StoneID -> SetID -> Skill / Attribute / Item / Picture / I18N` 引用闭合，且职业列与当前协议支持状态一致。
- 强化、突破、重铸、炼魂消耗的数组三元组完整。
- 图鉴任务和等级属性可读回；涉及职业切换时验证旧职业缓存清理和重新拉取。
- `StoneSkillEffectDecay` 的 GradeID、起始等级、逐级扣减和保底边界样例通过；`StoneSetSkillParamScale` 未接程序时明确阻塞正式生效结论。
