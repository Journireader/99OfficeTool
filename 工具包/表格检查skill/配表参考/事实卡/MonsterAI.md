# 事实卡：MonsterAI

## 0. 元信息

- 源 Excel：`develop/battle/MonsterAI.xlsx`、`develop/battle/Enemy.xlsx`
- 最近验证：2026-06-24 / SVN r4453 / proto + client battle-core 只读代码
- 状态：导航和核心运行分流已验证；完整设计口径仍以飞书 AI 系统原文为准
- 第一参考：`系统/战斗_MonsterAI.md`、`系统/战斗_总览.md`
- 当前正式源表路径：`develop/battle/MonsterAI.xlsx`

## 1. 表事实

| 项 | 内容 |
|---|---|
| 表角色 | 主表 / 怪物 AI 行为参数 |
| 主键 | `AIId` |
| 上游 | `Enemy.EnemyAI.Type=预攻击随机` 时，`Enemy.EnemyAI.Value` 引用 `MonsterAI.AIId` |
| 下游 | AI 只输出释放 SkillID 指令；技能效果仍走 `Skill -> SkillDirector -> ECE` |
| 旁路 | 仇恨 / 检测频率默认值保留在 `constant/Const.xlsx#ConstComm` |

## 2. 字段语义

| 字段 | 语义 | 易误判 |
|---|---|---|
| `BehaviorWeights` | 普攻 / 技能 / 待机权重 | 不决定具体技能效果 |
| `BehaviorCount` | 行为包大小 | 不是技能段数 |
| `IdleTime` | 待机时间 | 单位毫秒 |
| `IdleTimeLimit` | 待机概率上限 | 万分比 |
| `QuadrantWeights` | 四象限走位权重 | 不是地图坐标 |
| `DetectFrequency` | 目标检测频率 | 可行级覆盖默认值 |
| `HateCoef` | 仇恨三系数 | 伤害 / 治疗 / 距离 |
| `PacingSpeed` | 踱步速度 | `0` 表示固定不动 |
| `PreAttackTriggerShape/Data` | 预攻击范围形状 / 参数 | 不是最终命中判定 |
| `BattleStartSkillCD` | 开场技能 CD，毫秒 | 未配置或非正数视为无开场锁 |
| `SkillGroupCD` | 技能组公 CD，毫秒 | 只限制技能行为，非正数表示不启用 |
| `PityTime` | 高级技能保底时间列表，毫秒 | 按 MonsterRes.AdvancedAttack 的 SkillIndex 对齐 |
| `HpUnlockSkill` | 血线触发技能配置 | `HpPecent` 是万分比；同条血线触发后不重复 |

## 2.1 代码确认的 AI 分流

- `Enemy.EnemyAI.Type=预攻击随机`：`Enemy.EnemyAI.Value` 按数字转 `MonsterAI.AIId`，必须命中 `MonsterAI`。
- `Enemy.EnemyAI.Type=固定序列`：`Enemy.EnemyAI.Value` 会按非数字分隔成序列；`0` 表示待机 2000ms，非 0 值按 `SkillID` 查技能。
- `Enemy.EnemyAI.Type=矿工逃跑`：走矿工逃跑行为，不按 `MonsterAI.AIId` 解释。
- 随机 AI 行为包按 `BehaviorWeights` 在普攻 / 技能 / 待机之间抽；技能行为只有在开场技能 CD 已过、MonsterRes 配了高级技能、且存在非血线技能时才入池。
- `PityTime`、`HpUnlockSkill.SkillIndex` 都按 MonsterRes 的 `AdvancedAttack` 列表索引解释；越界或技能 ID 无效不会生成有效行为。
- 血线技能、保底技能和普通技能共享 `SkillGroupCD`；决定释放时会刷新公 CD 和保底计时基线。

## 3. 跨表引用

| 源字段 | 关系类型 | 目标表 / 字段 | 新增时动作 | 修改 / 删除时反查 |
|---|---|---|---|---|
| `Enemy.EnemyAI.Value` | 强外键 | `MonsterAI.AIId` | 先补 MonsterAI 行，再挂 Enemy | 查所有 Enemy 引用 |
| `Enemy.EnemyAI.Type` | 枚举分流 | AI 逻辑类型 | Type=预攻击随机才查 MonsterAI | 非预攻击随机不要硬套 |
| `MonsterRes.AdvancedAttack` | 技能索引来源 | MonsterRes 中的高级攻击列表 | 配 PityTime / HpUnlockSkill 前先确认技能顺序 | 技能顺序变更会影响 SkillIndex |
| `MonsterAI.PreAttackTrigger*` | 软引用 / 行为参数 | `SkillDirector` 预攻击阶段读取 | 确认形状和数据 | 不当命中框结论 |
| `DetectFrequency` / `HateCoef` | 默认覆盖 | `ConstComm` | 行级覆盖或读默认 | 默认值变更需确认影响面 |

## 4. 禁止推断

- `MonsterAI` 不配置具体伤害、Buff、Trigger、Effect。
- AI 不订阅 Event，不读 Condition，不写 Effect。
- 预攻击范围用于 AI 判断能否攻击，不等于最终命中判定。
- 不从怪物稀有度 / 玩法强度运行时推导 AI 参数；参数已行级下沉。
- 不要把固定序列的 `EnemyAI.Value` 当 `MonsterAI.AIId`；它是技能序列。
- 不要把 `HpUnlockSkill.SkillIndex` 当 `SkillID`；它是高级技能列表索引。

## 5. 反向影响

| 改动类型 | 必查反向引用 | 必补支撑 | 阻塞 / 需确认 |
|---|---|---|---|
| 新增 AIId | Enemy 引用、ID 段 | MonsterAI 25 列参数 | AIId 重复时阻塞 |
| 改 AI 参数 | 所有引用该 AIId 的 Enemy | 需求目标 | 多怪共享时需确认 |
| 改 EnemyAI.Type | Enemy 行和玩法逻辑 | MonsterAI 或其它实现 | 非预攻击随机语义需确认 |
| 改预攻击形状 | SkillDirector / 怪物行为 | 形状参数 | 当成命中框时阻塞 |

## 6. 验收清单

- `Enemy.EnemyAI.Type` 与 `Enemy.EnemyAI.Value` 语义匹配。
- `AIId` 唯一，引用命中。
- 25 列参数完整，单位 / 万分比 / 毫秒解释正确。
- `PacingSpeed=0` 固定不动语义明确。
- `BattleStartSkillCD`、`SkillGroupCD`、`PityTime`、`HpUnlockSkill` 的单位和索引已按 MonsterRes / Skill 验证。
- 涉及技能效果时转 `Skill / SkillDirector / ECE`，不把效果塞进 MonsterAI。
