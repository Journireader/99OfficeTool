import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { loadAvgConfigs } from './avg-config';

const packageJSON = JSON.parse(
    fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'),
) as { name: string };

const PACKAGE_NAME = packageJSON.name;
const DESIGN_DIR = path.join('assets', 'resources', 'battle-scene', 'design');
const DESIGN_URL = 'db://assets/resources/battle-scene/design';
const RUNTIME_CAMERA_URL = 'db://assets/resources/battle-scene/runtime/scene/BattleRoadView.prefab';
const FRAME_DIR = path.join(__dirname, '..', '.local', 'frames');
const SETTINGS_FILE = path.join(__dirname, '..', '.local', 'settings.json');
const RENDERER_VERSION = 14;

interface AssetInfo {
    uuid?: string;
    url?: string;
}

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

function collectSceneSummary(filePath: string, relativePath: string, uuid: string): SceneSummary {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Array<Record<string, any>>;
    const editingScene = raw.find((item) => (
        item?.__type__ === 'battle.editor.EditingScene'
        || (item?.roadLayer && Array.isArray(item?.groundLayers) && Array.isArray(item?.boundaries))
    ));
    const camera = raw.find((item) => item?.__type__ === 'cc.Camera');
    const layers = raw
        .filter((item) => item?.__type__ === 'battle.editor.EditingScene.GroundInfo')
        .map((item) => ({
            layerIndex: Number(item.layerIndex) || 0,
            moveSpeedRateX: Number(item.moveSpeedRateX) || 0,
            moveSpeedRateY: Number(item.moveSpeedRateY) || 0,
        }))
        .sort((left, right) => left.layerIndex - right.layerIndex);
    const warnings: string[] = [];
    if (!editingScene) warnings.push('缺少 EditingScene 组件');
    if (!editingScene?.roadLayer) warnings.push('缺少道路层');
    if (!layers.length) warnings.push('没有配置场景层');
    const duplicateLayers = layers.filter((item, index) => (
        layers.findIndex((candidate) => candidate.layerIndex === item.layerIndex) !== index
    ));
    if (duplicateLayers.length) warnings.push('存在重复层级索引');

    const normalized = relativePath.replace(/\\/g, '/').replace(/\.prefab$/i, '');
    return {
        name: path.basename(filePath, '.prefab'),
        url: `${DESIGN_URL}/${normalized}.prefab`,
        relativePath: normalized,
        uuid,
        layers,
        positions: Array.isArray(editingScene?.positions) ? editingScene!.positions.length : 0,
        boundaries: Array.isArray(editingScene?.boundaries) ? editingScene!.boundaries.length : 0,
        spineCount: raw.filter((item) => item?.__type__ === 'sp.Skeleton').length,
        prefabEffectCount: raw.filter((item) => item?.prefabRef && item?.enableAABB !== undefined).length,
        orthoHeight: Number(camera?._orthoHeight) || 760,
        warnings,
    };
}

async function queryUuid(url: string): Promise<string> {
    const info = await Editor.Message.request('asset-db', 'query-asset-info', url) as AssetInfo | null;
    return String(info?.uuid || '');
}

async function listScenes(): Promise<SceneSummary[]> {
    const root = path.join(Editor.Project.path, DESIGN_DIR);
    if (!fs.existsSync(root)) return [];
    const assetList = await Editor.Message.request('asset-db', 'query-assets', {
        pattern: `${DESIGN_URL}/*.prefab`,
    }) as AssetInfo[] | null;
    const uuidByUrl = new Map(
        (Array.isArray(assetList) ? assetList : [])
            .map((item) => [String(item.url || ''), String(item.uuid || '')]),
    );
    const files = fs.readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.prefab'))
        .map((entry) => path.join(root, entry.name));
    const summaries: SceneSummary[] = [];
    for (const filePath of files.sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))) {
        const relativePath = path.relative(root, filePath);
        const normalized = relativePath.replace(/\\/g, '/');
        const url = `${DESIGN_URL}/${normalized}`;
        try {
            summaries.push(collectSceneSummary(filePath, relativePath, uuidByUrl.get(url) || await queryUuid(url)));
        } catch (error) {
            summaries.push({
                name: path.basename(filePath, '.prefab'), url,
                relativePath: normalized.replace(/\.prefab$/i, ''), uuid: '', layers: [],
                positions: 0, boundaries: 0, spineCount: 0, prefabEffectCount: 0,
                orthoHeight: 760,
                warnings: [`读取失败：${error instanceof Error ? error.message : String(error)}`],
            });
        }
    }
    return summaries;
}

async function sceneRequest(method: string, args: unknown[]): Promise<any> {
    return await Editor.Message.request('scene', 'execute-scene-script', {
        name: PACKAGE_NAME,
        method,
        args,
    });
}

export const methods = {
    openPanel(): void {
        Editor.Panel.open(PACKAGE_NAME);
    },
    async listScenes(): Promise<SceneSummary[]> {
        return await listScenes();
    },
    async listAvgConfigs(input?: { filePath?: string }) {
        const filePath = path.normalize(String(input?.filePath || path.join(Editor.Project.path, 'configtable', 'Animation.xlsx')));
        return { ok: true, filePath, configs: await loadAvgConfigs(filePath) };
    },
    loadSettings() {
        try {
            return fs.existsSync(SETTINGS_FILE) ? JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) : {};
        } catch {
            return {};
        }
    },
    saveSettings(input: Record<string, unknown>) {
        fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(input || {}, null, 2), 'utf8');
        return { ok: true, filePath: SETTINGS_FILE };
    },
    async startPreview(input: { uuid: string; orthoHeight?: number; viewportWidth?: number; viewportHeight?: number; boundaryStage?: '1st' | '2nd' | '3rd' | '4th' | 'loop' }) {
        const runtimeCameraUuid = await queryUuid(RUNTIME_CAMERA_URL);
        return await sceneRequest('startPreviewSession', [{
            ...input,
            runtimeCameraUuid,
            rendererVersion: RENDERER_VERSION,
        }]);
    },
    async renderFrame(input: Record<string, unknown>) {
        fs.mkdirSync(FRAME_DIR, { recursive: true });
        const outputPath = path.join(FRAME_DIR, 'current.png');
        const result = await sceneRequest('renderPreviewFrame', [{
            ...input,
            outputPath,
            rendererVersion: RENDERER_VERSION,
        }]);
        return {
            ...result,
            imagePath: result?.ok ? outputPath : '',
            imageUrl: result?.ok ? `${pathToFileURL(outputPath).href}?v=${Date.now()}` : '',
        };
    },
    async stopPreview() {
        return await sceneRequest('stopPreviewSession', []);
    },
};

export function load(): void {
    console.log(`[${PACKAGE_NAME}] loaded`);
}

export function unload(): void {
    void sceneRequest('stopPreviewSession', []).catch(() => undefined);
}
