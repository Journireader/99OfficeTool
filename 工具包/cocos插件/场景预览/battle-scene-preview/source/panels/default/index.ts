"use strict";

import { readFileSync } from 'fs';
import { join } from 'path';

const PACKAGE_NAME = 'battle-scene-preview';
const FIXED_WORLD_HEIGHT = 1525;
const FIXED_ORTHO_HEIGHT = FIXED_WORLD_HEIGHT / 2;

const RESOLUTION_PRESETS = [
    { id: 'design', label: '设计分辨率', width: 700, height: 1525 },
    { id: 'iphone-14-pro', label: 'Apple iPhone 14 Pro', width: 393, height: 852 },
    { id: 'iphone-pro-max-plus', label: 'Apple iPhone 12/13 Pro Max；14 Plus', width: 428, height: 926 },
    { id: 'iphone-standard-pro', label: 'Apple iPhone 12；13；14；12/13 Pro', width: 390, height: 844 },
    { id: 'iphone-x-mini', label: 'Apple iPhone X；XS；11 Pro；12/13 Mini', width: 375, height: 812 },
    { id: 'iphone-xr-11', label: 'Apple iPhone XR；11', width: 414, height: 896 },
    { id: 'ipad-10-2', label: 'Apple iPad 10.2', width: 1620, height: 2160 },
    { id: 'ipad-air-10-9', label: 'Apple iPad Air 10.9', width: 1640, height: 2360 },
    { id: 'ipad-pro-10-5', label: 'Apple iPad Pro 10.5', width: 1668, height: 2224 },
    { id: 'oppo-reno-2', label: 'OPPO Reno 2', width: 360, height: 800 },
    { id: 'huawei-nova-5', label: 'HUAWEI Nova 5', width: 360, height: 780 },
    { id: 'honor-x8', label: 'HONOR X8', width: 360, height: 796 },
    { id: 'huawei-nova-8i', label: 'HUAWEI Nova 8i', width: 360, height: 792 },
    { id: 'huawei-mate-40-pro', label: 'HUAWEI Mate 40 Pro', width: 448, height: 924 },
    { id: 'huawei-mate-30-pro', label: 'HUAWEI Mate30 Pro', width: 392, height: 800 },
    { id: 'xiaomi-redmi-8', label: 'Xiaomi Redmi 8', width: 360, height: 760 },
    { id: 'sony-xperia-5', label: 'Sony Xperia 5', width: 360, height: 840 },
    { id: 'oppo-a77', label: 'OPPO A77', width: 360, height: 806 },
    { id: 'nokia-c2', label: 'Nokia C2', width: 360, height: 720 },
    { id: 'asus-rog-phone-6', label: 'Asus ROG Phone 6', width: 360, height: 816 },
    { id: 'lenovo-legion-2-pro', label: 'Lenovo Legion 2 Pro', width: 360, height: 820 },
] as const;

interface SceneSummary {
    name: string;
    url: string;
    relativePath: string;
    uuid: string;
    layers: Array<{ layerIndex: number; moveSpeedRateX: number; moveSpeedRateY: number }>;
    positions: number;
    boundaries: number;
    spineCount: number;
    prefabEffectCount: number;
    orthoHeight: number;
    warnings: string[];
}

interface AvgNote { index: number; time: number; actionType: string; actionLabel: string; actionData: string }
interface AvgConfig {
    animeId: string; directorId: string; remark: string; duration: number; noteCount: number;
    camera: { x: number; y: number }; heroPositionId: string; heroFacing: string; notes: AvgNote[];
}

interface PanelElements {
    app: HTMLElement;
    sceneCount: HTMLElement;
    sceneSearch: HTMLInputElement;
    sceneList: HTMLElement;
    reloadBtn: HTMLButtonElement;
    resetBtn: HTMLButtonElement;
    playBtn: HTMLButtonElement;
    pauseBtn: HTMLButtonElement;
    statusText: HTMLElement;
    viewport: HTMLElement;
    previewImage: HTMLImageElement;
    emptyState: HTMLElement;
    playerMarker: HTMLElement;
    colliderMarker: HTMLElement;
    layerStrip: HTMLElement;
    renderLayerAxis: HTMLElement;
    moveSpeed: HTMLInputElement;
    colliderWidth: HTMLInputElement;
    colliderHeight: HTMLInputElement;
    colliderOffsetX: HTMLInputElement;
    colliderOffsetY: HTMLInputElement;
    showCollider: HTMLInputElement;
    enableForegroundOcclusion: HTMLInputElement;
    viewportWidth: HTMLInputElement;
    viewportHeight: HTMLInputElement;
    orthoHeight: HTMLInputElement;
    resolutionPreset: HTMLSelectElement;
    resolutionInfo: HTMLElement;
    currentStage: HTMLSelectElement;
    respectBounds: HTMLInputElement;
    runtimeStats: HTMLElement;
    sceneInfo: HTMLElement;
    avgEnabled: HTMLInputElement;
    avgPath: HTMLInputElement;
    avgReloadBtn: HTMLButtonElement;
    avgSelect: HTMLSelectElement;
    avgPlayBtn: HTMLButtonElement;
    avgReplayBtn: HTMLButtonElement;
    avgTimeline: HTMLInputElement;
    avgTime: HTMLElement;
    avgEvent: HTMLElement;
    showLayerBounds: HTMLInputElement;
    layerBoundOptions: HTMLElement;
    showFeatureRanges: HTMLInputElement;
    showEffectRanges: HTMLInputElement;
    showOcclusionRanges: HTMLInputElement;
    showTriggerRanges: HTMLInputElement;
    showOpacityBarrierRanges: HTMLInputElement;
    showBarrierRanges: HTMLInputElement;
    showAuxiliaryRanges: HTMLInputElement;
    showCameraFrame: HTMLInputElement;
    showExitBoundaries: HTMLInputElement;
    showSpawnBoundaries: HTMLInputElement;
    showCameraBoundaries: HTMLInputElement;
    showMoveBoundaries: HTMLInputElement;
    showSceneBounds: HTMLInputElement;
    debugOverlay: HTMLElement;
    saveSettingsBtn: HTMLButtonElement;
    resetSettingsBtn: HTMLButtonElement;
}

interface PanelHost {
    $: PanelElements;
    scenes: SceneSummary[];
    selected: SceneSummary | null;
    session: any;
    player: { x: number; y: number };
    keys: Set<string>;
    rendering: boolean;
    running: boolean;
    paused: boolean;
    autoMove: boolean;
    timer: ReturnType<typeof setInterval> | null;
    lastTick: number;
    lastAnimationTick: number;
    renderRequested: boolean;
    avgConfigs: AvgConfig[];
    avg: AvgConfig | null;
    avgPlaying: boolean;
    avgTime: number;
    avgCamera: { x: number; y: number; orthoHeight: number } | null;
    avgBaseCamera: { x: number; y: number; orthoHeight: number } | null;
    layerBoundSelection: Set<string> | null;
    onKeyDown: (event: KeyboardEvent) => void;
    onKeyUp: (event: KeyboardEvent) => void;
}

