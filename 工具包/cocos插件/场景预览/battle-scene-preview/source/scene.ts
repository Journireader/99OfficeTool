import * as fs from 'fs';
import * as zlib from 'zlib';

const cc: any = require('cc');

interface StartPreviewInput {
    uuid: string;
    runtimeCameraUuid: string;
    viewportWidth?: number;
    viewportHeight?: number;
    orthoHeight?: number;
    boundaryStage?: BoundaryStage;
    rendererVersion: number;
}

interface RenderPreviewInput {
    outputPath: string;
    playerX?: number;
    playerY?: number;
    cameraX?: number;
    cameraY?: number;
    parallaxCameraX?: number;
    parallaxCameraY?: number;
    orthoHeight?: number;
    freeCamera?: boolean;
    showLayerBounds?: boolean;
    showFeatureRanges?: boolean;
    deltaTime?: number;
    respectCameraBounds?: boolean;
    colliderWidth?: number;
    colliderHeight?: number;
    colliderOffsetX?: number;
    colliderOffsetY?: number;
    enableForegroundOcclusion?: boolean;
    rendererVersion: number;
}

interface RectLike {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface RuntimeCameraProfile {
    viewportWidth: number;
    viewportHeight: number;
    projection: number;
    orthoHeight: number;
    near: number;
    far: number;
    fov: number;
    fovAxis: number;
    clearFlags: number;
    clearColor: { r: number; g: number; b: number; a: number };
    positionZ: number;
    source: string;
}

const MAX_USER_LAYER_BIT = 19;
const MIN_TEXTURE_EDGE = 128;
const DEFAULT_TEXTURE_EDGE = 1536;
const CLEAR_COLOR = { r: 17, g: 23, b: 31, a: 255 };
const FALLBACK_RUNTIME_CAMERA_WIDTH = 700;
const FALLBACK_RUNTIME_CAMERA_HEIGHT = 1525;
const FALLBACK_RUNTIME_CAMERA_ORTHO_HEIGHT = 762.5;
const BORN_POINT_TYPE = 1;
type BoundaryStage = '1st' | '2nd' | '3rd' | '4th' | 'loop';
const BOUNDARY_STAGES: BoundaryStage[] = ['1st', '2nd', '3rd', '4th', 'loop'];

const CAMERA_BOUNDARY_RIGHT_FIRST = 6;
const CAMERA_BOUNDARY_LEFT_FIRST = 22;
const CAMERA_BOUNDARY_TOP_FIRST = 27;
const CAMERA_BOUNDARY_TOP_LOOP = 31;
const CAMERA_BOUNDARY_BOTTOM_FIRST = 32;
const CAMERA_BOUNDARY_BOTTOM_LOOP = 36;
const BOUNDARY_TYPE_NAMES = [
    'None',
    'MoveBoundaryRight1st', 'MoveBoundaryRight2nd', 'MoveBoundaryRight3rd', 'MoveBoundaryRight4th', 'MoveBoundaryRightLoop',
    'CameraBoundaryRight1st', 'CameraBoundaryRight2nd', 'CameraBoundaryRight3rd', 'CameraBoundaryRight4th', 'CameraBoundaryRightLoop',
    'SpawnTrigger1st', 'SpawnTrigger2nd', 'SpawnTrigger3rd', 'SpawnTrigger4th', 'SpawnTriggerLoop',
    'ExitBoundary',
    'MoveBoundaryLeft1st', 'MoveBoundaryLeft2nd', 'MoveBoundaryLeft3rd', 'MoveBoundaryLeft4th', 'MoveBoundaryLeftLoop',
    'CameraBoundaryLeft1st', 'CameraBoundaryLeft2nd', 'CameraBoundaryLeft3rd', 'CameraBoundaryLeft4th', 'CameraBoundaryLeftLoop',
    'CameraBoundaryTop1st', 'CameraBoundaryTop2nd', 'CameraBoundaryTop3rd', 'CameraBoundaryTop4th', 'CameraBoundaryTopLoop',
    'CameraBoundaryBottom1st', 'CameraBoundaryBottom2nd', 'CameraBoundaryBottom3rd', 'CameraBoundaryBottom4th', 'CameraBoundaryBottomLoop',
];
const MAX_PANORAMA_PIXEL_WIDTH = 16384;
const SCENE_PREVIEW_RENDERER_VERSION = 14;
// Keep this local because CameraUsage is an engine-internal enum in Creator 3.8.
const PREVIEW_CAMERA_USAGE = 3;
const NESTED_PREFAB_LOAD_TIMEOUT_MS = 12000;

function crc32(buffer: Buffer): number {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
    const typeBuffer = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
    return Buffer.concat([length, typeBuffer, data, checksum]);
}

function writeRgbaPng(outputPath: string, pixels: Uint8Array, width: number, height: number): void {
    const rowBytes = width * 4;
    const scanlines = Buffer.alloc((rowBytes + 1) * height);
    for (let row = 0; row < height; row += 1) {
        const targetOffset = row * (rowBytes + 1);
        scanlines[targetOffset] = 0;
        const sourceOffset = (height - 1 - row) * rowBytes;
        Buffer.from(pixels.buffer, pixels.byteOffset + sourceOffset, rowBytes)
            .copy(scanlines, targetOffset + 1);
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const png = Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 6 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
    fs.mkdirSync(require('path').dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, png);
}

function loadPrefab(uuid: string): Promise<any> {
    return new Promise((resolve, reject) => {
        cc.assetManager.loadAny({ uuid }, (error: Error | null, prefab: any) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(prefab);
        });
    });
}

function findFirstComponent(root: any, componentType: any): any | null {
    let result: any | null = root?.getComponent?.(componentType) || null;
    root?.walk?.((node: any) => {
        if (!result) {
            result = node?.getComponent?.(componentType) || null;
        }
    });
    return result;
}

async function loadRuntimeCameraProfile(uuid: string): Promise<RuntimeCameraProfile> {
    let prefabAsset: any = null;
    let runtimeRoot: any = null;
    try {
        if (!uuid) {
            throw new Error('BattleRoadView prefab UUID is missing.');
        }
        prefabAsset = await loadPrefab(uuid);
        runtimeRoot = cc.instantiate(prefabAsset);
        const camera = findFirstComponent(runtimeRoot, cc.Camera);
        const transform = camera?.node?.getComponent?.(cc.UITransform);
        const viewportWidth = Number(transform?.contentSize?.width);
        const viewportHeight = Number(transform?.contentSize?.height);
        const orthoHeight = Number(camera?.orthoHeight);
        if (
            !camera
            || !(viewportWidth > 0)
            || !(viewportHeight > 0)
            || !(orthoHeight > 0)
        ) {
            throw new Error('BattleRoadView does not contain a usable runtime camera profile.');
        }
        const color = camera.clearColor || CLEAR_COLOR;
        return {
            viewportWidth,
            viewportHeight,
            projection: Number(camera.projection),
            orthoHeight,
            near: Number(camera.near),
            far: Number(camera.far),
            fov: Number(camera.fov),
            fovAxis: Number(camera.fovAxis),
            clearFlags: Number(camera.clearFlags),
            clearColor: {
                r: Number(color.r),
                g: Number(color.g),
                b: Number(color.b),
                a: Number(color.a),
            },
            positionZ: Number(camera.node?.worldPosition?.z) || 1000,
            source: 'BattleRoadView.prefab',
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
            `[table_data_visualizer][scene] runtime camera profile fallback: ${message}`,
        );
        return {
            viewportWidth: FALLBACK_RUNTIME_CAMERA_WIDTH,
            viewportHeight: FALLBACK_RUNTIME_CAMERA_HEIGHT,
            projection: Number(cc.Camera.ProjectionType.ORTHO),
            orthoHeight: FALLBACK_RUNTIME_CAMERA_ORTHO_HEIGHT,
            near: 0,
            far: 2000,
            fov: 45,
            fovAxis: 0,
            clearFlags: Number(cc.Camera.ClearFlag.SOLID_COLOR),
            clearColor: { ...CLEAR_COLOR },
            positionZ: 1000,
            source: 'fallback-runtime-camera',
        };
    } finally {
        runtimeRoot?.destroy?.();
        if (prefabAsset && typeof cc.assetManager.releaseAsset === 'function') {
            cc.assetManager.releaseAsset(prefabAsset);
        }
    }
}

function waitForDraw(): Promise<void> {
    return new Promise((resolve) => {
        let settled = false;
        const done = () => {
            if (settled) {
                return;
            }
            settled = true;
            resolve();
        };
        cc.director.once(cc.Director.EVENT_AFTER_DRAW, done);
        setTimeout(done, 500);
    });
}

function requestEditorRepaint(): void {
    const editorEngine = (globalThis as any).cce?.Engine;
    if (typeof editorEngine?.repaintInEditMode === 'function') {
        editorEngine.repaintInEditMode();
    }
}

function waitForNextTask(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 16));
}

async function renderEditorFrames(count: number): Promise<void> {
    for (let frame = 0; frame < count; frame += 1) {
        // Subscribe before requesting the repaint so a fast editor frame cannot be missed.
        const afterDraw = waitForDraw();
        requestEditorRepaint();
        await afterDraw;
        await waitForNextTask();
    }
}

async function renderPreviewFrames(
    camera: any,
    previewRoot: any,
    previewLayer: number,
    count: number,
    beforeSubmit?: () => void,
): Promise<void> {
    for (let frame = 0; frame < count; frame += 1) {
        drivePreviewEditorComponents(previewRoot, previewLayer);
        activatePreviewHierarchy(previewRoot);
        previewRoot.updateWorldTransform?.();
        beforeSubmit?.();
        cc.director.emit?.(cc.Director.EVENT_BEFORE_DRAW);
        refreshPreviewRenderData(previewRoot);

        // The edit-mode director stays invalid while the scene is not playing, so tick()
        // exits before running editor component updates. Root.frameMove() also rebuilds
        // cameraList from registered render windows, and a camera component created in
        // edit mode is not always discovered there. Submit it between Root's process and
        // end phases so Creator still owns device acquire, batching, rendering and present.
        camera.__tableDataVisualizerSubmitMode = submitPreviewCameraFrame(camera);
        cc.director.emit?.(cc.Director.EVENT_AFTER_DRAW);
        await waitForNextTask();
    }
}

