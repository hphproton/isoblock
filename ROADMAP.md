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

## Stage 9 · done (0.9.0)

Fixes and measures (SPEC sections 8, 9.4, 11.1, 14, 17, 20). From this stage a builder session may run in any coding agent; `AGENTS.md` says what the environment needs, and `npm run check:publish` checks what the branch would publish. Fixtures: `tests/fixtures/measures/` (scene `measures`, its results in the default state and in state `no_tower`), `tests/fixtures/export/openstrip.scene.json`, and the block images of this release in `tests/fixtures/export/` and `tests/fixtures/states/`.

- [x] SVG and block image: a polygon with an opacity below 1 carries it as `fill-opacity` and `stroke-opacity`, never as `opacity` (SPEC 14); `render -o out.png` writes the block image of `openstrip`, which release 0.8.0 could not (exit 70)
- [x] `in_region` with `measure` and `maxOutside`, and the result field `outside` (SPEC 9.4); `maxOutside` without `measure: "drawn"` is a schema error
- [x] `min_screen_size` with `measure: "height"` (SPEC 9.4)
- [x] `lane_apart` (SPEC 9.4) in the schema and in `check`; its result field `overlap`
- [x] `compare`: the labels and cells of SPEC 11.1 for the new measures and `lane_apart`
- [x] The editor's check panel shows the new measures and `lane_apart` like the other checks, and equals `check --json` on the saved file
- [x] States: the new measures under `--state` (SPEC 9.4)
- [x] `docs/AGENT_GUIDE.md`: the new parameters and check; what `conflict` means and what to do about it (SPEC 8)
- [x] `CHANGELOG.md`: the block images differ from release 0.8.0 along the strokes of semi-transparent polygons
- [x] Session log says `branch ready for review`

Not in stage 9: heights for zones and lanes, a camera elevation parameter, states that hide a part of an object or a frame region, `x-` keys in the runtime file, better start positions for the solver (SPEC sections 17 and 18).

**Done when:** every case of `tests/fixtures/measures/cases.json` meets its expected results; the branch is named `builder/stage-9`, and its session log names the tool and model, gives the test counts with skipped tests and ends with the pull request's title and description; every case of `tests/fixtures/export/cases.json` and of `tests/fixtures/states/cases.json` meets its expected files, the PNG of `openstrip` included; `npm run check:publish` reports nothing; all tests pass, with no test skipped where Chromium is available; earlier fixtures still match, except the block images that this stage replaces.

## Stage 10 · done (0.10.0)

Agent protocol, round 2, and distribution (SPEC sections 6, 9.1, 11, 11.1, 12, 16, 17, 20, Appendices B and D). Core and CLI; no engine work, no scene format change, no new dependency. Fixtures: `tests/fixtures/edges/` (the scene `edges.scene.json` with `lane_reaches` on all four edges), `tests/fixtures/objects/` (the scene `shelf.scene.json` and the patches 21 to 30 for `add` and `remove`), `tests/fixtures/compare/yard.D.patch` with `yard.relations.expected.{json,txt,md}`, and `tests/fixtures/invalid/` (15 broken scenes with `cases.json`).

- [x] `isoblock --version` prints `isoblock <version>` from `package.json` at build time (SPEC section 11)
- [x] `validate --json`: `{ ok, scene, error }` on stdout for every outcome, unreadable files included; exit codes unchanged
- [x] `check --only a,b`: selected checks only, in `checks` order; summary, results and exit code follow the selection; empty or unknown id is `E_USAGE`
- [x] `describe --relations` and `--states` (SPEC Appendix B); `describe` of `yard` with both flags equals the appendix
- [x] `patch scene.json -` reads the patch from standard input; the log names it `-`
- [x] Short commands `add` and `remove` (SPEC section 12): `add` appends an object with `rot`; `remove` drops the object, its relations, its `hide` entries and its assumptions, refuses index shifts, and leaves checks alone
- [x] Suggestions: ` (did you mean "<name>"?)` on unknown names within Levenshtein distance 2, with the pools and tie rule of SPEC section 6; also in the `E_PATCH` message for an unknown object
- [x] Schema details: no `oneOf` or discriminator line when another detail reports a problem at or below its path
- [x] `compare --relations`: rows `hard relations violated` and `soft penalty`, keys `hardViolated` and `softPenalty` (SPEC section 11.1, Appendix D); output without the flag is unchanged
- [x] `lane_reaches` evaluates `top` and `bottom` (SPEC section 9.1): edge lines, thresholds, values, `describe` line with `x≈`, `compare` label `(x px)`
- [x] `npm run build` writes `dist/THIRD_PARTY_NOTICES.md` and the header line in each built file (SPEC section 16); a test compares the bundled packages with the notices table
- [x] `.github/workflows/ci.yml`: the test suite on Node 20 and 22 with Chromium from `playwright-core`, no skipped tests; the Godot cross-checks with Godot 4.7.1 checked against `SHA512-SUMS.txt` under Xvfb (SPEC section 16)
- [x] Tests load `tests/fixtures/edges/`, `tests/fixtures/objects/`, `tests/fixtures/invalid/cases.json` and the relation compare fixture, and compare with the expected files
- [x] `CHANGELOG.md` lists the new flags and commands
- [x] `docs/AGENT_GUIDE.md` covers `--version`, `validate --json`, `check --only`, the `describe` flags, `add`, `remove`, patches from standard input and `compare --relations`
- [x] Session log says `branch ready for review`