function clamp01(value: number): number { return Math.max(0, Math.min(1, value)); }

function easeValue(value: number, name: string): number {
    const t = clamp01(value);
    if (/linear/i.test(name)) return t;
    if (/quadInOut/i.test(name)) return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    if (/quintInOut/i.test(name)) return t < .5 ? 16 * Math.pow(t, 5) : 1 - Math.pow(-2 * t + 2, 5) / 2;
    if (/InOut/i.test(name)) return t * t * (3 - 2 * t);
    if (/In$/i.test(name)) return t * t;
    if (/Out$/i.test(name)) return 1 - (1 - t) * (1 - t);
    return t * t * (3 - 2 * t);
}

function resolvePosition(panel: PanelHost, id: string): { x: number; y: number } | null {
    return panel.session?.positions?.[id] || null;
}

function evaluateAvg(panel: PanelHost): void {
    const config = panel.avg;
    if (!config || !panel.session) return;
    const time = panel.avgTime;
    // Keep authored camera movement and transient shake on separate tracks.
    // Runtime shake is applied by BattleCameraController and does not rewrite the
    // free-camera node position used as the next tween's starting point.
    let camera = { ...config.camera };
    let shakeOffsetX = 0;
    let shakeOffsetY = 0;
    let zoom = 762.5;
    let hero = resolvePosition(panel, config.heroPositionId) || { ...panel.session.born };
    let currentEvent = '等待事件';
    for (const note of config.notes) {
        if (time < note.time) break;
        currentEvent = `${note.time.toFixed(2)}s · ${note.actionLabel || note.actionType} ${note.actionData}`.trim();
        const data = note.actionData.split(',').map((item) => item.trim());
        if (note.actionType === 'camera-move') {
            const target = { x: Number(data[0]) || 0, y: Number(data[1]) || 0 };
            const duration = Number(data[2]) || 1.2;
            const progress = easeValue((time - note.time) / duration, data[3] || 'quadInOut');
            camera = { x: camera.x + (target.x - camera.x) * progress, y: camera.y + (target.y - camera.y) * progress };
        } else if (note.actionType === 'camera-zoom') {
            const target = 762.5 / (Number(data[0]) || 1);
            const duration = Number(data[1]) || 1.2;
            const progress = easeValue((time - note.time) / duration, data[2] || 'quadInOut');
            zoom += (target - zoom) * progress;
        } else if (note.actionType === 'camera-shake') {
            const duration = Number(data[0]) || .4;
            const intensity = Number(data[1]) || 10;
            const progress = clamp01((time - note.time) / duration);
            if (progress < 1) {
                const fade = 1 - progress;
                shakeOffsetX += Math.sin((time - note.time) * 71) * intensity * fade;
                shakeOffsetY += Math.cos((time - note.time) * 83) * intensity * fade;
            }
        } else if (note.actionType === 'hero-move' || note.actionType === 'all-player-entry') {
            const target = resolvePosition(panel, data[0]);
            if (target) {
                const progress = easeValue((time - note.time) / .8, 'quadInOut');
                hero = { x: hero.x + (target.x - hero.x) * progress, y: hero.y + (target.y - hero.y) * progress };
            }
        }
    }
    panel.player = hero;
    const renderedCamera = {
        x: camera.x + shakeOffsetX,
        y: camera.y + shakeOffsetY,
        orthoHeight: zoom,
    };
    panel.avgCamera = renderedCamera;
    panel.avgBaseCamera = { x: camera.x, y: camera.y, orthoHeight: zoom };
    panel.$.avgTimeline.value = String(Math.min(time, config.duration));
    panel.$.avgTime.textContent = `${time.toFixed(2)} / ${config.duration.toFixed(2)} 秒`;
    const shakeText = Math.abs(shakeOffsetX) > 0.01 || Math.abs(shakeOffsetY) > 0.01
        ? ` · 抖动偏移 ${shakeOffsetX.toFixed(1)}, ${shakeOffsetY.toFixed(1)}`
        : '';
    panel.$.avgEvent.textContent = `${currentEvent} · 基础镜头（世界）${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}${shakeText}`;
}

function numberValue(input: HTMLInputElement, fallback: number): number {
    const value = Number(input.value);
    return Number.isFinite(value) ? value : fallback;
}

function updateResolutionInfo(panel: PanelHost): void {
    const width = Math.max(1, numberValue(panel.$.viewportWidth, 700));
    const height = Math.max(1, numberValue(panel.$.viewportHeight, 1525));
    const worldHeight = Math.max(1, numberValue(panel.$.orthoHeight, FIXED_ORTHO_HEIGHT) * 2);
    const worldWidth = worldHeight * width / height;
    panel.$.resolutionInfo.textContent = `设备 ${width} × ${height} · 实际世界视野 ${worldWidth.toFixed(1)} × ${worldHeight.toFixed(1)}`;
}

function applyResolutionPreset(panel: PanelHost, presetId: string): void {
    const preset = RESOLUTION_PRESETS.find((item) => item.id === presetId);
    if (preset) {
        panel.$.viewportWidth.value = String(preset.width);
        panel.$.viewportHeight.value = String(preset.height);
        panel.$.orthoHeight.value = String(FIXED_ORTHO_HEIGHT);
    }
    updateResolutionInfo(panel);
}

function inferResolutionPreset(panel: PanelHost): void {
    const width = numberValue(panel.$.viewportWidth, 700);
    const height = numberValue(panel.$.viewportHeight, 1525);
    const preset = RESOLUTION_PRESETS.find((item) => item.width === width && item.height === height);
    panel.$.resolutionPreset.value = preset?.id || 'custom';
    updateResolutionInfo(panel);
}

function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] || char));
}

function collectOrderedRenderLayers(result: any): any[] {
    const layers = [
        ...(result?.roadLayer ? [{ ...result.roadLayer, kind: 'road', layerIndex: 0, rateX: 1, rateY: 1 }] : []),
        ...(Array.isArray(result?.layers) ? result.layers.map((layer: any) => ({ ...layer, kind: 'ground' })) : []),
    ];
    return layers.sort((left, right) => (
        Number(right.layerIndex) - Number(left.layerIndex)
        || String(left.name || '').localeCompare(String(right.name || ''), 'zh-CN')
    ));
}

