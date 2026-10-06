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

## Stage 3 · not open
Patches, log, `diff`, `compare` (SPEC sections 11.1, 12, 17). Before it opens, the maintainer specifies the patch syntax and the report and adds the sample patches and the `compare` fixture.

## Stage 4 · not open
Solver and minimal conflict set (SPEC sections 8, 17).

## Stage 5 · not open
Export targets `runtime`, `godot`, `gen-bbox`; Godot adapter; PNG render (SPEC sections 13, 14, 17).

## Stage 6 · not open
States, `sort_consistency`, `reachable`, `capacity` (SPEC sections 9, 13.4, 17).
