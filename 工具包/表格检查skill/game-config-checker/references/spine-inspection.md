# Spine Resource Inspection

Use this reference for `.skel`, `.atlas`, merged character/effect exports, misplaced VFX, unexpected model height, or a visual discrepancy that remains after spreadsheet references pass.

## Start From Runtime Ownership

Before changing coordinates, determine how the visual is created:

1. Trace `Skill -> SkillDirector -> Action -> SpecialEffect` and the relevant `RoleRes -> NudeModel` row.
2. If the Action or director names a SpecialEffect, inspect its `HangingPointType`, `Offset.X`, and `Offset.Y`.
3. If Action and director SpecialEffect fields are empty but the effect appears inside the character animation, treat it as embedded in the character `.skel`.
4. For trap, throw, bullet, or summon entities, inspect the resource/model Spine path and setup-state Action separately from character effects.

This distinction matters: table offsets cannot repair an effect that is embedded under the wrong Spine bone.

## Read Binary And Atlas Data

Run `scripts/inspect-spine.py` on the `.skel`. For Spine 4.2 it reads:

- export version, skeleton bounds, reference scale, FPS, image path, and audio path;
- setup-pose bone names, parent indices, local X/Y, rotation, scale, shear, and length;
- likely action and animation names from the binary string data;
- adjacent `.atlas` page scale plus region bounds, original size, and trim offsets.

If a supplied mapped drive is unavailable in the tool process, search a local client/resource tree for the same basename. State clearly when conclusions come from a local copy rather than the exact supplied file.

## Diagnose Position Errors

Compare the old playback chain with the merged/exported hierarchy.

- A SpecialEffect formerly mounted to bone `N` receives that bone's setup and animated transform.
- If the merged effect root is reparented directly to `root`, it loses the mount bone's X/Y and animation.
- Compare the old mount bone setup position with the merged effect root. A difference matching the visible displacement is strong evidence of a lost mount transform.
- Prefer restoring the effect root's parent to the original hanging-point bone with local `X=0, Y=0`. A fixed X/Y compensation is only a fallback because it will not follow animated mount movement.
- Inspect the entire parent chain. A child may look correct locally while a parent `Main`, `FX`, `dimian`, or similar bone applies a large negative Y.

Do not blame trigger offsets when the logical spawn positions match and only the visual content is displaced.

## Diagnose Size And Height Errors

For two effects placed at the same logical position:

1. Compare `ModelScaleData` in `NudeModel.xlsx`.
2. Compare Atlas `scale` values.
3. Compare each region's original dimensions from `offsets: left,bottom,width,height`, not only packed `bounds`.
4. Compute the ratio of original width and height. If table scale and Atlas scale match, that ratio predicts the in-game size difference.

Example: source regions `512x92` and `358x64` differ by about `1.43x`. With equal `ModelScaleData`, the first effect will appear about 43% wider and taller. Fix the art/export scale when possible; use `ModelScaleData ~= 10000 / 1.43`, about `7000`, only as a deliberate table-level workaround.

Packed PNG page dimensions do not establish model scale. Region original dimensions and skeleton transforms do.

## Diagnose Timing And Stutter

Spine data is only one layer of timing:

- Compare Action `PerformTime`, logical trigger creation times, entity maximum duration, and the actual animation duration.
- Check whether the same trap/effect entity is created twice while `MaximumQuantity=1`; replacement can reset one visual layer and look like a Spine hitch.
- Look for an unused dedicated explosion/disappear trigger before assuming the Spine animation is malformed.
- For layered effects, verify front/back entities are created and removed together unless staggered timing is intentional.

## Reporting

Report evidence in this order:

1. Exact misplaced bone or mismatched resource, including parent and setup X/Y.
2. The prior table hanging point or comparison resource that establishes the expected transform.
3. Why the difference explains the visible symptom.
4. Preferred art/Spine fix, then any table workaround.
5. Whether the exact supplied file or a same-name local copy was inspected.

Keep confirmed resource facts separate from values that require visual tuning.
