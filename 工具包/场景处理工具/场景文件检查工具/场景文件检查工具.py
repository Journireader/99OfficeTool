import csv
import json
import os
import re
import tkinter as tk
from datetime import datetime
from tkinter import filedialog, messagebox, scrolledtext, ttk


ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(ROOT_DIR, "scene_check_tool_config.json")
PREFAB_PATTERN = re.compile(r".*\.(prefab|profab)$", re.I)
UUID_PATTERN = re.compile(r"^[0-9a-fA-F-]{8,}(?:@[0-9a-zA-Z_+-]+)?$")
DEFAULT_IGNORED_RESOURCE_UUIDS = [
    "7d8f9b89-4fd1-4c9f-a3ab-38ec7cded7ca",
]


class AssetIndex:
    def __init__(self, assets_root):
        self.assets_root = assets_root
        self.uuid_map = {}
        self.meta_count = 0

    def build(self):
        self.uuid_map = {}
        self.meta_count = 0
        if not self.assets_root or not os.path.isdir(self.assets_root):
            return
        for root, _, files in os.walk(self.assets_root):
            for filename in files:
                if not filename.endswith(".meta"):
                    continue
                meta_path = os.path.join(root, filename)
                self.add_meta(meta_path)

    def add_meta(self, meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                meta = json.load(f)
        except Exception:
            return
        if not isinstance(meta, dict):
            return
        self.meta_count += 1
        base_asset_path = meta_path[:-5]
        root_uuid = meta.get("uuid")
        if root_uuid:
            self.uuid_map[root_uuid] = self.make_record(root_uuid, meta_path, base_asset_path, meta)
        for sub_meta in meta.get("subMetas", {}).values():
            if not isinstance(sub_meta, dict):
                continue
            sub_uuid = sub_meta.get("uuid")
            if sub_uuid:
                self.uuid_map[sub_uuid] = self.make_record(sub_uuid, meta_path, base_asset_path, sub_meta)

    def make_record(self, uuid, meta_path, asset_path, meta):
        return {
            "uuid": uuid,
            "metaPath": meta_path,
            "assetPath": asset_path,
            "importer": meta.get("importer", ""),
            "displayName": meta.get("displayName", ""),
            "assetExists": os.path.exists(asset_path),
        }

    def lookup(self, uuid):
        return self.uuid_map.get(uuid)


class SceneAnalyzer:
    def load_prefab(self, path):
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, list):
            raise ValueError("Prefab 根结构不是数组")
        return data

    def find_scene_component_index(self, data):
        for idx, item in enumerate(data):
            if not isinstance(item, dict):
                continue
            if item.get("positions") is not None and item.get("groundLayers") is not None:
                return idx
        return None

    def deref(self, data, ref):
        if not isinstance(ref, dict) or "__id__" not in ref:
            return None, None
        idx = ref.get("__id__")
        if not isinstance(idx, int) or idx < 0 or idx >= len(data):
            return idx, None
        return idx, data[idx]

    def find_node_for_component(self, data, component):
        node_idx, node = self.deref(data, component.get("node") if isinstance(component, dict) else None)
        if isinstance(node, dict) and node.get("__type__") == "cc.Node":
            return node_idx, node
        return None, None

    def collect_positions(self, data, scene_idx):
        scene = data[scene_idx]
        positions = []
        for order, ref in enumerate(scene.get("positions", [])):
            pos_idx, pos = self.deref(data, ref)
            if not isinstance(pos, dict):
                positions.append({
                    "key": f"invalid-position-{order}",
                    "id": "",
                    "positionType": "",
                    "x": None,
                    "y": None,
                    "index": pos_idx,
                    "valid": False,
                })
                continue

            collider_idx, collider = self.deref(data, pos.get("collider"))
            node_idx, node = self.find_node_for_component(data, collider or {})
            lpos = node.get("_lpos", {}) if isinstance(node, dict) else {}
            position_id = str(pos.get("id", ""))
            position_type = pos.get("positionType", "")
            positions.append({
                "key": f"{position_id}|{position_type}",
                "id": position_id,
                "positionType": position_type,
                "x": lpos.get("x"),
                "y": lpos.get("y"),
                "index": pos_idx,
                "colliderIndex": collider_idx,
                "nodeIndex": node_idx,
                "nodeName": node.get("_name", "") if isinstance(node, dict) else "",
                "valid": True,
            })
        return positions

    def collect_boundaries(self, data, scene_idx):
        scene = data[scene_idx]
        boundaries = []
        for order, ref in enumerate(scene.get("boundaries", [])):
            boundary_idx, boundary = self.deref(data, ref)
            if not isinstance(boundary, dict):
                boundaries.append({
                    "key": f"invalid-boundary-{order}",
                    "type": "",
                    "x": None,
                    "y": None,
                    "conditionId": "",
                    "index": boundary_idx,
                    "valid": False,
                })
                continue
            boundary_type = boundary.get("type", "")
            x = boundary.get("limitX")
            y = boundary.get("limitY")
            condition_id = str(boundary.get("conditionId", ""))
            boundaries.append({
                "key": f"{boundary_type}|{x}|{y}|{condition_id}",
                "type": boundary_type,
                "x": x,
                "y": y,
                "conditionId": condition_id,
                "index": boundary_idx,
                "valid": True,
            })
        return boundaries

    def collect_ground_layers(self, data, scene_idx):
        scene = data[scene_idx]
        layers = []
        for ref in scene.get("groundLayers", []):
            idx, item = self.deref(data, ref)
            if not isinstance(item, dict):
                continue
            layers.append({
                "key": str(item.get("layerIndex", "")),
                "layerIndex": item.get("layerIndex"),
                "moveSpeedRateX": item.get("moveSpeedRateX"),
                "index": idx,
            })
        return layers

    def collect_uuid_refs(self, data):
        refs = []

        def walk(value, path, parent_type=""):
            if isinstance(value, dict):
                current_type = value.get("__type__", parent_type)
                if "__uuid__" in value:
                    uuid = value.get("__uuid__")
                    refs.append({
                        "uuid": uuid,
                        "expectedType": value.get("__expectedType__", ""),
                        "path": path,
                        "ownerType": parent_type,
                        "valid": isinstance(uuid, str) and bool(uuid.strip()) and bool(UUID_PATTERN.match(uuid.strip())),
                    })
                for key, child in value.items():
                    walk(child, f"{path}.{key}" if path else str(key), current_type)
            elif isinstance(value, list):
                for idx, child in enumerate(value):
                    walk(child, f"{path}[{idx}]", parent_type)

        walk(data, "")
        return refs

    def collect_id_reference_errors(self, data):
        errors = []

        def walk(value, path):
            if isinstance(value, dict):
                if set(value.keys()) == {"__id__"}:
                    ref_id = value.get("__id__")
                    if not isinstance(ref_id, int) or ref_id < 0 or ref_id >= len(data):
                        errors.append(f"{path} -> __id__={ref_id}")
                for key, child in value.items():
                    walk(child, f"{path}.{key}" if path else str(key))
            elif isinstance(value, list):
                for idx, child in enumerate(value):
                    walk(child, f"{path}[{idx}]")

        walk(data, "")
        return errors

    def summarize(self, path):
        data = self.load_prefab(path)
        scene_idx = self.find_scene_component_index(data)
        if scene_idx is None:
            raise ValueError("未找到场景编辑组件（positions/groundLayers）")
        return {
            "path": path,
            "data": data,
            "sceneIndex": scene_idx,
            "positions": self.collect_positions(data, scene_idx),
            "boundaries": self.collect_boundaries(data, scene_idx),
            "groundLayers": self.collect_ground_layers(data, scene_idx),
            "resourceRefs": self.collect_uuid_refs(data),
            "idErrors": self.collect_id_reference_errors(data),
        }


