# 战斗 Trigger 类型说明

> 用途：解释 SkillDirector.xlsx 8 个 Sheet 的字段结构、各 Trigger 类型的差异、与 SkillDirector 主表的关系。
> 术语：本文统一用 `配表参考/约定/战斗术语对照表.md` 选定的术语。
> 数据源：`battle/SkillDirector.xlsx`（1 主表 + 7 子表；当前维度见本文件 §4，具体以源表为准）。

---

## 1. SkillDirector 与 Trigger 的关系

```
SkillDirector (主表，1 行 = 1 个动作编排)
   │
   │ LogicalTrigger#N.Type 指定本关键帧用哪类 Trigger
   │ LogicalTrigger#N.TriggerID 指定具体哪条
   │
   ▼
   ┌──────────┬───────────┬─────────────┬──────────┬───────────┬───────────┬────────────┐
   ▼          ▼           ▼             ▼          ▼           ▼           ▼
Instant    Follow      Bullet        Trap       Throw      Summon      Ray
Trigger    Trigger     Trigger       Trigger    Trigger    Trigger     Trigger
sheet      sheet       sheet         sheet      sheet      sheet       sheet
(775行)    (43行)      (186行)       (61行)     (21行)     (47行)      (3行)
瞬时       跟随         直线弹道      地面陷阱    抛投       召唤        射线
```

每条 SkillDirector 行可声明最多 13 个 LogicalTrigger（关键帧），每个 LogicalTrigger 选一种 Type 并填对应 sheet 里的 TriggerID。

---

## 2. 三轴正交分类（统一分类维度）

为什么之前文档"分类乱"？因为历史项目文档用"点击类/子弹类/蓄力类 = 玩家手感"，SkillDirector.xlsx 用 7 个 sheet = 实现细节。两套各自有价值，但混用会乱。

**本文统一按"生命周期 / 形状 / 运动"三轴描述**——每类 Trigger 在三轴上各有取值。三轴正交、互不重叠。

| Sheet | 生命周期 | 形状 | 运动 | 典型用途 |
|---|---|---|---|---|
| **InstantTrigger** | 瞬时（关键帧消失） | 矩形 / 圆形 / 椭圆 | 跟随施法者位置生成 | 普攻关键帧、近战命中 |
| **FollowTrigger** | 跟随父对象生命周期 | 矩形 / 圆形 | 跟随单位移动 | 防御挂件、翻滚保护、范围目标搜索 |
| **BulletTrigger** | 飞行至射程 / 碰撞 / 穿透耗尽 | 弹道（含速度、外观） | 直线弹道 | 子弹、远程攻击、投掷型法术 |
| **TrapTrigger** | 持续时间到 / 生效次数耗尽 / 施法者死亡 | 地面区域 | 静止 | 捕兽夹、火墙、地雷 |
| **ThrowTrigger** | 飞行 + 落地后立刻判定 | 投掷物外观 | 抛物线 / 直生 | 投技、地点生成（火墙、毒云） |
| **SummonTrigger** | 召唤物自身生命周期 | 矩形 / 圆形 | 跟随召唤物 | 召唤怪、护卫、宠物 |
| **RayTrigger** | 配置的 Duration | 线段（长度 × 宽度） | 直线 | 激光、射线技能 |

> **手感分类（玩家如何输入）**仍然有用：点击类（瞬时输入）、子弹类（投射输入）、蓄力类（长按输入）。它和上表是**正交的两个维度**：同一个 BulletTrigger 既可以由"点击类"输入触发，也可以由"长按蓄力类"输入触发。

---

## 3. SkillDirector 主表关键字段

当前源表非空边界为 82 列 / 877 行，双行表头。本文只列与 Trigger 相关的核心字段；属性/位移/碰撞细节查 xlsx 表头注释。

### 3.1 ID + 备注

| 字段 | 类型 | 含义 | 必填 |
|---|---|---|---|
| `SkillDirectorID` | int | 唯一 ID | 是 |
| `column_2` (备注) | string | 策划备注（如"骑士-初始-普攻-1段"） | 是 |

### 3.2 动作 + 演出

