# Changelog

## 0.8.0

Stage 8: the Godot adapter draws sprites and actors by the engine rule, applies states and instantiates types; the editor runs grid checks again when a drag ends. The scene file and the runtime file (`isoblock-runtime/2`) do not change.

### Breaking: Godot adapter tree and API

`adapters/godot/isoblock_runtime.gd` now draws the `sprites` of the runtime file, in ascending key, as the child order of one node (SPEC 13.4, 13.8). Parts are no longer nodes, and no node uses `z_index`.

| 0.7.0 | Now |
|---|---|
| `Objects/<object>/<part>` (`Node2D` with an absolute `z_index` = `order`) holding face polygons | `Sprites/<sprite>` (`Node2D`, meta `object`, `key`, `slice`) in draw order, holding the faces of its pieces, or an instance of the type's scene |
| `Objects/<object>` holds parts and anchors | `Objects/<object>` holds only its anchors (`Marker2D`) and its meta |
| `build(data, color_of)` returns `{ root, code, message }` | `build(data, color_of, scenes)` returns `{ root, code, message, unmapped }` |
| `E_Z_RANGE` (more than 4097 parts) | removed: any number of parts fits |
| states and actors not supported | `apply_state(root, name)` (`E_STATE`); `add_actor`, `move_actor`, `remove_actor` (`E_ACTOR`); `sort_key(dir, footprint)`, `order_direction(camera)`, `faces(camera, dir, box)` |

Upgrade from 0.7.0:

1. Copy the new `isoblock_runtime.gd` into the game project. Runtime files exported by 0.7.0 load unchanged; an object without `sprites` and a file without `states` are now `E_SCHEMA`, so export older files again.
2. Code that looked up parts under `Objects/<object>/<part>` or read their `z_index` must use the sprites: the children of `Sprites` whose meta `object` is the object id. Anchors stay at `Objects/<object>/<anchor>`, with the same meta.
3. Do not reorder the children of `Sprites`, set a `z_index` on them or turn on y-sort: the child order is the draw order. Add moving objects with `add_actor(root, id, [w, d, h], [u, v], node)` and move them with `move_actor`, which keeps them in their place; a node added to the tree by other means is not sorted.
4. To show art instead of debug boxes, pass `scenes` (type name to `PackedScene`) to `build`. The origin of each scene sits on the projected center of the object's footprint at h = 0; a sliced object shows one clipped copy per slice. `unmapped` lists the types that are still drawn as debug boxes.
5. Code that checked for `E_Z_RANGE` can drop that branch.

### Added