function renderLayerAxis(panel: PanelHost, result: any): void {
    const layers = collectOrderedRenderLayers(result);
    if (!layers.length) {
        panel.$.renderLayerAxis.innerHTML = '<span class="option-empty">当前场景没有可显示的渲染层级</span>';
        return;
    }
    const groups = new Map<number, any[]>();
    for (const layer of layers) {
        const index = Number(layer.layerIndex) || 0;
        const group = groups.get(index) || [];
        group.push(layer);
        groups.set(index, group);
    }
    panel.$.renderLayerAxis.innerHTML = [...groups.entries()]
        .sort(([left], [right]) => right - left)
        .map(([index, items]) => {
            const sign = index > 0 ? `+${index}` : String(index);
            const positionClass = index > 0 ? 'positive' : index < 0 ? 'negative' : 'zero';
            const itemHtml = items.map((layer) => {
                const size = Number(layer.width) > 0 && Number(layer.height) > 0
                    ? ` · ${Number(layer.width).toFixed(0)} × ${Number(layer.height).toFixed(0)}`
                    : '';
                const speed = layer.kind === 'road' ? '' : ` · X ${Number(layer.rateX) || 0} / Y ${Number(layer.rateY) || 0}`;
                const title = `${layer.kind === 'road' ? '道路层' : '场景层'} ${sign}${size}${speed}`;
                return `<span class="render-layer-item${layer.kind === 'road' ? ' road' : ''}" title="${escapeHtml(title)}">${escapeHtml(layer.name || '未命名')}</span>`;
            }).join('');
            return `<div class="render-layer-row ${positionClass}"><span class="render-layer-index">${sign}</span><span class="render-layer-tick"></span><div class="render-layer-items">${itemHtml}</div></div>`;
        }).join('');
}

function renderSceneList(panel: PanelHost): void {
    const query = panel.$.sceneSearch.value.trim().toLowerCase();
    const scenes = panel.scenes.filter((scene) => !query || `${scene.name} ${scene.relativePath}`.toLowerCase().includes(query));
    panel.$.sceneCount.textContent = `${scenes.length} / ${panel.scenes.length} 个场景`;
    panel.$.sceneList.innerHTML = scenes.map((scene) => (
        `<button type="button" class="scene-card${scene.warnings.length ? ' warning' : ''}${panel.selected?.uuid === scene.uuid ? ' active' : ''}" data-uuid="${escapeHtml(scene.uuid)}">`
        + `<strong>${escapeHtml(scene.name)}</strong>`
        + `<small>${scene.layers.length} 层 · ${scene.spineCount} Spine · ${scene.prefabEffectCount} 特效${scene.warnings.length ? ` · ${escapeHtml(scene.warnings[0])}` : ''}</small>`
        + '</button>'
    )).join('');
}

function renderSceneInfo(panel: PanelHost): void {
    const scene = panel.selected;
    if (!scene) return;
    panel.$.sceneInfo.textContent = [
        scene.relativePath,
        `层级：${scene.layers.length}`,
        `位置点：${scene.positions}`,
        `边界：${scene.boundaries}`,
        `Spine：${scene.spineCount}`,
        `特效 prefab：${scene.prefabEffectCount}`,
        scene.warnings.length ? `警告：${scene.warnings.join('；')}` : '配置检查：通过',
    ].join('\n');
    panel.$.layerStrip.innerHTML = scene.layers.map((layer) => (
        `<span class="layer-chip">层 ${layer.layerIndex} · X ${layer.moveSpeedRateX} · Y ${layer.moveSpeedRateY}</span>`
    )).join('');
}

function layerBoundKey(layer: { layerIndex?: number; name?: string; kind?: string }): string {
    return layer.kind === 'road' ? 'road' : `ground:${Number(layer.layerIndex) || 0}:${String(layer.name || '')}`;
}

function renderLayerBoundOptions(panel: PanelHost): void {
    const available = [
        { ...(panel.session?.roadLayer || {}), kind: 'road', layerIndex: 0, name: panel.session?.roadLayer?.name || 'Road' },
        ...(Array.isArray(panel.session?.layers) ? panel.session.layers.map((layer: any) => ({ ...layer, kind: 'ground' })) : []),
    ].sort((left, right) => Number(right.layerIndex) - Number(left.layerIndex));
    const keys = available.map(layerBoundKey);
    if (panel.layerBoundSelection === null) panel.layerBoundSelection = new Set(keys);
    panel.$.layerBoundOptions.innerHTML = available.length ? available.map((layer) => {
        const key = layerBoundKey(layer);
        const label = layer.kind === 'road' ? `道路层 · ${layer.name}` : `层 ${layer.layerIndex} · ${layer.name || '未命名'}`;
        return `<label class="check"><input type="checkbox" data-layer-bound-key="${escapeHtml(key)}"${panel.layerBoundSelection!.has(key) ? ' checked' : ''}>${escapeHtml(label)}</label>`;
    }).join('') : '<span class="option-empty">当前场景没有可显示的层级</span>';
}

function setStatus(panel: PanelHost, text: string, isError = false): void {
    panel.$.statusText.textContent = text;
    panel.$.statusText.classList.toggle('error', isError);
}

