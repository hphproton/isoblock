# Roadmap

Acceptance criteria come from SPEC section 17. One stage is open at a time. The builder ticks tasks; the maintainer opens and closes stages.

## Stage 1 · done (0.1.0)

- [x] Project setup: TypeScript strict, ESM, vitest, esbuild, ajv
- [x] JSON Schema `schema/isoblock-1.json` and `validate` (schema + references, SPEC section 6); every fixture validates
- [x] Projection, inverse projection, camera direction; `tests/golden/projection.json` passes
- [x] Object geometry: footprint, 90° rotation, parts
- [x] `in_region`
- [x] `no_overlap`
- [x] `clearance`
- [x] `lane_clear` (unsupported lane shapes return `skip`)
- [x] `lane_reaches` (unsupported lane shapes and `top`/`bottom` edges return `skip`)
- [x] `visible` (with `occluders`)
- [x] Catalog checks not implemented in stage 1 return `skip`
- [x] Display list and SVG output; `render`
- [x] `describe` (SPEC Appendix B)
- [x] `check` with text and `--json` output; exit codes (SPEC section 11)
- [x] `dist/isoblock.mjs` builds and runs with `node`
- [x] `docs/AGENT_GUIDE.md` covers the 4 commands
- [x] Session log says `branch ready for review`

**Done when:** all tests pass; every `tests/fixtures/*.scene.json` matches its `*.expected.json` within tolerance; the SVG of `yard` opens and shows the expected layout.

## Stage 2 · done (0.2.0)

Editor (SPEC sections 10, 17). Fixture: `tests/fixtures/crowd.scene.json` (200 objects, 20 with locks, provisional values).

- [x] `npm run build` also writes `dist/editor.html`, one self-contained file; geometry, projection and checks come from `src/core`
- [x] Open a scene file and save it; no state outside the file; saving twice gives byte-identical files
- [x] Isometric view with the scene camera and a top-down plan view; Canvas 2D; redraw only on change
- [x] Drag on both views: screen to ground with grid snap, keeping h
- [x] Locks: a locked `pos` cannot be dragged, `pos.u` or `pos.v` blocks that axis only; locked objects show a lock icon
- [x] Property panel: numbers with units, a lock toggle per property, a provisional mark for values in `assumptions`
- [x] Live check panel: stage 1 checks re-run on change, only those involving changed objects; tapping a row highlights its objects
- [x] Overlays, each toggleable: frame regions, strips, lanes, zones, anchors
- [x] Undo and redo
- [x] Touch: one-finger drag, two-finger zoom, large hit targets
- [x] Frame-time test on `crowd` while dragging (SPEC section 17); the log reports the numbers
- [x] `docs/AGENT_GUIDE.md` covers opening and saving in the editor
- [x] Session log says `branch ready for review`

Not in stage 2: state switch (stage 6), exports (stage 5), saved versions and compare (stage 3), occlusion-ray and sort-point overlays (stage 6).

**Done when:** all tests pass, the stage 1 fixtures still match, and the stage 2 criteria in SPEC section 17 hold.

## Stage 3 · done (0.3.0)

Patches, log, `diff`, `compare` (SPEC sections 11, 11.1, 11.2, 12, 17). Fixtures: `tests/fixtures/patches/` (20 patches with expected results) and `tests/fixtures/compare/` (3 variants of `yard` with the expected JSON, text and Markdown output).

- [x] Patch files: JSON Patch (RFC 6902) and the short commands `move`, `rot`, `set`, `lock`, `relate`; comments and the description line; `solve` is a usage error naming stage 4
- [x] Application: atomic, coordinates of `move` and `rot` rounded to 6 decimals, assumption values follow their paths
- [x] Locks: touched-lock detection and labels; the order of outcomes; exit codes 0, 1, 2 and 3; `E_PATCH` and `E_LOCK`
- [x] `isoblock patch` with `-o`, `--dry-run` and `--json`; text and JSON report; a rejected or invalid patch writes nothing
- [x] Patch log `<output file without .json>.log.jsonl`
- [x] `isoblock diff` with text and `--json` output (SPEC 11.2)
- [x] `isoblock compare` with patch and scene variants and the `text`, `md` and `json` formats (SPEC 11.1, Appendix D); `--state` names stage 6, `--render` is not scheduled
- [x] Tests load every file in `tests/fixtures/patches/` and `tests/fixtures/compare/` and compare with the expected files
- [x] `docs/AGENT_GUIDE.md` covers the patch syntax, `patch`, `diff` and `compare`
- [x] Session log says `branch ready for review`

Not in stage 3: the solver and relation evaluation (stage 4), states (stage 6), layout indicators and `compare --render` (not scheduled), patches and variant switching in the editor.

**Done when:** all tests pass, earlier fixtures still match, and the stage 3 criteria in SPEC section 17 hold.

## Stage 4 · done (0.4.0)

