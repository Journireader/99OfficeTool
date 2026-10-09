# 事实卡：Equip / Attribute / Equip Random

## 0. 元信息

- 源 Excel：`develop/develop/Equip.xlsx`、`develop/develop/EquipGrid.xlsx`、`develop/develop/Exp.xlsx`、`develop/random/Random.xlsx`、`develop/system/Item.xlsx`、`develop/role/Attribute.xlsx`
- 最近验证：2026-06-07 / SVN r3899 / 只读字段卡与抽样反查
- 状态：已验证导航；`EquipAdvancedAttrTypeRandom` / `EquipAttrDataRandom` 的运行时消费点仍需按需求确认
- 第一参考：`系统/养成数值.md`、`事实卡/Item_Random_Reward.md`

## 1. 表事实

| 项 | 内容 |
|---|---|
| `Equip.xlsx#Equip` | 装备模板；承接职业、部位、品质、基础属性、进阶属性、图标、模型和分解随机池 |
| `EquipGrid.xlsx` | 装备格、强化覆盖值、共鸣属性和消耗；骑士 / 巫师分 sheet |
| `Exp.xlsx#KnightExp/WizardExp` | 冒险掉落装备属性成长字段；不是职业基础属性事实源 |
| `role/Attribute.xlsx#Attribute` | 属性枚举、显示、数据类型、属性上限和战力系数事实源 |
| `Random.xlsx#EquipQualityRandom` | 装备品质随机池；同 ID 多行组成一组 |
| `Random.xlsx#EquipPartRandom` | 装备部位随机池；同 ID 多行组成一组 |
| `Random.xlsx#EquipAdvancedAttrTypeRandom` | 进阶属性类型随机池；目标为 `[属性类型]...` |
| `Random.xlsx#EquipAttrDataRandom` | 装备属性数值正态随机参数；按品质分组 |
| `Random.xlsx#EquipDecomposeDataRandom` | 装备分解产出随机池；同 ID 多行组成一组 |
| `Item.xlsx#EquipChest` | 装备箱；`ChestID` 同 ID 多行，`Reward.PropID` 指向装备模板 |

## 2. 字段语义

| 字段 | 语义 | 引用 / 格式 | 易误判 |
|---|---|---|---|
| `Equip.EquipID` | 装备模板 ID | 表头说明：掉落装备小于 100000，定制装备大于 100000 | 不等于 ItemID；发放端要看 PropType |
| `Equip.Name` | 装备名称 key | `I18N#Equip` | 字段存 key，不是正文 |
| `Equip.PartType` | 装备部位 | `[装备部位]...` | 和装备格 key 同枚举口径 |
| `Equip.QualityType` | 装备品质 | `[物品品质]...` | 和装备品质随机池 TargetType 对齐 |
| `Equip.AdvancedAttrNum` | 进阶属性条目数 | 整数；空表示无进阶属性 | 同一装备进阶属性类型不可重复 |
| `Equip.BasicAttr#N.Type` | 基础属性类型 | `role/Attribute.xlsx#Attribute.AttributeID` | 不要把中文枚举当普通文本 |
| `Equip.BasicAttr#N.MinData/MaxData` | 基础属性范围 | 整数 | 定制装备 ID 段要求 min/max 一致 |
| `Equip.AdvancedAttr#N.Type` | 进阶属性类型 | `role/Attribute.xlsx#Attribute.AttributeID` | 定制装备填值代表必定投放，不走随机逻辑 |
| `Equip.AdvancedAttr#N.MinData/MaxData` | 进阶属性范围 | 整数 | 空表示不投放 |
| `Equip.EquipDecomposeDataRandomID` | 分解产出池 | `Random.xlsx#EquipDecomposeDataRandom` | 同 ID 多行组成一组 |
| `EquipChest.ChestID` | 装备箱 ID | 通常由 `Item.ItemID` 引用 | 同 ID 多行组成箱子内容 |
| `EquipChest.Reward.PropType` | 奖励类型 | `[物品类型]装备` | 必须和 `Reward.PropID` 联合解释 |
| `EquipChest.Reward.PropID` | 奖励装备 ID | `Equip.EquipID` | 只有 PropType=装备时才这么分流 |
| `EquipAttrDataRandom.Coefficient` | 正态随机标准差系数 | 万分比；10000=1 | 不表示权重 |

## 3. 跨表引用

