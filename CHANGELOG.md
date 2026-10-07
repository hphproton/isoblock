# Changelog

## Unreleased

## 0.5.0

Stage 5: export for engines and image generation, the block image, and the Godot adapter.

### Added

- `isoblock export <scene> --target runtime|gen-bbox [-o out.json] [--bbox-units px|norm1000] [--bbox-order xyxy|yxyx]`. `--target runtime` writes the runtime file `isoblock-runtime/1` (SPEC 13.7): a reduced copy of the scene with footprints, parts and anchors in world units after rotation and the painter's `order` of every part. `--target gen-bbox` writes `isoblock-genbbox/1` (SPEC 14): one screen box per object, clipped to the frame, with the type's `genHint`; pixels or `norm1000`, `xyxy` or `yxyx`. Both use the saved format; without `-o` the file goes to stdout. A missing or unknown `--target`, the targets `godot`, `phaser` and `tiled` (not scheduled), the bbox flags with `runtime`, and `-o` naming the scene file are usage errors (exit 2).
- `isoblock render <scene> -o out.png`: the block image, the SVG of `render` without text rasterized by `@resvg/resvg-wasm` (2.6.2, new runtime dependency) at 1 px per frame unit with no fonts. `dist/isoblock.mjs` carries the WebAssembly module and works alone. The bundle grows from 0.4 to 3.7 MB; other commands do not load the module.
- Godot adapter in `adapters/godot/` (`isoblock_runtime.gd`, GDScript for Godot 4.7, Compatibility renderer) and its test project: loads a runtime file and builds a `Node2D` tree with debug boxes (`Polygon2D` faces per part with an absolute `z_index` equal to `order`), `Marker2D` anchors, and hidden zone and lane nodes; error codes `E_SCHEMA`, `E_DUPLICATE_ID`, `E_Z_RANGE`, `E_IO`, `E_JSON_PARSE`.
- `npm run test:godot` (needs Godot 4.7.1 in `GODOT`, and Xvfb or a `DISPLAY`; not part of `npm test`): golden vectors, the adapter's own tests, and the cross-checks of SPEC 13.6 on every case of `tests/fixtures/export/cases.json`: each object alone within 1 px of its SVG polygons, the whole frame within 100 pixels per 1,000,000 of a painter's raster of the SVG, two runs byte-identical.
- Core: `src/core/export/` (`runtimeFile`, `genBboxFile`, `partOrders`), `orderDirection`, `round`, `serializeJson`. CLI: `src/cli/export.ts`, `src/cli/png.ts`. Scripts: `scripts/test-godot.mjs` and `scripts/godot/` (the SVG reader and the measures of the cross-check, unit tested).
- Tests that load every case of `tests/fixtures/export/cases.json` and compare every expected file (the runtime file and each `gen-bbox` flag set as JSON with the case file's tolerances, the PNG per channel), in the core, through the CLI with in-memory files and through `dist/isoblock.mjs` (also copied alone into an empty directory). The two expected PNGs are byte-identical to the output.
- `docs/AGENT_GUIDE.md` covers `export`, the block image and the Godot adapter (setup, loading, test).

### Changed

- The painter's order of parts follows SPEC 13.4 exactly: the camera direction is rounded to 9 decimals and the depth of a part to 6, so that exact ties are exact in every implementation. `render` and the editor use it. On `crowd` the order of parts with equal rounded depth can differ from earlier versions.
- `render -o` accepts `.svg` and `.png`; `export` and `--target` are no longer "added in stage 5".
- `serializeJson` is the one function that writes the saved format; `serializeScene` calls it.

## 0.4.0

Stage 4: relations, solver and minimal conflict set.

### Added

- Relation measures (SPEC section 7) for every `rel`: screen-x separation (`left_of`, `right_of`), ground-depth separation (`in_front_of`, `behind`), band violations of the edge-to-edge distance (`gap`) and of the distance to an object, lane or strip edge (`against`), corner distance to a zone (`inside`), center difference (`aligned`), offset and position along a lane polyline (`on_lane`), distance and overlap (`clear_of`), backward steps (`order_along`). `facing`, unsupported targets, lane shapes and missing parameters give `skip` with a message. Status `satisfied` up to a violation of 1e-6; soft penalty is the sum of `weight * violation` over soft relations that are not skipped.
- `isoblock relations <scene> [--json]`: a summary line and `OK|BAD|SKIP <id> <rel>: <message>` per relation, or `{ "scene", "results" }`; exit 0 when every hard relation is satisfied, else 1.
- `isoblock solve <scene> [--only a,b] [-o proposal.json] [--patch moves.patch] [--json]` (SPEC section 8): moves the objects without a `pos` lock (only those in `--only`, when given; `pos.u`, `pos.v` and pointer locks on a position fix that coordinate) to positions on the 0.05 grid that meet the hard relations, keep moved footprints inside the view region and off other footprints, then lower the soft penalty, then the distance moved. Deterministic local search (pattern moves per object and per group of related objects, then seeded perturbations). `solved`, or `conflict` with a minimal conflict set found by deletion filtering in file order. `-o` writes the proposal in the saved format, `--patch` writes it as `move` commands that `patch` applies to the same bytes; the input file is never written. Exit 0 when solved and every check of the proposal passes, else 1.
- Core: `src/core/relations/` (`prepareRelations`, `evaluateRelations`, report) and `src/core/solver/` (`buildModel`, `search`, `solveScene`, `minimalConflict`, report and patch output).
- Tests that load `tests/fixtures/relations/` and `tests/fixtures/solver/` and check every expected field, in the core, through the CLI with in-memory files and through `dist/isoblock.mjs`; the solver constraints, determinism, locks, `--only`, conflicts and the performance of `perf` (median of 5 runs under 200 ms).
- `docs/AGENT_GUIDE.md` covers relations, `relations`, `solve` and the workflow `relate` -> `solve --patch` -> `patch`.

### Changed

- `solve` and `--only` are no longer usage errors. A `solve` line in a patch is still `E_USAGE`; its message now points to `isoblock solve --patch`.
- `followAssumptions` in `src/core/patch/apply.ts` is exported, for the solver proposal.

## 0.3.0

Stage 3: patches, patch log, `diff`, `compare`.

### Added

- `isoblock patch <scene> <patch> [-o out.json] [--dry-run] [--json]`: applies a patch file to a scene. A patch is JSON Patch (RFC 6902) or short commands (`move`, `rot`, `set`, `lock`, `relate`) with `#` comments; the first comment line is the description. `solve` in a patch is a usage error that names stage 4.
- Patches apply to a copy and are atomic. `move` and `rot` round the coordinates they compute to 6 decimals, `rot` keeps the footprint center, and every `assumptions[].value` follows the value at its path.
- Lock detection: a patch that changes a locked value, removes a lock entry or removes a locked object is rejected with `E_LOCK` and exit code 3, with labels `<object id>.<lock>`. New error codes `E_PATCH` and `E_LOCK`; exit code 3.
- The fixed order of outcomes (malformed or failing patch, then locks, then schema and references of the result, then applied), a text report and a `--json` report (`status`, `error`, `locks`, `diff`, `checks`, `failing`). A rejected or invalid patch writes no scene file.
- Patch log `<output without .json>.log.jsonl`: one line for every applied or lock-rejected patch that is not a dry run.
- `isoblock diff <a> <b> [--json]`: changes between two scenes, matched by identity (`id`, `path` for assumptions) and sorted by JSON Pointer.
- `isoblock compare <scene> --variant NAME=FILE... [--format text|md|json]`: a base scene and 1 to 4 variants (patch files or scene files) side by side: failing checks, locks touched, the checks that fail or differ, objects moved. `--state` names stage 6 and `--render` is not scheduled.
- Core: `diffScenes`, `runPatch`, `parsePatch`, `applyPatch`, `touchedLocks`, `compareVariants` and their formatters, `jsonEdit` and `jsonEqual`.
- Tests that load every file in `tests/fixtures/patches/` and `tests/fixtures/compare/`, in the core, through the CLI with in-memory files, and through `dist/isoblock.mjs`.
- `docs/AGENT_GUIDE.md` covers the patch syntax, `patch`, `diff` and `compare`.

### Changed

- The CLI file access (`Io`) has two more functions, `appendText` and `exists`, for the log. `Io` lives in `src/cli/io.ts` and is still exported from `src/cli/run.ts`.
- `patch`, `diff` and `compare` are no longer usage errors. The usage text lists them.

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