| 字段 | 类型 | 含义 | 必填 |
|---|---|---|---|
| `ActionID` | string | 施法动作路径（Spine 等） | 否（空 = 无动作） |
| `CastEffectPrefabPath` | string | 施法特效预制体 | 否 |
| `CastSubject` | int | 施法主体（默认本体） | 否 |

### 3.3 预攻击 Trigger（PreAttack，AI 用）

> AI 用此 Trigger 检测"能否打到敌人"——设计事实见飞书 AI 系统原文 `https://www.feishu.cn/docx/B1H1d7X0Fo0clax59r9cwaM4nRb` 的释放方式决策章节。**不参与命中判定**，命中判定在 LogicalTrigger。

| 字段 | 含义 |
|---|---|
| `PreAttackTriggerShape` | 形状（矩形/圆形/椭圆） |
| `PreAttackTriggerData#1/#2` | 形状参数（矩形 = 宽/高，圆形 = 半径，椭圆 = 长短轴） |
| `PreAttackTriggerOffsetDistance.X/Y` | 相对施法者脚底的偏移 |
| `SkillWarn#1/#2/#3` | 预警关联触发器序号 |

### 3.4 模型位移

| 字段 | 含义 |
|---|---|
| `ModelOffsetDirectionType` | 1 = 当前朝向 / 2 = 反方向 |
| `ModelOffsetDistance` | 像素距离 |
| `ModelDelayOffset` | 位移延迟（毫秒） |
| `AccelerateProportion` / `MaxAccelerateData` | 加速段万分比 / 最大加速倍率 |
| `MaxUniformSpeedData` | 匀速倍率（与加速互斥） |
| `IsModelOffsetTransmissible` | 位移是否传导给受击者（用于硬直转嫁；设计事实回飞书战斗系统原文，配表字段以本文和源表为准） |

### 3.5 目标搜索 Trigger（Search，可选）

| 字段 | 含义 |
|---|---|
| `SearchTriggerShape` / `SearchTriggerData#1/#2` | 形状 + 参数 |
| `SearchTriggerOffsetDistance.X/Y` | 偏移 |

仅 5 条 Skill 用到，见 SkillDirector.xlsx 实测。

### 3.6 LogicalTrigger（核心：关键帧 → Trigger）

13 组字段（`LogicalTrigger#1` ... `LogicalTrigger#13`），每组 4 列：

| 字段 | 含义 |
|---|---|
| `LogicalTrigger#N.CreateTime` | 关键帧时间点（毫秒） |
| `LogicalTrigger#N.Type` | Trigger 类型（瞬时/跟随/子弹/陷阱/...）→ 决定查哪个 sheet |
| `LogicalTrigger#N.TriggerID` | 在对应 sheet 内的 TriggerID |
| `LogicalTrigger#N.SkillEffects` | 关联效果序号（多个用 `;` 分隔），对应 Skill.Effects#N |

#### 3.6.1 `SkillEffects` 顺序就是效果释放顺序

`LogicalTrigger#N.SkillEffects` 的分号顺序有业务含义，表示该 Trigger 命中 / 生效后实际执行 Skill.Effects 的顺序。

示例：

```text
LogicalTrigger#5.SkillEffects = 2;3;1
```

实际顺序是：

1. 先执行 `Skill.Effects#2`
2. 再执行 `Skill.Effects#3`
3. 最后执行 `Skill.Effects#1`

因此，打印整体技能逻辑链条、排查命中效果或复核技能行为时，必须按源表原始 `SkillEffects` 顺序输出，不能为了阅读整齐改成 `效果1、效果2、效果3`。如果自动工具需要去重或汇总效果，也只能在“做什么”摘要列里做去重；Director / Trigger 链路列必须保留原始顺序。

`SkillEffects` 是效果槽下标，不是效果参数。例：`SkillEffects=3` 表示执行 `Skill.Effects#3`；若 `Effects#3.TypeID=免疫控制`、`Effects#3.TypeData=1`，不要把 `3` 解释成免控参数。

#### 3.6.2 主动技能配置闭环

主动 Skill 的配置闭环是：

```text
Skill.SkillDirectorID
  -> SkillDirector.SkillDirectorID
  -> LogicalTrigger#N.Type + LogicalTrigger#N.TriggerID
  -> 对应 Trigger 子表
  -> LogicalTrigger#N.SkillEffects
  -> Skill.Effects#N
```

