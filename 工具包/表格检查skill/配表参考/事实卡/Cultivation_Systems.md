# 事实卡：Cultivation Systems

## 0. 元信息

- 源 Excel：`develop/develop/Exp.xlsx`、`develop/develop/Equip.xlsx`、`develop/develop/EquipGrid.xlsx`、`develop/develop/Adornment.xlsx`、`develop/develop/BlackHunter.xlsx`、`develop/battle/Relic.xlsx`、`develop/role/PrimaryProfession.xlsx`
- 关联源 Excel：`develop/role/Attribute.xlsx`、`develop/system/Item.xlsx`、`develop/system/I18N.xlsx`、`develop/system/Condition.xlsx`、`develop/random/Random.xlsx`、`develop/battle/Skill.xlsx`
- 最近验证：2026-08-21 / SVN r5020 / 源表结构 + proto + client/server 只读代码
- 状态：主链和运行侧属性聚合已验证；具体数值曲线、投放经济和职业平衡按任务确认
- 第一参考：`系统/养成数值.md`、`事实卡/Equip_Attribute_Random.md`、`系统/骑士时装.md`、`系统/词缀圣物.md`

## 1. 表事实

| 系统 | 主表 | 主键 / 分组 | 运行侧读取 |
|---|---|---|---|
| 职业基础 | `role/PrimaryProfession.xlsx#PrimaryProfession` | `@cfg:map\|PrimaryProfessionID` | 职业模型、基础属性、技能 Build 列表 |
| 职业 Build | `role/PrimaryProfession.xlsx#PriProSkillBuild` | `@cfg:map\|PriProSkillBuildID` | 技能槽、解锁等级、Condition、SkillID |
| 主角经验 | `develop/Exp.xlsx#KnightExp/WizardExp` | `@cfg:map\|ExpID` | 升级经验和冒险掉落装备属性成长 |
| 装备模板 | `develop/Equip.xlsx#Equip` | `@cfg:map\|EquipID` | 装备属性、模型、图标、分解随机池 |
| 装备格 | `develop/EquipGrid.xlsx` | `PartType` / `EquipReinforceId` / `EquipResonanceID` | 装备格基础属性、强化覆盖值、共鸣属性 |
| 时装 | `develop/Adornment.xlsx` | 外观 map；Fashion 表按 `FashionID` 分组 | 外观解锁、升星、升级、套装属性 |
| 圣物 | `battle/Relic.xlsx` | RelicBase map；RelicLevel/Star group；RelicPool map | 圣物本体、等级 / 星级、圣痕属性池、祭坛属性 |
| 黑猎人 | `develop/BlackHunter.xlsx#HunterList/HunterTalent` | HunterList map；HunterTalent map `ID` | 黑猎人解锁、技巧树、双职业属性 |

## 2. 最短链路

### 2.1 职业基础链

```text
PrimaryProfession.PrimaryProfessionID
  -> HeroModelID / ProfessionEquip / BasicAttr
  -> PriProSkillBuildID
  -> PriProSkillBuild.ConditionID + SkillID
  -> Skill / Condition / I18N / RoleRes
```

`UnlockLevel` 是展示 / 等级口径，`ConditionID` 才是条件链入口；两者都要查。

### 2.2 装备链

```text
Equip.EquipID
  -> PartType + QualityType + BasicAttr / AdvancedAttr
  -> Attribute
  -> IconID / HeroEquipModelID / DropItemResID
  -> EquipDecomposeDataRandomID
  -> Item / EquipChest / Random / Reward
```

装备不是道具本体。发放端要看 `PropType`，装备箱要走 `Item -> EquipChest -> Equip`。

### 2.3 装备格链

```text
EquipGrid.PartType
  -> EquipGrid.Attr 顺序
  -> EquipReinforce.EquipGrid#N.AttrData
  -> EquipResonance.ResonanceAttr + ResonanceCondID
  -> RoleAttr AFFIX_GROUP_EQUIP_GRID
```

代码确认：

- 服务端把强化表预处理成 `{装备部位, 强化等级} -> AttrData`。
- `AttrData` 数量和顺序必须与 `EquipGrid.Attr` 对齐。
- 装备格属性和当前强化等级属性会合并进角色属性模块；共鸣按当前 `ResonanceLevel` 取 `ResonanceAttr`。

### 2.4 时装链

```text
AdornmentClothes.AdornmentClothesID
  -> Item.ItemID
  -> FashionStar.FashionID + Star
  -> FashionLevel.FashionID + Level
  -> FashionSuit.FashionID + Star + PrimaryProfessionType
  -> Condition / I18N / Picture / HangingPoint
```

代码确认：

