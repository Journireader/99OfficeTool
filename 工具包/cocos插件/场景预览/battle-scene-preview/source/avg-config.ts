import * as fs from 'fs';
import JSZip from 'jszip';

export interface AvgNote {
    index: number;
    time: number;
    actionType: string;
    actionLabel: string;
    actionData: string;
}

export interface AvgPreviewConfig {
    animeId: string;
    directorId: string;
    remark: string;
    duration: number;
    noteCount: number;
    camera: { x: number; y: number };
    heroPositionId: string;
    heroFacing: string;
    notes: AvgNote[];
}

type Row = { cells: string[]; values: Record<string, string> };

const ACTION_TYPES: Record<string, string> = {
    '[动画控制]主角入场': 'hero-entry', '[动画控制]主角移动': 'hero-move',
    '[动画控制]主角动作': 'hero-action', '[动画控制]演员启动': 'actor-start',
    '[动画控制]镜头移动': 'camera-move', '[动画控制]切屏动画': 'screen-switch',
    '[动画控制]镜头缩放': 'camera-zoom', '[动画控制]镜头抖动': 'camera-shake',
    '[动画控制]播放音频': 'play-audio', '[动画控制]BOSS动作': 'boss-action',
    '[动画控制]所有玩家入场': 'all-player-entry', '[动画控制]主角层级': 'hero-layer',
    '[动画控制]AVG启动': 'play-avg', '[动画控制]演出结束': 'finish',
};

function attr(tag: string, name: string): string {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`${escaped}="([^"]*)"`).exec(tag)?.[1] || '';
}

function decodeXml(value: string): string {
    return value.replace(/&#10;/g, '\n').replace(/&#13;/g, '\r')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function columnIndex(name: string): number {
    let value = 0;
    for (const char of name) value = value * 26 + char.charCodeAt(0) - 64;
    return value - 1;
}

async function readSheet(filePath: string, sheetName: string): Promise<Row[]> {
    if (!fs.existsSync(filePath)) throw new Error(`未找到 AVG 配置表：${filePath}`);
    const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
    const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
    const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
    if (!workbookXml || !relsXml) throw new Error('Animation.xlsx 结构无效');
    const rels = new Map<string, string>();
    for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/?>/g)) rels.set(attr(match[1] || '', 'Id'), attr(match[1] || '', 'Target'));
    let target = '';
    for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/?>/g)) {
        if (attr(match[1] || '', 'name') === sheetName) target = rels.get(attr(match[1] || '', 'r:id')) || '';
    }
    if (!target) throw new Error(`Animation.xlsx 缺少 ${sheetName} 工作表`);
    const shared: string[] = [];
    const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
    for (const match of (sharedXml || '').matchAll(/<si\b[\s\S]*?<\/si>/g)) shared.push(decodeXml((match[0] || '').replace(/<[^>]+>/g, '')));
    const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\.\//, '')}`;
    const sheetXml = await zip.file(sheetPath)?.async('string');
    if (!sheetXml) throw new Error(`无法读取 ${sheetName} 工作表`);
    const rows: string[][] = [];
    for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
        const index = Number(attr(rowMatch[1] || '', 'r') || rows.length + 1) - 1;
        const row: string[] = [];
        for (const cell of (rowMatch[2] || '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const ref = (attr(cell[1] || '', 'r').match(/[A-Z]+/) || [])[0];
            if (!ref) continue;
            const body = cell[2] || '';
            const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || '';
            const inline = body.match(/<is>([\s\S]*?)<\/is>/)?.[1] || '';
            const type = attr(cell[1] || '', 't');
            row[columnIndex(ref)] = type === 's' ? shared[Number(raw)] || '' : type === 'inlineStr' ? decodeXml(inline.replace(/<[^>]+>/g, '')) : decodeXml(raw);
        }
        rows[index] = row;
    }
    const header = rows[1] || [];
    return rows.slice(2).filter((row) => row?.some(Boolean)).map((row) => ({
        cells: row.map((cell) => String(cell || '').trim()),
        values: Object.fromEntries(header.map((key, index) => [String(key || '').trim(), String(row[index] || '').trim()]).filter(([key]) => key)),
    }));
}

function parseDirector(anime: Row, director?: Row): AvgPreviewConfig {
    const notes: AvgNote[] = [];
    for (let index = 1; index <= 16; index += 1) {
        const actionLabel = director?.values[`Note#${index}.ActionType`] || '';
        const actionData = director?.values[`Note#${index}.ActionData`] || '';
        const parsedTimeMs = Number(director?.values[`Note#${index}.ActionTime`] || 0);
        if (!actionLabel && !actionData) continue;
        notes.push({ index, time: Number.isFinite(parsedTimeMs) ? parsedTimeMs / 1000 : 0, actionType: ACTION_TYPES[actionLabel] || actionLabel, actionLabel, actionData });
    }
    notes.sort((a, b) => a.time - b.time || a.index - b.index);
    const [cameraX, cameraY] = String(director?.values['Camera.Pos'] || '').split(',').map(Number);
    let duration = notes.reduce((max, note) => Math.max(max, note.time), 0);
    for (const note of notes) {
        const data = note.actionData.split(',').map((item) => item.trim());
        if (note.actionType === 'camera-move') duration = Math.max(duration, note.time + (Number(data[2]) || 1.2));
        if (note.actionType === 'camera-zoom') duration = Math.max(duration, note.time + (Number(data[1]) || 1.2));
        if (note.actionType === 'camera-shake') duration = Math.max(duration, note.time + (Number(data[0]) || 0.4));
    }
    return {
        animeId: anime.values.AnimeID || '', directorId: anime.values.DirectorID || '', remark: anime.cells[1] || '', duration, noteCount: notes.length,
        camera: { x: Number.isFinite(cameraX) ? cameraX : 0, y: Number.isFinite(cameraY) ? cameraY : 0 },
        heroPositionId: director?.values['Hero.Pos'] || '', heroFacing: director?.values['Hero.Facing'] || '', notes,
    };
}

export async function loadAvgConfigs(filePath: string): Promise<AvgPreviewConfig[]> {
    const [animeRows, directorRows] = await Promise.all([readSheet(filePath, 'Anime'), readSheet(filePath, 'AnimeDirector')]);
    const directors = new Map(directorRows.map((row) => [row.values.DirectorID, row]));
    return animeRows.filter((row) => row.values.AnimeID).map((row) => parseDirector(row, directors.get(row.values.DirectorID)));
}
