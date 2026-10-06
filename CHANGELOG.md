# Changelog

## Unreleased

## 0.2.0

Stage 2: editor.

### Added

- Test fixture `crowd`: 200 objects with locks and provisional values, for the stage 2 editor.
- `dist/editor.html`: the editor as one self-contained page. Isometric view with the scene camera and a top-down plan view on Canvas 2D, repainted only when something changes. Open a scene file (validated like `validate`) and save it: the same scene gives the same bytes, and nothing is kept outside the file.
- Dragging on both views with grid snap (off, 0.05, 0.1, 0.25, 0.5, 1) on the ground at constant height. A locked `pos` cannot be dragged; `pos.u` or `pos.v` blocks that axis only. Locked objects show a lock icon. One drag is one undo step; undo and redo.
- Property panel with units, a lock toggle per property (`pos`, `pos.u`, `pos.v`, `rot`, `type` and the sizes of the type as JSON Pointer locks) and a provisional mark for numbers that have an entry in `assumptions`.
- Live check panel: after a change only the checks that involve the changed objects run again; `in_region` and `no_overlap` measure only the changed objects. Tapping a row highlights its objects in both views.
- Toggleable overlays: frame regions, strips, lanes, zones, anchors, object labels.
- Touch: one-finger drag and pan, two-finger zoom, 44 px controls on touch screens, a 24 px reach for fingers.
- Frame-time test on `crowd` with a 4x CPU slowdown, and tests that drive the page with `playwright-core` and an installed Chromium (skipped when there is none).
- Core: `locks`, `edit` (lock-aware `moveObject`, `setRotation`, `setObjectType`, `setTypeSize`; an edited number keeps its assumption's `value` in step), `history`, `serialize`, `incremental` (`updateResults`, `changedObjects`), `drag`, `pick`, `viewport`, `planView`, `assumptions`. `buildDisplayList` takes options: a camera, a ground extent, anchors and an explicit cache.
- Development dependency `playwright-core` (approved for stage 2 in `AGENTS.md`).

### Changed

- `npm run build` runs `scripts/build.mjs` and writes `dist/isoblock.mjs` and `dist/editor.html`. `npm run typecheck` also checks `src/editor`, which has its own `tsconfig.json` with the DOM types.
- `vitest` builds `dist/` once before the tests and runs test files one after another.
- Drawing order uses sweep and prune and a heap, and the display list keeps work for objects that did not change: building the display list of `crowd` takes about 1.5 ms instead of 8 ms, and about 0.5 ms when one object moved (measured in Node on one machine). The order is the same as before, and `render` writes the same SVG bytes for every fixture.

## 0.1.0

Stage 1: schema, projection, geometry, checks, SVG render, CLI.

### Added

- Scene format `isoblock/1`: JSON Schema in `schema/isoblock-1.json`. Unknown keys are errors; `x-` keys are allowed. For checks the stage does not implement, only `id` and `check` are validated.
- Reference checks: duplicate ids, unknown object types, relation targets (`zone:`, `lane:`, `strip:<id>.v0|v1`), check parameters that name missing things, states that hide missing objects, assumption paths that do not resolve.
- Projection, inverse projection and camera direction, matching `tests/golden/projection.json`.
- Object geometry: footprints, 90-degree rotation about the footprint center, parts.
- Checks `in_region`, `no_overlap`, `clearance`, `lane_clear`, `lane_reaches` and `visible`, as defined in SPEC 9.1. Checks not implemented in this stage, unsupported lane shapes and the `top` and `bottom` edges return `skip`.
- Display list (ground, objects in painter's order, region outlines, labels) and SVG output.
- `describe` (SPEC Appendix B).
- CLI `validate`, `check` (text and `--json`), `render` (`-o out.svg`) and `describe`, with the exit codes of SPEC section 11. Commands and flags of later stages exit 2 and name the stage that adds them.
- `npm run build` bundles the CLI into `dist/isoblock.mjs`.
- `docs/AGENT_GUIDE.md`: install, the four commands, how to read `describe`, check reference.
