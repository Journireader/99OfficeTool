#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Cocos 场景 Prefab 直接批量修改工具 v8 v1

重点：
1. 直接处理 .prefab 文件，不依赖同名 .json；
2. 不需要参考 Prefab；
3. 已内置项目结构：
   - 根编辑器组件：自动从 prefab 内部识别 roadLayer / groundLayers / positions / boundaries
   - 点位：追加 PositionInfo + 点位 Node + Collider + PolygonSnapshot
   - 边界：追加 Boundary + boundary Node + UITransform + Graphics
   - 层级速度：修改 GroundInfo.moveSpeedRateX / moveSpeedRateY
4. 已内置 BoundaryType$$ 枚举；
5. 图形界面，用户通过选择和填参数，工具自动转译为 prefab 内部字段；
6. 支持扫描目录、批量勾选、备份、输出到新目录、保存/加载操作模板。

运行：
  python cocos_prefab_direct_batch_modifier_gui.py

说明：
- 这个工具不会修改 JSON，只修改 .prefab。
- 如果某个 prefab 内部缺少根编辑器组件，工具会跳过并说明原因。
- 如果某个 prefab 内部没有点位碰撞器模板，无法新增点位；但可新增边界和改速度。
"""

import copy
import json
import random
import shutil
import traceback
import tkinter as tk
from tkinter import ttk, filedialog, messagebox
from pathlib import Path


# ============================================================
# BoundaryType$$ 枚举，编码从 0 开始
# ============================================================

BOUNDARY_TYPE_NAMES = [
    "None$$",
    "MoveBoundaryRight1st$$",
    "MoveBoundaryRight2nd$$",
    "MoveBoundaryRight3rd$$",
    "MoveBoundaryRight4th$$",
    "MoveBoundaryRightLoop$$",
    "CameraBoundaryRight1st$$",
    "CameraBoundaryRight2nd$$",
    "CameraBoundaryRight3rd$$",
    "CameraBoundaryRight4th$$",
    "CameraBoundaryRightLoop$$",
    "SpawnTrigger1st$$",
    "SpawnTrigger2nd$$",
    "SpawnTrigger3rd$$",
    "SpawnTrigger4th$$",
    "SpawnTriggerLoop$$",
    "ExitBoundary$$",
    "MoveBoundaryLeft1st$$",
    "MoveBoundaryLeft2nd$$",
    "MoveBoundaryLeft3rd$$",
    "MoveBoundaryLeft4th$$",
    "MoveBoundaryLeftLoop$$",
    "CameraBoundaryLeft1st$$",
    "CameraBoundaryLeft2nd$$",
    "CameraBoundaryLeft3rd$$",
    "CameraBoundaryLeft4th$$",
    "CameraBoundaryLeftLoop$$",
    "CameraBoundaryTop1st$$",
    "CameraBoundaryTop2nd$$",
    "CameraBoundaryTop3rd$$",
    "CameraBoundaryTop4th$$",
    "CameraBoundaryTopLoop$$",
    "CameraBoundaryBottom1st$$",
    "CameraBoundaryBottom2nd$$",
    "CameraBoundaryBottom3rd$$",
    "CameraBoundaryBottom4th$$",
    "CameraBoundaryBottomLoop$$",
]

BOUNDARY_TYPE_OPTIONS = [f"{i} - {name}" for i, name in enumerate(BOUNDARY_TYPE_NAMES)]


def boundary_type_label_to_value(label):
    text = str(label).strip()
    if not text:
        return 0
    if " - " in text:
        head = text.split(" - ", 1)[0].strip()
        if head.isdigit():
            return int(head)
    if text.isdigit():
        return int(text)
    for i, name in enumerate(BOUNDARY_TYPE_NAMES):
        if text == name:
            return i
    raise ValueError(f"未知边界类型：{label}")


def boundary_type_value_to_label(value):
    try:
        i = int(value)
    except Exception:
        return str(value)
    if 0 <= i < len(BOUNDARY_TYPE_NAMES):
        return f"{i} - {BOUNDARY_TYPE_NAMES[i]}"
    return str(value)


# ============================================================
# 基础工具
# ============================================================

def read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def deep_clone(x):
    return copy.deepcopy(x)


def ref_id(ref):
    if isinstance(ref, dict) and isinstance(ref.get("__id__"), int):
        return ref["__id__"]
    return None


def make_file_id():
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+/"
    return "".join(random.choice(alphabet) for _ in range(22))


def num(v, default=0):
    return v if isinstance(v, (int, float)) else default


def vec2(x=0, y=0):
    return {"__type__": "cc.Vec2", "x": x, "y": y}


def vec3(x=0, y=0, z=0):
    return {"__type__": "cc.Vec3", "x": x, "y": y, "z": z}


def quat_identity():
    return {"__type__": "cc.Quat", "x": 0, "y": 0, "z": 0, "w": 1}


def size(width=0, height=0):
    return {"__type__": "cc.Size", "width": width, "height": height}


def color(r=255, g=255, b=255, a=255):
    return {"__type__": "cc.Color", "r": r, "g": g, "b": b, "a": a}


def is_prefab_array(data):
    return isinstance(data, list) and data and isinstance(data[0], dict) and data[0].get("__type__") == "cc.Prefab"


def safe_get(data, idx):
    if isinstance(idx, int) and 0 <= idx < len(data):
        return data[idx]
    return None


# ============================================================
# Prefab 内部结构识别
# ============================================================

class PrefabContext:
    def __init__(self, data):
        self.data = data
        self.root_editor_id = None
        self.root_editor = None
        self.root_node_id = None
        self.root_node = None

        self.position_collider_template = None
        self.graphics_template = None

        self.find_root_editor()
        self.find_templates()

    def find_root_editor(self):
        for i, obj in enumerate(self.data):
            if not isinstance(obj, dict):
                continue
            if "roadLayer" in obj and "groundLayers" in obj and "positions" in obj and "boundaries" in obj:
                self.root_editor_id = i
                self.root_editor = obj
                nid = ref_id(obj.get("node"))
                self.root_node_id = nid
                self.root_node = safe_get(self.data, nid)
                break

        if self.root_editor is None:
            raise ValueError("找不到根编辑器组件：需要包含 roadLayer / groundLayers / positions / boundaries 的组件。")

        if not isinstance(self.root_node, dict) or self.root_node.get("__type__") != "cc.Node":
            raise ValueError("根编辑器组件没有指向有效 cc.Node。")

        if not isinstance(self.root_editor.get("positions"), list):
            self.root_editor["positions"] = []
        if not isinstance(self.root_editor.get("boundaries"), list):
            self.root_editor["boundaries"] = []
        if not isinstance(self.root_editor.get("groundLayers"), list):
            self.root_editor["groundLayers"] = []

    def find_templates(self):
        for obj in self.data:
            if not isinstance(obj, dict):
                continue

            t = obj.get("__type__", "")
            if (
                self.position_collider_template is None and
                isinstance(t, str) and
                not t.startswith("cc.") and
                "rectWidth" in obj and
                "rectHeight" in obj and
                "polygon" in obj
            ):
                self.position_collider_template = deep_clone(obj)

            if self.graphics_template is None and t == "cc.Graphics":
                self.graphics_template = deep_clone(obj)

    def append(self, obj):
        idx = len(self.data)
        self.data.append(obj)
        return idx

    def add_comp_prefab_info(self):
        return self.append({
            "__type__": "cc.CompPrefabInfo",
            "fileId": make_file_id()
        })

    def add_prefab_info_to_node(self, node_id):
        pid = self.append({
            "__type__": "cc.PrefabInfo",
            "root": {"__id__": 1},
            "asset": {"__id__": 0},
            "fileId": make_file_id(),
            "instance": None,
            "targetOverrides": None,
            "nestedPrefabInstanceRoots": None
        })
        self.data[node_id]["_prefab"] = {"__id__": pid}
        return pid

    def add_node(self, name, parent_id=None, x=0, y=0, z=0, width=100, height=100):
        node_id = self.append({
            "__type__": "cc.Node",
            "_name": str(name),
            "_objFlags": 0,
            "__editorExtras__": {},
            "_parent": {"__id__": parent_id} if parent_id is not None else None,
            "_children": [],
            "_active": True,
            "_components": [],
            "_prefab": None,
            "_lpos": vec3(x, y, z),
            "_lrot": quat_identity(),
            "_lscale": vec3(1, 1, 1),
            "_mobility": 0,
            "_layer": 33554432,
            "_euler": vec3(0, 0, 0),
            "_id": ""
        })

        if parent_id is not None:
            parent = safe_get(self.data, parent_id)
            if isinstance(parent, dict):
                if not isinstance(parent.get("_children"), list):
                    parent["_children"] = []
                parent["_children"].append({"__id__": node_id})

        self.add_prefab_info_to_node(node_id)
        self.add_ui_transform(node_id, width, height)
        return node_id

    def add_ui_transform(self, node_id, width=100, height=100, anchor_x=0.5, anchor_y=0.5):
        comp_prefab_id = self.add_comp_prefab_info()
        comp_id = self.append({
            "__type__": "cc.UITransform",
            "_name": "",
            "_objFlags": 0,
            "__editorExtras__": {},
            "node": {"__id__": node_id},
            "_enabled": True,
            "__prefab": {"__id__": comp_prefab_id},
            "_contentSize": size(width, height),
            "_anchorPoint": vec2(anchor_x, anchor_y),
            "_id": ""
        })
        self.data[node_id]["_components"].append({"__id__": comp_id})
        return comp_id

    def add_graphics(self, node_id):
        comp_prefab_id = self.add_comp_prefab_info()
        if self.graphics_template:
            comp = deep_clone(self.graphics_template)
            comp["node"] = {"__id__": node_id}
            comp["__prefab"] = {"__id__": comp_prefab_id}
            comp["_id"] = ""
        else:
            comp = {
                "__type__": "cc.Graphics",
                "_name": "",
                "_objFlags": 0,
                "__editorExtras__": {},
                "node": {"__id__": node_id},
                "_enabled": True,
                "__prefab": {"__id__": comp_prefab_id},
                "_customMaterial": None,
                "_srcBlendFactor": 2,
                "_dstBlendFactor": 4,
                "_color": color(),
                "_lineWidth": 4,
                "_strokeColor": color(255, 100, 0, 255),
                "_lineJoin": 2,
                "_lineCap": 0,
                "_fillColor": color(),
                "_miterLimit": 10,
                "_id": ""
            }

        comp_id = self.append(comp)
        self.data[node_id]["_components"].append({"__id__": comp_id})
        return comp_id

    def add_polygon_snapshot(self):
        return self.append({
            "__type__": "battle.editor.PolygonSnapshot",
            "_points": [
                vec2(-150, 150),
                vec2(150, 150),
                vec2(150, -150),
                vec2(-150, -150)
            ]
        })

    def add_position_collider(self, node_id, width, height):
        if self.position_collider_template is None:
            raise ValueError("当前 prefab 内找不到已有点位碰撞器模板，无法安全新增点位。")

        comp_prefab_id = self.add_comp_prefab_info()
        polygon_id = self.add_polygon_snapshot()

        comp = deep_clone(self.position_collider_template)
        comp["node"] = {"__id__": node_id}
        comp["__prefab"] = {"__id__": comp_prefab_id}
        comp["_colliderType"] = 0
        comp["rectWidth"] = width
        comp["rectHeight"] = height
        comp["polygon"] = {"__id__": polygon_id}
        comp["_id"] = ""

        comp_id = self.append(comp)
        self.data[node_id]["_components"].append({"__id__": comp_id})
        return comp_id

    def add_position(self, position):
        pid = str(position.get("id$$", "Point"))
        ptype = int(num(position.get("positionType$$"), 1))
        x = num(position.get("x$$"), 0)
        y = num(position.get("y$$"), 0)
        width = num(position.get("width$$"), 5)
        height = num(position.get("height$$"), 5)

        if pid == "born":
            node_name = f"pos-born-{pid}"
        elif ptype == 2:
            node_name = f"pos-spawn-{pid}"
        elif ptype == 3:
            node_name = f"pos-camera-{pid}"
        else:
            node_name = f"pos-{pid}"

        node_id = self.add_node(node_name, self.root_node_id, x=x, y=y, width=width, height=height)
        collider_id = self.add_position_collider(node_id, width, height)

        info_id = self.append({
            "__type__": "battle.editor.EditingScene.PositionInfo",
            "id": pid,
            "positionType": ptype,
            "collider": {"__id__": collider_id}
        })
        self.root_editor["positions"].append({"__id__": info_id})
        return info_id

    def add_boundary(self, boundary):
        btype = int(num(boundary.get("type$$"), 0))
        limit_x = num(boundary.get("limitX$$"), 0)
        limit_y = num(boundary.get("limitY$$"), 500)
        condition = boundary.get("conditionId$$", "") or ""

        existing = len(self.root_editor.get("boundaries", []))
        node_id = self.add_node(
            f"boundary-{existing}",
            self.root_node_id,
            x=limit_x,
            y=0,
            width=10,
            height=limit_y
        )
        self.add_graphics(node_id)

        info_id = self.append({
            "__type__": "battle.editor.EditingScene.Boundary",
            "type": btype,
            "limitX": limit_x,
            "limitY": limit_y,
            "conditionId": condition
        })
        self.root_editor["boundaries"].append({"__id__": info_id})
        return info_id

    def set_layer_speeds(self, layer_speeds):
        changed = 0

        # 优先按 root_editor.groundLayers 引用修改
        refs = self.root_editor.get("groundLayers", [])
        for r in refs:
            gid = ref_id(r)
            obj = safe_get(self.data, gid)
            if not isinstance(obj, dict):
                continue
            if "layerIndex" not in obj:
                continue

            key = str(obj.get("layerIndex"))
            if key not in layer_speeds:
                continue

            spec = layer_speeds[key]
            if isinstance(spec, dict):
                if "moveSpeedRateX$$" in spec:
                    obj["moveSpeedRateX"] = spec["moveSpeedRateX$$"]
                elif "x" in spec:
                    obj["moveSpeedRateX"] = spec["x"]

                if "moveSpeedRateY$$" in spec:
                    obj["moveSpeedRateY"] = spec["moveSpeedRateY$$"]
                elif "y" in spec:
                    obj["moveSpeedRateY"] = spec["y"]

                changed += 1

        # 兜底：如果没有 groundLayers 引用，则扫描 GroundInfo
        if changed == 0:
            for obj in self.data:
                if not isinstance(obj, dict):
                    continue
                if "GroundInfo" not in str(obj.get("__type__", "")):
                    continue

                key = str(obj.get("layerIndex"))
                if key not in layer_speeds:
                    continue

                spec = layer_speeds[key]
                if isinstance(spec, dict):
                    obj["moveSpeedRateX"] = spec.get("moveSpeedRateX$$", spec.get("x", obj.get("moveSpeedRateX", 1)))
                    obj["moveSpeedRateY"] = spec.get("moveSpeedRateY$$", spec.get("y", obj.get("moveSpeedRateY", 0)))
                    changed += 1

        return changed


# ============================================================
# 操作模板转译
# ============================================================

class DuplicateActionCancelled(Exception):
    pass


def collect_position_info_by_id(ctx):
    result = {}
    for r in ctx.root_editor.get("positions", []):
        info_id = ref_id(r)
        info = safe_get(ctx.data, info_id)
        if not isinstance(info, dict):
            continue
        pid = str(info.get("id", ""))
        if pid:
            result[pid] = (info_id, info)
    return result


def find_node_id_by_component(ctx, comp_id):
    for i, obj in enumerate(ctx.data):
        if not isinstance(obj, dict) or obj.get("__type__") != "cc.Node":
            continue
        for cref in obj.get("_components", []) or []:
            if ref_id(cref) == comp_id:
                return i
    return None


def find_position_node_by_name(ctx, position_id, position_type=None):
    names = [
        f"pos-born-{position_id}",
        f"pos-spawn-{position_id}",
        f"pos-camera-{position_id}",
        f"pos-{position_id}",
    ]

    if position_id == "born":
        preferred = f"pos-born-{position_id}"
        names = [preferred] + [n for n in names if n != preferred]
    elif position_type == 2:
        preferred = f"pos-spawn-{position_id}"
        names = [preferred] + [n for n in names if n != preferred]
    elif position_type == 3:
        preferred = f"pos-camera-{position_id}"
        names = [preferred] + [n for n in names if n != preferred]

    if isinstance(ctx.root_node, dict):
        for child_ref in ctx.root_node.get("_children", []) or []:
            node_id = ref_id(child_ref)
            node = safe_get(ctx.data, node_id)
            if isinstance(node, dict) and node.get("_name") in names:
                return node_id

    for i, node in enumerate(ctx.data):
        if isinstance(node, dict) and node.get("__type__") == "cc.Node" and node.get("_name") in names:
            return i

    return None


def find_ui_transform_on_node(ctx, node_id):
    node = safe_get(ctx.data, node_id)
    if not isinstance(node, dict):
        return None, None

    for cref in node.get("_components", []) or []:
        comp_id = ref_id(cref)
        comp = safe_get(ctx.data, comp_id)
        if isinstance(comp, dict) and comp.get("__type__") == "cc.UITransform":
            return comp_id, comp

    return None, None


def find_collider_component_on_node(ctx, node_id):
    node = safe_get(ctx.data, node_id)
    if not isinstance(node, dict):
        return None, None

    for cref in node.get("_components", []) or []:
        comp_id = ref_id(cref)
        comp = safe_get(ctx.data, comp_id)
        if (
            isinstance(comp, dict)
            and not str(comp.get("__type__", "")).startswith("cc.")
            and "rectWidth" in comp
            and "rectHeight" in comp
            and "polygon" in comp
        ):
            return comp_id, comp

    return None, None


def position_node_name(position_id, position_type):
    if position_id == "born":
        return f"pos-born-{position_id}"
    if position_type == 2:
        return f"pos-spawn-{position_id}"
    if position_type == 3:
        return f"pos-camera-{position_id}"
    return f"pos-{position_id}"


def next_unique_position_id_from_existing(existing_map, base_id):
    existing_ids = set(existing_map.keys()) if isinstance(existing_map, dict) else set(existing_map)
    if base_id not in existing_ids:
        return base_id
    idx = 1
    while f"{base_id}_{idx}" in existing_ids:
        idx += 1
    return f"{base_id}_{idx}"


def update_existing_position(ctx, info_id, info_obj, position):
    """
    覆盖同名点位：
    - 更新 PositionInfo；
    - 更新 Collider 宽高；
    - 更新点位 Node 坐标和名字；
    - 更新 UITransform 尺寸；
    - 如果 Collider 没有 node 字段，则通过组件反查节点。
    """
    old_pid = str(info_obj.get("id", ""))
    new_pid = str(position.get("id$$", old_pid))
    ptype = int(num(position.get("positionType$$"), info_obj.get("positionType", 1)))
    x = num(position.get("x$$"), 0)
    y = num(position.get("y$$"), 0)
    width = num(position.get("width$$"), 5)
    height = num(position.get("height$$"), 5)

    info_obj["id"] = new_pid
    info_obj["positionType"] = ptype

    collider_id = ref_id(info_obj.get("collider"))
    collider = safe_get(ctx.data, collider_id)
    node_id = None

    if isinstance(collider, dict):
        collider["rectWidth"] = width
        collider["rectHeight"] = height
        node_id = ref_id(collider.get("node"))

    if node_id is None and collider_id is not None:
        node_id = find_node_id_by_component(ctx, collider_id)

    if node_id is None:
        node_id = find_position_node_by_name(ctx, old_pid, ptype)
    if node_id is None and new_pid != old_pid:
        node_id = find_position_node_by_name(ctx, new_pid, ptype)

    node = safe_get(ctx.data, node_id)

    if isinstance(node, dict):
        node["_lpos"] = vec3(x, y, 0)
        node["_name"] = position_node_name(new_pid, ptype)

        _ui_id, ui = find_ui_transform_on_node(ctx, node_id)
        if isinstance(ui, dict):
            ui["_contentSize"] = size(width, height)
        else:
            ctx.add_ui_transform(node_id, width, height)

        if not isinstance(collider, dict):
            found_collider_id, found_collider = find_collider_component_on_node(ctx, node_id)
            if isinstance(found_collider, dict):
                collider_id = found_collider_id
                collider = found_collider
                info_obj["collider"] = {"__id__": found_collider_id}

        if isinstance(collider, dict):
            collider["rectWidth"] = width
            collider["rectHeight"] = height
            collider["node"] = {"__id__": node_id}

    return {
        "info_id": info_id,
        "node_id": node_id,
        "collider_id": collider_id,
        "updated_node": isinstance(node, dict),
        "updated_collider": isinstance(collider, dict),
    }



def collect_boundary_info_by_type(ctx):
    result = {}
    for list_index, r in enumerate(ctx.root_editor.get("boundaries", [])):
        info_id = ref_id(r)
        info = safe_get(ctx.data, info_id)
        if not isinstance(info, dict):
            continue
        btype = info.get("type")
        if isinstance(btype, int):
            result.setdefault(btype, []).append((list_index, info_id, info))
    return result


def get_root_boundary_child_refs(ctx):
    """
    返回根节点下名字类似 boundary-* 的子节点引用。
    你们 prefab 里 Boundary 数据对象和 boundary 节点没有直接引用关系，
    但它们通常按 rootEditor.boundaries 的顺序一一对应。
    """
    if not isinstance(ctx.root_node, dict):
        return []

    result = []
    for child_ref in ctx.root_node.get("_children", []) or []:
        node_id = ref_id(child_ref)
        node = safe_get(ctx.data, node_id)
        if not isinstance(node, dict):
            continue

        name = str(node.get("_name", ""))
        if name.startswith("boundary-"):
            result.append((child_ref, node_id, node))

    return result


def deactivate_node(ctx, node_id):
    node = safe_get(ctx.data, node_id)
    if isinstance(node, dict):
        node["_active"] = False
        node["_parent"] = None


def remove_boundary_child_refs_by_indexes(ctx, indexes_to_remove):
    """
    按 Boundary 列表索引移除对应 boundary-* 子节点。
    不重排 prefab 数组，只从 root node children 中摘除，并禁用旧节点。
    """
    if not indexes_to_remove or not isinstance(ctx.root_node, dict):
        return 0

    indexes_to_remove = set(indexes_to_remove)
    boundary_children = get_root_boundary_child_refs(ctx)
    remove_node_ids = set()

    for boundary_order_index, (_child_ref, node_id, _node) in enumerate(boundary_children):
        if boundary_order_index in indexes_to_remove:
            remove_node_ids.add(node_id)

    if not remove_node_ids:
        return 0

    new_children = []
    removed = 0
    for child_ref in ctx.root_node.get("_children", []) or []:
        node_id = ref_id(child_ref)
        if node_id in remove_node_ids:
            deactivate_node(ctx, node_id)
            removed += 1
            continue
        new_children.append(child_ref)

    ctx.root_node["_children"] = new_children
    return removed


def cleanup_orphan_boundary_nodes_by_position(ctx):
    """
    清理孤儿 boundary-* 节点：
    根据当前 rootEditor.boundaries 中仍有效的 limitX/limitY 数量，保留能匹配的位置节点；
    对多余的 boundary-* 节点从 root children 摘除并禁用。

    这个步骤用于修复旧版本工具只删 Boundary 引用、没删可视节点造成的残留线。
    """
    if not isinstance(ctx.root_node, dict):
        return 0

    needed = {}
    for r in ctx.root_editor.get("boundaries", []) or []:
        info = safe_get(ctx.data, ref_id(r))
        if not isinstance(info, dict):
            continue
        key = (info.get("limitX"), info.get("limitY"))
        needed[key] = needed.get(key, 0) + 1

    new_children = []
    removed = 0

    for child_ref in ctx.root_node.get("_children", []) or []:
        node_id = ref_id(child_ref)
        node = safe_get(ctx.data, node_id)
        if not isinstance(node, dict):
            new_children.append(child_ref)
            continue

        name = str(node.get("_name", ""))
        if not name.startswith("boundary-"):
            new_children.append(child_ref)
            continue

        pos = node.get("_lpos", {})
        ui_height = None
        for cref in node.get("_components", []) or []:
            comp = safe_get(ctx.data, ref_id(cref))
            if isinstance(comp, dict) and comp.get("__type__") == "cc.UITransform":
                sz = comp.get("_contentSize", {})
                if isinstance(sz, dict):
                    ui_height = sz.get("height")
                break

        key = (pos.get("x") if isinstance(pos, dict) else None, ui_height)
        if needed.get(key, 0) > 0:
            needed[key] -= 1
            new_children.append(child_ref)
        else:
            deactivate_node(ctx, node_id)
            removed += 1

    ctx.root_node["_children"] = new_children
    return removed


def remove_boundary_refs_by_type(ctx, boundary_type):
    """
    覆盖同类型边界时：
    1. 从 rootEditor.boundaries 移除旧 Boundary 引用；
    2. 按相同索引从 root node children 移除对应 boundary-* 可视节点；
    3. 不重排 prefab 数组，只摘引用和禁用旧节点，避免 __id__ 失效。
    """
    old_refs = list(ctx.root_editor.get("boundaries", []) or [])
    new_refs = []
    removed_ref_count = 0
    indexes_to_remove = []

    for index, r in enumerate(old_refs):
        info_id = ref_id(r)
        info = safe_get(ctx.data, info_id)
        if isinstance(info, dict) and info.get("type") == boundary_type:
            removed_ref_count += 1
            indexes_to_remove.append(index)
            continue
        new_refs.append(r)

    ctx.root_editor["boundaries"] = new_refs
    removed_node_count = remove_boundary_child_refs_by_indexes(ctx, indexes_to_remove)

    return removed_ref_count, removed_node_count



def apply_operations_to_prefab(
    prefab_data,
    low_level_template,
    duplicate_callback=None,
    boundary_duplicate_callback=None
):
    ctx = PrefabContext(prefab_data)

    added_positions = 0
    updated_positions = 0
    position_update_warnings = 0
    skipped_positions = 0

    added_boundaries = 0
    overwritten_boundary_groups = 0
    skipped_boundaries = 0
    removed_boundary_refs = 0
    removed_boundary_nodes = 0
    cleaned_orphan_boundary_nodes = 0

    existing = collect_position_info_by_id(ctx)

    for p in low_level_template.get("positions", []):
        pos = dict(p)
        pid = str(pos.get("id$$", "Point"))

        if pid in existing:
            action = "skip"
            if duplicate_callback:
                action = duplicate_callback(pid)

            if action == "cancel":
                raise DuplicateActionCancelled("用户取消了批量处理。")

            if action == "overwrite":
                info_id, info_obj = existing[pid]
                update_result = update_existing_position(ctx, info_id, info_obj, pos)
                if not update_result.get("updated_node") or not update_result.get("updated_collider"):
                    position_update_warnings += 1
                updated_positions += 1
                continue

            if action == "new":
                new_id = next_unique_position_id_from_existing(existing, pid)
                pos["id$$"] = new_id
                info_id = ctx.add_position(pos)
                existing[new_id] = (info_id, safe_get(ctx.data, info_id))
                added_positions += 1
                continue

            skipped_positions += 1
            continue

        info_id = ctx.add_position(pos)
        existing[pid] = (info_id, safe_get(ctx.data, info_id))
        added_positions += 1

    existing_boundaries = collect_boundary_info_by_type(ctx)
    boundary_decisions = {}

    for b in low_level_template.get("boundaries", []):
        boundary = dict(b)
        btype = int(num(boundary.get("type$$"), 0))

        if btype in existing_boundaries:
            if btype not in boundary_decisions:
                action = "skip"
                if boundary_duplicate_callback:
                    action = boundary_duplicate_callback(
                        btype,
                        len(existing_boundaries.get(btype, []))
                    )

                if action == "cancel":
                    raise DuplicateActionCancelled("用户取消了批量处理。")

                boundary_decisions[btype] = action

                if action == "overwrite":
                    removed_refs, removed_nodes = remove_boundary_refs_by_type(ctx, btype)
                    removed_boundary_refs += removed_refs
                    removed_boundary_nodes += removed_nodes
                    overwritten_boundary_groups += 1

            action = boundary_decisions.get(btype, "skip")
            if action == "skip":
                skipped_boundaries += 1
                continue

        ctx.add_boundary(boundary)
        added_boundaries += 1

    # 注意：不要在所有操作结束后自动清理 boundary-* 节点。
    # 点位覆盖 / 速度调整不应该碰任何限制线节点。
    # 边界节点只在用户选择“覆盖同类型边界线”时，由 remove_boundary_refs_by_type 精准处理。
    changed_speeds = ctx.set_layer_speeds(low_level_template.get("layerSpeeds", {}))

    return {
        "added_positions": added_positions,
        "updated_positions": updated_positions,
        "position_update_warnings": position_update_warnings,
        "skipped_positions": skipped_positions,
        "added_boundaries": added_boundaries,
        "overwritten_boundary_groups": overwritten_boundary_groups,
        "removed_boundary_refs": removed_boundary_refs,
        "removed_boundary_nodes": removed_boundary_nodes,
        "cleaned_orphan_boundary_nodes": cleaned_orphan_boundary_nodes,
        "skipped_boundaries": skipped_boundaries,
        "changed_speeds": changed_speeds,
    }


# ============================================================
# GUI
# ============================================================

class DirectPrefabBatchTool:
    def __init__(self, root):
        self.root = root
        self.root.title("Cocos 场景 Prefab 直接批量修改工具 v8")
        self.root.geometry("1180x760")
        self.root.minsize(1050, 680)

        self.dir_var = tk.StringVar()
        self.output_dir_var = tk.StringVar()
        self.recursive_var = tk.BooleanVar(value=True)
        self.backup_var = tk.BooleanVar(value=True)

        self.items = []
        self.simple_operations = []

        # 重复处理记忆状态。点位和边界线分开记忆。
        # None 表示每次都弹窗；"overwrite" / "skip" 表示后续同类重复直接执行。
        self.apply_all_duplicate_position_action = None
        self.apply_all_duplicate_boundary_action = None

        self.build_ui()

    def build_ui(self):
        pad = 8

        tk.Label(
            self.root,
            text="Cocos 场景 Prefab 直接批量修改工具",
            font=("Arial", 16, "bold")
        ).pack(anchor="w", padx=pad, pady=(pad, 3))

        tk.Label(
            self.root,
            text="直接修改 .prefab：批量添加点位、边界线，并调整 GroundInfo 层级速度。不需要同名 JSON 或参考 prefab。",
            anchor="w"
        ).pack(anchor="w", padx=pad, pady=(0, pad))

        top = tk.Frame(self.root)
        top.pack(fill="x", padx=pad)

        self.add_path_row(top, 0, "扫描目录：", self.dir_var, "选择", self.select_dir)
        self.add_path_row(top, 1, "输出目录：", self.output_dir_var, "选择", self.select_output_dir)

        options = tk.Frame(self.root)
        options.pack(fill="x", padx=pad, pady=(5, 5))
        tk.Checkbutton(options, text="递归扫描", variable=self.recursive_var).pack(side="left")
        tk.Checkbutton(options, text="处理前备份 .bak", variable=self.backup_var).pack(side="left", padx=10)

        buttons = tk.Frame(self.root)
        buttons.pack(fill="x", padx=pad, pady=(0, 6))
        tk.Button(buttons, text="扫描 Prefab", command=self.scan_dir, width=12, height=2).pack(side="left")
        tk.Button(buttons, text="全选", command=self.select_all, width=10, height=2).pack(side="left", padx=5)
        tk.Button(buttons, text="全不选", command=self.select_none, width=10, height=2).pack(side="left")
        tk.Button(buttons, text="保存模板", command=self.save_template, width=12, height=2).pack(side="left", padx=12)
        tk.Button(buttons, text="加载模板", command=self.load_template, width=12, height=2).pack(side="left")
        tk.Button(buttons, text="批量处理 Prefab", command=self.run_batch, width=16, height=2).pack(side="left", padx=12)

        main = tk.PanedWindow(self.root, orient=tk.HORIZONTAL, sashwidth=6)
        main.pack(fill="both", expand=True, padx=pad, pady=(0, pad))

        left = tk.Frame(main)
        right = tk.Frame(main)
        main.add(left, minsize=480)
        main.add(right, minsize=520)

        self.build_file_list(left)
        self.build_editor(right)

        log_frame = tk.Frame(self.root)
        log_frame.pack(fill="both", expand=False, padx=pad, pady=(0, pad))
        tk.Label(log_frame, text="日志：").pack(anchor="w")
        self.log_text = tk.Text(log_frame, height=8)
        self.log_text.pack(fill="both", expand=True)
        self.log("准备就绪。请选择目录后扫描 prefab。")

    def add_path_row(self, parent, row, label, var, btn, command):
        tk.Label(parent, text=label, width=12, anchor="e").grid(row=row, column=0, sticky="e", pady=3)
        tk.Entry(parent, textvariable=var).grid(row=row, column=1, sticky="ew", padx=5)
        tk.Button(parent, text=btn, command=command, width=10).grid(row=row, column=2)
        parent.columnconfigure(1, weight=1)

    def build_file_list(self, parent):
        tk.Label(parent, text="识别到的 Prefab：").pack(anchor="w")

        toolbar = tk.Frame(parent)
        toolbar.pack(fill="x", pady=(0, 4))
        tk.Button(toolbar, text="勾选选中行", command=self.check_selected_rows).pack(side="left")
        tk.Button(toolbar, text="取消选中行", command=self.uncheck_selected_rows).pack(side="left", padx=6)
        tk.Label(toolbar, text="列表支持 Shift / Ctrl 多选").pack(side="left", padx=8)

        frame = tk.Frame(parent)
        frame.pack(fill="both", expand=True)

        columns = ("checked", "name", "valid", "rel")
        self.tree = ttk.Treeview(
            frame,
            columns=columns,
            show="headings",
            height=20,
            selectmode="extended"
        )
        self.tree.heading("checked", text="选中")
        self.tree.heading("name", text="Prefab")
        self.tree.heading("valid", text="可处理")
        self.tree.heading("rel", text="相对路径")

        self.tree.column("checked", width=55, anchor="center", stretch=False)
        self.tree.column("name", width=220, stretch=True)
        self.tree.column("valid", width=180, anchor="center", stretch=False)
        self.tree.column("rel", width=420, stretch=True)

        y_scroll = ttk.Scrollbar(frame, orient="vertical", command=self.tree.yview)
        x_scroll = ttk.Scrollbar(frame, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscrollcommand=y_scroll.set, xscrollcommand=x_scroll.set)

        self.tree.grid(row=0, column=0, sticky="nsew")
        y_scroll.grid(row=0, column=1, sticky="ns")
        x_scroll.grid(row=1, column=0, sticky="ew")

        frame.rowconfigure(0, weight=1)
        frame.columnconfigure(0, weight=1)

        self.tree.bind("<ButtonRelease-1>", self.on_tree_click)
        self.tree.bind("<Double-1>", self.on_tree_double_click)

    def build_editor(self, parent):
        nb = ttk.Notebook(parent)
        nb.pack(fill="both", expand=True)

        frame_point = tk.Frame(nb)
        frame_boundary = tk.Frame(nb)
        frame_speed = tk.Frame(nb)
        frame_ops = tk.Frame(nb)
        frame_help = tk.Frame(nb)

        nb.add(frame_point, text="添加点位")
        nb.add(frame_boundary, text="添加边界线")
        nb.add(frame_speed, text="层级速度")
        nb.add(frame_ops, text="待执行操作")
        nb.add(frame_help, text="说明")

        self.build_point_form(frame_point)
        self.build_boundary_form(frame_boundary)
        self.build_speed_form(frame_speed)
        self.build_operations_view(frame_ops)
        self.build_help(frame_help)

    def build_point_form(self, parent):
        box = tk.LabelFrame(parent, text="添加点位")
        box.pack(fill="x", padx=8, pady=8)

        self.point_kind_var = tk.StringVar(value="怪物点")
        self.point_prefix_var = tk.StringVar(value="EnemyPoint")
        self.point_start_index_var = tk.StringVar(value="1")
        self.point_count_var = tk.StringVar(value="1")
        self.point_start_x_var = tk.StringVar(value="0")
        self.point_start_y_var = tk.StringVar(value="-80")
        self.point_step_x_var = tk.StringVar(value="0")
        self.point_step_y_var = tk.StringVar(value="0")
        self.point_width_var = tk.StringVar(value="5")
        self.point_height_var = tk.StringVar(value="5")

        row = 0
        tk.Label(box, text="点位类型：", width=12, anchor="e").grid(row=row, column=0, pady=5)
        cb = ttk.Combobox(
            box,
            textvariable=self.point_kind_var,
            values=["怪物点", "出生点", "普通点", "相机点", "自定义"],
            state="readonly",
            width=16
        )
        cb.grid(row=row, column=1, sticky="w", padx=5)
        cb.bind("<<ComboboxSelected>>", self.on_point_kind_change)

        tk.Label(box, text="ID前缀：", width=12, anchor="e").grid(row=row, column=2, pady=5)
        tk.Entry(box, textvariable=self.point_prefix_var, width=18).grid(row=row, column=3, sticky="w", padx=5)

        row += 1
        tk.Label(box, text="起始编号：", width=12, anchor="e").grid(row=row, column=0, pady=5)
        tk.Entry(box, textvariable=self.point_start_index_var, width=18).grid(row=row, column=1, sticky="w", padx=5)

        tk.Label(box, text="数量：", width=12, anchor="e").grid(row=row, column=2, pady=5)
        tk.Entry(box, textvariable=self.point_count_var, width=18).grid(row=row, column=3, sticky="w", padx=5)

        row += 1
        tk.Label(box, text="宽高：", width=12, anchor="e").grid(row=row, column=0, pady=5)
        wh = tk.Frame(box)
        wh.grid(row=row, column=1, sticky="w", padx=5)
        tk.Entry(wh, textvariable=self.point_width_var, width=8).pack(side="left")
        tk.Label(wh, text=" x ").pack(side="left")
        tk.Entry(wh, textvariable=self.point_height_var, width=8).pack(side="left")

        row += 1
        tk.Label(box, text="起始坐标：", width=12, anchor="e").grid(row=row, column=0, pady=5)
        xy = tk.Frame(box)
        xy.grid(row=row, column=1, sticky="w", padx=5)
        tk.Label(xy, text="x").pack(side="left")
        tk.Entry(xy, textvariable=self.point_start_x_var, width=8).pack(side="left")
        tk.Label(xy, text=" y").pack(side="left")
        tk.Entry(xy, textvariable=self.point_start_y_var, width=8).pack(side="left")

        tk.Label(box, text="递增间距：", width=12, anchor="e").grid(row=row, column=2, pady=5)
        step = tk.Frame(box)
        step.grid(row=row, column=3, sticky="w", padx=5)
        tk.Label(step, text="dx").pack(side="left")
        tk.Entry(step, textvariable=self.point_step_x_var, width=8).pack(side="left")
        tk.Label(step, text=" dy").pack(side="left")
        tk.Entry(step, textvariable=self.point_step_y_var, width=8).pack(side="left")

        row += 1
        tk.Button(box, text="添加到待执行操作", command=self.add_point_operation, height=2).grid(row=row, column=0, columnspan=4, pady=10)

    def build_boundary_form(self, parent):
        box = tk.LabelFrame(parent, text="添加边界线")
        box.pack(fill="x", padx=8, pady=8)

        self.boundary_type_var = tk.StringVar(value=boundary_type_value_to_label(1))
        self.boundary_count_var = tk.StringVar(value="1")
        self.boundary_start_x_var = tk.StringVar(value="0")
        self.boundary_step_x_var = tk.StringVar(value="0")
        self.boundary_limit_y_var = tk.StringVar(value="500")
        self.boundary_condition_var = tk.StringVar(value="")

        row = 0
        tk.Label(box, text="边界类型：", width=12, anchor="e").grid(row=row, column=0, pady=5)
        ttk.Combobox(
            box,
            textvariable=self.boundary_type_var,
            values=BOUNDARY_TYPE_OPTIONS,
            state="readonly",
            width=36
        ).grid(row=row, column=1, sticky="w", padx=5)

        tk.Label(box, text="数量：", width=12, anchor="e").grid(row=row, column=2, pady=5)
        tk.Entry(box, textvariable=self.boundary_count_var, width=18).grid(row=row, column=3, sticky="w", padx=5)

        row += 1
        tk.Label(box, text="起始 X：", width=12, anchor="e").grid(row=row, column=0, pady=5)
        tk.Entry(box, textvariable=self.boundary_start_x_var, width=18).grid(row=row, column=1, sticky="w", padx=5)

        tk.Label(box, text="X 间距：", width=12, anchor="e").grid(row=row, column=2, pady=5)
        tk.Entry(box, textvariable=self.boundary_step_x_var, width=18).grid(row=row, column=3, sticky="w", padx=5)

        row += 1
        tk.Label(box, text="高度 Y：", width=12, anchor="e").grid(row=row, column=0, pady=5)
        tk.Entry(box, textvariable=self.boundary_limit_y_var, width=18).grid(row=row, column=1, sticky="w", padx=5)

        tk.Label(box, text="条件ID：", width=12, anchor="e").grid(row=row, column=2, pady=5)
        tk.Entry(box, textvariable=self.boundary_condition_var, width=18).grid(row=row, column=3, sticky="w", padx=5)

        row += 1
        tk.Label(
            box,
            text="边界类型来自 BoundaryType$$ 枚举，左侧数字写入 Boundary.type；条件ID可为空。",
            fg="#555555",
            anchor="w"
        ).grid(row=row, column=0, columnspan=4, sticky="w", padx=6, pady=(4, 0))

        row += 1
        tk.Button(box, text="添加到待执行操作", command=self.add_boundary_operation, height=2).grid(row=row, column=0, columnspan=4, pady=10)

    def build_speed_form(self, parent):
        self.speed_vars = {}
        table = tk.LabelFrame(parent, text="设置各层级速度")
        table.pack(fill="x", padx=8, pady=8)

        headers = ["启用/层级", "节点名", "X速度", "Y速度"]
        for c, h in enumerate(headers):
            tk.Label(table, text=h, font=("Arial", 10, "bold")).grid(row=0, column=c, padx=5, pady=4)

        defaults = {
            "-5": 0.3, "-4": 0.6, "-3": 0.8, "-2": 0.9, "-1": 0.9,
            "1": 1.0, "2": 1.2, "3": 1.25, "4": 1.35
        }
        names = {
            "-5": "Back5", "-4": "Back4", "-3": "Back3", "-2": "Back2", "-1": "Back1",
            "1": "Front1", "2": "Front2", "3": "Front3", "4": "FrontDark"
        }

        for r, layer in enumerate(["-5", "-4", "-3", "-2", "-1", "1", "2", "3", "4"], start=1):
            enabled = tk.BooleanVar(value=False)
            sx = tk.StringVar(value=str(defaults[layer]))
            sy = tk.StringVar(value="0")
            self.speed_vars[layer] = {"enabled": enabled, "x": sx, "y": sy}

            tk.Checkbutton(table, variable=enabled, text=layer).grid(row=r, column=0, padx=5, pady=3)
            tk.Label(table, text=names[layer]).grid(row=r, column=1, padx=5, pady=3)
            tk.Entry(table, textvariable=sx, width=12).grid(row=r, column=2, padx=5, pady=3)
            tk.Entry(table, textvariable=sy, width=12).grid(row=r, column=3, padx=5, pady=3)

        btns = tk.Frame(parent)
        btns.pack(fill="x", padx=8, pady=4)
        tk.Button(btns, text="启用全部速度修改", command=self.enable_all_speeds).pack(side="left")
        tk.Button(btns, text="取消全部速度修改", command=self.disable_all_speeds).pack(side="left", padx=8)

    def build_operations_view(self, parent):
        top = tk.Frame(parent)
        top.pack(fill="x", padx=5, pady=5)
        tk.Button(top, text="删除选中操作", command=self.delete_selected_operation).pack(side="left")
        tk.Button(top, text="清空全部操作", command=self.clear_operations).pack(side="left", padx=8)

        columns = ("type", "desc")
        self.ops_tree = ttk.Treeview(parent, columns=columns, show="headings", height=14)
        self.ops_tree.heading("type", text="操作类型")
        self.ops_tree.heading("desc", text="说明")
        self.ops_tree.column("type", width=110)
        self.ops_tree.column("desc", width=460)
        self.ops_tree.pack(fill="both", expand=True, padx=5, pady=5)

        raw = tk.LabelFrame(parent, text="当前模板 JSON")
        raw.pack(fill="both", expand=True, padx=5, pady=5)
        self.ops_raw_text = tk.Text(raw, height=8)
        self.ops_raw_text.pack(fill="both", expand=True, padx=5, pady=5)
        self.refresh_operations_view()

    def build_help(self, parent):
        text = tk.Text(parent, wrap="word")
        text.pack(fill="both", expand=True, padx=8, pady=8)
        text.insert("1.0", """
