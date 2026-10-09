#!/usr/bin/env python3
"""Read-only summary of Spine 4.2 binary setup bones and adjacent Atlas data."""

from __future__ import annotations

import argparse
import json
import re
import struct
from pathlib import Path


DEFAULT_BONE_FILTER = r"(^\d{3}(#.*)?$|fx|effect|main|attack|trap|throw|bullet|dilie|dimian)"
ACTION_STRING = re.compile(r"(attack|idle|run|admission|fallen|getup|hit|skill|action|sustain|disappear)", re.I)


class SpineInput:
    def __init__(self, data: bytes) -> None:
        self.data = data
        self.cursor = 0

    def byte(self) -> int:
        if self.cursor >= len(self.data):
            raise ValueError("unexpected end of Spine binary")
        value = self.data[self.cursor]
        self.cursor += 1
        return value

    def boolean(self) -> bool:
        return self.byte() != 0

    def varint(self, optimize_positive: bool = True) -> int:
        value = 0
        shift = 0
        while True:
            item = self.byte()
            value |= (item & 0x7F) << shift
            if not item & 0x80:
                break
            shift += 7
            if shift >= 35:
                raise ValueError("invalid Spine varint")
        return value if optimize_positive else ((value >> 1) ^ -(value & 1))

    def string(self) -> str | None:
        length = self.varint()
        if length == 0:
            return None
        end = self.cursor + length - 1
        value = self.data[self.cursor:end].decode("utf-8", "replace")
        self.cursor = end
        return value

    def float(self) -> float:
        end = self.cursor + 4
        if end > len(self.data):
            raise ValueError("unexpected end of Spine float")
        value = struct.unpack(">f", self.data[self.cursor:end])[0]
        self.cursor = end
        return value

    def color(self) -> str:
        return bytes(self.byte() for _ in range(4)).hex()


def parse_spine(path: Path) -> dict:
    data = path.read_bytes()
    reader = SpineInput(data)
    reader.cursor = 8  # Two 32-bit hash values.
    version = reader.string()
    if not version or not version.startswith("4.2"):
        raise ValueError(f"unsupported Spine version {version!r}; this helper parses 4.2")

    result = {
        "path": str(path),
        "bytes": len(data),
        "version": version,
        "bounds": {
            "x": reader.float(),
            "y": reader.float(),
            "width": reader.float(),
            "height": reader.float(),
            "referenceScale": reader.float(),
        },
    }
    nonessential = reader.boolean()
    result["nonessential"] = nonessential
    if nonessential:
        result["fps"] = reader.float()
        result["imagesPath"] = reader.string()
        result["audioPath"] = reader.string()

    strings = [reader.string() for _ in range(reader.varint())]
    bones = []
    bone_count = reader.varint()
    for index in range(bone_count):
        name = reader.string()
        parent = None if index == 0 else reader.varint()
        bone = {
            "index": index,
            "name": name,
            "parent": parent,
            "rotation": reader.float(),
            "x": reader.float(),
            "y": reader.float(),
            "scaleX": reader.float(),
            "scaleY": reader.float(),
            "shearX": reader.float(),
            "shearY": reader.float(),
            "length": reader.float(),
            "inherit": reader.varint(),
            "skinRequired": reader.boolean(),
        }
        if nonessential:
            bone["color"] = reader.color()
            bone["icon"] = reader.string()
            bone["visible"] = reader.boolean()
        bones.append(bone)

    identifiers = {
        item.decode("ascii")
        for item in re.findall(rb"[A-Za-z_][A-Za-z0-9_#.-]{3,}", data)
    }
    result["stringCount"] = len(strings)
    result["boneCount"] = len(bones)
    result["bones"] = bones
    result["likelyActions"] = sorted(value for value in identifiers if ACTION_STRING.search(value))
    return result


def parse_atlas(path: Path) -> dict:
    lines = [line.rstrip() for line in path.read_text(encoding="utf-8-sig").splitlines()]
    page = next((line for line in lines if line and ":" not in line), None)
    page_size = None
    page_scale = None
    regions = []
    current = None
    for line in lines[1:]:
        if not line:
            continue
        if ":" not in line:
            if current:
                regions.append(current)
            current = {"name": line}
            continue
        key, value = (part.strip() for part in line.split(":", 1))
        if current is None:
            if key == "size":
                page_size = value
            elif key == "scale":
                page_scale = value
        else:
            current[key] = value
    if current:
        regions.append(current)
    return {"path": str(path), "page": page, "size": page_size, "scale": page_scale, "regions": regions}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("skel", nargs="+", type=Path, help="Spine .skel file(s)")
    parser.add_argument("--bone-filter", default=DEFAULT_BONE_FILTER, help="case-insensitive regex for setup bones")
    parser.add_argument("--all-bones", action="store_true", help="print every setup bone")
    parser.add_argument("--strings", action="store_true", help="print likely action/animation strings")
    parser.add_argument("--no-atlas", action="store_true", help="skip an adjacent .atlas file")
    args = parser.parse_args()
    bone_filter = re.compile(args.bone_filter, re.I)

    for path in args.skel:
        print(f"\n=== {path} ===")
        if not path.is_file():
            print("ERROR: file not found")
            continue
        try:
            result = parse_spine(path)
        except (OSError, ValueError) as error:
            print(f"ERROR: {error}")
            continue

        summary = {key: value for key, value in result.items() if key not in {"bones", "likelyActions"}}
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        selected = result["bones"] if args.all_bones else [
            bone for bone in result["bones"] if bone_filter.search(str(bone["name"] or ""))
        ]
        print("SETUP_BONES")
        for bone in selected:
            parent_index = bone["parent"]
            parent_name = None if parent_index is None else result["bones"][parent_index]["name"]
            item = dict(bone)
            item["parentName"] = parent_name
            print(json.dumps(item, ensure_ascii=False))
        if args.strings:
            print("LIKELY_ACTIONS")
            for value in result["likelyActions"]:
                print(value)

        atlas_path = path.with_suffix(".atlas")
        if not args.no_atlas and atlas_path.is_file():
            print("ATLAS")
            print(json.dumps(parse_atlas(atlas_path), ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