function renderDebugOverlays(
    panel: PanelHost,
    result: any,
    contentLeft: number,
    contentTop: number,
    contentWidth: number,
    contentHeight: number,
): void {
    const profile = result.cameraProfile || panel.session.cameraProfile;
    const viewLeft = result.camera.x - profile.viewportWorldWidth / 2;
    const viewTop = result.camera.y + profile.viewportWorldHeight / 2;
    const boxes: string[] = [];
    const addBox = (rect: any, className: string, label: string, colorIndex = 0) => {
        const left = contentLeft + (Number(rect.x) - viewLeft) / profile.viewportWorldWidth * contentWidth;
        const top = contentTop + (viewTop - (Number(rect.y) + Number(rect.height))) / profile.viewportWorldHeight * contentHeight;
        const width = Number(rect.width) / profile.viewportWorldWidth * contentWidth;
        const height = Number(rect.height) / profile.viewportWorldHeight * contentHeight;
        if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
        boxes.push(`<div class="debug-box ${className}" style="left:${left}px;top:${top}px;width:${width}px;height:${height}px;--debug-index:${colorIndex}"><span>${escapeHtml(label)}</span></div>`);
    };
    if (panel.$.showAuxiliaryRanges.checked) {
        const viewBottom = viewTop - profile.viewportWorldHeight;
        if (panel.$.showCameraFrame.checked) addBox(
            { x: viewLeft, y: viewBottom, width: profile.viewportWorldWidth, height: profile.viewportWorldHeight },
            'aux-bound camera-frame', '当前镜头', 0,
        );
        const enabledBoundaryKinds = new Set([
            panel.$.showExitBoundaries.checked && 'exit',
            panel.$.showSpawnBoundaries.checked && 'spawn',
            panel.$.showCameraBoundaries.checked && 'camera',
            panel.$.showMoveBoundaries.checked && 'move',
        ].filter(Boolean));
        const verticalWidth = Math.max(2, profile.viewportWorldWidth * .004);
        const horizontalHeight = Math.max(2, profile.viewportWorldHeight * .004);
        (panel.session?.boundaries || []).filter((boundary: any) => enabledBoundaryKinds.has(boundary.category)).forEach((boundary: any, index: number) => {
            const activeClass = boundary.active ? ' active-boundary' : '';
            const label = `${boundary.active ? '当前 · ' : ''}${boundary.categoryLabel} · ${boundary.typeLabel} · ${boundary.horizontal ? 'Y' : 'X'} ${Number(boundary.horizontal ? boundary.y : boundary.x).toFixed(0)}`;
            if (boundary.horizontal) {
                addBox({ x: viewLeft, y: boundary.y - horizontalHeight / 2, width: profile.viewportWorldWidth, height: horizontalHeight }, `aux-bound boundary-${boundary.category}${activeClass}`, label, index);
            } else {
                addBox({ x: boundary.x - verticalWidth / 2, y: viewBottom, width: verticalWidth, height: profile.viewportWorldHeight }, `aux-bound boundary-${boundary.category}${activeClass}`, label, index);
            }
        });
        if (panel.$.showSceneBounds.checked && panel.session?.cameraBounds) {
            const left = panel.session.cameraBounds.left - profile.viewportWorldWidth / 2;
            const right = panel.session.cameraBounds.right + profile.viewportWorldWidth / 2;
            addBox({ x: left, y: panel.session.cameraBounds.centerY - profile.viewportWorldHeight / 2, width: right - left, height: profile.viewportWorldHeight }, 'aux-bound scene-bound', '场景内容边界', 0);
        }
    }
    if (panel.$.showLayerBounds.checked) {
        (result.layerBounds || []).filter((rect: any) => panel.layerBoundSelection?.has(layerBoundKey(rect))).forEach((rect: any, index: number) => addBox(
            rect, `layer-bound ${rect.kind || ''}`, `${rect.name || `层 ${rect.layerIndex}`} · ${Number(rect.width).toFixed(0)} × ${Number(rect.height).toFixed(0)}`, index,
        ));
    }
    if (panel.$.showFeatureRanges.checked) {
        const enabledKinds = new Set([
            panel.$.showEffectRanges.checked && 'effect',
            panel.$.showOcclusionRanges.checked && 'occlusion',
            panel.$.showTriggerRanges.checked && 'trigger',
            panel.$.showOpacityBarrierRanges.checked && 'opacity-barrier',
            panel.$.showBarrierRanges.checked && 'barrier',
        ].filter(Boolean));
        (result.featureRanges || []).filter((rect: any) => enabledKinds.has(rect.kind)).forEach((rect: any) => addBox(rect, `feature-bound ${rect.kind}`, rect.label));
    }
    panel.$.debugOverlay.innerHTML = boxes.join('');
}

async function renderFrame(panel: PanelHost, deltaTime = 0): Promise<void> {
    if (!panel.running || panel.rendering) {
        panel.renderRequested = panel.running;
        return;
    }
    panel.rendering = true;
    panel.renderRequested = false;
    try {
        const animationNow = performance.now();
        const avgWaitingOrPaused = Boolean(panel.$.avgEnabled.checked && panel.avg && !panel.avgPlaying);
        const animationDelta = panel.paused || avgWaitingOrPaused
            ? 0
            : Math.min(0.25, Math.max(deltaTime, (animationNow - panel.lastAnimationTick) / 1000));
        panel.lastAnimationTick = animationNow;
        const result = await Editor.Message.request(PACKAGE_NAME, 'render-frame', {
            playerX: panel.player.x,
            playerY: panel.player.y,
            cameraX: panel.avgCamera?.x,
            cameraY: panel.avgCamera?.y,
            parallaxCameraX: panel.avgBaseCamera?.x,
            parallaxCameraY: panel.avgBaseCamera?.y,
            orthoHeight: panel.avgCamera?.orthoHeight,
            freeCamera: Boolean(panel.$.avgEnabled.checked && panel.avg),
            showLayerBounds: panel.$.showLayerBounds.checked,
            showFeatureRanges: panel.$.showFeatureRanges.checked,
            deltaTime: animationDelta,
            respectCameraBounds: panel.$.respectBounds.checked,
            colliderWidth: numberValue(panel.$.colliderWidth, 140),
            colliderHeight: numberValue(panel.$.colliderHeight, 180),
            colliderOffsetX: numberValue(panel.$.colliderOffsetX, 0),
            colliderOffsetY: numberValue(panel.$.colliderOffsetY, 75),
            enableForegroundOcclusion: panel.$.enableForegroundOcclusion.checked,
        });
        if (!result?.ok) throw new Error(result?.message || '渲染失败');
        panel.$.previewImage.src = result.imageUrl;
        panel.$.previewImage.style.display = 'block';
        panel.$.emptyState.style.display = 'none';
        panel.$.playerMarker.style.display = 'block';
        const profile = result.cameraProfile || panel.session.cameraProfile;
        const horizontal = 50 + ((result.player.x - result.camera.x) / profile.viewportWorldWidth) * 100;
        const vertical = 50 - ((result.player.y - result.camera.y) / profile.viewportWorldHeight) * 100;
        panel.$.playerMarker.style.left = `${horizontal}%`;
        panel.$.playerMarker.style.top = `${vertical}%`;
        const viewportRect = panel.$.viewport.getBoundingClientRect();
        const imageAspect = result.width / result.height;
        const viewportAspect = viewportRect.width / viewportRect.height;
        const contentWidth = viewportAspect > imageAspect
            ? viewportRect.height * imageAspect
            : viewportRect.width;
        const contentHeight = viewportAspect > imageAspect
            ? viewportRect.height
            : viewportRect.width / imageAspect;
        const contentLeft = (viewportRect.width - contentWidth) / 2;
        const contentTop = (viewportRect.height - contentHeight) / 2;
        panel.$.playerMarker.style.left = `${contentLeft + horizontal / 100 * contentWidth}px`;
        panel.$.playerMarker.style.top = `${contentTop + vertical / 100 * contentHeight}px`;
        const scale = contentHeight / profile.viewportWorldHeight;
        panel.$.colliderMarker.style.width = `${Math.max(2, numberValue(panel.$.colliderWidth, 140) * scale)}px`;
        panel.$.colliderMarker.style.height = `${Math.max(2, numberValue(panel.$.colliderHeight, 180) * scale)}px`;
        panel.$.colliderMarker.style.marginLeft = `${numberValue(panel.$.colliderOffsetX, 0) * scale}px`;
        panel.$.colliderMarker.style.marginBottom = `${numberValue(panel.$.colliderOffsetY, 75) * scale}px`;
        panel.$.colliderMarker.style.display = panel.$.showCollider.checked ? 'block' : 'none';
        renderDebugOverlays(panel, result, contentLeft, contentTop, contentWidth, contentHeight);
        panel.$.runtimeStats.innerHTML = [
            `<dt>角色坐标</dt><dd>${result.player.x.toFixed(0)}, ${result.player.y.toFixed(0)}</dd>`,
            `<dt>镜头世界坐标</dt><dd>${result.camera.x.toFixed(0)}, ${result.camera.y.toFixed(0)}</dd>`,
            `<dt>当前阶段</dt><dd>${escapeHtml(panel.session.boundaryStage || panel.$.currentStage.value)}${panel.session.rightBoundaryFallback ? ` → ${escapeHtml(panel.session.rightBoundaryFallback)}` : ''}</dd>`,
            `<dt>宽屏边界处理</dt><dd class="${panel.session.boundaryViewportConflict ? 'danger' : ''}">${panel.session.boundaryViewportConflict ? `${escapeHtml(panel.session.boundaryFallbackMode)} · 超出 ${Number(panel.session.boundaryViewportOverflow).toFixed(1)}` : '正常'}</dd>`,
            `<dt>激活特效</dt><dd>${result.effects.active}</dd>`,
            `<dt>未激活特效</dt><dd>${result.effects.inactive}</dd>`,
            `<dt>虚化场景图</dt><dd>${result.occlusion.faded} / ${result.occlusion.total}</dd>`,
            `<dt>虚化命中层级</dt><dd>${escapeHtml(result.occlusion.fadedLayers?.join('、') || '—')}</dd>`,
            `<dt>最低透明度</dt><dd>${result.occlusion.minimumOpacity}</dd>`,
            `<dt>本帧动效</dt><dd>${result.advancedAnimations}</dd>`,
            `<dt>镜头穿帮</dt><dd class="${result.exposure?.visible ? 'danger' : ''}">${result.exposure?.visible ? `左${result.exposure.left.toFixed(0)} 右${result.exposure.right.toFixed(0)} 上${result.exposure.top.toFixed(0)} 下${result.exposure.bottom.toFixed(0)}` : '无'}</dd>`,
        ].join('');
        const orderedLayers = collectOrderedRenderLayers(result);
        panel.$.layerStrip.innerHTML = orderedLayers.map((layer: any) => layer.kind === 'road'
            ? `<span class="layer-chip road-chip">${escapeHtml(layer.name)} · 层 0 · ${layer.width} × ${layer.height}</span>`
            : `<span class="layer-chip">${escapeHtml(layer.name)} · 层 ${layer.layerIndex} · ${layer.width} × ${layer.height} · 速率 ${layer.rateX} · 位移 ${Number(layer.offsetX).toFixed(0)}</span>`
        ).join('');
        renderLayerAxis(panel, result);
        const boundaryConflictStatus = panel.session.boundaryViewportConflict
            ? ` · 宽屏边界降级：${panel.session.boundaryFallbackMode}（视口超出 ${Number(panel.session.boundaryViewportOverflow).toFixed(1)}）`
            : '';
        const stageStatus = `阶段 ${panel.session.boundaryStage || panel.$.currentStage.value}${panel.session.rightBoundaryFallback ? `（使用 ${panel.session.rightBoundaryFallback}）` : ''}${boundaryConflictStatus}`;
        setStatus(panel, result.exposure?.visible
            ? `检测到镜头越出场景内容范围：左 ${result.exposure.left.toFixed(0)} / 右 ${result.exposure.right.toFixed(0)} / 上 ${result.exposure.top.toFixed(0)} / 下 ${result.exposure.bottom.toFixed(0)}`
            : panel.$.avgEnabled.checked && panel.avg
            ? `AVG ${panel.avg.animeId} · ${panel.avgPlaying ? '播放中' : '已暂停'}`
            : result.cameraLimited ? `${stageStatus} · 镜头已到边界，角色不再居中` : `${stageStatus} · 预览中`);
    } catch (error) {
        setStatus(panel, error instanceof Error ? error.message : String(error), true);
    } finally {
        panel.rendering = false;
        if (panel.renderRequested) void renderFrame(panel, 0);
    }
}

