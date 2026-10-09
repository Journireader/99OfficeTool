# 配表参考 / 配置表知识库入口

这里是源表仓的 `配表参考`，也是当前配置表知识库事实源。它的目标不是替代源 Excel，而是让配表人员和工具在进入字段级、sheet 级或跨表引用级判断前，先建立稳定的判断框架。

如果任务只给了表名、字段、ID 或关键词，先走轻索引：

```text
README
  -> 约定/速查表.md
  -> 约定/配表链路运行模型.md
  -> 约定/表到专题索引.md
  -> 命中的 事实卡/*.md
  -> 必要时再读 系统/*.md / 约定/表字段索引.md
```

如果任务已经进入字段级、sheet 级或跨表引用级判断，再继续读 `配表参考/约定/表字段索引.md` 和 `配表参考/约定/索引链检查.md`。

本目录是项目共用的配表参考，不是某个单次任务的临时产物。配表人员和工具都应把它当成配置表工作的第一层路由：先用这里判断系统、主表、支撑表和风险，再进入源 Excel 或可复核副本。不要把无关项目目录、临时任务记录或工具私有规则写进本目录。

“补全”不是把 workbook 名称列进索引就算完成。目标是让没有历史上下文的 agent 能独立回答：每个业务 Sheet 做什么、主键和关键字段是什么、空值和单位怎么读、数组如何展开、引用到哪里、当前由谁消费、哪些字段只是协议保留，以及修改后怎样验收。`全表快照` 只证明结构已盘点，`已验证导航` 只证明能找到入口；二者都不等于语义已补全。没有程序消费证据或业务定案的部分必须原样标出，不能用常识补齐。

使用规则：

1. 先读本文件，确认任务属于哪个系统专题或约定专题。
2. 用 `约定/速查表.md` 和 `约定/表到专题索引.md` 按任务关键词 / 表名 / sheet 名定位第一参考。
3. 再读命中的 `事实卡/*.md`；事实卡解决常见字段语义、跨表引用、反向影响和验收清单。
4. 如果是战斗、怪物、技能、Buff、词缀、圣物、铭文、Trigger 或 I18N 映射，优先从 `系统/战斗_总览.md` 进入。
5. 如果是跨表字段联查、外键完整性或自动检查，先读 `约定/索引链检查.md`，再进具体系统文档。
6. 如果要改源 Excel，先产出任务方案和可复核副本；不要只凭本参考直接写表。
7. 如果吸收新经验、踩坑、排错路径、配置思路或决策记录，只补强已有专题或新增清晰专题；涉及入口变化时同步更新本 README。

给没有后端图谱的 agent：

1. 不要把本目录当全文知识库一口气读完；先用 `约定/表到专题索引.md` 找命中文档，再只读命中的事实卡和系统专题。
2. `事实卡/*.md` 负责快速裁决“该查哪张表、常见误判是什么、修改后要反查什么”；它不是源 Excel 的替代品。
3. `约定/全表快照.md` 只说明当前 `develop/` 有哪些 workbook / sheet 和非空边界，不说明字段语义。
4. `约定/表字段索引.md` 是字段级深读材料；只有需要字段名、数组展开、主业务 sheet 或结构判断时再读。
5. `已验证导航` 仍只是待补语义；任何 `部分确认`、`需确认`、`待补`、`历史` 状态也不能直接作为写源表依据。写表前必须回源 Excel，并按缺口补飞书权威、当前消费者或系统负责人确认。
6. 输出结论时至少带 3 类证据：命中的参考文档、源 Excel 当前读回、需要补查或未确认的支撑表。
7. 如果发现本参考和源 Excel 当前内容冲突，以源 Excel / 飞书权威 / 明确用户确认优先，并回补本目录修正冲突。

标准文字流程图：