检查主动技能时必须同时确认：

- 主动 Skill 的 `SkillDirectorID` 能在 `SkillDirector` 主表找到。
- `LogicalTrigger#N.Type` 与 Trigger 子表一致，不能只凭 TriggerID 查全局。
- `LogicalTrigger#N.TriggerID` 能在对应子表找到。
- `LogicalTrigger#N.SkillEffects` 指向所有需要生效的 `Skill.Effects#N`。
- Skill 里新增了 `Effect#3/#4` 时，Director 的 `SkillEffects` 也要补到 `1;2;3` 或 `1;2;3;4`，否则新增效果不会由动作/Trigger 承接。
- Director 指向空效果槽属于风险配置，应补齐效果或清理指向。

铭文主动技能常用规范：主动技能的 `SkillDirectorID` 与 `SkillID` 对应；Director 生成的 TriggerID 按 `DirectorID + 1/2/3...` 顺序追加，便于查链路和避免错串。

#### 3.6.3 生成陷阱优先放主动 Director

如果需求语义是“释放技能后在地面 / 命中点 / 指定位置生成陷阱、火墙、裂口、沼泽”等地面区域，且没有明确要求“必须命中敌方目标后才生成”，默认把 `TrapTrigger` 配在主动 Skill 的 `SkillDirector` 里，并把陷阱生效的伤害、控制、前置增伤等效果挂到同一主动 Skill 的后续 `Effects#N`，由 Trap 的 `LogicalTrigger#N.SkillEffects` 按顺序派发。

只有需求明确依赖“攻击生效后 / 命中敌人后”这个结果时，才用被动 Skill 监听攻击生效事件再释放或生成陷阱。否则会把“生成地面区域”误配置成“必须先打中人”，导致空放或未命中时不生成陷阱。

从 helper 模式改成主动 Director 直接生成 Trap 时，要区分“废弃的 helper 行”和“仍被新 Director 引用的 TrapTrigger 行”。`LogicalTrigger.Type=陷阱` 指向的 Trigger 子表行是新链路的一部分，不能跟旧 helper 一起清掉。

#### 3.6.4 怪物 TriggerID 生成与真实查找键

怪物 Trigger ID 当前按 `SkillDirectorID + 1 位序号` 生成：

```text
TriggerID = SkillDirectorID(11位) + TriggerOrder(1位)
TriggerOrder 从 0 开始
```

示例：

```text
SkillDirectorID = 10204003100
第 0 个 Trigger  = 102040031000
第 1 个 Trigger  = 102040031001
```

`TriggerOrder` 按 `SkillDirector` 逻辑触发器配置中出现的顺序递增。当前只追加 1 位，自然容量为 `0~9`；如果单个 `SkillDirector` 需要超过 10 个序号，不能自动扩成 13 位，必须先确认新规范。

Trigger 的真实查找键是：

```text
(LogicalTrigger.Type, LogicalTrigger.TriggerID)
```

也就是说：

- `TriggerID` 数字值不要求在所有 Trigger 子表间全局唯一。
- 同一个数字 `TriggerID` 可以同时存在于不同 Trigger 类型对应的子表中。
- 只要 `LogicalTrigger.Type` 不同，它们就是不同 Trigger 记录。
- 查找、对比、报错时不能只用 `TriggerID` 判重，必须带上 `Type`。
- 如果同一个技能逻辑节点拆成多种实现 Trigger，可以让不同类型子表共用同一个数字 `TriggerID`；此时它们属于同一 `TriggerOrder` 的多类型实现。
- 如果是 `SkillDirector` 中下一个独立逻辑触发器，则继续按出现顺序递增 `TriggerOrder`。

示例：

```text
LogicalTrigger.Type = 子弹
LogicalTrigger.TriggerID = 102040031000
  -> 查 BulletTrigger.TriggerID = 102040031000

LogicalTrigger.Type = 瞬时
LogicalTrigger.TriggerID = 102040031000
  -> 查 InstantTrigger.TriggerID = 102040031000
```

上面两个配置数字 ID 一样，但类型不同、索引表不同，不应判定为冲突。

### 3.7 后摇

