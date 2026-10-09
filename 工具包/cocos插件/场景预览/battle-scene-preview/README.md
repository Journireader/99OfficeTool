# 场景推进预览

Cocos Creator 3.8.6 编辑器扩展，用于直接预览 `assets/resources/battle-scene/design` 下的战斗场景，无需进入游戏战斗流程。

## 使用方法

1. 在 Creator 扩展管理器中刷新项目扩展。
2. 打开 `开发 > 场景工具 > 场景推进预览`。
3. 从左侧选择场景，等待首次资源加载完成。
4. 点击预览画面，使用 `W/A/S/D` 或方向键移动角色，按住 `Shift` 加速。
5. 如需检查演出镜头，在右侧填写 `Animation.xlsx` 路径、刷新并选择 AnimeID，再启用或播放 AVG。

## 支持能力

- 读取场景道路层、位置点、边界和 GroundInfo 分层倍率。
- 固定预览分辨率和正交相机尺寸。
- 按角色坐标模拟前景、背景视差。
- 推进 Spine、Animation、ParticleSystem2D 和无限滚动组件；在编辑模式下显式启用 Spine 预览更新。
- 根据固定镜头范围与 EditingPrefabRef AABB 控制特效激活。
- 复刻前景 Sprite + EditingCollider 的角色感知遮挡；覆盖越多，透明度由 255 降至 160。
- 底部层级条实时显示每层速度倍率和当前等效位移，便于确认差速。
- 可视化角色碰撞体，并显示角色、镜头和激活特效状态。
- 所有设置仅对预览会话生效，不修改原始 prefab。
- 可选读取 `Animation.xlsx` 的 `Anime` / `AnimeDirector`，按 ActionTime 预览镜头移动、缩放、抖动及主角位置调度。
- AVG 支持播放、暂停、从头重播和拖动时间轴；未启用时仍保持自由移动模式。
- 实时计算镜头可视范围是否越出场景内容边界，并标红显示左/右/上/下穿帮量。
- 可选显示 Front、Road 等层的配置尺寸：Road 使用 `EditingRoadLayer.width/height`，Ground 使用 `EditingGroundLayer.width` 与编辑器约定高度 700；范围随视差位置同步移动。
- 可选显示特殊功能检测范围：特效激活 AABB、前景虚化、透明障碍、触发器和环境碰撞。
- 支持将镜头、角色碰撞体、移动速度、辅助显示开关及 AVG 路径/选择保存到扩展 `.local/settings.json`，下次打开自动恢复，也可一键恢复默认值。

## AVG 说明

- 默认配置路径为 `D:\client\configtable\Animation.xlsx`，可在面板中改为任意本地路径。
- 当前版本聚焦场景穿帮检查：完整模拟镜头和主角调度；对白、音频、演员动作会显示为当前时间轴事件，但不还原战斗 UI。

## 开发

```bash
npm run build
```

修改扩展代码后重新构建，并在 Creator 扩展管理器中重新加载该扩展。
