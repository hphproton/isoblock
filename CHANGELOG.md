# Changelog

## Unreleased

Stage 15: lanes and levels. The scene format stays `isoblock/1` (`front` on types and anchors, `angle` on relations, `toLevel` on `reachable`). The runtime file stays `isoblock-runtime/3`.

### Changed

- A lane is a polyline. Each segment longer than zero is a piece, the segment widened by half the width and not past its ends, with a surface from one end height to the other. `lane_clear`, `lane_reaches`, `lane_apart`, `against`, `clear_of` and `occluders --lane` measure that shape. A lane of two points along u or v keeps the rectangle of earlier releases, so those results stay. What changes is the lanes those releases skipped: more than two points, a direction other than u or v, and a flat check on a lane that is not flat. The new results are in `lane` (`c6`), `edges` (`c10`), `measures` (`diag_shape`), `levels` (`steps_clear`), `relations` (`r17`) and the check changes of height patch 43, which now name `steps_clear`.
- `occluders --lane` takes any lane with a piece. On a lane that climbs, the actor stands at the surface, and `area.level` is `null`.
- The part form of `hide` and `show` finds the part as an anchor is found, so the parts of an id that contains `/` can be named next to an object that shares the prefix. A schema detail that only says a value must match the `then` or `else` of a condition is left out.

### Added

- `reachable` takes `toLevel`. The path may cross levels through the lanes that join them. Without `toLevel` the search stays on one level. `area` together with `toLevel` is a schema error.
- The relation `facing`, with `front` (`+u`, `-u`, `+v` or `-v`) on a type or an anchor and `angle` in degrees (default 45). `a` may be `anchor:<object id>/<anchor id>`. `relate` takes `angle`.
- `solve --rotate` may turn movable objects that are not locked, to 0, 90, 180 or 270. The report adds `turned`. The patch writes a `rot` line before that object's `move`. In the editor, **Turn objects** adds the flag, a turned object is drawn as a ghost, the Relations overlay draws `facing`, and **Occluders of** lists every lane with a piece.

## 0.14.0

Stage 14: the editor explains. The scene format stays `isoblock/1` (checks take `warn`); the runtime file stays `isoblock-runtime/3`.

### Added

- Checks that have one bound take `warn`, a margin on the passing side of that bound: `clearance`, `lane_apart`, `visible`, `reachable` (with `max`), `capacity`, `min_screen_size` and `visible_share`. A result that would pass is `warn` when its value lies in the margin. `fail` and `skip` are unchanged, and `warn: 0` never warns. `check` prints `WARN` lines; `check --failing` leaves them out, and the exit code still treats `warn` as `pass`. `describe` prints one `WARN` line per warning, with the value, the margin and the bound. `compare` shows a warning row and marks the cell with ` !`. In the editor the check row reads `WARN`.
- `hide` and `show` take a part (`hide <state> <id>/<part>`, `body` when the type has no parts) and a frame region (`hide <state> region:<id>`). `show` of the last part of an object drops that object's list. An unknown object, part, region or state suggests a near name.
- The editor hides parts per state from the property panel and frame regions from a Regions section, with the same commands. A Relations section lists `relations --json` live, and Solve shows the solver's proposal as ghosts with Apply (the patch of `solve --patch -`, one undo step) and Discard. Overlays draw relations, sort points, occlusion rays, masks and occluders. Masks and occluders wait until a drag ends. `window.isoblock.overlay(name)` returns the data each overlay draws, and `state().staleOverlays` names the pictures that are out of date during a drag.

## 0.13.0

Stage 13: masks and visibility. The scene format stays `isoblock/1`; the runtime file stays `isoblock-runtime/3`.

### Added

- `export --target masks` writes the object raster of a state into a folder: a 16-bit `labels.png`, full and visible mask PNGs per object and per tag, and `masks.json`. `--grow` adds a band of pixels around each mask for detail the block does not show. `--state` draws one state. The scene format stays `isoblock/1`. The runtime file stays `isoblock-runtime/3`.
- `visibility` reports, for a frame region or the whole frame, how much of each object shows and how much of the region the objects cover.
- `occluders` lists the objects that hide part of an actor somewhere in a flat lane or a zone, by the painter's order, with how many positions and the largest overlap.
- The check `visible_share`. Listed objects, by `ids` or by `tag`, must show at least `min` of their own pixels in a region. `compare` prints the row `visible_share <id> (% shown)` as a whole percent. In the editor the row waits until a drag ends, like `reachable` and `sort_consistency`.

## 0.12.0

Stage 12: heights and cameras. The scene format stays `isoblock/1`. The runtime file becomes `isoblock-runtime/3`.

### Changed