| 字段 | 含义 |
|---|---|
| `PostCastDelayTime` | 后摇期起始毫秒（空 = 无后摇） |

---

## 4. 7 个 Trigger 子表字段

### 4.1 InstantTrigger（瞬时，当前 775 行）

最常用，普攻关键帧用。

| 字段 | 类型 | 含义 |
|---|---|---|
| `TriggerID` | int | 主键 |
| `column_2` (备注) | string | 如"战士-初始-普攻-1段" |
| `TriggerShape` | enum | `[触发器形状类型]矩形/圆形/椭圆` |
| `TriggerData#1` | int | 矩形/圆形 = X 维度 |
| `TriggerData#2` | int | 矩形/椭圆 = Y 维度（圆形留空） |
| `TriggerOffsetDistance.X/Y` | int | 相对施法者脚底偏移 |

### 4.2 FollowTrigger（跟随，当前 43 行）

跟随施法者或目标移动的范围 Trigger，常用于挂件、翻滚保护、AOE 范围。

| 字段 | 同 InstantTrigger 的 6 个字段（TriggerID/备注/Shape/Data1/Data2/Offset.X/Y） |
|---|---|

特点：**没有跟随目标字段**——跟随对象由调用 SkillDirector 的上下文决定（待程序确认是否还有隐式约定）。

### 4.3 BulletTrigger（子弹，当前 186 行）

直线飞行的子弹。当前有效字段 15 列（Excel 格式化最大列为 20）。

| 字段 | 类型 | 含义 |
|---|---|---|
| `TriggerID` / `column_2` | - | 主键 + 备注 |
| `BallisticType` | enum | `[子弹弹道类型]直线`（目前只见直线，可扩） |
| `ResID` | int | 子弹外观资源 |
| `TriggerOffsetDistance.X/Y` | int | 子弹起点偏移 |
| `MaximumRange` | int | 最大射程（像素） |
| `SpeedData` | int | 子弹速度（与 TimeData 互斥） |
| `TimeData` | int | 子弹时间（毫秒，与 SpeedData 互斥） |
| `AccelerateProportion` / `MaxAccelerateData` | int | 加速参数 |
| `PenetrationCount` | int | 最大穿透数量（0 = 不可穿透） |
| `PenetrationType` | enum | 0=无 / 1=穿透（伤害衰减） / 2=贯穿（伤害不衰减） |
| `PenetrationParams` | string | 穿透参数（衰减比例 + 保底比例） |
| `HitEffectID` | int | 命中特效 |

### 4.4 TrapTrigger（陷阱，当前 61 行）

地面持续 Trigger，有持续时间 + 生效次数限制。

| 字段 | 类型 | 含义 |
|---|---|---|
| `TriggerID` / `column_2` | - | 主键 + 备注 |
| `ResID` | int | 陷阱外观资源 |
| `TriggerOffsetDistance.X/Y` | int | 偏移 |
| `MaximumDuration` | int | 最大持续时间（毫秒） |
| `MaximumEffective` | int | 最大生效次数（耗尽进消亡，9999 = 不限） |
| `CountdownToRemovalFromWhitelist` | int | 同一目标命中后多久解锁再次受击（毫秒），实现"伤害间隔" |
| `MaximumQuantity` | int | 同一施法者场景内陷阱数量上限（超出销毁最早的） |
| `column_10` (说明) | - | "施法者死亡，默认立刻进入消亡状态" |
| `HitEffectID` | int | 命中特效 |

### 4.5 ThrowTrigger（投掷，当前 21 行）

抛物线 / 地点直接生成。

| 字段 | 类型 | 含义 |
|---|---|---|
| `TriggerID` / `column_2` | - | 主键 + 备注 |
| `ThrowType` | enum | 1 = 地点生成（直接投掷） / 2 = 抛物线投掷 |
| `ResID` | int | 投掷物外观 |
| `HeightData` | int | 抛物线高度（仅抛物线） |
| `TimeData` | int | 飞行时间（毫秒，到达后切碰撞检测） |
| `HitEffectID` | int | 命中特效 |

### 4.6 SummonTrigger（召唤，当前 47 行）

召唤物的存在范围 + 数量限制。