| 源字段 | 关系类型 | 目标表 / 字段 | 新增时动作 | 修改 / 删除时反查 |
|---|---|---|---|---|
| `Equip.Name` | I18N 文案 | `I18N#Equip.Key` | 补装备名称 | 查装备展示和箱子发放 |
| `Equip.IconID` | 资源表现 | `Picture.PictureID` | 补图标资源 | 查 Item、背包、奖励展示 |
| `Equip.HeroEquipModelID` | 资源表现 | `role/EquipModel.xlsx` | 补模型 / 挂点 | 查角色资源链 |
| `Equip.DropItemResID` | 掉落表现 | `role/EquipModel.xlsx#DropItemRes` | 补掉落表现 | 查场景掉落展示 |
| `Equip.BasicAttr#N.Type` / `AdvancedAttr#N.Type` | 属性枚举 | `role/Attribute.AttributeID` | 确认 DataType / 战力系数 / I18N | 查同属性所有装备和成长表 |
| `Equip.EquipDecomposeDataRandomID` | 随机池 | `Random.xlsx#EquipDecomposeDataRandom` | 补同组多行 | 查装备分解和 Item 资源 |
| `AdventureArea.EquipQualityRandomID` | 随机池 | `Random.xlsx#EquipQualityRandom` | 补品质池同组行 | 查冒险区域掉落 |
| `AdventureArea.EquipPartRandomID` | 随机池 | `Random.xlsx#EquipPartRandom` | 补部位池同组行 | 查冒险区域掉落 |
| `AdventureDropLevel.DropItemRandomID` | 掉落类型池 | `Random.xlsx#DropItemRandom` | 补掉落类型池 | 查装备掉落等级 |
| `Item.ItemID` + 装备箱类型 | 箱子承接 | `Item.xlsx#EquipChest.ChestID` | 补箱子同组行 | 查 reward / dungeon / commerce 发放 |

## 4. 反向影响

| 改动类型 | 必查反向引用 | 必补支撑 | 阻塞 / 需确认 |
|---|---|---|---|
| 新增装备模板 | `EquipChest`、奖励三元组、冒险掉落、Item | I18N、Picture、EquipModel、Attribute | 模型 / 图标 / 属性枚举缺失时阻塞 |
| 改装备属性类型 | `role/Attribute`、同品质/同部位样本、战力显示 | Attribute I18N / DataType / CombatPowerCoefficient | 不确认属性枚举时阻塞 |
| 改装备随机池 | Adventure / DropItemRandom / EquipChest | 同 ID 多行完整组 | 权重合计和算法类型需读回 |
| 改分解产出 | `Equip.EquipDecomposeDataRandomID`、Item、资源 | 道具 / 资源承接 | `TargetType` 上下文未确认时阻塞 |
| 改装备箱 | Item、WorldHunting / reward 发放端 | 同 ChestID 多行 | `Reward.PropType` 与 `PropID` 不匹配时阻塞 |

## 5. 常见误判

- `Reward.PropID`、`TargetID`、`PropID` 都必须按同组 `PropType` / `TargetType` 分流；不能当全局外键。
- 资源型产出例如 `[物品类型]资源-金币` 不按 `ResourceID` 查；`Resource.xlsx#Resource` 的主键是 `PropType`。
- `EquipAdvancedAttrTypeRandom` 和 `EquipAttrDataRandom` 当前未在其它 Excel sheet 发现显式外键来源；涉及写入时要确认运行时消费点或策划口径。
- `Exp.xlsx` 的掉落装备属性成长不是职业基础属性表；职业基础先查 `PrimaryProfession`。

## 6. 验收清单

- 装备模板：`EquipID / PartType / QualityType / BasicAttr / AdvancedAttr` 读回。
- 属性枚举：所有 `[属性类型]...` 命中 `role/Attribute.xlsx#Attribute`。
- 装备随机：同 ID 多行完整，算法类型与权重 / 系数字段读回。
- 装备箱：`Item.ItemID -> EquipChest.ChestID -> Reward.PropID -> Equip.EquipID` 可闭合。
- 文案 / 资源：`I18N#Equip`、`Picture`、`EquipModel` 命中或明确不涉及。
- Relation Gate 未闭合项不得写成通过；实现消费点相关时才补代码搜索。

## 7. 未决项

| 项 | 状态 | 影响 | 关闭方式 | 未关闭能否回填 |
|---|---|---|---|---|
| `EquipAdvancedAttrTypeRandom` / `EquipAttrDataRandom` 的运行时消费点 | 需确认 | 影响新增池 ID 的正确引用 | 读代码消费点或由策划 / 程序确认 | 改既有权重可回填；新增 ID 需确认 |