```text
需求 / 配表参考 / 飞书口径
  -> 确认目标环境：默认 develop；明确 beta / release 时单独确认
  -> SVN update：develop + 配表参考 + 明确涉及文件
  -> 轻索引：README -> 速查表 -> 表到专题索引
  -> 事实卡：字段语义 / 反向影响 / 验收清单
  -> 系统专题：只读命中的系统文档，不全量扫
  -> 源 Excel 读回：确认当前行、当前 sheet、当前引用值
  -> Relation Gate：文案 / 条件 / 入口 / 奖励 / 资源 / 战斗深链
  -> 分档执行：轻量只读或小改；标准先副本；高风险先结构检查
  -> 产出 / 回填：副本确认后才写源表，正式源表用最小补丁
  -> 产后检查：diff / status / 链路完整性 / 打开性或结构校验
  -> 配表参考回补：字段、结构、语义、引用、命名和 I18N 规则变化必须回补
```

先记住 4 件事：

1. 配置任务默认不是“读完整个配置区”，而是先锁定主表，再补支撑表。
2. 大多数需求都不是只改一张表，而是“主表 + 文案/条件/入口/奖励/资源”一起联动。
3. `system/` 里的很多表不是业务主表，但经常决定一个需求能不能真正落地。
4. 默认先产出可复核副本，通过确认和复核后再回填源表；不要直接改源 Excel。

---

## 一、一次性心智模型

把配置区先理解成 4 类表：

- 主表：定义“这个系统或玩法本身是什么”。
- 支撑表：定义“这个系统怎么被解锁、挂接、触发、跳转”。
- 承接表：定义“这个系统最后落到什么奖励、物品、商店、背包”。
- 表现表：定义“这个系统最终如何被玩家看到”。

后续接到任何配置任务，先回答这 6 个问题：

1. 这次改动的主表是哪张。
2. 这次改动是补行、补字段，还是新结构。
3. 这次改动会不会涉及条件、入口、事件、跳转。
4. 这次改动会不会落到物品、奖励、商店、背包。
5. 这次改动会不会新增文案 key、名称、描述、提示语。
6. 这次改动会不会引用资源、图片、音频、特效、动作或场景。

默认推进顺序只走 4 步：

1. 先锁定主表。
2. 再补支撑表。
3. 再检查承接表和表现表。
4. 最后补漏项和跨表引用。

一句话记忆：

- 主表决定规则。
- 支撑表决定接入。
- 承接表决定结算。
- 表现表决定可见。

### 快速反查习惯

后续如果只给了一个 ID 或一个字段，不要直接认定它是主键。先按下面几类反查：

- 活动 / 礼包：先判 `ActivityID` / `ActCfgID`，再查 `PackID`、`PurchaseID`、`GroupID`、`BindID`、互斥和限购。
- 奖励 / 箱子：先查 `Item` 或资源，再看是否进入固定箱、随机箱、自选箱、装备箱或随机池。
- 养成：先判职业基础、等级经验、装备模板、装备格、时装、黑猎人、幻灵、魂石，再查道具 / 文案 / 条件承接。
- 副本 / 冒险：先从章节、区域、关卡、房间、场景分层读；军团试炼、幻灵梦境和世界 Boss 还要分别核需求冲突、挂机 / 冲刺、答题 / 排名链，再查敌人、任务、掉落和入口。
- 入口 / 解锁：`SystemFunction` 管功能，`Window` 管界面，`Jump` 管跳转，`Condition` 管开放条件，`Prompt` / `I18N` 管玩家可见文案。

如果字段里是分号列表、同 ID 多行、`GC_*` 条件键、`NameID` / `DescriptionID` 文案键，默认继续反查，不按单行结论收口。

---

## 二、目录到语义的快速映射

后续不需要先扫所有文件名，先按目录理解语义：

- `constant/`：系统底层常量、跨系统共享规则。
- `battle/`：技能、Buff、敌人、词缀、战斗行为。
- `role/`：角色属性、动作、模型、挂点、外观表现。
- `develop/`：装备、饰品、圣物、成长养成。
- `dungeon/`：副本、关卡、挑战玩法。
- `adventure/`：挂机、冒险类玩法。
- `scene/`：场景本体。
- `random/`：随机池、随机内容组织。
- `task/`：任务体系。
- `commerce/`：活动排期、售卖链路。
- `reward/`：签到、礼包、基金、任务奖励等承接玩法。
- `system/`：文案、条件、入口、事件、资源、商店等通用支撑层。

实际判断时，优先把需求归到一个主目录，再决定要不要联查 `system/`。

---

## 三、配表参考专题入口