Relations, solver and minimal conflict set (SPEC sections 7, 8, 11, 17). Fixtures: `tests/fixtures/relations/` (22 relations of every kind with expected results) and `tests/fixtures/solver/` (`feasible`, `only`, `conflict`, `perf`).

- [x] Relation measures of SPEC section 7 for every `rel` (`facing` is `skip`); status, violation, soft penalty
- [x] `isoblock relations` with text and `--json` output and its exit codes
- [x] Solver: movable objects, `pos.u` and `pos.v` locks, view and overlap constraints, 0.05 grid, objective order, determinism (SPEC section 8)
- [x] Minimal conflict set by deletion filtering in file order
- [x] `isoblock solve` with `--only`, `-o`, `--patch` and `--json`; the input file is never written; exit codes
- [x] A `solve` line in a patch is a usage error that points to `isoblock solve`
- [x] Performance test on `tests/fixtures/solver/perf.scene.json` (SPEC section 8); the log reports the numbers
- [x] Tests load `tests/fixtures/relations/` and `tests/fixtures/solver/` and check every expected field
- [x] `docs/AGENT_GUIDE.md` covers relations, `relations`, `solve` and the workflow `relate` → `solve --patch` → `patch`
- [x] Session log says `branch ready for review`

Not in stage 4: `facing`, relation rows in `compare`, a solve button in the editor, rotation by the solver.

**Done when:** all tests pass, earlier fixtures still match, and the stage 4 criteria in SPEC section 17 hold.

## Stage 5 · done (0.5.0)