function bindPreviewCameraTarget(camera: any): void {
    const nativeCamera = camera?.camera;
    const targetWindow = camera?.targetTexture?.window;
    if (!nativeCamera) {
        throw new Error('Creator did not create the native preview camera.');
    }
    if (!targetWindow) {
        throw new Error('Creator did not create the preview RenderTexture window.');
    }

    if (nativeCamera.window !== targetWindow) {
        nativeCamera.changeTargetWindow?.(targetWindow);
    }
    const targetCameras = Array.isArray(targetWindow.cameras)
        ? targetWindow.cameras
        : targetWindow._cameras;
    if (Array.isArray(targetCameras) && !targetCameras.includes(nativeCamera)) {
        targetWindow.attachCamera?.(nativeCamera);
    }
    nativeCamera.enabled = true;
    nativeCamera.update?.(true);
}

function submitPreviewCameraFrame(camera: any): string {
    const root = cc.director?.root as any;
    const nativeCamera = camera?.camera;
    if (!root || !nativeCamera) {
        throw new Error('Creator Root or preview camera is unavailable.');
    }

    bindPreviewCameraTarget(camera);
    if (
        typeof root._frameMoveBegin === 'function'
        && typeof root._frameMoveProcess === 'function'
        && typeof root._frameMoveEnd === 'function'
    ) {
        root._frameMoveBegin();
        root._frameMoveProcess();
        let frameEndAttempted = false;
        try {
            const cameraList = Array.isArray(root._cameraList) ? root._cameraList : root.cameraList;
            if (!Array.isArray(cameraList)) {
                throw new Error('Creator Root camera list is unavailable.');
            }
            if (!cameraList.includes(nativeCamera)) {
                nativeCamera.update?.(true);
                camera?.targetTexture?.window?.extractRenderCameras?.(cameraList);
            }
            if (!cameraList.includes(nativeCamera)) {
                throw new Error('Preview RenderWindow did not extract its camera into Creator Root.');
            }
            frameEndAttempted = true;
            root._frameMoveEnd();
            return 'root-window-camera-extraction';
        } finally {
            if (!frameEndAttempted) {
                root._frameMoveEnd();
            }
        }
    }

    if (typeof root.frameMove === 'function') {
        root.frameMove(0);
        if (Array.isArray(root.cameraList) && root.cameraList.includes(nativeCamera)) {
            return 'root-frame-move';
        }
    }
    throw new Error('Creator Root did not accept the preview camera for rendering.');
}

function activatePreviewCamera(camera: any): void {
    if (!camera?.camera) {
        if (typeof camera?._createCamera === 'function') {
            camera._createCamera();
        } else {
            camera?.onLoad?.();
        }
    }
    const nativeCamera = camera?.camera;
    if (!nativeCamera) {
        throw new Error('Creator did not create the native preview camera.');
    }
    // The editor render pipeline selects its camera settings from cameraUsage.
    // A dynamically created camera otherwise remains EDITOR usage and can submit
    // an empty offscreen pass even though its RenderWindow and scene are valid.
    nativeCamera.cameraUsage = PREVIEW_CAMERA_USAGE;
    if (!nativeCamera.scene) {
        if (typeof camera?._attachToScene === 'function') {
            camera._attachToScene();
        } else {
            camera?.onEnable?.();
        }
    }
    if (!nativeCamera.scene) {
        throw new Error('Creator did not attach the preview camera to the RenderScene.');
    }
    nativeCamera.enabled = true;
    bindPreviewCameraTarget(camera);
}

function destroyPreviewCamera(camera: any): void {
    if (!camera) {
        return;
    }
    try {
        camera.targetTexture = null;
    } catch {
        // Continue releasing the native camera even if its render target is invalid.
    }
    try {
        camera._detachFromScene?.();
    } catch {
        // The RenderScene may already have detached the camera during editor reload.
    }
    const nativeCamera = camera.camera;
    if (nativeCamera) {
        try {
            nativeCamera.destroy?.();
        } finally {
            // Prevent the component's deferred onDestroy from destroying it twice.
            camera._camera = null;
        }
    }
}

function isSceneContentPixel(pixels: Uint8Array, offset: number): boolean {
    const alpha = pixels[offset + 3];
    return alpha !== 0
        && (
            Math.abs(pixels[offset] - CLEAR_COLOR.r) > 2
            || Math.abs(pixels[offset + 1] - CLEAR_COLOR.g) > 2
            || Math.abs(pixels[offset + 2] - CLEAR_COLOR.b) > 2
            || alpha !== CLEAR_COLOR.a
        );
}

function hasSceneContentPixels(pixels: Uint8Array): boolean {
    for (let offset = 0; offset < pixels.length; offset += 4) {
        if (isSceneContentPixel(pixels, offset)) {
            return true;
        }
    }
    return false;
}

function classNameOf(component: any): string {
    try {
        return String(cc.js?.getClassName(component) || component?.constructor?.name || '');
    } catch {
        return String(component?.constructor?.name || '');
    }
}

function isSafeRenderComponent(component: any): boolean {
    const name = classNameOf(component);
    const safeNames = [
        'cc.UITransform',
        'cc.Sprite',
        'cc.Label',
        'cc.RichText',
        'cc.Graphics',
        'cc.Mask',
        'cc.UIOpacity',
        'cc.Widget',
        'cc.Animation',
        'cc.SkeletalAnimation',
        'cc.ParticleSystem2D',
        'cc.RenderRoot2D',
        'cc.Canvas',
        'sp.Skeleton',
        'cc.sp.Skeleton',
        'battle.editor.EditingPrefabRef',
    ];
    return safeNames.some((safeName) => name === safeName || name.endsWith(safeName))
        || name.endsWith('EditingPrefabRef');
}

function selectIsolatedPreviewLayer(scene: any): number {
    let usedLayers = 0;
    scene?.walk?.((node: any) => {
        usedLayers = (usedLayers | (Number(node?.layer) || 0)) >>> 0;
    });
    for (let bit = MAX_USER_LAYER_BIT; bit >= 0; bit -= 1) {
        const candidate = (1 << bit) >>> 0;
        if ((usedLayers & candidate) === 0) {
            return candidate;
        }
    }
    throw new Error('No unused Creator user layer is available for the isolated scene preview.');
}

function preparePrefabForPreview(root: any, previewLayer: number, deactivateRoot = true): number {
    if (deactivateRoot) {
        root.active = false;
    }
    root.__tableDataVisualizerPreviewLayer = previewLayer;
    root.walk((node: any) => {
        node.layer = previewLayer;
        if (/^boundary-\d+$/.test(String(node.name || ''))) node.active = false;
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        components.forEach((component: any) => {
            if (typeof component.enabled === 'boolean' && !isSafeRenderComponent(component)) {
                component.enabled = false;
            }
        });
    });
    if (!root.getComponent?.(cc.RenderRoot2D)) {
        root.addComponent(cc.RenderRoot2D);
    }
    return previewLayer;
}

function activatePreviewHierarchy(root: any): {
    activatedComponents: number;
    registeredRenderRoots: number;
} {
    const nodeActivator = cc.director?._nodeActivator as any;
    const batcher = cc.director?.root?.batcher2D as any;
    let activatedComponents = 0;
    let registeredRenderRoots = 0;
    root?.walk?.((node: any) => {
        if (!node?.activeInHierarchy) {
            return;
        }
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        components.forEach((component: any) => {
            if (
                component?.enabled === false
                || !isSafeRenderComponent(component)
            ) {
                return;
            }
            if (typeof nodeActivator?.activateComp === 'function') {
                nodeActivator.activateComp(component);
                activatedComponents += 1;
            }
            if (!classNameOf(component).endsWith('RenderRoot2D')) {
                return;
            }
            const screens = Array.isArray(batcher?._screens) ? batcher._screens : batcher?.screens;
            if (
                Array.isArray(screens)
                && !screens.includes(component)
                && typeof batcher?.addScreen === 'function'
            ) {
                batcher.addScreen(component);
                registeredRenderRoots += 1;
            }
        });
    });
    return { activatedComponents, registeredRenderRoots };
}