本目录下的 `系统/` 和 `约定/` 是给共享协作沉淀判断规则的地方。后续补强优先写进已有专题，只有确实没有承接位置时再新增文件。

### 0. 经验 / 踩坑 / 思路怎么放

配表参考不是单纯表索引，也承接能复用的配置经验。新增内容先判断它以后会不会指导同类配置：

- 写进 `系统/*.md`：某个系统内可复用的配置思路、踩坑案例、排错路径、跨表链路、历史决策记录。
- 写进 `约定/*.md`：跨系统共用的 ID 规则、字段语义、表头 / 样式 / 产出规范、工具验收方法、通用禁忌。
- 不写进本目录：单次任务过程、临时草稿、只对某个临时产物有意义的中间记录。
- 已有专题能承接时，补强原文件；只有找不到稳定承接点时才新增清晰专题，并把入口补回本 README。

收尾判断按“三问”走：

1. 这条经验是否会改变下次同类配置的做法。
2. 它更像系统知识，还是跨系统约定。
3. 它是否已经被现有专题覆盖；若已有覆盖，只补缺口，不重复造层。

### 1. 系统专题

- `系统/战斗_总览.md`：战斗类任务第一入口，串起 ECE、Skill、Buff、Trigger、词缀、圣物、铭文、怪物 AI 等主题。
- `系统/战斗_ECE管线.md`：Event-Condition-Effect 管线、字典误读、BuffEffectType / BuffType、铭文/爆发组装模式、实施检查清单。
- `系统/战斗_Trigger类型.md`：`LogicalTrigger.Type` 和 `TriggerID` 等 Trigger 配置口径。
- `系统/战斗_I18N映射.md`：战斗相关名称、描述、提示的 I18N 路由。
- `系统/战斗_MonsterAI.md`：怪物 AI 表、Enemy 引用、默认值和行级参数覆盖规则。
- `系统/战斗_RelicAltar.md`：圣火祭坛及圣物相关接入。
- `系统/战斗.md`：战斗实施层细则，含 SkillID / SkillDirectorID 配置口径。
- `系统/养成数值.md`：职业基础、经验成长、装备、装备格强化/共鸣、时装、圣物、黑猎人等养成数值配置入口。
- `系统/副本.md`：副本、冒险、世界狩猎等玩法与关卡链路。
- `系统/I18N.md`：通用文案表使用规则。
- `系统/基础系统.md`：`system/` 下提示、排行、特效、订阅推送等通用支撑表的配置口径。
- `系统/军团.md`：`Guilds.xlsx` 的基础常量、等级权限、捐献任务、旗帜入口、分红和军团科技。
- `系统/商业化.md`、`系统/奖励.md`、`系统/词缀圣物.md`、`系统/骑士技能.md`、`系统/骑士时装.md`：对应业务域的主表和联查入口。

### 2. 约定专题

- `约定/速查表.md`：agent 和人工的超短入口，先按任务类型压缩阅读范围。
- `约定/配表链路运行模型.md`：主表、支撑表、承接表、表现表和运行边界的通用判断框架。
- `约定/表到专题索引.md`：按 workbook / sheet 路由到第一参考、事实卡、联查文档和确认状态。
- `约定/事实卡模板.md`：新增或重构事实卡时使用的统一格式。
- `约定/全表快照.md`：当前 `develop/` workbook / sheet 非空边界快照，只作导航。
- `约定/表字段索引.md`：字段级、sheet 级、跨表引用级判断入口。
- `约定/索引链检查.md`：跨系统字段联查、直接外键、上下文分流、服务端边界和自动检查规则。
- `约定/ID编码规范.md`：EnemyId、MonsterResID、SkillID、SkillDirectorID 等编号规则。
- `约定/产出规范.md`：配表产出、版本、校验、交付格式约定。
- `约定/配表执行经验.md`：跨系统配表踩坑、定位、回填、xlsx 写入边界和验收方法。
- `约定/战斗术语对照表.md`：战斗专题统一术语。

### 3. 事实卡

事实卡给没有后端图谱的 agent 做低成本裁决。它不是临时任务记录，只沉淀稳定事实、常见误判、反向影响和验收清单。新增或维护事实卡前先读 `事实卡/README.md`。

