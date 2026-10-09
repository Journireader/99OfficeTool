'use strict';

const Fs = require('fs');
const Path = require('path');
const { dialog, BrowserWindow } = require('electron');
const MainEvent = require('../eazax/main-event');
const EditorMainKit = require('../eazax/editor-main-kit');
const { checkUpdate, reload } = require('../eazax/editor-main-util');
const { openRepository } = require('../eazax/package-util');
const ConfigManager = require('../common/config-manager');
const Opener = require('./opener');
const PanelManager = require('./panel-manager');
const Updater = require('../eazax/updater');
const EditorAdapter = require('../common/editor-adapter');
const { createActionTimeWorkbook } = require('../common/action-time-xlsx');

/**
 * 生命周期：加载
 */
function load() {
    // 设置仓库分支
    Updater.branch = 'v3';
    // 监听事件
    EditorMainKit.register();
    MainEvent.on('ready', onReadyEvent);
    MainEvent.on('reconnect', onReconnectEvent);
    MainEvent.on('close', onCloseEvent);
    MainEvent.on('reload', onReloadEvent);
    MainEvent.on('select', onSelectEvent);
    MainEvent.on('view', onViewEvent);
    MainEvent.on('export-action-time', onExportActionTimeEvent);
}

/**
 * 生命周期：卸载
 */
function unload() {
    // 取消事件监听
    EditorMainKit.unregister();
    MainEvent.removeAllListeners('ready');
    MainEvent.removeAllListeners('reconnect');
    MainEvent.removeAllListeners('close');
    MainEvent.removeAllListeners('reload');
    MainEvent.removeAllListeners('select');
    MainEvent.removeAllListeners('view');
    MainEvent.removeAllListeners('export-action-time');
}

/**
 * （渲染进程）预览面板就绪事件回调
 * @param {Electron.IpcMainEvent} event 
 */
function onReadyEvent(event) {
    // 保存预览面板的 WebContents
    PanelManager.viewWebContents = event.sender;
    // 检查编辑器选中
    Opener.checkEditorCurSelection();
}

/**
 * （渲染进程）预览面板关闭事件回调
 * @param {Electron.IpcMainEvent} event 
 */
function onCloseEvent(event) {
    PanelManager.viewWebContents = null;
}

/**
 * （渲染进程）重新加载事件回调
 * @param {Electron.IpcMainEvent} event 
 */
function onReloadEvent(event) {
    reload();
}

/**
 * （渲染进程）预览事件回调
 * @param {Electron.IpcMainEvent} event 
 */
function onViewEvent(event, uuid) {
    PanelManager.openViewPanel();
    EditorAdapter.Selection.clear('asset');
    EditorAdapter.Selection.select('asset', uuid);
}

/**
 * （渲染进程）选择文件事件回调
 * @param {Electron.IpcMainEvent} event 
 */
function onSelectEvent(event) {
    Opener.selectLocalFiles();
}

/**
 * 热重载后的预览窗口重新连接。正常情况下不重复刷新资源。
 * @param {Electron.IpcMainEvent} event
 */
function onReconnectEvent(event) {
    const current = PanelManager.getViewPanelWebContents();
    if (current === event.sender) {
        return;
    }
    PanelManager.viewWebContents = event.sender;
    Opener.checkEditorCurSelection();
}

/**
 * 导出动作时间 Excel。
 * @param {Electron.IpcMainEvent} event
 * @param {{ rows?: {name?: string, timeMs?: number, events?: string[]}[], sourceDir?: string, defaultFileName?: string }} payload
 */
async function onExportActionTimeEvent(event, payload) {
    try {
        const inputRows = payload && Array.isArray(payload.rows) ? payload.rows : [];
        const rows = inputRows.slice(0, 10000).map((row) => ({
            name: String(row && row.name || ''),
            timeMs: Math.max(0, Math.round(Number(row && row.timeMs) || 0)),
            events: Array.isArray(row && row.events)
                ? row.events.slice(0, 100).map(name => String(name || '')).filter(Boolean)
                : [],
        })).filter(row => row.name);
        if (rows.length === 0) {
            MainEvent.reply(event, 'action-time-export-result', { ok: false, error: 'No animation data.' });
            return;
        }

        const requestedDir = payload && payload.sourceDir ? Path.resolve(payload.sourceDir) : '';
        const sourceDir = requestedDir && Fs.existsSync(requestedDir) ? requestedDir : Editor.Project.path;
        const requestedName = payload && payload.defaultFileName || 'Action时间表.xlsx';
        const safeName = `${Path.basename(requestedName, Path.extname(requestedName))}.xlsx`;
        const options = {
            title: '下载 Action 时间表',
            defaultPath: Path.join(sourceDir, safeName),
            filters: [{ name: 'Excel 工作簿', extensions: ['xlsx'] }],
        };
        const owner = BrowserWindow.fromWebContents(event.sender);
        const result = owner
            ? await dialog.showSaveDialog(owner, options)
            : await dialog.showSaveDialog(options);
        if (result.canceled || !result.filePath) {
            MainEvent.reply(event, 'action-time-export-result', { ok: false, canceled: true });
            return;
        }

        const outputPath = result.filePath.toLowerCase().endsWith('.xlsx')
            ? result.filePath
            : `${result.filePath}.xlsx`;
        Fs.writeFileSync(outputPath, createActionTimeWorkbook(rows));
        MainEvent.reply(event, 'action-time-export-result', { ok: true, path: outputPath });
    } catch (error) {
        console.error('[ccc-skeleton-viewer] Failed to export Action time workbook.', error);
        MainEvent.reply(event, 'action-time-export-result', {
            ok: false,
            error: error && error.message ? error.message : String(error),
        });
    }
}

/**
 * 编辑器选中事件回调
 * @param {string} type 类型
 * @param {string[]} uuids uuids
 */
function onSelectionSelect(type, uuids) {
    if (PanelManager.getViewPanelWebContents()) {
        Opener.identifySelection(type, uuids);
    }
}

exports.load = load;

exports.unload = unload;

exports.methods = {

    /**
     * 打开预览面板
     */
    openViewPanel() {
        PanelManager.openViewPanel();
    },

    /**
     * 打开设置面板
     */
    openSettingsPanel() {
        PanelManager.openSettingsPanel();
    },

    /**
     * 检查更新
     */
    menuCheckUpdate() {
        checkUpdate(true);
    },

    /**
     * 版本号
     */
    menuVersion() {
        openRepository();
    },

    /**
     * 场景编辑器就绪后
     */
    onSceneReady() {
        // 自动检查更新
        const config = ConfigManager.get();
        if (config.autoCheckUpdate) {
            checkUpdate(false);
        }
    },

    /**
     * 编辑器选中事件回调
     * @param {'asset' | 'node'} type 类型
     * @param {string} uuid uuid
     */
    onSelectionSelect(type, uuid) {
        const uuids = EditorAdapter.Selection.getSelected(type);
        onSelectionSelect(type, uuids);
    },

};
