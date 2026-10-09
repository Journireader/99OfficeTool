# 事实卡：WorldBoss

## 0. 元信息

- 源 Excel：`develop/dungeon/WorldBoss.xlsx`
- 需求证据：[【FF】巨兽讨伐（世界 BOSS）](https://forever9.feishu.cn/docx/DIURdQzvYopH6uxwF9YcLMEmnIc)
- 最近验证：2026-08-21 / SVN r5020 / 6 个 sheet、client proto、答题战斗核与 client/server 只读检索
- 状态：六张配置表、主持人 NPC 与击退技能结构已落地；场景点位、技能配置和联调状态按当前任务继续确认
- 第一参考：`系统/副本.md`、`事实卡/Dungeon_System.md`、`事实卡/Item_Random_Reward.md`

## 1. 表事实

| sheet | 表角色 | 主键 / 分组 | 关键语义 |
|---|---|---|---|
| `WorldBoss` | 玩法总表 | `ID` | 主界面、击退技能、主持人 NPC、问答 / Boss 场景、阶段时间、人数、三类奖励组、提示 / 邮件 |
| `WorldBossQuestion` | 题库 | `QuestionID`，按 `GroupID` 分组 | 问题、答案和权重 |
| `WorldBossQuizReward` | 答题奖励 | `GroupID` 多行 | 正确题数区间、奖励、随机 Buff 组 |
| `WorldBossDamageReward` | 伤害里程碑 | `GroupID` 多行 | 伤害门槛和奖励 |
| `WorldBossRankReward` | 排名奖励 | `GroupID` 多行 | 排名区间和奖励 |
| `BuffRandom` | 战斗 Buff 随机池 | `BuffRandomID` 多行 | 算法、BuffID、权重 |

## 2. 最短链路

```text
WorldBoss.ID
  -> QuestionGroupID -> WorldBossQuestion
  -> QuizRewardGroupID -> WorldBossQuizReward -> BuffRandom -> Buff
  -> DamageRewardGroupID -> WorldBossDamageReward
  -> RankRewardGroupID -> WorldBossRankReward
  -> QuestionSceneID / BossSceneID / BossData -> Scene / Enemy
  -> RepelSkillIDs -> Skill
  -> HostNpc.NpcResID / PosID -> NpcRes / 场景点位
  -> InstructionPromptID / MailTemplateID -> Prompt / MailTemplate
  -> Item / Resource
```

`OpenTime`、`LobbyTime`、`OpenRoomTime`、`QuestionTime`、`PrepareTime`、`BattleTime` 等是不同阶段时长；不要合并成一个“玩法时间”。`LobbyPlayerNumLimit` 与 `OpenRoomPlayerNum` 分别约束大厅和开房人数。

`RepelSkillIDs` 是大厅内按职业选取的技能ID列表，位移与打断仍走 Skill / Effect 链。旧版单值实现中，为0时保留玩家原技能并告警；列表版缺失值处理须随程序接入明确。`HostNpc` 是真实 `NpcInfo`：`NpcResID` 查 `RoleRes.xlsx#NpcRes`，`PosID` 必须命中答题场景点位；缺任一时只跳过主持人，不阻断答题流程。

### 单字段职业击退技能

`RepelSkillIDs` 配置两个 `Skill.SkillID`，使用分号分隔，固定顺序为骑士、巫师：`99000000001;99000000002`。原字段由 `RepelSkillID` 改名为 `RepelSkillIDs`，删除独立的 `KnightRepelSkillID`、`MageRepelSkillID` 两列。

该字段已由单值改为职业有序列表；导出定义／协议及消费者须改为列表，并按职业选取。旧版单个整数读取不兼容该新格式，完成接入前不能视为运行可用。

### 职业击退技能实例（2026-09-15）

骑士技能 `99000000001`、巫师技能 `99000000002` 各自关联同编号的 SkillDirector / InstantTrigger，均使用独立 Buff `10000010`：友方排除自身，一次范围命中后持续外推1秒，无伤害效果；椭圆半径 `140,45`，中心无偏移。旧 Buff `10000009` 保留3秒，不再由上述两技能引用。

两技能均使用 `Picture_Icon_Hero_Knockback`；骑士复用战争践踏前后层与跑步烟雾，巫师复用护盾与跑步烟雾。`RepelSkillIDs` 以分号按骑士、巫师顺序配置上述两技能；列表读取与按职业分发须由程序／协议接入。外推为持续控制，不是固定推距；配置引用闭合不代表游戏内验收。

## 3. 常见误判与反向影响

- `WorldBossQuestion.Answer` 是答案配置，不等于选项列表；当前表结构只有题目、答案和权重，UI 选项来源需按协议 / 需求继续确认。
- `WorldBossQuizReward` 先按答对题数区间取奖励，再通过 `BuffRandomID + BuffCount` 抽 Buff；BuffID 必须命中 `battle/Buff.xlsx`。
- 伤害奖励按阈值，排名奖励按区间，二者不能互换；组内门槛 / 区间需检查重叠和空洞。
- 改场景、Boss、提示或邮件时，必须反查 Scene、Enemy、Prompt、MailTemplate；改奖励继续查 Item / Resource。
- 不要把 `HostNpc` 当场景装饰或图片 ID；它会在答题战斗核中创建 NPC 实体。主持人气泡是客户端表现层驱动，当前待机/说话动画仍需资源动作名闭合。

## 4. 验收清单

- 六个 sheet 均存在，三类奖励组和题库 / Buff 池均能从 `WorldBoss` 总表路由。
- 题库权重、BuffRandom 权重可汇总，奖励区间无重叠 / 空洞。
- SceneID、BossData、BuffID、PromptID、MailTemplateID、奖励三元组引用闭合。
- `RepelSkillIDs` 的两个元素分别命中 Skill 完整链；`HostNpc.NpcResID` 与 `PosID` 分别命中 NpcRes 和场景点位，缺值降级行为已验证。
- 明确区分“配置 / 协议已落地”和“客户端玩法 / 联调已完成”，不把前者写成后者。