function collectRenderDiagnostics(root: any, camera: any, bounds: RectLike, textureSize: { width: number; height: number }): any {
    const diagnostics = {
        activeNodes: 0,
        enabledRenderComponents: 0,
        sprites: 0,
        spritesWithFrame: 0,
        skeletons: 0,
        renderRoots: 0,
        layers: [] as number[],
        bounds,
        textureSize,
        cameraVisibility: Number(camera?.visibility) >>> 0,
        cameraEnabled: Boolean(camera?.enabledInHierarchy ?? camera?.enabled),
        cameraTargetSize: {
            width: Number(camera?.targetTexture?.width) || 0,
            height: Number(camera?.targetTexture?.height) || 0,
        },
        rootCameraCount: Number(cc.director?.root?.cameraList?.length) || 0,
        targetCameraRegistered: Boolean(
            camera?.camera
            && cc.director?.root?.cameraList?.includes?.(camera.camera),
        ),
        targetWindowRegistered: Boolean(
            camera?.targetTexture?.window
            && (
                cc.director?.root?._windows?.includes?.(camera.targetTexture.window)
                || cc.director?.root?.windows?.includes?.(camera.targetTexture.window)
            )
        ),
        targetWindowCameraCount: Number(
            camera?.targetTexture?.window?.cameras?.length
            ?? camera?.targetTexture?.window?._cameras?.length
            ?? 0,
        ),
        nativeCameraTargetsTexture: Boolean(
            camera?.camera?.window
            && camera.camera.window === camera?.targetTexture?.window,
        ),
        nativeCameraUsage: Number(camera?.camera?.cameraUsage),
        cameraInEditorMode: Boolean(camera?.inEditorMode),
        renderSubmissionMode: String(camera?.__tableDataVisualizerSubmitMode || ''),
        previewLayer: Number(root?.__tableDataVisualizerPreviewLayer) >>> 0,
        batcherScreenCount: Number(
            cc.director?.root?.batcher2D?._screens?.length
            ?? cc.director?.root?.batcher2D?.screens?.length
            ?? 0,
        ),
        registeredPreviewRenderRoots: 0,
        directorInvalid: Boolean(cc.director?._invalid),
        directorPaused: Boolean(cc.director?._paused),
        editorComponents: null as any,
        refreshedRenderers: 0,
        rendererVersion: SCENE_PREVIEW_RENDERER_VERSION,
    };
    const layers = new Set<number>();
    root.walk((node: any) => {
        if (!node?.activeInHierarchy) {
            return;
        }
        diagnostics.activeNodes += 1;
        const layer = Number(node.layer) >>> 0;
        if (layer) {
            layers.add(layer);
        }
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        components.forEach((component: any) => {
            if (component?.enabledInHierarchy === false || component?.enabled === false) {
                return;
            }
            const name = classNameOf(component);
            if (name.endsWith('Sprite')) {
                diagnostics.sprites += 1;
                if (component.spriteFrame) {
                    diagnostics.spritesWithFrame += 1;
                }
            }
            if (name.endsWith('Skeleton')) {
                diagnostics.skeletons += 1;
            }
            if (name.endsWith('RenderRoot2D')) {
                diagnostics.renderRoots += 1;
                const screens = cc.director?.root?.batcher2D?._screens
                    ?? cc.director?.root?.batcher2D?.screens;
                if (Array.isArray(screens) && screens.includes(component)) {
                    diagnostics.registeredPreviewRenderRoots += 1;
                }
            }
            if (
                name.endsWith('Sprite')
                || name.endsWith('Label')
                || name.endsWith('RichText')
                || name.endsWith('Graphics')
                || name.endsWith('Skeleton')
                || name.endsWith('ParticleSystem2D')
            ) {
                diagnostics.enabledRenderComponents += 1;
            }
        });
    });
    diagnostics.layers = [...layers].sort((left, right) => left - right);
    diagnostics.editorComponents = drivePreviewEditorComponents(
        root,
        Number(root?.__tableDataVisualizerPreviewLayer) >>> 0,
    );
    diagnostics.refreshedRenderers = refreshPreviewRenderData(root);
    return diagnostics;
}

function collectEditingPrefabRefs(root: any): any[] {
    const refs: any[] = [];
    root.walk((node: any) => {
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        components.forEach((component: any) => {
            if (classNameOf(component).endsWith('EditingPrefabRef')) {
                refs.push(component);
            }
        });
    });
    return refs;
}

function drivePreviewEditorComponents(root: any, previewLayer: number): {
    editingPrefabRefs: number;
    instantiatedPrefabRefs: number;
    loadingPrefabRefs: number;
} {
    let editingPrefabRefs = 0;
    let instantiatedPrefabRefs = 0;
    let loadingPrefabRefs = 0;

    // A newly instantiated nested prefab can contain more EditingPrefabRef components.
    // Repeat a few passes so the complete hierarchy is discovered without ticking the
    // editor's unrelated scene components.
    for (let pass = 0; pass < 8; pass += 1) {
        const refs = collectEditingPrefabRefs(root);
        const countBefore = refs.length;
        refs.forEach((component: any) => {
            editingPrefabRefs += 1;
            const prefabRef = component?.prefabRef;
            const uuid = String(prefabRef?._assetUUID || '').trim();
            if (uuid && !prefabRef?._assetInstance$$ && !prefabRef?._loading$$) {
                prefabRef?.loadInEditor$$?.();
            }
            // The source component can persist showAABB=true. In editor mode that
            // draws a green Graphics rectangle into the preview image itself.
            // Debug ranges are rendered by the panel, so suppress it on the clone.
            if ('showAABB' in component) component.showAABB = false;
            component?.update?.(0);
            component?._graphics?.clear?.();
            component?.node?.getComponent?.(cc.Graphics)?.clear?.();
            if (component?._instance) {
                instantiatedPrefabRefs += 1;
                preparePrefabForPreview(component._instance, previewLayer, false);
                activatePreviewHierarchy(component._instance);
                component._instance.updateWorldTransform?.();
            } else if (uuid) {
                loadingPrefabRefs += 1;
            }
        });
        if (collectEditingPrefabRefs(root).length === countBefore) {
            break;
        }
    }

    return {
        editingPrefabRefs,
        instantiatedPrefabRefs,
        loadingPrefabRefs,
    };
}

function refreshPreviewRenderData(root: any): number {
    let refreshed = 0;
    root.walk((node: any) => {
        if (!node?.activeInHierarchy) {
            return;
        }
        node.updateWorldTransform?.();
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        components.forEach((component: any) => {
            if (component?.enabledInHierarchy === false || component?.enabled === false) {
                return;
            }
            if (typeof component.markForUpdateRenderData === 'function') {
                component.markForUpdateRenderData(true);
            }
            if (typeof component.updateRenderer === 'function') {
                component.updateRenderer();
                refreshed += 1;
            }
        });
    });
    return refreshed;
}

