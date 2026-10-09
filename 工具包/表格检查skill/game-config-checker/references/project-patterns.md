# Project Patterns

Use these learned patterns when checking this project's planning Excel tables. Keep analysis read-only unless the user asks for edits.

## General Table Handling

- Read row 2 as the export field header. Row 1 is usually design guidance.
- Do not assume fixed columns when a table may have shifted. Map by header names such as `SkillDirectorID`, `ActionID`, `HangingPoint#1.Data`, `LogicalTrigger#1.TriggerID`.
- Exclude `battle/new` when the user requests it.
- Report workbook, sheet, row number, and field names.
- Distinguish confirmed broken links from design questions.

## Runtime Configuration Source

Before diagnosing a configuration symptom, determine and report whether the current client reads local exported `.bytes` or cloud-delivered configuration.

- If local `.bytes` are active, treat the decoded `.bytes` values as runtime truth. Compare them field by field with the source Excel rows and compare timestamps only as supporting evidence. Where available, decode with the client's generated protobuf module rather than guessing from file dates.
- If cloud configuration is active, do not use local `.bytes` as proof of the runtime value. Inspect the downloaded payload/cache or server response when accessible, and label the result unconfirmed if it cannot be observed.
- Always include the active source in the final report, even when it is not the cause.

Known failure mode: `role/EquipModel.xlsx` can contain a valid `DropItemEquipModel.SpecialEffectID`, while `assets/resources/tables/DropItemEquipModel.bytes` still contains an empty string from an older export. The runtime then displays the equipment icon but never creates the quality effect. This is an export/data-source mismatch, not a `SpecialEffect` resource or hanging-point failure.

## Monster Skill Action Chain

For a monster skill/action issue:

1. `role/RoleRes.xlsx` `MonsterRes`: find `MonsterResID`, `MonsterModelID`, `NormalAttack#N.SkillID`, `AdvancedAttack#N.SkillID`, `Skills#N.SkillIDs`.
2. `battle/Skill.xlsx` `Skill`: confirm each `SkillID` exists and note `SkillDirectorID`.
3. `battle/SkillDirector.xlsx` `SkillDirector`: confirm each director exists and inspect `ActionID`, `ActionGroup#N.Val`, warning, and logical triggers.
4. `role/Action.xlsx` `Action`: confirm action IDs exist and `PerformTime` is reasonable.
5. `role/NudeModel.xlsx` `MonsterModel`: compare the model's state action prefix with director action IDs.

Known pattern: `MonsterResID=207004` uses `MonsterModelID=45` (双刀斥候). Its model actions are `SScout_*`, but its SkillDirector rows used `Scout_*` actions. That mismatch causes skill actions not to appear even though skill IDs exist.

## Monster/NPC Display Chain

For "image incomplete", "only part appears", or "no animation":

1. Find `RoleRes` row (`MonsterRes`, `NpcRes`, etc.).
2. Find the matching `NudeModel` row by model ID.
3. Inspect each `HangingPoint#N.Type/Data`.
4. Confirm hanging-point types exist in `role/HangingPoint.xlsx`.
5. Confirm hanging-point data exists in the matching `EquipModel` sheet.
6. Confirm model state `ActionID`s exist in `role/Action.xlsx`.

Known patterns:

- `MonsterModelID=45` (双刀斥候) had `[挂点类型]双刀斥候-1` and `-2` types but empty data, so only shadow/partial visuals appeared. Candidate equipment exists in `MonsterEquipModel`: `MonsterEquipModel_Equip_SScout001`, `MonsterEquipModel_Equip_SScoutWeapon001`, `MonsterEquipModel_Equip_SScout002`, `MonsterEquipModel_Equip_SScoutWeapon002`.
- `NpcResID=35` (灵兽商人) pointed to `NpcModelID=25`; `NpcModel` had `Role_NPC_PetTrader` and `PetTrader_Idle01`, but `[挂点类型]灵兽商人-1` data was empty. Candidate equipment exists: `NpcEquipModel_Equip_PetTrader`.
- A `PictureID` such as `Picture_CharacterArt_GreatWallMan01` may be a UI portrait and does not prove the scene model is correct.

## Equipment/Adventure Drop Chain

For `装备配置不存在: 0` or missing equipment drops:

1. Check direct equipment tables:
   - `develop/Equip.xlsx` `Equip`: `EquipID`, `HeroEquipModelID`, `DropItemResID`.
   - `role/EquipModel.xlsx` `DropItemEquipModel`: drop model IDs and effects.
