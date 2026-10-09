# 事实卡：Activity / AutoPopup / Purchase

## 0. 元信息

- 源 Excel：`develop/commerce/ActivitySchedule.xlsx`、`develop/commerce/AutoPopup.xlsx`、`develop/commerce/PurchaseList.xlsx`、`develop/commerce/StoresAct.xlsx`、`develop/reward/MultiTaskAct.xlsx`
- 关联源 Excel：`develop/reward/*.xlsx`、`develop/system/Condition.xlsx`、`develop/system/SystemFunction.xlsx`
- 最近验证：2026-08-21 / SVN r5020 / 源表全 sheet + proto + client/server 只读代码
- 状态：运行链路已验证；单个活动业务规则仍按对应 reward 表和飞书策划确认
- 第一参考：`系统/商业化.md`、`系统/奖励.md`、`约定/配表链路运行模型.md`

## 1. 表事实

| Sheet | 表角色 | 主键 / 分组 | 运行侧读取 |
|---|---|---|---|
| `ActivitySchedule` | 活动开放窗口 | list；`ActSchedID` 标识排期 | 服务端活动中心读取，`ConditionID` 走公共 Condition |
| `ActivityInfo` | 活动入口 / 展示配置 | `@cfg:groupmap\|ActType\|ActConfigID` | 按活动类型和配置 ID 找展示信息；`ThemeResID` 选择活动主题资源目录 |
| `ActivitySetSchedule` | 活动合集 | list | 多活动排期对齐 |
| `AutoPopup` | 自动弹窗行 | list；`Type + GroupID + Index` 组成行级弹窗身份 | 客户端按弹出时机、事件和参数过滤 |
| `AutoPopupGroup` | 弹窗组 | `GroupID` | 组级优先级和同组限制 |
| `PurchaseList` | 支付 SKU | `@cfg:group\|PurchaseID` | 客户端支付按钮按 `PurchaseID` 查价格和商品类型 |
| `MultiTaskAct` | 多任务活动内容 | `ActCfgID` 多行 | 服务端按活动配置 ID 装载任务、进度与领取；任务结构复用 `TaskItemConfig` |
| `StoresAct` | 活动商店商品 | `ActCfgID + GoodsID` | 服务端按活动配置 ID组织商品，现金档走 `PurchaseID`，道具档走 `Costs` |

最短链路：

```text
ActivitySchedule.ActType + ActConfigID
  -> ActivityInfo.ActType + ActConfigID
  -> 对应 reward 业务表的 ActCfgID / ActivityID
  -> reward 表内 PackID / StageID / Round / Index 等业务组织字段
  -> PurchaseID -> PurchaseList
  -> Loots / Reward / Product -> Item / Resource / Chest / Random

AutoPopup.PopupType
  -> LOGIN 或 TRIGGER_EVENT
  -> AutoPopup.Type 选择业务弹窗控制器
  -> TriggerEvent + Params 做事件匹配
  -> 业务模块二次校验活动可用、功能解锁、购买/领取状态

ActivitySchedule.ActConfigID
  -> MultiTaskAct.ActCfgID -> TaskItemConfig -> Loot
  -> StoresAct.ActCfgID + GoodsID -> Costs / PurchaseID -> Loots
```

## 2. 运行规则

| 规则 | 代码验证口径 |
|---|---|
| 活动排期条件 | `ActivitySchedule.ConditionID` 服务端调用公共 `Condition.CheckConditionIDRetBool`；空条件视为通过 |
| 活动中心三层 | `ActivitySchedule` 管时间窗，`ActivityInfo` 管入口/展示，下游 reward 表管具体内容 |
| 活动主题资源 | `ActivityInfo.ThemeResID` 是主题皮目录号，客户端按 `Prefabs/{id}`、`Textures/.../{id}` 解析；不是 `PictureID` |
| 登录弹窗时机 | 客户端等 `GameStart 完成` 和 `ACTIVITY_INFO_INIT` 两个信号都完成后才跑登录弹窗队列 |
| 事件弹窗匹配 | `AutoPopup.TriggerEvent` 必须等于事件类型；`AutoPopup.Params` 必须全部包含在事件参数里，顺序不重要，事件可以多带参数 |
| 弹窗去重 / 限次 | 同批按 `AUTO_POPUP_TYPE + GroupID + Index` 去重；每日 / 总次数也是按这组行级身份记数 |
| 弹窗优先级 | 优先取 `AutoPopupGroup.Priority`，组不存在时按行配置回退；`GroupID` 是弹窗组，不是礼包组 |
| 付费商品 | `PurchaseID` 是字符串支付项；`PackID` / `GroupID` / `StageID` 不等于 `PurchaseID` |
| 多任务活动 | `MultiTaskAct` 按 `ActCfgID` 聚合多条任务；任务目标和奖励不能只抽一行判断 |
| 活动商店 | `StoresAct.PaymentType` 决定道具成本或支付链；时间窗、内嵌 Condition、限购和广告场景分别检查 |

## 3. 常见活动键

