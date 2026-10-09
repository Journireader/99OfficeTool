# 事实卡：Item / Random / Reward

## 0. 元信息

- 源 Excel：`develop/system/Item.xlsx`、`develop/random/*.xlsx`、`develop/reward/*.xlsx`、`develop/system/Store.xlsx`、`develop/system/bag.xlsx`
- 最近验证：2026-06-07 / SVN r3895 / 只读抽样
- 状态：已验证导航；奖励经济合理性和服务端发奖仍需按任务确认
- 第一参考：`系统/奖励.md`、`约定/索引链检查.md`、`约定/表字段索引.md`

## 1. 表事实

| 项 | 内容 |
|---|---|
| Item | 道具定义、背包显示、堆叠、溢出、跳转、箱子承接 |
| Random | 随机池 / 权重 / 分组，多为同 ID 多行组成一个池 |
| Reward | 活动 / 礼包 / 签到 / 任务奖励主表 |
| Store / bag | 售卖和背包承接 |
| 当前补充 | `random/InscriptionRamdom.xlsx` 是正式 develop 表，铭文抽取字段事实见 `事实卡/Inscription_Attribute_Random.md` |
| 装备补充 | 装备随机池、装备箱和装备属性链见 `事实卡/Equip_Attribute_Random.md` |

## 2. 字段语义

| 字段 | 语义 | 易误判 |
|---|---|---|
| `PropType + PropID + Value` | 奖励三元组 | `PropID` 必须按 `PropType` 分流 |
| `ItemID` | 道具主键 | 不等于所有资源 ID |
| `Name` / `Describe` | 多数为 I18N key | 不是中文正文 |
| `RandomID` / 池 ID | 随机池分组 | 同 ID 多行不是重复错误 |
| `Weight` | 权重 | 合理性需数值确认，不由链路检查裁决 |

## 3. 跨表引用

| 源字段 | 关系类型 | 目标表 / 字段 | 新增时动作 | 修改 / 删除时反查 |
|---|---|---|---|---|
| `ItemID` | 强外键 | `Item.ItemID` | 补 Item 行和文案 / 图标 | 查奖励、商店、背包、随机池 |
| `PropType + PropID + Value` | 上下文分流 | Item / Resource / Equip / Relic / Fashion 等 | 按 PropType 分流补目标 | 查所有奖励来源 |
| `RandomID` / `PoolID` | 分组引用 | `random/*.xlsx` 对应池 | 补同池多行 | 查 reward / dungeon / adventure 引用 |
| `PurchaseID` | 支付链 | `commerce/PurchaseList.PurchaseID` | 补 SKU / 价格 | 奖励内容仍在业务表 |
| `StoreID` / 商店行 | 售卖链 | `system/Store.xlsx` | 补商品 / 价格 / 文案 | 查 PurchaseList / Item |

## 4. 禁止推断

- 同 ID 多行的 Random / 箱子 / 奖励池通常是分组，不直接判重复。
- `PurchaseList` 是 SKU 和价格，不是奖励内容表。
- 链路命中只证明引用存在，不证明经济平衡合理。
- 服务端实际发奖、重复领取、背包落包等仍需保留服务端边界。

## 5. 反向影响

| 改动类型 | 必查反向引用 | 必补支撑 | 阻塞 / 需确认 |
|---|---|---|---|
| 新增道具 | Item / I18N / Picture / bag / Store | 文案、图标、背包、跳转 | PropType 未确认时阻塞 |
| 新增随机池 | 引用该池的玩法 / 奖励表 | Random 同组行 | 权重口径需数值确认 |
| 改奖励三元组 | 所有发奖来源 | Item / Resource / Equip 等目标 | PropType 分流不明时阻塞 |
| 改礼包 / 商店 | PurchaseList / Store / Item / I18N | SKU、价格、奖励内容 | 服务端发货边界需确认 |

## 6. 验收清单

- 奖励三元组按 `PropType` 分流，不把 `PropID` 当全局 ID。
- Item 文案、图标、背包 / 跳转支撑已查。
- Random 同 ID 多行按分组处理，重复 key 不误判。
- 商业化链路区分 `PurchaseList` 和奖励内容表。
- 数值 / 权重合理性若未复核，交付必须标“未检”。
