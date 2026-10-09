# 事实卡：Condition

## 0. 元信息

- 源 Excel：`develop/system/Condition.xlsx`
- 最近验证：2026-06-24 / SVN r4453 / proto + client/server 只读代码
- 状态：运行入口已验证；具体条件类型参数仍需按源表和代码 / 设计确认
- 第一参考：`约定/表字段索引.md`、`约定/索引链检查.md`

## 1. 表事实

| 项 | 内容 |
|---|---|
| 表角色 | 通用支撑表 / 条件树 |
| 主键 | `ConditionID` |
| 行语义 | 一行可包含多个 `ConditionItems#N.*` 子条件 |
| 文案 | `ConditionLanguage.LanguageKey` 等字段承接条件展示文案 |
| 组合 | `LogicalType` + `SubConditionIDs` 表达条件组合 |

## 2. 字段语义

| 字段 | 语义 | 易误判 |
|---|---|---|
| `ConditionID` | 条件主键 | `GC_*` 类 key 应按条件链查，不是普通字符串 |
| `SubConditionIDs` | 子条件组合 | 分号列表要拆分反查 |
| `ConditionItems#N.ConditionType` | 子条件类型 | 参数语义不能只靠字段名猜 |
| `ConditionItems#N.ConditionParams` | 条件参数 | 需要按 ConditionType 分流解释 |
| `ConditionLanguage.*` | 条件文案 | 仍需查 I18N / Prompt 归属 |

## 2.1 代码确认的运行语义

- 服务端公共入口 `CheckConditionIDRetBool`：`ConditionID` 为空时直接通过；非空时按 `Condition.ConditionID` 取配置求值。
- 服务端求值直接看 `ConditionItems`；逻辑条件项会把 `Value1` 当子 `ConditionID` 递归取配置，并在递归中展开子配置的 `SubConditionIDs`。
- `LogicalType=AND/INIT` 采用短路 AND；`LogicalType=OR` 采用短路 OR。
- `CompareType` 支持等于、大于、大于等于、小于、小于等于、开区间、闭区间、开闭区间、闭开区间。
- 客户端功能解锁提示会沿 `SubConditionIDs` 找第一个未满足子条件，并做环引用保护；因此复合条件不能自引用或形成环。
- `ConditionLanguage.LanguageParams` 会被客户端转成数字参数用于提示文案；非数字会按 0 处理。

## 3. 跨表引用

| 源字段 | 关系类型 | 目标表 / 字段 | 新增时动作 | 修改 / 删除时反查 |
|---|---|---|---|---|
| `UnlockCondID` | 强外键 | `Condition.ConditionID` | 补 Condition 行 | 查 SystemFunction / 入口 |
| `ConditionID` / `*ConditionID` | 强外键 | `Condition.ConditionID` | 补对应条件 | 查所有引用表 |
| `GC_*` | 前缀分流 | `Condition.ConditionID` | 查或补条件 | 不要当 I18N 或普通 key |
| `SubConditionIDs` | 强外键列表 | `Condition.ConditionID` | 拆分后逐项命中 | 防止条件树断链 |

## 4. 反向影响

| 改动类型 | 必查反向引用 | 必补支撑 | 阻塞 / 需确认 |
|---|---|---|---|
| 新增条件 | 引用它的入口 / 活动 / 任务 / 系统 | I18N / Prompt 文案 | ConditionType 参数未知时阻塞 |
| 改 ConditionID | 所有引用旧 ID 的字段 | 新 ID 行 | 旧 ID 仍被引用时阻塞 |
| 改 ConditionParams | 依赖该条件的所有玩法 | 参数语义确认 | 参数位未确认时阻塞 |
| 改条件展示文案 | I18N / Prompt | 对应 key | 展示归属未知时需确认 |
| 改复合条件 | 引用该条件的所有入口和活动 | 子条件文案 / 参数 | 存在环引用或仅靠 `SubConditionIDs` 无法确认服务端求值时阻塞 |

## 5. 验收清单

- `ConditionID` 唯一并能被引用表命中。
- `SubConditionIDs` 拆分后都能命中。
- `ConditionItems#N.ConditionType` 与 `ConditionParams` 参数位已确认。
- 复合条件没有自引用和环引用。
- 涉及玩家展示时，I18N / Prompt 已补齐。
- 无法解释的历史条件标“需确认”，不能当通过。