- Godot adapter (SPEC 13.8): the `Sprites` container in the draw order of the engine rule (ascending key, equal keys in the order of the sprite list); instancing through a type to `PackedScene` map with the pivot on the projected footprint center, one instance per slice of a sliced object under a `Polygon2D` mask (the hull of the slice's pieces, `clip_children` = `CLIP_CHILDREN_ONLY`), instance meta `object`, `type`, `rot` and `slice`, and `unmapped`; `apply_state` with `""` for the default state and `E_STATE`; actors (`add_actor`, `move_actor`, `remove_actor`) placed after every scene sprite with a key at most theirs and in the order added among equal keys, drawn by the game's node or as a box, and `E_ACTOR`; `sort_key` and `order_direction` in double precision. A `Vector2` position is read as the shortest decimal with the same single-precision value, so actor keys equal the tool's keys.
- Adapter tests: the keys of `tests/golden/sort.json` through `sort_key`, the tree and the draw order (also with equal keys), `unmapped`, the instances and their masks, states, actors, actor order on equal keys, and the error codes.
- `npm run test:godot` runs every case of `tests/fixtures/godot/cases.json`: the states in order, the instanced types drawn from white art colored through `modulate`, and the actor along its path, where each frame may differ from the SVG of the scene with the actor (`isoblock-actor`) in at most `actorLimit` more pixels than the frame without it. A GDScript runtime error in a Godot run is now a failure.
- Editor: during a drag, the rows of `reachable` and `sort_consistency` keep their last result and are marked out of date; they run again when the drag ends or is cancelled (SPEC 10). `window.isoblock.state()` reports the ids of those rows as `stale`.
- Core: `searchesGrid`, the `defer` argument of `updateResults` and `rerunResults` in `src/core/incremental.ts`.
- Tests: the editor's grid checks on `walk` and `court` (rows out of date during a drag, the panel equal to `check --json` on the saved file after the drop) and the frame-time test on both scenes (stage 2 criterion: the 95th-percentile interval between frames on the phone profile at 4x slowdown).

### Changed

- The cross-check of SPEC 13.6 clips each polygon to the frame before it takes the box of an object alone (stage 5 to 7 clipped the box, which differs where a frame edge cuts a slanted polygon edge).
- `docs/AGENT_GUIDE.md` covers the adapter's sprites, states, actors and instancing, and the editor's grid checks.

## 0.7.0

Stage 7: sprites, slices and sort keys, `sort_consistency`, and the runtime file `isoblock-runtime/2`.

### Breaking: runtime file `isoblock-runtime/2`

`isoblock export --target runtime` now writes `isoblock-runtime/2` (SPEC 13.7). It is the version 1 file plus two additions, so a reader of version 1 finds every key it knew:

- every object has `sprites`: `[{ "key", "footprint", "pieces": [{ "part", "box" }] }]` (see below);
- the file has a top-level `states` after `lanes`: `{ "<state>": { "hide": [object ids] } }`, one entry per state of the scene in file order, `{}` when there are none.

Upgrade from `isoblock-runtime/1`:

1. Export every scene again: `isoblock export <scene> --target runtime -o <game>/data/scenes/<id>.json`. The `schema` value in the new file is `isoblock-runtime/2`; no other key changed its meaning.
2. In a loader of your own, accept the new `schema` value (`isoblock-runtime/2`) and reject `isoblock-runtime/1`, so that an old file is never read as a new one. Ignore `sprites` and `states` if you do not use them yet.
3. The Godot adapter in `adapters/godot/` is updated: it reads `isoblock-runtime/2` and reports every other `schema` value, `isoblock-runtime/1` included, as `E_SCHEMA`. It keeps drawing parts by `order` and does not use `sprites` and `states` until stage 8. Copy the new `isoblock_runtime.gd` into the game project.

### Added

- Sprites, slices and sort keys (SPEC 13.4). The sort key of a footprint is `cu * (u0 + u1) + cv * (v0 + v1)` with the camera direction `c` of the painter's order, rounded to 6 decimals. An object becomes one sprite, or, when its footprint is not square, the number of slices (at most 64) that brings the slice length closest to the short side; slice boundaries are rounded to 6 decimals, the part boxes are cut to the slice (the end slices reach to infinity along the long axis), and pieces are listed in the painter's order of their parts. The engine rule is: draw sprites in ascending key, equal keys in the order of the sprite list, actors after scene sprites.
- Check `sort_consistency` (SPEC 9.3): walks a test actor (`actor`, `step`, `reach`, optional `area` and `ids`) around each object, compares the one-key-per-sprite order with the geometric order against the actor and against every other object, and reports the objects whose largest area drawn in the wrong order (the intersection of the two outlines on the screen) is over `maxPixels`. Results carry `worst` (px squared, 2 decimals) and `positions`. A zone `area` with fewer than 3 points, and a search of more than 4,000,000 cells, give `skip`. In a state, hidden objects have no sprites, block no position and are not examined.
- Schema and reference rules for the parameters of `sort_consistency` (`area` names a zone, `ids` name objects; `actor` is three numbers of 0 or more; `step` above 0).
- `compare`: the label `sort_consistency <check id> (objects out of order)` and integer cells.
- `describe`: `FAIL s1 sort_consistency shed, box, counter, kiosk: drawn out of order, worst 545.60 px2`.
- `isoblock-runtime/2` with `sprites` and `states` (see above).
- Core: `src/core/sort/` (`sprites`, `outline`, `mismatch`) and `src/core/checks/{sortConsistency,sortPositions}.ts`.
- Tests that load `tests/golden/sort.json`, every case of `tests/fixtures/sort/cases.json` (check results by state, the `compare` case in all three formats) and every case of `tests/fixtures/runtime/cases.json`, in the core, through the CLI with in-memory files and through `dist/isoblock.mjs`; unit tests for the outline geometry, the sprite rules and the check, with areas worked out by hand.
- `docs/AGENT_GUIDE.md` covers sprites and slices, `sort_consistency` and how to read its result, and the runtime file 2.

### Changed

- The Godot adapter reads `isoblock-runtime/2` (see above). `npm run test:godot` passes on every case of `tests/fixtures/export/cases.json`.
- Tests no longer read the `runtime` entries of `tests/fixtures/export/cases.json` (the release removes them with the stage 5 files); runtime files come from `tests/fixtures/runtime/`.
- `sort_consistency` is no longer `skip` as "not implemented": a scene file that lists it without `actor` is now invalid (`E_SCHEMA`). `state_stable` is the one check that returns `skip` for that reason, so the tests that used `sort_consistency` as the example of a check that is not implemented now use `state_stable`.

## 0.6.0

Stage 6: states and the gameplay checks.

### Added

- States (SPEC 9.2). `states.<name>` has only `hide` (and `x-` keys) in the schema; a state that hides objects is applied with `--state NAME` to `check`, `render` (SVG and PNG), `compare` and `export --target gen-bbox`. In a state, hidden objects are not drawn, get no generation box and do not overlap, block, occlude or count anywhere; a check that names a hidden object by itself is `skip`; the lists `ids`, `allow` and `ignore` lose the hidden objects (a list that loses all of them checks none). An unknown state and `--state` with `export --target runtime` are usage errors (exit 2).
- Check `reachable`: a walkable path from `from` to `to` on a grid of free cells (cell centers at `(i + 0.5) * step`; walkable zones or the zone `area`, minus blocked zones and the footprints within `radius`), the fewest moves between cells that share an edge, `max`, and the three messages `start is not on walkable ground`, `target is not on walkable ground` and `no walkable path`. Points are `[u, v]`, `lane:<id>` or `anchor:<object id>/<anchor id>`. A scene without a walkable zone, an `area` with fewer than 3 points, or a grid of more than 4,000,000 cells gives `skip`.
- Check `capacity`: the anchors of a `kind` that can be used at once (candidates in file order, a `body` rectangle per anchor, `allow`), with `accepted` and `rejected` labels in the result.
- Check `min_screen_size`: the on-screen height of a target, scaled by `screenWidth / frame.w`.
- Schema and reference rules for the parameters of the three checks (`lane:`, `anchor:`, zones, objects). `check --json` results of `capacity` carry `accepted` and `rejected`.
- `compare` labels and cells for the three checks, `compare --state NAME` (every column in the state of the base scene, the header names it), and the `state` field of the JSON output.
- Core: `src/core/states.ts`, `src/core/checks/{reachable,walkGrid,capacity,minScreenSize,points,inState}.ts`, `src/core/polygon.ts` (the polygon tests that `inside` used, now shared).
- Tests that load `tests/fixtures/gameplay/walk.scene.json` and every case of `tests/fixtures/states/cases.json` (check results per state, generation boxes, the block image, the `compare` case in all three formats), in the core, through the CLI with in-memory files and through `dist/isoblock.mjs`; unit tests for each check, the states, the schema and reference rules, `describe` and the editor's live check panel on `walk`.
- `docs/AGENT_GUIDE.md` covers states, `--state` and the three checks.

### Changed

- `--state` is no longer "added in stage 6"; it is accepted by `check`, `render`, `compare` and `export` and refused by other commands (`flag '--state' does not apply to '<command>'`).
- `reachable`, `capacity` and `min_screen_size` are no longer `skip` as "not implemented": a scene file that lists one without its parameters is now invalid (`E_SCHEMA`). `tests/fixtures/lane.scene.json` keeps `skip` for its `reachable` check because the scene has no walkable zone.
- The text summary of `check` names the state: `scene walk (state open): ...`. The JSON output is unchanged.
- The `describe` lines of the new checks: `FAIL k3 reachable bench2: path of 3.10 u (max 1.00)`, `FAIL s1 capacity seat: 4 usable < 6`, `FAIL m1 min_screen_size walker1: 126 px < 200 px`.
- The editor's live check panel runs the three checks again when any object changes (`min_screen_size`: its target), and a change of the zones counts as a change of everything.
- The frame-time tests of stage 2 measure up to 3 runs, each on a fresh page, and pass when one run meets the test's conditions (SPEC 17); every run prints its numbers.

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
