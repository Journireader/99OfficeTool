# 战斗 RelicAltar（圣火祭坛）

> 用途：解释 `Relic.xlsx` 的 RelicAltar Sheet 功能、字段、与 RelicBase / RelicLevel / RelicStar 的关系。
> 术语：本文统一用 `配表参考/约定/战斗术语对照表.md` 选定的术语。
> 数据源：`battle/Relic.xlsx#RelicAltar`；当前非空边界见 `约定/全表快照.md`。

---

## 1. RelicAltar 是什么

`RelicAltar` 是圣物体系中的**圣火祭坛**：玩家通过提升圣火等级，解锁主角面板的属性加成（生命/防御/攻击等）。

- **不是**圣物本体（圣物本体在 `RelicBase`）
- **不是**圣物升级（圣物升级在 `RelicLevel` / `RelicStar`）
- **是**"圣物体系的元等级"——独立于单个圣物的全局加成

定位类比："角色等级 → 提升属性" 的方式，但维度是"圣火等级"，由圣物体系内部消耗驱动升级。

---

## 2. RelicAltar 字段全览

| 字段 | 类型 | 含义 | 必填 |
|---|---|---|---|
| `AltarLevel` | int | 主键 ID（祭坛等级） | 是 |
| `column_2` (备注) | string | 策划备注 | 否 |
| `NeedAltarLevel` | int | 激活该行所需的圣火等级（前置） | 是 |
| `Knight.Type` | enum | 骑士-技巧属性类型（如 `[属性类型]生命`） | 是 |
| `Knight.Data` | int | 骑士-技巧属性数据（强化成功后覆盖 DB） | 是 |
| `Wizard.Type` | enum | 巫师-技巧属性类型 | 是 |
| `Wizard.Data` | int | 巫师-技巧属性数据 | 是 |

**抽样数据**：

| AltarLevel | NeedAltarLevel | Knight.Type | Knight.Data | Wizard.Type | Wizard.Data |
|---|---|---|---|---|---|
| 1 | 2 | 生命 | 22 | 生命 | 22 |
| 2 | 4 | 生命 | 44 | 生命 | 44 |
| 3 | 6 | 生命 | 66 | 生命 | 66 |
| ... | ... | ... | ... | ... | ... |

---

## 3. 与圣物体系其他 Sheet 的关系

```
Relic.xlsx
├── RelicBase    （圣物本体：4 部位 × N 件，每件 6 词条）
├── RelicLevel   （圣物等级：每件圣物的等级效果）
├── RelicStar    （圣物星级：每件圣物的星级提升）
└── RelicAltar   （圣火祭坛：全局元等级 + 属性加成）  ← 本文
```

**关键差异**：

| Sheet | 主键 | 粒度 | 接入 ECE | 影响 |
|---|---|---|---|---|
| RelicBase | RelicID（7 位） | 单件圣物 | 部分接入（Three* / Two*ID 挂被动 SkillID；IcePool / FirePool 是属性池） | 单个圣物效果 |
| RelicLevel | RelicID + Level | 单件圣物 × 等级 | 是（Effect 字段挂 SkillID） | 单件升级带来效果 |
| RelicStar | RelicID + Star | 单件圣物 × 星级 | 待确认（Star 系统是否挂 SkillID） | 单件升星消耗 |
| **RelicAltar** | **AltarLevel** | **全局** | **不接入 ECE** | **直接覆盖角色面板属性** |

RelicAltar 不通过 SkillID/ECE，而是**直接配属性数据**。强化成功后写入 DB（见字段说明"强化成功后覆盖 DB 数据"）。

---

## 4. 双职业字段设计

RelicAltar 一行同时配 Knight 和 Wizard 两套数据。**字段说明明确写**：

> Wizard.Type / Wizard.Data 字段说明 = "详见骑士-技巧属性类型 / 详见骑士-技巧属性数据"

**含义**：两套字段是相同结构、不同职业的属性映射。客户端按当前职业（骑士 / 巫师）切换显示对应 Knight.* 或 Wizard.* 字段。

> 字段名说明：`Knight.*` 与 `Wizard.*` 两组列对称，都是单点。proto 中它们属于 `AttrTypeData Knight` / `AttrTypeData Wizard` 结构体展开，按单点填写即与协议一致。

---

## 5. 圣火等级的来源（待确认）

本节不是源表写入依据。涉及圣火等级来源、消耗路径或 RelicStar 联动时，必须先确认设计来源或系统负责人；未确认前不新增 / 回填相关字段。

`NeedAltarLevel` 引用"圣火等级"，但当前 `Relic.xlsx` 内**没有定义"圣火等级如何获得"的字段或 sheet**。

**需确认的等级来源**：
- 圣火等级可能由 RelicBase / RelicLevel 升级行为消耗资源累积获得
- 也可能由其他系统（任务、副本、活动）奖励

**待办**：向系统负责人确认圣火等级的产出路径。

---

## 6. 配 RelicAltar 时的检查项

1. **`AltarLevel` 主键唯一**且按顺序排列；废除等级不删行
2. **`NeedAltarLevel` 单调递增**（祭坛等级 N 的前置等级 < N+1 的前置等级）
3. **Knight.Type 与 Wizard.Type 通常成对**（同属性类型）：除非设计明确双职业差异化加成
4. **数据线性化检查**：实测样本 22 / 44 / 66（步长 22）是线性进阶；新增行时保持步长一致或与设计稿对齐
5. **属性类型与 `[属性类型]` 字符串规范**：`Knight.Type` / `Wizard.Type` 的值带方括号前缀（如 `[属性类型]生命`），不要写裸字符串"生命"

---

## 7. 待办

- [ ] 确认圣火等级的产出来源
- [ ] RelicStar 是否挂 SkillID（接入 ECE）需查 RelicStar 字段（本任务未展开）
- [ ] 确认 RelicAltar 升级的资源消耗（当前 sheet 只配产出端，消耗端可能在另一表）

---

## 8. 相关文档

- 总览导航：`配表参考/系统/战斗_总览.md`
- ECE 管线：`配表参考/系统/战斗_ECE管线.md`
- 术语口径：`配表参考/约定/战斗术语对照表.md`
- 圣物系统总论：`配表参考/系统/词缀圣物.md`
- 圣物配表经验：`配表参考/系统/词缀圣物.md`