Not in stage 10: `compare --render` and layout indicators, patches and variant switching in the editor, an `unlock` command, cascading removal of checks, `state_stable`, generated engine scenes (not scheduled). The Rust crate license texts in `THIRD_PARTY_NOTICES.md` are a maintainer task (`MAINTAINING.md`, Before distributing a build).

**Done when:** all tests pass, `npm run test:godot` passes, earlier fixtures still match, the workflow `ci` passes on the branch, `npm run check:publish` reports nothing, the branch is named `builder/stage-10`, its session log names the tool and model, gives the test counts with skipped tests and ends with the pull request's title and description, and the stage 10 criteria in SPEC section 17 hold.

## Stage 11 · done (0.11.0)

Editor, round 2 (SPEC sections 8, 10, 11, 12, 16, 17). Editor and CLI; no engine work, no scene format change, no new dependency. Fixtures: `tests/fixtures/hide/` (the patches 31 to 37, for `hide` and `show`) and `tests/fixtures/editor/` (`cases.json` with 16 editor cases and the expected file of each case that changes the scene).

- [x] Short commands `hide <state> <id>` and `show <state> <id>` (SPEC section 12), with the suggestion of SPEC section 6 for an unknown object or state
- [x] `check --failing` (SPEC section 11)
- [x] `solve --patch -` writes the patch to standard output and no report; with `--json` it is `E_USAGE` (SPEC section 8)
- [x] Editor, state switch: the `State` select; hidden objects neither drawn nor selectable; the check panel in that state (SPEC section 10)
- [x] Editor, Add and Duplicate: ids, positions and selection as SPEC section 10 says
- [x] Editor, Delete: as `remove`; refused for a locked object, an object a check names and an index shift, with a notice
- [x] Editor, nudge with the arrow keys by the snap step, Shift by 1 unit; locked axes stay
- [x] Editor, `Hidden in <state>` checkboxes in the property panel
- [x] Editor, the `Assumptions` section with `Settle`, `Confirm` and `Cancel`
- [x] Every edit is one history step; the saved file equals the file the equivalent patch writes
- [x] Tests load `tests/fixtures/editor/cases.json` and `tests/fixtures/hide/`, and compare with the expected files; the stage 2 and stage 8 frame-time tests still pass
- [x] `CHANGELOG.md` lists the new commands, flags and editor controls
- [x] `docs/AGENT_GUIDE.md` covers `hide`, `show`, `check --failing` and `solve --patch -`, and says that only a person settles an assumption
- [x] Session log says `branch ready for review`

Not in stage 11: a relation panel, relation overlays and a Solve button in the editor, sort-point and occlusion-ray overlays (planned for a later stage); creating, renaming or deleting states and moving objects per state; selecting several objects; patches and variant switching in the editor; `compare --render` and layout indicators, an `unlock` command, `state_stable`, generated engine scenes (not scheduled). The Rust crate license texts in `THIRD_PARTY_NOTICES.md` are a maintainer task (`MAINTAINING.md`, Before distributing a build).

**Done when:** all tests pass, `npm run test:godot` passes, earlier fixtures still match, the workflow `ci` passes on the branch, `npm run check:publish` reports nothing, the branch is named `builder/stage-11`, its session log names the tool and model, gives the test counts with skipped tests and ends with the pull request's title and description, and the stage 11 criteria in SPEC section 17 hold.

## Stage 12 · open

Heights and cameras (SPEC sections 5, 6, 7, 8, 9.5, 10, 11.1, 12, 13.3, 13.4, 13.7, 13.8, 14, 17, 18, Appendices B and C). Core, CLI, editor and the Godot adapter. The scene format grows without a break (`isoblock/1` stays); the runtime file becomes `isoblock-runtime/3`. No new dependency. Fixtures, all in new files so that the suite of release 0.11.0 still passes on this branch: `tests/golden/projection.json` (`views`, view-form cameras), `tests/golden/sort-levels.json` (keys with base heights and view-form cameras, weighted slices), `tests/fixtures/levels/` (the scene `levels.scene.json` with base heights, a flat object, zone and lane heights, a view-form camera, states that hide parts and a region and `x-` keys; `cases.json` with its check results and `gen-bbox` files in five states; `levels.describe.txt`; `godot.json`; `editor/` with 7 editor cases; `invalid/` with 6 broken scenes), `tests/fixtures/heights/` (the patches 38 to 46) and `tests/fixtures/runtime3/` (every runtime case as `isoblock-runtime/3`, and `levels`).

