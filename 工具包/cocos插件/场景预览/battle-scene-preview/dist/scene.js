"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = exports.unload = exports.load = void 0;
const fs = __importStar(require("fs"));
const zlib = __importStar(require("zlib"));
const cc = require('cc');
const MAX_USER_LAYER_BIT = 19;
const MIN_TEXTURE_EDGE = 128;
const DEFAULT_TEXTURE_EDGE = 1536;
const CLEAR_COLOR = { r: 17, g: 23, b: 31, a: 255 };
const FALLBACK_RUNTIME_CAMERA_WIDTH = 700;
const FALLBACK_RUNTIME_CAMERA_HEIGHT = 1525;
const FALLBACK_RUNTIME_CAMERA_ORTHO_HEIGHT = 762.5;
const BORN_POINT_TYPE = 1;
const BOUNDARY_STAGES = ['1st', '2nd', '3rd', '4th', 'loop'];
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
function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
    return Buffer.concat([length, typeBuffer, data, checksum]);
}
function writeRgbaPng(outputPath, pixels, width, height) {
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
function loadPrefab(uuid) {
    return new Promise((resolve, reject) => {
        cc.assetManager.loadAny({ uuid }, (error, prefab) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(prefab);
        });
    });
}
function findFirstComponent(root, componentType) {
    var _a, _b;
    let result = ((_a = root === null || root === void 0 ? void 0 : root.getComponent) === null || _a === void 0 ? void 0 : _a.call(root, componentType)) || null;
    (_b = root === null || root === void 0 ? void 0 : root.walk) === null || _b === void 0 ? void 0 : _b.call(root, (node) => {
        var _a;
        if (!result) {
            result = ((_a = node === null || node === void 0 ? void 0 : node.getComponent) === null || _a === void 0 ? void 0 : _a.call(node, componentType)) || null;
        }
    });
    return result;
}
async function loadRuntimeCameraProfile(uuid) {
    var _a, _b, _c, _d, _e, _f, _g;
    let prefabAsset = null;
    let runtimeRoot = null;
    try {
        if (!uuid) {
            throw new Error('BattleRoadView prefab UUID is missing.');
        }
        prefabAsset = await loadPrefab(uuid);
        runtimeRoot = cc.instantiate(prefabAsset);
        const camera = findFirstComponent(runtimeRoot, cc.Camera);
        const transform = (_b = (_a = camera === null || camera === void 0 ? void 0 : camera.node) === null || _a === void 0 ? void 0 : _a.getComponent) === null || _b === void 0 ? void 0 : _b.call(_a, cc.UITransform);
        const viewportWidth = Number((_c = transform === null || transform === void 0 ? void 0 : transform.contentSize) === null || _c === void 0 ? void 0 : _c.width);
        const viewportHeight = Number((_d = transform === null || transform === void 0 ? void 0 : transform.contentSize) === null || _d === void 0 ? void 0 : _d.height);
        const orthoHeight = Number(camera === null || camera === void 0 ? void 0 : camera.orthoHeight);
        if (!camera
            || !(viewportWidth > 0)
            || !(viewportHeight > 0)
            || !(orthoHeight > 0)) {
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
            positionZ: Number((_f = (_e = camera.node) === null || _e === void 0 ? void 0 : _e.worldPosition) === null || _f === void 0 ? void 0 : _f.z) || 1000,
            source: 'BattleRoadView.prefab',
        };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[table_data_visualizer][scene] runtime camera profile fallback: ${message}`);
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
            clearColor: Object.assign({}, CLEAR_COLOR),
            positionZ: 1000,
            source: 'fallback-runtime-camera',
        };
    }
    finally {
        (_g = runtimeRoot === null || runtimeRoot === void 0 ? void 0 : runtimeRoot.destroy) === null || _g === void 0 ? void 0 : _g.call(runtimeRoot);
        if (prefabAsset && typeof cc.assetManager.releaseAsset === 'function') {
            cc.assetManager.releaseAsset(prefabAsset);
        }
    }
}
function waitForDraw() {
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
function requestEditorRepaint() {
    var _a;
    const editorEngine = (_a = globalThis.cce) === null || _a === void 0 ? void 0 : _a.Engine;
    if (typeof (editorEngine === null || editorEngine === void 0 ? void 0 : editorEngine.repaintInEditMode) === 'function') {
        editorEngine.repaintInEditMode();
    }
}
function waitForNextTask() {
    return new Promise((resolve) => setTimeout(resolve, 16));
}
async function renderEditorFrames(count) {
    for (let frame = 0; frame < count; frame += 1) {
        // Subscribe before requesting the repaint so a fast editor frame cannot be missed.
        const afterDraw = waitForDraw();
        requestEditorRepaint();
        await afterDraw;
        await waitForNextTask();
    }
}
async function renderPreviewFrames(camera, previewRoot, previewLayer, count, beforeSubmit) {
    var _a, _b, _c, _d, _e;
    for (let frame = 0; frame < count; frame += 1) {
        drivePreviewEditorComponents(previewRoot, previewLayer);
        activatePreviewHierarchy(previewRoot);
        (_a = previewRoot.updateWorldTransform) === null || _a === void 0 ? void 0 : _a.call(previewRoot);
        beforeSubmit === null || beforeSubmit === void 0 ? void 0 : beforeSubmit();
        (_c = (_b = cc.director).emit) === null || _c === void 0 ? void 0 : _c.call(_b, cc.Director.EVENT_BEFORE_DRAW);
        refreshPreviewRenderData(previewRoot);
        // The edit-mode director stays invalid while the scene is not playing, so tick()
        // exits before running editor component updates. Root.frameMove() also rebuilds
        // cameraList from registered render windows, and a camera component created in
        // edit mode is not always discovered there. Submit it between Root's process and
        // end phases so Creator still owns device acquire, batching, rendering and present.
        camera.__tableDataVisualizerSubmitMode = submitPreviewCameraFrame(camera);
        (_e = (_d = cc.director).emit) === null || _e === void 0 ? void 0 : _e.call(_d, cc.Director.EVENT_AFTER_DRAW);
        await waitForNextTask();
    }
}
function bindPreviewCameraTarget(camera) {
    var _a, _b, _c, _d;
    const nativeCamera = camera === null || camera === void 0 ? void 0 : camera.camera;
    const targetWindow = (_a = camera === null || camera === void 0 ? void 0 : camera.targetTexture) === null || _a === void 0 ? void 0 : _a.window;
    if (!nativeCamera) {
        throw new Error('Creator did not create the native preview camera.');
    }
    if (!targetWindow) {
        throw new Error('Creator did not create the preview RenderTexture window.');
    }
    if (nativeCamera.window !== targetWindow) {
        (_b = nativeCamera.changeTargetWindow) === null || _b === void 0 ? void 0 : _b.call(nativeCamera, targetWindow);
    }
    const targetCameras = Array.isArray(targetWindow.cameras)
        ? targetWindow.cameras
        : targetWindow._cameras;
    if (Array.isArray(targetCameras) && !targetCameras.includes(nativeCamera)) {
        (_c = targetWindow.attachCamera) === null || _c === void 0 ? void 0 : _c.call(targetWindow, nativeCamera);
    }
    nativeCamera.enabled = true;
    (_d = nativeCamera.update) === null || _d === void 0 ? void 0 : _d.call(nativeCamera, true);
}
function submitPreviewCameraFrame(camera) {
    var _a, _b, _c, _d, _e;
    const root = (_a = cc.director) === null || _a === void 0 ? void 0 : _a.root;
    const nativeCamera = camera === null || camera === void 0 ? void 0 : camera.camera;
    if (!root || !nativeCamera) {
        throw new Error('Creator Root or preview camera is unavailable.');
    }
    bindPreviewCameraTarget(camera);
    if (typeof root._frameMoveBegin === 'function'
        && typeof root._frameMoveProcess === 'function'
        && typeof root._frameMoveEnd === 'function') {
        root._frameMoveBegin();
        root._frameMoveProcess();
        let frameEndAttempted = false;
        try {
            const cameraList = Array.isArray(root._cameraList) ? root._cameraList : root.cameraList;
            if (!Array.isArray(cameraList)) {
                throw new Error('Creator Root camera list is unavailable.');
            }
            if (!cameraList.includes(nativeCamera)) {
                (_b = nativeCamera.update) === null || _b === void 0 ? void 0 : _b.call(nativeCamera, true);
                (_e = (_d = (_c = camera === null || camera === void 0 ? void 0 : camera.targetTexture) === null || _c === void 0 ? void 0 : _c.window) === null || _d === void 0 ? void 0 : _d.extractRenderCameras) === null || _e === void 0 ? void 0 : _e.call(_d, cameraList);
            }
            if (!cameraList.includes(nativeCamera)) {
                throw new Error('Preview RenderWindow did not extract its camera into Creator Root.');
            }
            frameEndAttempted = true;
            root._frameMoveEnd();
            return 'root-window-camera-extraction';
        }
        finally {
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
function activatePreviewCamera(camera) {
    var _a, _b;
    if (!(camera === null || camera === void 0 ? void 0 : camera.camera)) {
        if (typeof (camera === null || camera === void 0 ? void 0 : camera._createCamera) === 'function') {
            camera._createCamera();
        }
        else {
            (_a = camera === null || camera === void 0 ? void 0 : camera.onLoad) === null || _a === void 0 ? void 0 : _a.call(camera);
        }
    }
    const nativeCamera = camera === null || camera === void 0 ? void 0 : camera.camera;
    if (!nativeCamera) {
        throw new Error('Creator did not create the native preview camera.');
    }
    // The editor render pipeline selects its camera settings from cameraUsage.
    // A dynamically created camera otherwise remains EDITOR usage and can submit
    // an empty offscreen pass even though its RenderWindow and scene are valid.
    nativeCamera.cameraUsage = PREVIEW_CAMERA_USAGE;
    if (!nativeCamera.scene) {
        if (typeof (camera === null || camera === void 0 ? void 0 : camera._attachToScene) === 'function') {
            camera._attachToScene();
        }
        else {
            (_b = camera === null || camera === void 0 ? void 0 : camera.onEnable) === null || _b === void 0 ? void 0 : _b.call(camera);
        }
    }
    if (!nativeCamera.scene) {
        throw new Error('Creator did not attach the preview camera to the RenderScene.');
    }
    nativeCamera.enabled = true;
    bindPreviewCameraTarget(camera);
}
function destroyPreviewCamera(camera) {
    var _a, _b;
    if (!camera) {
        return;
    }
    try {
        camera.targetTexture = null;
    }
    catch (_c) {
        // Continue releasing the native camera even if its render target is invalid.
    }
    try {
        (_a = camera._detachFromScene) === null || _a === void 0 ? void 0 : _a.call(camera);
    }
    catch (_d) {
        // The RenderScene may already have detached the camera during editor reload.
    }
    const nativeCamera = camera.camera;
    if (nativeCamera) {
        try {
            (_b = nativeCamera.destroy) === null || _b === void 0 ? void 0 : _b.call(nativeCamera);
        }
        finally {
            // Prevent the component's deferred onDestroy from destroying it twice.
            camera._camera = null;
        }
    }
}
function isSceneContentPixel(pixels, offset) {
    const alpha = pixels[offset + 3];
    return alpha !== 0
        && (Math.abs(pixels[offset] - CLEAR_COLOR.r) > 2
            || Math.abs(pixels[offset + 1] - CLEAR_COLOR.g) > 2
            || Math.abs(pixels[offset + 2] - CLEAR_COLOR.b) > 2
            || alpha !== CLEAR_COLOR.a);
}
function hasSceneContentPixels(pixels) {
    for (let offset = 0; offset < pixels.length; offset += 4) {
        if (isSceneContentPixel(pixels, offset)) {
            return true;
        }
    }
    return false;
}
function classNameOf(component) {
    var _a, _b, _c;
    try {
        return String(((_a = cc.js) === null || _a === void 0 ? void 0 : _a.getClassName(component)) || ((_b = component === null || component === void 0 ? void 0 : component.constructor) === null || _b === void 0 ? void 0 : _b.name) || '');
    }
    catch (_d) {
        return String(((_c = component === null || component === void 0 ? void 0 : component.constructor) === null || _c === void 0 ? void 0 : _c.name) || '');
    }
}
function isSafeRenderComponent(component) {
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
function selectIsolatedPreviewLayer(scene) {
    var _a;
    let usedLayers = 0;
    (_a = scene === null || scene === void 0 ? void 0 : scene.walk) === null || _a === void 0 ? void 0 : _a.call(scene, (node) => {
        usedLayers = (usedLayers | (Number(node === null || node === void 0 ? void 0 : node.layer) || 0)) >>> 0;
    });
    for (let bit = MAX_USER_LAYER_BIT; bit >= 0; bit -= 1) {
        const candidate = (1 << bit) >>> 0;
        if ((usedLayers & candidate) === 0) {
            return candidate;
        }
    }
    throw new Error('No unused Creator user layer is available for the isolated scene preview.');
}
function preparePrefabForPreview(root, previewLayer, deactivateRoot = true) {
    var _a;
    if (deactivateRoot) {
        root.active = false;
    }
    root.__tableDataVisualizerPreviewLayer = previewLayer;
    root.walk((node) => {
        node.layer = previewLayer;
        if (/^boundary-\d+$/.test(String(node.name || '')))
            node.active = false;
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        components.forEach((component) => {
            if (typeof component.enabled === 'boolean' && !isSafeRenderComponent(component)) {
                component.enabled = false;
            }
        });
    });
    if (!((_a = root.getComponent) === null || _a === void 0 ? void 0 : _a.call(root, cc.RenderRoot2D))) {
        root.addComponent(cc.RenderRoot2D);
    }
    return previewLayer;
}
function activatePreviewHierarchy(root) {
    var _a, _b, _c, _d;
    const nodeActivator = (_a = cc.director) === null || _a === void 0 ? void 0 : _a._nodeActivator;
    const batcher = (_c = (_b = cc.director) === null || _b === void 0 ? void 0 : _b.root) === null || _c === void 0 ? void 0 : _c.batcher2D;
    let activatedComponents = 0;
    let registeredRenderRoots = 0;
    (_d = root === null || root === void 0 ? void 0 : root.walk) === null || _d === void 0 ? void 0 : _d.call(root, (node) => {
        if (!(node === null || node === void 0 ? void 0 : node.activeInHierarchy)) {
            return;
        }
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        components.forEach((component) => {
            if ((component === null || component === void 0 ? void 0 : component.enabled) === false
                || !isSafeRenderComponent(component)) {
                return;
            }
            if (typeof (nodeActivator === null || nodeActivator === void 0 ? void 0 : nodeActivator.activateComp) === 'function') {
                nodeActivator.activateComp(component);
                activatedComponents += 1;
            }
            if (!classNameOf(component).endsWith('RenderRoot2D')) {
                return;
            }
            const screens = Array.isArray(batcher === null || batcher === void 0 ? void 0 : batcher._screens) ? batcher._screens : batcher === null || batcher === void 0 ? void 0 : batcher.screens;
            if (Array.isArray(screens)
                && !screens.includes(component)
                && typeof (batcher === null || batcher === void 0 ? void 0 : batcher.addScreen) === 'function') {
                batcher.addScreen(component);
                registeredRenderRoots += 1;
            }
        });
    });
    return { activatedComponents, registeredRenderRoots };
}
function collectRenderDiagnostics(root, camera, bounds, textureSize) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12, _13, _14, _15, _16, _17;
    const diagnostics = {
        activeNodes: 0,
        enabledRenderComponents: 0,
        sprites: 0,
        spritesWithFrame: 0,
        skeletons: 0,
        renderRoots: 0,
        layers: [],
        bounds,
        textureSize,
        cameraVisibility: Number(camera === null || camera === void 0 ? void 0 : camera.visibility) >>> 0,
        cameraEnabled: Boolean((_a = camera === null || camera === void 0 ? void 0 : camera.enabledInHierarchy) !== null && _a !== void 0 ? _a : camera === null || camera === void 0 ? void 0 : camera.enabled),
        cameraTargetSize: {
            width: Number((_b = camera === null || camera === void 0 ? void 0 : camera.targetTexture) === null || _b === void 0 ? void 0 : _b.width) || 0,
            height: Number((_c = camera === null || camera === void 0 ? void 0 : camera.targetTexture) === null || _c === void 0 ? void 0 : _c.height) || 0,
        },
        rootCameraCount: Number((_f = (_e = (_d = cc.director) === null || _d === void 0 ? void 0 : _d.root) === null || _e === void 0 ? void 0 : _e.cameraList) === null || _f === void 0 ? void 0 : _f.length) || 0,
        targetCameraRegistered: Boolean((camera === null || camera === void 0 ? void 0 : camera.camera)
            && ((_k = (_j = (_h = (_g = cc.director) === null || _g === void 0 ? void 0 : _g.root) === null || _h === void 0 ? void 0 : _h.cameraList) === null || _j === void 0 ? void 0 : _j.includes) === null || _k === void 0 ? void 0 : _k.call(_j, camera.camera))),
        targetWindowRegistered: Boolean(((_l = camera === null || camera === void 0 ? void 0 : camera.targetTexture) === null || _l === void 0 ? void 0 : _l.window)
            && (((_q = (_p = (_o = (_m = cc.director) === null || _m === void 0 ? void 0 : _m.root) === null || _o === void 0 ? void 0 : _o._windows) === null || _p === void 0 ? void 0 : _p.includes) === null || _q === void 0 ? void 0 : _q.call(_p, camera.targetTexture.window))
                || ((_u = (_t = (_s = (_r = cc.director) === null || _r === void 0 ? void 0 : _r.root) === null || _s === void 0 ? void 0 : _s.windows) === null || _t === void 0 ? void 0 : _t.includes) === null || _u === void 0 ? void 0 : _u.call(_t, camera.targetTexture.window)))),
        targetWindowCameraCount: Number((_2 = (_y = (_x = (_w = (_v = camera === null || camera === void 0 ? void 0 : camera.targetTexture) === null || _v === void 0 ? void 0 : _v.window) === null || _w === void 0 ? void 0 : _w.cameras) === null || _x === void 0 ? void 0 : _x.length) !== null && _y !== void 0 ? _y : (_1 = (_0 = (_z = camera === null || camera === void 0 ? void 0 : camera.targetTexture) === null || _z === void 0 ? void 0 : _z.window) === null || _0 === void 0 ? void 0 : _0._cameras) === null || _1 === void 0 ? void 0 : _1.length) !== null && _2 !== void 0 ? _2 : 0),
        nativeCameraTargetsTexture: Boolean(((_3 = camera === null || camera === void 0 ? void 0 : camera.camera) === null || _3 === void 0 ? void 0 : _3.window)
            && camera.camera.window === ((_4 = camera === null || camera === void 0 ? void 0 : camera.targetTexture) === null || _4 === void 0 ? void 0 : _4.window)),
        nativeCameraUsage: Number((_5 = camera === null || camera === void 0 ? void 0 : camera.camera) === null || _5 === void 0 ? void 0 : _5.cameraUsage),
        cameraInEditorMode: Boolean(camera === null || camera === void 0 ? void 0 : camera.inEditorMode),
        renderSubmissionMode: String((camera === null || camera === void 0 ? void 0 : camera.__tableDataVisualizerSubmitMode) || ''),
        previewLayer: Number(root === null || root === void 0 ? void 0 : root.__tableDataVisualizerPreviewLayer) >>> 0,
        batcherScreenCount: Number((_15 = (_10 = (_9 = (_8 = (_7 = (_6 = cc.director) === null || _6 === void 0 ? void 0 : _6.root) === null || _7 === void 0 ? void 0 : _7.batcher2D) === null || _8 === void 0 ? void 0 : _8._screens) === null || _9 === void 0 ? void 0 : _9.length) !== null && _10 !== void 0 ? _10 : (_14 = (_13 = (_12 = (_11 = cc.director) === null || _11 === void 0 ? void 0 : _11.root) === null || _12 === void 0 ? void 0 : _12.batcher2D) === null || _13 === void 0 ? void 0 : _13.screens) === null || _14 === void 0 ? void 0 : _14.length) !== null && _15 !== void 0 ? _15 : 0),
        registeredPreviewRenderRoots: 0,
        directorInvalid: Boolean((_16 = cc.director) === null || _16 === void 0 ? void 0 : _16._invalid),
        directorPaused: Boolean((_17 = cc.director) === null || _17 === void 0 ? void 0 : _17._paused),
        editorComponents: null,
        refreshedRenderers: 0,
        rendererVersion: SCENE_PREVIEW_RENDERER_VERSION,
    };
    const layers = new Set();
    root.walk((node) => {
        if (!(node === null || node === void 0 ? void 0 : node.activeInHierarchy)) {
            return;
        }
        diagnostics.activeNodes += 1;
        const layer = Number(node.layer) >>> 0;
        if (layer) {
            layers.add(layer);
        }
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        components.forEach((component) => {
            var _a, _b, _c, _d, _e, _f, _g;
            if ((component === null || component === void 0 ? void 0 : component.enabledInHierarchy) === false || (component === null || component === void 0 ? void 0 : component.enabled) === false) {
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
                const screens = (_d = (_c = (_b = (_a = cc.director) === null || _a === void 0 ? void 0 : _a.root) === null || _b === void 0 ? void 0 : _b.batcher2D) === null || _c === void 0 ? void 0 : _c._screens) !== null && _d !== void 0 ? _d : (_g = (_f = (_e = cc.director) === null || _e === void 0 ? void 0 : _e.root) === null || _f === void 0 ? void 0 : _f.batcher2D) === null || _g === void 0 ? void 0 : _g.screens;
                if (Array.isArray(screens) && screens.includes(component)) {
                    diagnostics.registeredPreviewRenderRoots += 1;
                }
            }
            if (name.endsWith('Sprite')
                || name.endsWith('Label')
                || name.endsWith('RichText')
                || name.endsWith('Graphics')
                || name.endsWith('Skeleton')
                || name.endsWith('ParticleSystem2D')) {
                diagnostics.enabledRenderComponents += 1;
            }
        });
    });
    diagnostics.layers = [...layers].sort((left, right) => left - right);
    diagnostics.editorComponents = drivePreviewEditorComponents(root, Number(root === null || root === void 0 ? void 0 : root.__tableDataVisualizerPreviewLayer) >>> 0);
    diagnostics.refreshedRenderers = refreshPreviewRenderData(root);
    return diagnostics;
}
function collectEditingPrefabRefs(root) {
    const refs = [];
    root.walk((node) => {
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        components.forEach((component) => {
            if (classNameOf(component).endsWith('EditingPrefabRef')) {
                refs.push(component);
            }
        });
    });
    return refs;
}
function drivePreviewEditorComponents(root, previewLayer) {
    let editingPrefabRefs = 0;
    let instantiatedPrefabRefs = 0;
    let loadingPrefabRefs = 0;
    // A newly instantiated nested prefab can contain more EditingPrefabRef components.
    // Repeat a few passes so the complete hierarchy is discovered without ticking the
    // editor's unrelated scene components.
    for (let pass = 0; pass < 8; pass += 1) {
        const refs = collectEditingPrefabRefs(root);
        const countBefore = refs.length;
        refs.forEach((component) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            editingPrefabRefs += 1;
            const prefabRef = component === null || component === void 0 ? void 0 : component.prefabRef;
            const uuid = String((prefabRef === null || prefabRef === void 0 ? void 0 : prefabRef._assetUUID) || '').trim();
            if (uuid && !(prefabRef === null || prefabRef === void 0 ? void 0 : prefabRef._assetInstance$$) && !(prefabRef === null || prefabRef === void 0 ? void 0 : prefabRef._loading$$)) {
                (_a = prefabRef === null || prefabRef === void 0 ? void 0 : prefabRef.loadInEditor$$) === null || _a === void 0 ? void 0 : _a.call(prefabRef);
            }
            // The source component can persist showAABB=true. In editor mode that
            // draws a green Graphics rectangle into the preview image itself.
            // Debug ranges are rendered by the panel, so suppress it on the clone.
            if ('showAABB' in component)
                component.showAABB = false;
            (_b = component === null || component === void 0 ? void 0 : component.update) === null || _b === void 0 ? void 0 : _b.call(component, 0);
            (_d = (_c = component === null || component === void 0 ? void 0 : component._graphics) === null || _c === void 0 ? void 0 : _c.clear) === null || _d === void 0 ? void 0 : _d.call(_c);
            (_h = (_g = (_f = (_e = component === null || component === void 0 ? void 0 : component.node) === null || _e === void 0 ? void 0 : _e.getComponent) === null || _f === void 0 ? void 0 : _f.call(_e, cc.Graphics)) === null || _g === void 0 ? void 0 : _g.clear) === null || _h === void 0 ? void 0 : _h.call(_g);
            if (component === null || component === void 0 ? void 0 : component._instance) {
                instantiatedPrefabRefs += 1;
                preparePrefabForPreview(component._instance, previewLayer, false);
                activatePreviewHierarchy(component._instance);
                (_k = (_j = component._instance).updateWorldTransform) === null || _k === void 0 ? void 0 : _k.call(_j);
            }
            else if (uuid) {
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
function refreshPreviewRenderData(root) {
    let refreshed = 0;
    root.walk((node) => {
        var _a;
        if (!(node === null || node === void 0 ? void 0 : node.activeInHierarchy)) {
            return;
        }
        (_a = node.updateWorldTransform) === null || _a === void 0 ? void 0 : _a.call(node);
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        components.forEach((component) => {
            if ((component === null || component === void 0 ? void 0 : component.enabledInHierarchy) === false || (component === null || component === void 0 ? void 0 : component.enabled) === false) {
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
async function waitForNestedPrefabRefs(root, previewLayer) {
    const startedAt = Date.now();
    let expectedCount = 0;
    while (Date.now() - startedAt < NESTED_PREFAB_LOAD_TIMEOUT_MS) {
        drivePreviewEditorComponents(root, previewLayer);
        await renderEditorFrames(1);
        drivePreviewEditorComponents(root, previewLayer);
        const refs = collectEditingPrefabRefs(root);
        expectedCount = Math.max(expectedCount, refs.length);
        const pending = refs.filter((component) => {
            var _a;
            const uuid = String(((_a = component === null || component === void 0 ? void 0 : component.prefabRef) === null || _a === void 0 ? void 0 : _a._assetUUID) || '').trim();
            return uuid && !(component === null || component === void 0 ? void 0 : component._instance);
        });
        if (!pending.length) {
            return expectedCount;
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const unresolved = collectEditingPrefabRefs(root)
        .filter((component) => { var _a; return String(((_a = component === null || component === void 0 ? void 0 : component.prefabRef) === null || _a === void 0 ? void 0 : _a._assetUUID) || '').trim() && !(component === null || component === void 0 ? void 0 : component._instance); })
        .length;
    throw new Error(`Timed out while loading ${unresolved}/${expectedCount} nested scene prefabs.`);
}
function shouldMeasureNode(node) {
    if (!(node === null || node === void 0 ? void 0 : node.activeInHierarchy)) {
        return false;
    }
    const lowerName = String(node.name || '').toLowerCase();
    if (lowerName.includes('boundary')
        || lowerName.includes('collider')
        || lowerName.includes('position')
        || lowerName.includes('viewport')
        || lowerName.includes('helper')) {
        return false;
    }
    const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
    return components.some(isSafeRenderComponent);
}
function unionRect(current, next) {
    if (!current) {
        return Object.assign({}, next);
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
function rectFromEditingScene(root) {
    var _a, _b;
    const editingScene = (_a = root.getComponent) === null || _a === void 0 ? void 0 : _a.call(root, 'battle.editor.EditingScene');
    const roadLayer = editingScene === null || editingScene === void 0 ? void 0 : editingScene.roadLayer;
    const width = Number(roadLayer === null || roadLayer === void 0 ? void 0 : roadLayer.width) || 0;
    const height = Number(roadLayer === null || roadLayer === void 0 ? void 0 : roadLayer.height) || 0;
    if (width <= 0 || height <= 0) {
        return null;
    }
    const position = ((_b = roadLayer === null || roadLayer === void 0 ? void 0 : roadLayer.node) === null || _b === void 0 ? void 0 : _b.worldPosition) || root.worldPosition || { x: 0, y: 0 };
    return {
        x: Number(position.x) - width / 2,
        y: Number(position.y) - height / 2,
        width,
        height,
    };
}
function collectVisualBounds(root) {
    let bounds = rectFromEditingScene(root);
    root.walk((node) => {
        var _a;
        if (!shouldMeasureNode(node)) {
            return;
        }
        const transform = (_a = node.getComponent) === null || _a === void 0 ? void 0 : _a.call(node, cc.UITransform);
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
function calculateRuntimeTextureSize(maxTextureSize, cameraProfile) {
    const maxEdge = Math.max(256, Math.min(2048, Math.floor(maxTextureSize || DEFAULT_TEXTURE_EDGE)));
    const scale = Math.min(1, maxEdge / cameraProfile.viewportHeight);
    return {
        width: Math.max(MIN_TEXTURE_EDGE, Math.round(cameraProfile.viewportWidth * scale)),
        height: Math.max(MIN_TEXTURE_EDGE, Math.round(cameraProfile.viewportHeight * scale)),
    };
}
function findNodeByName(root, name) {
    let result = null;
    root.walk((node) => {
        if (!result && String((node === null || node === void 0 ? void 0 : node.name) || '') === name) {
            result = node;
        }
    });
    return result;
}
function clampCameraAxis(value, lower, upper, halfExtent) {
    const effectiveLower = lower + halfExtent;
    const effectiveUpper = upper - halfExtent;
    if (effectiveLower > effectiveUpper) {
        return Math.min(Math.max(value, lower), upper);
    }
    return Math.min(Math.max(value, effectiveLower), effectiveUpper);
}
function resolveRuntimeCameraSweep(root, visualBounds, cameraProfile, requestedStage = '1st') {
    var _a, _b, _c, _d, _e, _f;
    const editingScene = (_a = root.getComponent) === null || _a === void 0 ? void 0 : _a.call(root, 'battle.editor.EditingScene');
    const rootPosition = ((_b = editingScene === null || editingScene === void 0 ? void 0 : editingScene.node) === null || _b === void 0 ? void 0 : _b.worldPosition) || root.worldPosition || { x: 0, y: 0 };
    const bornPoint = Array.isArray(editingScene === null || editingScene === void 0 ? void 0 : editingScene.positions)
        ? editingScene.positions.find((item) => Number(item === null || item === void 0 ? void 0 : item.positionType) === BORN_POINT_TYPE)
        : null;
    const bornPosition = (_d = (_c = bornPoint === null || bornPoint === void 0 ? void 0 : bornPoint.collider) === null || _c === void 0 ? void 0 : _c.node) === null || _d === void 0 ? void 0 : _d.worldPosition;
    const previewCameraNode = findNodeByName(root, 'PreviewCamera');
    const previewCameraPosition = previewCameraNode === null || previewCameraNode === void 0 ? void 0 : previewCameraNode.worldPosition;
    const viewportWorldHeight = cameraProfile.orthoHeight * 2;
    const viewportWorldWidth = viewportWorldHeight
        * cameraProfile.viewportWidth
        / cameraProfile.viewportHeight;
    let centerY = 0;
    let source = 'born-point';
    if (!Number.isFinite(Number(bornPosition === null || bornPosition === void 0 ? void 0 : bornPosition.x))) {
        centerY = Number(previewCameraPosition === null || previewCameraPosition === void 0 ? void 0 : previewCameraPosition.y);
        source = 'preview-camera';
    }
    if (!Number.isFinite(Number(bornPosition === null || bornPosition === void 0 ? void 0 : bornPosition.x)) && !Number.isFinite(Number(previewCameraPosition === null || previewCameraPosition === void 0 ? void 0 : previewCameraPosition.x))) {
        centerY = Number(rootPosition.y) || 0;
        source = 'visual-center';
    }
    const roadBounds = rectFromEditingScene(root);
    const boundaries = Array.isArray(editingScene === null || editingScene === void 0 ? void 0 : editingScene.boundaries) ? editingScene.boundaries : [];
    const boundaryStage = BOUNDARY_STAGES.includes(requestedStage) ? requestedStage : '1st';
    const stageIndex = BOUNDARY_STAGES.indexOf(boundaryStage);
    const requestedCameraLeftType = CAMERA_BOUNDARY_LEFT_FIRST + stageIndex;
    const requestedCameraRightType = CAMERA_BOUNDARY_RIGHT_FIRST + stageIndex;
    const firstCameraLeftBoundary = boundaries.find((item) => Number(item === null || item === void 0 ? void 0 : item.type) === CAMERA_BOUNDARY_LEFT_FIRST);
    const cameraLeftBoundary = boundaries.find((item) => Number(item === null || item === void 0 ? void 0 : item.type) === requestedCameraLeftType) || firstCameraLeftBoundary;
    const cameraRightCandidates = boundaries.filter((item) => (Number(item === null || item === void 0 ? void 0 : item.type) >= CAMERA_BOUNDARY_RIGHT_FIRST
        && Number(item === null || item === void 0 ? void 0 : item.type) < CAMERA_BOUNDARY_RIGHT_FIRST + BOUNDARY_STAGES.length
        && Number.isFinite(Number(item === null || item === void 0 ? void 0 : item.limitX))));
    const exactCameraRightBoundary = cameraRightCandidates.find((item) => Number(item === null || item === void 0 ? void 0 : item.type) === requestedCameraRightType);
    const firstCameraRightBoundary = cameraRightCandidates.find((item) => Number(item === null || item === void 0 ? void 0 : item.type) === CAMERA_BOUNDARY_RIGHT_FIRST);
    const rightmostCameraBoundary = cameraRightCandidates.reduce((rightmost, item) => (!rightmost || Number(item.limitX) > Number(rightmost.limitX) ? item : rightmost), null);
    const previousCameraRightBoundary = cameraRightCandidates
        .filter((item) => Number(item.type) <= requestedCameraRightType)
        .reduce((previous, item) => !previous || Number(item.type) > Number(previous.type) ? item : previous, null);
    const cameraRightBoundary = exactCameraRightBoundary
        || (boundaryStage === 'loop' ? rightmostCameraBoundary : previousCameraRightBoundary || firstCameraRightBoundary);
    const rightBoundaryFallback = exactCameraRightBoundary
        ? ''
        : cameraRightBoundary ? BOUNDARY_TYPE_NAMES[Number(cameraRightBoundary.type)] || '' : '';
    const fallbackCameraStartX = (_e = roadBounds === null || roadBounds === void 0 ? void 0 : roadBounds.x) !== null && _e !== void 0 ? _e : visualBounds.x;
    const fallbackCameraEndX = roadBounds
        ? roadBounds.x + roadBounds.width
        : visualBounds.x + visualBounds.width;
    const configuredCameraStartX = Number.isFinite(Number(cameraLeftBoundary === null || cameraLeftBoundary === void 0 ? void 0 : cameraLeftBoundary.limitX))
        ? Number(rootPosition.x) + Number(cameraLeftBoundary.limitX)
        : fallbackCameraStartX;
    const configuredCameraEndX = Number.isFinite(Number(cameraRightBoundary === null || cameraRightBoundary === void 0 ? void 0 : cameraRightBoundary.limitX))
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
    const boundaryViewportOverflow = Math.max(0, viewportWorldWidth - (worldBoundaryRightX - worldBoundaryLeftX));
    const boundaryViewportConflict = boundaryViewportOverflow > 0.001;
    let boundaryFallbackMode = '';
    let cameraStartX = effectiveCameraStartX;
    let cameraEndX = effectiveCameraEndX;
    if (boundaryViewportConflict) {
        // The viewport cannot fit between both stage boundaries. The scene
        // advances to the right, so keep the forward edge hard and use the
        // actual scene content edge as the rear fallback. Never allow the
        // camera centre itself to reach the configured right-edge boundary.
        const contentLeftX = (_f = roadBounds === null || roadBounds === void 0 ? void 0 : roadBounds.x) !== null && _f !== void 0 ? _f : visualBounds.x;
        const contentSafeStartX = contentLeftX + viewportHalfWidth;
        cameraEndX = worldBoundaryRightX - viewportHalfWidth;
        cameraStartX = Math.min(contentSafeStartX, cameraEndX);
        boundaryFallbackMode = contentSafeStartX <= cameraEndX
            ? '右边界优先，左侧使用场景内容边界'
            : '右边界优先，视口宽于可用场景内容';
    }
    if (!(cameraEndX >= cameraStartX)) {
        throw new Error(`Scene camera sweep for ${boundaryStage} is invalid: ${cameraStartX} -> ${cameraEndX}.`);
    }
    const bottomValues = boundaries
        .filter((item) => {
        const type = Number(item === null || item === void 0 ? void 0 : item.type);
        return type >= CAMERA_BOUNDARY_BOTTOM_FIRST && type <= CAMERA_BOUNDARY_BOTTOM_LOOP;
    })
        .map((item) => Number(item === null || item === void 0 ? void 0 : item.limitY))
        .filter(Number.isFinite);
    const topValues = boundaries
        .filter((item) => {
        const type = Number(item === null || item === void 0 ? void 0 : item.type);
        return type >= CAMERA_BOUNDARY_TOP_FIRST && type <= CAMERA_BOUNDARY_TOP_LOOP;
    })
        .map((item) => Number(item === null || item === void 0 ? void 0 : item.limitY))
        .filter(Number.isFinite);
    if (bottomValues.length > 0 && topValues.length > 0) {
        const bottom = Number(rootPosition.y) + Math.max(...bottomValues);
        const top = Number(rootPosition.y) + Math.min(...topValues);
        const desiredY = Number.isFinite(Number(bornPosition === null || bornPosition === void 0 ? void 0 : bornPosition.y))
            ? Number(bornPosition.y)
            : centerY;
        centerY = clampCameraAxis(desiredY, bottom, top, viewportWorldHeight / 2);
    }
    else if (source === 'born-point') {
        // BattleCameraController keeps Y at zero when no vertical bounds exist.
        centerY = Number(rootPosition.y) || 0;
    }
    else if (!Number.isFinite(centerY)) {
        centerY = Number(rootPosition.y) || 0;
    }
    const configuredTypes = new Set(boundaries.map((item) => Number(item === null || item === void 0 ? void 0 : item.type)));
    const stageTypes = [
        1 + stageIndex,
        11 + stageIndex,
        17 + stageIndex,
        27 + stageIndex,
        32 + stageIndex,
        Number(cameraLeftBoundary === null || cameraLeftBoundary === void 0 ? void 0 : cameraLeftBoundary.type),
        Number(cameraRightBoundary === null || cameraRightBoundary === void 0 ? void 0 : cameraRightBoundary.type),
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
function calculatePanoramaWidth(bounds, viewportPixelWidth, viewportWorldWidth) {
    const pixelsPerWorldUnit = viewportPixelWidth / viewportWorldWidth;
    const width = Math.max(1, Math.round(bounds.width * pixelsPerWorldUnit));
    if (width > MAX_PANORAMA_PIXEL_WIDTH) {
        throw new Error(`Scene panorama width ${width}px exceeds the ${MAX_PANORAMA_PIXEL_WIDTH}px safety limit.`);
    }
    return width;
}
function buildRuntimeCameraSweepPositions(cameraStartX, cameraEndX, viewportWorldWidth) {
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
function copyViewportSlice(target, targetWidth, targetX, source, sourceWidth, height, copyWidth) {
    const sourceRowBytes = sourceWidth * 4;
    const targetRowBytes = targetWidth * 4;
    const copyRowBytes = copyWidth * 4;
    for (let row = 0; row < height; row += 1) {
        const sourceOffset = row * sourceRowBytes;
        const targetOffset = row * targetRowBytes + targetX * 4;
        target.set(source.subarray(sourceOffset, sourceOffset + copyRowBytes), targetOffset);
    }
}
let activeSession = null;
function validateRendererVersion(version) {
    if (Number(version) !== SCENE_PREVIEW_RENDERER_VERSION) {
        throw new Error(`Scene preview renderer is stale (loaded ${SCENE_PREVIEW_RENDERER_VERSION}, requested ${version}). `
            + 'Reload the battle-scene-preview extension and retry.');
    }
}
function disposeSession() {
    var _a, _b, _c, _d, _e, _f;
    const session = activeSession;
    activeSession = null;
    if (!session)
        return;
    destroyPreviewCamera(session.camera);
    (_b = (_a = session.cameraNode) === null || _a === void 0 ? void 0 : _a.destroy) === null || _b === void 0 ? void 0 : _b.call(_a);
    (_d = (_c = session.root) === null || _c === void 0 ? void 0 : _c.destroy) === null || _d === void 0 ? void 0 : _d.call(_c);
    (_f = (_e = session.renderTexture) === null || _e === void 0 ? void 0 : _e.destroy) === null || _f === void 0 ? void 0 : _f.call(_e);
    if (session.prefabAsset && typeof cc.assetManager.releaseAsset === 'function') {
        cc.assetManager.releaseAsset(session.prefabAsset);
    }
}
function readBornPoint(root, fallbackX, fallbackY) {
    var _a, _b, _c;
    const editingScene = (_a = root.getComponent) === null || _a === void 0 ? void 0 : _a.call(root, 'battle.editor.EditingScene');
    const born = Array.isArray(editingScene === null || editingScene === void 0 ? void 0 : editingScene.positions)
        ? editingScene.positions.find((item) => Number(item === null || item === void 0 ? void 0 : item.positionType) === BORN_POINT_TYPE)
        : null;
    const worldPosition = (_c = (_b = born === null || born === void 0 ? void 0 : born.collider) === null || _b === void 0 ? void 0 : _b.node) === null || _c === void 0 ? void 0 : _c.worldPosition;
    return {
        x: Number.isFinite(Number(worldPosition === null || worldPosition === void 0 ? void 0 : worldPosition.x)) ? Number(worldPosition.x) : fallbackX,
        y: Number.isFinite(Number(worldPosition === null || worldPosition === void 0 ? void 0 : worldPosition.y)) ? Number(worldPosition.y) : fallbackY,
    };
}
function collectPositions(root) {
    var _a, _b, _c;
    const editingScene = (_a = root.getComponent) === null || _a === void 0 ? void 0 : _a.call(root, 'battle.editor.EditingScene');
    const result = {};
    for (const item of Array.isArray(editingScene === null || editingScene === void 0 ? void 0 : editingScene.positions) ? editingScene.positions : []) {
        const id = String((item === null || item === void 0 ? void 0 : item.id) || '').trim();
        const position = (_c = (_b = item === null || item === void 0 ? void 0 : item.collider) === null || _b === void 0 ? void 0 : _b.node) === null || _c === void 0 ? void 0 : _c.worldPosition;
        if (id && Number.isFinite(Number(position === null || position === void 0 ? void 0 : position.x)) && Number.isFinite(Number(position === null || position === void 0 ? void 0 : position.y))) {
            result[id] = { x: Number(position.x), y: Number(position.y) };
        }
    }
    return result;
}
function boundaryCategory(type) {
    if (type === 16)
        return { category: 'exit', categoryLabel: '离开场景线' };
    if (type >= 11 && type <= 15)
        return { category: 'spawn', categoryLabel: '召唤怪物线' };
    if ((type >= 6 && type <= 10) || (type >= 22 && type <= 36))
        return { category: 'camera', categoryLabel: '镜头限制线' };
    if ((type >= 1 && type <= 5) || (type >= 17 && type <= 21))
        return { category: 'move', categoryLabel: '移动限制线' };
    return null;
}
function collectBoundaryGuides(root, activeBoundaryTypes = new Set()) {
    var _a, _b;
    const editingScene = (_a = root.getComponent) === null || _a === void 0 ? void 0 : _a.call(root, 'battle.editor.EditingScene');
    const origin = ((_b = editingScene === null || editingScene === void 0 ? void 0 : editingScene.node) === null || _b === void 0 ? void 0 : _b.worldPosition) || root.worldPosition || { x: 0, y: 0 };
    const guides = (Array.isArray(editingScene === null || editingScene === void 0 ? void 0 : editingScene.boundaries) ? editingScene.boundaries : []).flatMap((boundary) => {
        const type = Number(boundary === null || boundary === void 0 ? void 0 : boundary.type);
        const category = boundaryCategory(type);
        if (!category)
            return [];
        return [Object.assign(Object.assign({ type, typeLabel: BOUNDARY_TYPE_NAMES[type] || `BoundaryType ${type}` }, category), { horizontal: type >= CAMERA_BOUNDARY_TOP_FIRST && type <= CAMERA_BOUNDARY_BOTTOM_LOOP, active: activeBoundaryTypes.has(type), x: Number(origin.x) + (Number(boundary === null || boundary === void 0 ? void 0 : boundary.limitX) || 0), y: Number(origin.y) + (Number(boundary === null || boundary === void 0 ? void 0 : boundary.limitY) || 0) })];
    });
    return guides.sort((left, right) => {
        if (left.horizontal !== right.horizontal)
            return left.horizontal ? 1 : -1;
        return left.horizontal ? left.y - right.y : left.x - right.x;
    });
}
function collectGroundStates(root) {
    var _a;
    const editingScene = (_a = root.getComponent) === null || _a === void 0 ? void 0 : _a.call(root, 'battle.editor.EditingScene');
    if (!Array.isArray(editingScene === null || editingScene === void 0 ? void 0 : editingScene.groundLayers))
        return [];
    return editingScene.groundLayers.flatMap((ground) => {
        var _a, _b;
        const node = (_a = ground === null || ground === void 0 ? void 0 : ground.ground) === null || _a === void 0 ? void 0 : _a.node;
        if (!node)
            return [];
        const position = node.position;
        return [{
                node,
                name: String(node.name || `Layer ${ground.layerIndex}`),
                configuredWidth: Math.max(0, Number((_b = ground.ground) === null || _b === void 0 ? void 0 : _b.width) || 0),
                configuredHeight: 700,
                origin: { x: Number(position.x), y: Number(position.y), z: Number(position.z) },
                layerIndex: Number(ground.layerIndex) || 0,
                rateX: Number(ground.moveSpeedRateX) || 0,
                rateY: Number(ground.moveSpeedRateY) || 0,
            }];
    });
}
function applyConfiguredRenderOrder(root, grounds) {
    var _a, _b, _c;
    const editingScene = (_a = root.getComponent) === null || _a === void 0 ? void 0 : _a.call(root, 'battle.editor.EditingScene');
    const roadNode = (_b = editingScene === null || editingScene === void 0 ? void 0 : editingScene.roadLayer) === null || _b === void 0 ? void 0 : _b.node;
    const entries = [
        ...grounds.map((ground) => ({ node: ground.node, layerIndex: ground.layerIndex })),
        ...(roadNode ? [{ node: roadNode, layerIndex: 0 }] : []),
    ].filter((entry) => { var _a; return ((_a = entry.node) === null || _a === void 0 ? void 0 : _a.parent) && typeof entry.node.setSiblingIndex === 'function'; });
    const byParent = new Map();
    for (const entry of entries) {
        const group = byParent.get(entry.node.parent) || [];
        group.push(entry);
        byParent.set(entry.node.parent, group);
    }
    for (const [parent, group] of byParent) {
        if (group.length < 2)
            continue;
        // Cocos UI renders later siblings on top. Runtime uses camera priority
        // 100 + layerIndex, so ascending sibling order reproduces the same
        // back -> road -> front composition in this single-camera preview.
        const firstIndex = Math.min(...group.map((entry) => { var _a, _b; return Number((_b = (_a = entry.node).getSiblingIndex) === null || _b === void 0 ? void 0 : _b.call(_a)) || 0; }));
        group.sort((left, right) => (left.layerIndex - right.layerIndex
            || String(left.node.name || '').localeCompare(String(right.node.name || ''), 'zh-CN')));
        group.forEach((entry, offset) => entry.node.setSiblingIndex(firstIndex + offset));
        (_c = parent.updateWorldTransform) === null || _c === void 0 ? void 0 : _c.call(parent);
    }
}
function configuredLayerBounds(session) {
    var _a, _b;
    const result = [];
    const editingScene = (_b = (_a = session.root).getComponent) === null || _b === void 0 ? void 0 : _b.call(_a, 'battle.editor.EditingScene');
    const road = editingScene === null || editingScene === void 0 ? void 0 : editingScene.roadLayer;
    if ((road === null || road === void 0 ? void 0 : road.node) && Number(road.width) > 0 && Number(road.height) > 0) {
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
function findEditingCollider(node) {
    var _a;
    const direct = (_a = node === null || node === void 0 ? void 0 : node.getComponent) === null || _a === void 0 ? void 0 : _a.call(node, 'battle.editor.EditingCollider');
    if (direct)
        return direct;
    const components = typeof (node === null || node === void 0 ? void 0 : node.getComponents) === 'function' ? node.getComponents(cc.Component) : [];
    return components.find((component) => classNameOf(component).endsWith('EditingCollider')) || null;
}
function findOccluderVisualNode(colliderNode, groundNode) {
    var _a, _b, _c;
    if ((_a = colliderNode === null || colliderNode === void 0 ? void 0 : colliderNode.getComponent) === null || _a === void 0 ? void 0 : _a.call(colliderNode, cc.Sprite))
        return colliderNode;
    let ancestor = colliderNode === null || colliderNode === void 0 ? void 0 : colliderNode.parent;
    while (ancestor) {
        if ((_b = ancestor.getComponent) === null || _b === void 0 ? void 0 : _b.call(ancestor, cc.Sprite))
            return ancestor;
        if (ancestor === groundNode)
            break;
        ancestor = ancestor.parent;
    }
    let result = null;
    (_c = colliderNode === null || colliderNode === void 0 ? void 0 : colliderNode.walk) === null || _c === void 0 ? void 0 : _c.call(colliderNode, (node) => {
        var _a;
        if (!result && ((_a = node === null || node === void 0 ? void 0 : node.getComponent) === null || _a === void 0 ? void 0 : _a.call(node, cc.Sprite)))
            result = node;
    });
    return result;
}
function collectOccluders(grounds, previous = []) {
    const result = [];
    const seen = new Set();
    const previousByCollider = new Map(previous.map((item) => [item.collider, item]));
    for (const ground of grounds) {
        ground.node.walk((node) => {
            var _a, _b, _c, _d;
            if (seen.has(node))
                return;
            const collider = findEditingCollider(node);
            const transform = (_a = node.getComponent) === null || _a === void 0 ? void 0 : _a.call(node, cc.UITransform);
            if (!collider || !transform)
                return;
            const visualNode = findOccluderVisualNode(node, ground.node);
            if (!visualNode)
                return;
            seen.add(node);
            const previousState = previousByCollider.get(collider);
            const opacityComponent = (_b = visualNode.getComponent) === null || _b === void 0 ? void 0 : _b.call(visualNode, cc.UIOpacity);
            result.push({
                node: visualNode,
                colliderNode: node,
                transform,
                collider,
                baseOpacity: (_c = previousState === null || previousState === void 0 ? void 0 : previousState.baseOpacity) !== null && _c !== void 0 ? _c : Number((_d = opacityComponent === null || opacityComponent === void 0 ? void 0 : opacityComponent.opacity) !== null && _d !== void 0 ? _d : 255),
                groundName: ground.name,
                layerIndex: ground.layerIndex,
            });
        });
    }
    return result;
}
function occluderAabb(occluder) {
    var _a, _b, _c;
    const { colliderNode: node, transform, collider } = occluder;
    const world = node.worldPosition || node.position || { x: 0, y: 0 };
    const scale = node.worldScale || node.scale || { x: 1, y: 1 };
    const scaleX = Number(scale.x) || 1;
    const scaleY = Number(scale.y) || 1;
    const anchorOffsetX = (Number(transform.anchorX) - 0.5) * Number(transform.width) * scaleX;
    const anchorOffsetY = (Number(transform.anchorY) - 0.5) * Number(transform.height) * scaleY;
    const centerX = Number(world.x) + anchorOffsetX;
    const centerY = Number(world.y) + anchorOffsetY;
    const type = Number((_b = (_a = collider.colliderType) !== null && _a !== void 0 ? _a : collider._colliderType) !== null && _b !== void 0 ? _b : 0);
    if (type === 1) {
        const radius = Math.abs(Number(collider.circleRadius) || 0) * Math.max(Math.abs(scaleX), Math.abs(scaleY));
        return { centerX, centerY, halfWidth: radius, halfHeight: radius };
    }
    if (type === 2 && Array.isArray((_c = collider.polygon) === null || _c === void 0 ? void 0 : _c._points) && collider.polygon._points.length) {
        const angle = (Number(node.angle) || 0) * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const point of collider.polygon._points) {
            const x = Number(point.x) * scaleX;
            const y = Number(point.y) * scaleY;
            const rotatedX = x * cos - y * sin;
            const rotatedY = x * sin + y * cos;
            minX = Math.min(minX, rotatedX);
            maxX = Math.max(maxX, rotatedX);
            minY = Math.min(minY, rotatedY);
            maxY = Math.max(maxY, rotatedY);
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
        const transformPoint = (x, y) => ({
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
function rectFromAabb(aabb) {
    return { x: aabb.centerX - aabb.halfWidth, y: aabb.centerY - aabb.halfHeight, width: aabb.halfWidth * 2, height: aabb.halfHeight * 2 };
}
function collectFeatureRanges(session) {
    var _a, _b, _c;
    const ranges = [];
    for (const occluder of session.occluders) {
        ranges.push(Object.assign(Object.assign({}, rectFromAabb(occluderAabb(occluder))), { kind: 'occlusion', label: `遮挡图虚化 · ${occluder.groundName} · ${occluder.node.name || 'Sprite'}` }));
    }
    for (const component of collectEditingPrefabRefs(session.root)) {
        if (!(component === null || component === void 0 ? void 0 : component.enableAABB))
            continue;
        const position = ((_a = component.node) === null || _a === void 0 ? void 0 : _a.worldPosition) || { x: 0, y: 0 };
        const scale = ((_b = component.node) === null || _b === void 0 ? void 0 : _b.worldScale) || { x: 1, y: 1 };
        const width = Math.abs(Number(component.aabbWidth || 0) * Number(scale.x || 1));
        const height = Math.abs(Number(component.aabbHeight || 0) * Number(scale.y || 1));
        ranges.push({
            x: Number(position.x) + Number(component.aabbOffsetX || 0) * Number(scale.x || 1) - width / 2,
            y: Number(position.y) + Number(component.aabbOffsetY || 0) * Number(scale.y || 1) - height / 2,
            width, height, kind: 'effect', label: `特效激活 · ${((_c = component.node) === null || _c === void 0 ? void 0 : _c.name) || 'Prefab'}`,
        });
    }
    session.root.walk((node) => {
        var _a, _b;
        const components = typeof (node === null || node === void 0 ? void 0 : node.getComponents) === 'function' ? node.getComponents(cc.Component) : [];
        const entity = components.find((component) => classNameOf(component).endsWith('EditingEntity'));
        if (!entity || !Array.isArray(entity.colliders))
            return;
        for (const named of entity.colliders) {
            const collider = named === null || named === void 0 ? void 0 : named.collider;
            const transform = (_b = (_a = collider === null || collider === void 0 ? void 0 : collider.node) === null || _a === void 0 ? void 0 : _a.getComponent) === null || _b === void 0 ? void 0 : _b.call(_a, cc.UITransform);
            if (!collider || !transform)
                continue;
            const type = Number(named.type);
            const kind = type === 1 ? 'opacity-barrier' : type === 2 ? 'trigger' : 'barrier';
            const typeLabel = type === 1 ? '透明障碍' : type === 2 ? '触发器' : '环境碰撞';
            ranges.push(Object.assign(Object.assign({}, rectFromAabb(occluderAabb({
                node: collider.node,
                colliderNode: collider.node,
                transform,
                collider,
                baseOpacity: 255,
                groundName: '',
                layerIndex: 0,
            }))), { kind, label: `${typeLabel} · ${entity.entityId || node.name || named.name}` }));
        }
    });
    return ranges.filter((range) => range.width > 0 && range.height > 0);
}
function updateForegroundOcclusion(session, input, playerX, playerY) {
    var _a, _b;
    const width = Math.max(1, Number(input.colliderWidth) || 140);
    const height = Math.max(1, Number(input.colliderHeight) || 180);
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const characterX = playerX + (Number(input.colliderOffsetX) || 0);
    const characterY = playerY + (Number(input.colliderOffsetY) || 75);
    let faded = 0;
    let maxCoverage = 0;
    let minimumOpacity = 255;
    const fadedLayers = new Set();
    const opacityByNode = new Map();
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
        const coveredPoints = keyPoints.filter(([x, y]) => (Math.abs(x - aabb.centerX) <= aabb.halfWidth
            && Math.abs(y - aabb.centerY) <= aabb.halfHeight)).length;
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
        let opacityComponent = (_a = node.getComponent) === null || _a === void 0 ? void 0 : _a.call(node, cc.UIOpacity);
        if (!opacityComponent)
            opacityComponent = (_b = node.addComponent) === null || _b === void 0 ? void 0 : _b.call(node, cc.UIOpacity);
        if (opacityComponent)
            opacityComponent.opacity = state.opacity;
    }
    return {
        total: session.occluders.length,
        faded,
        maxCoverage,
        minimumOpacity,
        fadedLayers: [...fadedLayers],
    };
}
function applyParallax(session, cameraX, cameraY) {
    const states = [];
    for (const ground of session.grounds) {
        // Runtime uses one camera per layer at masterCamera * rate. This offscreen
        // preview uses one camera, so moving the layer by masterCamera * (1-rate)
        // is the exact equivalent transformation.
        const offsetX = cameraX * (1 - ground.rateX);
        const offsetY = cameraY * (1 - ground.rateY);
        ground.node.setPosition(ground.origin.x + offsetX, ground.origin.y + offsetY, ground.origin.z);
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
function initializePreviewAnimations(session) {
    session.root.walk((node) => {
        var _a, _b, _c;
        if (!(node === null || node === void 0 ? void 0 : node.activeInHierarchy))
            return;
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        for (const component of components) {
            if ((component === null || component === void 0 ? void 0 : component.enabled) === false || session.initializedAnimations.has(component))
                continue;
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
                }
                else if (name.endsWith('Animation')) {
                    if (component.defaultClip || component._defaultClip)
                        (_a = component.play) === null || _a === void 0 ? void 0 : _a.call(component);
                    session.initializedAnimations.add(component);
                }
                else if (name.endsWith('ParticleSystem2D')) {
                    (_b = component.resetSystem) === null || _b === void 0 ? void 0 : _b.call(component);
                    (_c = component.play) === null || _c === void 0 ? void 0 : _c.call(component);
                    session.initializedAnimations.add(component);
                }
                else if (name.endsWith('InfinityScrollImage')) {
                    session.initializedAnimations.add(component);
                }
            }
            catch (_d) {
                // One malformed scene effect should not block the remaining layers.
            }
        }
    });
}
function advancePreviewAnimations(session, deltaTime) {
    const dt = Math.max(0, Math.min(0.1, Number(deltaTime) || 0));
    if (dt <= 0)
        return 0;
    let advanced = 0;
    session.root.walk((node) => {
        var _a, _b;
        if (!(node === null || node === void 0 ? void 0 : node.activeInHierarchy))
            return;
        const components = typeof node.getComponents === 'function' ? node.getComponents(cc.Component) : [];
        for (const component of components) {
            if ((component === null || component === void 0 ? void 0 : component.enabled) === false)
                continue;
            const name = classNameOf(component);
            try {
                if (name.endsWith('Skeleton') && typeof component.updateAnimation === 'function') {
                    component._isPreviewInEditor = true;
                    component.updateAnimation(dt);
                    advanced += 1;
                }
                else if (name.endsWith('Animation') && typeof ((_a = component._crossFade) === null || _a === void 0 ? void 0 : _a.update) === 'function') {
                    component._crossFade.update(dt);
                    advanced += 1;
                }
                else if (name.endsWith('ParticleSystem2D')) {
                    if (typeof component.lateUpdate === 'function')
                        component.lateUpdate(dt);
                    else
                        (_b = component.update) === null || _b === void 0 ? void 0 : _b.call(component, dt);
                    advanced += 1;
                }
                else if (name.endsWith('InfinityScrollImage') && typeof component.update === 'function') {
                    component.update(dt);
                    advanced += 1;
                }
            }
            catch (_c) {
                // A broken effect must not stop the preview.
            }
        }
    });
    return advanced;
}
function updatePrefabActivation(session, cameraX, cameraY) {
    var _a, _b;
    const halfWidth = session.runtimeFrame.viewportWorldWidth * 0.525;
    const halfHeight = session.runtimeFrame.viewportWorldHeight * 0.525;
    let active = 0;
    let inactive = 0;
    let missingAabb = 0;
    for (const component of collectEditingPrefabRefs(session.root)) {
        const instance = component === null || component === void 0 ? void 0 : component._instance;
        if (!instance)
            continue;
        if (!component.enableAABB) {
            instance.active = true;
            active += 1;
            missingAabb += 1;
            continue;
        }
        const position = ((_a = component.node) === null || _a === void 0 ? void 0 : _a.worldPosition) || { x: 0, y: 0 };
        const scale = ((_b = component.node) === null || _b === void 0 ? void 0 : _b.worldScale) || { x: 1, y: 1 };
        const centerX = Number(position.x) + Number(component.aabbOffsetX || 0) * Number(scale.x || 1);
        const centerY = Number(position.y) + Number(component.aabbOffsetY || 0) * Number(scale.y || 1);
        const effectHalfWidth = Math.abs(Number(component.aabbWidth || 0) * Number(scale.x || 1)) / 2;
        const effectHalfHeight = Math.abs(Number(component.aabbHeight || 0) * Number(scale.y || 1)) / 2;
        const visible = Math.abs(centerX - cameraX) <= halfWidth + effectHalfWidth
            && Math.abs(centerY - cameraY) <= halfHeight + effectHalfHeight;
        instance.active = visible;
        if (visible)
            active += 1;
        else
            inactive += 1;
    }
    return { active, inactive, missingAabb };
}
async function startPreviewSession(input) {
    var _a, _b, _c, _d, _e, _f;
    disposeSession();
    let prefabAsset = null;
    let root = null;
    let cameraNode = null;
    let camera = null;
    let renderTexture = null;
    try {
        validateRendererVersion(input.rendererVersion);
        prefabAsset = await loadPrefab(String(input.uuid || ''));
        root = cc.instantiate(prefabAsset);
        const currentScene = cc.director.getScene();
        if (!currentScene)
            throw new Error('Cocos scene is not ready.');
        const previewLayer = selectIsolatedPreviewLayer(currentScene);
        preparePrefabForPreview(root, previewLayer);
        currentScene.addChild(root);
        root.active = true;
        activatePreviewHierarchy(root);
        (_a = root.updateWorldTransform) === null || _a === void 0 ? void 0 : _a.call(root);
        const nestedPrefabCount = await waitForNestedPrefabRefs(root, previewLayer);
        preparePrefabForPreview(root, previewLayer, false);
        activatePreviewHierarchy(root);
        (_b = root.updateWorldTransform) === null || _b === void 0 ? void 0 : _b.call(root);
        const cameraProfile = await loadRuntimeCameraProfile(String(input.runtimeCameraUuid || ''));
        if (Number(input.viewportWidth) > 0)
            cameraProfile.viewportWidth = Number(input.viewportWidth);
        if (Number(input.viewportHeight) > 0)
            cameraProfile.viewportHeight = Number(input.viewportHeight);
        if (Number(input.orthoHeight) > 0)
            cameraProfile.orthoHeight = Number(input.orthoHeight);
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
        (_c = cameraNode.updateWorldTransform) === null || _c === void 0 ? void 0 : _c.call(cameraNode);
        activatePreviewCamera(camera);
        const grounds = collectGroundStates(root);
        applyConfiguredRenderOrder(root, grounds);
        activeSession = {
            prefabAsset, root, cameraNode, camera, renderTexture, previewLayer,
            textureSize, cameraProfile, runtimeFrame,
            grounds, occluders: collectOccluders(grounds), born, positions: collectPositions(root),
            initializedAnimations: new WeakSet(), nestedPrefabCount,
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
    }
    catch (error) {
        destroyPreviewCamera(camera);
        (_d = cameraNode === null || cameraNode === void 0 ? void 0 : cameraNode.destroy) === null || _d === void 0 ? void 0 : _d.call(cameraNode);
        (_e = root === null || root === void 0 ? void 0 : root.destroy) === null || _e === void 0 ? void 0 : _e.call(root);
        (_f = renderTexture === null || renderTexture === void 0 ? void 0 : renderTexture.destroy) === null || _f === void 0 ? void 0 : _f.call(renderTexture);
        if (prefabAsset && typeof cc.assetManager.releaseAsset === 'function')
            cc.assetManager.releaseAsset(prefabAsset);
        return { ok: false, message: error instanceof Error ? error.message : String(error), rendererVersion: SCENE_PREVIEW_RENDERER_VERSION };
    }
}
async function renderPreviewFrame(input) {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        validateRendererVersion(input.rendererVersion);
        const session = activeSession;
        if (!session)
            throw new Error('Preview session is not started.');
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
        const editingScene = (_b = (_a = session.root).getComponent) === null || _b === void 0 ? void 0 : _b.call(_a, 'battle.editor.EditingScene');
        const roadComponent = editingScene === null || editingScene === void 0 ? void 0 : editingScene.roadLayer;
        const roadLayer = roadComponent ? {
            name: String(((_c = roadComponent.node) === null || _c === void 0 ? void 0 : _c.name) || 'Road'),
            width: Number(roadComponent.width) || 0,
            height: Number(roadComponent.height) || 0,
        } : null;
        (_e = (_d = session.root).updateWorldTransform) === null || _e === void 0 ? void 0 : _e.call(_d);
        const layerBounds = input.showLayerBounds ? configuredLayerBounds(session) : [];
        const featureRanges = input.showFeatureRanges ? collectFeatureRanges(session) : [];
        const effects = updatePrefabActivation(session, cameraX, cameraY);
        initializePreviewAnimations(session);
        const advancedAnimations = advancePreviewAnimations(session, Number(input.deltaTime) || 0);
        session.cameraNode.setWorldPosition(cameraX, cameraY, session.cameraProfile.positionZ);
        (_g = (_f = session.cameraNode).updateWorldTransform) === null || _g === void 0 ? void 0 : _g.call(_f);
        let occlusion = { total: 0, faded: 0, maxCoverage: 0, minimumOpacity: 255, fadedLayers: [] };
        await renderPreviewFrames(session.camera, session.root, session.previewLayer, 1, () => {
            // Nested editor prefabs can finish loading after the preview session starts.
            // Refresh the collection, then apply opacity after editor components have
            // updated so their own refresh cannot overwrite the preview fade.
            session.occluders = collectOccluders(session.grounds, session.occluders);
            occlusion = updateForegroundOcclusion(session, input, requestedX, requestedY);
        });
        const pixels = session.renderTexture.readPixels();
        const expectedLength = session.textureSize.width * session.textureSize.height * 4;
        if (!pixels || pixels.length !== expectedLength)
            throw new Error('RenderTexture returned no RGBA pixels.');
        if (!hasSceneContentPixels(pixels)) {
            throw new Error(`Rendered frame contains only the clear color. Diagnostics: ${JSON.stringify(collectRenderDiagnostics(session.root, session.camera, session.runtimeFrame.bounds, session.textureSize))}`);
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
            exposure: Object.assign(Object.assign({}, exposure), { visible: Object.values(exposure).some((value) => value > 1) }),
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
    }
    catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error), rendererVersion: SCENE_PREVIEW_RENDERER_VERSION };
    }
}
function stopPreviewSession() {
    disposeSession();
    return { ok: true };
}
function load() {
    console.log('[table_data_visualizer][scene] loaded');
}
exports.load = load;
function unload() {
    disposeSession();
    console.log('[battle-scene-preview][scene] unloaded');
}
exports.unload = unload;
exports.methods = {
    startPreviewSession,
    renderPreviewFrame,
    stopPreviewSession,
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2NlbmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zb3VyY2Uvc2NlbmUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCLE1BQU0sRUFBRSxHQUFRLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQztBQXdEOUIsTUFBTSxrQkFBa0IsR0FBRyxFQUFFLENBQUM7QUFDOUIsTUFBTSxnQkFBZ0IsR0FBRyxHQUFHLENBQUM7QUFDN0IsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLENBQUM7QUFDbEMsTUFBTSxXQUFXLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsR0FBRyxFQUFFLENBQUM7QUFDcEQsTUFBTSw2QkFBNkIsR0FBRyxHQUFHLENBQUM7QUFDMUMsTUFBTSw4QkFBOEIsR0FBRyxJQUFJLENBQUM7QUFDNUMsTUFBTSxvQ0FBb0MsR0FBRyxLQUFLLENBQUM7QUFDbkQsTUFBTSxlQUFlLEdBQUcsQ0FBQyxDQUFDO0FBRTFCLE1BQU0sZUFBZSxHQUFvQixDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztBQUU5RSxNQUFNLDJCQUEyQixHQUFHLENBQUMsQ0FBQztBQUN0QyxNQUFNLDBCQUEwQixHQUFHLEVBQUUsQ0FBQztBQUN0QyxNQUFNLHlCQUF5QixHQUFHLEVBQUUsQ0FBQztBQUNyQyxNQUFNLHdCQUF3QixHQUFHLEVBQUUsQ0FBQztBQUNwQyxNQUFNLDRCQUE0QixHQUFHLEVBQUUsQ0FBQztBQUN4QyxNQUFNLDJCQUEyQixHQUFHLEVBQUUsQ0FBQztBQUN2QyxNQUFNLG1CQUFtQixHQUFHO0lBQ3hCLE1BQU07SUFDTixzQkFBc0IsRUFBRSxzQkFBc0IsRUFBRSxzQkFBc0IsRUFBRSxzQkFB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QUMsRUFBRSxDQUFDLEVBQUUsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsR0FBRyxNQUFNLEdBQUcsQ0FBQyxFQUFFLEtBQUssRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxJQUFJLE1BQU0sQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO0tBQzlLO0lBQ0QsS0FBSyxNQUFNLE1BQU0sSUFBSSxPQUFPLENBQUMsT0FBTyxFQUFFO1FBQ2xDLE1BQU0sUUFBUSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUMsYUFBYSxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsUUFBUSxJQUFJLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUM7UUFDckYsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxVQUFVLElBQUksTUFBTSxDQUFDLElBQUksQ0FBQyxLQUFLLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUM1RSxNQUFNLEtBQUssR0FBRyxNQUFNLENBQUMsZUFBZSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN0RSxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ3hFLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxDQUFD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TUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDM0csT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEVBQUUsU0FBUyxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLENBQUM7S0FDdEU7SUFDRCxJQUFJLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxNQUFBLFFBQVEsQ0FBQyxPQUFPLDBDQUFFLE9BQU8sQ0FBQyxJQUFJLFFBQVEsQ0FBQyxPQUFPLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRTtRQUMzRixNQUFNLEtBQUssR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUM7UUFDeEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUM1QixNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQzVCLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQztRQUFDLElBQUksSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDO1FBQUMsSUFBSSxJQUFJLEdBQUcsUUFBUSxDQUFDO1FBQUMsSUFBSSxJQUFJLEdBQUcsQ0FBQyxRQUFRLENBQUM7UUFDckYsS0FBSyxNQUFNLEtBQUssSUFBSSxRQUFRLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRTtZQUMxQyxNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQztZQUNuQyxNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLE1BQU0sQ0FBQztZQUNuQyxNQUFNLFFBQVEsR0FBRyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLENBQUM7WUFDbkMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRyxDQUFDO1lBQ25DLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztZQUFDLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRSxRQUFRLENBQUMsQ0FBQztZQUNqRSxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7WUFBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7U0FDcEU7UUFDRCxPQUFPO1lBQ0gsT0FBTyxFQUFFLE9BQU8sR0FBRyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDO1lBQ3BDLE9BQU8sRUFBRSxPQUFPLEdBQUcsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztZQUNwQyxTQUFTLEVBQUUsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztZQUM1QixVQUFVLEVBQUUsQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQztTQUNoQyxDQUFDO0tBQ0w7SUFDRCxJQUFJLElBQUksS0FBSyxDQUFDLEVBQUU7UUFDWixNQUFNLEtBQUssR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsSUFBSSxDQUFDLEVBQUUsR0FBRyxHQUFHLENBQUM7UUFDeEQsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsR0FBRyxNQUFNLENBQUM7UUFDdkQsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLFFBQVEsQ0FBQyxhQUFhLENBQUMsR0FBRyxNQUFNLENBQUM7UUFDdkQsTUFBTSxRQUFRLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckUsTUFBTSxRQUFRLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDckUsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDM0csT0FBTyxFQUFFLE9BQU8sRUFBRSxPQUFPLEdBQUcsUUFBUSxFQUFFLE9BQU8sRUFBRSxPQUFPLEdBQUcsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxDQUFDO0tBQzlHO0lBQ0QsSUFBSSxJQUFJLEtBQUssQ0FBQyxFQUFFO1FBQ1osTUFBTSxLQUFLLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLElBQUksQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDO1FBQ3hELE1BQU0sY0FBYyxHQUFHLENBQUMsQ0FBUyxFQUFFLENBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUM5QyxDQUFDLEVBQUUsT0FBTyxHQUFHLENBQUMsR0FBRyxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEdBQUcsTUFBTSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDO1lBQ3hFLENBQUMsRUFBRSxPQUFPLEdBQUcsQ0FBQyxHQUFHLE1BQU0sR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsR0FBRyxNQUFNLEdBQUcsSUFBSSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUM7U0FDM0UsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxLQUFLLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDdkcsTUFBTSxHQUFHLEdBQUcsY0FBYyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxFQUFFLE1BQU0sQ0FBQyxRQUFRLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7UUFDakcsT0FBTztZQUNILE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQyxDQUFDLEdBQUcsR0FBRyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxHQUFHLEdBQUcsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO1lBQzlELFNBQVMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUNoSCxDQUFDO0tBQ0w7SUFDRCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxNQUFNLENBQUMsR0FBRyxD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QUNyQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xyXG5pbXBvcnQgKiBhcyB6bGliIGZyb20gJ3psaWInO1xyXG5cclxuY29uc3QgY2M6IGFueSA9IHJlcXVpcmUoJ2NjJyk7XHJcblxyXG5pbnRlcmZhY2UgU3RhcnRQcmV2aWV3SW5wdXQge1xuICAgIHV1aWQ6IHN0cmluZztcclxuICAgIHJ1bnRpbWVDYW1lcmFVdWlkOiBzdHJpbmc7XHJcbiAgICB2aWV3cG9ydFdpZHRoPzogbnVtYmVyO1xyXG4gICAgdmlld3BvcnRIZWlnaHQ/OiBudW1iZXI7XG4gICAgb3J0aG9IZWlnaHQ/OiBudW1iZXI7XG4gICAgYm91bmRhcnlTdGFnZT86IEJvdW5kYXJ5U3RhZ2U7XG4gICAgcmVuZGVyZXJWZXJzaW9uOiBudW1iZXI7XG59XG5cclxuaW50ZXJmYWNlIFJlbmRlclByZXZpZXdJbnB1dCB7XG4gICAgb3V0cHV0UGF0aDogc3RyaW5nO1xyXG4gICAgcGxheWVyWD86IG51bWJlcjtcclxuICAgIHBsYXllclk/OiBudW1iZXI7XHJcbiAgICBjYW1lcmFYPzogbnVtYmVyO1xuICAgIGNhbWVyYVk/OiBudW1iZXI7XG4gICAgcGFyYWxsYXhDYW1lcmFYPzogbnVtYmVyO1xuICAgIHBhcmFsbGF4Q2FtZXJhWT86IG51bWJlcjtcbiAgICBvcnRob0hlaWdodD86IG51bWJlcjtcclxuICAgIGZyZWVDYW1lcmE/OiBib29sZWFuO1xyXG4gICAgc2hvd0xheWVyQm91bmRzPzogYm9vbGVhbjtcclxuICAgIHNob3dGZWF0dXJlUmFuZ2VzPzogYm9vbGVhbjtcclxuICAgIGRlbHRhVGltZT86IG51bWJlcjtcclxuICAgIHJlc3BlY3RDYW1lcmFCb3VuZHM/OiBib29sZWFuO1xyXG4gICAgY29sbGlkZXJXaWR0aD86IG51bWJlcjtcclxuICAgIGNvbGxpZGVySGVpZ2h0PzogbnVtYmVyO1xyXG4gICAgY29sbGlkZXJPZmZzZXRYPzogbnVtYmVyO1xuICAgIGNvbGxpZGVyT2Zmc2V0WT86IG51bWJlcjtcbiAgICBlbmFibGVGb3JlZ3JvdW5kT2NjbHVzaW9uPzogYm9vbGVhbjtcbiAgICByZW5kZXJlclZlcnNpb246IG51bWJlcjtcbn1cblxyXG5pbnRlcmZhY2UgUmVjdExpa2Uge1xyXG4gICAgeDogbnVtYmVyO1xyXG4gICAgeTogbnVtYmVyO1xyXG4gICAgd2lkdGg6IG51bWJlcjtcclxuICAgIGhlaWdodDogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgUnVudGltZUNhbWVyYVByb2ZpbGUge1xyXG4gICAgdmlld3BvcnRXaWR0aDogbnVtYmVyO1xyXG4gICAgdmlld3BvcnRIZWlnaHQ6IG51bWJlcjtcclxuICAgIHByb2plY3Rpb246IG51bWJlcjtcclxuICAgIG9ydGhvSGVpZ2h0OiBudW1iZXI7XHJcbiAgICBuZWFyOiBudW1iZXI7XHJcbiAgICBmYXI6IG51bWJlcjtcclxuICAgIGZvdjogbnVtYmVyO1xyXG4gICAgZm92QXhpczogbnVtYmVyO1xyXG4gICAgY2xlYXJGbGFnczogbnVtYmVyO1xyXG4gICAgY2xlYXJDb2xvcjogeyByOiBudW1iZXI7IGc6IG51bWJlcjsgYjogbnVtYmVyOyBhOiBudW1iZXIgfTtcclxuICAgIHBvc2l0aW9uWjogbnVtYmVyO1xyXG4gICAgc291cmNlOiBzdHJpbmc7XHJcbn1cclxuXHJcbmNvbnN0IE1BWF9VU0VSX0xBWUVSX0JJVCA9IDE5O1xyXG5jb25zdCBNSU5fVEVYVFVSRV9FREdFID0gMTI4O1xyXG5jb25zdCBERUZBVUxUX1RFWFRVUkVfRURHRSA9IDE1MzY7XHJcbmNvbnN0IENMRUFSX0NPTE9SID0geyByOiAxNywgZzogMjMsIGI6IDMxLCBhOiAyNTUgfTtcclxuY29uc3QgRkFMTEJBQ0tfUlVOVElNRV9DQU1FUkFfV0lEVEggPSA3MDA7XHJcbmNvbnN0IEZBTExCQUNLX1JVTlRJTUVfQ0FNRVJBX0hFSUdIVCA9IDE1MjU7XHJcbmNvbnN0IEZBTExCQUNLX1JVTlRJTUVfQ0FNRVJBX09SVEhPX0hFSUdIVCA9IDc2Mi41O1xuY29uc3QgQk9STl9QT0lOVF9UWVBFID0gMTtcbnR5cGUgQm91bmRhcnlTdGFnZSA9ICcxc3QnIHwgJzJuZCcgfCAnM3JkJyB8ICc0dGgnIHwgJ2xvb3AnO1xuY29uc3QgQk9VTkRBUllfU1RBR0VTOiBCb3VuZGFyeVN0YWdlW10gPSBbJzFzdCcsICcybmQnLCAnM3JkJywgJzR0aCcsICdsb29wJ107XG5cclxuY29uc3QgQ0FNRVJBX0JPVU5EQVJZX1JJR0hUX0ZJUlNUID0gNjtcbmNvbnN0IENBTUVSQV9CT1VOREFSWV9MRUZUX0ZJUlNUID0gMjI7XG5jb25zdCBDQU1FUkFfQk9VTkRBUllfVE9QX0ZJUlNUID0gMjc7XG5jb25zdCBDQU1FUkFfQk9VTkRBUllfVE9QX0xPT1AgPSAzMTtcbmNvbnN0IENBTUVSQV9CT1VOREFSWV9CT1RUT01fRklSU1QgPSAzMjtcbmNvbnN0IENBTUVSQV9CT1VOREFSWV9CT1RUT01fTE9PUCA9IDM2O1xuY29uc3QgQk9VTkRBUllfVFlQRV9OQU1FUyA9IFtcbiAgICAnTm9uZScsXG4gICAgJ01vdmVCb3VuZGFyeVJpZ2h0MXN0JywgJ01vdmVCb3VuZGFyeVJpZ2h0Mm5kJywgJ01vdmVCb3VuZGFyeVJpZ2h0M3JkJywgJ01vdmVCb3VuZGFyeVJpZ2h0NHRoJywgJ01vdmVCb3VuZGFyeVJpZ2h0TG9vcCcsXG4gICAgJ0NhbWVyYUJvdW5kYXJ5UmlnaHQxc3QnLCAnQ2FtZXJhQm91bmRhcnlSaWdodDJuZCcsICdDYW1lcmFCb3VuZGFyeVJpZ2h0M3JkJywgJ0NhbWVyYUJvdW5kYXJ5UmlnaHQ0dGgnLCAnQ2FtZXJhQm91bmRhcnlSaWdodExvb3AnLFxuICAgICdTcGF3blRyaWdnZXIxc3QnLCAnU3Bhd25UcmlnZ2VyMm5kJywgJ1NwYXduVHJpZ2dlcjNyZCcsICdTcGF3blRyaWdnZXI0dGgnLCAnU3Bhd25UcmlnZ2VyTG9vcCcsXG4gICAgJ0V4aXRCb3VuZGFyeScsXG4gICAgJ01vdmVCb3VuZGFyeUxlZnQxc3QnLCAnTW92ZUJvdW5kYXJ5TGVmdDJuZCcsICdNb3ZlQm91bmRhcnlMZWZ0M3JkJywgJ01vdmVCb3VuZGFyeUxlZnQ0dGgnLCAnTW92ZUJvdW5kYXJ5TGVmdExvb3AnLFxuICAgICdDYW1lcmFCb3VuZGFyeUxlZnQxc3QnLCAnQ2FtZXJhQm91bmRhcnlMZWZ0Mm5kJywgJ0NhbWVyYUJvdW5kYXJ5TGVmdDNyZCcsICdDYW1lcmFCb3VuZGFyeUxlZnQ0dGgnLCAnQ2FtZXJhQm91bmRhcnlMZWZ0TG9vcCcsXG4gICAgJ0NhbWVyYUJvdW5kYXJ5VG9wMXN0JywgJ0NhbWVyYUJvdW5kYXJ5VG9wMm5kJywgJ0NhbWVyYUJvdW5kYXJ5VG9wM3JkJywgJ0NhbWVyYUJvdW5kYXJ5VG9wNHRoJywgJ0NhbWVyYUJvdW5kYXJ5VG9wTG9vcCcsXG4gICAgJ0NhbWVyYUJvdW5kYXJ5Qm90dG9tMXN0JywgJ0NhbWVyYUJvdW5kYXJ5Qm90dG9tMm5kJywgJ0NhbWVyYUJvdW5kYXJ5Qm90dG9tM3JkJywgJ0NhbWVyYUJvdW5kYXJ5Qm90dG9tNHRoJywgJ0NhbWVyYUJvdW5kYXJ5Qm90dG9tTG9vcCcsXG5dO1xuY29uc3QgTUFYX1BBTk9SQU1BX1BJWEVMX1dJRFRIID0gMTYzODQ7XHJcbmNvbnN0IFNDRU5FX1BSRVZJRVdfUkVOREVSRVJfVkVSU0lPTiA9IDE0O1xuLy8gS2VlcCB0aGlzIGxvY2FsIGJlY2F1c2UgQ2FtZXJhVXNhZ2UgaXMgYW4gZW5naW5lLWludGVybmFsIGVudW0gaW4gQ3JlYXRvciAzLjguXHJcbmNvbnN0IFBSRVZJRVdfQ0FNRVJBX1VTQUdFID0gMztcclxuY29uc3QgTkVTVEVEX1BSRUZBQl9MT0FEX1RJTUVPVVRfTVMgPSAxMjAwMDtcclxuXHJcbmZ1bmN0aW9uIGNyYzMyKGJ1ZmZlcjogQnVmZmVyKTogbnVtYmVyIHtcclxuICAgIGxldCBjcmMgPSAweGZmZmZmZmZmO1xyXG4gICAgZm9yIChjb25zdCBieXRlIG9mIGJ1ZmZlcikge1xyXG4gICAgICAgIGNyYyBePSBieXRlO1xyXG4gICAgICAgIGZvciAobGV0IGJpdCA9IDA7IGJpdCA8IDg7IGJpdCArPSAxKSB7XHJcbiAgICAgICAgICAgIGNyYyA9IChjcmMgPj4+IDEpIF4gKChjcmMgJiAxKSA/IDB4ZWRiODgzMjAgOiAwKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICByZXR1cm4gKGNyYyBeIDB4ZmZmZmZmZmYpID4+PiAwO1xyXG59XHJcblxyXG5mdW5jdGlvbiBwbmdDaHVuayh0eXBlOiBzdHJpbmcsIGRhdGE6IEJ1ZmZlcik6IEJ1ZmZlciB7XHJcbiAgICBjb25zdCB0eXBlQnVmZmVyID0gQnVmZmVyLmZyb20odHlwZSwgJ2FzY2lpJyk7XHJcbiAgICBjb25zdCBsZW5ndGggPSBCdWZmZXIuYWxsb2MoNCk7XHJcbiAgICBsZW5ndGgud3JpdGVVSW50MzJCRShkYXRhLmxlbmd0aCwgMCk7XHJcbiAgICBjb25zdCBjaGVja3N1bSA9IEJ1ZmZlci5hbGxvYyg0KTtcclxuICAgIGNoZWNrc3VtLndyaXRlVUludDMyQkUoY3JjMzIoQnVmZmVyLmNvbmNhdChbdHlwZUJ1ZmZlciwgZGF0YV0pKSwgMCk7XHJcbiAgICByZXR1cm4gQnVmZmVyLmNvbmNhdChbbGVuZ3RoLCB0eXBlQnVmZmVyLCBkYXRhLCBjaGVja3N1bV0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiB3cml0ZVJnYmFQbmcob3V0cHV0UGF0aDogc3RyaW5nLCBwaXhlbHM6IFVpbnQ4QXJyYXksIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogdm9pZCB7XHJcbiAgICBjb25zdCByb3dCeXRlcyA9IHdpZHRoICogNDtcclxuICAgIGNvbnN0IHNjYW5saW5lcyA9IEJ1ZmZlci5hbGxvYygocm93Qnl0ZXMgKyAxKSAqIGhlaWdodCk7XHJcbiAgICBmb3IgKGxldCByb3cgPSAwOyByb3cgPCBoZWlnaHQ7IHJvdyArPSAxKSB7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0T2Zmc2V0ID0gcm93ICogKHJvd0J5dGVzICsgMSk7XHJcbiAgICAgICAgc2NhbmxpbmVzW3RhcmdldE9mZnNldF0gPSAwO1xyXG4gICAgICAgIGNvbnN0IHNvdXJjZU9mZnNldCA9IChoZWlnaHQgLSAxIC0gcm93KSAqIHJvd0J5dGVzO1xyXG4gICAgICAgIEJ1ZmZlci5mcm9tKHBpeGVscy5idWZmZXIsIHBpeGVscy5ieXRlT2Zmc2V0ICsgc291cmNlT2Zmc2V0LCByb3dCeXRlcylcclxuICAgICAgICAgICAgLmNvcHkoc2NhbmxpbmVzLCB0YXJnZXRPZmZzZXQgKyAxKTtcclxuICAgIH1cclxuICAgIGNvbnN0IGhlYWRlciA9IEJ1ZmZlci5hbGxvYygxMyk7XHJcbiAgICBoZWFkZXIud3JpdGVVSW50MzJCRSh3aWR0aCwgMCk7XHJcbiAgICBoZWFkZXIud3JpdGVVSW50MzJCRShoZWlnaHQsIDQpO1xyXG4gICAgaGVhZGVyWzhdID0gODtcclxuICAgIGhlYWRlcls5XSA9IDY7XHJcbiAgICBjb25zdCBwbmcgPSBCdWZmZXIuY29uY2F0KFtcclxuICAgICAgICBCdWZmZXIuZnJvbShbMTM3LCA4MCwgNzgsIDcxLCAxMywgMTAsIDI2LCAxMF0pLFxyXG4gICAgICAgIHBuZ0NodW5rKCdJSERSJywgaGVhZGVyKSxcclxuICAgICAgICBwbmdDaHVuaygnSURBVCcsIHpsaWIuZGVmbGF0ZVN5bmMoc2NhbmxpbmVzLCB7IGxldmVsOiA2IH0pKSxcclxuICAgICAgICBwbmdDaHVuaygnSUVORCcsIEJ1ZmZlci5hbGxvYygwKSksXHJcbiAgICBdKTtcclxuICAgIGZzLm1rZGlyU3luYyhyZXF1aXJlKCdwYXRoJykuZGlybmFtZShvdXRwdXRQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XHJcbiAgICBmcy53cml0ZUZpbGVTeW5jKG91dHB1dFBhdGgsIHBuZyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGxvYWRQcmVmYWIodXVpZDogc3RyaW5nKTogUHJvbWlzZTxhbnk+IHtcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XHJcbiAgICAgICAgY2MuYXNzZXRNYW5hZ2VyLmxvYWRBbnkoeyB1dWlkIH0sIChlcnJvcjogRXJyb3IgfCBudWxsLCBwcmVmYWI6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIHJlamVjdChlcnJvcik7XHJcbiAgICAgICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmVzb2x2ZShwcmVmYWIpO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGZpbmRGaXJzdENvbXBvbmVudChyb290OiBhbnksIGNvbXBvbmVudFR5cGU6IGFueSk6IGFueSB8IG51bGwge1xyXG4gICAgbGV0IHJlc3VsdDogYW55IHwgbnVsbCA9IHJvb3Q/LmdldENvbXBvbmVudD8uKGNvbXBvbmVudFR5cGUpIHx8IG51bGw7XHJcbiAgICByb290Py53YWxrPy4oKG5vZGU6IGFueSkgPT4ge1xyXG4gICAgICAgIGlmICghcmVzdWx0KSB7XHJcbiAgICAgICAgICAgIHJlc3VsdCA9IG5vZGU/LmdldENvbXBvbmVudD8uKGNvbXBvbmVudFR5cGUpIHx8IG51bGw7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gcmVzdWx0O1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBsb2FkUnVudGltZUNhbWVyYVByb2ZpbGUodXVpZDogc3RyaW5nKTogUHJvbWlzZTxSdW50aW1lQ2FtZXJhUHJvZmlsZT4ge1xyXG4gICAgbGV0IHByZWZhYkFzc2V0OiBhbnkgPSBudWxsO1xyXG4gICAgbGV0IHJ1bnRpbWVSb290OiBhbnkgPSBudWxsO1xyXG4gICAgdHJ5IHtcclxuICAgICAgICBpZiAoIXV1aWQpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdCYXR0bGVSb2FkVmlldyBwcmVmYWIgVVVJRCBpcyBtaXNzaW5nLicpO1xyXG4gICAgICAgIH1cclxuICAgICAgICBwcmVmYWJBc3NldCA9IGF3YWl0IGxvYWRQcmVmYWIodXVpZCk7XHJcbiAgICAgICAgcnVudGltZVJvb3QgPSBjYy5pbnN0YW50aWF0ZShwcmVmYWJBc3NldCk7XHJcbiAgICAgICAgY29uc3QgY2FtZXJhID0gZmluZEZpcnN0Q29tcG9uZW50KHJ1bnRpbWVSb290LCBjYy5DYW1lcmEpO1xyXG4gICAgICAgIGNvbnN0IHRyYW5zZm9ybSA9IGNhbWVyYT8ubm9kZT8uZ2V0Q29tcG9uZW50Py4oY2MuVUlUcmFuc2Zvcm0pO1xyXG4gICAgICAgIGNvbnN0IHZpZXdwb3J0V2lkdGggPSBOdW1iZXIodHJhbnNmb3JtPy5jb250ZW50U2l6ZT8ud2lkdGgpO1xyXG4gICAgICAgIGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gTnVtYmVyKHRyYW5zZm9ybT8uY29udGVudFNpemU/LmhlaWdodCk7XHJcbiAgICAgICAgY29uc3Qgb3J0aG9IZWlnaHQgPSBOdW1iZXIoY2FtZXJhPy5vcnRob0hlaWdodCk7XHJcbiAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAhY2FtZXJhXHJcbiAgICAgICAgICAgIHx8ICEodmlld3BvcnRXaWR0aCA+IDApXHJcbiAgICAgICAgICAgIHx8ICEodmlld3BvcnRIZWlnaHQgPiAwKVxyXG4gICAgICAgICAgICB8fCAhKG9ydGhvSGVpZ2h0ID4gMClcclxuICAgICAgICApIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdCYXR0bGVSb2FkVmlldyBkb2VzIG5vdCBjb250YWluIGEgdXNhYmxlIHJ1bnRpbWUgY2FtZXJhIHByb2ZpbGUuJyk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGNvbG9yID0gY2FtZXJhLmNsZWFyQ29sb3IgfHwgQ0xFQVJfQ09MT1I7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgdmlld3BvcnRXaWR0aCxcclxuICAgICAgICAgICAgdmlld3BvcnRIZWlnaHQsXHJcbiAgICAgICAgICAgIHByb2plY3Rpb246IE51bWJlcihjYW1lcmEucHJvamVjdGlvbiksXHJcbiAgICAgICAgICAgIG9ydGhvSGVpZ2h0LFxyXG4gICAgICAgICAgICBuZWFyOiBOdW1iZXIoY2FtZXJhLm5lYXIpLFxyXG4gICAgICAgICAgICBmYXI6IE51bWJlcihjYW1lcmEuZmFyKSxcclxuICAgICAgICAgICAgZm92OiBOdW1iZXIoY2FtZXJhLmZvdiksXHJcbiAgICAgICAgICAgIGZvdkF4aXM6IE51bWJlcihjYW1lcmEuZm92QXhpcyksXHJcbiAgICAgICAgICAgIGNsZWFyRmxhZ3M6IE51bWJlcihjYW1lcmEuY2xlYXJGbGFncyksXHJcbiAgICAgICAgICAgIGNsZWFyQ29sb3I6IHtcclxuICAgICAgICAgICAgICAgIHI6IE51bWJlcihjb2xvci5yKSxcclxuICAgICAgICAgICAgICAgIGc6IE51bWJlcihjb2xvci5nKSxcclxuICAgICAgICAgICAgICAgIGI6IE51bWJlcihjb2xvci5iKSxcclxuICAgICAgICAgICAgICAgIGE6IE51bWJlcihjb2xvci5hKSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgcG9zaXRpb25aOiBOdW1iZXIoY2FtZXJhLm5vZGU/LndvcmxkUG9zaXRpb24/LnopIHx8IDEwMDAsXHJcbiAgICAgICAgICAgIHNvdXJjZTogJ0JhdHRsZVJvYWRWaWV3LnByZWZhYicsXHJcbiAgICAgICAgfTtcclxuICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgY29uc3QgbWVzc2FnZSA9IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKTtcclxuICAgICAgICBjb25zb2xlLndhcm4oXHJcbiAgICAgICAgICAgIGBbdGFibGVfZGF0YV92aXN1YWxpemVyXVtzY2VuZV0gcnVudGltZSBjYW1lcmEgcHJvZmlsZSBmYWxsYmFjazogJHttZXNzYWdlfWAsXHJcbiAgICAgICAgKTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICB2aWV3cG9ydFdpZHRoOiBGQUxMQkFDS19SVU5USU1FX0NBTUVSQV9XSURUSCxcclxuICAgICAgICAgICAgdmlld3BvcnRIZWlnaHQ6IEZBTExCQUNLX1JVTlRJTUVfQ0FNRVJBX0hFSUdIVCxcclxuICAgICAgICAgICAgcHJvamVjdGlvbjogTnVtYmVyKGNjLkNhbWVyYS5Qcm9qZWN0aW9uVHlwZS5PUlRITyksXHJcbiAgICAgICAgICAgIG9ydGhvSGVpZ2h0OiBGQUxMQkFDS19SVU5USU1FX0NBTUVSQV9PUlRIT19IRUlHSFQsXHJcbiAgICAgICAgICAgIG5lYXI6IDAsXHJcbiAgICAgICAgICAgIGZhcjogMjAwMCxcclxuICAgICAgICAgICAgZm92OiA0NSxcclxuICAgICAgICAgICAgZm92QXhpczogMCxcclxuICAgICAgICAgICAgY2xlYXJGbGFnczogTnVtYmVyKGNjLkNhbWVyYS5DbGVhckZsYWcuU09MSURfQ09MT1IpLFxyXG4gICAgICAgICAgICBjbGVhckNvbG9yOiB7IC4uLkNMRUFSX0NPTE9SIH0sXHJcbiAgICAgICAgICAgIHBvc2l0aW9uWjogMTAwMCxcclxuICAgICAgICAgICAgc291cmNlOiAnZmFsbGJhY2stcnVudGltZS1jYW1lcmEnLFxyXG4gICAgICAgIH07XHJcbiAgICB9IGZpbmFsbHkge1xyXG4gICAgICAgIHJ1bnRpbWVSb290Py5kZXN0cm95Py4oKTtcclxuICAgICAgICBpZiAocHJlZmFiQXNzZXQgJiYgdHlwZW9mIGNjLmFzc2V0TWFuYWdlci5yZWxlYXNlQXNzZXQgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgY2MuYXNzZXRNYW5hZ2VyLnJlbGVhc2VBc3NldChwcmVmYWJBc3NldCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiB3YWl0Rm9yRHJhdygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4ge1xyXG4gICAgICAgIGxldCBzZXR0bGVkID0gZmFsc2U7XHJcbiAgICAgICAgY29uc3QgZG9uZSA9ICgpID0+IHtcclxuICAgICAgICAgICAgaWYgKHNldHRsZWQpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBzZXR0bGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgcmVzb2x2ZSgpO1xyXG4gICAgICAgIH07XHJcbiAgICAgICAgY2MuZGlyZWN0b3Iub25jZShjYy5EaXJlY3Rvci5FVkVOVF9BRlRFUl9EUkFXLCBkb25lKTtcclxuICAgICAgICBzZXRUaW1lb3V0KGRvbmUsIDUwMCk7XHJcbiAgICB9KTtcclxufVxyXG5cclxuZnVuY3Rpb24gcmVxdWVzdEVkaXRvclJlcGFpbnQoKTogdm9pZCB7XHJcbiAgICBjb25zdCBlZGl0b3JFbmdpbmUgPSAoZ2xvYmFsVGhpcyBhcyBhbnkpLmNjZT8uRW5naW5lO1xyXG4gICAgaWYgKHR5cGVvZiBlZGl0b3JFbmdpbmU/LnJlcGFpbnRJbkVkaXRNb2RlID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgZWRpdG9yRW5naW5lLnJlcGFpbnRJbkVkaXRNb2RlKCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHdhaXRGb3JOZXh0VGFzaygpOiBQcm9taXNlPHZvaWQ+IHtcclxuICAgIHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxNikpO1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZW5kZXJFZGl0b3JGcmFtZXMoY291bnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xyXG4gICAgZm9yIChsZXQgZnJhbWUgPSAwOyBmcmFtZSA8IGNvdW50OyBmcmFtZSArPSAxKSB7XHJcbiAgICAgICAgLy8gU3Vic2NyaWJlIGJlZm9yZSByZXF1ZXN0aW5nIHRoZSByZXBhaW50IHNvIGEgZmFzdCBlZGl0b3IgZnJhbWUgY2Fubm90IGJlIG1pc3NlZC5cclxuICAgICAgICBjb25zdCBhZnRlckRyYXcgPSB3YWl0Rm9yRHJhdygpO1xyXG4gICAgICAgIHJlcXVlc3RFZGl0b3JSZXBhaW50KCk7XHJcbiAgICAgICAgYXdhaXQgYWZ0ZXJEcmF3O1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JOZXh0VGFzaygpO1xyXG4gICAgfVxyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiByZW5kZXJQcmV2aWV3RnJhbWVzKFxuICAgIGNhbWVyYTogYW55LFxuICAgIHByZXZpZXdSb290OiBhbnksXG4gICAgcHJldmlld0xheWVyOiBudW1iZXIsXG4gICAgY291bnQ6IG51bWJlcixcbiAgICBiZWZvcmVTdWJtaXQ/OiAoKSA9PiB2b2lkLFxuKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgZm9yIChsZXQgZnJhbWUgPSAwOyBmcmFtZSA8IGNvdW50OyBmcmFtZSArPSAxKSB7XHJcbiAgICAgICAgZHJpdmVQcmV2aWV3RWRpdG9yQ29tcG9uZW50cyhwcmV2aWV3Um9vdCwgcHJldmlld0xheWVyKTtcclxuICAgICAgICBhY3RpdmF0ZVByZXZpZXdIaWVyYXJjaHkocHJldmlld1Jvb3QpO1xuICAgICAgICBwcmV2aWV3Um9vdC51cGRhdGVXb3JsZFRyYW5zZm9ybT8uKCk7XG4gICAgICAgIGJlZm9yZVN1Ym1pdD8uKCk7XG4gICAgICAgIGNjLmRpcmVjdG9yLmVtaXQ/LihjYy5EaXJlY3Rvci5FVkVOVF9CRUZPUkVfRFJBVyk7XG4gICAgICAgIHJlZnJlc2hQcmV2aWV3UmVuZGVyRGF0YShwcmV2aWV3Um9vdCk7XHJcblxyXG4gICAgICAgIC8vIFRoZSBlZGl0LW1vZGUgZGlyZWN0b3Igc3RheXMgaW52YWxpZCB3aGlsZSB0aGUgc2NlbmUgaXMgbm90IHBsYXlpbmcsIHNvIHRpY2soKVxyXG4gICAgICAgIC8vIGV4aXRzIGJlZm9yZSBydW5uaW5nIGVkaXRvciBjb21wb25lbnQgdXBkYXRlcy4gUm9vdC5mcmFtZU1vdmUoKSBhbHNvIHJlYnVpbGRzXHJcbiAgICAgICAgLy8gY2FtZXJhTGlzdCBmcm9tIHJlZ2lzdGVyZWQgcmVuZGVyIHdpbmRvd3MsIGFuZCBhIGNhbWVyYSBjb21wb25lbnQgY3JlYXRlZCBpblxyXG4gICAgICAgIC8vIGVkaXQgbW9kZSBpcyBub3QgYWx3YXlzIGRpc2NvdmVyZWQgdGhlcmUuIFN1Ym1pdCBpdCBiZXR3ZWVuIFJvb3QncyBwcm9jZXNzIGFuZFxyXG4gICAgICAgIC8vIGVuZCBwaGFzZXMgc28gQ3JlYXRvciBzdGlsbCBvd25zIGRldmljZSBhY3F1aXJlLCBiYXRjaGluZywgcmVuZGVyaW5nIGFuZCBwcmVzZW50LlxyXG4gICAgICAgIGNhbWVyYS5fX3RhYmxlRGF0YVZpc3VhbGl6ZXJTdWJtaXRNb2RlID0gc3VibWl0UHJldmlld0NhbWVyYUZyYW1lKGNhbWVyYSk7XHJcbiAgICAgICAgY2MuZGlyZWN0b3IuZW1pdD8uKGNjLkRpcmVjdG9yLkVWRU5UX0FGVEVSX0RSQVcpO1xyXG4gICAgICAgIGF3YWl0IHdhaXRGb3JOZXh0VGFzaygpO1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBiaW5kUHJldmlld0NhbWVyYVRhcmdldChjYW1lcmE6IGFueSk6IHZvaWQge1xyXG4gICAgY29uc3QgbmF0aXZlQ2FtZXJhID0gY2FtZXJhPy5jYW1lcmE7XHJcbiAgICBjb25zdCB0YXJnZXRXaW5kb3cgPSBjYW1lcmE/LnRhcmdldFRleHR1cmU/LndpbmRvdztcclxuICAgIGlmICghbmF0aXZlQ2FtZXJhKSB7XHJcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDcmVhdG9yIGRpZCBub3QgY3JlYXRlIHRoZSBuYXRpdmUgcHJldmlldyBjYW1lcmEuJyk7XHJcbiAgICB9XHJcbiAgICBpZiAoIXRhcmdldFdpbmRvdykge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQ3JlYXRvciBkaWQgbm90IGNyZWF0ZSB0aGUgcHJldmlldyBSZW5kZXJUZXh0dXJlIHdpbmRvdy4nKTtcclxuICAgIH1cclxuXHJcbiAgICBpZiAobmF0aXZlQ2FtZXJhLndpbmRvdyAhPT0gdGFyZ2V0V2luZG93KSB7XHJcbiAgICAgICAgbmF0aXZlQ2FtZXJhLmNoYW5nZVRhcmdldFdpbmRvdz8uKHRhcmdldFdpbmRvdyk7XHJcbiAgICB9XHJcbiAgICBjb25zdCB0YXJnZXRDYW1lcmFzID0gQXJyYXkuaXNBcnJheSh0YXJnZXRXaW5kb3cuY2FtZXJhcylcclxuICAgICAgICA/IHRhcmdldFdpbmRvdy5jYW1lcmFzXHJcbiAgICAgICAgOiB0YXJnZXRXaW5kb3cuX2NhbWVyYXM7XHJcbiAgICBpZiAoQXJyYXkuaXNBcnJheSh0YXJnZXRDYW1lcmFzKSAmJiAhdGFyZ2V0Q2FtZXJhcy5pbmNsdWRlcyhuYXRpdmVDYW1lcmEpKSB7XHJcbiAgICAgICAgdGFyZ2V0V2luZG93LmF0dGFjaENhbWVyYT8uKG5hdGl2ZUNhbWVyYSk7XHJcbiAgICB9XHJcbiAgICBuYXRpdmVDYW1lcmEuZW5hYmxlZCA9IHRydWU7XHJcbiAgICBuYXRpdmVDYW1lcmEudXBkYXRlPy4odHJ1ZSk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHN1Ym1pdFByZXZpZXdDYW1lcmFGcmFtZShjYW1lcmE6IGFueSk6IHN0cmluZyB7XHJcbiAgICBjb25zdCByb290ID0gY2MuZGlyZWN0b3I/LnJvb3QgYXMgYW55O1xyXG4gICAgY29uc3QgbmF0aXZlQ2FtZXJhID0gY2FtZXJhPy5jYW1lcmE7XHJcbiAgICBpZiAoIXJvb3QgfHwgIW5hdGl2ZUNhbWVyYSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQ3JlYXRvciBSb290IG9yIHByZXZpZXcgY2FtZXJhIGlzIHVuYXZhaWxhYmxlLicpO1xyXG4gICAgfVxyXG5cclxuICAgIGJpbmRQcmV2aWV3Q2FtZXJhVGFyZ2V0KGNhbWVyYSk7XHJcbiAgICBpZiAoXHJcbiAgICAgICAgdHlwZW9mIHJvb3QuX2ZyYW1lTW92ZUJlZ2luID09PSAnZnVuY3Rpb24nXHJcbiAgICAgICAgJiYgdHlwZW9mIHJvb3QuX2ZyYW1lTW92ZVByb2Nlc3MgPT09ICdmdW5jdGlvbidcclxuICAgICAgICAmJiB0eXBlb2Ygcm9vdC5fZnJhbWVNb3ZlRW5kID09PSAnZnVuY3Rpb24nXHJcbiAgICApIHtcclxuICAgICAgICByb290Ll9mcmFtZU1vdmVCZWdpbigpO1xyXG4gICAgICAgIHJvb3QuX2ZyYW1lTW92ZVByb2Nlc3MoKTtcclxuICAgICAgICBsZXQgZnJhbWVFbmRBdHRlbXB0ZWQgPSBmYWxzZTtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCBjYW1lcmFMaXN0ID0gQXJyYXkuaXNBcnJheShyb290Ll9jYW1lcmFMaXN0KSA/IHJvb3QuX2NhbWVyYUxpc3QgOiByb290LmNhbWVyYUxpc3Q7XHJcbiAgICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShjYW1lcmFMaXN0KSkge1xyXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDcmVhdG9yIFJvb3QgY2FtZXJhIGxpc3QgaXMgdW5hdmFpbGFibGUuJyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKCFjYW1lcmFMaXN0LmluY2x1ZGVzKG5hdGl2ZUNhbWVyYSkpIHtcclxuICAgICAgICAgICAgICAgIG5hdGl2ZUNhbWVyYS51cGRhdGU/Lih0cnVlKTtcclxuICAgICAgICAgICAgICAgIGNhbWVyYT8udGFyZ2V0VGV4dHVyZT8ud2luZG93Py5leHRyYWN0UmVuZGVyQ2FtZXJhcz8uKGNhbWVyYUxpc3QpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICghY2FtZXJhTGlzdC5pbmNsdWRlcyhuYXRpdmVDYW1lcmEpKSB7XHJcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1ByZXZpZXcgUmVuZGVyV2luZG93IGRpZCBub3QgZXh0cmFjdCBpdHMgY2FtZXJhIGludG8gQ3JlYXRvciBSb290LicpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGZyYW1lRW5kQXR0ZW1wdGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgcm9vdC5fZnJhbWVNb3ZlRW5kKCk7XHJcbiAgICAgICAgICAgIHJldHVybiAncm9vdC13aW5kb3ctY2FtZXJhLWV4dHJhY3Rpb24nO1xyXG4gICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgIGlmICghZnJhbWVFbmRBdHRlbXB0ZWQpIHtcclxuICAgICAgICAgICAgICAgIHJvb3QuX2ZyYW1lTW92ZUVuZCgpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGlmICh0eXBlb2Ygcm9vdC5mcmFtZU1vdmUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICByb290LmZyYW1lTW92ZSgwKTtcclxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShyb290LmNhbWVyYUxpc3QpICYmIHJvb3QuY2FtZXJhTGlzdC5pbmNsdWRlcyhuYXRpdmVDYW1lcmEpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiAncm9vdC1mcmFtZS1tb3ZlJztcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0NyZWF0b3IgUm9vdCBkaWQgbm90IGFjY2VwdCB0aGUgcHJldmlldyBjYW1lcmEgZm9yIHJlbmRlcmluZy4nKTtcclxufVxyXG5cclxuZnVuY3Rpb24gYWN0aXZhdGVQcmV2aWV3Q2FtZXJhKGNhbWVyYTogYW55KTogdm9pZCB7XHJcbiAgICBpZiAoIWNhbWVyYT8uY2FtZXJhKSB7XHJcbiAgICAgICAgaWYgKHR5cGVvZiBjYW1lcmE/Ll9jcmVhdGVDYW1lcmEgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgY2FtZXJhLl9jcmVhdGVDYW1lcmEoKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjYW1lcmE/Lm9uTG9hZD8uKCk7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgY29uc3QgbmF0aXZlQ2FtZXJhID0gY2FtZXJhPy5jYW1lcmE7XHJcbiAgICBpZiAoIW5hdGl2ZUNhbWVyYSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQ3JlYXRvciBkaWQgbm90IGNyZWF0ZSB0aGUgbmF0aXZlIHByZXZpZXcgY2FtZXJhLicpO1xyXG4gICAgfVxyXG4gICAgLy8gVGhlIGVkaXRvciByZW5kZXIgcGlwZWxpbmUgc2VsZWN0cyBpdHMgY2FtZXJhIHNldHRpbmdzIGZyb20gY2FtZXJhVXNhZ2UuXHJcbiAgICAvLyBBIGR5bmFtaWNhbGx5IGNyZWF0ZWQgY2FtZXJhIG90aGVyd2lzZSByZW1haW5zIEVESVRPUiB1c2FnZSBhbmQgY2FuIHN1Ym1pdFxyXG4gICAgLy8gYW4gZW1wdHkgb2Zmc2NyZWVuIHBhc3MgZXZlbiB0aG91Z2ggaXRzIFJlbmRlcldpbmRvdyBhbmQgc2NlbmUgYXJlIHZhbGlkLlxyXG4gICAgbmF0aXZlQ2FtZXJhLmNhbWVyYVVzYWdlID0gUFJFVklFV19DQU1FUkFfVVNBR0U7XHJcbiAgICBpZiAoIW5hdGl2ZUNhbWVyYS5zY2VuZSkge1xyXG4gICAgICAgIGlmICh0eXBlb2YgY2FtZXJhPy5fYXR0YWNoVG9TY2VuZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICBjYW1lcmEuX2F0dGFjaFRvU2NlbmUoKTtcclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICBjYW1lcmE/Lm9uRW5hYmxlPy4oKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbiAgICBpZiAoIW5hdGl2ZUNhbWVyYS5zY2VuZSkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQ3JlYXRvciBkaWQgbm90IGF0dGFjaCB0aGUgcHJldmlldyBjYW1lcmEgdG8gdGhlIFJlbmRlclNjZW5lLicpO1xyXG4gICAgfVxyXG4gICAgbmF0aXZlQ2FtZXJhLmVuYWJsZWQgPSB0cnVlO1xyXG4gICAgYmluZFByZXZpZXdDYW1lcmFUYXJnZXQoY2FtZXJhKTtcclxufVxyXG5cclxuZnVuY3Rpb24gZGVzdHJveVByZXZpZXdDYW1lcmEoY2FtZXJhOiBhbnkpOiB2b2lkIHtcclxuICAgIGlmICghY2FtZXJhKSB7XHJcbiAgICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgdHJ5IHtcclxuICAgICAgICBjYW1lcmEudGFyZ2V0VGV4dHVyZSA9IG51bGw7XHJcbiAgICB9IGNhdGNoIHtcclxuICAgICAgICAvLyBDb250aW51ZSByZWxlYXNpbmcgdGhlIG5hdGl2ZSBjYW1lcmEgZXZlbiBpZiBpdHMgcmVuZGVyIHRhcmdldCBpcyBpbnZhbGlkLlxyXG4gICAgfVxyXG4gICAgdHJ5IHtcclxuICAgICAgICBjYW1lcmEuX2RldGFjaEZyb21TY2VuZT8uKCk7XHJcbiAgICB9IGNhdGNoIHtcclxuICAgICAgICAvLyBUaGUgUmVuZGVyU2NlbmUgbWF5IGFscmVhZHkgaGF2ZSBkZXRhY2hlZCB0aGUgY2FtZXJhIGR1cmluZyBlZGl0b3IgcmVsb2FkLlxyXG4gICAgfVxyXG4gICAgY29uc3QgbmF0aXZlQ2FtZXJhID0gY2FtZXJhLmNhbWVyYTtcclxuICAgIGlmIChuYXRpdmVDYW1lcmEpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBuYXRpdmVDYW1lcmEuZGVzdHJveT8uKCk7XHJcbiAgICAgICAgfSBmaW5hbGx5IHtcclxuICAgICAgICAgICAgLy8gUHJldmVudCB0aGUgY29tcG9uZW50J3MgZGVmZXJyZWQgb25EZXN0cm95IGZyb20gZGVzdHJveWluZyBpdCB0d2ljZS5cclxuICAgICAgICAgICAgY2FtZXJhLl9jYW1lcmEgPSBudWxsO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gaXNTY2VuZUNvbnRlbnRQaXhlbChwaXhlbHM6IFVpbnQ4QXJyYXksIG9mZnNldDogbnVtYmVyKTogYm9vbGVhbiB7XHJcbiAgICBjb25zdCBhbHBoYSA9IHBpeGVsc1tvZmZzZXQgKyAzXTtcclxuICAgIHJldHVybiBhbHBoYSAhPT0gMFxyXG4gICAgICAgICYmIChcclxuICAgICAgICAgICAgTWF0aC5hYnMocGl4ZWxzW29mZnNldF0gLSBDTEVBUl9DT0xPUi5yKSA+IDJcclxuICAgICAgICAgICAgfHwgTWF0aC5hYnMocGl4ZWxzW29mZnNldCArIDFdIC0gQ0xFQVJfQ09MT1IuZykgPiAyXHJcbiAgICAgICAgICAgIHx8IE1hdGguYWJzKHBpeGVsc1tvZmZzZXQgKyAyXSAtIENMRUFSX0NPTE9SLmIpID4gMlxyXG4gICAgICAgICAgICB8fCBhbHBoYSAhPT0gQ0xFQVJfQ09MT1IuYVxyXG4gICAgICAgICk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGhhc1NjZW5lQ29udGVudFBpeGVscyhwaXhlbHM6IFVpbnQ4QXJyYXkpOiBib29sZWFuIHtcclxuICAgIGZvciAobGV0IG9mZnNldCA9IDA7IG9mZnNldCA8IHBpeGVscy5sZW5ndGg7IG9mZnNldCArPSA0KSB7XHJcbiAgICAgICAgaWYgKGlzU2NlbmVDb250ZW50UGl4ZWwocGl4ZWxzLCBvZmZzZXQpKSB7XHJcbiAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiBmYWxzZTtcclxufVxyXG5cclxuZnVuY3Rpb24gY2xhc3NOYW1lT2YoY29tcG9uZW50OiBhbnkpOiBzdHJpbmcge1xyXG4gICAgdHJ5IHtcclxuICAgICAgICByZXR1cm4gU3RyaW5nKGNjLmpzPy5nZXRDbGFzc05hbWUoY29tcG9uZW50KSB8fCBjb21wb25lbnQ/LmNvbnN0cnVjdG9yPy5uYW1lIHx8ICcnKTtcclxuICAgIH0gY2F0Y2gge1xyXG4gICAgICAgIHJldHVybiBTdHJpbmcoY29tcG9uZW50Py5jb25zdHJ1Y3Rvcj8ubmFtZSB8fCAnJyk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGlzU2FmZVJlbmRlckNvbXBvbmVudChjb21wb25lbnQ6IGFueSk6IGJvb2xlYW4ge1xyXG4gICAgY29uc3QgbmFtZSA9IGNsYXNzTmFtZU9mKGNvbXBvbmVudCk7XHJcbiAgICBjb25zdCBzYWZlTmFtZXMgPSBbXHJcbiAgICAgICAgJ2NjLlVJVHJhbnNmb3JtJyxcclxuICAgICAgICAnY2MuU3ByaXRlJyxcclxuICAgICAgICAnY2MuTGFiZWwnLFxyXG4gICAgICAgICdjYy5SaWNoVGV4dCcsXHJcbiAgICAgICAgJ2NjLkdyYXBoaWNzJyxcclxuICAgICAgICAnY2MuTWFzaycsXHJcbiAgICAgICAgJ2NjLlVJT3BhY2l0eScsXHJcbiAgICAgICAgJ2NjLldpZGdldCcsXHJcbiAgICAgICAgJ2NjLkFuaW1hdGlvbicsXHJcbiAgICAgICAgJ2NjLlNrZWxldGFsQW5pbWF0aW9uJyxcclxuICAgICAgICAnY2MuUGFydGljbGVTeXN0ZW0yRCcsXHJcbiAgICAgICAgJ2NjLlJlbmRlclJvb3QyRCcsXHJcbiAgICAgICAgJ2NjLkNhbnZhcycsXHJcbiAgICAgICAgJ3NwLlNrZWxldG9uJyxcclxuICAgICAgICAnY2Muc3AuU2tlbGV0b24nLFxyXG4gICAgICAgICdiYXR0bGUuZWRpdG9yLkVkaXRpbmdQcmVmYWJSZWYnLFxyXG4gICAgXTtcclxuICAgIHJldHVybiBzYWZlTmFtZXMuc29tZSgoc2FmZU5hbWUpID0+IG5hbWUgPT09IHNhZmVOYW1lIHx8IG5hbWUuZW5kc1dpdGgoc2FmZU5hbWUpKVxyXG4gICAgICAgIHx8IG5hbWUuZW5kc1dpdGgoJ0VkaXRpbmdQcmVmYWJSZWYnKTtcclxufVxyXG5cclxuZnVuY3Rpb24gc2VsZWN0SXNvbGF0ZWRQcmV2aWV3TGF5ZXIoc2NlbmU6IGFueSk6IG51bWJlciB7XHJcbiAgICBsZXQgdXNlZExheWVycyA9IDA7XHJcbiAgICBzY2VuZT8ud2Fsaz8uKChub2RlOiBhbnkpID0+IHtcclxuICAgICAgICB1c2VkTGF5ZXJzID0gKHVzZWRMYXllcnMgfCAoTnVtYmVyKG5vZGU/LmxheWVyKSB8fCAwKSkgPj4+IDA7XHJcbiAgICB9KTtcclxuICAgIGZvciAobGV0IGJpdCA9IE1BWF9VU0VSX0xBWUVSX0JJVDsgYml0ID49IDA7IGJpdCAtPSAxKSB7XHJcbiAgICAgICAgY29uc3QgY2FuZGlkYXRlID0gKDEgPDwgYml0KSA+Pj4gMDtcclxuICAgICAgICBpZiAoKHVzZWRMYXllcnMgJiBjYW5kaWRhdGUpID09PSAwKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBjYW5kaWRhdGU7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyB1bnVzZWQgQ3JlYXRvciB1c2VyIGxheWVyIGlzIGF2YWlsYWJsZSBmb3IgdGhlIGlzb2xhdGVkIHNjZW5lIHByZXZpZXcuJyk7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHByZXBhcmVQcmVmYWJGb3JQcmV2aWV3KHJvb3Q6IGFueSwgcHJldmlld0xheWVyOiBudW1iZXIsIGRlYWN0aXZhdGVSb290ID0gdHJ1ZSk6IG51bWJlciB7XHJcbiAgICBpZiAoZGVhY3RpdmF0ZVJvb3QpIHtcclxuICAgICAgICByb290LmFjdGl2ZSA9IGZhbHNlO1xyXG4gICAgfVxyXG4gICAgcm9vdC5fX3RhYmxlRGF0YVZpc3VhbGl6ZXJQcmV2aWV3TGF5ZXIgPSBwcmV2aWV3TGF5ZXI7XHJcbiAgICByb290LndhbGsoKG5vZGU6IGFueSkgPT4ge1xuICAgICAgICBub2RlLmxheWVyID0gcHJldmlld0xheWVyO1xuICAgICAgICBpZiAoL15ib3VuZGFyeS1cXGQrJC8udGVzdChTdHJpbmcobm9kZS5uYW1lIHx8ICcnKSkpIG5vZGUuYWN0aXZlID0gZmFsc2U7XG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSB0eXBlb2Ygbm9kZS5nZXRDb21wb25lbnRzID09PSAnZnVuY3Rpb24nID8gbm9kZS5nZXRDb21wb25lbnRzKGNjLkNvbXBvbmVudCkgOiBbXTtcbiAgICAgICAgY29tcG9uZW50cy5mb3JFYWNoKChjb21wb25lbnQ6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGNvbXBvbmVudC5lbmFibGVkID09PSAnYm9vbGVhbicgJiYgIWlzU2FmZVJlbmRlckNvbXBvbmVudChjb21wb25lbnQpKSB7XHJcbiAgICAgICAgICAgICAgICBjb21wb25lbnQuZW5hYmxlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9KTtcclxuICAgIGlmICghcm9vdC5nZXRDb21wb25lbnQ/LihjYy5SZW5kZXJSb290MkQpKSB7XHJcbiAgICAgICAgcm9vdC5hZGRDb21wb25lbnQoY2MuUmVuZGVyUm9vdDJEKTtcclxuICAgIH1cclxuICAgIHJldHVybiBwcmV2aWV3TGF5ZXI7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGFjdGl2YXRlUHJldmlld0hpZXJhcmNoeShyb290OiBhbnkpOiB7XHJcbiAgICBhY3RpdmF0ZWRDb21wb25lbnRzOiBudW1iZXI7XHJcbiAgICByZWdpc3RlcmVkUmVuZGVyUm9vdHM6IG51bWJlcjtcclxufSB7XHJcbiAgICBjb25zdCBub2RlQWN0aXZhdG9yID0gY2MuZGlyZWN0b3I/Ll9ub2RlQWN0aXZhdG9yIGFzIGFueTtcclxuICAgIGNvbnN0IGJhdGNoZXIgPSBjYy5kaXJlY3Rvcj8ucm9vdD8uYmF0Y2hlcjJEIGFzIGFueTtcclxuICAgIGxldCBhY3RpdmF0ZWRDb21wb25lbnRzID0gMDtcclxuICAgIGxldCByZWdpc3RlcmVkUmVuZGVyUm9vdHMgPSAwO1xyXG4gICAgcm9vdD8ud2Fsaz8uKChub2RlOiBhbnkpID0+IHtcclxuICAgICAgICBpZiAoIW5vZGU/LmFjdGl2ZUluSGllcmFyY2h5KSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgY29tcG9uZW50cyA9IHR5cGVvZiBub2RlLmdldENvbXBvbmVudHMgPT09ICdmdW5jdGlvbicgPyBub2RlLmdldENvbXBvbmVudHMoY2MuQ29tcG9uZW50KSA6IFtdO1xyXG4gICAgICAgIGNvbXBvbmVudHMuZm9yRWFjaCgoY29tcG9uZW50OiBhbnkpID0+IHtcclxuICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgY29tcG9uZW50Py5lbmFibGVkID09PSBmYWxzZVxyXG4gICAgICAgICAgICAgICAgfHwgIWlzU2FmZVJlbmRlckNvbXBvbmVudChjb21wb25lbnQpXHJcbiAgICAgICAgICAgICkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygbm9kZUFjdGl2YXRvcj8uYWN0aXZhdGVDb21wID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICBub2RlQWN0aXZhdG9yLmFjdGl2YXRlQ29tcChjb21wb25lbnQpO1xyXG4gICAgICAgICAgICAgICAgYWN0aXZhdGVkQ29tcG9uZW50cyArPSAxO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICghY2xhc3NOYW1lT2YoY29tcG9uZW50KS5lbmRzV2l0aCgnUmVuZGVyUm9vdDJEJykpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBjb25zdCBzY3JlZW5zID0gQXJyYXkuaXNBcnJheShiYXRjaGVyPy5fc2NyZWVucykgPyBiYXRjaGVyLl9zY3JlZW5zIDogYmF0Y2hlcj8uc2NyZWVucztcclxuICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgQXJyYXkuaXNBcnJheShzY3JlZW5zKVxyXG4gICAgICAgICAgICAgICAgJiYgIXNjcmVlbnMuaW5jbHVkZXMoY29tcG9uZW50KVxyXG4gICAgICAgICAgICAgICAgJiYgdHlwZW9mIGJhdGNoZXI/LmFkZFNjcmVlbiA9PT0gJ2Z1bmN0aW9uJ1xyXG4gICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgIGJhdGNoZXIuYWRkU2NyZWVuKGNvbXBvbmVudCk7XHJcbiAgICAgICAgICAgICAgICByZWdpc3RlcmVkUmVuZGVyUm9vdHMgKz0gMTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfSk7XHJcbiAgICByZXR1cm4geyBhY3RpdmF0ZWRDb21wb25lbnRzLCByZWdpc3RlcmVkUmVuZGVyUm9vdHMgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gY29sbGVjdFJlbmRlckRpYWdub3N0aWNzKHJvb3Q6IGFueSwgY2FtZXJhOiBhbnksIGJvdW5kczogUmVjdExpa2UsIHRleHR1cmVTaXplOiB7IHdpZHRoOiBudW1iZXI7IGhlaWdodDogbnVtYmVyIH0pOiBhbnkge1xyXG4gICAgY29uc3QgZGlhZ25vc3RpY3MgPSB7XHJcbiAgICAgICAgYWN0aXZlTm9kZXM6IDAsXHJcbiAgICAgICAgZW5hYmxlZFJlbmRlckNvbXBvbmVudHM6IDAsXHJcbiAgICAgICAgc3ByaXRlczogMCxcclxuICAgICAgICBzcHJpdGVzV2l0aEZyYW1lOiAwLFxyXG4gICAgICAgIHNrZWxldG9uczogMCxcclxuICAgICAgICByZW5kZXJSb290czogMCxcclxuICAgICAgICBsYXllcnM6IFtdIGFzIG51bWJlcltdLFxyXG4gICAgICAgIGJvdW5kcyxcclxuICAgICAgICB0ZXh0dXJlU2l6ZSxcclxuICAgICAgICBjYW1lcmFWaXNpYmlsaXR5OiBOdW1iZXIoY2FtZXJhPy52aXNpYmlsaXR5KSA+Pj4gMCxcclxuICAgICAgICBjYW1lcmFFbmFibGVkOiBCb29sZWFuKGNhbWVyYT8uZW5hYmxlZEluSGllcmFyY2h5ID8/IGNhbWVyYT8uZW5hYmxlZCksXHJcbiAgICAgICAgY2FtZXJhVGFyZ2V0U2l6ZToge1xyXG4gICAgICAgICAgICB3aWR0aDogTnVtYmVyKGNhbWVyYT8udGFyZ2V0VGV4dHVyZT8ud2lkdGgpIHx8IDAsXHJcbiAgICAgICAgICAgIGhlaWdodDogTnVtYmVyKGNhbWVyYT8udGFyZ2V0VGV4dHVyZT8uaGVpZ2h0KSB8fCAwLFxyXG4gICAgICAgIH0sXHJcbiAgICAgICAgcm9vdENhbWVyYUNvdW50OiBOdW1iZXIoY2MuZGlyZWN0b3I/LnJvb3Q/LmNhbWVyYUxpc3Q/Lmxlbmd0aCkgfHwgMCxcclxuICAgICAgICB0YXJnZXRDYW1lcmFSZWdpc3RlcmVkOiBCb29sZWFuKFxyXG4gICAgICAgICAgICBjYW1lcmE/LmNhbWVyYVxyXG4gICAgICAgICAgICAmJiBjYy5kaXJlY3Rvcj8ucm9vdD8uY2FtZXJhTGlzdD8uaW5jbHVkZXM/LihjYW1lcmEuY2FtZXJhKSxcclxuICAgICAgICApLFxyXG4gICAgICAgIHRhcmdldFdpbmRvd1JlZ2lzdGVyZWQ6IEJvb2xlYW4oXHJcbiAgICAgICAgICAgIGNhbWVyYT8udGFyZ2V0VGV4dHVyZT8ud2luZG93XHJcbiAgICAgICAgICAgICYmIChcclxuICAgICAgICAgICAgICAgIGNjLmRpcmVjdG9yPy5yb290Py5fd2luZG93cz8uaW5jbHVkZXM/LihjYW1lcmEudGFyZ2V0VGV4dHVyZS53aW5kb3cpXHJcbiAgICAgICAgICAgICAgICB8fCBjYy5kaXJlY3Rvcj8ucm9vdD8ud2luZG93cz8uaW5jbHVkZXM/LihjYW1lcmEudGFyZ2V0VGV4dHVyZS53aW5kb3cpXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICApLFxyXG4gICAgICAgIHRhcmdldFdpbmRvd0NhbWVyYUNvdW50OiBOdW1iZXIoXHJcbiAgICAgICAgICAgIGNhbWVyYT8udGFyZ2V0VGV4dHVyZT8ud2luZG93Py5jYW1lcmFzPy5sZW5ndGhcclxuICAgICAgICAgICAgPz8gY2FtZXJhPy50YXJnZXRUZXh0dXJlPy53aW5kb3c/Ll9jYW1lcmFzPy5sZW5ndGhcclxuICAgICAgICAgICAgPz8gMCxcclxuICAgICAgICApLFxyXG4gICAgICAgIG5hdGl2ZUNhbWVyYVRhcmdldHNUZXh0dXJlOiBCb29sZWFuKFxyXG4gICAgICAgICAgICBjYW1lcmE/LmNhbWVyYT8ud2luZG93XHJcbiAgICAgICAgICAgICYmIGNhbWVyYS5jYW1lcmEud2luZG93ID09PSBjYW1lcmE/LnRhcmdldFRleHR1cmU/LndpbmRvdyxcclxuICAgICAgICApLFxyXG4gICAgICAgIG5hdGl2ZUNhbWVyYVVzYWdlOiBOdW1iZXIoY2FtZXJhPy5jYW1lcmE/LmNhbWVyYVVzYWdlKSxcclxuICAgICAgICBjYW1lcmFJbkVkaXRvck1vZGU6IEJvb2xlYW4oY2FtZXJhPy5pbkVkaXRvck1vZGUpLFxyXG4gICAgICAgIHJlbmRlclN1Ym1pc3Npb25Nb2RlOiBTdHJpbmcoY2FtZXJhPy5fX3RhYmxlRGF0YVZpc3VhbGl6ZXJTdWJtaXRNb2RlIHx8ICcnKSxcclxuICAgICAgICBwcmV2aWV3TGF5ZXI6IE51bWJlcihyb290Py5fX3RhYmxlRGF0YVZpc3VhbGl6ZXJQcmV2aWV3TGF5ZXIpID4+PiAwLFxyXG4gICAgICAgIGJhdGNoZXJTY3JlZW5Db3VudDogTnVtYmVyKFxyXG4gICAgICAgICAgICBjYy5kaXJlY3Rvcj8ucm9vdD8uYmF0Y2hlcjJEPy5fc2NyZWVucz8ubGVuZ3RoXHJcbiAgICAgICAgICAgID8/IGNjLmRpcmVjdG9yPy5yb290Py5iYXRjaGVyMkQ/LnNjcmVlbnM/Lmxlbmd0aFxyXG4gICAgICAgICAgICA/PyAwLFxyXG4gICAgICAgICksXHJcbiAgICAgICAgcmVnaXN0ZXJlZFByZXZpZXdSZW5kZXJSb290czogMCxcclxuICAgICAgICBkaXJlY3RvckludmFsaWQ6IEJvb2xlYW4oY2MuZGlyZWN0b3I/Ll9pbnZhbGlkKSxcclxuICAgICAgICBkaXJlY3RvclBhdXNlZDogQm9vbGVhbihjYy5kaXJlY3Rvcj8uX3BhdXNlZCksXHJcbiAgICAgICAgZWRpdG9yQ29tcG9uZW50czogbnVsbCBhcyBhbnksXHJcbiAgICAgICAgcmVmcmVzaGVkUmVuZGVyZXJzOiAwLFxyXG4gICAgICAgIHJlbmRlcmVyVmVyc2lvbjogU0NFTkVfUFJFVklFV19SRU5ERVJFUl9WRVJTSU9OLFxyXG4gICAgfTtcclxuICAgIGNvbnN0IGxheWVycyA9IG5ldyBTZXQ8bnVtYmVyPigpO1xyXG4gICAgcm9vdC53YWxrKChub2RlOiBhbnkpID0+IHtcclxuICAgICAgICBpZiAoIW5vZGU/LmFjdGl2ZUluSGllcmFyY2h5KSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgZGlhZ25vc3RpY3MuYWN0aXZlTm9kZXMgKz0gMTtcclxuICAgICAgICBjb25zdCBsYXllciA9IE51bWJlcihub2RlLmxheWVyKSA+Pj4gMDtcclxuICAgICAgICBpZiAobGF5ZXIpIHtcclxuICAgICAgICAgICAgbGF5ZXJzLmFkZChsYXllcik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSB0eXBlb2Ygbm9kZS5nZXRDb21wb25lbnRzID09PSAnZnVuY3Rpb24nID8gbm9kZS5nZXRDb21wb25lbnRzKGNjLkNvbXBvbmVudCkgOiBbXTtcclxuICAgICAgICBjb21wb25lbnRzLmZvckVhY2goKGNvbXBvbmVudDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChjb21wb25lbnQ/LmVuYWJsZWRJbkhpZXJhcmNoeSA9PT0gZmFsc2UgfHwgY29tcG9uZW50Py5lbmFibGVkID09PSBmYWxzZSkge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGNvbnN0IG5hbWUgPSBjbGFzc05hbWVPZihjb21wb25lbnQpO1xyXG4gICAgICAgICAgICBpZiAobmFtZS5lbmRzV2l0aCgnU3ByaXRlJykpIHtcclxuICAgICAgICAgICAgICAgIGRpYWdub3N0aWNzLnNwcml0ZXMgKz0gMTtcclxuICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnQuc3ByaXRlRnJhbWUpIHtcclxuICAgICAgICAgICAgICAgICAgICBkaWFnbm9zdGljcy5zcHJpdGVzV2l0aEZyYW1lICs9IDE7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKG5hbWUuZW5kc1dpdGgoJ1NrZWxldG9uJykpIHtcclxuICAgICAgICAgICAgICAgIGRpYWdub3N0aWNzLnNrZWxldG9ucyArPSAxO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmIChuYW1lLmVuZHNXaXRoKCdSZW5kZXJSb290MkQnKSkge1xyXG4gICAgICAgICAgICAgICAgZGlhZ25vc3RpY3MucmVuZGVyUm9vdHMgKz0gMTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHNjcmVlbnMgPSBjYy5kaXJlY3Rvcj8ucm9vdD8uYmF0Y2hlcjJEPy5fc2NyZWVuc1xyXG4gICAgICAgICAgICAgICAgICAgID8/IGNjLmRpcmVjdG9yPy5yb290Py5iYXRjaGVyMkQ/LnNjcmVlbnM7XHJcbiAgICAgICAgICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShzY3JlZW5zKSAmJiBzY3JlZW5zLmluY2x1ZGVzKGNvbXBvbmVudCkpIHtcclxuICAgICAgICAgICAgICAgICAgICBkaWFnbm9zdGljcy5yZWdpc3RlcmVkUHJldmlld1JlbmRlclJvb3RzICs9IDE7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgaWYgKFxyXG4gICAgICAgICAgICAgICAgbmFtZS5lbmRzV2l0aCgnU3ByaXRlJylcclxuICAgICAgICAgICAgICAgIHx8IG5hbWUuZW5kc1dpdGgoJ0xhYmVsJylcclxuICAgICAgICAgICAgICAgIHx8IG5hbWUuZW5kc1dpdGgoJ1JpY2hUZXh0JylcclxuICAgICAgICAgICAgICAgIHx8IG5hbWUuZW5kc1dpdGgoJ0dyYXBoaWNzJylcclxuICAgICAgICAgICAgICAgIHx8IG5hbWUuZW5kc1dpdGgoJ1NrZWxldG9uJylcclxuICAgICAgICAgICAgICAgIHx8IG5hbWUuZW5kc1dpdGgoJ1BhcnRpY2xlU3lzdGVtMkQnKVxyXG4gICAgICAgICAgICApIHtcclxuICAgICAgICAgICAgICAgIGRpYWdub3N0aWNzLmVuYWJsZWRSZW5kZXJDb21wb25lbnRzICs9IDE7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH0pO1xyXG4gICAgZGlhZ25vc3RpY3MubGF5ZXJzID0gWy4uLmxheWVyc10uc29ydCgobGVmdCwgcmlnaHQpID0+IGxlZnQgLSByaWdodCk7XHJcbiAgICBkaWFnbm9zdGljcy5lZGl0b3JDb21wb25lbnRzID0gZHJpdmVQcmV2aWV3RWRpdG9yQ29tcG9uZW50cyhcclxuICAgICAgICByb290LFxyXG4gICAgICAgIE51bWJlcihyb290Py5fX3RhYmxlRGF0YVZpc3VhbGl6ZXJQcmV2aWV3TGF5ZXIpID4+PiAwLFxyXG4gICAgKTtcclxuICAgIGRpYWdub3N0aWNzLnJlZnJlc2hlZFJlbmRlcmVycyA9IHJlZnJlc2hQcmV2aWV3UmVuZGVyRGF0YShyb290KTtcclxuICAgIHJldHVybiBkaWFnbm9zdGljcztcclxufVxyXG5cclxuZnVuY3Rpb24gY29sbGVjdEVkaXRpbmdQcmVmYWJSZWZzKHJvb3Q6IGFueSk6IGFueVtdIHtcclxuICAgIGNvbnN0IHJlZnM6IGFueVtdID0gW107XHJcbiAgICByb290LndhbGsoKG5vZGU6IGFueSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSB0eXBlb2Ygbm9kZS5nZXRDb21wb25lbnRzID09PSAnZnVuY3Rpb24nID8gbm9kZS5nZXRDb21wb25lbnRzKGNjLkNvbXBvbmVudCkgOiBbXTtcclxuICAgICAgICBjb21wb25lbnRzLmZvckVhY2goKGNvbXBvbmVudDogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGlmIChjbGFzc05hbWVPZihjb21wb25lbnQpLmVuZHNXaXRoKCdFZGl0aW5nUHJlZmFiUmVmJykpIHtcclxuICAgICAgICAgICAgICAgIHJlZnMucHVzaChjb21wb25lbnQpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9KTtcclxuICAgIHJldHVybiByZWZzO1xyXG59XHJcblxyXG5mdW5jdGlvbiBkcml2ZVByZXZpZXdFZGl0b3JDb21wb25lbnRzKHJvb3Q6IGFueSwgcHJldmlld0xheWVyOiBudW1iZXIpOiB7XHJcbiAgICBlZGl0aW5nUHJlZmFiUmVmczogbnVtYmVyO1xyXG4gICAgaW5zdGFudGlhdGVkUHJlZmFiUmVmczogbnVtYmVyO1xyXG4gICAgbG9hZGluZ1ByZWZhYlJlZnM6IG51bWJlcjtcclxufSB7XHJcbiAgICBsZXQgZWRpdGluZ1ByZWZhYlJlZnMgPSAwO1xyXG4gICAgbGV0IGluc3RhbnRpYXRlZFByZWZhYlJlZnMgPSAwO1xyXG4gICAgbGV0IGxvYWRpbmdQcmVmYWJSZWZzID0gMDtcclxuXHJcbiAgICAvLyBBIG5ld2x5IGluc3RhbnRpYXRlZCBuZXN0ZWQgcHJlZmFiIGNhbiBjb250YWluIG1vcmUgRWRpdGluZ1ByZWZhYlJlZiBjb21wb25lbnRzLlxyXG4gICAgLy8gUmVwZWF0IGEgZmV3IHBhc3NlcyBzbyB0aGUgY29tcGxldGUgaGllcmFyY2h5IGlzIGRpc2NvdmVyZWQgd2l0aG91dCB0aWNraW5nIHRoZVxyXG4gICAgLy8gZWRpdG9yJ3MgdW5yZWxhdGVkIHNjZW5lIGNvbXBvbmVudHMuXHJcbiAgICBmb3IgKGxldCBwYXNzID0gMDsgcGFzcyA8IDg7IHBhc3MgKz0gMSkge1xyXG4gICAgICAgIGNvbnN0IHJlZnMgPSBjb2xsZWN0RWRpdGluZ1ByZWZhYlJlZnMocm9vdCk7XHJcbiAgICAgICAgY29uc3QgY291bnRCZWZvcmUgPSByZWZzLmxlbmd0aDtcclxuICAgICAgICByZWZzLmZvckVhY2goKGNvbXBvbmVudDogYW55KSA9PiB7XG4gICAgICAgICAgICBlZGl0aW5nUHJlZmFiUmVmcyArPSAxO1xyXG4gICAgICAgICAgICBjb25zdCBwcmVmYWJSZWYgPSBjb21wb25lbnQ/LnByZWZhYlJlZjtcclxuICAgICAgICAgICAgY29uc3QgdXVpZCA9IFN0cmluZyhwcmVmYWJSZWY/Ll9hc3NldFVVSUQgfHwgJycpLnRyaW0oKTtcclxuICAgICAgICAgICAgaWYgKHV1aWQgJiYgIXByZWZhYlJlZj8uX2Fzc2V0SW5zdGFuY2UkJCAmJiAhcHJlZmFiUmVmPy5fbG9hZGluZyQkKSB7XHJcbiAgICAgICAgICAgICAgICBwcmVmYWJSZWY/LmxvYWRJbkVkaXRvciQkPy4oKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAvLyBUaGUgc291cmNlIGNvbXBvbmVudCBjYW4gcGVyc2lzdCBzaG93QUFCQj10cnVlLiBJbiBlZGl0b3IgbW9kZSB0aGF0XG4gICAgICAgICAgICAvLyBkcmF3cyBhIGdyZWVuIEdyYXBoaWNzIHJlY3RhbmdsZSBpbnRvIHRoZSBwcmV2aWV3IGltYWdlIGl0c2VsZi5cbiAgICAgICAgICAgIC8vIERlYnVnIHJhbmdlcyBhcmUgcmVuZGVyZWQgYnkgdGhlIHBhbmVsLCBzbyBzdXBwcmVzcyBpdCBvbiB0aGUgY2xvbmUuXG4gICAgICAgICAgICBpZiAoJ3Nob3dBQUJCJyBpbiBjb21wb25lbnQpIGNvbXBvbmVudC5zaG93QUFCQiA9IGZhbHNlO1xuICAgICAgICAgICAgY29tcG9uZW50Py51cGRhdGU/LigwKTtcbiAgICAgICAgICAgIGNvbXBvbmVudD8uX2dyYXBoaWNzPy5jbGVhcj8uKCk7XG4gICAgICAgICAgICBjb21wb25lbnQ/Lm5vZGU/LmdldENvbXBvbmVudD8uKGNjLkdyYXBoaWNzKT8uY2xlYXI/LigpO1xuICAgICAgICAgICAgaWYgKGNvbXBvbmVudD8uX2luc3RhbmNlKSB7XHJcbiAgICAgICAgICAgICAgICBpbnN0YW50aWF0ZWRQcmVmYWJSZWZzICs9IDE7XHJcbiAgICAgICAgICAgICAgICBwcmVwYXJlUHJlZmFiRm9yUHJldmlldyhjb21wb25lbnQuX2luc3RhbmNlLCBwcmV2aWV3TGF5ZXIsIGZhbHNlKTtcclxuICAgICAgICAgICAgICAgIGFjdGl2YXRlUHJldmlld0hpZXJhcmNoeShjb21wb25lbnQuX2luc3RhbmNlKTtcclxuICAgICAgICAgICAgICAgIGNvbXBvbmVudC5faW5zdGFuY2UudXBkYXRlV29ybGRUcmFuc2Zvcm0/LigpO1xyXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHV1aWQpIHtcclxuICAgICAgICAgICAgICAgIGxvYWRpbmdQcmVmYWJSZWZzICs9IDE7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgICAgICBpZiAoY29sbGVjdEVkaXRpbmdQcmVmYWJSZWZzKHJvb3QpLmxlbmd0aCA9PT0gY291bnRCZWZvcmUpIHtcclxuICAgICAgICAgICAgYnJlYWs7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHJldHVybiB7XHJcbiAgICAgICAgZWRpdGluZ1ByZWZhYlJlZnMsXHJcbiAgICAgICAgaW5zdGFudGlhdGVkUHJlZmFiUmVmcyxcclxuICAgICAgICBsb2FkaW5nUHJlZmFiUmVmcyxcclxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlZnJlc2hQcmV2aWV3UmVuZGVyRGF0YShyb290OiBhbnkpOiBudW1iZXIge1xyXG4gICAgbGV0IHJlZnJlc2hlZCA9IDA7XHJcbiAgICByb290LndhbGsoKG5vZGU6IGFueSkgPT4ge1xyXG4gICAgICAgIGlmICghbm9kZT8uYWN0aXZlSW5IaWVyYXJjaHkpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBub2RlLnVwZGF0ZVdvcmxkVHJhbnNmb3JtPy4oKTtcclxuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gdHlwZW9mIG5vZGUuZ2V0Q29tcG9uZW50cyA9PT0gJ2Z1bmN0aW9uJyA/IG5vZGUuZ2V0Q29tcG9uZW50cyhjYy5Db21wb25lbnQpIDogW107XHJcbiAgICAgICAgY29tcG9uZW50cy5mb3JFYWNoKChjb21wb25lbnQ6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoY29tcG9uZW50Py5lbmFibGVkSW5IaWVyYXJjaHkgPT09IGZhbHNlIHx8IGNvbXBvbmVudD8uZW5hYmxlZCA9PT0gZmFsc2UpIHtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICBpZiAodHlwZW9mIGNvbXBvbmVudC5tYXJrRm9yVXBkYXRlUmVuZGVyRGF0YSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgY29tcG9uZW50Lm1hcmtGb3JVcGRhdGVSZW5kZXJEYXRhKHRydWUpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY29tcG9uZW50LnVwZGF0ZVJlbmRlcmVyID09PSAnZnVuY3Rpb24nKSB7XHJcbiAgICAgICAgICAgICAgICBjb21wb25lbnQudXBkYXRlUmVuZGVyZXIoKTtcclxuICAgICAgICAgICAgICAgIHJlZnJlc2hlZCArPSAxO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSk7XHJcbiAgICB9KTtcclxuICAgIHJldHVybiByZWZyZXNoZWQ7XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JOZXN0ZWRQcmVmYWJSZWZzKHJvb3Q6IGFueSwgcHJldmlld0xheWVyOiBudW1iZXIpOiBQcm9taXNlPG51bWJlcj4ge1xyXG4gICAgY29uc3Qgc3RhcnRlZEF0ID0gRGF0ZS5ub3coKTtcclxuICAgIGxldCBleHBlY3RlZENvdW50ID0gMDtcclxuICAgIHdoaWxlIChEYXRlLm5vdygpIC0gc3RhcnRlZEF0IDwgTkVTVEVEX1BSRUZBQl9MT0FEX1RJTUVPVVRfTVMpIHtcclxuICAgICAgICBkcml2ZVByZXZpZXdFZGl0b3JDb21wb25lbnRzKHJvb3QsIHByZXZpZXdMYXllcik7XHJcbiAgICAgICAgYXdhaXQgcmVuZGVyRWRpdG9yRnJhbWVzKDEpO1xyXG4gICAgICAgIGRyaXZlUHJldmlld0VkaXRvckNvbXBvbmVudHMocm9vdCwgcHJldmlld0xheWVyKTtcclxuICAgICAgICBjb25zdCByZWZzID0gY29sbGVjdEVkaXRpbmdQcmVmYWJSZWZzKHJvb3QpO1xyXG4gICAgICAgIGV4cGVjdGVkQ291bnQgPSBNYXRoLm1heChleHBlY3RlZENvdW50LCByZWZzLmxlbmd0aCk7XHJcbiAgICAgICAgY29uc3QgcGVuZGluZyA9IHJlZnMuZmlsdGVyKChjb21wb25lbnQ6IGFueSkgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCB1dWlkID0gU3RyaW5nKGNvbXBvbmVudD8ucHJlZmFiUmVmPy5fYXNzZXRVVUlEIHx8ICcnKS50cmltKCk7XHJcbiAgICAgICAgICAgIHJldHVybiB1dWlkICYmICFjb21wb25lbnQ/Ll9pbnN0YW5jZTtcclxuICAgICAgICB9KTtcclxuICAgICAgICBpZiAoIXBlbmRpbmcubGVuZ3RoKSB7XHJcbiAgICAgICAgICAgIHJldHVybiBleHBlY3RlZENvdW50O1xyXG4gICAgICAgIH1cclxuICAgICAgICBhd2FpdCBuZXcgUHJvbWlzZSgocmVzb2x2ZSkgPT4gc2V0VGltZW91dChyZXNvbHZlLCA1MCkpO1xyXG4gICAgfVxyXG4gICAgY29uc3QgdW5yZXNvbHZlZCA9IGNvbGxlY3RFZGl0aW5nUHJlZmFiUmVmcyhyb290KVxyXG4gICAgICAgIC5maWx0ZXIoKGNvbXBvbmVudDogYW55KSA9PiBTdHJpbmcoY29tcG9uZW50Py5wcmVmYWJSZWY/Ll9hc3NldFVVSUQgfHwgJycpLnRyaW0oKSAmJiAhY29tcG9uZW50Py5faW5zdGFuY2UpXHJcbiAgICAgICAgLmxlbmd0aDtcclxuICAgIHRocm93IG5ldyBFcnJvcihgVGltZWQgb3V0IHdoaWxlIGxvYWRpbmcgJHt1bnJlc29sdmVkfS8ke2V4cGVjdGVkQ291bnR9IG5lc3RlZCBzY2VuZSBwcmVmYWJzLmApO1xyXG59XHJcblxyXG5mdW5jdGlvbiBzaG91bGRNZWFzdXJlTm9kZShub2RlOiBhbnkpOiBib29sZWFuIHtcclxuICAgIGlmICghbm9kZT8uYWN0aXZlSW5IaWVyYXJjaHkpIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICB9XHJcbiAgICBjb25zdCBsb3dlck5hbWUgPSBTdHJpbmcobm9kZS5uYW1lIHx8ICcnKS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgaWYgKFxyXG4gICAgICAgIGxvd2VyTmFtZS5pbmNsdWRlcygnYm91bmRhcnknKVxyXG4gICAgICAgIHx8IGxvd2VyTmFtZS5pbmNsdWRlcygnY29sbGlkZXInKVxyXG4gICAgICAgIHx8IGxvd2VyTmFtZS5pbmNsdWRlcygncG9zaXRpb24nKVxyXG4gICAgICAgIHx8IGxvd2VyTmFtZS5pbmNsdWRlcygndmlld3BvcnQnKVxyXG4gICAgICAgIHx8IGxvd2VyTmFtZS5pbmNsdWRlcygnaGVscGVyJylcclxuICAgICkge1xyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH1cclxuICAgIGNvbnN0IGNvbXBvbmVudHMgPSB0eXBlb2Ygbm9kZS5nZXRDb21wb25lbnRzID09PSAnZnVuY3Rpb24nID8gbm9kZS5nZXRDb21wb25lbnRzKGNjLkNvbXBvbmVudCkgOiBbXTtcclxuICAgIHJldHVybiBjb21wb25lbnRzLnNvbWUoaXNTYWZlUmVuZGVyQ29tcG9uZW50KTtcclxufVxyXG5cclxuZnVuY3Rpb24gdW5pb25SZWN0KGN1cnJlbnQ6IFJlY3RMaWtlIHwgbnVsbCwgbmV4dDogUmVjdExpa2UpOiBSZWN0TGlrZSB7XHJcbiAgICBpZiAoIWN1cnJlbnQpIHtcclxuICAgICAgICByZXR1cm4geyAuLi5uZXh0IH07XHJcbiAgICB9XHJcbiAgICBjb25zdCBtaW5YID0gTWF0aC5taW4oY3VycmVudC54LCBuZXh0LngpO1xyXG4gICAgY29uc3QgbWluWSA9IE1hdGgubWluKGN1cnJlbnQueSwgbmV4dC55KTtcclxuICAgIGNvbnN0IG1heFggPSBNYXRoLm1heChjdXJyZW50LnggKyBjdXJyZW50LndpZHRoLCBuZXh0LnggKyBuZXh0LndpZHRoKTtcclxuICAgIGNvbnN0IG1heFkgPSBNYXRoLm1heChjdXJyZW50LnkgKyBjdXJyZW50LmhlaWdodCwgbmV4dC55ICsgbmV4dC5oZWlnaHQpO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB4OiBtaW5YLFxyXG4gICAgICAgIHk6IG1pblksXHJcbiAgICAgICAgd2lkdGg6IG1heFggLSBtaW5YLFxyXG4gICAgICAgIGhlaWdodDogbWF4WSAtIG1pblksXHJcbiAgICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiByZWN0RnJvbUVkaXRpbmdTY2VuZShyb290OiBhbnkpOiBSZWN0TGlrZSB8IG51bGwge1xyXG4gICAgY29uc3QgZWRpdGluZ1NjZW5lID0gcm9vdC5nZXRDb21wb25lbnQ/LignYmF0dGxlLmVkaXRvci5FZGl0aW5nU2NlbmUnKTtcclxuICAgIGNvbnN0IHJvYWRMYXllciA9IGVkaXRpbmdTY2VuZT8ucm9hZExheWVyO1xyXG4gICAgY29uc3Qgd2lkdGggPSBOdW1iZXIocm9hZExheWVyPy53aWR0aCkgfHwgMDtcclxuICAgIGNvbnN0IGhlaWdodCA9IE51bWJlcihyb2FkTGF5ZXI/LmhlaWdodCkgfHwgMDtcclxuICAgIGlmICh3aWR0aCA8PSAwIHx8IGhlaWdodCA8PSAwKSB7XHJcbiAgICAgICAgcmV0dXJuIG51bGw7XHJcbiAgICB9XHJcbiAgICBjb25zdCBwb3NpdGlvbiA9IHJvYWRMYXllcj8ubm9kZT8ud29ybGRQb3NpdGlvbiB8fCByb290LndvcmxkUG9zaXRpb24gfHwgeyB4OiAwLCB5OiAwIH07XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHg6IE51bWJlcihwb3NpdGlvbi54KSAtIHdpZHRoIC8gMixcclxuICAgICAgICB5OiBOdW1iZXIocG9zaXRpb24ueSkgLSBoZWlnaHQgLyAyLFxyXG4gICAgICAgIHdpZHRoLFxyXG4gICAgICAgIGhlaWdodCxcclxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbGxlY3RWaXN1YWxCb3VuZHMocm9vdDogYW55KTogUmVjdExpa2Uge1xyXG4gICAgbGV0IGJvdW5kcyA9IHJlY3RGcm9tRWRpdGluZ1NjZW5lKHJvb3QpO1xyXG4gICAgcm9vdC53YWxrKChub2RlOiBhbnkpID0+IHtcclxuICAgICAgICBpZiAoIXNob3VsZE1lYXN1cmVOb2RlKG5vZGUpKSB7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcbiAgICAgICAgY29uc3QgdHJhbnNmb3JtID0gbm9kZS5nZXRDb21wb25lbnQ/LihjYy5VSVRyYW5zZm9ybSk7XHJcbiAgICAgICAgaWYgKCF0cmFuc2Zvcm0gfHwgdHlwZW9mIHRyYW5zZm9ybS5nZXRCb3VuZGluZ0JveFRvV29ybGQgIT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjb25zdCByZWN0ID0gdHJhbnNmb3JtLmdldEJvdW5kaW5nQm94VG9Xb3JsZCgpO1xyXG4gICAgICAgIGlmIChOdW1iZXIocmVjdC53aWR0aCkgPiAxICYmIE51bWJlcihyZWN0LmhlaWdodCkgPiAxKSB7XHJcbiAgICAgICAgICAgIGJvdW5kcyA9IHVuaW9uUmVjdChib3VuZHMsIHtcclxuICAgICAgICAgICAgICAgIHg6IE51bWJlcihyZWN0LngpLFxyXG4gICAgICAgICAgICAgICAgeTogTnVtYmVyKHJlY3QueSksXHJcbiAgICAgICAgICAgICAgICB3aWR0aDogTnVtYmVyKHJlY3Qud2lkdGgpLFxyXG4gICAgICAgICAgICAgICAgaGVpZ2h0OiBOdW1iZXIocmVjdC5oZWlnaHQpLFxyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIHJldHVybiBib3VuZHMgJiYgYm91bmRzLndpZHRoID4gMSAmJiBib3VuZHMuaGVpZ2h0ID4gMVxyXG4gICAgICAgID8gYm91bmRzXHJcbiAgICAgICAgOiB7IHg6IC02NDAsIHk6IC0zNjAsIHdpZHRoOiAxMjgwLCBoZWlnaHQ6IDcyMCB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBjYWxjdWxhdGVSdW50aW1lVGV4dHVyZVNpemUoXHJcbiAgICBtYXhUZXh0dXJlU2l6ZTogbnVtYmVyLFxyXG4gICAgY2FtZXJhUHJvZmlsZTogUnVudGltZUNhbWVyYVByb2ZpbGUsXHJcbik6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXIgfSB7XHJcbiAgICBjb25zdCBtYXhFZGdlID0gTWF0aC5tYXgoMjU2LCBNYXRoLm1pbigyMDQ4LCBNYXRoLmZsb29yKG1heFRleHR1cmVTaXplIHx8IERFRkFVTFRfVEVYVFVSRV9FREdFKSkpO1xyXG4gICAgY29uc3Qgc2NhbGUgPSBNYXRoLm1pbigxLCBtYXhFZGdlIC8gY2FtZXJhUHJvZmlsZS52aWV3cG9ydEhlaWdodCk7XHJcbiAgICByZXR1cm4ge1xyXG4gICAgICAgIHdpZHRoOiBNYXRoLm1heChNSU5fVEVYVFVSRV9FREdFLCBNYXRoLnJvdW5kKGNhbWVyYVByb2ZpbGUudmlld3BvcnRXaWR0aCAqIHNjYWxlKSksXHJcbiAgICAgICAgaGVpZ2h0OiBNYXRoLm1heChNSU5fVEVYVFVSRV9FREdFLCBNYXRoLnJvdW5kKGNhbWVyYVByb2ZpbGUudmlld3BvcnRIZWlnaHQgKiBzY2FsZSkpLFxyXG4gICAgfTtcclxufVxyXG5cclxuZnVuY3Rpb24gZmluZE5vZGVCeU5hbWUocm9vdDogYW55LCBuYW1lOiBzdHJpbmcpOiBhbnkgfCBudWxsIHtcclxuICAgIGxldCByZXN1bHQ6IGFueSB8IG51bGwgPSBudWxsO1xyXG4gICAgcm9vdC53YWxrKChub2RlOiBhbnkpID0+IHtcclxuICAgICAgICBpZiAoIXJlc3VsdCAmJiBTdHJpbmcobm9kZT8ubmFtZSB8fCAnJykgPT09IG5hbWUpIHtcclxuICAgICAgICAgICAgcmVzdWx0ID0gbm9kZTtcclxuICAgICAgICB9XHJcbiAgICB9KTtcclxuICAgIHJldHVybiByZXN1bHQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNsYW1wQ2FtZXJhQXhpcyh2YWx1ZTogbnVtYmVyLCBsb3dlcjogbnVtYmVyLCB1cHBlcjogbnVtYmVyLCBoYWxmRXh0ZW50OiBudW1iZXIpOiBudW1iZXIge1xyXG4gICAgY29uc3QgZWZmZWN0aXZlTG93ZXIgPSBsb3dlciArIGhhbGZFeHRlbnQ7XHJcbiAgICBjb25zdCBlZmZlY3RpdmVVcHBlciA9IHVwcGVyIC0gaGFsZkV4dGVudDtcclxuICAgIGlmIChlZmZlY3RpdmVMb3dlciA+IGVmZmVjdGl2ZVVwcGVyKSB7XHJcbiAgICAgICAgcmV0dXJuIE1hdGgubWluKE1hdGgubWF4KHZhbHVlLCBsb3dlciksIHVwcGVyKTtcclxuICAgIH1cclxuICAgIHJldHVybiBNYXRoLm1pbihNYXRoLm1heCh2YWx1ZSwgZWZmZWN0aXZlTG93ZXIpLCBlZmZlY3RpdmVVcHBlcik7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlc29sdmVSdW50aW1lQ2FtZXJhU3dlZXAoXG4gICAgcm9vdDogYW55LFxuICAgIHZpc3VhbEJvdW5kczogUmVjdExpa2UsXG4gICAgY2FtZXJhUHJvZmlsZTogUnVudGltZUNhbWVyYVByb2ZpbGUsXG4gICAgcmVxdWVzdGVkU3RhZ2U6IEJvdW5kYXJ5U3RhZ2UgPSAnMXN0Jyxcbik6IHtcbiAgICBib3VuZHM6IFJlY3RMaWtlO1xyXG4gICAgY2VudGVyWTogbnVtYmVyO1xyXG4gICAgY2FtZXJhU3RhcnRYOiBudW1iZXI7XHJcbiAgICBjYW1lcmFFbmRYOiBudW1iZXI7XHJcbiAgICB2aWV3cG9ydFdvcmxkV2lkdGg6IG51bWJlcjtcbiAgICB2aWV3cG9ydFdvcmxkSGVpZ2h0OiBudW1iZXI7XG4gICAgYm91bmRhcnlTdGFnZTogQm91bmRhcnlTdGFnZTtcbiAgICBhY3RpdmVCb3VuZGFyeVR5cGVzOiBudW1iZXJbXTtcbiAgICByaWdodEJvdW5kYXJ5RmFsbGJhY2s6IHN0cmluZztcbiAgICBib3VuZGFyeVZpZXdwb3J0Q29uZmxpY3Q6IGJvb2xlYW47XG4gICAgYm91bmRhcnlWaWV3cG9ydE92ZXJmbG93OiBudW1iZXI7XG4gICAgYm91bmRhcnlGYWxsYmFja01vZGU6IHN0cmluZztcbiAgICBzb3VyY2U6IHN0cmluZztcbn0ge1xuICAgIGNvbnN0IGVkaXRpbmdTY2VuZSA9IHJvb3QuZ2V0Q29tcG9uZW50Py4oJ2JhdHRsZS5lZGl0b3IuRWRpdGluZ1NjZW5lJyk7XHJcbiAgICBjb25zdCByb290UG9zaXRpb24gPSBlZGl0aW5nU2NlbmU/Lm5vZGU/LndvcmxkUG9zaXRpb24gfHwgcm9vdC53b3JsZFBvc2l0aW9uIHx8IHsgeDogMCwgeTogMCB9O1xyXG4gICAgY29uc3QgYm9yblBvaW50ID0gQXJyYXkuaXNBcnJheShlZGl0aW5nU2NlbmU/LnBvc2l0aW9ucylcclxuICAgICAgICA/IGVkaXRpbmdTY2VuZS5wb3NpdGlvbnMuZmluZCgoaXRlbTogYW55KSA9PiBOdW1iZXIoaXRlbT8ucG9zaXRpb25UeXBlKSA9PT0gQk9STl9QT0lOVF9UWVBFKVxyXG4gICAgICAgIDogbnVsbDtcclxuICAgIGNvbnN0IGJvcm5Qb3NpdGlvbiA9IGJvcm5Qb2ludD8uY29sbGlkZXI/Lm5vZGU/LndvcmxkUG9zaXRpb247XHJcbiAgICBjb25zdCBwcmV2aWV3Q2FtZXJhTm9kZSA9IGZpbmROb2RlQnlOYW1lKHJvb3QsICdQcmV2aWV3Q2FtZXJhJyk7XHJcbiAgICBjb25zdCBwcmV2aWV3Q2FtZXJhUG9zaXRpb24gPSBwcmV2aWV3Q2FtZXJhTm9kZT8ud29ybGRQb3NpdGlvbjtcclxuICAgIGNvbnN0IHZpZXdwb3J0V29ybGRIZWlnaHQgPSBjYW1lcmFQcm9maWxlLm9ydGhvSGVpZ2h0ICogMjtcclxuICAgIGNvbnN0IHZpZXdwb3J0V29ybGRXaWR0aCA9IHZpZXdwb3J0V29ybGRIZWlnaHRcclxuICAgICAgICAqIGNhbWVyYVByb2ZpbGUudmlld3BvcnRXaWR0aFxyXG4gICAgICAgIC8gY2FtZXJhUHJvZmlsZS52aWV3cG9ydEhlaWdodDtcclxuXHJcbiAgICBsZXQgY2VudGVyWSA9IDA7XHJcbiAgICBsZXQgc291cmNlID0gJ2Jvcm4tcG9pbnQnO1xyXG4gICAgaWYgKCFOdW1iZXIuaXNGaW5pdGUoTnVtYmVyKGJvcm5Qb3NpdGlvbj8ueCkpKSB7XHJcbiAgICAgICAgY2VudGVyWSA9IE51bWJlcihwcmV2aWV3Q2FtZXJhUG9zaXRpb24/LnkpO1xyXG4gICAgICAgIHNvdXJjZSA9ICdwcmV2aWV3LWNhbWVyYSc7XHJcbiAgICB9XHJcbiAgICBpZiAoIU51bWJlci5pc0Zpbml0ZShOdW1iZXIoYm9yblBvc2l0aW9uPy54KSkgJiYgIU51bWJlci5pc0Zpbml0ZShOdW1iZXIocHJldmlld0NhbWVyYVBvc2l0aW9uPy54KSkpIHtcclxuICAgICAgICBjZW50ZXJZID0gTnVtYmVyKHJvb3RQb3NpdGlvbi55KSB8fCAwO1xyXG4gICAgICAgIHNvdXJjZSA9ICd2aXN1YWwtY2VudGVyJztcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCByb2FkQm91bmRzID0gcmVjdEZyb21FZGl0aW5nU2NlbmUocm9vdCk7XG4gICAgY29uc3QgYm91bmRhcmllcyA9IEFycmF5LmlzQXJyYXkoZWRpdGluZ1NjZW5lPy5ib3VuZGFyaWVzKSA/IGVkaXRpbmdTY2VuZS5ib3VuZGFyaWVzIDogW107XG4gICAgY29uc3QgYm91bmRhcnlTdGFnZSA9IEJPVU5EQVJZX1NUQUdFUy5pbmNsdWRlcyhyZXF1ZXN0ZWRTdGFnZSkgPyByZXF1ZXN0ZWRTdGFnZSA6ICcxc3QnO1xuICAgIGNvbnN0IHN0YWdlSW5kZXggPSBCT1VOREFSWV9TVEFHRVMuaW5kZXhPZihib3VuZGFyeVN0YWdlKTtcbiAgICBjb25zdCByZXF1ZXN0ZWRDYW1lcmFMZWZ0VHlwZSA9IENBTUVSQV9CT1VOREFSWV9MRUZUX0ZJUlNUICsgc3RhZ2VJbmRleDtcbiAgICBjb25zdCByZXF1ZXN0ZWRDYW1lcmFSaWdodFR5cGUgPSBDQU1FUkFfQk9VTkRBUllfUklHSFRfRklSU1QgKyBzdGFnZUluZGV4O1xuICAgIGNvbnN0IGZpcnN0Q2FtZXJhTGVmdEJvdW5kYXJ5ID0gYm91bmRhcmllcy5maW5kKChpdGVtOiBhbnkpID0+IE51bWJlcihpdGVtPy50eXBlKSA9PT0gQ0FNRVJBX0JPVU5EQVJZX0xFRlRfRklSU1QpO1xuICAgIGNvbnN0IGNhbWVyYUxlZnRCb3VuZGFyeSA9IGJvdW5kYXJpZXMuZmluZChcbiAgICAgICAgKGl0ZW06IGFueSkgPT4gTnVtYmVyKGl0ZW0/LnR5cGUpID09PSByZXF1ZXN0ZWRDYW1lcmFMZWZ0VHlwZSxcbiAgICApIHx8IGZpcnN0Q2FtZXJhTGVmdEJvdW5kYXJ5O1xuICAgIGNvbnN0IGNhbWVyYVJpZ2h0Q2FuZGlkYXRlcyA9IGJvdW5kYXJpZXMuZmlsdGVyKChpdGVtOiBhbnkpID0+IChcbiAgICAgICAgTnVtYmVyKGl0ZW0/LnR5cGUpID49IENBTUVSQV9CT1VOREFSWV9SSUdIVF9GSVJTVFxuICAgICAgICAmJiBOdW1iZXIoaXRlbT8udHlwZSkgPCBDQU1FUkFfQk9VTkRBUllfUklHSFRfRklSU1QgKyBCT1VOREFSWV9TVEFHRVMubGVuZ3RoXG4gICAgICAgICYmIE51bWJlci5pc0Zpbml0ZShOdW1iZXIoaXRlbT8ubGltaXRYKSlcbiAgICApKTtcbiAgICBjb25zdCBleGFjdENhbWVyYVJpZ2h0Qm91bmRhcnkgPSBjYW1lcmFSaWdodENhbmRpZGF0ZXMuZmluZChcbiAgICAgICAgKGl0ZW06IGFueSkgPT4gTnVtYmVyKGl0ZW0/LnR5cGUpID09PSByZXF1ZXN0ZWRDYW1lcmFSaWdodFR5cGUsXG4gICAgKTtcbiAgICBjb25zdCBmaXJzdENhbWVyYVJpZ2h0Qm91bmRhcnkgPSBjYW1lcmFSaWdodENhbmRpZGF0ZXMuZmluZChcbiAgICAgICAgKGl0ZW06IGFueSkgPT4gTnVtYmVyKGl0ZW0/LnR5cGUpID09PSBDQU1FUkFfQk9VTkRBUllfUklHSFRfRklSU1QsXG4gICAgKTtcbiAgICBjb25zdCByaWdodG1vc3RDYW1lcmFCb3VuZGFyeSA9IGNhbWVyYVJpZ2h0Q2FuZGlkYXRlcy5yZWR1Y2UoKHJpZ2h0bW9zdDogYW55LCBpdGVtOiBhbnkpID0+IChcbiAgICAgICAgIXJpZ2h0bW9zdCB8fCBOdW1iZXIoaXRlbS5saW1pdFgpID4gTnVtYmVyKHJpZ2h0bW9zdC5saW1pdFgpID8gaXRlbSA6IHJpZ2h0bW9zdFxuICAgICksIG51bGwpO1xuICAgIGNvbnN0IHByZXZpb3VzQ2FtZXJhUmlnaHRCb3VuZGFyeSA9IGNhbWVyYVJpZ2h0Q2FuZGlkYXRlc1xuICAgICAgICAuZmlsdGVyKChpdGVtOiBhbnkpID0+IE51bWJlcihpdGVtLnR5cGUpIDw9IHJlcXVlc3RlZENhbWVyYVJpZ2h0VHlwZSlcbiAgICAgICAgLnJlZHVjZSgocHJldmlvdXM6IGFueSwgaXRlbTogYW55KSA9PiAhcHJldmlvdXMgfHwgTnVtYmVyKGl0ZW0udHlwZSkgPiBOdW1iZXIocHJldmlvdXMudHlwZSkgPyBpdGVtIDogcHJldmlvdXMsIG51bGwpO1xuICAgIGNvbnN0IGNhbWVyYVJpZ2h0Qm91bmRhcnkgPSBleGFjdENhbWVyYVJpZ2h0Qm91bmRhcnlcbiAgICAgICAgfHwgKGJvdW5kYXJ5U3RhZ2UgPT09ICdsb29wJyA/IHJpZ2h0bW9zdENhbWVyYUJvdW5kYXJ5IDogcHJldmlvdXNDYW1lcmFSaWdodEJvdW5kYXJ5IHx8IGZpcnN0Q2FtZXJhUmlnaHRCb3VuZGFyeSk7XG4gICAgY29uc3QgcmlnaHRCb3VuZGFyeUZhbGxiYWNrID0gZXhhY3RDYW1lcmFSaWdodEJvdW5kYXJ5XG4gICAgICAgID8gJydcbiAgICAgICAgOiBjYW1lcmFSaWdodEJvdW5kYXJ5ID8gQk9VTkRBUllfVFlQRV9OQU1FU1tOdW1iZXIoY2FtZXJhUmlnaHRCb3VuZGFyeS50eXBlKV0gfHwgJycgOiAnJztcbiAgICBjb25zdCBmYWxsYmFja0NhbWVyYVN0YXJ0WCA9IHJvYWRCb3VuZHM/LnggPz8gdmlzdWFsQm91bmRzLng7XHJcbiAgICBjb25zdCBmYWxsYmFja0NhbWVyYUVuZFggPSByb2FkQm91bmRzXHJcbiAgICAgICAgPyByb2FkQm91bmRzLnggKyByb2FkQm91bmRzLndpZHRoXHJcbiAgICAgICAgOiB2aXN1YWxCb3VuZHMueCArIHZpc3VhbEJvdW5kcy53aWR0aDtcclxuICAgIGNvbnN0IGNvbmZpZ3VyZWRDYW1lcmFTdGFydFggPSBOdW1iZXIuaXNGaW5pdGUoTnVtYmVyKGNhbWVyYUxlZnRCb3VuZGFyeT8ubGltaXRYKSlcclxuICAgICAgICA/IE51bWJlcihyb290UG9zaXRpb24ueCkgKyBOdW1iZXIoY2FtZXJhTGVmdEJvdW5kYXJ5LmxpbWl0WClcclxuICAgICAgICA6IGZhbGxiYWNrQ2FtZXJhU3RhcnRYO1xyXG4gICAgY29uc3QgY29uZmlndXJlZENhbWVyYUVuZFggPSBOdW1iZXIuaXNGaW5pdGUoTnVtYmVyKGNhbWVyYVJpZ2h0Qm91bmRhcnk/LmxpbWl0WCkpXHJcbiAgICAgICAgPyBOdW1iZXIocm9vdFBvc2l0aW9uLngpICsgTnVtYmVyKGNhbWVyYVJpZ2h0Qm91bmRhcnkubGltaXRYKVxyXG4gICAgICAgIDogZmFsbGJhY2tDYW1lcmFFbmRYO1xyXG4gICAgLy8gRWRpdGluZ1NjZW5lIHN0b3JlcyB0aGUgY2FtZXJhIGJvdW5kYXJpZXMgYXMgdmlzaWJsZSB3b3JsZC1lZGdlIGxpbWl0cy5cbiAgICAvLyBCYXR0bGVDYW1lcmFDb250cm9sbGVyIGNsYW1wcyB0aGUgY2FtZXJhIGNlbnRyZSBhZnRlciBhY2NvdW50aW5nIGZvciBoYWxmXG4gICAgLy8gb2YgdGhlIHZpZXdwb3J0LCBzbyB0aGUgcHJldmlldyBtdXN0IHVzZSB0aGUgc2FtZSBlZmZlY3RpdmUgaW50ZXJ2YWwuXG4gICAgY29uc3Qgd29ybGRCb3VuZGFyeUxlZnRYID0gTWF0aC5taW4oY29uZmlndXJlZENhbWVyYVN0YXJ0WCwgY29uZmlndXJlZENhbWVyYUVuZFgpO1xuICAgIGNvbnN0IHdvcmxkQm91bmRhcnlSaWdodFggPSBNYXRoLm1heChjb25maWd1cmVkQ2FtZXJhU3RhcnRYLCBjb25maWd1cmVkQ2FtZXJhRW5kWCk7XG4gICAgY29uc3Qgdmlld3BvcnRIYWxmV2lkdGggPSB2aWV3cG9ydFdvcmxkV2lkdGggLyAyO1xuICAgIGNvbnN0IGVmZmVjdGl2ZUNhbWVyYVN0YXJ0WCA9IHdvcmxkQm91bmRhcnlMZWZ0WCArIHZpZXdwb3J0SGFsZldpZHRoO1xuICAgIGNvbnN0IGVmZmVjdGl2ZUNhbWVyYUVuZFggPSB3b3JsZEJvdW5kYXJ5UmlnaHRYIC0gdmlld3BvcnRIYWxmV2lkdGg7XG4gICAgY29uc3QgYm91bmRhcnlWaWV3cG9ydE92ZXJmbG93ID0gTWF0aC5tYXgoXG4gICAgICAgIDAsXG4gICAgICAgIHZpZXdwb3J0V29ybGRXaWR0aCAtICh3b3JsZEJvdW5kYXJ5UmlnaHRYIC0gd29ybGRCb3VuZGFyeUxlZnRYKSxcbiAgICApO1xuICAgIGNvbnN0IGJvdW5kYXJ5Vmlld3BvcnRDb25mbGljdCA9IGJvdW5kYXJ5Vmlld3BvcnRPdmVyZmxvdyA+IDAuMDAxO1xuICAgIGxldCBib3VuZGFyeUZhbGxiYWNrTW9kZSA9ICcnO1xuICAgIGxldCBjYW1lcmFTdGFydFggPSBlZmZlY3RpdmVDYW1lcmFTdGFydFg7XG4gICAgbGV0IGNhbWVyYUVuZFggPSBlZmZlY3RpdmVDYW1lcmFFbmRYO1xuICAgIGlmIChib3VuZGFyeVZpZXdwb3J0Q29uZmxpY3QpIHtcbiAgICAgICAgLy8gVGhlIHZpZXdwb3J0IGNhbm5vdCBmaXQgYmV0d2VlbiBib3RoIHN0YWdlIGJvdW5kYXJpZXMuIFRoZSBzY2VuZVxuICAgICAgICAvLyBhZHZhbmNlcyB0byB0aGUgcmlnaHQsIHNvIGtlZXAgdGhlIGZvcndhcmQgZWRnZSBoYXJkIGFuZCB1c2UgdGhlXG4gICAgICAgIC8vIGFjdHVhbCBzY2VuZSBjb250ZW50IGVkZ2UgYXMgdGhlIHJlYXIgZmFsbGJhY2suIE5ldmVyIGFsbG93IHRoZVxuICAgICAgICAvLyBjYW1lcmEgY2VudHJlIGl0c2VsZiB0byByZWFjaCB0aGUgY29uZmlndXJlZCByaWdodC1lZGdlIGJvdW5kYXJ5LlxuICAgICAgICBjb25zdCBjb250ZW50TGVmdFggPSByb2FkQm91bmRzPy54ID8/IHZpc3VhbEJvdW5kcy54O1xuICAgICAgICBjb25zdCBjb250ZW50U2FmZVN0YXJ0WCA9IGNvbnRlbnRMZWZ0WCArIHZpZXdwb3J0SGFsZldpZHRoO1xuICAgICAgICBjYW1lcmFFbmRYID0gd29ybGRCb3VuZGFyeVJpZ2h0WCAtIHZpZXdwb3J0SGFsZldpZHRoO1xuICAgICAgICBjYW1lcmFTdGFydFggPSBNYXRoLm1pbihjb250ZW50U2FmZVN0YXJ0WCwgY2FtZXJhRW5kWCk7XG4gICAgICAgIGJvdW5kYXJ5RmFsbGJhY2tNb2RlID0gY29udGVudFNhZmVTdGFydFggPD0gY2FtZXJhRW5kWFxuICAgICAgICAgICAgPyAn5Y+z6L6555WM5LyY5YWI77yM5bem5L6n5L2/55So5Zy65pmv5YaF5a656L6555WMJ1xuICAgICAgICAgICAgOiAn5Y+z6L6555WM5LyY5YWI77yM6KeG5Y+j5a695LqO5Y+v55So5Zy65pmv5YaF5a65JztcbiAgICB9XG4gICAgaWYgKCEoY2FtZXJhRW5kWCA+PSBjYW1lcmFTdGFydFgpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBTY2VuZSBjYW1lcmEgc3dlZXAgZm9yICR7Ym91bmRhcnlTdGFnZX0gaXMgaW52YWxpZDogJHtjYW1lcmFTdGFydFh9IC0+ICR7Y2FtZXJhRW5kWH0uYCxcbiAgICAgICAgKTtcclxuICAgIH1cclxuXHJcbiAgICBjb25zdCBib3R0b21WYWx1ZXMgPSBib3VuZGFyaWVzXHJcbiAgICAgICAgLmZpbHRlcigoaXRlbTogYW55KSA9PiB7XHJcbiAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBOdW1iZXIoaXRlbT8udHlwZSk7XHJcbiAgICAgICAgICAgIHJldHVybiB0eXBlID49IENBTUVSQV9CT1VOREFSWV9CT1RUT01fRklSU1QgJiYgdHlwZSA8PSBDQU1FUkFfQk9VTkRBUllfQk9UVE9NX0xPT1A7XHJcbiAgICAgICAgfSlcclxuICAgICAgICAubWFwKChpdGVtOiBhbnkpID0+IE51bWJlcihpdGVtPy5saW1pdFkpKVxyXG4gICAgICAgIC5maWx0ZXIoTnVtYmVyLmlzRmluaXRlKTtcclxuICAgIGNvbnN0IHRvcFZhbHVlcyA9IGJvdW5kYXJpZXNcclxuICAgICAgICAuZmlsdGVyKChpdGVtOiBhbnkpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgdHlwZSA9IE51bWJlcihpdGVtPy50eXBlKTtcclxuICAgICAgICAgICAgcmV0dXJuIHR5cGUgPj0gQ0FNRVJBX0JPVU5EQVJZX1RPUF9GSVJTVCAmJiB0eXBlIDw9IENBTUVSQV9CT1VOREFSWV9UT1BfTE9PUDtcclxuICAgICAgICB9KVxyXG4gICAgICAgIC5tYXAoKGl0ZW06IGFueSkgPT4gTnVtYmVyKGl0ZW0/LmxpbWl0WSkpXHJcbiAgICAgICAgLmZpbHRlcihOdW1iZXIuaXNGaW5pdGUpO1xyXG4gICAgaWYgKGJvdHRvbVZhbHVlcy5sZW5ndGggPiAwICYmIHRvcFZhbHVlcy5sZW5ndGggPiAwKSB7XHJcbiAgICAgICAgY29uc3QgYm90dG9tID0gTnVtYmVyKHJvb3RQb3NpdGlvbi55KSArIE1hdGgubWF4KC4uLmJvdHRvbVZhbHVlcyk7XHJcbiAgICAgICAgY29uc3QgdG9wID0gTnVtYmVyKHJvb3RQb3NpdGlvbi55KSArIE1hdGgubWluKC4uLnRvcFZhbHVlcyk7XHJcbiAgICAgICAgY29uc3QgZGVzaXJlZFkgPSBOdW1iZXIuaXNGaW5pdGUoTnVtYmVyKGJvcm5Qb3NpdGlvbj8ueSkpXHJcbiAgICAgICAgICAgID8gTnVtYmVyKGJvcm5Qb3NpdGlvbi55KVxyXG4gICAgICAgICAgICA6IGNlbnRlclk7XHJcbiAgICAgICAgY2VudGVyWSA9IGNsYW1wQ2FtZXJhQXhpcyhkZXNpcmVkWSwgYm90dG9tLCB0b3AsIHZpZXdwb3J0V29ybGRIZWlnaHQgLyAyKTtcclxuICAgIH0gZWxzZSBpZiAoc291cmNlID09PSAnYm9ybi1wb2ludCcpIHtcclxuICAgICAgICAvLyBCYXR0bGVDYW1lcmFDb250cm9sbGVyIGtlZXBzIFkgYXQgemVybyB3aGVuIG5vIHZlcnRpY2FsIGJvdW5kcyBleGlzdC5cclxuICAgICAgICBjZW50ZXJZID0gTnVtYmVyKHJvb3RQb3NpdGlvbi55KSB8fCAwO1xyXG4gICAgfSBlbHNlIGlmICghTnVtYmVyLmlzRmluaXRlKGNlbnRlclkpKSB7XG4gICAgICAgIGNlbnRlclkgPSBOdW1iZXIocm9vdFBvc2l0aW9uLnkpIHx8IDA7XG4gICAgfVxuXG4gICAgY29uc3QgY29uZmlndXJlZFR5cGVzID0gbmV3IFNldChib3VuZGFyaWVzLm1hcCgoaXRlbTogYW55KSA9PiBOdW1iZXIoaXRlbT8udHlwZSkpKTtcbiAgICBjb25zdCBzdGFnZVR5cGVzID0gW1xuICAgICAgICAxICsgc3RhZ2VJbmRleCxcbiAgICAgICAgMTEgKyBzdGFnZUluZGV4LFxuICAgICAgICAxNyArIHN0YWdlSW5kZXgsXG4gICAgICAgIDI3ICsgc3RhZ2VJbmRleCxcbiAgICAgICAgMzIgKyBzdGFnZUluZGV4LFxuICAgICAgICBOdW1iZXIoY2FtZXJhTGVmdEJvdW5kYXJ5Py50eXBlKSxcbiAgICAgICAgTnVtYmVyKGNhbWVyYVJpZ2h0Qm91bmRhcnk/LnR5cGUpLFxuICAgIF0uZmlsdGVyKCh0eXBlKSA9PiBOdW1iZXIuaXNGaW5pdGUodHlwZSkgJiYgY29uZmlndXJlZFR5cGVzLmhhcyh0eXBlKSk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBib3VuZHM6IHtcclxuICAgICAgICAgICAgLy8gVGhlIHBhbm9yYW1hIGlzIHRoZSBleGFjdCB1bmlvbiBvZiB0aGUgdHdvIGVuZHBvaW50IGNhbWVyYSB2aWV3cy5cclxuICAgICAgICAgICAgeDogY2FtZXJhU3RhcnRYIC0gdmlld3BvcnRXb3JsZFdpZHRoIC8gMixcclxuICAgICAgICAgICAgeTogY2VudGVyWSAtIHZpZXdwb3J0V29ybGRIZWlnaHQgLyAyLFxyXG4gICAgICAgICAgICB3aWR0aDogKGNhbWVyYUVuZFggLSBjYW1lcmFTdGFydFgpICsgdmlld3BvcnRXb3JsZFdpZHRoLFxyXG4gICAgICAgICAgICBoZWlnaHQ6IHZpZXdwb3J0V29ybGRIZWlnaHQsXHJcbiAgICAgICAgfSxcclxuICAgICAgICBjZW50ZXJZLFxyXG4gICAgICAgIGNhbWVyYVN0YXJ0WCxcclxuICAgICAgICBjYW1lcmFFbmRYLFxyXG4gICAgICAgIHZpZXdwb3J0V29ybGRXaWR0aCxcbiAgICAgICAgdmlld3BvcnRXb3JsZEhlaWdodCxcbiAgICAgICAgYm91bmRhcnlTdGFnZSxcbiAgICAgICAgYWN0aXZlQm91bmRhcnlUeXBlczogWy4uLm5ldyBTZXQoc3RhZ2VUeXBlcyldLFxuICAgICAgICByaWdodEJvdW5kYXJ5RmFsbGJhY2ssXG4gICAgICAgIGJvdW5kYXJ5Vmlld3BvcnRDb25mbGljdCxcbiAgICAgICAgYm91bmRhcnlWaWV3cG9ydE92ZXJmbG93LFxuICAgICAgICBib3VuZGFyeUZhbGxiYWNrTW9kZSxcbiAgICAgICAgc291cmNlOiBgJHtjYW1lcmFQcm9maWxlLnNvdXJjZX06JHtzb3VyY2V9OmNhbWVyYS1ib3VuZGFyeS0ke2JvdW5kYXJ5U3RhZ2V9JHtyaWdodEJvdW5kYXJ5RmFsbGJhY2sgPyBgLWZhbGxiYWNrLSR7cmlnaHRCb3VuZGFyeUZhbGxiYWNrfWAgOiAnJ31gLFxuICAgIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNhbGN1bGF0ZVBhbm9yYW1hV2lkdGgoXHJcbiAgICBib3VuZHM6IFJlY3RMaWtlLFxyXG4gICAgdmlld3BvcnRQaXhlbFdpZHRoOiBudW1iZXIsXHJcbiAgICB2aWV3cG9ydFdvcmxkV2lkdGg6IG51bWJlcixcclxuKTogbnVtYmVyIHtcclxuICAgIGNvbnN0IHBpeGVsc1BlcldvcmxkVW5pdCA9IHZpZXdwb3J0UGl4ZWxXaWR0aCAvIHZpZXdwb3J0V29ybGRXaWR0aDtcclxuICAgIGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMSwgTWF0aC5yb3VuZChib3VuZHMud2lkdGggKiBwaXhlbHNQZXJXb3JsZFVuaXQpKTtcclxuICAgIGlmICh3aWR0aCA+IE1BWF9QQU5PUkFNQV9QSVhFTF9XSURUSCkge1xyXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcclxuICAgICAgICAgICAgYFNjZW5lIHBhbm9yYW1hIHdpZHRoICR7d2lkdGh9cHggZXhjZWVkcyB0aGUgJHtNQVhfUEFOT1JBTUFfUElYRUxfV0lEVEh9cHggc2FmZXR5IGxpbWl0LmAsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxuICAgIHJldHVybiB3aWR0aDtcclxufVxyXG5cclxuZnVuY3Rpb24gYnVpbGRSdW50aW1lQ2FtZXJhU3dlZXBQb3NpdGlvbnMoXHJcbiAgICBjYW1lcmFTdGFydFg6IG51bWJlcixcclxuICAgIGNhbWVyYUVuZFg6IG51bWJlcixcclxuICAgIHZpZXdwb3J0V29ybGRXaWR0aDogbnVtYmVyLFxyXG4pOiBudW1iZXJbXSB7XHJcbiAgICBjb25zdCBwb3NpdGlvbnMgPSBbY2FtZXJhU3RhcnRYXTtcclxuICAgIGNvbnN0IHN0ZXAgPSBNYXRoLm1heCgxLCB2aWV3cG9ydFdvcmxkV2lkdGgpO1xyXG4gICAgZm9yIChsZXQgcG9zaXRpb24gPSBjYW1lcmFTdGFydFggKyBzdGVwOyBwb3NpdGlvbiA8IGNhbWVyYUVuZFggLSAwLjAwMTsgcG9zaXRpb24gKz0gc3RlcCkge1xyXG4gICAgICAgIHBvc2l0aW9ucy5wdXNoKHBvc2l0aW9uKTtcclxuICAgIH1cclxuICAgIGlmIChNYXRoLmFicyhwb3NpdGlvbnNbcG9zaXRpb25zLmxlbmd0aCAtIDFdIC0gY2FtZXJhRW5kWCkgPiAwLjAwMSkge1xyXG4gICAgICAgIHBvc2l0aW9ucy5wdXNoKGNhbWVyYUVuZFgpO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIHBvc2l0aW9ucztcclxufVxyXG5cclxuZnVuY3Rpb24gY29weVZpZXdwb3J0U2xpY2UoXHJcbiAgICB0YXJnZXQ6IFVpbnQ4QXJyYXksXHJcbiAgICB0YXJnZXRXaWR0aDogbnVtYmVyLFxyXG4gICAgdGFyZ2V0WDogbnVtYmVyLFxyXG4gICAgc291cmNlOiBVaW50OEFycmF5LFxyXG4gICAgc291cmNlV2lkdGg6IG51bWJlcixcclxuICAgIGhlaWdodDogbnVtYmVyLFxyXG4gICAgY29weVdpZHRoOiBudW1iZXIsXHJcbik6IHZvaWQge1xyXG4gICAgY29uc3Qgc291cmNlUm93Qnl0ZXMgPSBzb3VyY2VXaWR0aCAqIDQ7XHJcbiAgICBjb25zdCB0YXJnZXRSb3dCeXRlcyA9IHRhcmdldFdpZHRoICogNDtcclxuICAgIGNvbnN0IGNvcHlSb3dCeXRlcyA9IGNvcHlXaWR0aCAqIDQ7XHJcbiAgICBmb3IgKGxldCByb3cgPSAwOyByb3cgPCBoZWlnaHQ7IHJvdyArPSAxKSB7XHJcbiAgICAgICAgY29uc3Qgc291cmNlT2Zmc2V0ID0gcm93ICogc291cmNlUm93Qnl0ZXM7XHJcbiAgICAgICAgY29uc3QgdGFyZ2V0T2Zmc2V0ID0gcm93ICogdGFyZ2V0Um93Qnl0ZXMgKyB0YXJnZXRYICogNDtcclxuICAgICAgICB0YXJnZXQuc2V0KFxyXG4gICAgICAgICAgICBzb3VyY2Uuc3ViYXJyYXkoc291cmNlT2Zmc2V0LCBzb3VyY2VPZmZzZXQgKyBjb3B5Um93Qnl0ZXMpLFxyXG4gICAgICAgICAgICB0YXJnZXRPZmZzZXQsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxufVxyXG5cclxuaW50ZXJmYWNlIFByZXZpZXdHcm91bmRTdGF0ZSB7XG4gICAgbm9kZTogYW55O1xuICAgIG5hbWU6IHN0cmluZztcbiAgICBjb25maWd1cmVkV2lkdGg6IG51bWJlcjtcbiAgICBjb25maWd1cmVkSGVpZ2h0OiBudW1iZXI7XG4gICAgb3JpZ2luOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyOyB6OiBudW1iZXIgfTtcclxuICAgIGxheWVySW5kZXg6IG51bWJlcjtcclxuICAgIHJhdGVYOiBudW1iZXI7XHJcbiAgICByYXRlWTogbnVtYmVyO1xyXG59XHJcblxyXG5pbnRlcmZhY2UgUHJldmlld09jY2x1ZGVyU3RhdGUge1xuICAgIG5vZGU6IGFueTtcbiAgICBjb2xsaWRlck5vZGU6IGFueTtcbiAgICB0cmFuc2Zvcm06IGFueTtcbiAgICBjb2xsaWRlcjogYW55O1xuICAgIGJhc2VPcGFjaXR5OiBudW1iZXI7XG4gICAgZ3JvdW5kTmFtZTogc3RyaW5nO1xuICAgIGxheWVySW5kZXg6IG51bWJlcjtcbn1cblxyXG5pbnRlcmZhY2UgUHJldmlld1Nlc3Npb24ge1xyXG4gICAgcHJlZmFiQXNzZXQ6IGFueTtcclxuICAgIHJvb3Q6IGFueTtcclxuICAgIGNhbWVyYU5vZGU6IGFueTtcclxuICAgIGNhbWVyYTogYW55O1xyXG4gICAgcmVuZGVyVGV4dHVyZTogYW55O1xyXG4gICAgcHJldmlld0xheWVyOiBudW1iZXI7XHJcbiAgICB0ZXh0dXJlU2l6ZTogeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9O1xyXG4gICAgY2FtZXJhUHJvZmlsZTogUnVudGltZUNhbWVyYVByb2ZpbGU7XHJcbiAgICBydW50aW1lRnJhbWU6IFJldHVyblR5cGU8dHlwZW9mIHJlc29sdmVSdW50aW1lQ2FtZXJhU3dlZXA+O1xyXG4gICAgZ3JvdW5kczogUHJldmlld0dyb3VuZFN0YXRlW107XHJcbiAgICBvY2NsdWRlcnM6IFByZXZpZXdPY2NsdWRlclN0YXRlW107XHJcbiAgICBib3JuOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH07XHJcbiAgICBwb3NpdGlvbnM6IFJlY29yZDxzdHJpbmcsIHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT47XHJcbiAgICBpbml0aWFsaXplZEFuaW1hdGlvbnM6IFdlYWtTZXQ8b2JqZWN0PjtcclxuICAgIG5lc3RlZFByZWZhYkNvdW50OiBudW1iZXI7XHJcbn1cclxuXHJcbmxldCBhY3RpdmVTZXNzaW9uOiBQcmV2aWV3U2Vzc2lvbiB8IG51bGwgPSBudWxsO1xyXG5cclxuZnVuY3Rpb24gdmFsaWRhdGVSZW5kZXJlclZlcnNpb24odmVyc2lvbjogbnVtYmVyKTogdm9pZCB7XHJcbiAgICBpZiAoTnVtYmVyKHZlcnNpb24pICE9PSBTQ0VORV9QUkVWSUVXX1JFTkRFUkVSX1ZFUlNJT04pIHtcclxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXHJcbiAgICAgICAgICAgIGBTY2VuZSBwcmV2aWV3IHJlbmRlcmVyIGlzIHN0YWxlIChsb2FkZWQgJHtTQ0VORV9QUkVWSUVXX1JFTkRFUkVSX1ZFUlNJT059LCByZXF1ZXN0ZWQgJHt2ZXJzaW9ufSkuIGBcclxuICAgICAgICAgICAgKyAnUmVsb2FkIHRoZSBiYXR0bGUtc2NlbmUtcHJldmlldyBleHRlbnNpb24gYW5kIHJldHJ5LicsXHJcbiAgICAgICAgKTtcclxuICAgIH1cclxufVxyXG5cclxuZnVuY3Rpb24gZGlzcG9zZVNlc3Npb24oKTogdm9pZCB7XHJcbiAgICBjb25zdCBzZXNzaW9uID0gYWN0aXZlU2Vzc2lvbjtcclxuICAgIGFjdGl2ZVNlc3Npb24gPSBudWxsO1xyXG4gICAgaWYgKCFzZXNzaW9uKSByZXR1cm47XHJcbiAgICBkZXN0cm95UHJldmlld0NhbWVyYShzZXNzaW9uLmNhbWVyYSk7XHJcbiAgICBzZXNzaW9uLmNhbWVyYU5vZGU/LmRlc3Ryb3k/LigpO1xyXG4gICAgc2Vzc2lvbi5yb290Py5kZXN0cm95Py4oKTtcclxuICAgIHNlc3Npb24ucmVuZGVyVGV4dHVyZT8uZGVzdHJveT8uKCk7XHJcbiAgICBpZiAoc2Vzc2lvbi5wcmVmYWJBc3NldCAmJiB0eXBlb2YgY2MuYXNzZXRNYW5hZ2VyLnJlbGVhc2VBc3NldCA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgIGNjLmFzc2V0TWFuYWdlci5yZWxlYXNlQXNzZXQoc2Vzc2lvbi5wcmVmYWJBc3NldCk7XHJcbiAgICB9XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHJlYWRCb3JuUG9pbnQocm9vdDogYW55LCBmYWxsYmFja1g6IG51bWJlciwgZmFsbGJhY2tZOiBudW1iZXIpOiB7IHg6IG51bWJlcjsgeTogbnVtYmVyIH0ge1xyXG4gICAgY29uc3QgZWRpdGluZ1NjZW5lID0gcm9vdC5nZXRDb21wb25lbnQ/LignYmF0dGxlLmVkaXRvci5FZGl0aW5nU2NlbmUnKTtcclxuICAgIGNvbnN0IGJvcm4gPSBBcnJheS5pc0FycmF5KGVkaXRpbmdTY2VuZT8ucG9zaXRpb25zKVxyXG4gICAgICAgID8gZWRpdGluZ1NjZW5lLnBvc2l0aW9ucy5maW5kKChpdGVtOiBhbnkpID0+IE51bWJlcihpdGVtPy5wb3NpdGlvblR5cGUpID09PSBCT1JOX1BPSU5UX1RZUEUpXHJcbiAgICAgICAgOiBudWxsO1xyXG4gICAgY29uc3Qgd29ybGRQb3NpdGlvbiA9IGJvcm4/LmNvbGxpZGVyPy5ub2RlPy53b3JsZFBvc2l0aW9uO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICB4OiBOdW1iZXIuaXNGaW5pdGUoTnVtYmVyKHdvcmxkUG9zaXRpb24/LngpKSA/IE51bWJlcih3b3JsZFBvc2l0aW9uLngpIDogZmFsbGJhY2tYLFxyXG4gICAgICAgIHk6IE51bWJlci5pc0Zpbml0ZShOdW1iZXIod29ybGRQb3NpdGlvbj8ueSkpID8gTnVtYmVyKHdvcmxkUG9zaXRpb24ueSkgOiBmYWxsYmFja1ksXHJcbiAgICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiBjb2xsZWN0UG9zaXRpb25zKHJvb3Q6IGFueSk6IFJlY29yZDxzdHJpbmcsIHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT4ge1xuICAgIGNvbnN0IGVkaXRpbmdTY2VuZSA9IHJvb3QuZ2V0Q29tcG9uZW50Py4oJ2JhdHRsZS5lZGl0b3IuRWRpdGluZ1NjZW5lJyk7XHJcbiAgICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHsgeDogbnVtYmVyOyB5OiBudW1iZXIgfT4gPSB7fTtcclxuICAgIGZvciAoY29uc3QgaXRlbSBvZiBBcnJheS5pc0FycmF5KGVkaXRpbmdTY2VuZT8ucG9zaXRpb25zKSA/IGVkaXRpbmdTY2VuZS5wb3NpdGlvbnMgOiBbXSkge1xyXG4gICAgICAgIGNvbnN0IGlkID0gU3RyaW5nKGl0ZW0/LmlkIHx8ICcnKS50cmltKCk7XHJcbiAgICAgICAgY29uc3QgcG9zaXRpb24gPSBpdGVtPy5jb2xsaWRlcj8ubm9kZT8ud29ybGRQb3NpdGlvbjtcclxuICAgICAgICBpZiAoaWQgJiYgTnVtYmVyLmlzRmluaXRlKE51bWJlcihwb3NpdGlvbj8ueCkpICYmIE51bWJlci5pc0Zpbml0ZShOdW1iZXIocG9zaXRpb24/LnkpKSkge1xyXG4gICAgICAgICAgICByZXN1bHRbaWRdID0geyB4OiBOdW1iZXIocG9zaXRpb24ueCksIHk6IE51bWJlcihwb3NpdGlvbi55KSB9O1xyXG4gICAgICAgIH1cclxuICAgIH1cclxuICAgIHJldHVybiByZXN1bHQ7XG59XG5cbmZ1bmN0aW9uIGJvdW5kYXJ5Q2F0ZWdvcnkodHlwZTogbnVtYmVyKTogeyBjYXRlZ29yeTogJ2V4aXQnIHwgJ3NwYXduJyB8ICdjYW1lcmEnIHwgJ21vdmUnOyBjYXRlZ29yeUxhYmVsOiBzdHJpbmcgfSB8IG51bGwge1xuICAgIGlmICh0eXBlID09PSAxNikgcmV0dXJuIHsgY2F0ZWdvcnk6ICdleGl0JywgY2F0ZWdvcnlMYWJlbDogJ+emu+W8gOWcuuaZr+e6vycgfTtcbiAgICBpZiAodHlwZSA+PSAxMSAmJiB0eXBlIDw9IDE1KSByZXR1cm4geyBjYXRlZ29yeTogJ3NwYXduJywgY2F0ZWdvcnlMYWJlbDogJ+WPrOWUpOaAqueJqee6vycgfTtcbiAgICBpZiAoKHR5cGUgPj0gNiAmJiB0eXBlIDw9IDEwKSB8fCAodHlwZSA+PSAyMiAmJiB0eXBlIDw9IDM2KSkgcmV0dXJuIHsgY2F0ZWdvcnk6ICdjYW1lcmEnLCBjYXRlZ29yeUxhYmVsOiAn6ZWc5aS06ZmQ5Yi257q/JyB9O1xuICAgIGlmICgodHlwZSA+PSAxICYmIHR5cGUgPD0gNSkgfHwgKHR5cGUgPj0gMTcgJiYgdHlwZSA8PSAyMSkpIHJldHVybiB7IGNhdGVnb3J5OiAnbW92ZScsIGNhdGVnb3J5TGFiZWw6ICfnp7vliqjpmZDliLbnur8nIH07XG4gICAgcmV0dXJuIG51bGw7XG59XG5cbmZ1bmN0aW9uIGNvbGxlY3RCb3VuZGFyeUd1aWRlcyhyb290OiBhbnksIGFjdGl2ZUJvdW5kYXJ5VHlwZXM6IFNldDxudW1iZXI+ID0gbmV3IFNldCgpKTogQXJyYXk8e1xuICAgIHR5cGU6IG51bWJlcjtcbiAgICB0eXBlTGFiZWw6IHN0cmluZztcbiAgICBjYXRlZ29yeTogJ2V4aXQnIHwgJ3NwYXduJyB8ICdjYW1lcmEnIHwgJ21vdmUnO1xuICAgIGNhdGVnb3J5TGFiZWw6IHN0cmluZztcbiAgICBob3Jpem9udGFsOiBib29sZWFuO1xuICAgIGFjdGl2ZTogYm9vbGVhbjtcbiAgICB4OiBudW1iZXI7XG4gICAgeTogbnVtYmVyO1xufT4ge1xuICAgIGNvbnN0IGVkaXRpbmdTY2VuZSA9IHJvb3QuZ2V0Q29tcG9uZW50Py4oJ2JhdHRsZS5lZGl0b3IuRWRpdGluZ1NjZW5lJyk7XG4gICAgY29uc3Qgb3JpZ2luID0gZWRpdGluZ1NjZW5lPy5ub2RlPy53b3JsZFBvc2l0aW9uIHx8IHJvb3Qud29ybGRQb3NpdGlvbiB8fCB7IHg6IDAsIHk6IDAgfTtcbiAgICBjb25zdCBndWlkZXMgPSAoQXJyYXkuaXNBcnJheShlZGl0aW5nU2NlbmU/LmJvdW5kYXJpZXMpID8gZWRpdGluZ1NjZW5lLmJvdW5kYXJpZXMgOiBbXSkuZmxhdE1hcCgoYm91bmRhcnk6IGFueSkgPT4ge1xuICAgICAgICBjb25zdCB0eXBlID0gTnVtYmVyKGJvdW5kYXJ5Py50eXBlKTtcbiAgICAgICAgY29uc3QgY2F0ZWdvcnkgPSBib3VuZGFyeUNhdGVnb3J5KHR5cGUpO1xuICAgICAgICBpZiAoIWNhdGVnb3J5KSByZXR1cm4gW107XG4gICAgICAgIHJldHVybiBbe1xuICAgICAgICAgICAgdHlwZSxcbiAgICAgICAgICAgIHR5cGVMYWJlbDogQk9VTkRBUllfVFlQRV9OQU1FU1t0eXBlXSB8fCBgQm91bmRhcnlUeXBlICR7dHlwZX1gLFxuICAgICAgICAgICAgLi4uY2F0ZWdvcnksXG4gICAgICAgICAgICBob3Jpem9udGFsOiB0eXBlID49IENBTUVSQV9CT1VOREFSWV9UT1BfRklSU1QgJiYgdHlwZSA8PSBDQU1FUkFfQk9VTkRBUllfQk9UVE9NX0xPT1AsXG4gICAgICAgICAgICBhY3RpdmU6IGFjdGl2ZUJvdW5kYXJ5VHlwZXMuaGFzKHR5cGUpLFxuICAgICAgICAgICAgeDogTnVtYmVyKG9yaWdpbi54KSArIChOdW1iZXIoYm91bmRhcnk/LmxpbWl0WCkgfHwgMCksXG4gICAgICAgICAgICB5OiBOdW1iZXIob3JpZ2luLnkpICsgKE51bWJlcihib3VuZGFyeT8ubGltaXRZKSB8fCAwKSxcbiAgICAgICAgfV07XG4gICAgfSk7XG4gICAgcmV0dXJuIGd1aWRlcy5zb3J0KChsZWZ0OiBhbnksIHJpZ2h0OiBhbnkpID0+IHtcbiAgICAgICAgaWYgKGxlZnQuaG9yaXpvbnRhbCAhPT0gcmlnaHQuaG9yaXpvbnRhbCkgcmV0dXJuIGxlZnQuaG9yaXpvbnRhbCA/IDEgOiAtMTtcbiAgICAgICAgcmV0dXJuIGxlZnQuaG9yaXpvbnRhbCA/IGxlZnQueSAtIHJpZ2h0LnkgOiBsZWZ0LnggLSByaWdodC54O1xuICAgIH0pO1xufVxuXG5mdW5jdGlvbiBjb2xsZWN0R3JvdW5kU3RhdGVzKHJvb3Q6IGFueSk6IFByZXZpZXdHcm91bmRTdGF0ZVtdIHtcbiAgICBjb25zdCBlZGl0aW5nU2NlbmUgPSByb290LmdldENvbXBvbmVudD8uKCdiYXR0bGUuZWRpdG9yLkVkaXRpbmdTY2VuZScpO1xyXG4gICAgaWYgKCFBcnJheS5pc0FycmF5KGVkaXRpbmdTY2VuZT8uZ3JvdW5kTGF5ZXJzKSkgcmV0dXJuIFtdO1xyXG4gICAgcmV0dXJuIGVkaXRpbmdTY2VuZS5ncm91bmRMYXllcnMuZmxhdE1hcCgoZ3JvdW5kOiBhbnkpID0+IHtcclxuICAgICAgICBjb25zdCBub2RlID0gZ3JvdW5kPy5ncm91bmQ/Lm5vZGU7XHJcbiAgICAgICAgaWYgKCFub2RlKSByZXR1cm4gW107XHJcbiAgICAgICAgY29uc3QgcG9zaXRpb24gPSBub2RlLnBvc2l0aW9uO1xyXG4gICAgICAgIHJldHVybiBbe1xuICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgIG5hbWU6IFN0cmluZyhub2RlLm5hbWUgfHwgYExheWVyICR7Z3JvdW5kLmxheWVySW5kZXh9YCksXG4gICAgICAgICAgICBjb25maWd1cmVkV2lkdGg6IE1hdGgubWF4KDAsIE51bWJlcihncm91bmQuZ3JvdW5kPy53aWR0aCkgfHwgMCksXG4gICAgICAgICAgICBjb25maWd1cmVkSGVpZ2h0OiA3MDAsXG4gICAgICAgICAgICBvcmlnaW46IHsgeDogTnVtYmVyKHBvc2l0aW9uLngpLCB5OiBOdW1iZXIocG9zaXRpb24ueSksIHo6IE51bWJlcihwb3NpdGlvbi56KSB9LFxyXG4gICAgICAgICAgICBsYXllckluZGV4OiBOdW1iZXIoZ3JvdW5kLmxheWVySW5kZXgpIHx8IDAsXHJcbiAgICAgICAgICAgIHJhdGVYOiBOdW1iZXIoZ3JvdW5kLm1vdmVTcGVlZFJhdGVYKSB8fCAwLFxyXG4gICAgICAgICAgICByYXRlWTogTnVtYmVyKGdyb3VuZC5tb3ZlU3BlZWRSYXRlWSkgfHwgMCxcclxuICAgICAgICB9XTtcclxuICAgIH0pO1xyXG59XG5cbmZ1bmN0aW9uIGFwcGx5Q29uZmlndXJlZFJlbmRlck9yZGVyKHJvb3Q6IGFueSwgZ3JvdW5kczogUHJldmlld0dyb3VuZFN0YXRlW10pOiB2b2lkIHtcbiAgICBjb25zdCBlZGl0aW5nU2NlbmUgPSByb290LmdldENvbXBvbmVudD8uKCdiYXR0bGUuZWRpdG9yLkVkaXRpbmdTY2VuZScpO1xuICAgIGNvbnN0IHJvYWROb2RlID0gZWRpdGluZ1NjZW5lPy5yb2FkTGF5ZXI/Lm5vZGU7XG4gICAgY29uc3QgZW50cmllcyA9IFtcbiAgICAgICAgLi4uZ3JvdW5kcy5tYXAoKGdyb3VuZCkgPT4gKHsgbm9kZTogZ3JvdW5kLm5vZGUsIGxheWVySW5kZXg6IGdyb3VuZC5sYXllckluZGV4IH0pKSxcbiAgICAgICAgLi4uKHJvYWROb2RlID8gW3sgbm9kZTogcm9hZE5vZGUsIGxheWVySW5kZXg6IDAgfV0gOiBbXSksXG4gICAgXS5maWx0ZXIoKGVudHJ5KSA9PiBlbnRyeS5ub2RlPy5wYXJlbnQgJiYgdHlwZW9mIGVudHJ5Lm5vZGUuc2V0U2libGluZ0luZGV4ID09PSAnZnVuY3Rpb24nKTtcbiAgICBjb25zdCBieVBhcmVudCA9IG5ldyBNYXA8YW55LCBBcnJheTx7IG5vZGU6IGFueTsgbGF5ZXJJbmRleDogbnVtYmVyIH0+PigpO1xuICAgIGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuICAgICAgICBjb25zdCBncm91cCA9IGJ5UGFyZW50LmdldChlbnRyeS5ub2RlLnBhcmVudCkgfHwgW107XG4gICAgICAgIGdyb3VwLnB1c2goZW50cnkpO1xuICAgICAgICBieVBhcmVudC5zZXQoZW50cnkubm9kZS5wYXJlbnQsIGdyb3VwKTtcbiAgICB9XG4gICAgZm9yIChjb25zdCBbcGFyZW50LCBncm91cF0gb2YgYnlQYXJlbnQpIHtcbiAgICAgICAgaWYgKGdyb3VwLmxlbmd0aCA8IDIpIGNvbnRpbnVlO1xuICAgICAgICAvLyBDb2NvcyBVSSByZW5kZXJzIGxhdGVyIHNpYmxpbmdzIG9uIHRvcC4gUnVudGltZSB1c2VzIGNhbWVyYSBwcmlvcml0eVxuICAgICAgICAvLyAxMDAgKyBsYXllckluZGV4LCBzbyBhc2NlbmRpbmcgc2libGluZyBvcmRlciByZXByb2R1Y2VzIHRoZSBzYW1lXG4gICAgICAgIC8vIGJhY2sgLT4gcm9hZCAtPiBmcm9udCBjb21wb3NpdGlvbiBpbiB0aGlzIHNpbmdsZS1jYW1lcmEgcHJldmlldy5cbiAgICAgICAgY29uc3QgZmlyc3RJbmRleCA9IE1hdGgubWluKC4uLmdyb3VwLm1hcCgoZW50cnkpID0+IE51bWJlcihlbnRyeS5ub2RlLmdldFNpYmxpbmdJbmRleD8uKCkpIHx8IDApKTtcbiAgICAgICAgZ3JvdXAuc29ydCgobGVmdCwgcmlnaHQpID0+IChcbiAgICAgICAgICAgIGxlZnQubGF5ZXJJbmRleCAtIHJpZ2h0LmxheWVySW5kZXhcbiAgICAgICAgICAgIHx8IFN0cmluZyhsZWZ0Lm5vZGUubmFtZSB8fCAnJykubG9jYWxlQ29tcGFyZShTdHJpbmcocmlnaHQubm9kZS5uYW1lIHx8ICcnKSwgJ3poLUNOJylcbiAgICAgICAgKSk7XG4gICAgICAgIGdyb3VwLmZvckVhY2goKGVudHJ5LCBvZmZzZXQpID0+IGVudHJ5Lm5vZGUuc2V0U2libGluZ0luZGV4KGZpcnN0SW5kZXggKyBvZmZzZXQpKTtcbiAgICAgICAgcGFyZW50LnVwZGF0ZVdvcmxkVHJhbnNmb3JtPy4oKTtcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGNvbmZpZ3VyZWRMYXllckJvdW5kcyhzZXNzaW9uOiBQcmV2aWV3U2Vzc2lvbik6IEFycmF5PFJlY3RMaWtlICYgeyBsYXllckluZGV4OiBudW1iZXI7IG5hbWU6IHN0cmluZzsga2luZDogc3RyaW5nIH0+IHtcbiAgICBjb25zdCByZXN1bHQ6IEFycmF5PFJlY3RMaWtlICYgeyBsYXllckluZGV4OiBudW1iZXI7IG5hbWU6IHN0cmluZzsga2luZDogc3RyaW5nIH0+ID0gW107XG4gICAgY29uc3QgZWRpdGluZ1NjZW5lID0gc2Vzc2lvbi5yb290LmdldENvbXBvbmVudD8uKCdiYXR0bGUuZWRpdG9yLkVkaXRpbmdTY2VuZScpO1xuICAgIGNvbnN0IHJvYWQgPSBlZGl0aW5nU2NlbmU/LnJvYWRMYXllcjtcbiAgICBpZiAocm9hZD8ubm9kZSAmJiBOdW1iZXIocm9hZC53aWR0aCkgPiAwICYmIE51bWJlcihyb2FkLmhlaWdodCkgPiAwKSB7XG4gICAgICAgIGNvbnN0IHBvc2l0aW9uID0gcm9hZC5ub2RlLndvcmxkUG9zaXRpb24gfHwgcm9hZC5ub2RlLnBvc2l0aW9uIHx8IHsgeDogMCwgeTogMCB9O1xuICAgICAgICBjb25zdCBzY2FsZSA9IHJvYWQubm9kZS53b3JsZFNjYWxlIHx8IHJvYWQubm9kZS5zY2FsZSB8fCB7IHg6IDEsIHk6IDEgfTtcbiAgICAgICAgY29uc3Qgd2lkdGggPSBNYXRoLmFicyhOdW1iZXIocm9hZC53aWR0aCkgKiBOdW1iZXIoc2NhbGUueCB8fCAxKSk7XG4gICAgICAgIGNvbnN0IGhlaWdodCA9IE1hdGguYWJzKE51bWJlcihyb2FkLmhlaWdodCkgKiBOdW1iZXIoc2NhbGUueSB8fCAxKSk7XG4gICAgICAgIHJlc3VsdC5wdXNoKHsgeDogTnVtYmVyKHBvc2l0aW9uLngpIC0gd2lkdGggLyAyLCB5OiBOdW1iZXIocG9zaXRpb24ueSkgLSBoZWlnaHQgLyAyLCB3aWR0aCwgaGVpZ2h0LCBsYXllckluZGV4OiAwLCBuYW1lOiBTdHJpbmcocm9hZC5ub2RlLm5hbWUgfHwgJ1JvYWQnKSwga2luZDogJ3JvYWQnIH0pO1xuICAgIH1cbiAgICBmb3IgKGNvbnN0IGdyb3VuZCBvZiBzZXNzaW9uLmdyb3VuZHMpIHtcbiAgICAgICAgY29uc3QgcG9zaXRpb24gPSBncm91bmQubm9kZS53b3JsZFBvc2l0aW9uIHx8IGdyb3VuZC5ub2RlLnBvc2l0aW9uIHx8IHsgeDogMCwgeTogMCB9O1xuICAgICAgICBjb25zdCBzY2FsZSA9IGdyb3VuZC5ub2RlLndvcmxkU2NhbGUgfHwgZ3JvdW5kLm5vZGUuc2NhbGUgfHwgeyB4OiAxLCB5OiAxIH07XG4gICAgICAgIGNvbnN0IHdpZHRoID0gZ3JvdW5kLmNvbmZpZ3VyZWRXaWR0aCAqIE1hdGguYWJzKE51bWJlcihzY2FsZS54IHx8IDEpKTtcbiAgICAgICAgY29uc3QgaGVpZ2h0ID0gZ3JvdW5kLmNvbmZpZ3VyZWRIZWlnaHQgKiBNYXRoLmFicyhOdW1iZXIoc2NhbGUueSB8fCAxKSk7XG4gICAgICAgIGNvbnN0IGJvdHRvbSA9IE51bWJlcihzY2FsZS55IHx8IDEpID49IDAgPyBOdW1iZXIocG9zaXRpb24ueSkgOiBOdW1iZXIocG9zaXRpb24ueSkgLSBoZWlnaHQ7XG4gICAgICAgIGlmICh3aWR0aCA+IDAgJiYgaGVpZ2h0ID4gMCkge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goeyB4OiBOdW1iZXIocG9zaXRpb24ueCkgLSB3aWR0aCAvIDIsIHk6IGJvdHRvbSwgd2lkdGgsIGhlaWdodCwgbGF5ZXJJbmRleDogZ3JvdW5kLmxheWVySW5kZXgsIG5hbWU6IGdyb3VuZC5uYW1lLCBraW5kOiAnZ3JvdW5kJyB9KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxuXHJcbmZ1bmN0aW9uIGZpbmRFZGl0aW5nQ29sbGlkZXIobm9kZTogYW55KTogYW55IHwgbnVsbCB7XHJcbiAgICBjb25zdCBkaXJlY3QgPSBub2RlPy5nZXRDb21wb25lbnQ/LignYmF0dGxlLmVkaXRvci5FZGl0aW5nQ29sbGlkZXInKTtcclxuICAgIGlmIChkaXJlY3QpIHJldHVybiBkaXJlY3Q7XHJcbiAgICBjb25zdCBjb21wb25lbnRzID0gdHlwZW9mIG5vZGU/LmdldENvbXBvbmVudHMgPT09ICdmdW5jdGlvbicgPyBub2RlLmdldENvbXBvbmVudHMoY2MuQ29tcG9uZW50KSA6IFtdO1xyXG4gICAgcmV0dXJuIGNvbXBvbmVudHMuZmluZCgoY29tcG9uZW50OiBhbnkpID0+IGNsYXNzTmFtZU9mKGNvbXBvbmVudCkuZW5kc1dpdGgoJ0VkaXRpbmdDb2xsaWRlcicpKSB8fCBudWxsO1xyXG59XHJcblxyXG5mdW5jdGlvbiBmaW5kT2NjbHVkZXJWaXN1YWxOb2RlKGNvbGxpZGVyTm9kZTogYW55LCBncm91bmROb2RlOiBhbnkpOiBhbnkgfCBudWxsIHtcbiAgICBpZiAoY29sbGlkZXJOb2RlPy5nZXRDb21wb25lbnQ/LihjYy5TcHJpdGUpKSByZXR1cm4gY29sbGlkZXJOb2RlO1xuICAgIGxldCBhbmNlc3RvciA9IGNvbGxpZGVyTm9kZT8ucGFyZW50O1xuICAgIHdoaWxlIChhbmNlc3Rvcikge1xuICAgICAgICBpZiAoYW5jZXN0b3IuZ2V0Q29tcG9uZW50Py4oY2MuU3ByaXRlKSkgcmV0dXJuIGFuY2VzdG9yO1xuICAgICAgICBpZiAoYW5jZXN0b3IgPT09IGdyb3VuZE5vZGUpIGJyZWFrO1xuICAgICAgICBhbmNlc3RvciA9IGFuY2VzdG9yLnBhcmVudDtcbiAgICB9XG4gICAgbGV0IHJlc3VsdDogYW55ID0gbnVsbDtcbiAgICBjb2xsaWRlck5vZGU/LndhbGs/Ligobm9kZTogYW55KSA9PiB7XG4gICAgICAgIGlmICghcmVzdWx0ICYmIG5vZGU/LmdldENvbXBvbmVudD8uKGNjLlNwcml0ZSkpIHJlc3VsdCA9IG5vZGU7XG4gICAgfSk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gY29sbGVjdE9jY2x1ZGVycyhcbiAgICBncm91bmRzOiBQcmV2aWV3R3JvdW5kU3RhdGVbXSxcbiAgICBwcmV2aW91czogUHJldmlld09jY2x1ZGVyU3RhdGVbXSA9IFtdLFxuKTogUHJldmlld09jY2x1ZGVyU3RhdGVbXSB7XG4gICAgY29uc3QgcmVzdWx0OiBQcmV2aWV3T2NjbHVkZXJTdGF0ZVtdID0gW107XG4gICAgY29uc3Qgc2VlbiA9IG5ldyBTZXQ8YW55PigpO1xuICAgIGNvbnN0IHByZXZpb3VzQnlDb2xsaWRlciA9IG5ldyBNYXAocHJldmlvdXMubWFwKChpdGVtKSA9PiBbaXRlbS5jb2xsaWRlciwgaXRlbV0pKTtcbiAgICBmb3IgKGNvbnN0IGdyb3VuZCBvZiBncm91bmRzKSB7XG4gICAgICAgIGdyb3VuZC5ub2RlLndhbGsoKG5vZGU6IGFueSkgPT4ge1xuICAgICAgICAgICAgaWYgKHNlZW4uaGFzKG5vZGUpKSByZXR1cm47XG4gICAgICAgICAgICBjb25zdCBjb2xsaWRlciA9IGZpbmRFZGl0aW5nQ29sbGlkZXIobm9kZSk7XG4gICAgICAgICAgICBjb25zdCB0cmFuc2Zvcm0gPSBub2RlLmdldENvbXBvbmVudD8uKGNjLlVJVHJhbnNmb3JtKTtcbiAgICAgICAgICAgIGlmICghY29sbGlkZXIgfHwgIXRyYW5zZm9ybSkgcmV0dXJuO1xuICAgICAgICAgICAgY29uc3QgdmlzdWFsTm9kZSA9IGZpbmRPY2NsdWRlclZpc3VhbE5vZGUobm9kZSwgZ3JvdW5kLm5vZGUpO1xuICAgICAgICAgICAgaWYgKCF2aXN1YWxOb2RlKSByZXR1cm47XG4gICAgICAgICAgICBzZWVuLmFkZChub2RlKTtcbiAgICAgICAgICAgIGNvbnN0IHByZXZpb3VzU3RhdGUgPSBwcmV2aW91c0J5Q29sbGlkZXIuZ2V0KGNvbGxpZGVyKTtcbiAgICAgICAgICAgIGNvbnN0IG9wYWNpdHlDb21wb25lbnQgPSB2aXN1YWxOb2RlLmdldENvbXBvbmVudD8uKGNjLlVJT3BhY2l0eSk7XG4gICAgICAgICAgICByZXN1bHQucHVzaCh7XG4gICAgICAgICAgICAgICAgbm9kZTogdmlzdWFsTm9kZSxcbiAgICAgICAgICAgICAgICBjb2xsaWRlck5vZGU6IG5vZGUsXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtLFxuICAgICAgICAgICAgICAgIGNvbGxpZGVyLFxuICAgICAgICAgICAgICAgIGJhc2VPcGFjaXR5OiBwcmV2aW91c1N0YXRlPy5iYXNlT3BhY2l0eSA/PyBOdW1iZXIob3BhY2l0eUNvbXBvbmVudD8ub3BhY2l0eSA/PyAyNTUpLFxuICAgICAgICAgICAgICAgIGdyb3VuZE5hbWU6IGdyb3VuZC5uYW1lLFxuICAgICAgICAgICAgICAgIGxheWVySW5kZXg6IGdyb3VuZC5sYXllckluZGV4LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0O1xufVxyXG5cclxuZnVuY3Rpb24gb2NjbHVkZXJBYWJiKG9jY2x1ZGVyOiBQcmV2aWV3T2NjbHVkZXJTdGF0ZSk6IHtcclxuICAgIGNlbnRlclg6IG51bWJlcjtcclxuICAgIGNlbnRlclk6IG51bWJlcjtcclxuICAgIGhhbGZXaWR0aDogbnVtYmVyO1xyXG4gICAgaGFsZkhlaWdodDogbnVtYmVyO1xyXG59IHtcclxuICAgIGNvbnN0IHsgY29sbGlkZXJOb2RlOiBub2RlLCB0cmFuc2Zvcm0sIGNvbGxpZGVyIH0gPSBvY2NsdWRlcjtcbiAgICBjb25zdCB3b3JsZCA9IG5vZGUud29ybGRQb3NpdGlvbiB8fCBub2RlLnBvc2l0aW9uIHx8IHsgeDogMCwgeTogMCB9O1xyXG4gICAgY29uc3Qgc2NhbGUgPSBub2RlLndvcmxkU2NhbGUgfHwgbm9kZS5zY2FsZSB8fCB7IHg6IDEsIHk6IDEgfTtcclxuICAgIGNvbnN0IHNjYWxlWCA9IE51bWJlcihzY2FsZS54KSB8fCAxO1xyXG4gICAgY29uc3Qgc2NhbGVZID0gTnVtYmVyKHNjYWxlLnkpIHx8IDE7XHJcbiAgICBjb25zdCBhbmNob3JPZmZzZXRYID0gKE51bWJlcih0cmFuc2Zvcm0uYW5jaG9yWCkgLSAwLjUpICogTnVtYmVyKHRyYW5zZm9ybS53aWR0aCkgKiBzY2FsZVg7XHJcbiAgICBjb25zdCBhbmNob3JPZmZzZXRZID0gKE51bWJlcih0cmFuc2Zvcm0uYW5jaG9yWSkgLSAwLjUpICogTnVtYmVyKHRyYW5zZm9ybS5oZWlnaHQpICogc2NhbGVZO1xyXG4gICAgY29uc3QgY2VudGVyWCA9IE51bWJlcih3b3JsZC54KSArIGFuY2hvck9mZnNldFg7XHJcbiAgICBjb25zdCBjZW50ZXJZID0gTnVtYmVyKHdvcmxkLnkpICsgYW5jaG9yT2Zmc2V0WTtcclxuICAgIGNvbnN0IHR5cGUgPSBOdW1iZXIoY29sbGlkZXIuY29sbGlkZXJUeXBlID8/IGNvbGxpZGVyLl9jb2xsaWRlclR5cGUgPz8gMCk7XHJcbiAgICBpZiAodHlwZSA9PT0gMSkge1xyXG4gICAgICAgIGNvbnN0IHJhZGl1cyA9IE1hdGguYWJzKE51bWJlcihjb2xsaWRlci5jaXJjbGVSYWRpdXMpIHx8IDApICogTWF0aC5tYXgoTWF0aC5hYnMoc2NhbGVYKSwgTWF0aC5hYnMoc2NhbGVZKSk7XHJcbiAgICAgICAgcmV0dXJuIHsgY2VudGVyWCwgY2VudGVyWSwgaGFsZldpZHRoOiByYWRpdXMsIGhhbGZIZWlnaHQ6IHJhZGl1cyB9O1xyXG4gICAgfVxyXG4gICAgaWYgKHR5cGUgPT09IDIgJiYgQXJyYXkuaXNBcnJheShjb2xsaWRlci5wb2x5Z29uPy5fcG9pbnRzKSAmJiBjb2xsaWRlci5wb2x5Z29uLl9wb2ludHMubGVuZ3RoKSB7XHJcbiAgICAgICAgY29uc3QgYW5nbGUgPSAoTnVtYmVyKG5vZGUuYW5nbGUpIHx8IDApICogTWF0aC5QSSAvIDE4MDtcclxuICAgICAgICBjb25zdCBjb3MgPSBNYXRoLmNvcyhhbmdsZSk7XHJcbiAgICAgICAgY29uc3Qgc2luID0gTWF0aC5zaW4oYW5nbGUpO1xyXG4gICAgICAgIGxldCBtaW5YID0gSW5maW5pdHk7IGxldCBtYXhYID0gLUluZmluaXR5OyBsZXQgbWluWSA9IEluZmluaXR5OyBsZXQgbWF4WSA9IC1JbmZpbml0eTtcclxuICAgICAgICBmb3IgKGNvbnN0IHBvaW50IG9mIGNvbGxpZGVyLnBvbHlnb24uX3BvaW50cykge1xyXG4gICAgICAgICAgICBjb25zdCB4ID0gTnVtYmVyKHBvaW50LngpICogc2NhbGVYO1xyXG4gICAgICAgICAgICBjb25zdCB5ID0gTnVtYmVyKHBvaW50LnkpICogc2NhbGVZO1xyXG4gICAgICAgICAgICBjb25zdCByb3RhdGVkWCA9IHggKiBjb3MgLSB5ICogc2luO1xyXG4gICAgICAgICAgICBjb25zdCByb3RhdGVkWSA9IHggKiBzaW4gKyB5ICogY29zO1xyXG4gICAgICAgICAgICBtaW5YID0gTWF0aC5taW4obWluWCwgcm90YXRlZFgpOyBtYXhYID0gTWF0aC5tYXgobWF4WCwgcm90YXRlZFgpO1xyXG4gICAgICAgICAgICBtaW5ZID0gTWF0aC5taW4obWluWSwgcm90YXRlZFkpOyBtYXhZID0gTWF0aC5tYXgobWF4WSwgcm90YXRlZFkpO1xyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBjZW50ZXJYOiBjZW50ZXJYICsgKG1pblggKyBtYXhYKSAvIDIsXHJcbiAgICAgICAgICAgIGNlbnRlclk6IGNlbnRlclkgKyAobWluWSArIG1heFkpIC8gMixcclxuICAgICAgICAgICAgaGFsZldpZHRoOiAobWF4WCAtIG1pblgpIC8gMixcclxuICAgICAgICAgICAgaGFsZkhlaWdodDogKG1heFkgLSBtaW5ZKSAvIDIsXHJcbiAgICAgICAgfTtcclxuICAgIH1cclxuICAgIGlmICh0eXBlID09PSAzKSB7XHJcbiAgICAgICAgY29uc3QgYW5nbGUgPSAoTnVtYmVyKG5vZGUuYW5nbGUpIHx8IDApICogTWF0aC5QSSAvIDE4MDtcclxuICAgICAgICBjb25zdCBsb2NhbFggPSBOdW1iZXIoY29sbGlkZXIuc2VjdG9yQ2VudGVyWCkgKiBzY2FsZVg7XHJcbiAgICAgICAgY29uc3QgbG9jYWxZID0gTnVtYmVyKGNvbGxpZGVyLnNlY3RvckNlbnRlclkpICogc2NhbGVZO1xyXG4gICAgICAgIGNvbnN0IHJvdGF0ZWRYID0gbG9jYWxYICogTWF0aC5jb3MoYW5nbGUpIC0gbG9jYWxZICogTWF0aC5zaW4oYW5nbGUpO1xyXG4gICAgICAgIGNvbnN0IHJvdGF0ZWRZID0gbG9jYWxYICogTWF0aC5zaW4oYW5nbGUpICsgbG9jYWxZICogTWF0aC5jb3MoYW5nbGUpO1xyXG4gICAgICAgIGNvbnN0IHJhZGl1cyA9IE1hdGguYWJzKE51bWJlcihjb2xsaWRlci5zZWN0b3JSYWRpdXMpIHx8IDApICogTWF0aC5tYXgoTWF0aC5hYnMoc2NhbGVYKSwgTWF0aC5hYnMoc2NhbGVZKSk7XHJcbiAgICAgICAgcmV0dXJuIHsgY2VudGVyWDogY2VudGVyWCArIHJvdGF0ZWRYLCBjZW50ZXJZOiBjZW50ZXJZICsgcm90YXRlZFksIGhhbGZXaWR0aDogcmFkaXVzLCBoYWxmSGVpZ2h0OiByYWRpdXMgfTtcclxuICAgIH1cclxuICAgIGlmICh0eXBlID09PSA0KSB7XHJcbiAgICAgICAgY29uc3QgYW5nbGUgPSAoTnVtYmVyKG5vZGUuYW5nbGUpIHx8IDApICogTWF0aC5QSSAvIDE4MDtcclxuICAgICAgICBjb25zdCB0cmFuc2Zvcm1Qb2ludCA9ICh4OiBudW1iZXIsIHk6IG51bWJlcikgPT4gKHtcclxuICAgICAgICAgICAgeDogY2VudGVyWCArIHggKiBzY2FsZVggKiBNYXRoLmNvcyhhbmdsZSkgLSB5ICogc2NhbGVZICogTWF0aC5zaW4oYW5nbGUpLFxyXG4gICAgICAgICAgICB5OiBjZW50ZXJZICsgeCAqIHNjYWxlWCAqIE1hdGguc2luKGFuZ2xlKSArIHkgKiBzY2FsZVkgKiBNYXRoLmNvcyhhbmdsZSksXHJcbiAgICAgICAgfSk7XHJcbiAgICAgICAgY29uc3Qgc3RhcnQgPSB0cmFuc2Zvcm1Qb2ludChOdW1iZXIoY29sbGlkZXIuc2VnbWVudFN0YXJ0WCkgfHwgMCwgTnVtYmVyKGNvbGxpZGVyLnNlZ21lbnRTdGFydFkpIHx8IDApO1xyXG4gICAgICAgIGNvbnN0IGVuZCA9IHRyYW5zZm9ybVBvaW50KE51bWJlcihjb2xsaWRlci5zZWdtZW50RW5kWCkgfHwgMCwgTnVtYmVyKGNvbGxpZGVyLnNlZ21lbnRFbmRZKSB8fCAwKTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBjZW50ZXJYOiAoc3RhcnQueCArIGVuZC54KSAvIDIsIGNlbnRlclk6IChzdGFydC55ICsgZW5kLnkpIC8gMixcclxuICAgICAgICAgICAgaGFsZldpZHRoOiBNYXRoLm1heCgyLCBNYXRoLmFicyhlbmQueCAtIHN0YXJ0LngpIC8gMiksIGhhbGZIZWlnaHQ6IE1hdGgubWF4KDIsIE1hdGguYWJzKGVuZC55IC0gc3RhcnQueSkgLyAyKSxcclxuICAgICAgICB9O1xyXG4gICAgfVxyXG4gICAgY29uc3QgcmF3SGFsZldpZHRoID0gTWF0aC5hYnMoKE51bWJlcihjb2xsaWRlci5yZWN0V2lkdGgpIHx8IDApICogc2NhbGVYKSAvIDI7XHJcbiAgICBjb25zdCByYXdIYWxmSGVpZ2h0ID0gTWF0aC5hYnMoKE51bWJlcihjb2xsaWRlci5yZWN0SGVpZ2h0KSB8fCAwKSAqIHNjYWxlWSkgLyAyO1xyXG4gICAgY29uc3QgYW5nbGUgPSAoTnVtYmVyKG5vZGUuYW5nbGUpIHx8IDApICogTWF0aC5QSSAvIDE4MDtcclxuICAgIGNvbnN0IGNvcyA9IE1hdGguYWJzKE1hdGguY29zKGFuZ2xlKSk7XHJcbiAgICBjb25zdCBzaW4gPSBNYXRoLmFicyhNYXRoLnNpbihhbmdsZSkpO1xyXG4gICAgcmV0dXJuIHtcclxuICAgICAgICBjZW50ZXJYLFxyXG4gICAgICAgIGNlbnRlclksXHJcbiAgICAgICAgaGFsZldpZHRoOiByYXdIYWxmV2lkdGggKiBjb3MgKyByYXdIYWxmSGVpZ2h0ICogc2luLFxyXG4gICAgICAgIGhhbGZIZWlnaHQ6IHJhd0hhbGZXaWR0aCAqIHNpbiArIHJhd0hhbGZIZWlnaHQgKiBjb3MsXHJcbiAgICB9O1xyXG59XHJcblxyXG5mdW5jdGlvbiByZWN0RnJvbUFhYmIoYWFiYjogeyBjZW50ZXJYOiBudW1iZXI7IGNlbnRlclk6IG51bWJlcjsgaGFsZldpZHRoOiBudW1iZXI7IGhhbGZIZWlnaHQ6IG51bWJlciB9KTogUmVjdExpa2Uge1xyXG4gICAgcmV0dXJuIHsgeDogYWFiYi5jZW50ZXJYIC0gYWFiYi5oYWxmV2lkdGgsIHk6IGFhYmIuY2VudGVyWSAtIGFhYmIuaGFsZkhlaWdodCwgd2lkdGg6IGFhYmIuaGFsZldpZHRoICogMiwgaGVpZ2h0OiBhYWJiLmhhbGZIZWlnaHQgKiAyIH07XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGNvbGxlY3RGZWF0dXJlUmFuZ2VzKHNlc3Npb246IFByZXZpZXdTZXNzaW9uKTogQXJyYXk8UmVjdExpa2UgJiB7IGtpbmQ6IHN0cmluZzsgbGFiZWw6IHN0cmluZyB9PiB7XHJcbiAgICBjb25zdCByYW5nZXM6IEFycmF5PFJlY3RMaWtlICYgeyBraW5kOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmcgfT4gPSBbXTtcclxuICAgIGZvciAoY29uc3Qgb2NjbHVkZXIgb2Ygc2Vzc2lvbi5vY2NsdWRlcnMpIHtcclxuICAgICAgICByYW5nZXMucHVzaCh7XG4gICAgICAgICAgICAuLi5yZWN0RnJvbUFhYmIob2NjbHVkZXJBYWJiKG9jY2x1ZGVyKSksXG4gICAgICAgICAgICBraW5kOiAnb2NjbHVzaW9uJyxcbiAgICAgICAgICAgIGxhYmVsOiBg6YGu5oyh5Zu+6Jma5YyWIMK3ICR7b2NjbHVkZXIuZ3JvdW5kTmFtZX0gwrcgJHtvY2NsdWRlci5ub2RlLm5hbWUgfHwgJ1Nwcml0ZSd9YCxcbiAgICAgICAgfSk7XG4gICAgfVxyXG4gICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgY29sbGVjdEVkaXRpbmdQcmVmYWJSZWZzKHNlc3Npb24ucm9vdCkpIHtcclxuICAgICAgICBpZiAoIWNvbXBvbmVudD8uZW5hYmxlQUFCQikgY29udGludWU7XHJcbiAgICAgICAgY29uc3QgcG9zaXRpb24gPSBjb21wb25lbnQubm9kZT8ud29ybGRQb3NpdGlvbiB8fCB7IHg6IDAsIHk6IDAgfTtcclxuICAgICAgICBjb25zdCBzY2FsZSA9IGNvbXBvbmVudC5ub2RlPy53b3JsZFNjYWxlIHx8IHsgeDogMSwgeTogMSB9O1xyXG4gICAgICAgIGNvbnN0IHdpZHRoID0gTWF0aC5hYnMoTnVtYmVyKGNvbXBvbmVudC5hYWJiV2lkdGggfHwgMCkgKiBOdW1iZXIoc2NhbGUueCB8fCAxKSk7XHJcbiAgICAgICAgY29uc3QgaGVpZ2h0ID0gTWF0aC5hYnMoTnVtYmVyKGNvbXBvbmVudC5hYWJiSGVpZ2h0IHx8IDApICogTnVtYmVyKHNjYWxlLnkgfHwgMSkpO1xyXG4gICAgICAgIHJhbmdlcy5wdXNoKHtcclxuICAgICAgICAgICAgeDogTnVtYmVyKHBvc2l0aW9uLngpICsgTnVtYmVyKGNvbXBvbmVudC5hYWJiT2Zmc2V0WCB8fCAwKSAqIE51bWJlcihzY2FsZS54IHx8IDEpIC0gd2lkdGggLyAyLFxyXG4gICAgICAgICAgICB5OiBOdW1iZXIocG9zaXRpb24ueSkgKyBOdW1iZXIoY29tcG9uZW50LmFhYmJPZmZzZXRZIHx8IDApICogTnVtYmVyKHNjYWxlLnkgfHwgMSkgLSBoZWlnaHQgLyAyLFxyXG4gICAgICAgICAgICB3aWR0aCwgaGVpZ2h0LCBraW5kOiAnZWZmZWN0JywgbGFiZWw6IGDnibnmlYjmv4DmtLsgwrcgJHtjb21wb25lbnQubm9kZT8ubmFtZSB8fCAnUHJlZmFiJ31gLFxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG4gICAgc2Vzc2lvbi5yb290LndhbGsoKG5vZGU6IGFueSkgPT4ge1xyXG4gICAgICAgIGNvbnN0IGNvbXBvbmVudHMgPSB0eXBlb2Ygbm9kZT8uZ2V0Q29tcG9uZW50cyA9PT0gJ2Z1bmN0aW9uJyA/IG5vZGUuZ2V0Q29tcG9uZW50cyhjYy5Db21wb25lbnQpIDogW107XHJcbiAgICAgICAgY29uc3QgZW50aXR5ID0gY29tcG9uZW50cy5maW5kKChjb21wb25lbnQ6IGFueSkgPT4gY2xhc3NOYW1lT2YoY29tcG9uZW50KS5lbmRzV2l0aCgnRWRpdGluZ0VudGl0eScpKTtcclxuICAgICAgICBpZiAoIWVudGl0eSB8fCAhQXJyYXkuaXNBcnJheShlbnRpdHkuY29sbGlkZXJzKSkgcmV0dXJuO1xyXG4gICAgICAgIGZvciAoY29uc3QgbmFtZWQgb2YgZW50aXR5LmNvbGxpZGVycykge1xyXG4gICAgICAgICAgICBjb25zdCBjb2xsaWRlciA9IG5hbWVkPy5jb2xsaWRlcjtcclxuICAgICAgICAgICAgY29uc3QgdHJhbnNmb3JtID0gY29sbGlkZXI/Lm5vZGU/LmdldENvbXBvbmVudD8uKGNjLlVJVHJhbnNmb3JtKTtcclxuICAgICAgICAgICAgaWYgKCFjb2xsaWRlciB8fCAhdHJhbnNmb3JtKSBjb250aW51ZTtcclxuICAgICAgICAgICAgY29uc3QgdHlwZSA9IE51bWJlcihuYW1lZC50eXBlKTtcclxuICAgICAgICAgICAgY29uc3Qga2luZCA9IHR5cGUgPT09IDEgPyAnb3BhY2l0eS1iYXJyaWVyJyA6IHR5cGUgPT09IDIgPyAndHJpZ2dlcicgOiAnYmFycmllcic7XHJcbiAgICAgICAgICAgIGNvbnN0IHR5cGVMYWJlbCA9IHR5cGUgPT09IDEgPyAn6YCP5piO6Zqc56KNJyA6IHR5cGUgPT09IDIgPyAn6Kem5Y+R5ZmoJyA6ICfnjq/looPnorDmkp4nO1xyXG4gICAgICAgICAgICByYW5nZXMucHVzaCh7XHJcbiAgICAgICAgICAgICAgICAuLi5yZWN0RnJvbUFhYmIob2NjbHVkZXJBYWJiKHtcbiAgICAgICAgICAgICAgICAgICAgbm9kZTogY29sbGlkZXIubm9kZSxcbiAgICAgICAgICAgICAgICAgICAgY29sbGlkZXJOb2RlOiBjb2xsaWRlci5ub2RlLFxuICAgICAgICAgICAgICAgICAgICB0cmFuc2Zvcm0sXG4gICAgICAgICAgICAgICAgICAgIGNvbGxpZGVyLFxuICAgICAgICAgICAgICAgICAgICBiYXNlT3BhY2l0eTogMjU1LFxuICAgICAgICAgICAgICAgICAgICBncm91bmROYW1lOiAnJyxcbiAgICAgICAgICAgICAgICAgICAgbGF5ZXJJbmRleDogMCxcbiAgICAgICAgICAgICAgICB9KSksXG4gICAgICAgICAgICAgICAga2luZCwgbGFiZWw6IGAke3R5cGVMYWJlbH0gwrcgJHtlbnRpdHkuZW50aXR5SWQgfHwgbm9kZS5uYW1lIHx8IG5hbWVkLm5hbWV9YCxcclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gcmFuZ2VzLmZpbHRlcigocmFuZ2UpID0+IHJhbmdlLndpZHRoID4gMCAmJiByYW5nZS5oZWlnaHQgPiAwKTtcclxufVxyXG5cclxuZnVuY3Rpb24gdXBkYXRlRm9yZWdyb3VuZE9jY2x1c2lvbihcbiAgICBzZXNzaW9uOiBQcmV2aWV3U2Vzc2lvbixcclxuICAgIGlucHV0OiBSZW5kZXJQcmV2aWV3SW5wdXQsXHJcbiAgICBwbGF5ZXJYOiBudW1iZXIsXHJcbiAgICBwbGF5ZXJZOiBudW1iZXIsXHJcbik6IHsgdG90YWw6IG51bWJlcjsgZmFkZWQ6IG51bWJlcjsgbWF4Q292ZXJhZ2U6IG51bWJlcjsgbWluaW11bU9wYWNpdHk6IG51bWJlcjsgZmFkZWRMYXllcnM6IHN0cmluZ1tdIH0ge1xuICAgIGNvbnN0IHdpZHRoID0gTWF0aC5tYXgoMSwgTnVtYmVyKGlucHV0LmNvbGxpZGVyV2lkdGgpIHx8IDE0MCk7XHJcbiAgICBjb25zdCBoZWlnaHQgPSBNYXRoLm1heCgxLCBOdW1iZXIoaW5wdXQuY29sbGlkZXJIZWlnaHQpIHx8IDE4MCk7XHJcbiAgICBjb25zdCBoYWxmV2lkdGggPSB3aWR0aCAvIDI7XHJcbiAgICBjb25zdCBoYWxmSGVpZ2h0ID0gaGVpZ2h0IC8gMjtcclxuICAgIGNvbnN0IGNoYXJhY3RlclggPSBwbGF5ZXJYICsgKE51bWJlcihpbnB1dC5jb2xsaWRlck9mZnNldFgpIHx8IDApO1xyXG4gICAgY29uc3QgY2hhcmFjdGVyWSA9IHBsYXllclkgKyAoTnVtYmVyKGlucHV0LmNvbGxpZGVyT2Zmc2V0WSkgfHwgNzUpO1xyXG4gICAgbGV0IGZhZGVkID0gMDtcbiAgICBsZXQgbWF4Q292ZXJhZ2UgPSAwO1xuICAgIGxldCBtaW5pbXVtT3BhY2l0eSA9IDI1NTtcbiAgICBjb25zdCBmYWRlZExheWVycyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuICAgIGNvbnN0IG9wYWNpdHlCeU5vZGUgPSBuZXcgTWFwPGFueSwgeyBvcGFjaXR5OiBudW1iZXI7IGJhc2VPcGFjaXR5OiBudW1iZXIgfT4oKTtcbiAgICBmb3IgKGNvbnN0IG9jY2x1ZGVyIG9mIHNlc3Npb24ub2NjbHVkZXJzKSB7XG4gICAgICAgIGNvbnN0IGFhYmIgPSBvY2NsdWRlckFhYmIob2NjbHVkZXIpO1xyXG4gICAgICAgIGNvbnN0IG92ZXJsYXBYID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oY2hhcmFjdGVyWCArIGhhbGZXaWR0aCwgYWFiYi5jZW50ZXJYICsgYWFiYi5oYWxmV2lkdGgpXHJcbiAgICAgICAgICAgIC0gTWF0aC5tYXgoY2hhcmFjdGVyWCAtIGhhbGZXaWR0aCwgYWFiYi5jZW50ZXJYIC0gYWFiYi5oYWxmV2lkdGgpKTtcclxuICAgICAgICBjb25zdCBvdmVybGFwWSA9IE1hdGgubWF4KDAsIE1hdGgubWluKGNoYXJhY3RlclkgKyBoYWxmSGVpZ2h0LCBhYWJiLmNlbnRlclkgKyBhYWJiLmhhbGZIZWlnaHQpXHJcbiAgICAgICAgICAgIC0gTWF0aC5tYXgoY2hhcmFjdGVyWSAtIGhhbGZIZWlnaHQsIGFhYmIuY2VudGVyWSAtIGFhYmIuaGFsZkhlaWdodCkpO1xyXG4gICAgICAgIGNvbnN0IHhSYXRpbyA9IG92ZXJsYXBYIC8gd2lkdGg7XHJcbiAgICAgICAgY29uc3QgeVJhdGlvID0gb3ZlcmxhcFkgLyBoZWlnaHQ7XHJcbiAgICAgICAgY29uc3Qga2V5UG9pbnRzID0gW1xyXG4gICAgICAgICAgICBbY2hhcmFjdGVyWCwgY2hhcmFjdGVyWV0sXHJcbiAgICAgICAgICAgIFtjaGFyYWN0ZXJYIC0gaGFsZldpZHRoLCBjaGFyYWN0ZXJZICsgaGFsZkhlaWdodF0sXHJcbiAgICAgICAgICAgIFtjaGFyYWN0ZXJYICsgaGFsZldpZHRoLCBjaGFyYWN0ZXJZICsgaGFsZkhlaWdodF0sXHJcbiAgICAgICAgICAgIFtjaGFyYWN0ZXJYIC0gaGFsZldpZHRoLCBjaGFyYWN0ZXJZIC0gaGFsZkhlaWdodF0sXHJcbiAgICAgICAgICAgIFtjaGFyYWN0ZXJYICsgaGFsZldpZHRoLCBjaGFyYWN0ZXJZIC0gaGFsZkhlaWdodF0sXHJcbiAgICAgICAgXTtcclxuICAgICAgICBjb25zdCBjb3ZlcmVkUG9pbnRzID0ga2V5UG9pbnRzLmZpbHRlcigoW3gsIHldKSA9PiAoXHJcbiAgICAgICAgICAgIE1hdGguYWJzKHggLSBhYWJiLmNlbnRlclgpIDw9IGFhYmIuaGFsZldpZHRoXHJcbiAgICAgICAgICAgICYmIE1hdGguYWJzKHkgLSBhYWJiLmNlbnRlclkpIDw9IGFhYmIuaGFsZkhlaWdodFxyXG4gICAgICAgICkpLmxlbmd0aDtcclxuICAgICAgICBjb25zdCBjb3ZlcmFnZSA9IE1hdGgubWluKDEsIHhSYXRpbyAqIHlSYXRpbyAqIDAuNiArIGNvdmVyZWRQb2ludHMgLyA1ICogMC40KTtcclxuICAgICAgICBjb25zdCBlbmFibGVkID0gaW5wdXQuZW5hYmxlRm9yZWdyb3VuZE9jY2x1c2lvbiAhPT0gZmFsc2U7XG4gICAgICAgIGNvbnN0IG9wYWNpdHkgPSBlbmFibGVkICYmIGNvdmVyYWdlID4gMFxuICAgICAgICAgICAgPyBNYXRoLm1pbihvY2NsdWRlci5iYXNlT3BhY2l0eSwgTWF0aC5yb3VuZCgyNTUgLSA5NSAqIGNvdmVyYWdlKSlcbiAgICAgICAgICAgIDogb2NjbHVkZXIuYmFzZU9wYWNpdHk7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nID0gb3BhY2l0eUJ5Tm9kZS5nZXQob2NjbHVkZXIubm9kZSk7XG4gICAgICAgIGlmICghZXhpc3RpbmcgfHwgb3BhY2l0eSA8IGV4aXN0aW5nLm9wYWNpdHkpIHtcbiAgICAgICAgICAgIG9wYWNpdHlCeU5vZGUuc2V0KG9jY2x1ZGVyLm5vZGUsIHsgb3BhY2l0eSwgYmFzZU9wYWNpdHk6IG9jY2x1ZGVyLmJhc2VPcGFjaXR5IH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChlbmFibGVkICYmIGNvdmVyYWdlID4gMCkge1xuICAgICAgICAgICAgZmFkZWQgKz0gMTtcbiAgICAgICAgICAgIGZhZGVkTGF5ZXJzLmFkZChvY2NsdWRlci5ncm91bmROYW1lIHx8IGDlsYIgJHtvY2NsdWRlci5sYXllckluZGV4fWApO1xuICAgICAgICB9XG4gICAgICAgIG1heENvdmVyYWdlID0gTWF0aC5tYXgobWF4Q292ZXJhZ2UsIGNvdmVyYWdlKTtcbiAgICAgICAgbWluaW11bU9wYWNpdHkgPSBNYXRoLm1pbihtaW5pbXVtT3BhY2l0eSwgb3BhY2l0eSk7XG4gICAgfVxuICAgIGZvciAoY29uc3QgW25vZGUsIHN0YXRlXSBvZiBvcGFjaXR5QnlOb2RlKSB7XG4gICAgICAgIGxldCBvcGFjaXR5Q29tcG9uZW50ID0gbm9kZS5nZXRDb21wb25lbnQ/LihjYy5VSU9wYWNpdHkpO1xuICAgICAgICBpZiAoIW9wYWNpdHlDb21wb25lbnQpIG9wYWNpdHlDb21wb25lbnQgPSBub2RlLmFkZENvbXBvbmVudD8uKGNjLlVJT3BhY2l0eSk7XG4gICAgICAgIGlmIChvcGFjaXR5Q29tcG9uZW50KSBvcGFjaXR5Q29tcG9uZW50Lm9wYWNpdHkgPSBzdGF0ZS5vcGFjaXR5O1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgICB0b3RhbDogc2Vzc2lvbi5vY2NsdWRlcnMubGVuZ3RoLFxuICAgICAgICBmYWRlZCxcbiAgICAgICAgbWF4Q292ZXJhZ2UsXG4gICAgICAgIG1pbmltdW1PcGFjaXR5LFxuICAgICAgICBmYWRlZExheWVyczogWy4uLmZhZGVkTGF5ZXJzXSxcbiAgICB9O1xufVxuXHJcbmZ1bmN0aW9uIGFwcGx5UGFyYWxsYXgoc2Vzc2lvbjogUHJldmlld1Nlc3Npb24sIGNhbWVyYVg6IG51bWJlciwgY2FtZXJhWTogbnVtYmVyKTogQXJyYXk8e1xuICAgIGxheWVySW5kZXg6IG51bWJlcjtcbiAgICBuYW1lOiBzdHJpbmc7XG4gICAgd2lkdGg6IG51bWJlcjtcbiAgICBoZWlnaHQ6IG51bWJlcjtcbiAgICBvZmZzZXRYOiBudW1iZXI7XHJcbiAgICBvZmZzZXRZOiBudW1iZXI7XHJcbiAgICByYXRlWDogbnVtYmVyO1xyXG4gICAgcmF0ZVk6IG51bWJlcjtcclxufT4ge1xyXG4gICAgY29uc3Qgc3RhdGVzID0gW107XHJcbiAgICBmb3IgKGNvbnN0IGdyb3VuZCBvZiBzZXNzaW9uLmdyb3VuZHMpIHtcclxuICAgICAgICAvLyBSdW50aW1lIHVzZXMgb25lIGNhbWVyYSBwZXIgbGF5ZXIgYXQgbWFzdGVyQ2FtZXJhICogcmF0ZS4gVGhpcyBvZmZzY3JlZW5cclxuICAgICAgICAvLyBwcmV2aWV3IHVzZXMgb25lIGNhbWVyYSwgc28gbW92aW5nIHRoZSBsYXllciBieSBtYXN0ZXJDYW1lcmEgKiAoMS1yYXRlKVxyXG4gICAgICAgIC8vIGlzIHRoZSBleGFjdCBlcXVpdmFsZW50IHRyYW5zZm9ybWF0aW9uLlxyXG4gICAgICAgIGNvbnN0IG9mZnNldFggPSBjYW1lcmFYICogKDEgLSBncm91bmQucmF0ZVgpO1xyXG4gICAgICAgIGNvbnN0IG9mZnNldFkgPSBjYW1lcmFZICogKDEgLSBncm91bmQucmF0ZVkpO1xyXG4gICAgICAgIGdyb3VuZC5ub2RlLnNldFBvc2l0aW9uKFxyXG4gICAgICAgICAgICBncm91bmQub3JpZ2luLnggKyBvZmZzZXRYLFxyXG4gICAgICAgICAgICBncm91bmQub3JpZ2luLnkgKyBvZmZzZXRZLFxyXG4gICAgICAgICAgICBncm91bmQub3JpZ2luLnosXHJcbiAgICAgICAgKTtcclxuICAgICAgICBzdGF0ZXMucHVzaCh7XG4gICAgICAgICAgICBsYXllckluZGV4OiBncm91bmQubGF5ZXJJbmRleCxcbiAgICAgICAgICAgIG5hbWU6IGdyb3VuZC5uYW1lLFxuICAgICAgICAgICAgd2lkdGg6IGdyb3VuZC5jb25maWd1cmVkV2lkdGgsXG4gICAgICAgICAgICBoZWlnaHQ6IGdyb3VuZC5jb25maWd1cmVkSGVpZ2h0LFxuICAgICAgICAgICAgb2Zmc2V0WCxcclxuICAgICAgICAgICAgb2Zmc2V0WSxcclxuICAgICAgICAgICAgcmF0ZVg6IGdyb3VuZC5yYXRlWCxcclxuICAgICAgICAgICAgcmF0ZVk6IGdyb3VuZC5yYXRlWSxcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuICAgIHJldHVybiBzdGF0ZXM7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIGluaXRpYWxpemVQcmV2aWV3QW5pbWF0aW9ucyhzZXNzaW9uOiBQcmV2aWV3U2Vzc2lvbik6IHZvaWQge1xyXG4gICAgc2Vzc2lvbi5yb290LndhbGsoKG5vZGU6IGFueSkgPT4ge1xyXG4gICAgICAgIGlmICghbm9kZT8uYWN0aXZlSW5IaWVyYXJjaHkpIHJldHVybjtcclxuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gdHlwZW9mIG5vZGUuZ2V0Q29tcG9uZW50cyA9PT0gJ2Z1bmN0aW9uJyA/IG5vZGUuZ2V0Q29tcG9uZW50cyhjYy5Db21wb25lbnQpIDogW107XHJcbiAgICAgICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgY29tcG9uZW50cykge1xyXG4gICAgICAgICAgICBpZiAoY29tcG9uZW50Py5lbmFibGVkID09PSBmYWxzZSB8fCBzZXNzaW9uLmluaXRpYWxpemVkQW5pbWF0aW9ucy5oYXMoY29tcG9uZW50KSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGNvbnN0IG5hbWUgPSBjbGFzc05hbWVPZihjb21wb25lbnQpO1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgaWYgKG5hbWUuZW5kc1dpdGgoJ1NrZWxldG9uJykpIHtcclxuICAgICAgICAgICAgICAgICAgICAvLyBTa2VsZXRvbi51cGRhdGVBbmltYXRpb24gaW50ZW50aW9uYWxseSBlYXJseS1vdXRzIGluIGVkaXQgbW9kZSB1bmxlc3MgdGhpc1xyXG4gICAgICAgICAgICAgICAgICAgIC8vIHByaXZhdGUgcHJldmlldyBmbGFnIGlzIGVuYWJsZWQgKENyZWF0b3IgMy44LjYgYmVoYXZpb3IpLlxyXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudC5faXNQcmV2aWV3SW5FZGl0b3IgPSB0cnVlO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudC5wYXVzZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgICAgICBjb25zdCBhbmltYXRpb25OYW1lID0gU3RyaW5nKGNvbXBvbmVudC5kZWZhdWx0QW5pbWF0aW9uIHx8IGNvbXBvbmVudC5hbmltYXRpb24gfHwgY29tcG9uZW50Ll9hbmltYXRpb25OYW1lIHx8ICcnKTtcclxuICAgICAgICAgICAgICAgICAgICBpZiAoYW5pbWF0aW9uTmFtZSAmJiB0eXBlb2YgY29tcG9uZW50LnNldEFuaW1hdGlvbiA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQuc2V0QW5pbWF0aW9uKDAsIGFuaW1hdGlvbk5hbWUsIGNvbXBvbmVudC5sb29wICE9PSBmYWxzZSk7XHJcbiAgICAgICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgICAgIHNlc3Npb24uaW5pdGlhbGl6ZWRBbmltYXRpb25zLmFkZChjb21wb25lbnQpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChuYW1lLmVuZHNXaXRoKCdBbmltYXRpb24nKSkge1xyXG4gICAgICAgICAgICAgICAgICAgIGlmIChjb21wb25lbnQuZGVmYXVsdENsaXAgfHwgY29tcG9uZW50Ll9kZWZhdWx0Q2xpcCkgY29tcG9uZW50LnBsYXk/LigpO1xyXG4gICAgICAgICAgICAgICAgICAgIHNlc3Npb24uaW5pdGlhbGl6ZWRBbmltYXRpb25zLmFkZChjb21wb25lbnQpO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChuYW1lLmVuZHNXaXRoKCdQYXJ0aWNsZVN5c3RlbTJEJykpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQucmVzZXRTeXN0ZW0/LigpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudC5wbGF5Py4oKTtcclxuICAgICAgICAgICAgICAgICAgICBzZXNzaW9uLmluaXRpYWxpemVkQW5pbWF0aW9ucy5hZGQoY29tcG9uZW50KTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobmFtZS5lbmRzV2l0aCgnSW5maW5pdHlTY3JvbGxJbWFnZScpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc2Vzc2lvbi5pbml0aWFsaXplZEFuaW1hdGlvbnMuYWRkKGNvbXBvbmVudCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gY2F0Y2gge1xyXG4gICAgICAgICAgICAgICAgLy8gT25lIG1hbGZvcm1lZCBzY2VuZSBlZmZlY3Qgc2hvdWxkIG5vdCBibG9jayB0aGUgcmVtYWluaW5nIGxheWVycy5cclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG59XHJcblxyXG5mdW5jdGlvbiBhZHZhbmNlUHJldmlld0FuaW1hdGlvbnMoc2Vzc2lvbjogUHJldmlld1Nlc3Npb24sIGRlbHRhVGltZTogbnVtYmVyKTogbnVtYmVyIHtcclxuICAgIGNvbnN0IGR0ID0gTWF0aC5tYXgoMCwgTWF0aC5taW4oMC4xLCBOdW1iZXIoZGVsdGFUaW1lKSB8fCAwKSk7XHJcbiAgICBpZiAoZHQgPD0gMCkgcmV0dXJuIDA7XHJcbiAgICBsZXQgYWR2YW5jZWQgPSAwO1xyXG4gICAgc2Vzc2lvbi5yb290LndhbGsoKG5vZGU6IGFueSkgPT4ge1xyXG4gICAgICAgIGlmICghbm9kZT8uYWN0aXZlSW5IaWVyYXJjaHkpIHJldHVybjtcclxuICAgICAgICBjb25zdCBjb21wb25lbnRzID0gdHlwZW9mIG5vZGUuZ2V0Q29tcG9uZW50cyA9PT0gJ2Z1bmN0aW9uJyA/IG5vZGUuZ2V0Q29tcG9uZW50cyhjYy5Db21wb25lbnQpIDogW107XHJcbiAgICAgICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgY29tcG9uZW50cykge1xyXG4gICAgICAgICAgICBpZiAoY29tcG9uZW50Py5lbmFibGVkID09PSBmYWxzZSkgY29udGludWU7XHJcbiAgICAgICAgICAgIGNvbnN0IG5hbWUgPSBjbGFzc05hbWVPZihjb21wb25lbnQpO1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgaWYgKG5hbWUuZW5kc1dpdGgoJ1NrZWxldG9uJykgJiYgdHlwZW9mIGNvbXBvbmVudC51cGRhdGVBbmltYXRpb24gPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQuX2lzUHJldmlld0luRWRpdG9yID0gdHJ1ZTtcclxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQudXBkYXRlQW5pbWF0aW9uKGR0KTtcclxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlZCArPSAxO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChuYW1lLmVuZHNXaXRoKCdBbmltYXRpb24nKSAmJiB0eXBlb2YgY29tcG9uZW50Ll9jcm9zc0ZhZGU/LnVwZGF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudC5fY3Jvc3NGYWRlLnVwZGF0ZShkdCk7XHJcbiAgICAgICAgICAgICAgICAgICAgYWR2YW5jZWQgKz0gMTtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAobmFtZS5lbmRzV2l0aCgnUGFydGljbGVTeXN0ZW0yRCcpKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgaWYgKHR5cGVvZiBjb21wb25lbnQubGF0ZVVwZGF0ZSA9PT0gJ2Z1bmN0aW9uJykgY29tcG9uZW50LmxhdGVVcGRhdGUoZHQpO1xyXG4gICAgICAgICAgICAgICAgICAgIGVsc2UgY29tcG9uZW50LnVwZGF0ZT8uKGR0KTtcclxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlZCArPSAxO1xyXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChuYW1lLmVuZHNXaXRoKCdJbmZpbml0eVNjcm9sbEltYWdlJykgJiYgdHlwZW9mIGNvbXBvbmVudC51cGRhdGUgPT09ICdmdW5jdGlvbicpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnQudXBkYXRlKGR0KTtcclxuICAgICAgICAgICAgICAgICAgICBhZHZhbmNlZCArPSAxO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgICAgICAgIC8vIEEgYnJva2VuIGVmZmVjdCBtdXN0IG5vdCBzdG9wIHRoZSBwcmV2aWV3LlxyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfVxyXG4gICAgfSk7XHJcbiAgICByZXR1cm4gYWR2YW5jZWQ7XHJcbn1cclxuXHJcbmZ1bmN0aW9uIHVwZGF0ZVByZWZhYkFjdGl2YXRpb24oXHJcbiAgICBzZXNzaW9uOiBQcmV2aWV3U2Vzc2lvbixcclxuICAgIGNhbWVyYVg6IG51bWJlcixcclxuICAgIGNhbWVyYVk6IG51bWJlcixcclxuKTogeyBhY3RpdmU6IG51bWJlcjsgaW5hY3RpdmU6IG51bWJlcjsgbWlzc2luZ0FhYmI6IG51bWJlciB9IHtcclxuICAgIGNvbnN0IGhhbGZXaWR0aCA9IHNlc3Npb24ucnVudGltZUZyYW1lLnZpZXdwb3J0V29ybGRXaWR0aCAqIDAuNTI1O1xyXG4gICAgY29uc3QgaGFsZkhlaWdodCA9IHNlc3Npb24ucnVudGltZUZyYW1lLnZpZXdwb3J0V29ybGRIZWlnaHQgKiAwLjUyNTtcclxuICAgIGxldCBhY3RpdmUgPSAwO1xyXG4gICAgbGV0IGluYWN0aXZlID0gMDtcclxuICAgIGxldCBtaXNzaW5nQWFiYiA9IDA7XHJcbiAgICBmb3IgKGNvbnN0IGNvbXBvbmVudCBvZiBjb2xsZWN0RWRpdGluZ1ByZWZhYlJlZnMoc2Vzc2lvbi5yb290KSkge1xyXG4gICAgICAgIGNvbnN0IGluc3RhbmNlID0gY29tcG9uZW50Py5faW5zdGFuY2U7XHJcbiAgICAgICAgaWYgKCFpbnN0YW5jZSkgY29udGludWU7XHJcbiAgICAgICAgaWYgKCFjb21wb25lbnQuZW5hYmxlQUFCQikge1xyXG4gICAgICAgICAgICBpbnN0YW5jZS5hY3RpdmUgPSB0cnVlO1xyXG4gICAgICAgICAgICBhY3RpdmUgKz0gMTtcclxuICAgICAgICAgICAgbWlzc2luZ0FhYmIgKz0gMTtcclxuICAgICAgICAgICAgY29udGludWU7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIGNvbnN0IHBvc2l0aW9uID0gY29tcG9uZW50Lm5vZGU/LndvcmxkUG9zaXRpb24gfHwgeyB4OiAwLCB5OiAwIH07XHJcbiAgICAgICAgY29uc3Qgc2NhbGUgPSBjb21wb25lbnQubm9kZT8ud29ybGRTY2FsZSB8fCB7IHg6IDEsIHk6IDEgfTtcclxuICAgICAgICBjb25zdCBjZW50ZXJYID0gTnVtYmVyKHBvc2l0aW9uLngpICsgTnVtYmVyKGNvbXBvbmVudC5hYWJiT2Zmc2V0WCB8fCAwKSAqIE51bWJlcihzY2FsZS54IHx8IDEpO1xyXG4gICAgICAgIGNvbnN0IGNlbnRlclkgPSBOdW1iZXIocG9zaXRpb24ueSkgKyBOdW1iZXIoY29tcG9uZW50LmFhYmJPZmZzZXRZIHx8IDApICogTnVtYmVyKHNjYWxlLnkgfHwgMSk7XHJcbiAgICAgICAgY29uc3QgZWZmZWN0SGFsZldpZHRoID0gTWF0aC5hYnMoTnVtYmVyKGNvbXBvbmVudC5hYWJiV2lkdGggfHwgMCkgKiBOdW1iZXIoc2NhbGUueCB8fCAxKSkgLyAyO1xyXG4gICAgICAgIGNvbnN0IGVmZmVjdEhhbGZIZWlnaHQgPSBNYXRoLmFicyhOdW1iZXIoY29tcG9uZW50LmFhYmJIZWlnaHQgfHwgMCkgKiBOdW1iZXIoc2NhbGUueSB8fCAxKSkgLyAyO1xyXG4gICAgICAgIGNvbnN0IHZpc2libGUgPSBNYXRoLmFicyhjZW50ZXJYIC0gY2FtZXJhWCkgPD0gaGFsZldpZHRoICsgZWZmZWN0SGFsZldpZHRoXHJcbiAgICAgICAgICAgICYmIE1hdGguYWJzKGNlbnRlclkgLSBjYW1lcmFZKSA8PSBoYWxmSGVpZ2h0ICsgZWZmZWN0SGFsZkhlaWdodDtcclxuICAgICAgICBpbnN0YW5jZS5hY3RpdmUgPSB2aXNpYmxlO1xyXG4gICAgICAgIGlmICh2aXNpYmxlKSBhY3RpdmUgKz0gMTtcclxuICAgICAgICBlbHNlIGluYWN0aXZlICs9IDE7XHJcbiAgICB9XHJcbiAgICByZXR1cm4geyBhY3RpdmUsIGluYWN0aXZlLCBtaXNzaW5nQWFiYiB9O1xyXG59XHJcblxyXG5hc3luYyBmdW5jdGlvbiBzdGFydFByZXZpZXdTZXNzaW9uKGlucHV0OiBTdGFydFByZXZpZXdJbnB1dCk6IFByb21pc2U8YW55PiB7XHJcbiAgICBkaXNwb3NlU2Vzc2lvbigpO1xyXG4gICAgbGV0IHByZWZhYkFzc2V0OiBhbnkgPSBudWxsO1xyXG4gICAgbGV0IHJvb3Q6IGFueSA9IG51bGw7XHJcbiAgICBsZXQgY2FtZXJhTm9kZTogYW55ID0gbnVsbDtcclxuICAgIGxldCBjYW1lcmE6IGFueSA9IG51bGw7XHJcbiAgICBsZXQgcmVuZGVyVGV4dHVyZTogYW55ID0gbnVsbDtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgdmFsaWRhdGVSZW5kZXJlclZlcnNpb24oaW5wdXQucmVuZGVyZXJWZXJzaW9uKTtcclxuICAgICAgICBwcmVmYWJBc3NldCA9IGF3YWl0IGxvYWRQcmVmYWIoU3RyaW5nKGlucHV0LnV1aWQgfHwgJycpKTtcclxuICAgICAgICByb290ID0gY2MuaW5zdGFudGlhdGUocHJlZmFiQXNzZXQpO1xyXG4gICAgICAgIGNvbnN0IGN1cnJlbnRTY2VuZSA9IGNjLmRpcmVjdG9yLmdldFNjZW5lKCk7XHJcbiAgICAgICAgaWYgKCFjdXJyZW50U2NlbmUpIHRocm93IG5ldyBFcnJvcignQ29jb3Mgc2NlbmUgaXMgbm90IHJlYWR5LicpO1xyXG4gICAgICAgIGNvbnN0IHByZXZpZXdMYXllciA9IHNlbGVjdElzb2xhdGVkUHJldmlld0xheWVyKGN1cnJlbnRTY2VuZSk7XHJcbiAgICAgICAgcHJlcGFyZVByZWZhYkZvclByZXZpZXcocm9vdCwgcHJldmlld0xheWVyKTtcclxuICAgICAgICBjdXJyZW50U2NlbmUuYWRkQ2hpbGQocm9vdCk7XHJcbiAgICAgICAgcm9vdC5hY3RpdmUgPSB0cnVlO1xyXG4gICAgICAgIGFjdGl2YXRlUHJldmlld0hpZXJhcmNoeShyb290KTtcclxuICAgICAgICByb290LnVwZGF0ZVdvcmxkVHJhbnNmb3JtPy4oKTtcclxuICAgICAgICBjb25zdCBuZXN0ZWRQcmVmYWJDb3VudCA9IGF3YWl0IHdhaXRGb3JOZXN0ZWRQcmVmYWJSZWZzKHJvb3QsIHByZXZpZXdMYXllcik7XHJcbiAgICAgICAgcHJlcGFyZVByZWZhYkZvclByZXZpZXcocm9vdCwgcHJldmlld0xheWVyLCBmYWxzZSk7XHJcbiAgICAgICAgYWN0aXZhdGVQcmV2aWV3SGllcmFyY2h5KHJvb3QpO1xyXG4gICAgICAgIHJvb3QudXBkYXRlV29ybGRUcmFuc2Zvcm0/LigpO1xyXG5cclxuICAgICAgICBjb25zdCBjYW1lcmFQcm9maWxlID0gYXdhaXQgbG9hZFJ1bnRpbWVDYW1lcmFQcm9maWxlKFN0cmluZyhpbnB1dC5ydW50aW1lQ2FtZXJhVXVpZCB8fCAnJykpO1xyXG4gICAgICAgIGlmIChOdW1iZXIoaW5wdXQudmlld3BvcnRXaWR0aCkgPiAwKSBjYW1lcmFQcm9maWxlLnZpZXdwb3J0V2lkdGggPSBOdW1iZXIoaW5wdXQudmlld3BvcnRXaWR0aCk7XHJcbiAgICAgICAgaWYgKE51bWJlcihpbnB1dC52aWV3cG9ydEhlaWdodCkgPiAwKSBjYW1lcmFQcm9maWxlLnZpZXdwb3J0SGVpZ2h0ID0gTnVtYmVyKGlucHV0LnZpZXdwb3J0SGVpZ2h0KTtcclxuICAgICAgICBpZiAoTnVtYmVyKGlucHV0Lm9ydGhvSGVpZ2h0KSA+IDApIGNhbWVyYVByb2ZpbGUub3J0aG9IZWlnaHQgPSBOdW1iZXIoaW5wdXQub3J0aG9IZWlnaHQpO1xyXG4gICAgICAgIGNvbnN0IHJ1bnRpbWVGcmFtZSA9IHJlc29sdmVSdW50aW1lQ2FtZXJhU3dlZXAocm9vdCwgY29sbGVjdFZpc3VhbEJvdW5kcyhyb290KSwgY2FtZXJhUHJvZmlsZSwgaW5wdXQuYm91bmRhcnlTdGFnZSk7XG4gICAgICAgIGNvbnN0IG1heEVkZ2UgPSAxMjgwO1xyXG4gICAgICAgIGNvbnN0IHNjYWxlID0gTWF0aC5taW4oMSwgbWF4RWRnZSAvIE1hdGgubWF4KGNhbWVyYVByb2ZpbGUudmlld3BvcnRXaWR0aCwgY2FtZXJhUHJvZmlsZS52aWV3cG9ydEhlaWdodCkpO1xyXG4gICAgICAgIGNvbnN0IHRleHR1cmVTaXplID0ge1xyXG4gICAgICAgICAgICB3aWR0aDogTWF0aC5tYXgoMTI4LCBNYXRoLnJvdW5kKGNhbWVyYVByb2ZpbGUudmlld3BvcnRXaWR0aCAqIHNjYWxlKSksXHJcbiAgICAgICAgICAgIGhlaWdodDogTWF0aC5tYXgoMTI4LCBNYXRoLnJvdW5kKGNhbWVyYVByb2ZpbGUudmlld3BvcnRIZWlnaHQgKiBzY2FsZSkpLFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgcmVuZGVyVGV4dHVyZSA9IG5ldyBjYy5SZW5kZXJUZXh0dXJlKCk7XHJcbiAgICAgICAgcmVuZGVyVGV4dHVyZS5yZXNldCh0ZXh0dXJlU2l6ZSk7XHJcbiAgICAgICAgY2FtZXJhTm9kZSA9IG5ldyBjYy5Ob2RlKCdfX2JhdHRsZV9zY2VuZV9wcm9ncmVzc19wcmV2aWV3X2NhbWVyYV9fJyk7XHJcbiAgICAgICAgY2FtZXJhTm9kZS5hY3RpdmUgPSBmYWxzZTtcclxuICAgICAgICBjYW1lcmFOb2RlLmxheWVyID0gcHJldmlld0xheWVyO1xyXG4gICAgICAgIGN1cnJlbnRTY2VuZS5hZGRDaGlsZChjYW1lcmFOb2RlKTtcclxuICAgICAgICBjYW1lcmEgPSBjYW1lcmFOb2RlLmFkZENvbXBvbmVudChjYy5DYW1lcmEpO1xyXG4gICAgICAgIGNhbWVyYS5pbkVkaXRvck1vZGUgPSB0cnVlO1xyXG4gICAgICAgIGNhbWVyYS5wcm9qZWN0aW9uID0gY2FtZXJhUHJvZmlsZS5wcm9qZWN0aW9uO1xyXG4gICAgICAgIGNhbWVyYS52aXNpYmlsaXR5ID0gcHJldmlld0xheWVyO1xyXG4gICAgICAgIGNhbWVyYS5jbGVhckZsYWdzID0gY2MuQ2FtZXJhLkNsZWFyRmxhZy5TT0xJRF9DT0xPUjtcclxuICAgICAgICBjYW1lcmEuY2xlYXJDb2xvciA9IG5ldyBjYy5Db2xvcihDTEVBUl9DT0xPUi5yLCBDTEVBUl9DT0xPUi5nLCBDTEVBUl9DT0xPUi5iLCBDTEVBUl9DT0xPUi5hKTtcclxuICAgICAgICBjYW1lcmEub3J0aG9IZWlnaHQgPSBjYW1lcmFQcm9maWxlLm9ydGhvSGVpZ2h0O1xyXG4gICAgICAgIGNhbWVyYS5uZWFyID0gY2FtZXJhUHJvZmlsZS5uZWFyO1xyXG4gICAgICAgIGNhbWVyYS5mYXIgPSBjYW1lcmFQcm9maWxlLmZhcjtcclxuICAgICAgICBjYW1lcmEuZm92ID0gY2FtZXJhUHJvZmlsZS5mb3Y7XHJcbiAgICAgICAgY2FtZXJhLmZvdkF4aXMgPSBjYW1lcmFQcm9maWxlLmZvdkF4aXM7XHJcbiAgICAgICAgY2FtZXJhLnRhcmdldFRleHR1cmUgPSByZW5kZXJUZXh0dXJlO1xyXG4gICAgICAgIGNvbnN0IGJvcm4gPSByZWFkQm9yblBvaW50KHJvb3QsIHJ1bnRpbWVGcmFtZS5jYW1lcmFTdGFydFgsIHJ1bnRpbWVGcmFtZS5jZW50ZXJZKTtcclxuICAgICAgICBjYW1lcmFOb2RlLnNldFdvcmxkUG9zaXRpb24oYm9ybi54LCBydW50aW1lRnJhbWUuY2VudGVyWSwgY2FtZXJhUHJvZmlsZS5wb3NpdGlvblopO1xyXG4gICAgICAgIGNhbWVyYU5vZGUuYWN0aXZlID0gdHJ1ZTtcclxuICAgICAgICBjYW1lcmFOb2RlLnVwZGF0ZVdvcmxkVHJhbnNmb3JtPy4oKTtcclxuICAgICAgICBhY3RpdmF0ZVByZXZpZXdDYW1lcmEoY2FtZXJhKTtcclxuICAgICAgICBjb25zdCBncm91bmRzID0gY29sbGVjdEdyb3VuZFN0YXRlcyhyb290KTtcbiAgICAgICAgYXBwbHlDb25maWd1cmVkUmVuZGVyT3JkZXIocm9vdCwgZ3JvdW5kcyk7XG4gICAgICAgIGFjdGl2ZVNlc3Npb24gPSB7XHJcbiAgICAgICAgICAgIHByZWZhYkFzc2V0LCByb290LCBjYW1lcmFOb2RlLCBjYW1lcmEsIHJlbmRlclRleHR1cmUsIHByZXZpZXdMYXllcixcclxuICAgICAgICAgICAgdGV4dHVyZVNpemUsIGNhbWVyYVByb2ZpbGUsIHJ1bnRpbWVGcmFtZSxcclxuICAgICAgICAgICAgZ3JvdW5kcywgb2NjbHVkZXJzOiBjb2xsZWN0T2NjbHVkZXJzKGdyb3VuZHMpLCBib3JuLCBwb3NpdGlvbnM6IGNvbGxlY3RQb3NpdGlvbnMocm9vdCksXHJcbiAgICAgICAgICAgIGluaXRpYWxpemVkQW5pbWF0aW9uczogbmV3IFdlYWtTZXQ8b2JqZWN0PigpLCBuZXN0ZWRQcmVmYWJDb3VudCxcclxuICAgICAgICB9O1xyXG4gICAgICAgIGluaXRpYWxpemVQcmV2aWV3QW5pbWF0aW9ucyhhY3RpdmVTZXNzaW9uKTtcclxuICAgICAgICBhd2FpdCByZW5kZXJFZGl0b3JGcmFtZXMoMSk7XHJcbiAgICAgICAgcmV0dXJuIHtcclxuICAgICAgICAgICAgb2s6IHRydWUsXHJcbiAgICAgICAgICAgIGJvcm4sXG4gICAgICAgICAgICBwb3NpdGlvbnM6IGFjdGl2ZVNlc3Npb24ucG9zaXRpb25zLFxuICAgICAgICAgICAgYm91bmRhcmllczogY29sbGVjdEJvdW5kYXJ5R3VpZGVzKHJvb3QsIG5ldyBTZXQocnVudGltZUZyYW1lLmFjdGl2ZUJvdW5kYXJ5VHlwZXMpKSxcbiAgICAgICAgICAgIGJvdW5kYXJ5U3RhZ2U6IHJ1bnRpbWVGcmFtZS5ib3VuZGFyeVN0YWdlLFxuICAgICAgICAgICAgcmlnaHRCb3VuZGFyeUZhbGxiYWNrOiBydW50aW1lRnJhbWUucmlnaHRCb3VuZGFyeUZhbGxiYWNrLFxuICAgICAgICAgICAgYm91bmRhcnlWaWV3cG9ydENvbmZsaWN0OiBydW50aW1lRnJhbWUuYm91bmRhcnlWaWV3cG9ydENvbmZsaWN0LFxuICAgICAgICAgICAgYm91bmRhcnlWaWV3cG9ydE92ZXJmbG93OiBydW50aW1lRnJhbWUuYm91bmRhcnlWaWV3cG9ydE92ZXJmbG93LFxuICAgICAgICAgICAgYm91bmRhcnlGYWxsYmFja01vZGU6IHJ1bnRpbWVGcmFtZS5ib3VuZGFyeUZhbGxiYWNrTW9kZSxcbiAgICAgICAgICAgIGNhbWVyYUJvdW5kczoge1xuICAgICAgICAgICAgICAgIGxlZnQ6IHJ1bnRpbWVGcmFtZS5jYW1lcmFTdGFydFgsXHJcbiAgICAgICAgICAgICAgICByaWdodDogcnVudGltZUZyYW1lLmNhbWVyYUVuZFgsXHJcbiAgICAgICAgICAgICAgICBjZW50ZXJZOiBydW50aW1lRnJhbWUuY2VudGVyWSxcclxuICAgICAgICAgICAgfSxcclxuICAgICAgICAgICAgY2FtZXJhUHJvZmlsZToge1xyXG4gICAgICAgICAgICAgICAgdmlld3BvcnRXaWR0aDogY2FtZXJhUHJvZmlsZS52aWV3cG9ydFdpZHRoLFxyXG4gICAgICAgICAgICAgICAgdmlld3BvcnRIZWlnaHQ6IGNhbWVyYVByb2ZpbGUudmlld3BvcnRIZWlnaHQsXHJcbiAgICAgICAgICAgICAgICB2aWV3cG9ydFdvcmxkV2lkdGg6IHJ1bnRpbWVGcmFtZS52aWV3cG9ydFdvcmxkV2lkdGgsXHJcbiAgICAgICAgICAgICAgICB2aWV3cG9ydFdvcmxkSGVpZ2h0OiBydW50aW1lRnJhbWUudmlld3BvcnRXb3JsZEhlaWdodCxcclxuICAgICAgICAgICAgICAgIG9ydGhvSGVpZ2h0OiBjYW1lcmFQcm9maWxlLm9ydGhvSGVpZ2h0LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBsYXllcnM6IGFjdGl2ZVNlc3Npb24uZ3JvdW5kcy5tYXAoKGdyb3VuZCkgPT4gKHtcbiAgICAgICAgICAgICAgICBsYXllckluZGV4OiBncm91bmQubGF5ZXJJbmRleCxcbiAgICAgICAgICAgICAgICBuYW1lOiBncm91bmQubmFtZSxcbiAgICAgICAgICAgICAgICB3aWR0aDogZ3JvdW5kLmNvbmZpZ3VyZWRXaWR0aCxcbiAgICAgICAgICAgICAgICBoZWlnaHQ6IGdyb3VuZC5jb25maWd1cmVkSGVpZ2h0LFxuICAgICAgICAgICAgICAgIG1vdmVTcGVlZFJhdGVYOiBncm91bmQucmF0ZVgsXG4gICAgICAgICAgICAgICAgbW92ZVNwZWVkUmF0ZVk6IGdyb3VuZC5yYXRlWSxcclxuICAgICAgICAgICAgfSkpLFxyXG4gICAgICAgICAgICBuZXN0ZWRQcmVmYWJDb3VudCxcclxuICAgICAgICAgICAgb2NjbHVkZXJDb3VudDogYWN0aXZlU2Vzc2lvbi5vY2NsdWRlcnMubGVuZ3RoLFxyXG4gICAgICAgICAgICByZW5kZXJlclZlcnNpb246IFNDRU5FX1BSRVZJRVdfUkVOREVSRVJfVkVSU0lPTixcclxuICAgICAgICB9O1xyXG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICBkZXN0cm95UHJldmlld0NhbWVyYShjYW1lcmEpO1xyXG4gICAgICAgIGNhbWVyYU5vZGU/LmRlc3Ryb3k/LigpO1xyXG4gICAgICAgIHJvb3Q/LmRlc3Ryb3k/LigpO1xyXG4gICAgICAgIHJlbmRlclRleHR1cmU/LmRlc3Ryb3k/LigpO1xyXG4gICAgICAgIGlmIChwcmVmYWJBc3NldCAmJiB0eXBlb2YgY2MuYXNzZXRNYW5hZ2VyLnJlbGVhc2VBc3NldCA9PT0gJ2Z1bmN0aW9uJykgY2MuYXNzZXRNYW5hZ2VyLnJlbGVhc2VBc3NldChwcmVmYWJBc3NldCk7XHJcbiAgICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBtZXNzYWdlOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvciksIHJlbmRlcmVyVmVyc2lvbjogU0NFTkVfUFJFVklFV19SRU5ERVJFUl9WRVJTSU9OIH07XHJcbiAgICB9XHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlbmRlclByZXZpZXdGcmFtZShpbnB1dDogUmVuZGVyUHJldmlld0lucHV0KTogUHJvbWlzZTxhbnk+IHtcclxuICAgIHRyeSB7XHJcbiAgICAgICAgdmFsaWRhdGVSZW5kZXJlclZlcnNpb24oaW5wdXQucmVuZGVyZXJWZXJzaW9uKTtcclxuICAgICAgICBjb25zdCBzZXNzaW9uID0gYWN0aXZlU2Vzc2lvbjtcclxuICAgICAgICBpZiAoIXNlc3Npb24pIHRocm93IG5ldyBFcnJvcignUHJldmlldyBzZXNzaW9uIGlzIG5vdCBzdGFydGVkLicpO1xyXG4gICAgICAgIGNvbnN0IHJlcXVlc3RlZFggPSBOdW1iZXIuaXNGaW5pdGUoTnVtYmVyKGlucHV0LnBsYXllclgpKSA/IE51bWJlcihpbnB1dC5wbGF5ZXJYKSA6IHNlc3Npb24uYm9ybi54O1xyXG4gICAgICAgIGNvbnN0IHJlcXVlc3RlZFkgPSBOdW1iZXIuaXNGaW5pdGUoTnVtYmVyKGlucHV0LnBsYXllclkpKSA/IE51bWJlcihpbnB1dC5wbGF5ZXJZKSA6IHNlc3Npb24uYm9ybi55O1xyXG4gICAgICAgIGNvbnN0IHJlcXVlc3RlZENhbWVyYVggPSBOdW1iZXIuaXNGaW5pdGUoTnVtYmVyKGlucHV0LmNhbWVyYVgpKSA/IE51bWJlcihpbnB1dC5jYW1lcmFYKSA6IHJlcXVlc3RlZFg7XG4gICAgICAgIGNvbnN0IHJlcXVlc3RlZENhbWVyYVkgPSBOdW1iZXIuaXNGaW5pdGUoTnVtYmVyKGlucHV0LmNhbWVyYVkpKSA/IE51bWJlcihpbnB1dC5jYW1lcmFZKSA6IHNlc3Npb24ucnVudGltZUZyYW1lLmNlbnRlclk7XG4gICAgICAgIGNvbnN0IGZyZWVDYW1lcmEgPSBpbnB1dC5mcmVlQ2FtZXJhID09PSB0cnVlO1xyXG4gICAgICAgIGNvbnN0IGNhbWVyYVggPSBmcmVlQ2FtZXJhIHx8IGlucHV0LnJlc3BlY3RDYW1lcmFCb3VuZHMgPT09IGZhbHNlXHJcbiAgICAgICAgICAgID8gcmVxdWVzdGVkQ2FtZXJhWFxyXG4gICAgICAgICAgICA6IE1hdGgubWluKE1hdGgubWF4KHJlcXVlc3RlZENhbWVyYVgsIHNlc3Npb24ucnVudGltZUZyYW1lLmNhbWVyYVN0YXJ0WCksIHNlc3Npb24ucnVudGltZUZyYW1lLmNhbWVyYUVuZFgpO1xyXG4gICAgICAgIGNvbnN0IGNhbWVyYVkgPSBmcmVlQ2FtZXJhID8gcmVxdWVzdGVkQ2FtZXJhWSA6IHNlc3Npb24ucnVudGltZUZyYW1lLmNlbnRlclk7XHJcbiAgICAgICAgY29uc3Qgb3J0aG9IZWlnaHQgPSBNYXRoLm1heCgxLCBOdW1iZXIoaW5wdXQub3J0aG9IZWlnaHQpIHx8IHNlc3Npb24uY2FtZXJhUHJvZmlsZS5vcnRob0hlaWdodCk7XHJcbiAgICAgICAgc2Vzc2lvbi5jYW1lcmEub3J0aG9IZWlnaHQgPSBvcnRob0hlaWdodDtcclxuICAgICAgICBzZXNzaW9uLnJ1bnRpbWVGcmFtZS52aWV3cG9ydFdvcmxkSGVpZ2h0ID0gb3J0aG9IZWlnaHQgKiAyO1xyXG4gICAgICAgIHNlc3Npb24ucnVudGltZUZyYW1lLnZpZXdwb3J0V29ybGRXaWR0aCA9IHNlc3Npb24ucnVudGltZUZyYW1lLnZpZXdwb3J0V29ybGRIZWlnaHRcclxuICAgICAgICAgICAgKiBzZXNzaW9uLmNhbWVyYVByb2ZpbGUudmlld3BvcnRXaWR0aCAvIHNlc3Npb24uY2FtZXJhUHJvZmlsZS52aWV3cG9ydEhlaWdodDtcclxuICAgICAgICAvLyBBVkcgY29vcmRpbmF0ZXMgZHJpdmUgdGhlIG1hc3RlciBjYW1lcmEgaW4gd29ybGQgc3BhY2UuIExheWVyIHBhcmFsbGF4XG4gICAgICAgIC8vIHVzZXMgdGhlIHVuc2hha2VuIG1hc3RlciBwb3NpdGlvbjsgcnVudGltZSBhcHBsaWVzIHRoZSBzYW1lIHNoYWtlIG9mZnNldFxuICAgICAgICAvLyB0byBtYXN0ZXIgYW5kIGxheWVyIGNhbWVyYXMsIHNvIHNoYWtlIG11c3Qgbm90IGJlIG11bHRpcGxpZWQgYnkgbGF5ZXIgcmF0ZS5cbiAgICAgICAgY29uc3QgcGFyYWxsYXhDYW1lcmFYID0gTnVtYmVyLmlzRmluaXRlKE51bWJlcihpbnB1dC5wYXJhbGxheENhbWVyYVgpKVxuICAgICAgICAgICAgPyBOdW1iZXIoaW5wdXQucGFyYWxsYXhDYW1lcmFYKVxuICAgICAgICAgICAgOiBjYW1lcmFYO1xuICAgICAgICBjb25zdCBwYXJhbGxheENhbWVyYVkgPSBOdW1iZXIuaXNGaW5pdGUoTnVtYmVyKGlucHV0LnBhcmFsbGF4Q2FtZXJhWSkpXG4gICAgICAgICAgICA/IE51bWJlcihpbnB1dC5wYXJhbGxheENhbWVyYVkpXG4gICAgICAgICAgICA6IGNhbWVyYVk7XG4gICAgICAgIGNvbnN0IGxheWVyU3RhdGVzID0gYXBwbHlQYXJhbGxheChzZXNzaW9uLCBwYXJhbGxheENhbWVyYVgsIHBhcmFsbGF4Q2FtZXJhWSk7XG4gICAgICAgIGFwcGx5Q29uZmlndXJlZFJlbmRlck9yZGVyKHNlc3Npb24ucm9vdCwgc2Vzc2lvbi5ncm91bmRzKTtcbiAgICAgICAgY29uc3QgZWRpdGluZ1NjZW5lID0gc2Vzc2lvbi5yb290LmdldENvbXBvbmVudD8uKCdiYXR0bGUuZWRpdG9yLkVkaXRpbmdTY2VuZScpO1xuICAgICAgICBjb25zdCByb2FkQ29tcG9uZW50ID0gZWRpdGluZ1NjZW5lPy5yb2FkTGF5ZXI7XG4gICAgICAgIGNvbnN0IHJvYWRMYXllciA9IHJvYWRDb21wb25lbnQgPyB7XG4gICAgICAgICAgICBuYW1lOiBTdHJpbmcocm9hZENvbXBvbmVudC5ub2RlPy5uYW1lIHx8ICdSb2FkJyksXG4gICAgICAgICAgICB3aWR0aDogTnVtYmVyKHJvYWRDb21wb25lbnQud2lkdGgpIHx8IDAsXG4gICAgICAgICAgICBoZWlnaHQ6IE51bWJlcihyb2FkQ29tcG9uZW50LmhlaWdodCkgfHwgMCxcbiAgICAgICAgfSA6IG51bGw7XG4gICAgICAgIHNlc3Npb24ucm9vdC51cGRhdGVXb3JsZFRyYW5zZm9ybT8uKCk7XHJcbiAgICAgICAgY29uc3QgbGF5ZXJCb3VuZHMgPSBpbnB1dC5zaG93TGF5ZXJCb3VuZHMgPyBjb25maWd1cmVkTGF5ZXJCb3VuZHMoc2Vzc2lvbikgOiBbXTtcbiAgICAgICAgY29uc3QgZmVhdHVyZVJhbmdlcyA9IGlucHV0LnNob3dGZWF0dXJlUmFuZ2VzID8gY29sbGVjdEZlYXR1cmVSYW5nZXMoc2Vzc2lvbikgOiBbXTtcclxuICAgICAgICBjb25zdCBlZmZlY3RzID0gdXBkYXRlUHJlZmFiQWN0aXZhdGlvbihzZXNzaW9uLCBjYW1lcmFYLCBjYW1lcmFZKTtcclxuICAgICAgICBpbml0aWFsaXplUHJldmlld0FuaW1hdGlvbnMoc2Vzc2lvbik7XG4gICAgICAgIGNvbnN0IGFkdmFuY2VkQW5pbWF0aW9ucyA9IGFkdmFuY2VQcmV2aWV3QW5pbWF0aW9ucyhzZXNzaW9uLCBOdW1iZXIoaW5wdXQuZGVsdGFUaW1lKSB8fCAwKTtcbiAgICAgICAgc2Vzc2lvbi5jYW1lcmFOb2RlLnNldFdvcmxkUG9zaXRpb24oY2FtZXJhWCwgY2FtZXJhWSwgc2Vzc2lvbi5jYW1lcmFQcm9maWxlLnBvc2l0aW9uWik7XG4gICAgICAgIHNlc3Npb24uY2FtZXJhTm9kZS51cGRhdGVXb3JsZFRyYW5zZm9ybT8uKCk7XG4gICAgICAgIGxldCBvY2NsdXNpb24gPSB7IHRvdGFsOiAwLCBmYWRlZDogMCwgbWF4Q292ZXJhZ2U6IDAsIG1pbmltdW1PcGFjaXR5OiAyNTUsIGZhZGVkTGF5ZXJzOiBbXSBhcyBzdHJpbmdbXSB9O1xuICAgICAgICBhd2FpdCByZW5kZXJQcmV2aWV3RnJhbWVzKHNlc3Npb24uY2FtZXJhLCBzZXNzaW9uLnJvb3QsIHNlc3Npb24ucHJldmlld0xheWVyLCAxLCAoKSA9PiB7XG4gICAgICAgICAgICAvLyBOZXN0ZWQgZWRpdG9yIHByZWZhYnMgY2FuIGZpbmlzaCBsb2FkaW5nIGFmdGVyIHRoZSBwcmV2aWV3IHNlc3Npb24gc3RhcnRzLlxuICAgICAgICAgICAgLy8gUmVmcmVzaCB0aGUgY29sbGVjdGlvbiwgdGhlbiBhcHBseSBvcGFjaXR5IGFmdGVyIGVkaXRvciBjb21wb25lbnRzIGhhdmVcbiAgICAgICAgICAgIC8vIHVwZGF0ZWQgc28gdGhlaXIgb3duIHJlZnJlc2ggY2Fubm90IG92ZXJ3cml0ZSB0aGUgcHJldmlldyBmYWRlLlxuICAgICAgICAgICAgc2Vzc2lvbi5vY2NsdWRlcnMgPSBjb2xsZWN0T2NjbHVkZXJzKHNlc3Npb24uZ3JvdW5kcywgc2Vzc2lvbi5vY2NsdWRlcnMpO1xuICAgICAgICAgICAgb2NjbHVzaW9uID0gdXBkYXRlRm9yZWdyb3VuZE9jY2x1c2lvbihzZXNzaW9uLCBpbnB1dCwgcmVxdWVzdGVkWCwgcmVxdWVzdGVkWSk7XG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBwaXhlbHMgPSBzZXNzaW9uLnJlbmRlclRleHR1cmUucmVhZFBpeGVscygpO1xyXG4gICAgICAgIGNvbnN0IGV4cGVjdGVkTGVuZ3RoID0gc2Vzc2lvbi50ZXh0dXJlU2l6ZS53aWR0aCAqIHNlc3Npb24udGV4dHVyZVNpemUuaGVpZ2h0ICogNDtcclxuICAgICAgICBpZiAoIXBpeGVscyB8fCBwaXhlbHMubGVuZ3RoICE9PSBleHBlY3RlZExlbmd0aCkgdGhyb3cgbmV3IEVycm9yKCdSZW5kZXJUZXh0dXJlIHJldHVybmVkIG5vIFJHQkEgcGl4ZWxzLicpO1xyXG4gICAgICAgIGlmICghaGFzU2NlbmVDb250ZW50UGl4ZWxzKHBpeGVscykpIHtcclxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBSZW5kZXJlZCBmcmFtZSBjb250YWlucyBvbmx5IHRoZSBjbGVhciBjb2xvci4gRGlhZ25vc3RpY3M6ICR7SlNPTi5zdHJpbmdpZnkoXHJcbiAgICAgICAgICAgICAgICBjb2xsZWN0UmVuZGVyRGlhZ25vc3RpY3Moc2Vzc2lvbi5yb290LCBzZXNzaW9uLmNhbWVyYSwgc2Vzc2lvbi5ydW50aW1lRnJhbWUuYm91bmRzLCBzZXNzaW9uLnRleHR1cmVTaXplKSxcclxuICAgICAgICAgICAgKX1gKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgd3JpdGVSZ2JhUG5nKGlucHV0Lm91dHB1dFBhdGgsIHBpeGVscywgc2Vzc2lvbi50ZXh0dXJlU2l6ZS53aWR0aCwgc2Vzc2lvbi50ZXh0dXJlU2l6ZS5oZWlnaHQpO1xyXG4gICAgICAgIGNvbnN0IGhhbGZWaWV3V2lkdGggPSBzZXNzaW9uLnJ1bnRpbWVGcmFtZS52aWV3cG9ydFdvcmxkV2lkdGggLyAyO1xyXG4gICAgICAgIGNvbnN0IGhhbGZWaWV3SGVpZ2h0ID0gc2Vzc2lvbi5ydW50aW1lRnJhbWUudmlld3BvcnRXb3JsZEhlaWdodCAvIDI7XHJcbiAgICAgICAgY29uc3QgYm91bmRzID0gc2Vzc2lvbi5ydW50aW1lRnJhbWUuYm91bmRzO1xyXG4gICAgICAgIGNvbnN0IGV4cG9zdXJlID0ge1xyXG4gICAgICAgICAgICBsZWZ0OiBNYXRoLm1heCgwLCBib3VuZHMueCAtIChjYW1lcmFYIC0gaGFsZlZpZXdXaWR0aCkpLFxyXG4gICAgICAgICAgICByaWdodDogTWF0aC5tYXgoMCwgY2FtZXJhWCArIGhhbGZWaWV3V2lkdGggLSAoYm91bmRzLnggKyBib3VuZHMud2lkdGgpKSxcclxuICAgICAgICAgICAgYm90dG9tOiBNYXRoLm1heCgwLCBib3VuZHMueSAtIChjYW1lcmFZIC0gaGFsZlZpZXdIZWlnaHQpKSxcclxuICAgICAgICAgICAgdG9wOiBNYXRoLm1heCgwLCBjYW1lcmFZICsgaGFsZlZpZXdIZWlnaHQgLSAoYm91bmRzLnkgKyBib3VuZHMuaGVpZ2h0KSksXHJcbiAgICAgICAgfTtcclxuICAgICAgICByZXR1cm4ge1xyXG4gICAgICAgICAgICBvazogdHJ1ZSxcclxuICAgICAgICAgICAgd2lkdGg6IHNlc3Npb24udGV4dHVyZVNpemUud2lkdGgsXHJcbiAgICAgICAgICAgIGhlaWdodDogc2Vzc2lvbi50ZXh0dXJlU2l6ZS5oZWlnaHQsXHJcbiAgICAgICAgICAgIHBsYXllcjogeyB4OiByZXF1ZXN0ZWRYLCB5OiByZXF1ZXN0ZWRZIH0sXHJcbiAgICAgICAgICAgIGNhbWVyYTogeyB4OiBjYW1lcmFYLCB5OiBjYW1lcmFZIH0sXHJcbiAgICAgICAgICAgIGNhbWVyYVByb2ZpbGU6IHtcclxuICAgICAgICAgICAgICAgIHZpZXdwb3J0V29ybGRXaWR0aDogc2Vzc2lvbi5ydW50aW1lRnJhbWUudmlld3BvcnRXb3JsZFdpZHRoLFxyXG4gICAgICAgICAgICAgICAgdmlld3BvcnRXb3JsZEhlaWdodDogc2Vzc2lvbi5ydW50aW1lRnJhbWUudmlld3BvcnRXb3JsZEhlaWdodCxcclxuICAgICAgICAgICAgICAgIG9ydGhvSGVpZ2h0LFxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICBjYW1lcmFMaW1pdGVkOiBNYXRoLmFicyhyZXF1ZXN0ZWRDYW1lcmFYIC0gY2FtZXJhWCkgPiAwLjAwMSxcclxuICAgICAgICAgICAgZXhwb3N1cmU6IHsgLi4uZXhwb3N1cmUsIHZpc2libGU6IE9iamVjdC52YWx1ZXMoZXhwb3N1cmUpLnNvbWUoKHZhbHVlKSA9PiB2YWx1ZSA+IDEpIH0sXHJcbiAgICAgICAgICAgIGVmZmVjdHMsXHJcbiAgICAgICAgICAgIG9jY2x1c2lvbixcclxuICAgICAgICAgICAgYWR2YW5jZWRBbmltYXRpb25zLFxyXG4gICAgICAgICAgICBsYXllcnM6IGxheWVyU3RhdGVzLFxuICAgICAgICAgICAgcm9hZExheWVyLFxuICAgICAgICAgICAgbGF5ZXJCb3VuZHMsXHJcbiAgICAgICAgICAgIGZlYXR1cmVSYW5nZXMsXHJcbiAgICAgICAgICAgIGNvbGxpZGVyOiB7XHJcbiAgICAgICAgICAgICAgICB3aWR0aDogTnVtYmVyKGlucHV0LmNvbGxpZGVyV2lkdGgpIHx8IDE0MCxcclxuICAgICAgICAgICAgICAgIGhlaWdodDogTnVtYmVyKGlucHV0LmNvbGxpZGVySGVpZ2h0KSB8fCAxODAsXHJcbiAgICAgICAgICAgICAgICBvZmZzZXRYOiBOdW1iZXIoaW5wdXQuY29sbGlkZXJPZmZzZXRYKSB8fCAwLFxyXG4gICAgICAgICAgICAgICAgb2Zmc2V0WTogTnVtYmVyKGlucHV0LmNvbGxpZGVyT2Zmc2V0WSkgfHwgNzUsXHJcbiAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgIHJlbmRlcmVyVmVyc2lvbjogU0NFTkVfUFJFVklFV19SRU5ERVJFUl9WRVJTSU9OLFxyXG4gICAgICAgIH07XHJcbiAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgbWVzc2FnZTogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpLCByZW5kZXJlclZlcnNpb246IFNDRU5FX1BSRVZJRVdfUkVOREVSRVJfVkVSU0lPTiB9O1xyXG4gICAgfVxyXG59XHJcblxyXG5mdW5jdGlvbiBzdG9wUHJldmlld1Nlc3Npb24oKTogeyBvazogdHJ1ZSB9IHtcclxuICAgIGRpc3Bvc2VTZXNzaW9uKCk7XHJcbiAgICByZXR1cm4geyBvazogdHJ1ZSB9O1xyXG59XHJcblxyXG5leHBvcnQgZnVuY3Rpb24gbG9hZCgpOiB2b2lkIHtcclxuICAgIGNvbnNvbGUubG9nKCdbdGFibGVfZGF0YV92aXN1YWxpemVyXVtzY2VuZV0gbG9hZGVkJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB1bmxvYWQoKTogdm9pZCB7XHJcbiAgICBkaXNwb3NlU2Vzc2lvbigpO1xyXG4gICAgY29uc29sZS5sb2coJ1tiYXR0bGUtc2NlbmUtcHJldmlld11bc2NlbmVdIHVubG9hZGVkJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBjb25zdCBtZXRob2RzID0ge1xyXG4gICAgc3RhcnRQcmV2aWV3U2Vzc2lvbixcclxuICAgIHJlbmRlclByZXZpZXdGcmFtZSxcclxuICAgIHN0b3BQcmV2aWV3U2Vzc2lvbixcclxufTtcclxuIl19