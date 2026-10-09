# 事实卡：GuildTrial / UltimateGuilds

## 0. 元信息

- 源 Excel：`develop/dungeon/GuildTrial.xlsx`、`develop/commerce/UltimateGuilds.xlsx`
- 需求证据：[【FF】军团试炼](https://forever9.feishu.cn/wiki/FL7ZwSxT3iEPlpkzu6Fcajc5nFg)；军团冲刺需求标题与 revision 由下方后端设计文档记录
- 设计证据：`/Users/Shared/FingertipFantasy-server/docs/guilds/ultimate-guilds-backend-design.md`
- 最近验证：2026-08-21 / SVN r5020 / 源表、proto/client/server 只读检索
- 状态：`GuildTrial` 已有正式运行链但需求拟表名与源表不一致；`UltimateGuilds` 的 client proto、配置加载和详情展示已接入，服务端正式积分/结算链仍需按当前代码继续确认
- 第一参考：`系统/副本.md`、`系统/商业化.md`、`事实卡/Item_Random_Reward.md`

## 1. GuildTrial 已验证事实

当前 `GuildTrial.xlsx` 只有 3 个 sheet：

| sheet | 表角色 | 主键 / 分组 | 运行语义 |
|---|---|---|---|
| `GuildTrialConst` | 常量 | string `ID` | `Int / String / Ints / Strings` 多类型常量；挑战费用由服务端从常量读取 |
| `GuildTrialBoss` | Boss 主表 | `ID` | Scene、BossData、挑战 / 末击 / 首杀奖励、排名奖励组 |
| `GuildTrialRankReward` | 排名奖励 | `RankRewardGroupID` 多行 | 排名区间与奖励 |

```text
GuildTrialConst
  -> GuildTrialBoss.SceneID + BossData
  -> ChallengeReward / LastHitReward / FirstKillReward
  -> GuildTrialRankReward.RankRewardGroupID
  -> Scene / Enemy / Item / Mail
```

需求拟有 `GuildTrial`、`GuildTrialChallengeCost`，但当前 r5020 源表没有这两个 sheet。正式代码 `guildtrial/internal/di/config.go` 当前通过 `GuildTrialConst` 取挑战费用；不能按需求稿名称自行新增、改名或迁移。

## 2. UltimateGuilds 当前接入事实

`UltimateGuilds.xlsx` 是军团冲刺，不是 GuildTrial：

| sheet | 表角色 | 关键内容 |
|---|---|---|
| `c.UltimateGuilds` | 活动常量 | 活动 ID、每日奖励、三类玩法的积分获取展示文本 |
| `UltimateGuildsRankReward` | 排名奖励 | 会长、管理者、普通成员三类奖励 |
| `UltimateGuildsIntegral` | 积分来源 | 积分类型、任务目标和积分值 |
| `UltimateGuildsIntegralReward` | 积分档位奖励 | 积分类型、门槛和奖励 |
| `UltimateGuildsText` | 积分获取方式文本 | 按 `IntegralType` 分组，`UltimateGuildsRank` / `UltimateGuildsText` 均为 `I18N#UltimateGuilds` key |

当前 client proto 已定义 5 类 `UltimateGuilds` 配置，客户端配置模块加载 `UltimateGuildsText`，军团冲刺详情页按 `IntegralType` 读取两段 I18N 富文本。`UltimateGuildsIntegral` 已删除旧 `ID` 列，查找粒度改为积分类型 + 任务目标；旧文档不得继续要求独立行 ID。服务端 Go 非生成源码的本轮检索未闭合正式积分累计、排名结算和发奖消费者，因此不能仅凭客户端已接入写成整条玩法已上线。

当前源表把会长奖励和积分 / 奖励值分别写在 `PreCost` 一类字段中，命名与“奖励 / 积分状态”语义不一致；后端设计也明确提出不能沿用该命名。接入前必须统一 proto、代码和表头，参考层不替它做映射定案。

## 3. 反向影响与验收

- GuildTrial 改 Boss / 奖励时，反查 Scene、Enemy、Item、Mail 和排名组区间；挑战费用仍按 `GuildTrialConst` 代码口径。
- 若要把需求稿的 `GuildTrialChallengeCost` 落地，必须先确认是修改需求文档、扩 proto/code，还是迁移现有常量；未定前阻塞结构写入。
- UltimateGuilds 修改需闭合活动排期、积分事件、排名结算、成员身份奖励、`UltimateGuildsText -> I18N#UltimateGuilds` 和客户端入口；只发布 `.bytes` 不算完整接入。
- 两个系统都属于军团业务，但键、周期、结算和奖励职责不同，禁止混表或共用“军团活动 ID”推断。