async function startScene(panel: PanelHost, scene: SceneSummary, preservePlayer = false): Promise<void> {
    const previousPlayer = preservePlayer && panel.running ? { ...panel.player } : null;
    panel.selected = scene;
    renderSceneList(panel);
    renderSceneInfo(panel);
    if (!panel.$.orthoHeight.value) panel.$.orthoHeight.value = String(scene.orthoHeight || FIXED_ORTHO_HEIGHT);
    setStatus(panel, `正在加载 ${scene.name}…`);
    panel.running = false;
    try {
        const result = await Editor.Message.request(PACKAGE_NAME, 'start-preview', {
            uuid: scene.uuid,
            viewportWidth: numberValue(panel.$.viewportWidth, 700),
            viewportHeight: numberValue(panel.$.viewportHeight, 1525),
            orthoHeight: numberValue(panel.$.orthoHeight, FIXED_ORTHO_HEIGHT),
            boundaryStage: panel.$.currentStage.value,
        });
        if (!result?.ok) throw new Error(result?.message || '场景加载失败');
        panel.session = result;
        renderLayerBoundOptions(panel);
        panel.player = previousPlayer || { ...result.born };
        panel.avgCamera = null;
        panel.avgBaseCamera = null;
        panel.avgTime = 0;
        if (panel.$.avgEnabled.checked && panel.avg) evaluateAvg(panel);
        panel.running = true;
        panel.lastTick = performance.now();
        panel.lastAnimationTick = panel.lastTick;
        panel.$.viewport.focus();
        await renderFrame(panel, 0);
    } catch (error) {
        setStatus(panel, error instanceof Error ? error.message : String(error), true);
    }
}

function tick(panel: PanelHost): void {
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - panel.lastTick) / 1000));
    panel.lastTick = now;
    if (!panel.running) return;
    if (panel.$.avgEnabled.checked && panel.avg) {
        if (panel.avgPlaying) {
            panel.avgTime = Math.min(panel.avg.duration, panel.avgTime + dt);
            if (panel.avgTime >= panel.avg.duration) {
                panel.avgPlaying = false;
                panel.$.avgPlayBtn.classList.remove('active');
                panel.$.avgPlayBtn.textContent = '播放 AVG';
            }
            evaluateAvg(panel);
        }
        if (panel.avgPlaying || now % 125 < 45) void renderFrame(panel, dt);
        return;
    }
    panel.avgCamera = null;
    panel.avgBaseCamera = null;
    let dx = 0;
    let dy = 0;
    if (panel.keys.has('a') || panel.keys.has('arrowleft')) dx -= 1;
    if (panel.keys.has('d') || panel.keys.has('arrowright')) dx += 1;
    if (panel.keys.has('w') || panel.keys.has('arrowup')) dy += 1;
    if (panel.keys.has('s') || panel.keys.has('arrowdown')) dy -= 1;
    if (panel.autoMove) dx += 1;
    if (dx || dy) {
        const length = Math.hypot(dx, dy) || 1;
        const boost = panel.keys.has('shift') ? 2.5 : 1;
        const speed = numberValue(panel.$.moveSpeed, 600) * boost;
        panel.player.x += dx / length * speed * dt;
        panel.player.y += dy / length * speed * dt;
    }
    if (dx || dy || (!panel.paused && now % 125 < 45)) void renderFrame(panel, dt);
}

