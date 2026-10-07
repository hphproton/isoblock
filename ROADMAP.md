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

## Stage 5 · open

Export for engines and image generation, and the Godot adapter (SPEC sections 11, 13, 14, 16, 17). The engine is Godot 4.7 with GDScript; trial E1 (pull request #8, not merged) showed that a builder session can run it. Fixtures: `tests/fixtures/export/` (case list `cases.json`, the new scene `garden.scene.json`, expected runtime files, generation boxes and block images).

- [ ] Painter's order of parts exactly as SPEC section 13.4 (rounded camera direction and depth); `render` and the editor use it
- [ ] `export --target runtime` (SPEC section 13.7): key order, rounding, saved format, `-o` or stdout
- [ ] `export --target gen-bbox` with `--bbox-units` and `--bbox-order` (SPEC section 14)
- [ ] Usage errors: missing `--target`, the targets `godot`, `phaser` and `tiled` (not scheduled), bbox flags with `runtime`
- [ ] `render -o out.png` with `@resvg/resvg-wasm`, no fonts; `dist/isoblock.mjs` works alone
- [ ] Godot adapter in `adapters/godot/` (SPEC section 13.8)
- [ ] `npm run test:godot`: golden vectors and the cross-checks of SPEC section 13.6 on every case
- [ ] Tests load `tests/fixtures/export/cases.json` and compare every expected file
- [ ] `docs/AGENT_GUIDE.md` covers `export`, the block image and the Godot adapter (setup, loading, test)
- [ ] Session log says `branch ready for review`

Not in stage 5: states and slices in the runtime file, `instantiate` by type and sorting of moving objects (stage 6); generated engine scenes (`.tscn`), per-object masks, groups in `gen-bbox`, export from the editor (not scheduled).

**Done when:** all tests pass, `npm run test:godot` passes, earlier fixtures still match, and the stage 5 criteria in SPEC section 17 hold.

## Stage 6 · not open
States, `sort_consistency`, `reachable`, `capacity` (SPEC sections 9, 13.4, 17).