async function waitForNestedPrefabRefs(root: any, previewLayer: number): Promise<number> {
    const startedAt = Date.now();
    let expectedCount = 0;
    while (Date.now() - startedAt < NESTED_PREFAB_LOAD_TIMEOUT_MS) {
        drivePreviewEditorComponents(root, previewLayer);
        await renderEditorFrames(1);
        drivePreviewEditorComponents(root, previewLayer);
        const refs = collectEditingPrefabRefs(root);
        expectedCount = Math.max(expectedCount, refs.length);
        const pending = refs.filter((component: any) => {
            const uuid = String(component?.prefabRef?._assetUUID || '').trim();
            return uuid && !component?._instance;
        });
        if (!pending.length) {
            return expectedCount;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const unresolved = collectEditingPrefabRefs(root)
        .filter((component: any) => String(component?.prefabRef?._assetUUID || '').trim() && !component?._instance)
        .length;
    throw new Error(`Timed out while loading ${unresolved}/${expectedCount} nested scene prefabs.`);
}

function shouldMeasureNode(node: any): boolean {
    if (!node?.activeInHierarchy) {
        return false;
    }
    const lowerName = String(node.name || '').toLowerCase();
    if (
        lowerName.includes('boundary')
        || lowerName.includes('collider')
        || lowerName.includes('position')
        || lowerName.includes('viewport')
        || lowerName.includes('helper')
    ) {
        return false;
    }
    const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
    return components.some(isSafeRenderComponent);
}

function unionRect(current: RectLike | null, next: RectLike): RectLike {
    if (!current) {
        return { ...next };
    }
    const minX = Math.min(current.x, next.x);
    const minY = Math.min(current.y, next.y);
    const maxX = Math.max(current.x + current.width, next.x + next.width);
    const maxY = Math.max(current.y + current.height, next.y + next.height);
    return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
    };
}

function rectFromEditingScene(root: any): RectLike | null {
    const editingScene = root.getComponent?.('battle.editor.EditingScene');
    const roadLayer = editingScene?.roadLayer;
    const width = Number(roadLayer?.width) || 0;
    const height = Number(roadLayer?.height) || 0;
    if (width <= 0 || height <= 0) {
        return null;
    }
    const position = roadLayer?.node?.worldPosition || root.worldPosition || { x: 0, y: 0 };
    return {
        x: Number(position.x) - width / 2,
        y: Number(position.y) - height / 2,
        width,
        height,
    };
}

function collectVisualBounds(root: any): RectLike {
    let bounds = rectFromEditingScene(root);
    root.walk((node: any) => {
        if (!shouldMeasureNode(node)) {
            return;
        }
        const transform = node.getComponent?.(cc.UITransform);
        if (!transform || typeof transform.getBoundingBoxToWorld !== 'function') {
            return;
        }
        const rect = transform.getBoundingBoxToWorld();
        if (Number(rect.width) > 1 && Number(rect.height) > 1) {
            bounds = unionRect(bounds, {
                x: Number(rect.x),
                y: Number(rect.y),
                width: Number(rect.width),
                height: Number(rect.height),
            });
        }
    });
    return bounds && bounds.width > 1 && bounds.height > 1
        ? bounds
        : { x: -640, y: -360, width: 1280, height: 720 };
}

function calculateRuntimeTextureSize(
    maxTextureSize: number,
    cameraProfile: RuntimeCameraProfile,
): { width: number; height: number } {
    const maxEdge = Math.max(256, Math.min(2048, Math.floor(maxTextureSize || DEFAULT_TEXTURE_EDGE)));
    const scale = Math.min(1, maxEdge / cameraProfile.viewportHeight);
    return {
        width: Math.max(MIN_TEXTURE_EDGE, Math.round(cameraProfile.viewportWidth * scale)),
        height: Math.max(MIN_TEXTURE_EDGE, Math.round(cameraProfile.viewportHeight * scale)),
    };
}

function findNodeByName(root: any, name: string): any | null {
    let result: any | null = null;
    root.walk((node: any) => {
        if (!result && String(node?.name || '') === name) {
            result = node;
        }
    });
    return result;
}

function clampCameraAxis(value: number, lower: number, upper: number, halfExtent: number): number {
    const effectiveLower = lower + halfExtent;
    const effectiveUpper = upper - halfExtent;
    if (effectiveLower > effectiveUpper) {
        return Math.min(Math.max(value, lower), upper);
    }
    return Math.min(Math.max(value, effectiveLower), effectiveUpper);
}

function resolveRuntimeCameraSweep(
    root: any,
    visualBounds: RectLike,
    cameraProfile: RuntimeCameraProfile,
    requestedStage: BoundaryStage = '1st',
): {
    bounds: RectLike;
    centerY: number;
    cameraStartX: number;
    cameraEndX: number;
    viewportWorldWidth: number;
    viewportWorldHeight: number;
    boundaryStage: BoundaryStage;
    activeBoundaryTypes: number[];
    rightBoundaryFallback: string;
    boundaryViewportConflict: boolean;
    boundaryViewportOverflow: number;
    boundaryFallbackMode: string;
    source: string;
} {
    const editingScene = root.getComponent?.('battle.editor.EditingScene');
    const rootPosition = editingScene?.node?.worldPosition || root.worldPosition || { x: 0, y: 0 };
    const bornPoint = Array.isArray(editingScene?.positions)
        ? editingScene.positions.find((item: any) => Number(item?.positionType) === BORN_POINT_TYPE)
        : null;
    const bornPosition = bornPoint?.collider?.node?.worldPosition;
    const previewCameraNode = findNodeByName(root, 'PreviewCamera');
    const previewCameraPosition = previewCameraNode?.worldPosition;
    const viewportWorldHeight = cameraProfile.orthoHeight * 2;
    const viewportWorldWidth = viewportWorldHeight
        * cameraProfile.viewportWidth
        / cameraProfile.viewportHeight;

    let centerY = 0;
    let source = 'born-point';
    if (!Number.isFinite(Number(bornPosition?.x))) {
        centerY = Number(previewCameraPosition?.y);
        source = 'preview-camera';
    }
    if (!Number.isFinite(Number(bornPosition?.x)) && !Number.isFinite(Number(previewCameraPosition?.x))) {
        centerY = Number(rootPosition.y) || 0;
        source = 'visual-center';
    }

    const roadBounds = rectFromEditingScene(root);
    const boundaries = Array.isArray(editingScene?.boundaries) ? editingScene.boundaries : [];
    const boundaryStage = BOUNDARY_STAGES.includes(requestedStage) ? requestedStage : '1st';
    const stageIndex = BOUNDARY_STAGES.indexOf(boundaryStage);
    const requestedCameraLeftType = CAMERA_BOUNDARY_LEFT_FIRST + stageIndex;
    const requestedCameraRightType = CAMERA_BOUNDARY_RIGHT_FIRST + stageIndex;
    const firstCameraLeftBoundary = boundaries.find((item: any) => Number(item?.type) === CAMERA_BOUNDARY_LEFT_FIRST);
    const cameraLeftBoundary = boundaries.find(
        (item: any) => Number(item?.type) === requestedCameraLeftType,
    ) || firstCameraLeftBoundary;
    const cameraRightCandidates = boundaries.filter((item: any) => (
        Number(item?.type) >= CAMERA_BOUNDARY_RIGHT_FIRST
        && Number(item?.type) < CAMERA_BOUNDARY_RIGHT_FIRST + BOUNDARY_STAGES.length
        && Number.isFinite(Number(item?.limitX))
    ));
    const exactCameraRightBoundary = cameraRightCandidates.find(
        (item: any) => Number(item?.type) === requestedCameraRightType,
    );
    const firstCameraRightBoundary = cameraRightCandidates.find(
        (item: any) => Number(item?.type) === CAMERA_BOUNDARY_RIGHT_FIRST,
    );
    const rightmostCameraBoundary = cameraRightCandidates.reduce((rightmost: any, item: any) => (
        !rightmost || Number(item.limitX) > Number(rightmost.limitX) ? item : rightmost
    ), null);
    const previousCameraRightBoundary = cameraRightCandidates
        .filter((item: any) => Number(item.type) <= requestedCameraRightType)
        .reduce((previous: any, item: any) => !previous || Number(item.type) > Number(previous.type) ? item : previous, null);
    const cameraRightBoundary = exactCameraRightBoundary
        || (boundaryStage === 'loop' ? rightmostCameraBoundary : previousCameraRightBoundary || firstCameraRightBoundary);
    const rightBoundaryFallback = exactCameraRightBoundary
        ? ''
        : cameraRightBoundary ? BOUNDARY_TYPE_NAMES[Number(cameraRightBoundary.type)] || '' : '';
    const fallbackCameraStartX = roadBounds?.x ?? visualBounds.x;
    const fallbackCameraEndX = roadBounds
        ? roadBounds.x + roadBounds.width
        : visualBounds.x + visualBounds.width;
    const configuredCameraStartX = Number.isFinite(Number(cameraLeftBoundary?.limitX))
        ? Number(rootPosition.x) + Number(cameraLeftBoundary.limitX)
        : fallbackCameraStartX;
    const configuredCameraEndX = Number.isFinite(Number(cameraRightBoundary?.limitX))
        ? Number(rootPosition.x) + Number(cameraRightBoundary.limitX)
        : fallbackCameraEndX;
    // EditingScene stores the camera boundaries as visible world-edge limits.
    // BattleCameraController clamps the camera centre after accounting for half
    // of the viewport, so the preview must use the same effective interval.
    const worldBoundaryLeftX = Math.min(configuredCameraStartX, configuredCameraEndX);
    const worldBoundaryRightX = Math.max(configuredCameraStartX, configuredCameraEndX);
    const viewportHalfWidth = viewportWorldWidth / 2;
    const effectiveCameraStartX = worldBoundaryLeftX + viewportHalfWidth;
    const effectiveCameraEndX = worldBoundaryRightX - viewportHalfWidth;
    const boundaryViewportOverflow = Math.max(
        0,
        viewportWorldWidth - (worldBoundaryRightX - worldBoundaryLeftX),
    );
    const boundaryViewportConflict = boundaryViewportOverflow > 0.001;
    let boundaryFallbackMode = '';
    let cameraStartX = effectiveCameraStartX;
    let cameraEndX = effectiveCameraEndX;
    if (boundaryViewportConflict) {
        // The viewport cannot fit between both stage boundaries. The scene
        // advances to the right, so keep the forward edge hard and use the
        // actual scene content edge as the rear fallback. Never allow the
        // camera centre itself to reach the configured right-edge boundary.
        const contentLeftX = roadBounds?.x ?? visualBounds.x;
        const contentSafeStartX = contentLeftX + viewportHalfWidth;
        cameraEndX = worldBoundaryRightX - viewportHalfWidth;
        cameraStartX = Math.min(contentSafeStartX, cameraEndX);
        boundaryFallbackMode = contentSafeStartX <= cameraEndX
            ? '右边界优先，左侧使用场景内容边界'
            : '右边界优先，视口宽于可用场景内容';
    }
    if (!(cameraEndX >= cameraStartX)) {
        throw new Error(
            `Scene camera sweep for ${boundaryStage} is invalid: ${cameraStartX} -> ${cameraEndX}.`,
        );
    }

    const bottomValues = boundaries
        .filter((item: any) => {
            const type = Number(item?.type);
            return type >= CAMERA_BOUNDARY_BOTTOM_FIRST && type <= CAMERA_BOUNDARY_BOTTOM_LOOP;
        })
        .map((item: any) => Number(item?.limitY))
        .filter(Number.isFinite);
    const topValues = boundaries
        .filter((item: any) => {
            const type = Number(item?.type);
            return type >= CAMERA_BOUNDARY_TOP_FIRST && type <= CAMERA_BOUNDARY_TOP_LOOP;
        })
        .map((item: any) => Number(item?.limitY))
        .filter(Number.isFinite);
    if (bottomValues.length > 0 && topValues.length > 0) {
        const bottom = Number(rootPosition.y) + Math.max(...bottomValues);
        const top = Number(rootPosition.y) + Math.min(...topValues);
        const desiredY = Number.isFinite(Number(bornPosition?.y))
            ? Number(bornPosition.y)
            : centerY;
        centerY = clampCameraAxis(desiredY, bottom, top, viewportWorldHeight / 2);
    } else if (source === 'born-point') {
        // BattleCameraController keeps Y at zero when no vertical bounds exist.
        centerY = Number(rootPosition.y) || 0;
    } else if (!Number.isFinite(centerY)) {
        centerY = Number(rootPosition.y) || 0;
    }

    const configuredTypes = new Set(boundaries.map((item: any) => Number(item?.type)));
    const stageTypes = [
        1 + stageIndex,
        11 + stageIndex,
        17 + stageIndex,
        27 + stageIndex,
        32 + stageIndex,
        Number(cameraLeftBoundary?.type),
        Number(cameraRightBoundary?.type),
    ].filter((type) => Number.isFinite(type) && configuredTypes.has(type));

    return {
        bounds: {
            // The panorama is the exact union of the two endpoint camera views.
            x: cameraStartX - viewportWorldWidth / 2,
            y: centerY - viewportWorldHeight / 2,
            width: (cameraEndX - cameraStartX) + viewportWorldWidth,
            height: viewportWorldHeight,
        },
        centerY,
        cameraStartX,
        cameraEndX,
        viewportWorldWidth,
        viewportWorldHeight,
        boundaryStage,
        activeBoundaryTypes: [...new Set(stageTypes)],
        rightBoundaryFallback,
        boundaryViewportConflict,
        boundaryViewportOverflow,
        boundaryFallbackMode,
        source: `${cameraProfile.source}:${source}:camera-boundary-${boundaryStage}${rightBoundaryFallback ? `-fallback-${rightBoundaryFallback}` : ''}`,
    };
}

function calculatePanoramaWidth(
    bounds: RectLike,
    viewportPixelWidth: number,
    viewportWorldWidth: number,
): number {
    const pixelsPerWorldUnit = viewportPixelWidth / viewportWorldWidth;
    const width = Math.max(1, Math.round(bounds.width * pixelsPerWorldUnit));
    if (width > MAX_PANORAMA_PIXEL_WIDTH) {
        throw new Error(
            `Scene panorama width ${width}px exceeds the ${MAX_PANORAMA_PIXEL_WIDTH}px safety limit.`,
        );
    }
    return width;
}

function buildRuntimeCameraSweepPositions(
    cameraStartX: number,
    cameraEndX: number,
    viewportWorldWidth: number,
): number[] {
    const positions = [cameraStartX];
    const step = Math.max(1, viewportWorldWidth);
    for (let position = cameraStartX + step; position < cameraEndX - 0.001; position += step) {
        positions.push(position);
    }
    if (Math.abs(positions[positions.length - 1] - cameraEndX) > 0.001) {
        positions.push(cameraEndX);
    }
    return positions;
}

function copyViewportSlice(
    target: Uint8Array,
    targetWidth: number,
    targetX: number,
    source: Uint8Array,
    sourceWidth: number,
    height: number,
    copyWidth: number,
): void {
    const sourceRowBytes = sourceWidth * 4;
    const targetRowBytes = targetWidth * 4;
    const copyRowBytes = copyWidth * 4;
    for (let row = 0; row < height; row += 1) {
        const sourceOffset = row * sourceRowBytes;
        const targetOffset = row * targetRowBytes + targetX * 4;
        target.set(
            source.subarray(sourceOffset, sourceOffset + copyRowBytes),
            targetOffset,
        );
    }
}

interface PreviewGroundState {
    node: any;
    name: string;
    configuredWidth: number;
    configuredHeight: number;
    origin: { x: number; y: number; z: number };
    layerIndex: number;
    rateX: number;
    rateY: number;
}

interface PreviewOccluderState {
    node: any;
    colliderNode: any;
    transform: any;
    collider: any;
    baseOpacity: number;
    groundName: string;
    layerIndex: number;
}

interface PreviewSession {
    prefabAsset: any;
    root: any;
    cameraNode: any;
    camera: any;
    renderTexture: any;
    previewLayer: number;
    textureSize: { width: number; height: number };
    cameraProfile: RuntimeCameraProfile;
    runtimeFrame: ReturnType<typeof resolveRuntimeCameraSweep>;
    grounds: PreviewGroundState[];
    occluders: PreviewOccluderState[];
    born: { x: number; y: number };
    positions: Record<string, { x: number; y: number }>;
    initializedAnimations: WeakSet<object>;
    nestedPrefabCount: number;
}

let activeSession: PreviewSession | null = null;

function validateRendererVersion(version: number): void {
    if (Number(version) !== SCENE_PREVIEW_RENDERER_VERSION) {
        throw new Error(
            `Scene preview renderer is stale (loaded ${SCENE_PREVIEW_RENDERER_VERSION}, requested ${version}). `
            + 'Reload the battle-scene-preview extension and retry.',
        );
    }
}

function disposeSession(): void {
    const session = activeSession;
    activeSession = null;
    if (!session) return;
    destroyPreviewCamera(session.camera);
    session.cameraNode?.destroy?.();
    session.root?.destroy?.();
    session.renderTexture?.destroy?.();
    if (session.prefabAsset && typeof cc.assetManager.releaseAsset === 'function') {
        cc.assetManager.releaseAsset(session.prefabAsset);
    }
}

function readBornPoint(root: any, fallbackX: number, fallbackY: number): { x: number; y: number } {
    const editingScene = root.getComponent?.('battle.editor.EditingScene');
    const born = Array.isArray(editingScene?.positions)
        ? editingScene.positions.find((item: any) => Number(item?.positionType) === BORN_POINT_TYPE)
        : null;
    const worldPosition = born?.collider?.node?.worldPosition;
    return {
        x: Number.isFinite(Number(worldPosition?.x)) ? Number(worldPosition.x) : fallbackX,
        y: Number.isFinite(Number(worldPosition?.y)) ? Number(worldPosition.y) : fallbackY,
    };
}

function collectPositions(root: any): Record<string, { x: number; y: number }> {
    const editingScene = root.getComponent?.('battle.editor.EditingScene');
    const result: Record<string, { x: number; y: number }> = {};
    for (const item of Array.isArray(editingScene?.positions) ? editingScene.positions : []) {
        const id = String(item?.id || '').trim();
        const position = item?.collider?.node?.worldPosition;
        if (id && Number.isFinite(Number(position?.x)) && Number.isFinite(Number(position?.y))) {
            result[id] = { x: Number(position.x), y: Number(position.y) };
        }
    }
    return result;
}

function boundaryCategory(type: number): { category: 'exit' | 'spawn' | 'camera' | 'move'; categoryLabel: string } | null {
    if (type === 16) return { category: 'exit', categoryLabel: '离开场景线' };
    if (type >= 11 && type <= 15) return { category: 'spawn', categoryLabel: '召唤怪物线' };
    if ((type >= 6 && type <= 10) || (type >= 22 && type <= 36)) return { category: 'camera', categoryLabel: '镜头限制线' };
    if ((type >= 1 && type <= 5) || (type >= 17 && type <= 21)) return { category: 'move', categoryLabel: '移动限制线' };
    return null;
}

function collectBoundaryGuides(root: any, activeBoundaryTypes: Set<number> = new Set()): Array<{
    type: number;
    typeLabel: string;
    category: 'exit' | 'spawn' | 'camera' | 'move';
    categoryLabel: string;
    horizontal: boolean;
    active: boolean;
    x: number;
    y: number;
}> {
    const editingScene = root.getComponent?.('battle.editor.EditingScene');
    const origin = editingScene?.node?.worldPosition || root.worldPosition || { x: 0, y: 0 };
    const guides = (Array.isArray(editingScene?.boundaries) ? editingScene.boundaries : []).flatMap((boundary: any) => {
        const type = Number(boundary?.type);
        const category = boundaryCategory(type);
        if (!category) return [];
        return [{
            type,
            typeLabel: BOUNDARY_TYPE_NAMES[type] || `BoundaryType ${type}`,
            ...category,
            horizontal: type >= CAMERA_BOUNDARY_TOP_FIRST && type <= CAMERA_BOUNDARY_BOTTOM_LOOP,
            active: activeBoundaryTypes.has(type),
            x: Number(origin.x) + (Number(boundary?.limitX) || 0),
            y: Number(origin.y) + (Number(boundary?.limitY) || 0),
        }];
    });
    return guides.sort((left: any, right: any) => {
        if (left.horizontal !== right.horizontal) return left.horizontal ? 1 : -1;
        return left.horizontal ? left.y - right.y : left.x - right.x;
    });
}

function collectGroundStates(root: any): PreviewGroundState[] {
    const editingScene = root.getComponent?.('battle.editor.EditingScene');
    if (!Array.isArray(editingScene?.groundLayers)) return [];
    return editingScene.groundLayers.flatMap((ground: any) => {
        const node = ground?.ground?.node;
        if (!node) return [];
        const position = node.position;
        return [{
            node,
            name: String(node.name || `Layer ${ground.layerIndex}`),
            configuredWidth: Math.max(0, Number(ground.ground?.width) || 0),
            configuredHeight: 700,
            origin: { x: Number(position.x), y: Number(position.y), z: Number(position.z) },
            layerIndex: Number(ground.layerIndex) || 0,
            rateX: Number(ground.moveSpeedRateX) || 0,
            rateY: Number(ground.moveSpeedRateY) || 0,
        }];
    });
}

function applyConfiguredRenderOrder(root: any, grounds: PreviewGroundState[]): void {
    const editingScene = root.getComponent?.('battle.editor.EditingScene');
    const roadNode = editingScene?.roadLayer?.node;
    const entries = [
        ...grounds.map((ground) => ({ node: ground.node, layerIndex: ground.layerIndex })),
        ...(roadNode ? [{ node: roadNode, layerIndex: 0 }] : []),
    ].filter((entry) => entry.node?.parent && typeof entry.node.setSiblingIndex === 'function');
    const byParent = new Map<any, Array<{ node: any; layerIndex: number }>>();
    for (const entry of entries) {
        const group = byParent.get(entry.node.parent) || [];
        group.push(entry);
        byParent.set(entry.node.parent, group);
    }
    for (const [parent, group] of byParent) {
        if (group.length < 2) continue;
        // Cocos UI renders later siblings on top. Runtime uses camera priority
        // 100 + layerIndex, so ascending sibling order reproduces the same
        // back -> road -> front composition in this single-camera preview.
        const firstIndex = Math.min(...group.map((entry) => Number(entry.node.getSiblingIndex?.()) || 0));
        group.sort((left, right) => (
            left.layerIndex - right.layerIndex
            || String(left.node.name || '').localeCompare(String(right.node.name || ''), 'zh-CN')
        ));
        group.forEach((entry, offset) => entry.node.setSiblingIndex(firstIndex + offset));
        parent.updateWorldTransform?.();
    }
}

function configuredLayerBounds(session: PreviewSession): Array<RectLike & { layerIndex: number; name: string; kind: string }> {
    const result: Array<RectLike & { layerIndex: number; name: string; kind: string }> = [];
    const editingScene = session.root.getComponent?.('battle.editor.EditingScene');
    const road = editingScene?.roadLayer;
    if (road?.node && Number(road.width) > 0 && Number(road.height) > 0) {
        const position = road.node.worldPosition || road.node.position || { x: 0, y: 0 };
        const scale = road.node.worldScale || road.node.scale || { x: 1, y: 1 };
        const width = Math.abs(Number(road.width) * Number(scale.x || 1));
        const height = Math.abs(Number(road.height) * Number(scale.y || 1));
        result.push({ x: Number(position.x) - width / 2, y: Number(position.y) - height / 2, width, height, layerIndex: 0, name: String(road.node.name || 'Road'), kind: 'road' });
    }
    for (const ground of session.grounds) {
        const position = ground.node.worldPosition || ground.node.position || { x: 0, y: 0 };
        const scale = ground.node.worldScale || ground.node.scale || { x: 1, y: 1 };
        const width = ground.configuredWidth * Math.abs(Number(scale.x || 1));
        const height = ground.configuredHeight * Math.abs(Number(scale.y || 1));
        const bottom = Number(scale.y || 1) >= 0 ? Number(position.y) : Number(position.y) - height;
        if (width > 0 && height > 0) {
            result.push({ x: Number(position.x) - width / 2, y: bottom, width, height, layerIndex: ground.layerIndex, name: ground.name, kind: 'ground' });
        }
    }
    return result;
}

function findEditingCollider(node: any): any | null {
    const direct = node?.getComponent?.('battle.editor.EditingCollider');
    if (direct) return direct;
    const components = typeof node?.getComponents === 'function' ? node.getComponents(cc.Component) : [];
    return components.find((component: any) => classNameOf(component).endsWith('EditingCollider')) || null;
}

function findOccluderVisualNode(colliderNode: any, groundNode: any): any | null {
    if (colliderNode?.getComponent?.(cc.Sprite)) return colliderNode;
    let ancestor = colliderNode?.parent;
    while (ancestor) {
        if (ancestor.getComponent?.(cc.Sprite)) return ancestor;
        if (ancestor === groundNode) break;
        ancestor = ancestor.parent;
    }
    let result: any = null;
    colliderNode?.walk?.((node: any) => {
        if (!result && node?.getComponent?.(cc.Sprite)) result = node;
    });
    return result;
}

function collectOccluders(
    grounds: PreviewGroundState[],
    previous: PreviewOccluderState[] = [],
): PreviewOccluderState[] {
    const result: PreviewOccluderState[] = [];
    const seen = new Set<any>();
    const previousByCollider = new Map(previous.map((item) => [item.collider, item]));
    for (const ground of grounds) {
        ground.node.walk((node: any) => {
            if (seen.has(node)) return;
            const collider = findEditingCollider(node);
            const transform = node.getComponent?.(cc.UITransform);
            if (!collider || !transform) return;
            const visualNode = findOccluderVisualNode(node, ground.node);
            if (!visualNode) return;
            seen.add(node);
            const previousState = previousByCollider.get(collider);
            const opacityComponent = visualNode.getComponent?.(cc.UIOpacity);
            result.push({
                node: visualNode,
                colliderNode: node,
                transform,
                collider,
                baseOpacity: previousState?.baseOpacity ?? Number(opacityComponent?.opacity ?? 255),
                groundName: ground.name,
                layerIndex: ground.layerIndex,
            });
        });
    }
    return result;
}

function occluderAabb(occluder: PreviewOccluderState): {
    centerX: number;
    centerY: number;
    halfWidth: number;
    halfHeight: number;
} {
    const { colliderNode: node, transform, collider } = occluder;
    const world = node.worldPosition || node.position || { x: 0, y: 0 };
    const scale = node.worldScale || node.scale || { x: 1, y: 1 };
    const scaleX = Number(scale.x) || 1;
    const scaleY = Number(scale.y) || 1;
    const anchorOffsetX = (Number(transform.anchorX) - 0.5) * Number(transform.width) * scaleX;
    const anchorOffsetY = (Number(transform.anchorY) - 0.5) * Number(transform.height) * scaleY;
    const centerX = Number(world.x) + anchorOffsetX;
    const centerY = Number(world.y) + anchorOffsetY;
    const type = Number(collider.colliderType ?? collider._colliderType ?? 0);
    if (type === 1) {
        const radius = Math.abs(Number(collider.circleRadius) || 0) * Math.max(Math.abs(scaleX), Math.abs(scaleY));
        return { centerX, centerY, halfWidth: radius, halfHeight: radius };
    }
    if (type === 2 && Array.isArray(collider.polygon?._points) && collider.polygon._points.length) {
        const angle = (Number(node.angle) || 0) * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
        for (const point of collider.polygon._points) {
            const x = Number(point.x) * scaleX;
            const y = Number(point.y) * scaleY;
            const rotatedX = x * cos - y * sin;
            const rotatedY = x * sin + y * cos;
            minX = Math.min(minX, rotatedX); maxX = Math.max(maxX, rotatedX);
            minY = Math.min(minY, rotatedY); maxY = Math.max(maxY, rotatedY);
        }
        return {
            centerX: centerX + (minX + maxX) / 2,
            centerY: centerY + (minY + maxY) / 2,
            halfWidth: (maxX - minX) / 2,
            halfHeight: (maxY - minY) / 2,
        };
    }
    if (type === 3) {
        const angle = (Number(node.angle) || 0) * Math.PI / 180;
        const localX = Number(collider.sectorCenterX) * scaleX;
        const localY = Number(collider.sectorCenterY) * scaleY;
        const rotatedX = localX * Math.cos(angle) - localY * Math.sin(angle);
        const rotatedY = localX * Math.sin(angle) + localY * Math.cos(angle);
        const radius = Math.abs(Number(collider.sectorRadius) || 0) * Math.max(Math.abs(scaleX), Math.abs(scaleY));
        return { centerX: centerX + rotatedX, centerY: centerY + rotatedY, halfWidth: radius, halfHeight: radius };
    }
    if (type === 4) {
        const angle = (Number(node.angle) || 0) * Math.PI / 180;
        const transformPoint = (x: number, y: number) => ({
            x: centerX + x * scaleX * Math.cos(angle) - y * scaleY * Math.sin(angle),
            y: centerY + x * scaleX * Math.sin(angle) + y * scaleY * Math.cos(angle),
        });
        const start = transformPoint(Number(collider.segmentStartX) || 0, Number(collider.segmentStartY) || 0);
        const end = transformPoint(Number(collider.segmentEndX) || 0, Number(collider.segmentEndY) || 0);
        return {
            centerX: (start.x + end.x) / 2, centerY: (start.y + end.y) / 2,
            halfWidth: Math.max(2, Math.abs(end.x - start.x) / 2), halfHeight: Math.max(2, Math.abs(end.y - start.y) / 2),
        };
    }
    const rawHalfWidth = Math.abs((Number(collider.rectWidth) || 0) * scaleX) / 2;
    const rawHalfHeight = Math.abs((Number(collider.rectHeight) || 0) * scaleY) / 2;
    const angle = (Number(node.angle) || 0) * Math.PI / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    return {
        centerX,
        centerY,
        halfWidth: rawHalfWidth * cos + rawHalfHeight * sin,
        halfHeight: rawHalfWidth * sin + rawHalfHeight * cos,
    };
}

function rectFromAabb(aabb: { centerX: number; centerY: number; halfWidth: number; halfHeight: number }): RectLike {
    return { x: aabb.centerX - aabb.halfWidth, y: aabb.centerY - aabb.halfHeight, width: aabb.halfWidth * 2, height: aabb.halfHeight * 2 };
}

function collectFeatureRanges(session: PreviewSession): Array<RectLike & { kind: string; label: string }> {
    const ranges: Array<RectLike & { kind: string; label: string }> = [];
    for (const occluder of session.occluders) {
        ranges.push({
            ...rectFromAabb(occluderAabb(occluder)),
            kind: 'occlusion',
            label: `遮挡图虚化 · ${occluder.groundName} · ${occluder.node.name || 'Sprite'}`,
        });
    }
    for (const component of collectEditingPrefabRefs(session.root)) {
        if (!component?.enableAABB) continue;
        const position = component.node?.worldPosition || { x: 0, y: 0 };
        const scale = component.node?.worldScale || { x: 1, y: 1 };
        const width = Math.abs(Number(component.aabbWidth || 0) * Number(scale.x || 1));
        const height = Math.abs(Number(component.aabbHeight || 0) * Number(scale.y || 1));
        ranges.push({
            x: Number(position.x) + Number(component.aabbOffsetX || 0) * Number(scale.x || 1) - width / 2,
            y: Number(position.y) + Number(component.aabbOffsetY || 0) * Number(scale.y || 1) - height / 2,
            width, height, kind: 'effect', label: `特效激活 · ${component.node?.name || 'Prefab'}`,
        });
    }
    session.root.walk((node: any) => {
        const components = typeof node?.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        const entity = components.find((component: any) => classNameOf(component).endsWith('EditingEntity'));
        if (!entity || !Array.isArray(entity.colliders)) return;
        for (const named of entity.colliders) {
            const collider = named?.collider;
            const transform = collider?.node?.getComponent?.(cc.UITransform);
            if (!collider || !transform) continue;
            const type = Number(named.type);
            const kind = type === 1 ? 'opacity-barrier' : type === 2 ? 'trigger' : 'barrier';
            const typeLabel = type === 1 ? '透明障碍' : type === 2 ? '触发器' : '环境碰撞';
            ranges.push({
                ...rectFromAabb(occluderAabb({
                    node: collider.node,
                    colliderNode: collider.node,
                    transform,
                    collider,
                    baseOpacity: 255,
                    groundName: '',
                    layerIndex: 0,
                })),
                kind, label: `${typeLabel} · ${entity.entityId || node.name || named.name}`,
            });
        }
    });
    return ranges.filter((range) => range.width > 0 && range.height > 0);
}

function updateForegroundOcclusion(
    session: PreviewSession,
    input: RenderPreviewInput,
    playerX: number,
    playerY: number,
): { total: number; faded: number; maxCoverage: number; minimumOpacity: number; fadedLayers: string[] } {
    const width = Math.max(1, Number(input.colliderWidth) || 140);
    const height = Math.max(1, Number(input.colliderHeight) || 180);
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const characterX = playerX + (Number(input.colliderOffsetX) || 0);
    const characterY = playerY + (Number(input.colliderOffsetY) || 75);
    let faded = 0;
    let maxCoverage = 0;
    let minimumOpacity = 255;
    const fadedLayers = new Set<string>();
    const opacityByNode = new Map<any, { opacity: number; baseOpacity: number }>();
    for (const occluder of session.occluders) {
        const aabb = occluderAabb(occluder);
        const overlapX = Math.max(0, Math.min(characterX + halfWidth, aabb.centerX + aabb.halfWidth)
            - Math.max(characterX - halfWidth, aabb.centerX - aabb.halfWidth));
        const overlapY = Math.max(0, Math.min(characterY + halfHeight, aabb.centerY + aabb.halfHeight)
            - Math.max(characterY - halfHeight, aabb.centerY - aabb.halfHeight));
        const xRatio = overlapX / width;
        const yRatio = overlapY / height;
        const keyPoints = [
            [characterX, characterY],
            [characterX - halfWidth, characterY + halfHeight],
            [characterX + halfWidth, characterY + halfHeight],
            [characterX - halfWidth, characterY - halfHeight],
            [characterX + halfWidth, characterY - halfHeight],
        ];
        const coveredPoints = keyPoints.filter(([x, y]) => (
            Math.abs(x - aabb.centerX) <= aabb.halfWidth
            && Math.abs(y - aabb.centerY) <= aabb.halfHeight
        )).length;
        const coverage = Math.min(1, xRatio * yRatio * 0.6 + coveredPoints / 5 * 0.4);
        const enabled = input.enableForegroundOcclusion !== false;
        const opacity = enabled && coverage > 0
            ? Math.min(occluder.baseOpacity, Math.round(255 - 95 * coverage))
            : occluder.baseOpacity;
        const existing = opacityByNode.get(occluder.node);
        if (!existing || opacity < existing.opacity) {
            opacityByNode.set(occluder.node, { opacity, baseOpacity: occluder.baseOpacity });
        }
        if (enabled && coverage > 0) {
            faded += 1;
            fadedLayers.add(occluder.groundName || `层 ${occluder.layerIndex}`);
        }
        maxCoverage = Math.max(maxCoverage, coverage);
        minimumOpacity = Math.min(minimumOpacity, opacity);
    }
    for (const [node, state] of opacityByNode) {
        let opacityComponent = node.getComponent?.(cc.UIOpacity);
        if (!opacityComponent) opacityComponent = node.addComponent?.(cc.UIOpacity);
        if (opacityComponent) opacityComponent.opacity = state.opacity;
    }
    return {
        total: session.occluders.length,
        faded,
        maxCoverage,
        minimumOpacity,
        fadedLayers: [...fadedLayers],
    };
}

function applyParallax(session: PreviewSession, cameraX: number, cameraY: number): Array<{
    layerIndex: number;
    name: string;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    rateX: number;
    rateY: number;
}> {
    const states = [];
    for (const ground of session.grounds) {
        // Runtime uses one camera per layer at masterCamera * rate. This offscreen
        // preview uses one camera, so moving the layer by masterCamera * (1-rate)
        // is the exact equivalent transformation.
        const offsetX = cameraX * (1 - ground.rateX);
        const offsetY = cameraY * (1 - ground.rateY);
        ground.node.setPosition(
            ground.origin.x + offsetX,
            ground.origin.y + offsetY,
            ground.origin.z,
        );
        states.push({
            layerIndex: ground.layerIndex,
            name: ground.name,
            width: ground.configuredWidth,
            height: ground.configuredHeight,
            offsetX,
            offsetY,
            rateX: ground.rateX,
            rateY: ground.rateY,
        });
    }
    return states;
}

function initializePreviewAnimations(session: PreviewSession): void {
    session.root.walk((node: any) => {
        if (!node?.activeInHierarchy) return;
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        for (const component of components) {
            if (component?.enabled === false || session.initializedAnimations.has(component)) continue;
            const name = classNameOf(component);
            try {
                if (name.endsWith('Skeleton')) {
                    // Skeleton.updateAnimation intentionally early-outs in edit mode unless this
                    // private preview flag is enabled (Creator 3.8.6 behavior).
                    component._isPreviewInEditor = true;
                    component.paused = false;
                    const animationName = String(component.defaultAnimation || component.animation || component._animationName || '');
                    if (animationName && typeof component.setAnimation === 'function') {
                        component.setAnimation(0, animationName, component.loop !== false);
                    }
                    session.initializedAnimations.add(component);
                } else if (name.endsWith('Animation')) {
                    if (component.defaultClip || component._defaultClip) component.play?.();
                    session.initializedAnimations.add(component);
                } else if (name.endsWith('ParticleSystem2D')) {
                    component.resetSystem?.();
                    component.play?.();
                    session.initializedAnimations.add(component);
                } else if (name.endsWith('InfinityScrollImage')) {
                    session.initializedAnimations.add(component);
                }
            } catch {
                // One malformed scene effect should not block the remaining layers.
            }
        }
    });
}

function advancePreviewAnimations(session: PreviewSession, deltaTime: number): number {
    const dt = Math.max(0, Math.min(0.1, Number(deltaTime) || 0));
    if (dt <= 0) return 0;
    let advanced = 0;
    session.root.walk((node: any) => {
        if (!node?.activeInHierarchy) return;
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        for (const component of components) {
            if (component?.enabled === false) continue;
            const name = classNameOf(component);
            try {
                if (name.endsWith('Skeleton') && typeof component.updateAnimation === 'function') {
                    component._isPreviewInEditor = true;
                    component.updateAnimation(dt);
                    advanced += 1;
                } else if (name.endsWith('Animation') && typeof component._crossFade?.update === 'function') {
                    component._crossFade.update(dt);
                    advanced += 1;
                } else if (name.endsWith('ParticleSystem2D')) {
                    if (typeof component.lateUpdate === 'function') component.lateUpdate(dt);
                    else component.update?.(dt);
                    advanced += 1;
                } else if (name.endsWith('InfinityScrollImage') && typeof component.update === 'function') {
                    component.update(dt);
                    advanced += 1;
                }
            } catch {
                // A broken effect must not stop the preview.
            }
        }
    });
    return advanced;
}

function updatePrefabActivation(
    session: PreviewSession,
    cameraX: number,
    cameraY: number,
): { active: number; inactive: number; missingAabb: number } {
    const halfWidth = session.runtimeFrame.viewportWorldWidth * 0.525;
    const halfHeight = session.runtimeFrame.viewportWorldHeight * 0.525;
    let active = 0;
    let inactive = 0;
    let missingAabb = 0;
    for (const component of collectEditingPrefabRefs(session.root)) {
        const instance = component?._instance;
        if (!instance) continue;
        if (!component.enableAABB) {
            instance.active = true;
            active += 1;
            missingAabb += 1;
            continue;
        }
        const position = component.node?.worldPosition || { x: 0, y: 0 };
        const scale = component.node?.worldScale || { x: 1, y: 1 };
        const centerX = Number(position.x) + Number(component.aabbOffsetX || 0) * Number(scale.x || 1);
        const centerY = Number(position.y) + Number(component.aabbOffsetY || 0) * Number(scale.y || 1);
        const effectHalfWidth = Math.abs(Number(component.aabbWidth || 0) * Number(scale.x || 1)) / 2;
        const effectHalfHeight = Math.abs(Number(component.aabbHeight || 0) * Number(scale.y || 1)) / 2;
        const visible = Math.abs(centerX - cameraX) <= halfWidth + effectHalfWidth
            && Math.abs(centerY - cameraY) <= halfHeight + effectHalfHeight;
        instance.active = visible;
        if (visible) active += 1;
        else inactive += 1;
    }
    return { active, inactive, missingAabb };
}

async function startPreviewSession(input: StartPreviewInput): Promise<any> {
    disposeSession();
    let prefabAsset: any = null;
    let root: any = null;
    let cameraNode: any = null;
    let camera: any = null;
    let renderTexture: any = null;
    try {
        validateRendererVersion(input.rendererVersion);
        prefabAsset = await loadPrefab(String(input.uuid || ''));
        root = cc.instantiate(prefabAsset);
        const currentScene = cc.director.getScene();
        if (!currentScene) throw new Error('Cocos scene is not ready.');
        const previewLayer = selectIsolatedPreviewLayer(currentScene);
        preparePrefabForPreview(root, previewLayer);
        currentScene.addChild(root);
        root.active = true;
        activatePreviewHierarchy(root);
        root.updateWorldTransform?.();
        const nestedPrefabCount = await waitForNestedPrefabRefs(root, previewLayer);
        preparePrefabForPreview(root, previewLayer, false);
        activatePreviewHierarchy(root);
        root.updateWorldTransform?.();

        const cameraProfile = await loadRuntimeCameraProfile(String(input.runtimeCameraUuid || ''));
        if (Number(input.viewportWidth) > 0) cameraProfile.viewportWidth = Number(input.viewportWidth);
        if (Number(input.viewportHeight) > 0) cameraProfile.viewportHeight = Number(input.viewportHeight);
        if (Number(input.orthoHeight) > 0) cameraProfile.orthoHeight = Number(input.orthoHeight);
        const runtimeFrame = resolveRuntimeCameraSweep(root, collectVisualBounds(root), cameraProfile, input.boundaryStage);
        const maxEdge = 1280;
        const scale = Math.min(1, maxEdge / Math.max(cameraProfile.viewportWidth, cameraProfile.viewportHeight));
        const textureSize = {
            width: Math.max(128, Math.round(cameraProfile.viewportWidth * scale)),
            height: Math.max(128, Math.round(cameraProfile.viewportHeight * scale)),
        };
        renderTexture = new cc.RenderTexture();
        renderTexture.reset(textureSize);
        cameraNode = new cc.Node('__battle_scene_progress_preview_camera__');
        cameraNode.active = false;
        cameraNode.layer = previewLayer;
        currentScene.addChild(cameraNode);
        camera = cameraNode.addComponent(cc.Camera);
        camera.inEditorMode = true;
        camera.projection = cameraProfile.projection;
        camera.visibility = previewLayer;
        camera.clearFlags = cc.Camera.ClearFlag.SOLID_COLOR;
        camera.clearColor = new cc.Color(CLEAR_COLOR.r, CLEAR_COLOR.g, CLEAR_COLOR.b, CLEAR_COLOR.a);
        camera.orthoHeight = cameraProfile.orthoHeight;
        camera.near = cameraProfile.near;
        camera.far = cameraProfile.far;
        camera.fov = cameraProfile.fov;
        camera.fovAxis = cameraProfile.fovAxis;
        camera.targetTexture = renderTexture;
        const born = readBornPoint(root, runtimeFrame.cameraStartX, runtimeFrame.centerY);
        cameraNode.setWorldPosition(born.x, runtimeFrame.centerY, cameraProfile.positionZ);
        cameraNode.active = true;
        cameraNode.updateWorldTransform?.();
        activatePreviewCamera(camera);
        const grounds = collectGroundStates(root);
        applyConfiguredRenderOrder(root, grounds);
        activeSession = {
            prefabAsset, root, cameraNode, camera, renderTexture, previewLayer,
            textureSize, cameraProfile, runtimeFrame,
            grounds, occluders: collectOccluders(grounds), born, positions: collectPositions(root),
            initializedAnimations: new WeakSet<object>(), nestedPrefabCount,
        };
        initializePreviewAnimations(activeSession);
        await renderEditorFrames(1);
        return {
            ok: true,
            born,
            positions: activeSession.positions,
            boundaries: collectBoundaryGuides(root, new Set(runtimeFrame.activeBoundaryTypes)),
            boundaryStage: runtimeFrame.boundaryStage,
            rightBoundaryFallback: runtimeFrame.rightBoundaryFallback,
            boundaryViewportConflict: runtimeFrame.boundaryViewportConflict,
            boundaryViewportOverflow: runtimeFrame.boundaryViewportOverflow,
            boundaryFallbackMode: runtimeFrame.boundaryFallbackMode,
            cameraBounds: {
                left: runtimeFrame.cameraStartX,
                right: runtimeFrame.cameraEndX,
                centerY: runtimeFrame.centerY,
            },
            cameraProfile: {
                viewportWidth: cameraProfile.viewportWidth,
                viewportHeight: cameraProfile.viewportHeight,
                viewportWorldWidth: runtimeFrame.viewportWorldWidth,
                viewportWorldHeight: runtimeFrame.viewportWorldHeight,
                orthoHeight: cameraProfile.orthoHeight,
            },
            layers: activeSession.grounds.map((ground) => ({
                layerIndex: ground.layerIndex,
                name: ground.name,
                width: ground.configuredWidth,
                height: ground.configuredHeight,
                moveSpeedRateX: ground.rateX,
                moveSpeedRateY: ground.rateY,
            })),
            nestedPrefabCount,
            occluderCount: activeSession.occluders.length,
            rendererVersion: SCENE_PREVIEW_RENDERER_VERSION,
        };
    } catch (error) {
        destroyPreviewCamera(camera);
        cameraNode?.destroy?.();
        root?.destroy?.();
        renderTexture?.destroy?.();
        if (prefabAsset && typeof cc.assetManager.releaseAsset === 'function') cc.assetManager.releaseAsset(prefabAsset);
        return { ok: false, message: error instanceof Error ? error.message : String(error), rendererVersion: SCENE_PREVIEW_RENDERER_VERSION };
    }
}

async function renderPreviewFrame(input: RenderPreviewInput): Promise<any> {
    try {
        validateRendererVersion(input.rendererVersion);
        const session = activeSession;
        if (!session) throw new Error('Preview session is not started.');
        const requestedX = Number.isFinite(Number(input.playerX)) ? Number(input.playerX) : session.born.x;
        const requestedY = Number.isFinite(Number(input.playerY)) ? Number(input.playerY) : session.born.y;
        const requestedCameraX = Number.isFinite(Number(input.cameraX)) ? Number(input.cameraX) : requestedX;
        const requestedCameraY = Number.isFinite(Number(input.cameraY)) ? Number(input.cameraY) : session.runtimeFrame.centerY;
        const freeCamera = input.freeCamera === true;
        const cameraX = freeCamera || input.respectCameraBounds === false
            ? requestedCameraX
            : Math.min(Math.max(requestedCameraX, session.runtimeFrame.cameraStartX), session.runtimeFrame.cameraEndX);
        const cameraY = freeCamera ? requestedCameraY : session.runtimeFrame.centerY;
        const orthoHeight = Math.max(1, Number(input.orthoHeight) || session.cameraProfile.orthoHeight);
        session.camera.orthoHeight = orthoHeight;
        session.runtimeFrame.viewportWorldHeight = orthoHeight * 2;
        session.runtimeFrame.viewportWorldWidth = session.runtimeFrame.viewportWorldHeight
            * session.cameraProfile.viewportWidth / session.cameraProfile.viewportHeight;
        // AVG coordinates drive the master camera in world space. Layer parallax
        // uses the unshaken master position; runtime applies the same shake offset
        // to master and layer cameras, so shake must not be multiplied by layer rate.
        const parallaxCameraX = Number.isFinite(Number(input.parallaxCameraX))
            ? Number(input.parallaxCameraX)
            : cameraX;
        const parallaxCameraY = Number.isFinite(Number(input.parallaxCameraY))
            ? Number(input.parallaxCameraY)
            : cameraY;
        const layerStates = applyParallax(session, parallaxCameraX, parallaxCameraY);
        applyConfiguredRenderOrder(session.root, session.grounds);
        const editingScene = session.root.getComponent?.('battle.editor.EditingScene');
        const roadComponent = editingScene?.roadLayer;
        const roadLayer = roadComponent ? {
            name: String(roadComponent.node?.name || 'Road'),
            width: Number(roadComponent.width) || 0,
            height: Number(roadComponent.height) || 0,
        } : null;
        session.root.updateWorldTransform?.();
        const layerBounds = input.showLayerBounds ? configuredLayerBounds(session) : [];
        const featureRanges = input.showFeatureRanges ? collectFeatureRanges(session) : [];
        const effects = updatePrefabActivation(session, cameraX, cameraY);
        initializePreviewAnimations(session);
        const advancedAnimations = advancePreviewAnimations(session, Number(input.deltaTime) || 0);
        session.cameraNode.setWorldPosition(cameraX, cameraY, session.cameraProfile.positionZ);
        session.cameraNode.updateWorldTransform?.();
        let occlusion = { total: 0, faded: 0, maxCoverage: 0, minimumOpacity: 255, fadedLayers: [] as string[] };
        await renderPreviewFrames(session.camera, session.root, session.previewLayer, 1, () => {
            // Nested editor prefabs can finish loading after the preview session starts.
            // Refresh the collection, then apply opacity after editor components have
            // updated so their own refresh cannot overwrite the preview fade.
            session.occluders = collectOccluders(session.grounds, session.occluders);
            occlusion = updateForegroundOcclusion(session, input, requestedX, requestedY);
        });
        const pixels = session.renderTexture.readPixels();
        const expectedLength = session.textureSize.width * session.textureSize.height * 4;
        if (!pixels || pixels.length !== expectedLength) throw new Error('RenderTexture returned no RGBA pixels.');
        if (!hasSceneContentPixels(pixels)) {
            throw new Error(`Rendered frame contains only the clear color. Diagnostics: ${JSON.stringify(
                collectRenderDiagnostics(session.root, session.camera, session.runtimeFrame.bounds, session.textureSize),
            )}`);
        }
        writeRgbaPng(input.outputPath, pixels, session.textureSize.width, session.textureSize.height);
        const halfViewWidth = session.runtimeFrame.viewportWorldWidth / 2;
        const halfViewHeight = session.runtimeFrame.viewportWorldHeight / 2;
        const bounds = session.runtimeFrame.bounds;
        const exposure = {
            left: Math.max(0, bounds.x - (cameraX - halfViewWidth)),
            right: Math.max(0, cameraX + halfViewWidth - (bounds.x + bounds.width)),
            bottom: Math.max(0, bounds.y - (cameraY - halfViewHeight)),
            top: Math.max(0, cameraY + halfViewHeight - (bounds.y + bounds.height)),
        };
        return {
            ok: true,
            width: session.textureSize.width,
            height: session.textureSize.height,
            player: { x: requestedX, y: requestedY },
            camera: { x: cameraX, y: cameraY },
            cameraProfile: {
                viewportWorldWidth: session.runtimeFrame.viewportWorldWidth,
                viewportWorldHeight: session.runtimeFrame.viewportWorldHeight,
                orthoHeight,
            },
            cameraLimited: Math.abs(requestedCameraX - cameraX) > 0.001,
            exposure: { ...exposure, visible: Object.values(exposure).some((value) => value > 1) },
            effects,
            occlusion,
            advancedAnimations,
            layers: layerStates,
            roadLayer,
            layerBounds,
            featureRanges,
            collider: {
                width: Number(input.colliderWidth) || 140,
                height: Number(input.colliderHeight) || 180,
                offsetX: Number(input.colliderOffsetX) || 0,
                offsetY: Number(input.colliderOffsetY) || 75,
            },
            rendererVersion: SCENE_PREVIEW_RENDERER_VERSION,
        };
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error), rendererVersion: SCENE_PREVIEW_RENDERER_VERSION };
    }
}

function stopPreviewSession(): { ok: true } {
    disposeSession();
    return { ok: true };
}

export function load(): void {
    console.log('[table_data_visualizer][scene] loaded');
}

export function unload(): void {
    disposeSession();
    console.log('[battle-scene-preview][scene] unloaded');
}

export const methods = {
    startPreviewSession,
    renderPreviewFrame,
    stopPreviewSession,
};