function renderAvgOptions(panel: PanelHost): void {
    panel.$.avgSelect.innerHTML = '<option value="">选择 AnimeID</option>' + panel.avgConfigs.map((config) => (
        `<option value="${escapeHtml(config.animeId)}">${escapeHtml(config.animeId)} · ${escapeHtml(config.remark || config.directorId)} · ${config.noteCount} 项</option>`
    )).join('');
}

async function loadAvgConfigs(panel: PanelHost): Promise<void> {
    try {
        const result = await Editor.Message.request(PACKAGE_NAME, 'list-avg-configs', { filePath: panel.$.avgPath.value.trim() });
        panel.avgConfigs = result?.configs || [];
        panel.$.avgPath.value = result?.filePath || panel.$.avgPath.value;
        renderAvgOptions(panel);
        panel.$.avgEvent.textContent = `已读取 ${panel.avgConfigs.length} 个 AVG 配置`;
    } catch (error) {
        panel.avgConfigs = [];
        renderAvgOptions(panel);
        panel.$.avgEvent.textContent = error instanceof Error ? error.message : String(error);
    }
}

function selectAvg(panel: PanelHost): void {
    panel.avg = panel.avgConfigs.find((item) => item.animeId === panel.$.avgSelect.value) || null;
    panel.avgTime = 0;
    panel.avgPlaying = false;
    panel.avgCamera = null;
    panel.avgBaseCamera = null;
    panel.$.avgTimeline.min = '0';
    panel.$.avgTimeline.max = String(panel.avg?.duration || 0);
    panel.$.avgTimeline.value = '0';
    panel.$.avgTime.textContent = panel.avg ? `0.00 / ${panel.avg.duration.toFixed(2)} 秒` : '—';
    panel.$.avgEvent.textContent = panel.avg
        ? `Director ${panel.avg.directorId} · 初始镜头 ${panel.avg.camera.x}, ${panel.avg.camera.y} · 主角点 ${panel.avg.heroPositionId || '未配置'}`
        : '未选择 AVG';
    if (panel.$.avgEnabled.checked && panel.avg && panel.running) {
        if (panel.selected) void startScene(panel, panel.selected);
        else {
            evaluateAvg(panel);
            void renderFrame(panel, 0);
        }
    }
}

function collectSettings(panel: PanelHost): Record<string, unknown> {
    return {
        moveSpeed: panel.$.moveSpeed.value,
        colliderWidth: panel.$.colliderWidth.value,
        colliderHeight: panel.$.colliderHeight.value,
        colliderOffsetX: panel.$.colliderOffsetX.value,
        colliderOffsetY: panel.$.colliderOffsetY.value,
        showCollider: panel.$.showCollider.checked,
        enableForegroundOcclusion: panel.$.enableForegroundOcclusion.checked,
        viewportWidth: panel.$.viewportWidth.value,
        viewportHeight: panel.$.viewportHeight.value,
        orthoHeight: panel.$.orthoHeight.value,
        resolutionPreset: panel.$.resolutionPreset.value,
        currentStage: panel.$.currentStage.value,
        respectBounds: panel.$.respectBounds.checked,
        showLayerBounds: panel.$.showLayerBounds.checked,
        showFeatureRanges: panel.$.showFeatureRanges.checked,
        showAuxiliaryRanges: panel.$.showAuxiliaryRanges.checked,
        showCameraFrame: panel.$.showCameraFrame.checked,
        showExitBoundaries: panel.$.showExitBoundaries.checked,
        showSpawnBoundaries: panel.$.showSpawnBoundaries.checked,
        showCameraBoundaries: panel.$.showCameraBoundaries.checked,
        showMoveBoundaries: panel.$.showMoveBoundaries.checked,
        showSceneBounds: panel.$.showSceneBounds.checked,
        showEffectRanges: panel.$.showEffectRanges.checked,
        showOcclusionRanges: panel.$.showOcclusionRanges.checked,
        showTriggerRanges: panel.$.showTriggerRanges.checked,
        showOpacityBarrierRanges: panel.$.showOpacityBarrierRanges.checked,
        showBarrierRanges: panel.$.showBarrierRanges.checked,
        layerBoundSelection: [...(panel.layerBoundSelection || [])],
        avgEnabled: panel.$.avgEnabled.checked,
        avgPath: panel.$.avgPath.value,
        avgId: panel.$.avgSelect.value,
    };
}

async function loadSavedSettings(panel: PanelHost): Promise<string> {
    const saved = await Editor.Message.request(PACKAGE_NAME, 'load-settings') || {};
    const textInputs: Array<[keyof PanelElements, string]> = [
        ['moveSpeed', 'moveSpeed'], ['colliderWidth', 'colliderWidth'], ['colliderHeight', 'colliderHeight'],
        ['colliderOffsetX', 'colliderOffsetX'], ['colliderOffsetY', 'colliderOffsetY'],
        ['viewportWidth', 'viewportWidth'], ['viewportHeight', 'viewportHeight'], ['orthoHeight', 'orthoHeight'],
        ['currentStage', 'currentStage'], ['avgPath', 'avgPath'],
    ];
    for (const [elementKey, settingKey] of textInputs) {
        if (saved[settingKey] !== undefined) (panel.$[elementKey] as HTMLInputElement).value = String(saved[settingKey]);
    }
    const savedPreset = typeof saved.resolutionPreset === 'string' ? saved.resolutionPreset : '';
    if (savedPreset === 'custom') {
        panel.$.resolutionPreset.value = 'custom';
        updateResolutionInfo(panel);
    } else if (RESOLUTION_PRESETS.some((item) => item.id === savedPreset)) {
        panel.$.resolutionPreset.value = savedPreset;
        applyResolutionPreset(panel, savedPreset);
    } else {
        // Older saved settings have only width/height. Preserve them and infer a
        // matching preset instead of overwriting them with the HTML default.
        inferResolutionPreset(panel);
    }
    const checks: Array<[keyof PanelElements, string]> = [
        ['showCollider', 'showCollider'], ['enableForegroundOcclusion', 'enableForegroundOcclusion'],
        ['respectBounds', 'respectBounds'], ['showLayerBounds', 'showLayerBounds'],
        ['showFeatureRanges', 'showFeatureRanges'], ['showAuxiliaryRanges', 'showAuxiliaryRanges'],
        ['showCameraFrame', 'showCameraFrame'], ['showExitBoundaries', 'showExitBoundaries'],
        ['showSpawnBoundaries', 'showSpawnBoundaries'], ['showCameraBoundaries', 'showCameraBoundaries'],
        ['showMoveBoundaries', 'showMoveBoundaries'], ['showSceneBounds', 'showSceneBounds'],
        ['showEffectRanges', 'showEffectRanges'], ['showOcclusionRanges', 'showOcclusionRanges'], ['showTriggerRanges', 'showTriggerRanges'],
        ['showOpacityBarrierRanges', 'showOpacityBarrierRanges'], ['showBarrierRanges', 'showBarrierRanges'], ['avgEnabled', 'avgEnabled'],
    ];
    for (const [elementKey, settingKey] of checks) {
        if (typeof saved[settingKey] === 'boolean') (panel.$[elementKey] as HTMLInputElement).checked = saved[settingKey];
    }
    if (typeof saved.showCameraLimits === 'boolean') {
        if (saved.showCameraBoundaries === undefined) panel.$.showCameraBoundaries.checked = saved.showCameraLimits;
        if (saved.showMoveBoundaries === undefined) panel.$.showMoveBoundaries.checked = saved.showCameraLimits;
    }
    if (Array.isArray(saved.layerBoundSelection)) panel.layerBoundSelection = new Set(saved.layerBoundSelection.map(String));
    return String(saved.avgId || '');
}