- [ ] View form of the camera: schema (the two forms do not mix; `elevation` in (0, 90], `scale` above 0), screen vectors, inverse, camera direction, unit length (SPEC section 5); the golden `views` pass
- [ ] Base heights: `pos` of three numbers, boxes, flat boxes; world parts and anchors raised by the base height (SPEC sections 6 and 9.5)
- [ ] Zone and lane heights, lane points of three numbers, flat lanes; ground layers by height in the display list (SPEC sections 6 and 14)
- [ ] Checks of SPEC section 9.5: `no_overlap` by boxes; `lane_clear` with `height`; `lane_reaches` at the heights of the end points; `reachable` with `level` and `height`; `sort_consistency` with `level`; `visible` on the target's box; `in_region` at the base height; `min_screen_size` with `|up.y|`; the solver's constraints by boxes and at base heights (SPEC section 8)
- [ ] States with `hideParts` and `hideRegions`: schema, references and name suggestions (SPEC section 6); `check`, `render`, `compare` and `export --target gen-bbox` under `--state` (SPEC section 9.5); `describe --states` (SPEC Appendix B)
- [ ] Short commands: `move` with `h±n`, `add` with `,<h>`, the lock `pos.h`; `remove` also drops the object's `hideParts` entries (SPEC section 12); `compare` counts base heights in `moved` (SPEC section 11.1)
- [ ] `describe`: the view-form camera label and scale, the column `pos(u,v,h)` (SPEC Appendix B)
- [ ] Sort keys with base heights and slices weighted by the camera (SPEC section 13.4); `tests/golden/sort.json` passes
- [ ] Runtime file `isoblock-runtime/3`: `projection`, the camera in its form, `base`, `hideParts`, `hideRegions` and the `x-` keys (SPEC section 13.7)
- [ ] Godot adapter: reads `/3`, projects with `projection`, draws zones and lanes at their heights, places pivots at base heights, hides parts and records hidden regions in `apply_state`, places actors at a height, `sort_key` with a base height (SPEC section 13.8)
- [ ] Editor: both camera forms, ground layers by height, objects at their base heights; a drag keeps the base height; the field `pos.h (<unit>)` with its lock; `Duplicate` keeps the base height; a state hides its parts and regions (SPEC section 10)
- [ ] Tests load `tests/golden/sort-levels.json`, the golden `views`, `tests/fixtures/levels/` (its cases, describe file, Godot, editor and invalid cases), `tests/fixtures/heights/` and `tests/fixtures/runtime3/`, and compare with the expected files; the tests of the `isoblock-runtime/2` files stop; the stage 2 and stage 8 frame-time tests still pass
- [ ] `CHANGELOG.md` lists the view form, heights, the new check parameters, states with parts and regions, the checks whose results change for flat objects (`no_overlap`, `lane_clear`, `reachable`, `sort_consistency`), and the upgrade from `isoblock-runtime/2` to `/3`
- [ ] `docs/AGENT_GUIDE.md` covers the view form, base heights and levels, the new check parameters, `hideParts` and `hideRegions`, and heights in `move`, `add` and `lock`
- [ ] Session log says `branch ready for review`

Not in stage 12: paths between levels in `reachable`, a relation that puts an object on another, parts that overhang the footprint above a clear height, slice lengths per type, short commands that hide parts and regions, visibility and coverage reports, generated road markings, pruning to a frame region (asked for, not scheduled: SPEC section 17); a relation panel, relation overlays, a Solve button and sort-point and occlusion-ray overlays in the editor (planned for a later stage); `compare --render`, an `unlock` command, `state_stable`, generated engine scenes (not scheduled). The Rust crate license texts in `THIRD_PARTY_NOTICES.md` are a maintainer task (`MAINTAINING.md`, Before distributing a build).

**Done when:** all tests pass, `npm run test:godot` passes, earlier fixtures still match except the runtime files of `tests/fixtures/runtime/`, which those of `tests/fixtures/runtime3/` replace, the workflow `ci` passes on the branch, `npm run check:publish` reports nothing, the branch is named `builder/stage-12`, its session log names the tool and model, gives the test counts with skipped tests and ends with the pull request's title and description, and the stage 12 criteria in SPEC section 17 hold.

## After stage 12

No further stage is open. Planned next: the editor explains relations and draw order (a relation panel and overlays, a Solve button, sort-point and occlusion-ray overlays); lanes of several points and diagonal lanes; per-object masks for image generation. Requests that are not scheduled are listed in SPEC section 17.
