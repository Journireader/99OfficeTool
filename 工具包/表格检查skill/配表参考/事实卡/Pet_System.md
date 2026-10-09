# 事实卡：Pet / PetRamdom / PetDream

## 0. 元信息

- 源 Excel：`develop/develop/Pet.xlsx`、`develop/random/PetRamdom.xlsx`、`develop/dungeon/PetDream.xlsx`
- 需求证据：[【FF】幻灵](https://forever9.feishu.cn/docx/O4j2dZYRyoIo3yxkOKacLSQmnDc)、[【FF】幻灵副本 V2](https://forever9.feishu.cn/docx/MmGPdnjDOohcYRx2ppcc5g4XnLh)
- 最近验证：2026-08-21 / SVN r5020 / 全 sheet、proto 与 client battle-core 只读检索
- 状态：`Pet`、`PetRamdom`、`PetDream` 已有源表、proto 与运行侧接入；`PetDream` 需求文档“配置：无”与当前实现冲突，以现行源表 / proto / code 为已落地事实，需求文档需修正
- 第一参考：`系统/养成数值.md`、`系统/副本.md`、`事实卡/Item_Random_Reward.md`
- 禁止推断：源文件名固定拼作 `PetRamdom.xlsx`，不要自行改成 `PetRandom.xlsx`

## 1. 表事实

| workbook | sheet | 表角色 | 主键 / 分组 | 运行语义 |
|---|---|---|---|---|
| `Pet.xlsx` | `Pet` | 幻灵本体 | `PetID` | 种族、品质、职业、技能组、碎片、完整度与休闲场景 Emote 池入口 |
|  | `PetSkill` | 幻灵技能映射 | `SkillID`；`PetID` 标识归属 | 技能类型、等级、展示与职业 SkillID |
|  | `PetLevel` / `PetAdvanced` / `PetStar` | 等级 / 进阶 / 星级成长 | 品质、等级、星级组合 | 消耗、属性和技能解锁 |
|  | `PetTalent` / `TalentPool` / `EngraveList` | 天赋、天赋属性池、铭刻 | 各自 ID | 天赋分支、随机属性、铭刻条件与表现 |
|  | `PetSkin` | 皮肤 | `PetID + Order` | 资源、品质、消耗和属性 |
|  | `PetBookPoint` / `PetBookReward` / `PetBond` | 图鉴与羁绊 | 类型 / 积分 / 数量 | 图鉴积分奖励和羁绊属性 |
|  | `LevelResetPrice` / `TalentReRandomPrice` | 重置消耗 | 品质 / 锁定数 | 等级重置与天赋重随机价格 |
| `PetRamdom.xlsx` | `PetDrawRule` | 抽卡费用 | `DrawRuleID + QualityType` | 服务端按品质取抽卡消耗 |
|  | `NormalPetDrawWeight` | 普通蛋品质池 | `DrawRuleID` 多行 | 按品质权重抽取 |
|  | `SpecialPetDrawWeight` | 特殊蛋幻灵池 | `DrawRuleID` 多行 | 只在未拥有幻灵中不放回抽取 |
| `PetDream.xlsx` | `c.PetDream` | 幻灵梦境常量 | struct | 挑战次数、挂机与冲刺常量 |
|  | `PetDreamGroup` / `PetDreamStage` | 关组与关卡 | `GroupID` / `StageID` | 关组宝箱、场景、Boss 与单关奖励 |
|  | `PetDreamAfkReward` / `PetDreamAfkCap` | 挂机收益 / 容量 | `RewardID` / `CapID` | 解锁、周期收益、容量来源与购买 |
|  | `PetDreamSprintReward` | 冲刺奖励 | `SprintID` | 个人首达与全服进度奖励 |

`Pet.xlsx` 当前共 14 个 sheet；`PetRamdom.xlsx` 3 个；`PetDream.xlsx` 6 个。

## 2. 最短运行链

```text
Pet.PetID
  -> PetSkill / PetLevel / PetAdvanced / PetStar
  -> TalentPool / EngraveList / PetSkin / PetBook / PetBond
  -> Skill / Attribute / Item / Picture / I18N

PetDrawRule.DrawRuleID
  -> NormalPetDrawWeight（普通蛋按品质权重）
  -> SpecialPetDrawWeight（特殊蛋：未拥有 PetID，不放回）

PetDreamGroup.GroupID
  -> PetDreamStage.StageID -> SceneID + BossData
  -> PetDreamAfkReward / PetDreamAfkCap / PetDreamSprintReward
  -> Scene / Enemy / Item / PurchaseList / Condition
```

服务端 `common/modules/pet/petdi/config.go` 明确消费 `PetDrawRule`、`NormalPetDrawWeight`、`SpecialPetDrawWeight`。`PetDream` 六类 config 已生成并被业务代码读取，因此不能按旧需求文档的“配置：无”跳过配表。

`Pet.Emote#N.Action/Weight` 已进入 client proto 和帧同步宠物行为：仅休闲场景启用，空池不触发；同宠多条动作按 `Weight` 做确定性轮盘。表内动作名还需命中对应宠物资源动作，不能只验字段导出。

## 3. 常见误判与反向影响

- `PetSkill.SkillID` 仍要反查 `battle/Skill.xlsx`；它不是仅用于展示的内部编号。
- `TalentPool` 是属性随机池，新增天赋时要核 `role/Attribute.xlsx`；`TalentReRandomPrice` 是重随机消耗，不是抽卡费用。
- `SpecialPetDrawWeight.PetID` 不是权重列；候选集合由“未拥有”过滤，重复配置和空候选都要在业务验收中覆盖。
- `PetDreamStage.GroupID` 必须命中 `PetDreamGroup.GroupID`；`SceneID`、`BossData`、奖励、挂机容量购买继续联查 Scene / Enemy / Item / PurchaseList / Condition。
- 修改 `PetID` 时反查 PetSkill、PetStar、PetSkin、SpecialPetDrawWeight 及所有活动 / 奖励投放。
- `Emote.Weight` 不是百分比文本；同宠动作池需检查权重均为非负且至少一个正值，战斗场景不启用 Emote。

## 4. 验收清单

- 14 + 3 + 6 个 sheet 均按源表原名读取，`PetRamdom` 拼写未被更改。
- `PetID`、`SkillID`、属性类型、道具消耗、图片和玩家文案引用可闭合。
- Emote 动作名、权重和休闲场景开关可闭合；空池与单动作池均有明确结果。
- 普通抽卡品质权重可汇总；特殊抽卡只返回未拥有幻灵且不放回。
- `PetDreamGroup -> PetDreamStage -> Scene/Enemy/Reward` 和挂机 / 容量 / 冲刺链完整。
- 需求文档“配置：无”保持为冲突提示，不覆盖 r4822 已落地事实。