| 字段 | 类型 | 含义 |
|---|---|---|
| `TriggerID` / `column_2` | - | 主键 + 备注 |
| `TriggerShape` / `TriggerData#1/#2` | - | 范围形状参数 |
| `TriggerOffsetDistance.X/Y` | - | 偏移 |
| `MaximumDuration` | int | 召唤物最大存在时间（毫秒，留空 = 战斗结束才消失） |
| `MaximumQuantity` | int | 同一施法者召唤数量上限 |
| `SummonSpecialEffect.Type` | enum | 召唤时关联特效类型，空 = 无特效 |
| `SummonSpecialEffect.TypeData` | int | 召唤时出现特效 ID，空 = 无特效播放 |
| `column_12` (说明) | - | "召唤的怪物为施法者的召唤物，不能视作怪物，不提供掉落和经验" |

> 注：当前有效字段到 `SummonSpecialEffect.TypeData`，第 12 列是说明列。

### 4.7 RayTrigger（射线，当前 3 行）

激光 / 射线类持续判定。

| 字段 | 类型 | 含义 |
|---|---|---|
| `TriggerID` / `column_2` | - | 主键 + 备注 |
| `RayEffectID` | int | 射线特效编号（关联特效表） |
| `TriggerOffsetDistance.X/Y` | int | 起始点偏移 |
| `RayLength` | int | 射线最大长度（像素） |
| `RayWidth` | int | 射线宽度（像素，转矩形碰撞盒判定） |
| `Penetration` | int | 穿透数量（0 = 穿透但不伤；-1 = 全穿透无视遮挡） |
| `Duration` | int | 持续时间（毫秒） |
| `HitEffectID` | int | 命中特效（命中或被遮挡时） |

---

## 5. 配 SkillDirector 的检查项

> 以下检查项覆盖配 SkillDirector 主表 + 子表时常踩的坑。

1. **预攻击 Trigger ≠ 逻辑 Trigger**：PreAttack 是 AI 用的"能否打到"探测器，不参与实际命中。LogicalTrigger 才是"命中后伤害走的那条"。两个独立配。
2. **LogicalTrigger 的 TriggerID 必须查对 sheet**：`Type=瞬时` → 查 InstantTrigger；`Type=子弹` → 查 BulletTrigger。Type 与 sheet 不匹配会读不到行。
3. **TriggerID 判重必须带 Type**：真实唯一键是 `(LogicalTrigger.Type, TriggerID)`；不同 Type 共用同一个数字 TriggerID 不应误报重复。
4. **怪物 TriggerID 位数和前缀要对齐**：怪物 Trigger 应为 12 位，并以 11 位 `SkillDirectorID` 开头，最后 1 位为 `0~9` 的 TriggerOrder。
5. **Bullet 的 SpeedData / TimeData 二选一**：填 SpeedData 视作匀速；填 TimeData 视作按时间到达，与加速参数绑定。同时填会冲突。
6. **Trap 的 MaximumEffective vs CountdownToRemovalFromWhitelist 含义不同**：前者是"陷阱总共能命中几次"（命中达到次数自然消亡），后者是"同一目标命中后多久能再次受击"（避免一帧内多次结算）。
7. **Ray 的 Penetration = 0 vs -1 含义反直觉**：0 = "可穿过但只对第一个目标造成伤害"；-1 = "全穿透 + 全部命中"。新手容易把 0 理解为"不可穿透"——实际不可穿透要看 RayLength 是否被遮挡截断（HitEffectID 触发）。

---

## 6. 相关文档

- 总览导航：`配表参考/系统/战斗_总览.md`
- 术语口径：`配表参考/约定/战斗术语对照表.md`
- ID 编码：`配表参考/约定/ID编码规范.md`
- 顶层动作层架构：飞书战斗系统原文；配表执行口径见 `配表参考/系统/战斗_总览.md`、`配表参考/系统/战斗_ECE管线.md`
- 配表参考实施层：`配表参考/系统/战斗.md`
- AI 用 PreAttackTrigger 检测攻击范围（与 ECE 解耦）：飞书 AI 系统原文 `https://www.feishu.cn/docx/B1H1d7X0Fo0clax59r9cwaM4nRb` "释放方式决策"段