- `事实卡/I18N.md`：I18N、Prompt、TermLink 文案归属和富文本词条。
- `事实卡/资源表现链.md`：Picture、Resource、Audio、Animation、SpecialEffect、Window 和角色资源链。
- `事实卡/Condition.md`：通用条件树、`GC_*`、`SubConditionIDs` 和 ConditionParams 风险。
- `事实卡/入口跳转.md`：SystemFunction、Jump、Window、Guide、AVG 接入链。
- `事实卡/Item_Random_Reward.md`：Item、Random、Reward、Store、bag 和奖励三元组。
- `事实卡/Equip_Attribute_Random.md`：装备模板、装备格、属性枚举、装备随机池和装备箱链。
- `事实卡/Cultivation_Systems.md`：职业、经验、装备格、时装、圣物、黑猎人和属性聚合链。
- `事实卡/Skill_Inscription.md`：Skill、SkillDirector、Inscription 和战斗深链入口。
- `事实卡/Inscription_Attribute_Random.md`：铭文升级、进阶、共鸣属性和铭文抽取随机链。
- `事实卡/MonsterAI.md`：MonsterAI、EnemyAI 和怪物行为参数边界。
- `事实卡/Adventure.md`：Adventure 章节、区域、关卡、房间和掉落等级链。
- `事实卡/Dungeon_System.md`：Dungeon、PiggyDungeon、NewBieDungeon、BloodSearch、Arena 副本玩法链。
- `事实卡/WorldHunting.md`：WorldHunting 当前 Excel 配表链、弃用结构和程序未同步风险。
- `事实卡/Activity_Commercial.md`：ActivitySchedule、ActivityInfo、AutoPopup、PurchaseList、MultiTaskAct、StoresAct 和 reward 表活动链。
- `事实卡/Pet_System.md`：Pet 本体培养、PetRamdom 召唤和 PetDream 幻灵梦境链。
- `事实卡/SoulStone.md`：魂石套装、强化、重铸、炼魂、突破和图鉴链。
- `事实卡/SoulStoneDungeon.md`：魂石副本常量、Boss、房间、按星期与职业掉落规则。
- `事实卡/Guild_Activity.md`：GuildTrial 已接入结构和 UltimateGuilds 客户端已接、服务端待确认边界。
- `事实卡/WorldBoss.md`：巨兽讨伐答题、Boss、伤害 / 排名奖励和 Buff 随机链。
- `事实卡/Friends.md`：好友容量、推荐、申请时效、赠领道具与删除消耗。
- `事实卡/Ad.md`：广告开关、每日次数、间隔、通用奖励与业务侧收益边界。

---

## 四、首轮只读最小集

如果任务还不够具体，不要直接广撒网。默认首轮只读下面这些层级：

### 1. 固定必读

- 本文件
- `/Users/Shared/FF配置表/策划/数据表/配表参考/约定/速查表.md`
- `/Users/Shared/FF配置表/策划/数据表/配表参考/约定/配表链路运行模型.md`
- `/Users/Shared/FF配置表/策划/数据表/配表参考/约定/表到专题索引.md`
- 命中的 `事实卡/*.md`
- 最接近需求的 `系统/*.md` 或 `约定/*.md`

`约定/表字段索引.md` 不再作为所有任务的首轮固定全文读物；只有进入字段级、sheet 级、参数级或结构判断时再读，避免轻量任务一开始就吃完整字段索引。

### 2. 高概率联动表

下面这些表是最常见的二轮联查对象：

- `/Users/Shared/FF配置表/策划/数据表/develop/system/I18N.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Prompt.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Condition.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/SystemFunction.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Guide.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Jump.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/battle/BattleEvent.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/SystemEvent.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Item.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Store.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/bag.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/random/Random.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Resource.xlsx`

### 3. 什么时候继续扩读

