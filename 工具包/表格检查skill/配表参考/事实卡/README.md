# 事实卡入口

事实卡是给 agent 和配表人员做快速裁决的轻事实层。它不替代源 Excel，也不替代 `系统/*.md` 长文；它负责把稳定事实、常见误判、反向影响和验收清单压缩成可读的小卡。

## 使用顺序

```text
任务关键词 / 表名 / ID
  -> 约定/速查表.md
  -> 约定/表到专题索引.md
  -> 命中的事实卡
  -> 源 Excel 当前行读回
  -> 必要时读系统专题 / 表字段索引
```

## 事实卡使用契约

1. 事实卡只回答“先查什么、怎么分流、哪里容易错、改完反查什么”。
2. 事实卡里的源表路径、字段语义和链路说明必须回源 Excel 读回后才能用于写表。
3. `状态=已验证` 表示导航和已读事实可作为首轮依据，不等于当前每个 ID / key 都完整。
4. `状态=部分确认 / 需确认 / 历史保留` 时，只能作为线索；涉及写源表、删行、改 ID 或改引用前必须补证据。
5. 事实卡与系统专题冲突时，先查源 Excel 当前内容；确认后同步修正事实卡和索引。
6. 新增事实卡时必须同步 `../约定/表到专题索引.md`，否则其它 agent 找不到入口。

## 当前事实卡

| 事实卡 | 覆盖 |
|---|---|
| `I18N.md` | I18N、Prompt、TermLink 文案归属和富文本词条 |
| `资源表现链.md` | Picture、Resource、Audio、Animation、SpecialEffect、Window 和角色资源链 |
| `Condition.md` | 通用条件树、`GC_*`、`SubConditionIDs` 和 ConditionParams 风险 |
| `入口跳转.md` | SystemFunction、Jump、Window、Guide、AVG 接入链 |
| `Item_Random_Reward.md` | Item、Random、Reward、Store、bag 和奖励三元组 |
| `Equip_Attribute_Random.md` | 装备模板、装备格、属性枚举、装备随机池和装备箱链 |
| `Cultivation_Systems.md` | 职业、经验、装备格、时装、圣物、黑猎人和属性聚合链 |
| `Skill_Inscription.md` | Skill、SkillDirector、Inscription 和战斗深链入口 |
| `Inscription_Attribute_Random.md` | 铭文升级、进阶、共鸣属性和铭文抽取随机链 |
| `MonsterAI.md` | MonsterAI、EnemyAI 和怪物行为参数边界 |
| `Adventure.md` | Adventure 章节、区域、关卡、房间和掉落等级链 |
| `Dungeon_System.md` | Dungeon、PiggyDungeon、NewBieDungeon、BloodSearch、Arena 副本玩法链 |
| `WorldHunting.md` | WorldHunting 章节、Boss、房间、任务、随机池和奖励链 |
| `Activity_Commercial.md` | ActivitySchedule、ActivityInfo、AutoPopup、PurchaseList 和 reward 表活动链 |
| `Pet_System.md` | Pet 养成、PetRamdom 抽卡和 PetDream 幻灵梦境链 |
| `SoulStone.md` | 魂石本体、套装、强化、重铸、炼魂、突破和图鉴链 |
| `SoulStoneDungeon.md` | 魂石副本常量、Boss、房间、按职业掉落规则和程序接入边界 |
| `Guild_Activity.md` | GuildTrial 已接入事实与 UltimateGuilds 客户端已接、服务端待确认边界 |
| `WorldBoss.md` | 世界 Boss 题库、战斗、三类奖励和 Buff 随机链 |
| `Friends.md` | 好友容量、推荐池、申请时效、赠领道具与删除消耗 |
| `Ad.md` | 广告场景开关、自然日次数、触发间隔与通用发奖边界 |

新增事实卡先复制 `../约定/事实卡模板.md` 的结构，并同步 `../约定/表到专题索引.md`。