class SceneCheckTool:
    def __init__(self, root):
        self.root = root
        self.root.title("场景文件检查工具")
        self.root.geometry("1180x860")
        self.root.minsize(1080, 760)

        self.reference_file = tk.StringVar()
        self.target_folder = tk.StringVar()
        self.filter_text = tk.StringVar(value="adventure-*.prefab")
        self.ignored_resource_uuids = tk.StringVar(value="\n".join(DEFAULT_IGNORED_RESOURCE_UUIDS))
        self.compare_resources = tk.BooleanVar(value=False)
        self.check_positions = tk.BooleanVar(value=True)
        self.check_boundaries = tk.BooleanVar(value=True)
        self.check_resources = tk.BooleanVar(value=True)

        self.analyzer = SceneAnalyzer()
        self.asset_index = None
        self.reference_summary = None
        self.results = []
        self.config = self.load_config()

        self.create_widgets()
        self.load_saved_config()
        self.log("工具启动成功")

    def load_config(self):
        if not os.path.exists(CONFIG_FILE):
            return {}
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}

    def save_config(self):
        self.config.update({
            "reference_file": self.reference_file.get().strip(),
            "target_folder": self.target_folder.get().strip(),
            "filter_text": self.filter_text.get().strip(),
            "ignored_resource_uuids": self.ignored_resource_uuids.get().strip(),
            "compare_resources": self.compare_resources.get(),
        })
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(self.config, f, ensure_ascii=False, indent=2)

    def load_saved_config(self):
        self.reference_file.set(self.config.get("reference_file", ""))
        self.target_folder.set(self.config.get("target_folder", ""))
        self.filter_text.set(self.config.get("filter_text", "adventure-*.prefab"))
        ignored = self.config.get("ignored_resource_uuids")
        if ignored is None:
            ignored = "\n".join(DEFAULT_IGNORED_RESOURCE_UUIDS)
        self.ignored_resource_uuids.set(ignored)
        self.compare_resources.set(bool(self.config.get("compare_resources", False)))

    def create_widgets(self):
        style = ttk.Style()
        style.configure("TButton", padding=(8, 4))
        style.configure("TLabelframe.Label", font=("Microsoft YaHei UI", 10, "bold"))

        outer = ttk.Frame(self.root, padding=14)
        outer.pack(fill=tk.BOTH, expand=True)

        path_frame = ttk.LabelFrame(outer, text="检查范围")
        path_frame.pack(fill=tk.X)
        path_frame.columnconfigure(1, weight=1)
        self.path_row(path_frame, 0, "参考标准场景", self.reference_file, self.select_reference)
        self.path_row(path_frame, 1, "目标文件夹", self.target_folder, self.select_target_folder)
        ttk.Label(path_frame, text="文件筛选").grid(row=2, column=0, sticky=tk.W, padx=8, pady=6)
        ttk.Entry(path_frame, textvariable=self.filter_text).grid(row=2, column=1, sticky="ew", padx=8, pady=6)
        ttk.Label(path_frame, text="如 adventure-*.prefab；多个条件用分号分隔").grid(row=2, column=2, sticky=tk.W, padx=8)

        options = ttk.LabelFrame(outer, text="检查项")
        options.pack(fill=tk.X, pady=(10, 0))
        ttk.Checkbutton(options, text="点位 PositionInfo", variable=self.check_positions).pack(side=tk.LEFT, padx=10, pady=8)
        ttk.Checkbutton(options, text="场景线 Boundary", variable=self.check_boundaries).pack(side=tk.LEFT, padx=10, pady=8)
        ttk.Checkbutton(options, text="资源引用", variable=self.check_resources).pack(side=tk.LEFT, padx=10, pady=8)
        ttk.Checkbutton(options, text="资源必须存在于参考场景中", variable=self.compare_resources).pack(side=tk.LEFT, padx=10, pady=8)
        ttk.Button(options, text="开始检查", command=self.run_check).pack(side=tk.RIGHT, padx=8)
        ttk.Button(options, text="导出CSV", command=self.export_csv).pack(side=tk.RIGHT, padx=8)

        ignore_frame = ttk.LabelFrame(outer, text="资源忽略过滤")
        ignore_frame.pack(fill=tk.X, pady=(10, 0))
        ignore_frame.columnconfigure(1, weight=1)
        ttk.Label(ignore_frame, text="忽略UUID").grid(row=0, column=0, sticky=tk.W, padx=8, pady=6)
        ttk.Entry(ignore_frame, textvariable=self.ignored_resource_uuids).grid(row=0, column=1, sticky="ew", padx=8, pady=6)
        ttk.Label(ignore_frame, text="支持完整UUID或基础UUID，多个用逗号/分号/空格/换行分隔").grid(
            row=0, column=2, sticky=tk.W, padx=8, pady=6
        )

        result_frame = ttk.LabelFrame(outer, text="场景检查结果")
        result_frame.pack(fill=tk.BOTH, expand=True, pady=(10, 0))
        columns = ("status", "file", "positions", "boundaries", "resources", "refs", "message")
        self.result_tree = ttk.Treeview(result_frame, columns=columns, show="headings", height=14)
        headers = {
            "status": "状态",
            "file": "文件",
            "positions": "点位",
            "boundaries": "场景线",
            "resources": "资源",
            "refs": "引用",
            "message": "问题摘要",
        }
        widths = {
            "status": 70,
            "file": 260,
            "positions": 90,
            "boundaries": 90,
            "resources": 90,
            "refs": 90,
            "message": 520,
        }
        for col in columns:
            self.result_tree.heading(col, text=headers[col])
            self.result_tree.column(col, width=widths[col], anchor=tk.W)
        self.result_tree.pack(side=tk.LEFT, fill=tk.BOTH, expand=True, padx=(8, 0), pady=8)
        self.result_tree.bind("<<TreeviewSelect>>", self.show_selected_detail)
        scroll_y = ttk.Scrollbar(result_frame, orient=tk.VERTICAL, command=self.result_tree.yview)
        scroll_y.pack(side=tk.RIGHT, fill=tk.Y, pady=8)
        self.result_tree.configure(yscrollcommand=scroll_y.set)

        detail_frame = ttk.LabelFrame(outer, text="详情")
        detail_frame.pack(fill=tk.BOTH, expand=True, pady=(10, 0))
        self.detail_text = scrolledtext.ScrolledText(detail_frame, height=10, font=("Microsoft YaHei UI", 9))
        self.detail_text.pack(fill=tk.BOTH, expand=True, padx=8, pady=8)

        log_frame = ttk.LabelFrame(outer, text="日志")
        log_frame.pack(fill=tk.X, pady=(10, 0))
        self.log_text = scrolledtext.ScrolledText(log_frame, height=4, font=("Microsoft YaHei UI", 9))
        self.log_text.pack(fill=tk.X, padx=8, pady=8)

    def path_row(self, parent, row, label, variable, command):
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky=tk.W, padx=8, pady=6)
        ttk.Entry(parent, textvariable=variable, state="readonly").grid(row=row, column=1, sticky="ew", padx=8, pady=6)
        ttk.Button(parent, text="选择", command=command).grid(row=row, column=2, padx=8, pady=6)

    def log(self, message):
        timestamp = datetime.now().strftime("%H:%M:%S")
        self.log_text.insert(tk.END, f"[{timestamp}] {message}\n")
        self.log_text.see(tk.END)
        self.root.update_idletasks()

    def select_reference(self):
        path = filedialog.askopenfilename(
            title="选择参考标准场景文件",
            initialdir=os.path.dirname(self.reference_file.get()) or ROOT_DIR,
            filetypes=[("Prefab files", "*.prefab *.profab"), ("All files", "*.*")],
        )
        if path:
            self.reference_file.set(path)
            self.save_config()
            self.log(f"参考标准场景：{path}")

    def select_target_folder(self):
        path = filedialog.askdirectory(
            title="选择目标场景文件夹",
            initialdir=self.target_folder.get() or ROOT_DIR,
        )
        if path:
            self.target_folder.set(path)
            self.save_config()
            self.log(f"目标文件夹：{path}")

    def split_patterns(self):
        value = self.filter_text.get().strip() or "*.prefab"
        return [item.strip() for item in value.split(";") if item.strip()]

    def file_matches(self, filename):
        import fnmatch
        return any(fnmatch.fnmatch(filename, pattern) for pattern in self.split_patterns())

    def iter_target_files(self):
        target = self.target_folder.get().strip()
        for root, _, files in os.walk(target):
            for filename in files:
                if not PREFAB_PATTERN.match(filename):
                    continue
                if self.file_matches(filename):
                    yield os.path.join(root, filename)

    def make_counter(self, items, key_name="key"):
        counter = {}
        for item in items:
            key = item.get(key_name)
            counter[key] = counter.get(key, 0) + 1
        return counter

    def compare_counter(self, reference_items, target_items, label):
        ref_counter = self.make_counter(reference_items)
        target_counter = self.make_counter(target_items)
        issues = []
        all_keys = sorted(set(ref_counter) | set(target_counter), key=str)
        for key in all_keys:
            ref_count = ref_counter.get(key, 0)
            target_count = target_counter.get(key, 0)
            if target_count < ref_count:
                issues.append(f"{label}缺失：{key}，标准{ref_count}个，当前{target_count}个")
            elif target_count > ref_count:
                issues.append(f"{label}多余：{key}，标准{ref_count}个，当前{target_count}个")
        return issues

    def compare_resources_with_reference(self, reference_refs, target_refs):
        ignored = self.get_ignored_resource_uuids()
        ref_uuids = {
            item["uuid"] for item in reference_refs
            if item.get("valid") and not self.is_ignored_resource_uuid(item.get("uuid"), ignored)
        }
        issues = []
        for item in target_refs:
            uuid = item.get("uuid")
            if self.is_ignored_resource_uuid(uuid, ignored):
                continue
            if item.get("valid") and uuid not in ref_uuids:
                issues.append(f"资源不在参考场景中：{uuid} ({item.get('expectedType', '')})")
        return issues

    def get_ignored_resource_uuids(self):
        raw = self.ignored_resource_uuids.get()
        values = [item.strip() for item in re.split(r"[\s,;，；]+", raw) if item.strip()]
        normalized = set(values)
        normalized.update(item.split("@", 1)[0] for item in values if "@" in item)
        return normalized

    def is_ignored_resource_uuid(self, uuid, ignored=None):
        if not uuid:
            return False
        ignored = ignored if ignored is not None else self.get_ignored_resource_uuids()
        base_uuid = str(uuid).split("@", 1)[0]
        return str(uuid) in ignored or base_uuid in ignored

    def find_assets_root(self, path):
        current = os.path.abspath(path)
        if os.path.isfile(current):
            current = os.path.dirname(current)
        while True:
            if os.path.basename(current).lower() == "assets":
                return current
            parent = os.path.dirname(current)
            if parent == current:
                return None
            current = parent

    def build_asset_index(self):
        target_root = self.find_assets_root(self.target_folder.get().strip())
        reference_root = self.find_assets_root(self.reference_file.get().strip())
        assets_root = target_root or reference_root
        if not assets_root:
            self.asset_index = None
            self.log("未能自动定位 assets 目录，资源文件存在性检查将跳过")
            return
        self.log(f"开始扫描资源Meta：{assets_root}")
        index = AssetIndex(assets_root)
        index.build()
        self.asset_index = index
        self.log(f"资源Meta扫描完成：{index.meta_count} 个meta，{len(index.uuid_map)} 个uuid")

    def check_resource_files(self, resource_refs):
        if not self.asset_index:
            return []
        issues = []
        seen = set()
        ignored = self.get_ignored_resource_uuids()
        for item in resource_refs:
            uuid = item.get("uuid")
            if self.is_ignored_resource_uuid(uuid, ignored):
                continue
            if not item.get("valid") or not uuid or uuid in seen:
                continue
            seen.add(uuid)
            record = self.asset_index.lookup(uuid)
            if not record:
                issues.append(f"资源Meta缺失：{uuid} ({item.get('expectedType', '')}) @ {item.get('path')}")
                continue
            if not record.get("assetExists"):
                issues.append(
                    f"资源文件缺失：{uuid} -> {record.get('assetPath')} "
                    f"({item.get('expectedType', '')}) @ {item.get('path')}"
                )
        return issues

    def analyze_target(self, path):
        rel = os.path.relpath(path, self.target_folder.get().strip())
        result = {
            "path": path,
            "rel": rel,
            "status": "通过",
            "positionStatus": "-",
            "boundaryStatus": "-",
            "resourceStatus": "-",
            "refStatus": "-",
            "issues": [],
            "summary": None,
        }

        try:
            summary = self.analyzer.summarize(path)
            result["summary"] = summary
        except Exception as exc:
            result["status"] = "失败"
            result["issues"].append(f"文件解析失败：{exc}")
            return result

        ref = self.reference_summary
        if self.check_positions.get():
            issues = self.compare_counter(ref["positions"], summary["positions"], "点位")
            invalid = [p for p in summary["positions"] if not p.get("valid")]
            issues.extend([f"点位引用无效：index={p.get('index')}" for p in invalid])
            result["positionStatus"] = "通过" if not issues else f"{len(issues)}项"
            result["issues"].extend(issues)

        if self.check_boundaries.get():
            issues = self.compare_counter(ref["boundaries"], summary["boundaries"], "场景线")
            invalid = [b for b in summary["boundaries"] if not b.get("valid")]
            issues.extend([f"场景线引用无效：index={b.get('index')}" for b in invalid])
            result["boundaryStatus"] = "通过" if not issues else f"{len(issues)}项"
            result["issues"].extend(issues)

        if self.check_resources.get():
            ignored = self.get_ignored_resource_uuids()
            invalid_resources = [
                item for item in summary["resourceRefs"]
                if not item.get("valid") and not self.is_ignored_resource_uuid(item.get("uuid"), ignored)
            ]
            resource_issues = [
                f"疑似资源缺失/无效：{item.get('uuid')} {item.get('expectedType')} @ {item.get('path')}"
                for item in invalid_resources
            ]
            resource_issues.extend(self.check_resource_files(summary["resourceRefs"]))
            if self.compare_resources.get():
                resource_issues.extend(self.compare_resources_with_reference(ref["resourceRefs"], summary["resourceRefs"]))
            result["resourceStatus"] = "通过" if not resource_issues else f"{len(resource_issues)}项"
            result["issues"].extend(resource_issues)

        id_errors = summary["idErrors"]
        result["refStatus"] = "通过" if not id_errors else f"{len(id_errors)}项"
        result["issues"].extend([f"__id__引用越界：{item}" for item in id_errors[:50]])
        if len(id_errors) > 50:
            result["issues"].append(f"还有 {len(id_errors) - 50} 个 __id__ 引用越界未展示")

        if result["issues"]:
            result["status"] = "异常"
        return result

    def run_check(self):
        reference = self.reference_file.get().strip()
        target = self.target_folder.get().strip()
        if not reference or not os.path.exists(reference):
            messagebox.showerror("错误", "请选择有效的参考标准场景文件")
            return
        if not target or not os.path.isdir(target):
            messagebox.showerror("错误", "请选择有效的目标文件夹")
            return

        self.save_config()
        self.result_tree.delete(*self.result_tree.get_children())
        self.detail_text.delete("1.0", tk.END)
        self.results = []

        try:
            self.reference_summary = self.analyzer.summarize(reference)
        except Exception as exc:
            messagebox.showerror("错误", f"参考标准场景解析失败：{exc}")
            return

        if self.check_resources.get():
            self.build_asset_index()

        files = list(self.iter_target_files())
        if not files:
            messagebox.showwarning("提示", "目标文件夹下没有匹配的场景文件")
            return

        self.log(f"开始检查 {len(files)} 个场景文件")
        for path in files:
            result = self.analyze_target(path)
            self.results.append(result)
            issue_text = "；".join(result["issues"][:3])
            if len(result["issues"]) > 3:
                issue_text += f"；另有 {len(result['issues']) - 3} 项"
            self.result_tree.insert(
                "",
                tk.END,
                iid=str(len(self.results) - 1),
                values=(
                    result["status"],
                    result["rel"],
                    result["positionStatus"],
                    result["boundaryStatus"],
                    result["resourceStatus"],
                    result["refStatus"],
                    issue_text,
                ),
            )
            self.log(f"{result['status']}：{result['rel']}")

        failed = sum(1 for item in self.results if item["status"] != "通过")
        self.log(f"检查完成：通过 {len(self.results) - failed} 个，异常/失败 {failed} 个")
        messagebox.showinfo("完成", f"检查完成\n通过：{len(self.results) - failed}\n异常/失败：{failed}")

    def show_selected_detail(self, _event=None):
        selected = self.result_tree.selection()
        if not selected:
            return
        result = self.results[int(selected[0])]
        self.detail_text.delete("1.0", tk.END)
        self.detail_text.insert(tk.END, f"文件：{result['rel']}\n")
        self.detail_text.insert(tk.END, f"状态：{result['status']}\n")
        summary = result.get("summary")
        if summary:
            self.detail_text.insert(tk.END, "\n统计：\n")
            self.detail_text.insert(tk.END, f"- 点位：{len(summary['positions'])}\n")
            self.detail_text.insert(tk.END, f"- 场景线：{len(summary['boundaries'])}\n")
            self.detail_text.insert(tk.END, f"- 资源引用：{len(summary['resourceRefs'])}\n")
            self.detail_text.insert(tk.END, f"- __id__引用越界：{len(summary['idErrors'])}\n")
        self.detail_text.insert(tk.END, "\n问题：\n")
        if result["issues"]:
            for idx, issue in enumerate(result["issues"], 1):
                self.detail_text.insert(tk.END, f"{idx}. {issue}\n")
        else:
            self.detail_text.insert(tk.END, "无\n")

    def export_csv(self):
        if not self.results:
            messagebox.showwarning("提示", "没有可导出的检查结果")
            return
        path = filedialog.asksaveasfilename(
            title="导出检查结果",
            defaultextension=".csv",
            filetypes=[("CSV", "*.csv"), ("All files", "*.*")],
            initialfile="scene_check_results.csv",
        )
        if not path:
            return
        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(["状态", "文件", "点位", "场景线", "资源", "引用", "问题摘要"])
            for result in self.results:
                writer.writerow([
                    result["status"],
                    result["rel"],
                    result["positionStatus"],
                    result["boundaryStatus"],
                    result["resourceStatus"],
                    result["refStatus"],
                    "；".join(result["issues"]),
                ])
        self.log(f"已导出CSV：{path}")
        messagebox.showinfo("完成", "检查结果已导出")


if __name__ == "__main__":
    root = tk.Tk()
    app = SceneCheckTool(root)
    root.mainloop()