- `no_overlap` compares boxes, the footprint from the base height to the base height plus the type height. A flat object (height 0) overlaps nothing, and an object that rests on another does not overlap it. A flat object that shares ground with another object failed this check in 0.11.0 and passes now. No fixture of 0.11.0 has such a pair, so their results do not change.
- A flat object takes no space: it no longer blocks a lane (`lane_clear`), a walk (`reachable`) or an actor position (`sort_consistency`).
- `lane_clear` blocks an object only when it takes space at the lane's level. A lane that is not flat is `skip`. `reachable` walks one level. `sort_consistency` stands its actor at a level and overlaps boxes. Where the camera has `|cu|` different from `|cv|`, slices are weighted by the camera, so `sort_consistency` can change; with `|cu| = |cv|` the slices are those of 0.11.0.
- `in_region` with the footprint measure projects the footprint at the object's base height. At height 0 this is the value of 0.11.0.

### Added

- A camera may be a view: `elevation` (greater than 0 and at most 90), `direction` (default 45) and `scale` (greater than 0). The two forms do not mix. Both give the screen vectors `axisU`, `axisV` and `up`.
- `pos` may have a third number, the base height. Parts and anchors are raised by it. Zones have `h`. A lane has `h`, and a lane point may have a third number.
- `lane_clear` takes `height`. `reachable` takes `level` and `height`. `sort_consistency` takes `level`. `visible` samples the target's box. `min_screen_size` with `measure: "height"` uses the screen length of `up`.
- A state may list `hideParts` (object id to part ids) and `hideRegions` (frame region ids). A hidden part is not drawn and occludes nothing. A hidden region is not drawn, and `in_region` and `lane_reaches` that name it are `skip`. An object whose every part is hidden counts as hidden.
- `move` takes `h±n`. `add` takes `u,v,h`. `lock` takes `pos.h`. `rot` keeps the base height. `remove` also drops the object's `hideParts` entries. `compare` counts a change of base height as a move, and distances are taken in (u, v, h).
- `describe` prints a view-form camera as `e<elevation>/d<direction>` and, when any object has a base height, the column `pos(u,v,h)`. `describe --states` lists hidden parts and regions.
- The editor draws both camera forms, zones in ascending height, lanes at their heights and objects at their base heights. A drag keeps the base height. The property panel has `pos.h (<unit>)` and a lock for it. Duplicate keeps the base height. A state hides its parts and regions.
- Sort keys add twice the base height. Slices are weighted by `|cu|` and `|cv|`.

### Breaking: runtime file `isoblock-runtime/3`

`isoblock export --target runtime` now writes `isoblock-runtime/3`. It adds `projection` (the screen vectors, so an adapter needs no trigonometry), `base` on every object, the camera in its own form, `hideParts` and `hideRegions` in every state, and the scene's `x-` keys. Keys and slices equal those of `isoblock-runtime/2` for a scene without base heights whose camera has `|cu| = |cv|`.

1. Export every scene again: `isoblock export <scene> --target runtime -o <game>/data/scenes/<id>.json`. The `schema` value is `isoblock-runtime/3`.
2. In a loader of your own, accept `isoblock-runtime/3` and reject `isoblock-runtime/2` and `isoblock-runtime/1`. Project with `projection` and `camera.origin`. Read `base` when you place a pivot. Read `hideParts` and `hideRegions` when you apply a state.
3. The Godot adapter in `adapters/godot/` reads `isoblock-runtime/3` and reports every other `schema` value as `E_SCHEMA`. Copy the new `isoblock_runtime.gd` into the game project. `sort_key` takes a base height. `add_actor` takes `[u, v, h]`. `apply_state` hides parts and records hidden regions on the root as `hidden_regions`.

### Tests

- The runtime fixtures of `isoblock-runtime/2` (`tests/fixtures/runtime/`) are removed; `tests/fixtures/runtime3/` has every case as `isoblock-runtime/3`.
- The Godot cross-check of stage 12 runs on `tests/fixtures/levels/godot.scene.json`, a scene without overlapping objects and without a static mismatch, as SPEC 13.6 requires (Q-027).

## 0.11.0

### Added

- Short commands `hide <state> <id>` and `show <state> <id>`. `hide` appends the object to that state's `hide` list and creates the state when it is missing. `show` removes it and leaves the state in place, also when the list is empty. An unknown object, and an unknown state of `show`, gains a suggestion within two edits. The object is checked before the state.
- `check --failing` prints only results whose status is `fail` or `skip`. The summary line and the exit code still cover every check that ran, including with `--only`.
- `solve --patch -` writes the patch to standard output and prints no report, so it can be piped into `patch`. `--json` together with `--patch -` is `E_USAGE`.
- Editor: a State select, Add, Duplicate, Delete, nudging with the arrow keys, a Hidden in \<state\> checkbox per state, and an Assumptions section with Settle, Confirm and Cancel. Each edit is one undo step and changes the scene as the matching short command would. A command that would not apply is refused, with the reason on the status line. Switching state is not an edit. Only a person settles an assumption; no patch command removes one.

## 0.10.0