- 涉及玩家可见名称、描述、提示：补读 `I18N.xlsx` 和 `Prompt.xlsx`
- 涉及解锁、显示、开启、触发：补读 `Condition.xlsx`
- 涉及入口、按钮、页签、系统开放：补读 `SystemFunction.xlsx`、`Guide.xlsx`、`Jump.xlsx`
- 涉及事件驱动：补读 `battle/BattleEvent.xlsx`（战斗事件）、`system/SystemEvent.xlsx`（系统级事件）
- 涉及奖励、掉落、售卖：补读 `Item.xlsx`、`Store.xlsx`、`bag.xlsx`
- 涉及箱子奖励：补读 `Item.xlsx` 的 `GuaranteedChest` / `RandomChest` / `SelectionChest` / `EquipChest`
- 涉及随机池：补读 `random/Random.xlsx`
- 涉及自动弹窗：补读 `commerce/AutoPopup.xlsx`
- 涉及订阅推送：补读 `system/Subcribe.xlsx`
- 涉及图片、音频、特效、界面、立绘：补读 `Resource.xlsx`、`Picture.xlsx`、`Audio.xlsx`、`Animation.xlsx`、`SpecialEffect.xlsx`、`Window.xlsx`、`Avatar.xlsx`、`Emoji.xlsx`

这套最小集的作用，是先让 AI 建立“表角色判断”。如果已经需要判断字段、sheet 或引用结构，就不要只停在这里，直接进入 `配表参考/约定/表字段索引.md`。

---

## 五、表角色索引

这一节不是按目录列文件，而是按“表在任务中的角色”来记。

### 1. 通用支撑表

这些表经常不是主表，但几乎每轮需求都会碰到：

#### 文案与显示

- `/Users/Shared/FF配置表/策划/数据表/develop/system/I18N.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Prompt.xlsx`

#### 条件、入口与系统挂接

- `/Users/Shared/FF配置表/策划/数据表/develop/system/Condition.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/SystemFunction.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Guide.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Jump.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/battle/BattleEvent.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/SystemEvent.xlsx`

#### 资源、界面与表现

- `/Users/Shared/FF配置表/策划/数据表/develop/system/Resource.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Picture.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Audio.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Animation.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/SpecialEffect.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Window.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Avatar.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Emoji.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/AVG.xlsx`

#### 奖励、物品与商业承接

- `/Users/Shared/FF配置表/策划/数据表/develop/system/Item.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Store.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/bag.xlsx`

#### 系统级基础配置

- `/Users/Shared/FF配置表/策划/数据表/develop/constant/Const.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/constant/Friends.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/RankInfo.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Guilds.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Ad.xlsx`

### 2. 业务主表

#### 战斗主表

- `/Users/Shared/FF配置表/策划/数据表/develop/battle/Skill.xlsx`（含 Inscription sheet — 铭文配置）
- `/Users/Shared/FF配置表/策划/数据表/develop/battle/SkillDirector.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/battle/Buff.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/battle/Affix.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/battle/Enemy.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/battle/EnemyAttrGrow.xlsx`

战斗配置表引用关系：

```
Skill.SkillDirectorID → SkillDirector（技能演出编排）
Skill.CastEventID → BattleEvent 实例（被动技能触发时机）
Skill.Effects#N.TypeID → Effect 字典（效果类型编号）
Buff.Effects#N.EventID → BattleEvent 实例（Buff 效果触发时机，与 Skill.CastEventID 同源）
Buff.Effects#N.TypeID → Effect 字典（效果类型编号）
Affix.SkillIDs → Skill（词缀挂载的被动技能列表）
Relic → Skill（圣物挂载的被动技能列表）
Inscription sheet → Skill（铭文按品阶切换技能 ID）
```

详细架构和配表执行口径见：`配表参考/系统/战斗_总览.md`、`配表参考/系统/战斗_ECE管线.md`
枚举参数以飞书 `FF战斗字典备份` 和源表实例 `battle/BattleEvent.xlsx` / `battle/BattleCondition.xlsx` 为准。

**战斗专题（2026-04-29 整合）**：
- **第一份要读**：`配表参考/系统/战斗_总览.md`（9 主题 ECE 接入图 + 跨表引用全景 + 文档导航）
- 配 ECE 体系前必读：`配表参考/系统/战斗_ECE管线.md`（管线 + 字典误读 + BuffEffectType / BuffType + 常用模式 + 字典盲区 + 检查清单）
- Trigger 字段：`配表参考/系统/战斗_Trigger类型.md`
- I18N 路由：`配表参考/系统/战斗_I18N映射.md`
- 圣火祭坛：`配表参考/系统/战斗_RelicAltar.md`
- 配表实施层（含 SkillID 编码）：`配表参考/系统/战斗.md`
- 术语口径：`配表参考/约定/战斗术语对照表.md`
- AI 完整设计（与 ECE 解耦）：飞书 AI 系统原文 `https://www.feishu.cn/docx/B1H1d7X0Fo0clax59r9cwaM4nRb`