处理对象：
- 只处理 .prefab 文件。
- 不读取、不修改同名 .json。

工具如何识别 prefab：
- 在 prefab 数组里查找包含 roadLayer / groundLayers / positions / boundaries 的根编辑器组件。
- 点位新增到 rootEditor.positions。
- 边界新增到 rootEditor.boundaries。
- 层级速度修改 rootEditor.groundLayers 引用的 GroundInfo。

点位新增：
- 怪物点 -> positionType = 2
- 出生点 / 普通点 -> positionType = 1
- 相机点 -> positionType = 3
- 工具会新增点位 Node、UITransform、Collider、PolygonSnapshot、PositionInfo。

边界新增：
- 边界类型来自 BoundaryType$$，下拉框左侧数字写入 Boundary.type。
- limitX 是线的位置。
- limitY 是线高度。
- conditionId 可为空。

注意：
- 扫描列表支持 Shift / Ctrl 多选；多选后点击“勾选选中行”即可批量勾选 prefab。
- 如果新增点位出现同名 ID，会弹窗让你选择覆盖、跳过、新增为新ID，或取消整个批处理；新增怪物点时可通过“起始编号”选择 EnemyPoint_1 / 2 / 3 等编号。
- 覆盖点位时，会同步更新 PositionInfo、Collider、点位节点坐标和 UITransform 尺寸；如果结构异常，日志会显示“点位覆盖警告”。
- 覆盖边界线时，才会移除该类型旧 Boundary 数据引用和对应 boundary-* 可视节点；点位覆盖不会修改或停用任何限制线节点。
- 点位和边界线的“后续全部执行此操作”是分开记忆的：点位选择不会影响边界线，边界线选择也不会影响点位。
- 边界线重复仍会弹窗选择覆盖、跳过或取消整个批处理。
- 如果某个 prefab 内没有已有点位 Collider 模板，工具无法安全新增点位，会报错。
- 边界和速度通常不依赖点位 Collider 模板。
- 建议先输出到新目录测试，确认无误后再覆盖原目录。
""".strip())
        text.config(state="disabled")

    def log(self, msg):
        self.log_text.insert("end", str(msg) + "\n")
        self.log_text.see("end")
        self.root.update_idletasks()

    def select_dir(self):
        path = filedialog.askdirectory(title="选择扫描目录")
        if path:
            self.dir_var.set(path)
            if not self.output_dir_var.get():
                self.output_dir_var.set(path)

    def select_output_dir(self):
        path = filedialog.askdirectory(title="选择输出目录")
        if path:
            self.output_dir_var.set(path)

    def scan_dir(self):
        base = Path(self.dir_var.get().strip())
        if not base.exists():
            messagebox.showwarning("目录不存在", "请选择有效目录。")
            return

        pattern = "**/*.prefab" if self.recursive_var.get() else "*.prefab"

        self.items = []
        for p in base.glob(pattern):
            if p.name.endswith(".bak"):
                continue

            valid = False
            reason = ""
            try:
                data = read_json(p)
                if is_prefab_array(data):
                    PrefabContext(data)
                    valid = True
                else:
                    reason = "不是 cc.Prefab 数组"
            except Exception as e:
                reason = str(e)

            self.items.append({
                "path": p,
                "name": p.name,
                "checked": valid,
                "valid": valid,
                "reason": reason,
                "rel": str(p.parent.relative_to(base))
            })

        self.items.sort(key=lambda x: str(x["path"]))
        self.refresh_tree()

        valid_count = sum(1 for x in self.items if x["valid"])
        self.log(f"扫描完成：发现 prefab {len(self.items)} 个，可处理 {valid_count} 个。")
        if valid_count < len(self.items):
            self.log("部分 prefab 不可处理，原因可在列表中看到“可处理=否”。")

    def refresh_tree(self):
        for row in self.tree.get_children():
            self.tree.delete(row)

        for i, item in enumerate(self.items):
            valid_text = "是" if item["valid"] else "否"
            if not item["valid"] and item.get("reason"):
                valid_text = "否：" + item["reason"][:30]

            self.tree.insert(
                "",
                "end",
                iid=str(i),
                values=(
                    "✓" if item["checked"] else "",
                    item["name"],
                    valid_text,
                    item["rel"]
                )
            )

    def on_tree_click(self, event):
        region = self.tree.identify("region", event.x, event.y)
        if region != "cell":
            return
        row_id = self.tree.identify_row(event.y)
        col = self.tree.identify_column(event.x)
        if not row_id:
            return

        # 点击第一列只切换单行勾选；Shift/Ctrl 多选后用“勾选选中行”批量勾选。
        if col == "#1":
            idx = int(row_id)
            if not self.items[idx]["valid"]:
                return
            self.items[idx]["checked"] = not self.items[idx]["checked"]
            self.refresh_tree()

    def on_tree_double_click(self, event):
        row_id = self.tree.identify_row(event.y)
        if not row_id:
            return
        idx = int(row_id)
        if not self.items[idx]["valid"]:
            return
        self.items[idx]["checked"] = not self.items[idx]["checked"]
        self.refresh_tree()

    def check_selected_rows(self):
        selected = self.tree.selection()
        count = 0
        for row_id in selected:
            idx = int(row_id)
            if self.items[idx]["valid"]:
                self.items[idx]["checked"] = True
                count += 1
        self.refresh_tree()
        self.log(f"已勾选选中行：{count} 个。")

    def uncheck_selected_rows(self):
        selected = self.tree.selection()
        count = 0
        for row_id in selected:
            idx = int(row_id)
            self.items[idx]["checked"] = False
            count += 1
        self.refresh_tree()
        self.log(f"已取消选中行：{count} 个。")

    def select_all(self):
        count = 0
        for item in self.items:
            item["checked"] = item["valid"]
            if item["valid"]:
                count += 1
        self.refresh_tree()
        self.log(f"已全选可处理 prefab：{count} 个。")

    def select_none(self):
        for item in self.items:
            item["checked"] = False
        self.refresh_tree()

    def parse_float(self, var, name):
        try:
            return float(var.get())
        except Exception:
            raise ValueError(f"{name} 必须是数字。")

    def parse_int(self, var, name):
        try:
            return int(float(var.get()))
        except Exception:
            raise ValueError(f"{name} 必须是整数。")

    def point_type_from_kind(self, kind):
        if kind == "怪物点":
            return 2
        if kind == "相机点":
            return 3
        return 1

    def on_point_kind_change(self, event=None):
        kind = self.point_kind_var.get()
        if kind == "怪物点":
            self.point_prefix_var.set("EnemyPoint")
            self.point_start_index_var.set("1")
            self.point_width_var.set("5")
            self.point_height_var.set("5")
        elif kind == "出生点":
            self.point_prefix_var.set("born")
            self.point_start_index_var.set("1")
            self.point_count_var.set("1")
            self.point_width_var.set("1")
            self.point_height_var.set("1")
        elif kind == "普通点":
            self.point_prefix_var.set("Point")
            self.point_width_var.set("100")
            self.point_height_var.set("100")
        elif kind == "相机点":
            self.point_prefix_var.set("CameraPoint")
            self.point_width_var.set("100")
            self.point_height_var.set("100")

    def add_point_operation(self):
        try:
            op = {
                "op": "add_positions",
                "kind": self.point_kind_var.get(),
                "prefix": self.point_prefix_var.get().strip(),
                "startIndex": self.parse_int(self.point_start_index_var, "起始编号"),
                "count": self.parse_int(self.point_count_var, "点位数量"),
                "startX": self.parse_float(self.point_start_x_var, "起始 X"),
                "startY": self.parse_float(self.point_start_y_var, "起始 Y"),
                "stepX": self.parse_float(self.point_step_x_var, "X 间距"),
                "stepY": self.parse_float(self.point_step_y_var, "Y 间距"),
                "width": self.parse_float(self.point_width_var, "宽度"),
                "height": self.parse_float(self.point_height_var, "高度")
            }
            self.simple_operations.append(op)
            self.refresh_operations_view()
            self.log(f"已添加点位操作：{op['kind']} x {op['count']}")
        except Exception as e:
            messagebox.showerror("添加失败", str(e))

    def add_boundary_operation(self):
        try:
            op = {
                "op": "add_boundaries",
                "boundaryType": boundary_type_label_to_value(self.boundary_type_var.get()),
                "count": self.parse_int(self.boundary_count_var, "边界数量"),
                "startX": self.parse_float(self.boundary_start_x_var, "起始 X"),
                "stepX": self.parse_float(self.boundary_step_x_var, "X 间距"),
                "limitY": self.parse_float(self.boundary_limit_y_var, "高度 Y"),
                "conditionId": self.boundary_condition_var.get().strip()
            }
            self.simple_operations.append(op)
            self.refresh_operations_view()
            self.log(f"已添加边界操作：{boundary_type_value_to_label(op['boundaryType'])} x {op['count']}")
        except Exception as e:
            messagebox.showerror("添加失败", str(e))

    def enable_all_speeds(self):
        for item in self.speed_vars.values():
            item["enabled"].set(True)

    def disable_all_speeds(self):
        for item in self.speed_vars.values():
            item["enabled"].set(False)

    def refresh_operations_view(self):
        if hasattr(self, "ops_tree"):
            for row in self.ops_tree.get_children():
                self.ops_tree.delete(row)

            for i, op in enumerate(self.simple_operations):
                if op.get("op") == "add_positions":
                    typ = "添加点位"
                    desc = f"{op.get('kind')} 前缀={op.get('prefix')} 起始编号={op.get('startIndex', 1)} 数量={op.get('count')} 起点=({op.get('startX')},{op.get('startY')}) 间距=({op.get('stepX')},{op.get('stepY')})"
                elif op.get("op") == "add_boundaries":
                    typ = "添加边界"
                    desc = f"{boundary_type_value_to_label(op.get('boundaryType'))} 数量={op.get('count')} 起始X={op.get('startX')} 间距={op.get('stepX')} 高度={op.get('limitY')}"
                else:
                    typ = op.get("op", "未知")
                    desc = json.dumps(op, ensure_ascii=False)

                self.ops_tree.insert("", "end", iid=str(i), values=(typ, desc))

        if hasattr(self, "ops_raw_text"):
            self.ops_raw_text.delete("1.0", "end")
            self.ops_raw_text.insert("1.0", json.dumps(self.get_template_object(), ensure_ascii=False, indent=2))

    def delete_selected_operation(self):
        selected = self.ops_tree.selection()
        if not selected:
            return
        indexes = sorted([int(x) for x in selected], reverse=True)
        for idx in indexes:
            if 0 <= idx < len(self.simple_operations):
                self.simple_operations.pop(idx)
        self.refresh_operations_view()

    def clear_operations(self):
        self.simple_operations = []
        self.refresh_operations_view()

    def get_template_object(self):
        speeds = {}
        for layer, vars_obj in self.speed_vars.items():
            if vars_obj["enabled"].get():
                speeds[layer] = {
                    "moveSpeedRateX$$": float(vars_obj["x"].get()),
                    "moveSpeedRateY$$": float(vars_obj["y"].get())
                }

        return {
            "version": 3,
            "mode": "direct_prefab_form",
            "operations": self.simple_operations,
            "layerSpeeds": speeds
        }

    def parse_template_to_low_level(self):
        positions = []
        boundaries = []

        for op in self.simple_operations:
            if op.get("op") == "add_positions":
                kind = op.get("kind", "普通点")
                prefix = str(op.get("prefix") or "Point")
                start_index = int(op.get("startIndex") or 1)
                count = int(op.get("count") or 1)
                start_x = float(op.get("startX") or 0)
                start_y = float(op.get("startY") or 0)
                step_x = float(op.get("stepX") or 0)
                step_y = float(op.get("stepY") or 0)
                width = float(op.get("width") or 5)
                height = float(op.get("height") or 5)
                ptype = self.point_type_from_kind(kind)

                for i in range(max(1, count)):
                    if kind == "出生点" and count == 1:
                        pid = prefix or "born"
                    else:
                        pid = f"{prefix}_{start_index + i}"

                    positions.append({
                        "id$$": pid,
                        "positionType$$": ptype,
                        "type$$": "rect",
                        "width$$": width,
                        "height$$": height,
                        "x$$": start_x + step_x * i,
                        "y$$": start_y + step_y * i
                    })

            elif op.get("op") == "add_boundaries":
                count = int(op.get("count") or 1)
                for i in range(max(1, count)):
                    boundaries.append({
                        "type$$": int(op.get("boundaryType") or 0),
                        "limitX$$": float(op.get("startX") or 0) + float(op.get("stepX") or 0) * i,
                        "limitY$$": float(op.get("limitY") or 500),
                        "conditionId$$": str(op.get("conditionId") or "")
                    })

        return {
            "positions": positions,
            "boundaries": boundaries,
            "layerSpeeds": self.get_template_object().get("layerSpeeds", {})
        }

    def save_template(self):
        try:
            path = filedialog.asksaveasfilename(
                title="保存操作模板",
                defaultextension=".json",
                filetypes=[("JSON", "*.json"), ("All files", "*.*")]
            )
            if path:
                write_json(path, self.get_template_object())
                self.log(f"已保存模板：{path}")
        except Exception as e:
            messagebox.showerror("保存失败", str(e))

    def load_template(self):
        try:
            path = filedialog.askopenfilename(
                title="加载操作模板",
                filetypes=[("JSON", "*.json"), ("All files", "*.*")]
            )
            if not path:
                return

            tpl = read_json(path)
            self.simple_operations = tpl.get("operations", []) or []

            speeds = tpl.get("layerSpeeds", {}) or {}
            for layer, vars_obj in self.speed_vars.items():
                if layer in speeds:
                    spec = speeds[layer]
                    vars_obj["enabled"].set(True)
                    vars_obj["x"].set(str(spec.get("moveSpeedRateX$$", spec.get("x", ""))))
                    vars_obj["y"].set(str(spec.get("moveSpeedRateY$$", spec.get("y", 0))))
                else:
                    vars_obj["enabled"].set(False)

            self.refresh_operations_view()
            self.log(f"已加载模板：{path}")
        except Exception as e:
            messagebox.showerror("加载失败", str(e))

    def output_path_for(self, original_path, output_base, input_base):
        original_path = Path(original_path)
        output_base = Path(output_base)
        input_base = Path(input_base)

        try:
            rel = original_path.relative_to(input_base)
            return output_base / rel
        except Exception:
            return output_base / original_path.name

    def backup_once(self, path):
        p = Path(path)
        if not p.exists():
            return
        bak = Path(str(p) + ".bak")
        if not bak.exists():
            shutil.copy2(p, bak)

    def ask_apply_to_all(self, category_name, action_name):
        return messagebox.askyesno(
            "应用到后续重复项？",
            f"是否对后续所有重复{category_name}都执行“{action_name}”？\n\n"
            "选择“是”：本次批处理后续所有同类重复项不再弹窗。\n"
            "选择“否”：下次遇到同类重复项继续询问。"
        )

    def ask_position_duplicate_action(self, prefab_name, position_id):
        dialog = tk.Toplevel(self.root)
        dialog.title("发现同名点位")
        dialog.transient(self.root)
        dialog.grab_set()
        dialog.resizable(False, False)

        result = {"action": "cancel", "apply_all": False}

        msg = (
            f"Prefab：{prefab_name}\n"
            f"点位 ID：{position_id}\n\n"
            "已存在同名点位，请选择处理方式：\n\n"
            "覆盖：更新已有点位的位置/类型/宽高。\n"
            "跳过：不处理这个点位。\n"
            "新增为新ID：保留旧点位，自动改名新增，例如 EnemyPoint_1_1。\n"
            "取消：停止整个批处理。"
        )

        tk.Label(dialog, text=msg, justify="left", padx=16, pady=12).pack(anchor="w")

        apply_var = tk.BooleanVar(value=False)
        tk.Checkbutton(
            dialog,
            text="后续所有重复点位都执行此操作",
            variable=apply_var
        ).pack(anchor="w", padx=16, pady=(0, 10))

        btns = tk.Frame(dialog)
        btns.pack(fill="x", padx=12, pady=(0, 12))

        def choose(action):
            result["action"] = action
            result["apply_all"] = bool(apply_var.get())
            dialog.destroy()

        tk.Button(btns, text="覆盖", width=12, command=lambda: choose("overwrite")).pack(side="left", padx=4)
        tk.Button(btns, text="跳过", width=12, command=lambda: choose("skip")).pack(side="left", padx=4)
        tk.Button(btns, text="新增为新ID", width=14, command=lambda: choose("new")).pack(side="left", padx=4)
        tk.Button(btns, text="取消批处理", width=12, command=lambda: choose("cancel")).pack(side="left", padx=4)

        dialog.protocol("WM_DELETE_WINDOW", lambda: choose("cancel"))

        self.root.wait_window(dialog)
        return result["action"], result["apply_all"]

    def make_duplicate_callback(self, prefab_name):
        def callback(position_id):
            if self.apply_all_duplicate_position_action in ("overwrite", "skip", "new"):
                return self.apply_all_duplicate_position_action

            action, apply_all = self.ask_position_duplicate_action(prefab_name, position_id)

            if action == "cancel":
                return "cancel"

            if apply_all:
                self.apply_all_duplicate_position_action = action
                action_name = {
                    "overwrite": "覆盖",
                    "skip": "跳过",
                    "new": "新增为新ID",
                }.get(action, action)
                self.log(f"后续重复点位将自动执行：{action_name}")

            return action
        return callback


    def make_boundary_duplicate_callback(self, prefab_name):
        def callback(boundary_type, existing_count):
            if self.apply_all_duplicate_boundary_action in ("overwrite", "skip"):
                return self.apply_all_duplicate_boundary_action

            result = messagebox.askyesnocancel(
                "发现同类型边界线",
                f"Prefab：{prefab_name}\n"
                f"边界类型：{boundary_type_value_to_label(boundary_type)}\n"
                f"现有数量：{existing_count}\n\n"
                "已存在同类型边界线。\n\n"
                "选择“是”：覆盖该类型边界线，即只移除该类型旧 Boundary 引用和对应旧可视节点，再新增当前模板里的边界线。\n"
                "选择“否”：跳过当前模板里的该类型边界线。\n"
                "选择“取消”：停止整个批处理。"
            )

            if result is True:
                action = "overwrite"
                action_name = "覆盖"
            elif result is False:
                action = "skip"
                action_name = "跳过"
            else:
                return "cancel"

            if self.ask_apply_to_all("边界线", action_name):
                self.apply_all_duplicate_boundary_action = action
                self.log(f"后续重复边界线将自动执行：{action_name}")

            return action
        return callback

    def run_batch(self):
        # 每次点击批量处理时重置“后续全部执行”记忆，避免影响下一轮操作。
        self.apply_all_duplicate_position_action = None
        self.apply_all_duplicate_boundary_action = None

        selected = [x for x in self.items if x.get("checked") and x.get("valid")]
        if not selected:
            messagebox.showwarning("未选择", "请先勾选可处理的 prefab。")
            return

        try:
            low = self.parse_template_to_low_level()
        except Exception as e:
            messagebox.showerror("模板错误", str(e))
            return

        input_base = Path(self.dir_var.get().strip())
        output_base = Path(self.output_dir_var.get().strip() or self.dir_var.get().strip())
        output_base.mkdir(parents=True, exist_ok=True)

        success = 0
        failed = 0

        self.log("=" * 80)
        self.log(f"开始处理 prefab：{len(selected)} 个")
        self.log(f"输出目录：{output_base}")

        for item in selected:
            try:
                src = Path(item["path"])
                data = read_json(src)
                if not is_prefab_array(data):
                    raise ValueError("不是 cc.Prefab 数组")

                stats = apply_operations_to_prefab(
                    data,
                    low,
                    duplicate_callback=self.make_duplicate_callback(src.name),
                    boundary_duplicate_callback=self.make_boundary_duplicate_callback(src.name)
                )

                dst = self.output_path_for(src, output_base, input_base)
                dst.parent.mkdir(parents=True, exist_ok=True)

                if self.backup_var.get() and dst.exists() and dst.resolve() == src.resolve():
                    self.backup_once(dst)

                write_json(dst, data)

                self.log(
                    f"[完成] {src.name} "
                    f"+点位{stats['added_positions']} "
                    f"覆盖点位{stats.get('updated_positions', 0)} "
                    f"点位覆盖警告{stats.get('position_update_warnings', 0)} "
                    f"跳过点位{stats.get('skipped_positions', 0)} "
                    f"+边界{stats['added_boundaries']} "
                    f"覆盖边界类型{stats.get('overwritten_boundary_groups', 0)} "
                    f"移除旧边界引用{stats.get('removed_boundary_refs', 0)} "
                    f"移除旧边界节点{stats.get('removed_boundary_nodes', 0)} "
                    f"清理孤儿边界节点{stats.get('cleaned_orphan_boundary_nodes', 0)} "
                    f"跳过边界{stats.get('skipped_boundaries', 0)} "
                    f"改速度层{stats['changed_speeds']}"
                )
                success += 1

            except DuplicateActionCancelled as e:
                self.log(f"[取消] {item.get('name')}: {e}")
                self.log("批量处理已停止。")
                break

            except Exception as e:
                failed += 1
                self.log(f"[失败] {item.get('name')}: {e}")
                self.log(traceback.format_exc())

        self.log("=" * 80)
        self.log(f"批量处理结束：成功 {success}，失败 {failed}。")
        messagebox.showinfo("完成", f"批量处理结束：成功 {success}，失败 {failed}。")


def main():
    root = tk.Tk()
    DirectPrefabBatchTool(root)
    root.mainloop()


if __name__ == "__main__":
    main()