| 业务表 | 活动键 | 内容组织 |
|---|---|---|
| `StarterPackGroup` | `ActCfgID` | 同活动下按 `PackID` 拆礼包；`PurchaseID` 接支付 |
| `StarterPackInfo` | `PackID` | 同礼包按 `Day` 拆每日奖励 |
| `PromoPackDaily` / `PromoPackWeekly` | `ActivityID + PackIndex` | `PackIndex` 从 1 开始，客户端按稀疏数组对齐 |
| `DailyPromo` | `ActivityID + DailyPromoType` | 同活动同主题下有多个 `PackIndex` |
| `LimitPackage` | `ActCfgID` | 还要看 `GroupID`、`BindID`、`MutexGroupID`、触发次数和限购 |
| `MultiStageGiftPack` | `ActivityID` | 礼包内容按 `StageID + Index` 分行 |
| `MultiStageGiftPackStage` | `ActivityID` | 阶段奖励按 `StageID` 分行 |
| `UniversalFund` / `UniversalFundPurchase` | `ActivityID` | 基金档位和付费态分表维护 |
| `TargetRush*` | `ActCfgID` | Info / Task / Pack / Store 共用活动键 |
| `NewServerPrivilege` | `Round + ID` | `NewServerRound.PurchaseID` 管购买；等级配置 ID 通常按轮次和等级组织 |

## 4. 禁止推断

- 不要把 `ActSchedID`、`ActConfigID`、`ActivityID`、`PackID`、`GroupID`、`BindID` 混成一个“活动 ID”。
- 不要只配 reward 表就认为活动上线；没有 `ActivitySchedule` / `ActivityInfo`，入口和开放窗口可能缺失。
- 不要只配 `PurchaseID` 就认为商品可买；还要确认业务表内容、`PurchaseList`、功能解锁和活动可用状态。
- 不要把 `AutoPopup.Params#1` 当唯一参数；事件匹配是包含关系。
- 不要把 `AutoPopupGroup.GroupID` 和 `LimitPackage.GroupID` 当同一业务概念。
- 不要把 `StoresAct.GoodsID`、`MultiTaskAct.TaskID` 当活动 ID；它们都挂在 `ActCfgID` 下。
- 不要把 `ActivityInfo.ThemeResID` 当 `PictureID` 或图片表外键；它承载一整套主题资源目录。
- `commerce/MultiTaskAct.xlsx` 已于 SVN r6458 删除；当前正式多任务活动表只有 `reward/MultiTaskAct.xlsx`，旧路径不得继续作为来源。
- `MultiTaskAct` / `StoresAct` 当前没有单独策划需求文档时，以 r5020 源表、proto 和正式代码消费为语义事实，不用迁移文档中的旧状态覆盖。

## 5. 反向影响

| 改动类型 | 必查反向引用 | 必补支撑 | 阻塞 / 需确认 |
|---|---|---|---|
| 新活动排期 | ActivityInfo、业务 reward 表 | Condition / I18N / 入口 | ActType 是否支持同类型多开 |
| 新付费礼包 | PurchaseList、业务表、奖励内容 | I18N / Item / Store 或活动入口 | PurchaseID 缺失或类型不匹配 |
| 新自动弹窗 | AutoPopupGroup、业务模块可展示条件 | SystemFunction / Condition / ActivityInfo | 弹窗 Type 未接控制器 |
| 改活动键 | 所有同键业务 sheet | reward / purchase / popup | 旧键仍被引用时阻塞 |
| 改事件弹窗参数 | 触发事件来源代码或 SystemEvent | AutoPopup Params | 不清楚事件携带哪些参数时阻塞 |
| 新 MultiTaskAct 任务 | 同 `ActCfgID` 任务组、TaskType、进度存储 | ActivitySchedule / I18N / Loot | 任务事件未接 taskengine 时阻塞 |
| 新 StoresAct 商品 | 同活动商品组、限购和时间窗 | ActivitySchedule / Item / PurchaseList / Ad / Condition | PaymentType 与 Costs / PurchaseID 不一致时阻塞 |

## 6. 验收清单

- `ActivitySchedule -> ActivityInfo -> 业务 reward 表` 能按同一活动键串通。
- 付费项 `PurchaseID` 能命中 `PurchaseList`，且业务表中的礼包内容存在。
- 自动弹窗 Type 已有客户端控制器，`PopupType / TriggerEvent / Params` 与触发来源匹配。
- 涉及功能解锁时，`SystemFunction.UnlockCondID` 和 `Condition` 已补齐。
- 涉及奖励时，`Loots / Reward / Product` 已继续查到 Item / Resource / Chest / Random。
- 涉及玩家可见文本或图片时，I18N / Prompt / Picture / Window / Jump 已列入证据。
- 使用 `ThemeResID` 的活动已确认对应主题目录存在；未填时按业务模块的无主题降级口径处理。
- `MultiTaskAct` 能按 `ActCfgID + TaskID` 读出任务、进度和奖励；`StoresAct` 能按 `ActCfgID + GoodsID` 区分道具购买与支付购买。