常见联查：

- `/Users/Shared/FF配置表/策划/数据表/develop/role/Attribute.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/role/Action.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/battle/Relic.xlsx`（圣物，通过 SkillIDs 挂载被动技能）
- `/Users/Shared/FF配置表/策划/数据表/develop/system/I18N.xlsx`

#### 角色与表现主表

- `/Users/Shared/FF配置表/策划/数据表/develop/role/Attribute.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/role/Action.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/role/RoleRes.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/role/PrimaryProfession.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/role/EquipModel.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/role/HangingPoint.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/role/NudeModel.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/role/State.xlsx`

#### 装备与养成主表

- `/Users/Shared/FF配置表/策划/数据表/develop/role/PrimaryProfession.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/role/Attribute.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/develop/Equip.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/develop/EquipGrid.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/develop/Exp.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/develop/Adornment.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/battle/Relic.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/battle/Probability.xlsx`（Skill / Buff 共用固定 / 累积概率常量）
- `/Users/Shared/FF配置表/策划/数据表/develop/develop/BlackHunter.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/develop/Pet.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/develop/SoulStone.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/random/PetRamdom.xlsx`

第一入口：`配表参考/系统/养成数值.md`。

常见联查：

- `/Users/Shared/FF配置表/策划/数据表/develop/system/Item.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/I18N.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/role/RoleRes.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Condition.xlsx`

#### 副本、玩法与场景主表

- `/Users/Shared/FF配置表/策划/数据表/develop/dungeon/Dungeon.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/dungeon/NewbieDungeon.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/dungeon/Arena.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/dungeon/BloodSearch.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/dungeon/WorldHunting.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/dungeon/PiggyDungeon.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/dungeon/GuildTrial.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/dungeon/PetDream.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/dungeon/WorldBoss.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/dungeon/SoulStoneDungeon.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/adventure/Adventure.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/adventure/OnlineAfk.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/task/Task.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/scene/Scene.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/random/Random.xlsx`

常见联查：

- `/Users/Shared/FF配置表/策划/数据表/develop/battle/Enemy.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/battle/BattleEvent.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Condition.xlsx`

#### 商业化与活动主表

- `/Users/Shared/FF配置表/策划/数据表/develop/commerce/ActivitySchedule.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/commerce/PurchaseList.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/commerce/StoresAct.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/commerce/UltimateGuilds.xlsx`（军团冲刺源表；客户端展示已接入，服务端积分/结算链待确认）
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/Sign0.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/NewServerPrivilege.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/NewServerRank.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/UniversalFund.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/PrivilegeCard.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/LimitPackage.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/MultiTaskAct.xlsx`（当前正式多任务活动表；旧 `commerce` 同名表已删除）
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/PromoPack.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/StarterPack.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/DailyTask.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/BlackGold.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/TargetRush.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/MultiStageGiftPack.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/reward/Carnival.xlsx`

常见联查：

- `/Users/Shared/FF配置表/策划/数据表/develop/system/Item.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/I18N.xlsx`
- `/Users/Shared/FF配置表/策划/数据表/develop/system/Store.xlsx`

---

## 六、按任务反推查表路径

下面这部分是给后续配表直接套用的，不需要每次重新组织语言。

### 1. 我要新做一个系统

默认顺序：

1. 找最接近的主表。
2. 查 `I18N.xlsx`。
3. 查 `Condition.xlsx`。
4. 看是否需要 `SystemFunction.xlsx`、`Guide.xlsx`、`Jump.xlsx`。
5. 看是否要落到 `Item.xlsx`、`Store.xlsx`、`Resource.xlsx`。

### 2. 我要补一个玩法或副本

默认顺序：