async function saveSettings(panel: PanelHost): Promise<void> {
    try {
        await Editor.Message.request(PACKAGE_NAME, 'save-settings', collectSettings(panel));
        setStatus(panel, '参数已保存，下次打开会自动恢复');
    } catch (error) {
        setStatus(panel, error instanceof Error ? error.message : String(error), true);
    }
}

async function loadScenes(panel: PanelHost): Promise<void> {
    setStatus(panel, '正在扫描场景…');
    try {
        panel.scenes = await Editor.Message.request(PACKAGE_NAME, 'list-scenes') || [];
        renderSceneList(panel);
        setStatus(panel, panel.scenes.length ? '请选择场景' : '未找到场景', !panel.scenes.length);
    } catch (error) {
        setStatus(panel, error instanceof Error ? error.message : String(error), true);
    }
}

module.exports = Editor.Panel.define({
    template: readFileSync(join(__dirname, '../../../static/template/default/index.html'), 'utf8'),
    style: readFileSync(join(__dirname, '../../../static/style/default/index.css'), 'utf8'),
    $: {
        app: '.app-shell', sceneCount: '#sceneCount', sceneSearch: '#sceneSearch', sceneList: '#sceneList',
        reloadBtn: '#reloadBtn', resetBtn: '#resetBtn', playBtn: '#playBtn', pauseBtn: '#pauseBtn', statusText: '#statusText',
        viewport: '#viewport', previewImage: '#previewImage', emptyState: '#emptyState', playerMarker: '#playerMarker',
        colliderMarker: '#colliderMarker', layerStrip: '#layerStrip', renderLayerAxis: '#renderLayerAxis', moveSpeed: '#moveSpeed', colliderWidth: '#colliderWidth',
        colliderHeight: '#colliderHeight', colliderOffsetX: '#colliderOffsetX', colliderOffsetY: '#colliderOffsetY',
        showCollider: '#showCollider', enableForegroundOcclusion: '#enableForegroundOcclusion',
        viewportWidth: '#viewportWidth', viewportHeight: '#viewportHeight', orthoHeight: '#orthoHeight',
        resolutionPreset: '#resolutionPreset', resolutionInfo: '#resolutionInfo',
        currentStage: '#currentStage',
        respectBounds: '#respectBounds', runtimeStats: '#runtimeStats', sceneInfo: '#sceneInfo',
        avgEnabled: '#avgEnabled', avgPath: '#avgPath', avgReloadBtn: '#avgReloadBtn', avgSelect: '#avgSelect',
        avgPlayBtn: '#avgPlayBtn', avgReplayBtn: '#avgReplayBtn', avgTimeline: '#avgTimeline', avgTime: '#avgTime', avgEvent: '#avgEvent',
        showLayerBounds: '#showLayerBounds', layerBoundOptions: '#layerBoundOptions', showFeatureRanges: '#showFeatureRanges',
        showEffectRanges: '#showEffectRanges', showOcclusionRanges: '#showOcclusionRanges', showTriggerRanges: '#showTriggerRanges',
        showOpacityBarrierRanges: '#showOpacityBarrierRanges', showBarrierRanges: '#showBarrierRanges',
        showAuxiliaryRanges: '#showAuxiliaryRanges', showCameraFrame: '#showCameraFrame',
        showExitBoundaries: '#showExitBoundaries', showSpawnBoundaries: '#showSpawnBoundaries',
        showCameraBoundaries: '#showCameraBoundaries', showMoveBoundaries: '#showMoveBoundaries',
        showSceneBounds: '#showSceneBounds', debugOverlay: '#debugOverlay',
        saveSettingsBtn: '#saveSettingsBtn', resetSettingsBtn: '#resetSettingsBtn',
    },
    async ready(this: PanelHost) {
        this.scenes = [];
        this.selected = null;
        this.session = null;
        this.player = { x: 0, y: 0 };
        this.keys = new Set();
        this.rendering = false;
        this.running = false;
        this.paused = false;
        this.autoMove = false;
        this.renderRequested = false;
        this.avgConfigs = [];
        this.avg = null;
        this.avgPlaying = false;
        this.avgTime = 0;
        this.avgCamera = null;
        this.avgBaseCamera = null;
        this.layerBoundSelection = null;
        this.lastTick = performance.now();
        this.lastAnimationTick = this.lastTick;
        this.onKeyDown = (event: KeyboardEvent) => {
            const key = event.key.toLowerCase();
            if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
                this.keys.add(key);
                event.preventDefault();
            }
        };
        this.onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.key.toLowerCase());
        this.$.app.addEventListener('keydown', this.onKeyDown);
        this.$.app.addEventListener('keyup', this.onKeyUp);
        this.$.viewport.addEventListener('keydown', this.onKeyDown);
        this.$.viewport.addEventListener('keyup', this.onKeyUp);
        this.$.sceneSearch.addEventListener('input', () => renderSceneList(this));
        this.$.sceneList.addEventListener('click', (event) => {
            const card = (event.target as HTMLElement).closest<HTMLElement>('[data-uuid]');
            const scene = this.scenes.find((item) => item.uuid === card?.dataset.uuid);
            if (scene) void startScene(this, scene);
        });
        this.$.reloadBtn.addEventListener('click', () => this.selected ? void startScene(this, this.selected) : void loadScenes(this));
        this.$.resetBtn.addEventListener('click', () => {
            if (!this.session?.born) return;
            this.player = { ...this.session.born };
            void renderFrame(this, 0);
        });
        this.$.playBtn.addEventListener('click', () => {
            this.autoMove = !this.autoMove;
            this.$.playBtn.classList.toggle('active', this.autoMove);
            this.$.playBtn.textContent = this.autoMove ? '停止推进' : '自动推进';
        });
        this.$.pauseBtn.addEventListener('click', () => {
            this.paused = !this.paused;
            this.$.pauseBtn.classList.toggle('active', this.paused);
            this.$.pauseBtn.textContent = this.paused ? '继续动效' : '暂停动效';
        });
        this.$.saveSettingsBtn.addEventListener('click', () => void saveSettings(this));
        this.$.resetSettingsBtn.addEventListener('click', () => {
            this.$.moveSpeed.value = '600';
            this.$.colliderWidth.value = '140';
            this.$.colliderHeight.value = '180';
            this.$.colliderOffsetX.value = '0';
            this.$.colliderOffsetY.value = '75';
            this.$.showCollider.checked = true;
            this.$.enableForegroundOcclusion.checked = true;
            this.$.viewportWidth.value = '700';
            this.$.viewportHeight.value = '1525';
            this.$.orthoHeight.value = String(FIXED_ORTHO_HEIGHT);
            this.$.resolutionPreset.value = 'design';
            updateResolutionInfo(this);
            this.$.currentStage.value = '1st';
            this.$.respectBounds.checked = true;
            this.$.showLayerBounds.checked = false;
            this.$.showFeatureRanges.checked = false;
            this.$.showAuxiliaryRanges.checked = false;
            this.$.showCameraFrame.checked = true;
            this.$.showExitBoundaries.checked = true;
            this.$.showSpawnBoundaries.checked = true;
            this.$.showCameraBoundaries.checked = true;
            this.$.showMoveBoundaries.checked = true;
            this.$.showSceneBounds.checked = false;
            this.$.showEffectRanges.checked = true;
            this.$.showOcclusionRanges.checked = true;
            this.$.showTriggerRanges.checked = true;
            this.$.showOpacityBarrierRanges.checked = true;
            this.$.showBarrierRanges.checked = true;
            this.layerBoundSelection = null;
            renderLayerBoundOptions(this);
            this.$.avgEnabled.checked = false;
            this.$.avgPath.value = 'D:\\client\\configtable\\Animation.xlsx';
            this.$.avgSelect.value = '';
            selectAvg(this);
            void saveSettings(this);
            if (this.selected) void startScene(this, this.selected);
        });
        this.$.avgReloadBtn.addEventListener('click', () => void loadAvgConfigs(this));
        this.$.avgSelect.addEventListener('change', () => selectAvg(this));
        this.$.avgEnabled.addEventListener('change', async () => {
            this.avgPlaying = false;
            this.avgCamera = null;
            this.avgBaseCamera = null;
            if (this.$.avgEnabled.checked && this.avg) {
                this.avgTime = 0;
                if (this.selected) await startScene(this, this.selected);
                else evaluateAvg(this);
            } else if (this.session?.born) {
                this.player = { ...this.session.born };
            }
            void renderFrame(this, 0);
        });
        this.$.avgPlayBtn.addEventListener('click', async () => {
            if (!this.avg) return;
            this.$.avgEnabled.checked = true;
            if (this.avgPlaying) {
                this.avgPlaying = false;
            } else {
                if (this.avgTime <= 0 || this.avgTime >= this.avg.duration) {
                    this.avgTime = 0;
                    this.avgPlaying = false;
                    if (this.selected) await startScene(this, this.selected);
                }
                this.avgPlaying = true;
                this.lastTick = performance.now();
                this.lastAnimationTick = this.lastTick;
            }
            this.$.avgPlayBtn.classList.toggle('active', this.avgPlaying);
            this.$.avgPlayBtn.textContent = this.avgPlaying ? '暂停 AVG' : '播放 AVG';
            evaluateAvg(this);
            void renderFrame(this, 0);
        });
        this.$.avgReplayBtn.addEventListener('click', async () => {
            if (!this.avg) return;
            this.$.avgEnabled.checked = true;
            this.avgTime = 0;
            this.avgPlaying = false;
            if (this.selected) await startScene(this, this.selected);
            this.avgPlaying = true;
            this.lastTick = performance.now();
            this.lastAnimationTick = this.lastTick;
            this.$.avgPlayBtn.classList.add('active');
            this.$.avgPlayBtn.textContent = '暂停 AVG';
            evaluateAvg(this);
            void renderFrame(this, 0);
        });
        this.$.avgTimeline.addEventListener('input', () => {
            if (!this.avg) return;
            this.$.avgEnabled.checked = true;
            this.avgTime = numberValue(this.$.avgTimeline, 0);
            this.avgPlaying = false;
            this.$.avgPlayBtn.classList.remove('active');
            this.$.avgPlayBtn.textContent = '播放 AVG';
            evaluateAvg(this);
            void renderFrame(this, 0);
        });
        this.$.layerBoundOptions.addEventListener('change', (event) => {
            const input = event.target as HTMLInputElement;
            const key = input?.dataset?.layerBoundKey;
            if (!key) return;
            if (this.layerBoundSelection === null) this.layerBoundSelection = new Set();
            if (input.checked) this.layerBoundSelection.add(key); else this.layerBoundSelection.delete(key);
            void renderFrame(this, 0);
        });
        const rerenderInputs = [
            this.$.colliderWidth, this.$.colliderHeight, this.$.colliderOffsetX, this.$.colliderOffsetY,
            this.$.showCollider, this.$.enableForegroundOcclusion, this.$.respectBounds,
            this.$.showLayerBounds, this.$.showFeatureRanges,
            this.$.showEffectRanges, this.$.showOcclusionRanges, this.$.showTriggerRanges,
            this.$.showOpacityBarrierRanges, this.$.showBarrierRanges, this.$.showAuxiliaryRanges,
            this.$.showCameraFrame, this.$.showExitBoundaries, this.$.showSpawnBoundaries,
            this.$.showCameraBoundaries, this.$.showMoveBoundaries, this.$.showSceneBounds,
        ];
        rerenderInputs.forEach((element) => element.addEventListener('change', () => void renderFrame(this, 0)));
        this.$.resolutionPreset.addEventListener('change', () => {
            applyResolutionPreset(this, this.$.resolutionPreset.value);
            if (this.selected) void startScene(this, this.selected, true);
        });
        const resolutionSizeInputs = [this.$.viewportWidth, this.$.viewportHeight];
        resolutionSizeInputs.forEach((element) => element.addEventListener('change', () => {
            this.$.resolutionPreset.value = 'custom';
            updateResolutionInfo(this);
            if (this.selected) void startScene(this, this.selected, true);
        }));
        this.$.orthoHeight.addEventListener('change', () => {
            updateResolutionInfo(this);
            if (this.selected) void startScene(this, this.selected, true);
        });
        this.$.currentStage.addEventListener('change', () => this.selected && void startScene(this, this.selected, true));
        this.timer = setInterval(() => tick(this), 50);
        const savedAvgId = await loadSavedSettings(this);
        await Promise.all([loadScenes(this), loadAvgConfigs(this)]);
        if (savedAvgId && this.avgConfigs.some((item) => item.animeId === savedAvgId)) {
            this.$.avgSelect.value = savedAvgId;
            selectAvg(this);
        }
    },
    beforeClose(this: PanelHost) {
        if (this.timer) clearInterval(this.timer);
        this.$.app.removeEventListener('keydown', this.onKeyDown);
        this.$.app.removeEventListener('keyup', this.onKeyUp);
        void Editor.Message.request(PACKAGE_NAME, 'stop-preview').catch(() => undefined);
    },
});