Export for engines and image generation, and the Godot adapter (SPEC sections 11, 13, 14, 16, 17). The engine is Godot 4.7 with GDScript; trial E1 (pull request #8, not merged) showed that a builder session can run it. Fixtures: `tests/fixtures/export/` (case list `cases.json`, the new scene `garden.scene.json`, expected runtime files, generation boxes and block images).

- [x] Painter's order of parts exactly as SPEC section 13.4 (rounded camera direction and depth); `render` and the editor use it
- [x] `export --target runtime` (SPEC section 13.7): key order, rounding, saved format, `-o` or stdout
- [x] `export --target gen-bbox` with `--bbox-units` and `--bbox-order` (SPEC section 14)
- [x] Usage errors: missing `--target`, the targets `godot`, `phaser` and `tiled` (not scheduled), bbox flags with `runtime`
- [x] `render -o out.png` with `@resvg/resvg-wasm`, no fonts; `dist/isoblock.mjs` works alone
- [x] Godot adapter in `adapters/godot/` (SPEC section 13.8)
- [x] `npm run test:godot`: golden vectors and the cross-checks of SPEC section 13.6 on every case
- [x] Tests load `tests/fixtures/export/cases.json` and compare every expected file
- [x] `docs/AGENT_GUIDE.md` covers `export`, the block image and the Godot adapter (setup, loading, test)
- [x] Session log says `branch ready for review`

Not in stage 5: states and slices in the runtime file, `instantiate` by type and sorting of moving objects (stage 6); generated engine scenes (`.tscn`), per-object masks, groups in `gen-bbox`, export from the editor (not scheduled).

**Done when:** all tests pass, `npm run test:godot` passes, earlier fixtures still match, and the stage 5 criteria in SPEC section 17 hold.

## Stage 6 · done (0.6.0)

States and the gameplay checks (SPEC sections 6, 9.2, 11, 11.1, 17). No engine work: the runtime file and the Godot adapter do not change in this stage. Fixtures: `tests/fixtures/gameplay/walk.scene.json` with `walk.expected.json`, and `tests/fixtures/states/` (case list `cases.json`, check results per state, generation boxes, one block image, one `compare` case).

- [x] `states.<name>` accepts only `hide` (plus `x-` keys) in the schema
- [x] `--state NAME` for `check`, `render` (SVG and PNG), `compare` and `export --target gen-bbox` (SPEC sections 9.2, 11, 11.1)
- [x] Usage errors: an unknown state name; `--state` with `export --target runtime`
- [x] `reachable`: grid, free cells, start and target cells, path length, `max`, its three messages (SPEC section 9.2)
- [x] `capacity`: candidates, bodies, `allow`, accepted and rejected labels
- [x] `min_screen_size` with `screenWidth`
- [x] Schema and reference rules for the parameters of the three checks (`lane:`, `anchor:`, zones)
- [x] `compare` labels and cells for the three checks
- [x] Tests load `tests/fixtures/gameplay/` and `tests/fixtures/states/cases.json` and compare every expected file
- [x] The frame-time tests of stage 2 measure up to 3 runs and pass when one run meets the criterion (SPEC section 17)
- [x] `docs/AGENT_GUIDE.md` covers states, `--state` and the three checks
- [x] Session log says `branch ready for review`

Not in stage 6: states in the runtime file and the Godot adapter, `sort_consistency`, slicing, `instantiate` by type (stage 7); a state switch in the editor, `state_stable`, states that move objects (not scheduled).

**Done when:** all tests pass, earlier fixtures still match, and the stage 6 criteria in SPEC section 17 hold.

## Stage 7 · done (0.7.0)

Sprites, slices and sort keys, `sort_consistency`, and the runtime file `isoblock-runtime/2` with sprites and states (SPEC sections 4, 9.3, 11.1, 13.4, 13.7, 13.8, 17, 18). Core and CLI; the Godot adapter only switches to the new runtime file. Fixtures: `tests/golden/sort.json`, `tests/fixtures/sort/` (scene `court.scene.json`, check results by state, one `compare` case) and `tests/fixtures/runtime/` (a runtime file 2 for every export case, `walk` and `court`).

- [x] Sort keys, slices, pieces and the sprite list exactly as SPEC section 13.4; `tests/golden/sort.json` passes
- [x] `sort_consistency` (SPEC section 9.3): actor positions, actor and static mismatches, wrong areas from outlines, `maxPixels`, `area` and blocked zones, `ids`, `worst`, `positions`, both `skip` rules, states
- [x] Schema and reference rules for its parameters
- [x] `compare` label and cells for `sort_consistency`
- [x] `export --target runtime` writes `isoblock-runtime/2` with `sprites` and `states` (SPEC section 13.7)
- [x] Godot adapter reads `isoblock-runtime/2` (SPEC section 13.8); `npm run test:godot` passes on every export case
- [x] Tests load `tests/golden/sort.json`, `tests/fixtures/sort/cases.json` and `tests/fixtures/runtime/cases.json` and compare every expected file
- [x] Tests no longer read the `runtime` entries of `tests/fixtures/export/cases.json` (the release removes them); tests that used `sort_consistency` as an example of a check not implemented use `state_stable`
- [x] `CHANGELOG.md` lists the runtime file change with upgrade steps from `isoblock-runtime/1`
- [x] `docs/AGENT_GUIDE.md` covers sprites and slices, `sort_consistency` and how to read its result, and the runtime file 2
- [x] Session log says `branch ready for review`

Not in stage 7: drawing sprites and actors, states and `instantiate` in the Godot adapter (stage 8); sort-point overlay and state switch in the editor, `state_stable`, automatic front and back splits (not scheduled).

**Done when:** all tests pass, `npm run test:godot` passes, earlier fixtures still match (except the stage 5 runtime files), and the stage 7 criteria in SPEC section 17 hold.

## Stage 8 · done (0.8.0)

The Godot adapter draws sprites and actors by the engine rule, applies states and instantiates types with pivots and clipped slices; the cross-checks cover states and actors; the editor re-runs grid checks when a drag ends (SPEC sections 10, 13.3, 13.6, 13.8, 17). Fixture: `tests/fixtures/godot/cases.json` (five cases on `walk`, `yard`, `garden` and `court`: states in sequence, actor paths checked by the maintainer, one case with instanced types).

- [x] `build` builds `Objects` (anchors), `Sprites` in the draw order of the engine rule (child order, no `z_index`, no y-sort), `Zones` and `Lanes` (SPEC section 13.8)
- [x] Instancing: `scenes` map, pivot at the projected footprint center, one clipped instance per slice (hull mask with `clip_children`), metadata, `unmapped`
- [x] `apply_state` with `""` for the default and `E_STATE`
- [x] Actors: `add_actor`, `move_actor`, `remove_actor`, keys by `sort_key`, the tie rules, the game's node or a debug box, `E_ACTOR`
- [x] `E_Z_RANGE` removed; adapter within 400 lines without its tests
- [x] Adapter tests: the keys of `tests/golden/sort.json`, the node tree, `unmapped`, state and actor errors, actor order on equal keys
- [x] SPEC section 13.6 measures each object alone with polygons clipped to the frame
- [x] `npm run test:godot` runs every case of `tests/fixtures/export/cases.json` and of `tests/fixtures/godot/cases.json` (states in order, instanced types with white art colored through `modulate`, actor paths within `actorLimit`)
- [x] Editor: `reachable` and `sort_consistency` re-run when a drag ends, their rows marked out of date during the drag; frame-time test on `walk` and `court` (stage 2 criterion); after the drop the check panel equals `check --json` on the saved file
- [x] `CHANGELOG.md` lists the adapter's new tree and API with upgrade steps from 0.7.0
- [x] `docs/AGENT_GUIDE.md` covers the adapter's sprites, states, actors and instancing, and the editor's grid checks
- [x] Session log says `branch ready for review`

Not in stage 8: generated engine scenes, Phaser and Tiled adapters, a `@tool` script that shows the layout in Godot's editor, art outside the parts' boxes of a sliced object, sort-point overlay and state switch in the editor (not scheduled).

**Done when:** all tests pass, `npm run test:godot` passes, earlier fixtures still match, and the stage 8 criteria in SPEC section 17 hold.

## After stage 8

No further stage is scheduled. Candidates are the items SPEC section 17 lists as not scheduled and the open questions of SPEC section 19; the owner decides what comes next, and the maintainer specifies it as a new stage.