1. 对应 `dungeon/` 或 `adventure/` 主表。
2. `scene/Scene.xlsx`。
3. `battle/Enemy.xlsx`。
4. `battle/BattleEvent.xlsx`（战斗事件）/ `system/SystemEvent.xlsx`（系统级事件）。
5. `system/Condition.xlsx`。
6. `system/I18N.xlsx`。

### 3. 我要补技能、Buff、词缀或敌人

默认顺序：

0. 先读 `配表参考/系统/战斗_总览.md` 和 `配表参考/系统/战斗_ECE管线.md` 理解 Event-Condition-Effect 管线。
1. `battle/Skill.xlsx` 或 `battle/Buff.xlsx`。
2. `battle/SkillDirector.xlsx`。
3. `battle/Affix.xlsx`。
4. `battle/Enemy.xlsx`。
5. `role/Attribute.xlsx`。
6. `role/Action.xlsx`。
7. `system/I18N.xlsx`。
8. 枚举参数查飞书 `FF战斗字典备份`；事件 / 条件实例查 `battle/BattleEvent.xlsx`、`battle/BattleCondition.xlsx`。

### 4. 我要补装备、时装、资源表现

默认顺序：

1. `develop/Equip.xlsx` 或 `develop/Adornment.xlsx`。
2. `role/RoleRes.xlsx`。
3. `role/EquipModel.xlsx`。
4. `system/Item.xlsx`。
5. `system/I18N.xlsx`。
6. `system/Resource.xlsx` 及相关表现表。

### 5. 我要补活动、礼包、付费链路

默认顺序：

1. `commerce/ActivitySchedule.xlsx`。
2. `commerce/PurchaseList.xlsx`。
3. `commerce/AutoPopup.xlsx`（需要自动弹窗时）。
4. 对应 `reward/` 主表。
5. `system/Item.xlsx`（含箱子 sheet）。
6. `random/Random.xlsx`（奖励走随机池时）。
7. `system/I18N.xlsx`。
8. `system/Store.xlsx`。

---

## 七、标准任务模板

后续在真正开始配表前，建议先把任务整理成下面这个最小模板：

```md
主表：
支撑表：
承接表：
表现表：
本次改动类型：补行 / 补字段 / 改结构 / 新增配套
新增文案：
新增条件：
新增入口或跳转：
新增奖励或物品：
新增资源引用：
跨表主键或外键：
```

如果是跨多个系统的任务，至少显式写出：

- 主表是什么
- 关联表有哪些
- 编号规则是什么
- 哪些字段是引用字段
- 手动粘贴顺序是什么

这一步的目标，是把“脑内理解”提前变成“外显结构”，避免后续接手者重新猜。

如果这里面有任何一项答不上来，优先去 `配表参考/约定/表字段索引.md` 补齐，而不是凭表名猜。

---

## 八、最容易漏的关联

配置任务最常见的漏项，不是主表本身，而是这些“跟着一起补”的部分：

- 名称、描述、提示语没有补到 `I18N.xlsx`
- 提示反馈和引导文案没有补到 `Prompt.xlsx`
- 解锁或显示条件没有补到 `Condition.xlsx`
- 入口、跳转、引导没有补到 `SystemFunction.xlsx`、`Guide.xlsx`、`Jump.xlsx`
- 事件触发加了，但 `battle/BattleEvent.xlsx` 或 `system/SystemEvent.xlsx` 没补齐
- 奖励最终落到 `Item.xlsx` 时，没有补完文案、资源或背包承接
- 表现资源引用了图、音频、特效、窗口，但对应资源表没补
- 改了主键、外键或编号规则，却没有同步检查引用表
- 玩法主表补了规则，但场景、敌人、任务、随机池没有同步联查

---

## 九、使用边界

- 这里列的是源表入口，不代表可以直接改这些 Excel
- 配置任务默认按 FF 源表执行推进：先产出可复核副本，通过确认和复核后再回填源表
- 正式回填前，优先先做可复制粘贴的 `tsv / md` 产出稿
- 如果新增、拆分、重命名了表，记得同步更新这份入口

这份文档的目标不是“把所有表名背下来”，而是让后续接手者在第一次进入配置区时，就先知道：

- 该先读什么
- 为什么读这些
- 哪些表只是支撑，不要误判成主表
- 哪些漏项最容易在补表时被忘掉