- battle-core 以 `FashionID_Star`、`FashionID_Level`、`FashionID_Star_PrimaryProfessionType` 建索引。
- `SuitID` 通过 `FashionStar` 反查套装下有哪些 FashionID。
- 时装属性通过战斗输入同步到战斗属性，不是只在 UI 展示。
- `FashionStar` 新增 `PassiveCondition`、`PassiveLimit`、`PassiveAttr#1.Type/Data`，但当前 proto 与非生成消费者未见对应字段；在程序补齐前只能标为结构预留，不能把填值写成已生效属性。

### 2.5 圣物链

```text
RelicBase.RelicID
  -> IcePool / FirePool -> RelicPool.PoolID
  -> RelicLevel.RelicID + Level -> Effect SkillID
  -> RelicStar.RelicID + Star
  -> RelicAltar.NeedAltarLevel
  -> Skill / I18N#Relic / Item / Attribute
```

代码确认：

- `RelicPool` 随机从 `Attr` 列表抽一条属性；属性值按 min/max/step 生成。
- 圣物祭坛和已装备圣物的圣痕属性会并入角色属性模块。
- `IcePool / FirePool` 是属性池 ID，不是 SkillID；套装和等级效果才走 Skill。

### 2.6 黑猎人链

```text
HunterList.HunterID
  -> ConditionID -> Condition
  -> AvgID / PictureID / Describe
  -> HunterTalent.ID = HunterID * 10000 + TalentID * 100 + TalentLevel
  -> TreeType.TreeTypeID + TalentID
  -> Knight / Wizard 属性
```

代码确认：

- `HunterList.ConditionID` 走公共条件，服务端会注册条件变化并解锁 Hunter。
- `HunterTalent.ConditionID` 是前置技巧配置 ID 列表，不是 `system/Condition.ConditionID`。
- 黑猎人技巧按当前职业选择 `Knight` 或 `Wizard` 属性并入角色属性模块。

## 3. 禁止推断

- 不要把所有养成表当一条线；职业、装备、装备格、时装、圣物、黑猎人是不同主链。
- 不要把 `Exp.BasicAttrFirst/Second` 当职业基础属性；它标的是冒险掉落装备属性成长。
- 不要把 `EquipID`、`ItemID`、`FashionID`、`AdornmentClothesID` 无条件合并；只有具体系统配置习惯确认后才能共用。
- 不要把 `HunterTalent.ConditionID` 当 `Condition.ConditionID`。
- 不要把 `RelicBase.IcePool / FirePool` 当技能；它们是 `RelicPool.PoolID`。
- 不要只改养成主表，不查 Attribute / I18N / Item / Condition / Picture / Skill 承接。
- 不要把 `FashionStar.Passive*` 与既有 `StarAttr` 合并理解：前者当前是程序前置，后者才是已验证的升星属性链。

## 4. 反向影响

| 改动类型 | 必查反向引用 | 必补支撑 | 阻塞 / 需确认 |
|---|---|---|---|
| 新职业 / Build | PrimaryProfession、PriProSkillBuild、Skill | RoleRes / I18N / Condition | 技能槽或模型缺失 |
| 新装备 | Equip、Item / EquipChest、Random、Attribute | I18N / Picture / EquipModel | 属性枚举或发放端不闭合 |
| 改装备格强化 | EquipGrid、EquipReinforce、EquipResonance | Attribute / Condition | AttrData 与 EquipGrid.Attr 不等长 |
| 新时装 | AdornmentClothes、Item、FashionStar、FashionLevel、FashionSuit | I18N / Condition / Picture | ItemID 和外观 ID 关系不清 |
| 改时装被动 | FashionStar.PassiveCondition/PassiveLimit/PassiveAttr | Condition / Attribute / proto / 消费者 | 程序未定义时阻塞正式生效结论 |
| 新圣物 | RelicBase、RelicLevel、RelicStar、RelicPool、RelicAltar | Skill / I18N#Relic / Item | PoolID 与 SkillID 混用 |
| 新黑猎人技巧 | HunterList、HunterTalent、TreeType | I18N / Picture / Condition / AVG | 前置技巧 ID 或树坐标不闭合 |

## 5. 验收清单

- 先判主链：职业 / 装备 / 装备格 / 时装 / 圣物 / 黑猎人。
- 属性字段全部命中 `role/Attribute.xlsx#Attribute`。
- 任何玩家可见名称、描述、图标、模型、AVG 都补查 I18N / Picture / Resource / AVG。
- 任何获得、消耗、分解、奖励都补查 Item / Random / Reward / Store。
- 涉及战斗效果时继续查 Skill / SkillDirector / Trigger / Effect。
- 涉及解锁时区分公共 Condition 和系统内前置 ID。