Stage 10: an agent can ask for the version, a JSON validation report, a subset of checks, relation and state lines in `describe`, patches from standard input, and relation rows in `compare`. Patches can add and remove objects. `lane_reaches` evaluates the top and bottom edges. The build carries the third-party notices, and a workflow runs the tests.

### Added

- `isoblock --version` prints `isoblock <version>`, the `version` of `package.json` at build time, and exits 0.
- `validate --json` prints `{ "ok", "scene", "error" }` on stdout for every outcome, including a file that cannot be read, and prints nothing on stderr. The exit code is unchanged.
- `check --only a,b` runs only those checks, in `checks` order. The summary, the JSON results and the exit code follow the selection. An empty or unknown id is `E_USAGE`.
- `describe --relations` and `describe --states` add the relation lines and the state line of Appendix B. Each flag adds only its own lines.
- `patch <scene> -` reads the patch from standard input. The log names it `-`.
- Short commands `add <id> <type> <u>,<v> [<rot>]` and `remove <id>`. `add` appends an object. `remove` drops the object, the relations that name it, its `hide` entries and its assumptions. It refuses to shift a later object index in an assumption or a pointer lock, and it leaves checks alone.
- Unknown names within two edits gain ` (did you mean "<name>"?)`, including an unknown object in a short command. A schema detail that only says a value must match one of several schemas is omitted when another detail reports a problem at or below its path.
- `compare --relations` adds the rows `hard relations violated` and `soft penalty`, and the JSON keys `hardViolated` and `softPenalty`. Without the flag the output is unchanged.
- `lane_reaches` evaluates `top` and `bottom`. The value is the largest x of the meeting segment, and the compare label is `lane_reaches <lane> (x px)`.
- `npm run build` copies `THIRD_PARTY_NOTICES.md` to `dist/` and writes a header line into `dist/isoblock.mjs` and `dist/editor.html`.
- `.github/workflows/ci.yml` runs the test suite on Node 20 and 22, with Chromium from `playwright-core`, and the Godot cross-checks with Godot 4.7.1 under Xvfb. The jobs use Ubuntu 24.04, because that Playwright release cannot install Chromium on the current `ubuntu-latest` image.

## 0.9.0

Stage 9: a polygon with an opacity below 1 is drawn with `fill-opacity` and `stroke-opacity`, and checks can measure a drawn box, the vertical extent of an object, and the gap between a lane and a lane or a zone.

### Changed

- Block images differ from release 0.8.0 along the strokes of semi-transparent polygons. The SVG and the block image carry an opacity below 1 as `fill-opacity` and `stroke-opacity`, never as the group attribute `opacity` (SPEC 14). Where such a stroke covers its own fill, the two now blend. `render -o out.png` writes the block image of `openstrip`, which release 0.8.0 stopped on with `E_INTERNAL` (exit 70). A scene whose polygons are fully opaque is unchanged.

### Added

- `in_region` accepts `measure` (`"footprint"`, the default, or `"drawn"`) and `maxOutside` (0 to 1, default 0). `"drawn"` measures the screen box of every part and fails an object whose share outside the region is over `maxOutside`; the strip rule is unchanged. The result field `outside` lists those shares, rounded to 6 decimals (`[]` when nothing fails). `threshold` stays 0. `maxOutside` without `measure: "drawn"` is a schema error. The footprint measure has no `outside` field.
- `min_screen_size` accepts `measure` (`"bounds"`, the default, or `"height"`). `"height"` is the vertical extent of the parts on screen, `(highest − lowest) × pxPerUnit × verticalScale × screenWidth / frame.w`, without the footprint's depth.
- Check `lane_apart`: `lane`, `target` (`lane:<id>` or `zone:<id>`) and optional `min` (default 0). It passes when the shapes do not overlap and the distance is at least `min`. `value` is the distance, `ids` is `[lane, target id]`, and `overlap` is the shared area, both rounded to 6 decimals. Another lane shape, or a zone with fewer than 3 points, is `skip` and has no `overlap`. Two shapes that only touch pass with `min` 0. A state does not change the result.
- Under `--state`, `in_region` with `"drawn"` and `min_screen_size` with `"height"` follow the other measures: hidden objects leave the lists, and a hidden target is `skip`.
- `compare` labels `in_region <region>[/<strip>] drawn (objects outside)`, `min_screen_size <target> height (px)` and `lane_apart <lane>×<target id> (<unit>)`. `lane_apart` cells use 2 decimals.
- The editor's check panel shows these measures like the other checks, and equals `check --json` on the saved file.
- `docs/AGENT_GUIDE.md` covers the new parameters and `lane_apart`, and what a solver `conflict` means. `conflict` means the search found no layout, not that none exists. Objects that start inside a lane or on top of each other can make the search miss a layout that meets every hard relation, and the conflict set then names more relations than needed. Place the objects roughly, or solve fewer of them with `--only`, and solve again. Do not apply the proposal of a `conflict`.

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
