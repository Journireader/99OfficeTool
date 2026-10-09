module.exports = (function () {
    'use strict';

    const { shell, clipboard } = require('electron');
    const Path = require('path');
    const Fs = require('fs');
    const I18n = require('../../eazax/i18n');
    const RendererEvent = require('../../eazax/renderer-event');
    const EditorRendererKit = require('../../eazax/editor-renderer-kit');
    const { hexToRGB } = require('../../eazax/color-util');
    const SpineRuntime = require('../../common/spine-runtime');
    const EditorAdapter = require('../../common/editor-adapter');
    const { getAnimationEventNames } = require('../../common/action-time-data');

    /**
     * 从 Spine 二进制缓冲区读取一个字符串（与 SkeletonBinary 一致）
     * @param {Buffer} buf
     * @param {number} start
     * @returns {{ str: string|null, next: number }}
     */
    function readSpineBinaryString$$(buf, start) {
        let i = start;
        const readByte = () => buf.readUInt8(i++);
        const readInt = (optimizePositive) => {
            let b = readByte();
            let result = b & 0x7F;
            while ((b & 0x80) !== 0) {
                b = readByte();
                result |= (b & 0x7F) << 7;
                if ((b & 0x80) !== 0) {
                    b = readByte();
                    result |= (b & 0x7F) << 14;
                    if ((b & 0x80) !== 0) {
                        b = readByte();
                        result |= (b & 0x7F) << 21;
                        if ((b & 0x80) !== 0) {
                            b = readByte();
                            result |= (b & 0x7F) << 28;
                        }
                    }
                }
            }
            return optimizePositive ? result : ((result >>> 1) ^ -(result & 1));
        };
        let byteCount = readInt(true);
        if (byteCount === 0) {
            return { str: null, next: i };
        }
        if (byteCount === 1) {
            return { str: '', next: i };
        }
        byteCount--;
        let chars = '';
        let pos = 0;
        while (pos < byteCount) {
            const b = readByte();
            switch (b >> 4) {
                case 12:
                case 13:
                    chars += String.fromCharCode(((b & 0x1F) << 6 | readByte() & 0x3F));
                    pos += 2;
                    break;
                case 14:
                    chars += String.fromCharCode(((b & 0x0F) << 12 | (readByte() & 0x3F) << 6 | readByte() & 0x3F));
                    pos += 3;
                    break;
                default:
                    chars += String.fromCharCode(b);
                    pos++;
            }
        }
        return { str: chars, next: i };
    }

    /**
     * 检测 .skel 内嵌的 Spine 版本字符串（支持 4.x 双 int32 hash 与 3.8 字符串 hash）
     * @param {string} fullPath
     * @returns {string|null}
     */
    function readSkelSpineVersion$$(fullPath) {
        const buf = Fs.readFileSync(fullPath);
        if (!buf || buf.length < 12) {
            return null;
        }
        const verLike = (s) => s && /^\d+\.\d+/.test(s);
        // 4.x：8 字节 hash 后为 version 字符串
        try {
            const r = readSpineBinaryString$$(buf, 8);
            if (verLike(r.str)) {
                const major = parseInt(r.str.split('.')[0], 10);
                if (major >= 4) {
                    return r.str;
                }
            }
        } catch (e) {
            /* ignore */
        }
        // 3.8：hash 字符串 + version 字符串
        try {
            const h = readSpineBinaryString$$(buf, 0);
            const v = readSpineBinaryString$$(buf, h.next);
            if (verLike(v.str)) {
                return v.str;
            }
        } catch (e) {
            /* ignore */
        }
        return null;
    }

    /**
     * Spine 4.2+ 要求 updateWorldTransform(physics)；3.8/4.0 无参。
     * @param {*} spineRef 当前 window.spine
     * @param {*} skeletonRef
     */
    function skeletonUpdateWorldTransform$$(spineRef, skeletonRef) {
        if (spineRef.Physics !== undefined && spineRef.Physics.update !== undefined) {
            skeletonRef.updateWorldTransform(spineRef.Physics.update);
        } else {
            skeletonRef.updateWorldTransform();
        }
    }

    /** 当前语言 */
    const LANG = EditorAdapter.getLanguage();

    /**
     * i18n
     * @param {string} key
     * @returns {string}
     */
    const VIEW_I18N = {
        zh: {
            hangingPoints: '挂点信息',
            noHangingPoints: '暂无挂点',
            parentBone: '父骨骼',
            relatedSlots: '关联插槽',
            dragToResize: '拖动调整大小，双击恢复默认',
        },
        en: {
            hangingPoints: 'Hanging Points',
            noHangingPoints: 'No hanging points',
            parentBone: 'Parent Bone',
            relatedSlots: 'Related Slots',
            dragToResize: 'Drag to resize, double-click to reset',
        },
    };
    const translate = (key) => {
        const local = VIEW_I18N[LANG] || VIEW_I18N.en;
        return local[key] || I18n.translate(LANG, key);
    };

    // 元素
    let canvas = null,
        layout = null,
        view = null,
        properties = null,
        mainSplitter = null,
        optionsPane = null,
        hangingPointsPane = null,
        frameEventsPane = null;
    // 元素观察者
    let resizeObserver = null,
        resizeFrameId = null,
        observedLayoutWidth = -1,
        observedLayoutHeight = -1;
    // 环境
    let gl = null,
        shader = null,
        batcher = null,
        mvp = null,
        skeletonRenderer = null;
    // 调试
    let debugRenderer = null,
        debugShader = null,
        shapeRenderer = null;
    // 骨骼数据
    let skeleton = null,
        bounds = null;
    // 上一帧时间
    let lastFrameTime = null;
    // 拖动
    let isDragging = false,
        clickOffset = [0, 0];
    // 帧事件
    let frameEventListener = null,
        latestFrameEventTimer = null,
        frameEventIdCounter = 0,
        copyFeedbackTimer = null;
    const MAX_FRAME_EVENTS = 100;
    // 进度条拖动预览
    let isScrubbing = false,
        resumeAfterScrub = false;
    // 手动调整面板大小
    let activeResize = null,
        panelWidth = 265,
        previewHeight = null,
        optionsPaneHeight = 202,
        hangingPointsHeight = 220;

    // 构建 Vue 应用
    const App = {

        /**
         * 数据
         */
        data() {
            return {
                // 资源信息
                assets: {
                    dir: null,
                    json: null,
                    skel: null,
                    atlas: null,
                    png: null,
                },
                // 选项
                viewScale: 1.0,
                skin: '',
                animation: '',
                timeScale: 1,
                loop: true,
                premultipliedAlpha: false,
                drawBones: false,
                drawBoundingBoxes: false,
                drawMeshTriangles: false,
                drawPaths: false,
                // 当前运行时版本
                version: 'unknown',
                // 画布颜色
                canvasColor: '#4c4c4c',
                clearColor: [0.3, 0.3, 0.3],
                // 环境
                assetManager: null,
                // 骨骼数据
                skeletonData: null,
                animationState: null,
                // 拖动
                dragOffset: [0, 0],
                // 帧事件
                frameEvents: [],
                latestFrameEvent: null,
                // 动画进度（0~1）与当前时刻（秒）
                animProgress: 0,
                animTime: 0,
                animationFps: 30,
                isPlaying: true,
                newAnimationName: '',
                animationEditMessage: '',
                animationEditSuccess: false,
                copyFeedback: '',
                isExportingActionTime: false,
            };
        },

        /**
         * 计算属性
         */
        computed: {

            /**
             * 皮肤列表
             */
            skins() {
                if (!this.skeletonData || !this.skeletonData.skins) {
                    return [];
                }
                return this.skeletonData.skins.map(v => v.name);
            },

            /**
             * 动画列表
             */
            animations() {
                if (!this.skeletonData || !this.skeletonData.animations) {
                    return [];
                }
                return this.skeletonData.animations.map(v => v.name);
            },

            /**
             * Spine 文件中的骨骼挂点列表。
             * 项目 SpineTestLayer 将 bones 作为挂点、slots 作为插槽；这里保持
             * 相同口径，并按项目规则让 1、104 等数字编号排在英文骨骼名前面。
             */
            hangingPoints() {
                const data = this.skeletonData;
                if (!data || !data.bones) {
                    return [];
                }
                const slots = data.slots || [];
                const points = data.bones.map((bone, index) => {
                    const relatedSlots = slots
                        .filter((slot) => {
                            const slotBone = slot.boneData || slot.bone;
                            return slotBone === bone || (slotBone && slotBone.name === bone.name);
                        })
                        .map(slot => slot.name)
                        .filter(Boolean);
                    return {
                        key: `${index}:${bone.name}`,
                        name: bone.name || '',
                        parent: bone.parent ? bone.parent.name : '',
                        relatedSlots,
                        x: bone.x || 0,
                        y: bone.y || 0,
                        rotation: bone.rotation || 0,
                    };
                });
                return points.sort((a, b) => this.compareSpineNames(a.name, b.name));
            },

            /**
             * 调试
             */
            debug() {
                return (
                    this.drawBones ||
                    this.drawBoundingBoxes ||
                    this.drawMeshTriangles ||
                    this.drawPaths
                );
            },

            /**
             * 动画时长（秒）
             */
            duration() {
                if (!this.animationState) {
                    return 0;
                }
                const entry = this.animationState.getCurrent(0);
                if (!entry || !entry.animation) {
                    return 0;
                }
                return entry.animation.duration || 0;
            },

            /** 当前动作总帧数 */
            totalFrames() {
                return this.getAnimationFrameCount(this.duration);
            },

            /** 当前所在帧 */
            currentFrame() {
                if (this.totalFrames <= 0) {
                    return 0;
                }
                return Math.min(
                    Math.max(Math.round(this.animProgress * this.totalFrames), 0),
                    this.totalFrames,
                );
            },

            /** 当前骨骼数据文件名（包含扩展名）。 */
            skeletonFileName() {
                if (!this.assets) {
                    return '';
                }
                const file = this.assets.json || this.assets.skel;
                return file ? Path.basename(file) : '';
            },

            /**
             * 资源信息
             */
            assetsInfo() {
                if (!this.assetManager) {
                    return `💡 ${translate('noAssets')}`;
                };
                let skeletonPath = '',
                    texturePath = '',
                    atlasPath = '';
                for (const path in this.assetManager.assets) {
                    switch (Path.extname(path)) {
                        case '.json':
                        case '.skel': {
                            skeletonPath = path;
                            break;
                        }
                        case '.png': {
                            texturePath = path;
                            break;
                        }
                        case '.atlas': {
                            atlasPath = path;
                            break;
                        }
                    }
                }
                const hangingPointNames = this.hangingPoints.map(v => v.name);
                const hangingPointInfo = hangingPointNames.length > 0
                    ? hangingPointNames.join(', ')
                    : translate('noHangingPoints');
                return `💀 [Skeleton]\n· ${skeletonPath}\n\n🖼 [Texture]\n· ${texturePath}\n\n🗺 [Atlas]\n· ${atlasPath}\n\n📍 [${translate('hangingPoints')}]\n· ${hangingPointInfo}`;
            },

            /**
             * 偏移
             */
            offset() {
                return `(${this.dragOffset[0]}, ${-this.dragOffset[1]})`;
            },

        },

        /**
         * 监听属性
         */
        watch: {

            /**
             * 当前皮肤
             * @param {string} value 
             */
            skin(value) {
                // 设置皮肤
                this.setSkin(value);
            },

            /**
             * 当前动画
             * @param {string} value 
             */
            animation(value) {
                // 播放动画
                this.playAnimation(value);
                this.newAnimationName = value ? `${value}_copy` : '';
            },

            /**
             * 时间缩放
             * @param {number} value 
             */
            timeScale(value) {
                value = parseFloat(value) || 0;
                this.setTimeScale(value);
            },

            /**
             * 循环
             * @param {boolean} value 
             */
            loop(value) {
                // 重新播放
                this.playAnimation(this.animation);
            },

            /**
             * 画布颜色
             * @param {string} value 
             */
            canvasColor(value) {
                // 更新画布颜色
                canvas.style.backgroundColor = value;
                // 获取 RGB 格式
                const { r, g, b } = hexToRGB(value);
                // 保存颜色值
                this.clearColor = [r / 255, g / 255, b / 255];
                // 更新 gl 颜色
                if (gl) {
                    gl.clearColor(r / 255, g / 255, b / 255, 1);
                    gl.clear(gl.COLOR_BUFFER_BIT);
                }
            },

        },

        /**
         * 实例函数
         */
        methods: {

            /**
             * 重置
             */
            reset() {
                // 资源信息
                this.assets = null;
                // 选项
                this.viewScale = 1;
                this.skin = '';
                this.animation = '';
                this.timeScale = 1;
                this.loop = true;
                this.premultipliedAlpha = false;
                this.drawBones = false;
                this.drawBoundingBoxes = false;
                this.drawMeshTriangles = false;
                this.drawPaths = false;
                // 当前运行时版本
                this.version = 'unknown';
                // 恢复默认画布颜色
                this.canvasColor = '#2f2f2f';
                // 骨骼数据
                skeleton = null;
                bounds = null;
                this.skeletonData = null;
                this.animationState = null;
                // 清空画布
                gl && gl.clear(gl.COLOR_BUFFER_BIT);
                // 环境
                shader = null;
                batcher = null;
                mvp = null;
                skeletonRenderer = null;
                this.assetManager = null;
                // 调试
                debugRenderer = null;
                debugShader = null;
                shapeRenderer = null;
                // 上一帧时间
                lastFrameTime = null;
                // 拖动
                isDragging = false;
                clickOffset = [0, 0];
                this.dragOffset = [0, 0];
                // 帧事件
                this.removeFrameEventListener();
                this.clearFrameEvents();
                // 进度条
                isScrubbing = false;
                resumeAfterScrub = false;
                this.animProgress = 0;
                this.animTime = 0;
                this.animationFps = 30;
                this.isPlaying = true;
                this.newAnimationName = '';
                this.animationEditMessage = '';
                this.animationEditSuccess = false;
                this.copyFeedback = '';
                this.isExportingActionTime = false;
                if (copyFeedbackTimer) {
                    clearTimeout(copyFeedbackTimer);
                    copyFeedbackTimer = null;
                }
            },

            /**
             * 翻译
             * @param {string} key 
             */
            t(key) {
                return translate(key);
            },

            /** 窗口重新获得焦点时，确认与扩展主进程的连接仍然有效。 */
            onViewerWindowFocus() {
                RendererEvent.send('reconnect');
            },

            /**
             * 将文本写入系统剪贴板并显示短暂反馈。
             * @param {string} value
             * @param {string} successKey
             */
            copyText(value, successKey) {
                const text = String(value || '');
                if (!text) {
                    return;
                }
                try {
                    clipboard.writeText(text);
                    this.showTransientFeedback(translate(successKey));
                } catch (error) {
                    console.error('Unable to copy text to clipboard.', error);
                    this.showTransientFeedback(translate('copyFailed'));
                }
            },

            /** 显示短暂操作提示。 */
            showTransientFeedback(message) {
                this.copyFeedback = message;
                if (copyFeedbackTimer) {
                    clearTimeout(copyFeedbackTimer);
                }
                copyFeedbackTimer = setTimeout(() => {
                    this.copyFeedback = '';
                    copyFeedbackTimer = null;
                }, 1600);
            },

            /** 复制当前动画名。 */
            copyAnimationName() {
                this.copyText(this.animation, 'animationNameCopied');
            },

            /** 复制当前骨骼数据文件名。 */
            copySkeletonFileName() {
                this.copyText(this.skeletonFileName, 'fileNameCopied');
            },

            /** 读取动作时间和 Spine 帧事件，生成与 Action 表事件字段兼容的时间表。 */
            downloadActionTimeTable() {
                if (this.isExportingActionTime || !this.skeletonData || !this.skeletonData.animations) {
                    return;
                }
                const rows = this.skeletonData.animations.map((animation) => {
                    const readFrames = this.getAnimationFrameCount(animation.duration);
                    return {
                        name: animation.name,
                        timeMs: Math.max(readFrames - 1, 0) * 34,
                        events: getAnimationEventNames(animation),
                    };
                });
                if (rows.length === 0) {
                    this.showTransientFeedback(translate('noAnimationsToExport'));
                    return;
                }
                const fileName = this.skeletonFileName || 'Spine';
                const extension = Path.extname(fileName);
                const baseName = extension ? fileName.slice(0, -extension.length) : fileName;
                this.isExportingActionTime = true;
                RendererEvent.removeAllListeners('action-time-export-result');
                RendererEvent.once('action-time-export-result', this.onActionTimeExportResult);
                RendererEvent.send('export-action-time', {
                    rows,
                    sourceDir: this.assets && this.assets.dir,
                    defaultFileName: `${baseName}_Action时间表.xlsx`,
                });
            },

            /** Action 时间表导出结果。 */
            onActionTimeExportResult(event, result) {
                this.isExportingActionTime = false;
                if (result && result.ok) {
                    this.showTransientFeedback(translate('actionTimeExported'));
                    return;
                }
                if (!result || !result.canceled) {
                    const detail = result && result.error ? `: ${result.error}` : '';
                    this.showTransientFeedback(`${translate('actionTimeExportFailed')}${detail}`);
                }
            },

            /**
             * 面板内数值统一保留两位小数，并去掉无意义的末尾 0。
             * @param {number} value
             * @returns {string}
             */
            formatPointValue(value) {
                const number = Number(value);
                if (!Number.isFinite(number)) {
                    return '0';
                }
                return String(Math.round(number * 100) / 100);
            },

            /**
             * 与 SpineTestLayer.sortStringList$$ 一致的名称排序：数字编号优先。
             */
            compareSpineNames(a, b) {
                const parse = (value) => {
                    const match = value.match(/^(\d+)(?:#(\d+)(.*))?$/);
                    return match
                        ? [parseInt(match[1], 10), match[2] ? parseInt(match[2], 10) : null, match[3] || '']
                        : [null, null, value];
                };
                const [beforeA, afterA, suffixA] = parse(a);
                const [beforeB, afterB, suffixB] = parse(b);
                if (beforeA !== null && beforeB === null) return -1;
                if (beforeA === null && beforeB !== null) return 1;
                if (beforeA !== null && beforeB !== null) {
                    if (beforeA !== beforeB) return beforeA - beforeB;
                    if (afterA === null && afterB !== null) return -1;
                    if (afterA !== null && afterB === null) return 1;
                    if (afterA !== null && afterB !== null && afterA !== afterB) return afterA - afterB;
                    return suffixA.localeCompare(suffixB);
                }
                return a.localeCompare(b);
            },

            /**
             * 资源信息按钮点击回调
             */
            onInfoBtnClick() {
                if (!this.assets || !this.assets.dir) {
                    return;
                }
                const { dir, json, skel } = this.assets,
                    skeletonPath = Path.join(dir, (json || skel));
                // 在资源管理器中展示 spine 文件
                shell.showItemInFolder(skeletonPath)
            },

            /**
             * 选择资源按钮点击回调
             */
            onSelectBtnClick() {
                // （主进程）选择资源
                RendererEvent.send('select');
            },

            /**
             * 重置按钮点击回调
             */
            onResetBtnClick() {
                this.reset();
            },

            /**
             * 复位按钮点击回调
             */
            onRepositionBtnClick() {
                isDragging = false;
                clickOffset = [0, 0];
                this.dragOffset = [0, 0];
            },

            /**
             * 获取 Spine 运行时
             */
            getRuntime() {
                // 资源对应的 Spine 运行时版本
                let version = this.getAssetSpineVersion(this.assets.json || this.assets.skel);
                if (!version) {
                    // RendererUtil.print('warn', translate('noVersion'));
                    // return false;
                    console.warn('Unable to identify Spine version of asset!');
                    // 默认使用 3.8 的 Runtime
                    version = "3.8";
                }
                // 处理版本号（保留前两个分量）
                version = version.split('.').slice(0, 2).map(v => parseInt(v)).join('.');
                // 获取目标版本的 Spine 运行时对象
                let spine = SpineRuntime.get(version);
                // 4.1 / 4.3 等未单独打包时，优先使用 4.2（与 4.2.x 导出的二进制兼容）
                if (!spine && version.startsWith('4.')) {
                    spine = SpineRuntime.get('4.2') || SpineRuntime.get('4.0');
                }
                if (!spine) {
                    const content = `${translate('noSpineRuntime')} | ${translate('version')}: ${version}`;
                    EditorRendererKit.print('warn', content);
                    return false;
                }
                window.spine = spine;
                this.version = spine.version;
                return true;
            },

            /**
             * 获取资源对应的 Spine 运行时版本
             * @param {string} path 文件路径
             * @returns {string}
             */
            getAssetSpineVersion(path) {
                const fullPath = Path.join((this.assets.dir || ''), path);
                if (!Fs.existsSync(fullPath)) {
                    return null;
                }
                const extname = Path.extname(path);
                if (extname === '.json') {
                    const data = JSON.parse(Fs.readFileSync(fullPath, 'utf-8'));
                    if (data.skeleton) {
                        return data.skeleton.spine;
                    }
                } else if (extname === '.skel') {
                    const fromBin = readSkelSpineVersion$$(fullPath);
                    return fromBin || '3.8';
                }
                return null;
            },

            /**
             * 读取 Spine JSON 中记录的导出帧率；二进制或旧资源没有该字段时使用 30 FPS。
             * @returns {number}
             */
            getAssetAnimationFps() {
                const fallback = 30;
                if (!this.assets || !this.assets.dir || !this.assets.json) {
                    return fallback;
                }
                try {
                    const fullPath = Path.join(this.assets.dir, this.assets.json);
                    const data = JSON.parse(Fs.readFileSync(fullPath, 'utf-8'));
                    const value = Number((data.skeleton && data.skeleton.fps) || data.fps);
                    return Number.isFinite(value) && value > 0 ? value : fallback;
                } catch (error) {
                    console.warn('Unable to read Spine animation FPS, fallback to 30.', error);
                    return fallback;
                }
            },

            /**
             * 根据时长和资源帧率计算动作帧数。
             * @param {number} durationSeconds
             * @returns {number}
             */
            getAnimationFrameCount(durationSeconds) {
                const duration = Number(durationSeconds);
                const fps = Number(this.animationFps) || 30;
                if (!Number.isFinite(duration) || duration <= 0) {
                    return 0;
                }
                // 减去极小误差，避免 1.00000001 秒被误算成多一帧。
                return Math.max(1, Math.ceil(duration * fps - 1e-6));
            },

            /**
             * 初始化 Spine 运行时
             */
            initRuntime() {
                // 获取画布
                if (!canvas) {
                    canvas = this.$refs.canvas;
                }
                // WebGL
                if (!gl) {
                    const config = { alpha: false };
                    gl = canvas.getContext("webgl", config);
                    if (!gl) {
                        EditorRendererKit.print('warn', translate('noWebGL'));
                        return;
                    }
                    const color = this.clearColor;
                    gl.clearColor(color[0], color[1], color[2], 1);
                }

                // Shader
                shader = spine.webgl.Shader.newTwoColoredTextured(gl);
                // 处理器
                batcher = new spine.webgl.PolygonBatcher(gl);
                // MVP 变换矩阵
                mvp = new spine.webgl.Matrix4();
                mvp.ortho2d(0, 0, canvas.width - 1, canvas.height - 1);
                // 骨骼渲染器
                skeletonRenderer = new spine.webgl.SkeletonRenderer(gl);

                // 用于调试的 debugRenderer、debugShader 和 shapeRenderer
                debugRenderer = new spine.webgl.SkeletonDebugRenderer(gl);
                debugShader = spine.webgl.Shader.newColored(gl);
                shapeRenderer = new spine.webgl.ShapeRenderer(gl);

                // 资源管理器
                this.assetManager = new spine.webgl.AssetManager(gl);
            },

            /**
             * 加载资源
             */
            loadAssets() {
                const assetManager = this.assetManager;
                if (!assetManager) {
                    return;
                }
                const assets = this.assets;
                // 指定资源目录前缀
                if (assets.dir) {
                    assetManager.pathPrefix = assets.dir;
                }
                // 骨骼数据
                if (assets.json) {
                    // JSON
                    assetManager.loadText(assets.json);
                } else if (assets.skel) {
                    // skel（二进制）
                    assetManager.loadBinary(assets.skel);
                } else {
                    EditorRendererKit.print('warn', translate('noSkeletonData'));
                    return;
                }
                // 图集和纹理
                if (assetManager.loadTextureAtlas) {
                    // spine runtime 3.6+
                    // loadTextureAtlas 内部会自动加载纹理
                    assetManager.loadTextureAtlas(assets.atlas);
                } else {
                    // spine runtime 3.5
                    assetManager.loadText(assets.atlas);
                    assetManager.loadTexture(assets.png);
                }
                // 是否开启纹理预乘
                if (Path.basename(assets.png).includes('pma') ||
                    Path.basename(assets.atlas).includes('pma')) {
                    this.premultipliedAlpha = true;
                }
                // 等待加载
                requestAnimationFrame(this.loading);
            },

            /**
             * 等待加载
             */
            loading() {
                if (!this.assetManager) {
                    return;
                }
                // 文件是否已加载完成
                if (this.assetManager.isLoadingComplete()) {
                    // 加载骨骼数据
                    const result = this.loadSkeleton();
                    if (!result) {
                        this.reset();
                        return;
                    }
                    // 设置皮肤
                    if (this.skins && this.skins[0]) {
                        // this.skeletonData.defaultSkin.name
                        this.setSkin(this.skins[0]);
                    }
                    // 播放动画
                    if (this.animations && this.animations[0]) {
                        this.playAnimation(this.animations[0]);
                    }
                    // 记录当前帧时间
                    lastFrameTime = Date.now() / 1000;
                    // 下一帧开始渲染
                    requestAnimationFrame(this.render);
                } else {
                    // 继续等待加载
                    requestAnimationFrame(this.loading);
                }
            },

            /**
             * 加载骨骼数据
             */
            loadSkeleton() {
                const assetManager = this.assetManager,
                    assets = this.assets;

                // 图集数据
                let atlas = assetManager.get(assets.atlas);
                if (spine.version === '3.5') {
                    atlas = new spine.TextureAtlas(atlas);
                }
                // 创建 AtlasAttachmentLoader 对象用于处理部位、网格、包围盒和路径
                const atlasLoader = new spine.AtlasAttachmentLoader(atlas);

                try {
                    this.animationFps = this.getAssetAnimationFps();
                    // 骨骼数据
                    if (assets.json) {
                        // 创建 skeletonJson 对象用于解析 json 文件
                        const skeletonJson = new spine.SkeletonJson(atlasLoader);
                        this.skeletonData = skeletonJson.readSkeletonData(assetManager.get(assets.json));
                    } else if (assets.skel) {
                        // 创建 SkeletonBinary 对象用于解析 skel 文件
                        const skeletonBinary = new spine.SkeletonBinary(atlasLoader);
                        this.skeletonData = skeletonBinary.readSkeletonData(assetManager.get(assets.skel));
                    }
                } catch (error) {
                    console.error(error);
                    EditorRendererKit.print('warn', translate('dataMismatch'));
                    return false;
                }

                // 创建骨骼对象
                skeleton = new spine.Skeleton(this.skeletonData);

                // 计算边界
                bounds = this.calculateBounds();

                // 创建 AnimationState 对象用于动画控制
                const animationStateData = new spine.AnimationStateData(skeleton.data);
                this.animationState = new spine.AnimationState(animationStateData);
                this.setupFrameEventListener();

                // Done
                return true;
            },

            /**
             * 注册帧事件监听
             */
            setupFrameEventListener() {
                this.removeFrameEventListener();
                if (!this.animationState) {
                    return;
                }
                frameEventListener = {
                    event: (entry, event) => {
                        this.onFrameEvent(entry, event);
                    },
                };
                this.animationState.addListener(frameEventListener);
            },

            /**
             * 移除帧事件监听
             */
            removeFrameEventListener() {
                if (this.animationState && frameEventListener) {
                    this.animationState.removeListener(frameEventListener);
                }
                frameEventListener = null;
            },

            /**
             * 帧事件触发回调
             * @param {*} entry
             * @param {*} event
             */
            onFrameEvent(entry, event) {
                const name = event.data ? event.data.name : String(event);
                this.frameEvents.unshift({
                    id: ++frameEventIdCounter,
                    name,
                    animation: entry.animation ? entry.animation.name : '',
                    time: Math.round(event.time * 100) / 100,
                });
                if (this.frameEvents.length > MAX_FRAME_EVENTS) {
                    this.frameEvents.length = MAX_FRAME_EVENTS;
                }
                this.latestFrameEvent = name;
                if (latestFrameEventTimer) {
                    clearTimeout(latestFrameEventTimer);
                }
                latestFrameEventTimer = setTimeout(() => {
                    this.latestFrameEvent = null;
                    latestFrameEventTimer = null;
                }, 1500);
            },

            /**
             * 清空帧事件记录
             */
            clearFrameEvents() {
                this.frameEvents = [];
                this.latestFrameEvent = null;
                if (latestFrameEventTimer) {
                    clearTimeout(latestFrameEventTimer);
                    latestFrameEventTimer = null;
                }
            },

            /**
             * 设置皮肤
             * @param {string} name 
             */
            setSkin(name) {
                if (!skeleton) {
                    return;
                }
                this.skin = name;
                // 设置皮肤
                skeleton.setSkinByName(name);
                // 重置姿势
                skeleton.setSlotsToSetupPose();
            },

            /**
             * 播放动画
             * @param {string} name 
             */
            playAnimation(name) {
                if (!skeleton) {
                    return;
                }
                this.animation = name;
                this.clearFrameEvents();
                isScrubbing = false;
                resumeAfterScrub = false;
                this.animProgress = 0;
                this.animTime = 0;
                this.isPlaying = true;
                // 重置姿势
                skeleton.setToSetupPose();
                // 播放动画
                this.animationState.setAnimation(0, name, this.loop);
                this.animationState.timeScale = parseFloat(this.timeScale) || 0;
            },

            /** 用户切换动作时清理上一条编辑结果提示。 */
            onAnimationSelectionChanged() {
                this.animationEditMessage = '';
                this.animationEditSuccess = false;
            },

            /**
             * 在当前 Spine JSON 中复制动作并改名。
             * 写入前会生成备份，并用当前 Spine Runtime 验证修改后的 JSON。
             */
            async duplicateAnimation() {
                this.animationEditMessage = '';
                this.animationEditSuccess = false;
                if (!this.assets || !this.assets.json) {
                    this.animationEditMessage = translate('binaryAnimationEditUnsupported');
                    return;
                }
                const sourceName = String(this.animation || '').trim();
                const targetName = String(this.newAnimationName || '').trim();
                if (!sourceName || !targetName) {
                    this.animationEditMessage = translate('animationNameRequired');
                    return;
                }
                if (targetName.length > 128 || /[\u0000-\u001f]/.test(targetName) ||
                    ['__proto__', 'prototype', 'constructor'].includes(targetName)) {
                    this.animationEditMessage = translate('invalidAnimationName');
                    return;
                }

                const fullPath = Path.join(this.assets.dir, this.assets.json);
                const timestamp = new Date().toISOString().replace(/[-:T]/g, '').replace(/\..+/, '');
                let backupPath = `${fullPath}.backup-${timestamp}.bak`;
                let suffix = 1;
                while (Fs.existsSync(backupPath)) {
                    backupPath = `${fullPath}.backup-${timestamp}-${suffix++}.bak`;
                }
                const tempPath = `${fullPath}.tmp-${process.pid}-${Date.now()}`;
                const oldCachedJson = this.assetManager && this.assetManager.get(this.assets.json);
                const oldSkin = this.skin;
                let originalMoved = false;
                let replaceComplete = false;

                try {
                    const originalText = Fs.readFileSync(fullPath, 'utf8');
                    const hasBom = originalText.charCodeAt(0) === 0xFEFF;
                    const cleanText = hasBom ? originalText.slice(1) : originalText;
                    const json = JSON.parse(cleanText);
                    const animations = json.animations;
                    if (!animations || typeof animations !== 'object' || Array.isArray(animations) ||
                        !Object.prototype.hasOwnProperty.call(animations, sourceName)) {
                        throw new Error(translate('sourceAnimationMissing'));
                    }
                    if (Object.prototype.hasOwnProperty.call(animations, targetName)) {
                        throw new Error(translate('animationNameExists'));
                    }

                    animations[targetName] = JSON.parse(JSON.stringify(animations[sourceName]));
                    const indentMatch = cleanText.match(/\n([ \t]+)"/);
                    const indent = indentMatch ? indentMatch[1] : '  ';
                    const lineEnding = cleanText.includes('\r\n') ? '\r\n' : '\n';
                    const jsonText = JSON.stringify(json, null, indent).replace(/\n/g, lineEnding);
                    const serialized = `${hasBom ? '\uFEFF' : ''}${jsonText}${lineEnding}`;
                    const runtimeText = hasBom ? serialized.slice(1) : serialized;
                    // 第一层验证：确保序列化结果仍是合法 JSON。
                    JSON.parse(runtimeText);

                    const confirmed = window.confirm(
                        `${translate('copyAnimationConfirm')}\n${sourceName} → ${targetName}\n` +
                        `${translate('backupFile')}: ${Path.basename(backupPath)}`,
                    );
                    if (!confirmed) {
                        return;
                    }

                    // 第二层验证：使用正在预览该文件的 Spine Runtime 完整解析。
                    this.assetManager.assets[this.assets.json] = runtimeText;
                    if (!this.loadSkeleton() || !this.animations.includes(targetName)) {
                        throw new Error(translate('runtimeValidationFailed'));
                    }

                    // 先写临时文件并复读，再以重命名方式替换；原文件始终保留为备份。
                    Fs.writeFileSync(tempPath, serialized, { encoding: 'utf8', flag: 'wx' });
                    const verifyText = Fs.readFileSync(tempPath, 'utf8');
                    JSON.parse(verifyText.charCodeAt(0) === 0xFEFF ? verifyText.slice(1) : verifyText);
                    Fs.renameSync(fullPath, backupPath);
                    originalMoved = true;
                    Fs.renameSync(tempPath, fullPath);
                    replaceComplete = true;

                    try {
                        if (oldSkin && this.skins.includes(oldSkin)) {
                            this.setSkin(oldSkin);
                        }
                        this.animation = targetName;
                        this.playAnimation(targetName);
                    } catch (error) {
                        // 文件已通过验证并安全替换；预览刷新失败不应被误报为文件写入失败。
                        console.warn('Animation was copied, but preview refresh failed.', error);
                    }
                    this.animationEditSuccess = true;
                    this.animationEditMessage = `${translate('copyAnimationSuccess')} ${Path.basename(backupPath)}`;

                    // 若资源位于项目内，通知资产数据库刷新；失败不影响已保存文件。
                    try {
                        const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', fullPath);
                        if (assetInfo && assetInfo.url) {
                            await Editor.Message.request('asset-db', 'refresh-asset', assetInfo.url);
                        }
                    } catch (error) {
                        console.warn('Unable to refresh duplicated Spine animation asset.', error);
                    }
                } catch (error) {
                    if (Fs.existsSync(tempPath)) {
                        try {
                            Fs.unlinkSync(tempPath);
                        } catch (cleanupError) {
                            console.warn('Unable to remove temporary Spine JSON.', cleanupError);
                        }
                    }
                    if (originalMoved && !replaceComplete && !Fs.existsSync(fullPath) && Fs.existsSync(backupPath)) {
                        try {
                            Fs.renameSync(backupPath, fullPath);
                        } catch (restoreError) {
                            console.error('Unable to restore Spine JSON backup.', restoreError);
                        }
                    }
                    if (this.assetManager && oldCachedJson !== undefined) {
                        this.assetManager.assets[this.assets.json] = oldCachedJson;
                        this.loadSkeleton();
                        if (oldSkin && this.skins.includes(oldSkin)) {
                            this.setSkin(oldSkin);
                        }
                        if (this.animations.includes(sourceName)) {
                            this.playAnimation(sourceName);
                        }
                    }
                    console.error(error);
                    this.animationEditMessage = `${translate('copyAnimationFailed')}: ${error.message || error}`;
                }
            },

            /**
             * 格式化动画时间（秒）
             * @param {number} seconds
             * @returns {string}
             */
            formatAnimTime(seconds) {
                const value = Number(seconds);
                if (!Number.isFinite(value) || value < 0) {
                    return '0.00';
                }
                return (Math.round(value * 100) / 100).toFixed(2);
            },

            /**
             * 从 AnimationState 同步进度条显示
             */
            syncAnimProgress() {
                if (!this.animationState || isScrubbing) {
                    return;
                }
                const entry = this.animationState.getCurrent(0);
                if (!entry || !entry.animation) {
                    this.animProgress = 0;
                    this.animTime = 0;
                    return;
                }
                const duration = entry.animation.duration || 0;
                if (duration <= 0) {
                    this.animProgress = 0;
                    this.animTime = 0;
                    return;
                }
                // 循环播放时 trackTime 会持续累加，取模得到当前周期内时刻
                let time = entry.trackTime;
                if (this.loop) {
                    time = ((time % duration) + duration) % duration;
                } else {
                    time = Math.min(Math.max(time, 0), duration);
                }
                this.animTime = time;
                this.animProgress = time / duration;
                if (!this.loop && entry.trackTime >= duration && this.isPlaying) {
                    this.isPlaying = false;
                    this.animationState.timeScale = 0;
                }
            },

            /**
             * 跳转到动画进度（0~1）并立即应用到骨骼
             * @param {number} progress
             */
            seekAnimation(progress) {
                if (!skeleton || !this.animationState) {
                    return;
                }
                const entry = this.animationState.getCurrent(0);
                if (!entry || !entry.animation) {
                    return;
                }
                const duration = entry.animation.duration || 0;
                const clamped = Math.min(Math.max(Number(progress) || 0, 0), 1);
                const time = duration * clamped;
                entry.trackTime = time;
                // 非循环动画结束后可能处于 complete，重置以便继续预览
                if (entry.trackEnd !== undefined && duration > 0) {
                    entry.trackEnd = Number.MAX_VALUE;
                }
                this.animTime = time;
                this.animProgress = clamped;
                this.animationState.apply(skeleton);
                skeletonUpdateWorldTransform$$(window.spine, skeleton);
            },

            /**
             * 跳转到指定帧。
             * @param {number} frame
             */
            seekAnimationFrame(frame) {
                const total = this.totalFrames;
                const target = Math.min(Math.max(Math.round(Number(frame) || 0), 0), total);
                this.seekAnimation(total > 0 ? target / total : 0);
            },

            /** 播放或暂停当前动作 */
            toggleAnimationPlayback() {
                if (!this.animationState) {
                    return;
                }
                if (!this.isPlaying && !this.loop && this.currentFrame >= this.totalFrames) {
                    this.seekAnimationFrame(0);
                }
                this.isPlaying = !this.isPlaying;
                this.animationState.timeScale = this.isPlaying
                    ? (parseFloat(this.timeScale) || 0)
                    : 0;
            },

            /**
             * 单步查看前一帧或后一帧。
             * @param {number} offset
             */
            stepAnimationFrame(offset) {
                if (!this.animationState) {
                    return;
                }
                this.isPlaying = false;
                this.animationState.timeScale = 0;
                this.seekAnimationFrame(this.currentFrame + offset);
            },

            /**
             * 开始拖动进度条：暂停时间推进以便预览定格
             */
            onScrubStart() {
                if (!this.animationState || isScrubbing) {
                    return;
                }
                isScrubbing = true;
                resumeAfterScrub = this.isPlaying;
                this.animationState.timeScale = 0;
                // 拖出滑块区域时也能恢复播放
                window.addEventListener('mouseup', this.onScrubEnd);
                window.addEventListener('touchend', this.onScrubEnd);
            },

            /**
             * 拖动进度条过程中预览对应帧
             * @param {Event} event
             */
            onScrubInput(event) {
                if (!this.animationState) {
                    return;
                }
                if (!isScrubbing) {
                    this.onScrubStart();
                }
                this.seekAnimationFrame(event.target.value);
            },

            /**
             * 结束拖动进度条：恢复时间缩放
             */
            onScrubEnd() {
                if (!isScrubbing) {
                    return;
                }
                isScrubbing = false;
                window.removeEventListener('mouseup', this.onScrubEnd);
                window.removeEventListener('touchend', this.onScrubEnd);
                if (this.animationState) {
                    this.isPlaying = resumeAfterScrub;
                    this.animationState.timeScale = this.isPlaying
                        ? (parseFloat(this.timeScale) || 0)
                        : 0;
                }
                resumeAfterScrub = false;
            },

            /**
             * 设置时间缩放
             * @param {number} value 
             */
            setTimeScale(value) {
                if (!skeleton) {
                    return;
                }
                this.animationState.timeScale = this.isPlaying && !isScrubbing ? value : 0;
            },

            /**
             * 计算边界
             * @returns {{ offset: { x: number, y: number }, size: { x: number, y: number } }}
             */
            calculateBounds() {
                skeleton.setToSetupPose();
                skeletonUpdateWorldTransform$$(window.spine, skeleton);
                const offset = new spine.Vector2(),
                    size = new spine.Vector2();
                skeleton.getBounds(offset, size, []);
                return { offset, size };
            },

            /**
             * 渲染骨骼
             */
            render() {
                if (!skeleton) {
                    return;
                }
                // 计算帧时间差
                const now = Date.now() / 1000,
                    delta = now - lastFrameTime;
                // 记录当前帧时间
                lastFrameTime = now;

                // 更新 mvp 来适配画布尺寸
                this.resizeView();

                // 清空画布
                gl.clear(gl.COLOR_BUFFER_BIT);

                // 应用动画并根据时间差值更新动画时间
                this.animationState.update(delta);
                this.animationState.apply(skeleton);
                // 更新骨骼 Transform
                skeletonUpdateWorldTransform$$(window.spine, skeleton);
                // 同步进度条（拖动中由 seek 直接写值）
                this.syncAnimProgress();

                // 渲染
                // 绑定 shader
                shader.bind();
                // 传递属性
                shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
                shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, mvp.values);
                // 渲染骨骼
                batcher.begin(shader);
                // 设置 skeletonRenderer 属性
                skeletonRenderer.premultipliedAlpha = this.premultipliedAlpha;
                // 渲染
                skeletonRenderer.draw(batcher, skeleton);
                batcher.end();
                // 解除 shader 绑定
                shader.unbind();

                // 调试
                if (this.debug) {
                    // 绑定 shader
                    debugShader.bind();
                    // 传递属性
                    debugShader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, mvp.values);
                    // 设置 debugRenderer 属性
                    debugRenderer.premultipliedAlpha = this.premultipliedAlpha;
                    debugRenderer.drawBones = this.drawBones;
                    debugRenderer.drawBoundingBoxes = this.drawBoundingBoxes;
                    debugRenderer.drawRegionAttachments = this.drawBoundingBoxes;
                    debugRenderer.drawMeshHull = this.drawMeshTriangles;
                    debugRenderer.drawMeshTriangles = this.drawMeshTriangles;
                    debugRenderer.drawPaths = this.drawPaths;
                    debugRenderer.drawSkeletonXY = this.drawBones;
                    // 开始渲染
                    shapeRenderer.begin(debugShader);
                    // 渲染
                    debugRenderer.draw(shapeRenderer, skeleton);
                    shapeRenderer.end();
                    // 解除 shader 绑定
                    debugShader.unbind();
                }

                // 持续渲染
                requestAnimationFrame(this.render);
            },

            /**
             * 更新视口尺寸
             */
            resizeView() {
                // 更新画布尺寸
                const { clientWidth, clientHeight } = canvas;
                if (canvas.width !== clientWidth || canvas.height !== clientHeight) {
                    canvas.width = clientWidth;
                    canvas.height = clientHeight;
                }
                // 骨骼位置以及缩放
                const canvasWidth = canvas.width,
                    canvasHeight = canvas.height;
                // 计算中心点
                const centerX = (bounds.offset.x + (bounds.size.x / 2)) || 0,
                    centerY = (bounds.offset.y + (bounds.size.y / 2)) || 0;
                // 计算缩放比例
                const ratioX = bounds.size.x / canvasWidth,
                    ratioY = bounds.size.y / canvasHeight;
                let scale = Math.max(ratioX, ratioY) * 1.2;
                if (scale < 1) scale = 1;
                // 自定义缩放
                scale /= this.viewScale;
                // 最终宽高
                const width = canvasWidth * scale,
                    height = canvasHeight * scale;
                // 更新矩阵
                const x = (centerX - (width / 2)) - (this.dragOffset[0] * scale),
                    y = (centerY - (height / 2)) + (this.dragOffset[1] * scale);
                mvp.ortho2d(x, y, width, height);
                // 更新视口
                gl.viewport(0, 0, canvasWidth, canvasHeight);
            },

            /**
             * （主进程）资源旋转回调
             * @param {Electron.ipcRendererEvent} event 
             * @param {{ dir?: string, json?: string, skel?: string, atlas: string, png: string }} assets 资源
             */
            onAssetsSelectedEvent(event, assets) {
                // 重置
                if (this.assets) {
                    this.reset();
                }
                // 未选中资源
                if (!assets) return;
                // 储存
                this.assets = assets;
                // 处理路径
                this.processAssetPaths();
                // 获取运行时
                const result = this.getRuntime();
                if (!result) return;
                // 初始化运行时
                this.initRuntime();
                // 开始加载资源
                this.loadAssets();
            },

            /**
             * 处理资源路径
             */
            processAssetPaths() {
                // ⚠️ Spine Runtime 在 Windows 平台下的问题
                // 使用 loadTextureAtlas 加载图集时会自动加载纹理
                // 但是 loadTextureAtlas 内部调用 loadTexture 时传递的 path 是文件名而不是完整路径
                // 如果没有指定 pathPrefix 属性，loadTexture 就会无法正常加载
                // 所以干脆都改为需要指定 pathPrefix 属性
                const assets = this.assets,
                    { dir, json, skel, png, atlas } = assets;
                if (!dir) {
                    assets.dir = Path.dirname(json || skel);
                }
                if (!assets.dir.endsWith(Path.sep)) {
                    assets.dir += Path.sep;
                }
                if (json) {
                    assets.json = Path.basename(json);
                } else if (skel) {
                    assets.skel = Path.basename(skel);
                }
                assets.atlas = Path.basename(atlas);
                assets.png = Path.basename(png);
            },

            /**
             * 画布鼠标滚轮事件回调
             * @param {WheelEvent} event 
             */
            onCanvasMouseWheel(event) {
                if (!this.assets) {
                    return;
                }
                // 当前缩放
                let scale = this.viewScale;
                // 缩放步长
                const step = Math.abs(scale) >= 1 ? 0.1 : 0.05;
                // 方向
                if (event.wheelDelta > 0) {
                    // 向上（放大）
                    scale += step;
                } else {
                    // 向下（缩小）
                    scale -= step;
                }
                // 处理精度
                scale = Math.round(scale * 100) / 100;
                // 设置缩放
                this.viewScale = scale;
            },

            /**
             * 画布鼠标点击事件回调
             * @param {MouseEvent} event 
             */
            onCanvasMouseDown(event) {
                if (!this.assets) {
                    return;
                }
                isDragging = true;
                const x = event.offsetX - this.dragOffset[0],
                    y = event.offsetY - this.dragOffset[1];
                clickOffset = [x, y];
            },

            /**
             * 画布鼠标移动事件回调
             * @param {MouseEvent} event 
             */
            onCanvasMouseMove(event) {
                if (!isDragging) {
                    return;
                }
                const x = event.offsetX - clickOffset[0],
                    y = event.offsetY - clickOffset[1];
                this.dragOffset = [x, y];
            },

            /**
             * 画布鼠标松开事件回调
             * @param {MouseEvent} event 
             */
            onCanvasMouseUp(event) {
                isDragging = false;
                clickOffset = [0, 0];
            },

            /**
             * 画布鼠标离开事件回调
             * @param {MouseEvent} event 
             */
            onCanvasMouseLeave(event) {
                isDragging = false;
                clickOffset = [0, 0];
            },

            /** 开始调整预览区与信息区大小 */
            onMainSplitterMouseDown(event) {
                if (event.button !== 0) return;
                activeResize = { type: 'main', target: event.currentTarget };
                this.startPanelResize(event);
            },

            /** 开始调整预览选项窗格高度 */
            onOptionsPaneSplitterMouseDown(event) {
                if (event.button !== 0) return;
                activeResize = { type: 'options-pane', target: event.currentTarget, pane: optionsPane };
                this.startPanelResize(event);
            },

            /** 开始调整挂点窗格高度 */
            onHangingPointsSplitterMouseDown(event) {
                if (event.button !== 0) return;
                activeResize = { type: 'hanging-points-pane', target: event.currentTarget, pane: hangingPointsPane };
                this.startPanelResize(event);
            },

            /** 注册一次拖拽调整 */
            startPanelResize(event) {
                event.preventDefault();
                activeResize.target.classList.add('resizing');
                document.body.style.userSelect = 'none';
                document.body.style.cursor = getComputedStyle(activeResize.target).cursor;
                window.addEventListener('mousemove', this.onPanelResizeMouseMove);
                window.addEventListener('mouseup', this.stopPanelResize);
            },

            /** 拖拽调整过程 */
            onPanelResizeMouseMove(event) {
                if (!activeResize) return;
                if (activeResize.type === 'main') {
                    const rect = layout.getBoundingClientRect();
                    if (layout.classList.contains('horizontal-layout')) {
                        const maxWidth = Math.max(140, rect.width - 160);
                        panelWidth = Math.min(maxWidth, Math.max(140, rect.right - event.clientX));
                        properties.style.width = `${panelWidth}px`;
                    } else {
                        const maxHeight = Math.max(100, rect.height - 160);
                        previewHeight = Math.min(maxHeight, Math.max(100, event.clientY - rect.top));
                        view.style.flex = `0 0 ${previewHeight}px`;
                        view.style.height = `${previewHeight}px`;
                    }
                    return;
                }

                const pane = activeResize.pane;
                const paneRect = pane.getBoundingClientRect();
                const propertiesRect = properties.getBoundingClientRect();
                if (activeResize.type === 'options-pane') {
                    const maxHeight = Math.max(64, propertiesRect.height - 64 - 64 - 14);
                    optionsPaneHeight = Math.min(maxHeight, Math.max(64, event.clientY - paneRect.top));
                    this.fitContentPanes();
                    return;
                }
                const maxHeight = Math.max(64, propertiesRect.bottom - paneRect.top - 64 - 7);
                hangingPointsHeight = Math.min(maxHeight, Math.max(64, event.clientY - paneRect.top));
                this.fitContentPanes();
            },

            /** 结束拖拽调整 */
            stopPanelResize() {
                if (activeResize && activeResize.target) {
                    activeResize.target.classList.remove('resizing');
                }
                activeResize = null;
                document.body.style.userSelect = '';
                document.body.style.cursor = '';
                window.removeEventListener('mousemove', this.onPanelResizeMouseMove);
                window.removeEventListener('mouseup', this.stopPanelResize);
            },

            /** 双击恢复主分区默认大小 */
            resetMainSplit() {
                panelWidth = 265;
                previewHeight = null;
                this.scheduleLayoutResize();
            },

            /** 双击恢复预览选项窗格默认高度 */
            resetOptionsPaneSplit() {
                optionsPaneHeight = 202;
                this.fitContentPanes();
            },

            /** 双击恢复挂点窗格默认高度 */
            resetHangingPointsSplit() {
                hangingPointsHeight = 220;
                this.fitContentPanes();
            },

            /** 约束三个内容窗格，并为每个窗格保留独立滚动区域。 */
            fitContentPanes() {
                if (!properties || !optionsPane || !hangingPointsPane || !frameEventsPane) return;
                const minimumPaneHeight = 64;
                const splitterHeight = 14;
                const usableHeight = Math.max(minimumPaneHeight * 3, properties.clientHeight - splitterHeight - 10);
                const fittedOptionsHeight = Math.min(
                    optionsPaneHeight,
                    Math.max(minimumPaneHeight, usableHeight - minimumPaneHeight * 2),
                );
                const remainingHeight = usableHeight - fittedOptionsHeight;
                const fittedHangingPointsHeight = Math.min(
                    hangingPointsHeight,
                    Math.max(minimumPaneHeight, remainingHeight - minimumPaneHeight),
                );
                const optionsHeightValue = `${fittedOptionsHeight}px`;
                const hangingPointsHeightValue = `${fittedHangingPointsHeight}px`;
                if (optionsPane.style.height !== optionsHeightValue) {
                    optionsPane.style.height = optionsHeightValue;
                }
                if (optionsPane.style.flexBasis !== optionsHeightValue) {
                    optionsPane.style.flexBasis = optionsHeightValue;
                }
                if (hangingPointsPane.style.height !== hangingPointsHeightValue) {
                    hangingPointsPane.style.height = hangingPointsHeightValue;
                }
                if (hangingPointsPane.style.flexBasis !== hangingPointsHeightValue) {
                    hangingPointsPane.style.flexBasis = hangingPointsHeightValue;
                }
            },

            /**
             * 合并布局更新并移到下一绘制帧，避免在 ResizeObserver 回调中同步改尺寸。
             */
            scheduleLayoutResize() {
                if (resizeFrameId !== null) {
                    return;
                }
                resizeFrameId = requestAnimationFrame(() => {
                    resizeFrameId = null;
                    if (layout && view && properties && mainSplitter) {
                        this.onLayoutResize();
                    }
                });
            },

            /**
             * 布局尺寸变化回调
             */
            onLayoutResize() {
                if (!layout || !view || !properties || !mainSplitter) {
                    return;
                }
                const layoutStyle = layout.style,
                    viewStyle = view.style,
                    propertiesStyle = properties.style;
                const setStyle = (target, property, value) => {
                    if (target[property] !== value) {
                        target[property] = value;
                    }
                };
                if (layout.clientWidth >= 800 || layout.clientHeight < 330) {
                    if (layout.clientWidth >= 350) {
                        // 水平布局
                        if (!layout.classList.contains('horizontal-layout')) {
                            layout.classList.add('horizontal-layout');
                        }
                        setStyle(layoutStyle, 'flexDirection', 'row');
                        setStyle(viewStyle, 'height', 'auto');
                        setStyle(viewStyle, 'flex', '1 1 0');
                        setStyle(propertiesStyle, 'width', `${Math.min(panelWidth, Math.max(140, layout.clientWidth - 160))}px`);
                        setStyle(propertiesStyle, 'marginTop', '0px');
                        setStyle(propertiesStyle, 'marginLeft', '0px');
                        setStyle(propertiesStyle, 'display', 'flex');
                        setStyle(mainSplitter.style, 'display', 'block');
                        setStyle(propertiesStyle, 'flex', '0 0 auto');
                        setStyle(propertiesStyle, 'minHeight', '0px');
                    } else {
                        // 隐藏选项
                        setStyle(propertiesStyle, 'display', 'none');
                        setStyle(mainSplitter.style, 'display', 'none');
                    }
                } else {
                    // 垂直布局
                    if (layout.classList.contains('horizontal-layout')) {
                        layout.classList.remove('horizontal-layout');
                    }
                    setStyle(layoutStyle, 'flexDirection', 'column');
                    const fittedPreviewHeight = previewHeight === null
                        ? null
                        : Math.min(previewHeight, Math.max(100, layout.clientHeight - 160));
                    setStyle(viewStyle, 'height', fittedPreviewHeight === null ? 'auto' : `${fittedPreviewHeight}px`);
                    setStyle(viewStyle, 'flex', fittedPreviewHeight === null ? '1 1 0' : `0 0 ${fittedPreviewHeight}px`);
                    setStyle(propertiesStyle, 'width', '100%');
                    setStyle(propertiesStyle, 'marginTop', '0px');
                    setStyle(propertiesStyle, 'marginLeft', '0px');
                    setStyle(propertiesStyle, 'display', 'flex');
                    setStyle(mainSplitter.style, 'display', 'block');
                    setStyle(propertiesStyle, 'flex', '1 1 0');
                    setStyle(propertiesStyle, 'minHeight', '0px');
                }
                this.fitContentPanes();
            },

        },

        /**
         * 生命周期：挂载后
         */
        mounted() {
            // 收集元素
            canvas = this.$refs.canvas;
            layout = this.$refs.layout;
            view = this.$refs.view;
            properties = this.$refs.properties;
            mainSplitter = this.$refs.mainSplitter;
            optionsPane = this.$refs.optionsPane;
            hangingPointsPane = this.$refs.hangingPointsPane;
            frameEventsPane = this.$refs.frameEventsPane;
            // 监听画布事件
            canvas.addEventListener('mousewheel', this.onCanvasMouseWheel); // 监听画布鼠标滚轮
            canvas.addEventListener('mousedown', this.onCanvasMouseDown);   // 监听画布鼠标点击
            canvas.addEventListener('mousemove', this.onCanvasMouseMove);   // 监听画布鼠标移动
            canvas.addEventListener('mouseup', this.onCanvasMouseUp);       // 监听画布鼠标松开
            canvas.addEventListener('mouseleave', this.onCanvasMouseLeave); // 监听画布鼠标离开
            // （主进程）监听资源选择事件
            RendererEvent.on('assets-selected', this.onAssetsSelectedEvent);
            // 主进程扩展热重载后，旧窗口仍存在；重新聚焦时主动恢复连接。
            window.addEventListener('focus', this.onViewerWindowFocus);
            // （下一帧）发送事件给主进程
            this.$nextTick(() => {
                RendererEvent.send('ready');                // （主进程）已就绪
                RendererEvent.send('check-update', false);  // （主进程）检查更新
            });
            // 主动触发布局尺寸变化（延迟到下一绘制帧，避免同步测量与写入）
            this.scheduleLayoutResize();
            // 监听布局尺寸变化
            resizeObserver = new ResizeObserver((entries) => {
                const entry = entries && entries[0];
                if (!entry) return;
                const width = Math.round(entry.contentRect.width * 10) / 10;
                const height = Math.round(entry.contentRect.height * 10) / 10;
                if (width === observedLayoutWidth && height === observedLayoutHeight) {
                    return;
                }
                observedLayoutWidth = width;
                observedLayoutHeight = height;
                this.scheduleLayoutResize();
            });
            // 观察外层容器而不是会被本插件改写 flex/尺寸的 layout，彻底断开自触发链。
            resizeObserver.observe(this.$refs.app || layout);
        },

        /**
         * 生命周期：卸载前
         */
        beforeUnmount() {
            this.stopPanelResize();
            this.onScrubEnd();
            RendererEvent.removeAllListeners('action-time-export-result');
            window.removeEventListener('focus', this.onViewerWindowFocus);
            if (resizeFrameId !== null) {
                cancelAnimationFrame(resizeFrameId);
                resizeFrameId = null;
            }
            // 清理案发现场
            canvas = null;
            layout = null;
            view = null;
            properties = null;
            mainSplitter = null;
            optionsPane = null;
            hangingPointsPane = null;
            frameEventsPane = null;
            gl = null;
            shader = null;
            batcher = null;
            mvp = null;
            skeletonRenderer = null;
            debugRenderer = null;
            debugShader = null;
            shapeRenderer = null;
            skeleton = null;
            bounds = null;
            this.removeFrameEventListener();
            if (latestFrameEventTimer) {
                clearTimeout(latestFrameEventTimer);
                latestFrameEventTimer = null;
            }
            if (copyFeedbackTimer) {
                clearTimeout(copyFeedbackTimer);
                copyFeedbackTimer = null;
            }
            // 取消监听布局尺寸变化
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
            resizeObserver = null;
            observedLayoutWidth = -1;
            observedLayoutHeight = -1;
            // 取消事件监听
            RendererEvent.removeAllListeners('assets-selected');
            // 发送事件给主进程
            RendererEvent.send('close');
        },

    };
    return App;

}());
