---
name: game-config-checker
description: Check RPG/game planning spreadsheet configs and linked Spine resources. Use when asked to inspect or debug monster, boss, NPC, pet, equipment drop, adventure drop, skill, bullet, trap, throw, summon, action, model, resource, enum, SpecialEffect, hanging-point configuration, or .skel/.atlas animation and VFX placement.
---

# Game Config Checker

Use this skill to inspect game planning Excel tables for configuration issues. Prefer read-only analysis unless the user explicitly asks for edits.

## Scope

Default to the table root supplied by the user. If none is supplied and the current working directory is a config root, use it.

Honor user exclusions. In this project, if the user says not to inspect `battle/new`, exclude it entirely.

For project-specific learned patterns, read `references/project-patterns.md` before diagnosing drops, adventure/random tables, NPC/monster display, model hanging points, skill actions, throw/trap visuals, or enum mapping.

When the request includes a Spine `.skel`, `.atlas`, merged animation/effect resource, incorrect VFX position, resource scale mismatch, or export-origin question, read `references/spine-inspection.md`.

## Core Workflow

1. Identify the runtime configuration source before judging table values: local exported `.bytes` or cloud-delivered configuration. Verify this from the current client mode/code/logs when possible; do not infer it solely from the presence of local files.
2. Identify the target by name, resource ID, enemy ID, skill ID, model ID, or keyword.
3. Read row 2 as the export field header. Do not assume fixed columns when the table may have shifted.
4. Trace the relevant chain:
   - Monster: `Enemy.xlsx` -> `RoleRes.xlsx` `MonsterRes` -> `NudeModel.xlsx` `MonsterModel`.
   - NPC/pet/drop/bullet/trap/throw: `RoleRes.xlsx` sheet -> `NudeModel.xlsx` model sheet.
   - Visual parts: `NudeModel.xlsx` hanging points -> `EquipModel.xlsx` matching model sheet -> `HangingPoint.xlsx`.
   - Skills: `RoleRes.xlsx` skill IDs -> `Skill.xlsx` -> `SkillDirector.xlsx` -> trigger sheets -> `Action.xlsx`.
   - Special effects: action/director/trigger rows -> `SpecialEffect.xlsx` -> hanging point and resource.
   - Drops: content table -> `Random.xlsx` -> generated item/equipment tables.
   - Spine visuals: table action/effect mount -> model hanging-point setup bone -> `.skel` setup hierarchy and transforms -> `.atlas` source dimensions and offsets.
5. Validate hard references first:
   - Resource/model IDs exist.
   - Hanging-point data references existing EquipModel rows.
   - Skill IDs exist and reference existing SkillDirector IDs.
   - SkillDirector trigger type/id pairs exist in the matching trigger sheet.
   - SkillDirector `ActionID` and `ActionGroup#N.Val` exist in `Action.xlsx`.
   - Buff IDs, summoned Enemy IDs, SpecialEffect IDs, Audio IDs, and DropItemRandom IDs exist.
6. Then check behavior risks:
   - Visual only partially appears: model hanging point data is empty or uses the wrong equipment model.
   - Skill action does not appear: director action prefix does not match the model's action family.
   - Trap/throw timing looks wrong, repeats, or freezes: trace each `NudeModel` state `ActionID` into `Action.xlsx`, confirm the animation exists in the referenced Spine resource, then compare `PerformTime`, logical trigger times, resource behavior, and SpecialEffect mount point.
   - Equipment drop reports ID 0: trace adventure/random coverage and enum conversion before blaming `Equip.xlsx`.

## Tooling

Use `scripts/check-game-config.ps1` for repeatable read-only checks:

```powershell
powershell -ExecutionPolicy Bypass -File <skill>/scripts/check-game-config.ps1 -Root "C:\策划\策划\数据表\develop" -Query "石头巨人" -ExcludeBattleNew
```

The script prints candidate rows, traced chains, missing references, and suspicious SpecialEffect hanging points. Treat script output as a starting point, then apply the workflow above.

Use `scripts/inspect-spine.py` for read-only Spine 4.2 binary and Atlas inspection:

```powershell
python <skill>/scripts/inspect-spine.py "D:\client\assets\resources\spines\role\Role_Monster.skel"
python <skill>/scripts/inspect-spine.py first.skel second.skel --bone-filter "FX|Main|103" --strings
```

The helper reports skeleton metadata, selected setup-pose bones, likely animation/action strings, and adjacent Atlas region sizes. It does not modify resources.

## Reporting

Keep the final answer short and actionable:

- Start with confirmed hard errors.
- Then list strong suspicious issues.
- Then list checks that passed.
- Include exact workbook names, sheet names, row numbers, and fields.
- Always state the runtime data source used for the diagnosis: `local .bytes`, `cloud configuration`, or `unconfirmed`.
- When local `.bytes` are active, compare the actual decoded runtime fields with the source Excel values; a correct Excel row does not prove that the client export is current.
- Separate confirmed breakage from values that need designer confirmation.
