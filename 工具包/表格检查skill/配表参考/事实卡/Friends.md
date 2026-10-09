# Friends 好友常量

## 0. 元信息

- 事实源：`develop/constant/Friends.xlsx#c.FriendsConst`
- 最近验证：2026-09-21 / SVN r6595 / Excel 全量读回；proto `0e483c70a630`；client `b93928d94c98`；server `f5bb1bc2f786`
- 状态：已验证字段结构与当前主要消费者；数值仍以源 Excel 当次读回为准
- 适用范围：好友数量、黑名单、推荐池、申请有效期、赠领道具、删除好友消耗
- 禁止推断：字段存在不等于当前仍按该字段限次；`GivePropLimit`、`GetPropLimit` 见下方当前消费边界

## 1. 表事实

| 项 | 内容 |
|---|---|
| 表角色 | 支撑表 / 好友系统常量 |
| workbook / sheet | `constant/Friends.xlsx#c.FriendsConst` |
| 行结构 | 纵向常量表：A 列键名、B 列值、C 列说明；第 1 行是表头，第 2 行开始每行一个键 |
| 协议结构 | `FriendsConstConfig`，`@cfg:struct`；不是按 ID 查行的 map |
| 当前表内键数 | 16；proto 另有 `SupportCursorQuery`，当前 Excel 未配置，按默认 `false` 处理 |
| 默认不碰 | 键名、表头、行顺序；废弃或暂未消费的键也不能直接删除 |

## 2. 字段语义与当前消费

| 键 | 当前语义 / 单位 | 当前消费边界 |
|---|---|---|
| `FriendNumLimit` | 基础好友数量上限，个 | 服务端会再叠加有效特权卡的好友上限加成；当前领取好友赠礼的每日总上限也读取这个合计值 |
| `BlacklistLimit` | 黑名单数量上限，个 | 客户端展示与服务端写入均检查 |
| `RecommendLevel` | 推荐好友允许的等级差 | 服务端推荐池按等级差筛选 |
| `RecommendPoolSize` | 单次构建推荐候选池的目标数量，个 | 服务端实际池大小还会取“好友上限 + 黑名单上限 + 最低结果需求”的较大值，不保证等于本值 |
| `RecommendShowSize` | 单次前端显示的推荐人数，个 | 客户端读取；服务端最低结果量按本值的 5 倍准备 |
| `AcceptListLimit` | 好友接受列表条目上限，个 | 服务端按当前列表长度判断 |
| `ApplyValidTime` | 发出申请的有效时长，分钟 | 服务端乘 60 转秒后清理过期申请；客户端也按分钟换秒 |
| `AcceptValidTime` | 已接受记录的有效时长，分钟 | 服务端通过统一配置接口换算成秒后清理 |
| `GivePropLimit` | 历史“每日赠送次数上限”字段 | 当前非生成客户端明确不再使用；服务端按“当天每个好友最多赠送一次”控制，未见以本字段截断总次数 |
| `GetPropLimit` | 历史“每日领取次数上限”字段 | 当前非生成客户端明确不再使用；服务端领取余量按 `FriendNumLimit + 特权加成` 计算 |
| `GetPropType` | 好友赠礼的物品类型 | 与 `GetPropID`、`GetPropValue` 组成一组奖励三元组 |
| `GetPropID` | 好友赠礼的资源枚举值或道具 ID | `GetPropType=道具` 时必须命中 `system/Item.xlsx#Item.ItemID` |
| `GetPropValue` | 单次领取数量 | 必须大于 0；服务端按实际领取人数累加发奖数量 |
| `DelFriendPropType` | 删除好友消耗的物品类型 | 与 `DelFriendPropID`、`DelFriendValue` 组成一组消耗三元组 |
| `DelFriendPropID` | 删除好友消耗的资源枚举值或道具 ID | `PropType=道具` 时命中 `Item.ItemID` |
| `DelFriendValue` | 删除一个好友的消耗数量 | 批量删除时按成功请求目标数乘本值 |

## 3. 跨表与程序引用

| 源字段 | 目标 / 消费者 | 检查重点 |
|---|---|---|
| `GetPropType/ID/Value` | `Item.xlsx` 或资源枚举；服务端好友领奖接口 | 类型与 ID 分流正确；数量为正；玩家可见文案由界面/Prompt 另行承接 |
| `DelFriendPropType/ID/Value` | `Item.xlsx` 或资源枚举；服务端删除好友接口 | 批量删除会乘目标人数，不要把总价直接填成单人价 |
| `FriendNumLimit` | 好友列表、赠礼领取、好友上限特权 | 修改时同时验证普通角色和带好友上限特权的角色 |
| `Recommend*` | 服务端推荐池、客户端推荐列表 | `RecommendPoolSize` 是目标池大小，不是最终展示数 |
| `Apply/AcceptValidTime` | 好友申请 / 接受记录清理 | Excel 单位是分钟，代码运行比较用秒 |

## 4. 配置顺序

1. 先确定要改变的是容量、推荐、时效、奖励还是删除消耗。
2. 容量类先判断是否要连带特权加成；奖励 / 消耗先闭合 `PropType → PropID → Value`。
3. 时效按分钟填表，不直接写秒数。
4. 修改 `GivePropLimit` 或 `GetPropLimit` 前先确认是否同时改程序；仅改表当前不会改变现行总次数上限。
5. 读回 16 个当前键，并确认没有误加 `SupportCursorQuery` 行或改动其他常量。

## 5. 常见误配

- 把 `FriendNumLimit` 当最终硬上限，漏掉特权卡加成。
- 把 `RecommendPoolSize` 当玩家看到的人数；实际展示由 `RecommendShowSize` 控制。
- 把申请有效时长按秒填，导致 60 倍偏差。
- 改 `GivePropLimit` / `GetPropLimit` 后宣称已改变现行限次。
- `PropType=资源` 时把资源枚举 ID 当 `ItemID` 反查，或 `PropType=道具` 时漏查 `Item`。

## 6. 最小验收

- 纵向常量键无重复、无漏键；变更键读回值与单位一致。
- 好友上限同时验证普通角色和特权角色的合计口径。
- 推荐池至少验证等级差、候选池规模和展示数量三层没有混用。
- 奖励 / 消耗三元组按物品类型完成引用检查。
- 若改 `GivePropLimit` / `GetPropLimit`，必须有当前消费者证据，否则标记“程序前置”。