2. Check reward tables for "装备 + ID 0/blank" in `system/Item.xlsx` (`RandomChest`, `EquipChest`) and dungeon reward sheets.
3. Check adventure chain:
   - `adventure/Adventure.xlsx` `AdventureArea`: `EquipQualityRandomID`, `EquipPartRandomID`, `AdventureBarrierID`.
   - `AdventureBarrier`: `AdventureDropLevelID`.
   - `AdventureDropLevel`: `DropItemRandomID`.
   - `random/Random.xlsx` `DropItemRandom`: nested drop group and target type.
4. Check `random/Random.xlsx`:
   - `DropItemRandom` group IDs.
   - `EquipQualityRandom` group IDs.
   - `EquipPartRandom` group IDs.
   - Every quality + part combination referenced by an area can produce an `Equip` row.

Known pattern: adventure areas can exceed random group coverage. `AdventureAreaID` reached 22, while `DropItemRandom`, `EquipQualityRandom`, and `EquipPartRandom` only had groups 1-14. If server/client derives random group by area and there is no group above 14, equipment generation may default to ID 0.

## Enum Checks

When enum mismatch is suspected, use the provided enum workbook if available.

Known mapping:

- `[掉落物类型]空 = 0`
- `[掉落物类型]掉落表编号 = 4`
- `[掉落物类型]装备 = 5`
- `[物品类型]装备 = 300`
- `[装备部位]武器..酒壶 = 1..10`

If a runtime export lacks `[掉落物类型]装备`, a failed enum conversion can become `0`, which looks like "empty" or "missing equipment".

## SpecialEffect / Throw / Trap Checks

- For throw skills, visual SpecialEffects should mount to throw object hanging points, not generic model/character points.
- For throw, bullet, and ranged direct skills where the resource chain exists but no projectile/throw visual appears, also inspect `battle/Skill.xlsx` `Skill.SearchTargetNumber`. An empty target count can prevent target selection/creation and make a valid `SkillDirector`/trigger/resource chain look like a missing visual.
- If a throw visual or trap visual plays at the wrong time, check both `SkillDirector` timing and SpecialEffect hanging point.
- If a trap plays no idle and explodes immediately, inspect `TrapTrigger.MaximumEffective`, whether a target starts inside the area, and SpecialEffect mount/resource behavior.

### Throw State Action Duration

When a throw effect repeats several times at one position, freezes after one playback, or changes state late, do not conclude from `SearchTargetNumber` or repeated `LogicalTrigger` rows alone. Trace the throw entity's state timing:

1. `ThrowTrigger.ResID` -> `RoleRes.xlsx` `ThrowRes.ThrowModelID`.
2. `NudeModel.xlsx` `ThrowModel.State#N.ActionID#N` -> `Action.xlsx` `ActionID` and `PerformTime`.
3. Confirm that every configured state action exists in the throw `.skel` animation list.
4. Compare `Action.PerformTime` with the real animation duration and with `ThrowTrigger.TimeData` / `EffectTime`.

Known failure mode: the throw model changes state using an action whose animation does not exist in the referenced Spine resource. Runtime state timing may then use an invalid or unexpectedly long action duration, causing the visual effect to replay repeatedly before the state transition completes. Fix the missing or mismatched state action and its duration; changing target count or deleting logical triggers does not address this cause.

## Spine Export And Merged VFX Checks

Read `spine-inspection.md` when `.skel` or `.atlas` files are supplied or a table chain is valid but a visual is misplaced.

Known patterns:

- `Role_Throw_StoneMan01` and `Role_Trap_HugeWildMan01` used matching trap offsets, model scale, and collision boxes, but their Atlas source regions were about `512x92` versus `358x64`. Equal `ModelScaleData=10000` therefore made the first ground effect about 43% larger/taller. This is a resource-scale difference, not a `TrapTrigger.Y` error.
- Pig king normal-attack effects were formerly mounted through `[挂点类型]猪王-103`. Bone `103` had setup `X=4.711`, `Y=85.268`. After effects were merged into `Role_Monster_KWildBoar.skel`, `FX_NmAttack01` and `FX_NmAttack02` were parented to `root`, losing the mount transform and rendering about 85 Spine units too low. Restore the parent to `103`; fixed coordinate compensation is secondary.

## Reporting Template

Use this structure:

1. Confirmed issue: exact workbook/sheet/row/field.
2. Why it explains the symptom.
3. Suggested fix fields/values, marking values that need designer confirmation.
4. Checks that passed.
