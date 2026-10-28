# Agent guide

How an AI agent uses IsoBlock. The builder fills each section as commands ship.

This guide describes the tool built from this repository: the commands `validate`, `check`, `render`, `describe`, `relations`, `solve`, `patch`, `diff`, `compare`, `export`, `visibility` and `occluders`, the editor page `dist/editor.html`, and the Godot adapter in `adapters/godot/`. What is not scheduled is listed under [Not available yet](#not-available-yet).

## Install and build

Requires Node 20 or newer.

```
npm ci
npm run build
node dist/isoblock.mjs --help
```

`npm run build` writes three files: `dist/isoblock.mjs`, the command line tool, which has no runtime dependencies beyond Node (the PNG renderer is inside it); `dist/editor.html`, the editor, one self-contained page (see the Editor section); and `dist/THIRD_PARTY_NOTICES.md`, copied unchanged from the repository. The notices travel with the two built files. The second line of `dist/isoblock.mjs` and the line after the doctype of `dist/editor.html` name that file. The examples below call the tool as `isoblock`; run it as `node dist/isoblock.mjs`.

`isoblock --version` prints `isoblock <version>`, the `version` of `package.json` at the time of the build, and exits 0. It is the only argument that works without a command.

Other scripts: `npm test` runs the test suite, `npm run typecheck` runs the TypeScript checker, `npm run test:godot` runs the Godot adapter checks (see [Godot adapter](#godot-adapter); it needs Godot and Xvfb, which are not npm packages).

## Commands

Every command takes a scene file (`*.scene.json`, format `isoblock/1`) and reads it first with the schema and reference checks. If the file is not valid, the command stops with exit code 2 and an error message.

```
isoblock --version
isoblock validate <scene.json> [--json]
isoblock check    <scene.json> [--json] [--state NAME] [--only a,b] [--failing]
isoblock render   <scene.json> [--state NAME] -o <out.svg|out.png>
isoblock describe <scene.json> [--relations] [--states]
isoblock relations <scene.json> [--json]
isoblock solve    <scene.json> [--only a,b] [--rotate] [-o <proposal.json>] [--patch <moves.patch|->] [--json]
isoblock patch    <scene.json> <patch|-> [-o <out.json>] [--dry-run] [--json]
isoblock diff     <a.json> <b.json> [--json]
isoblock compare  <scene.json> --variant NAME=FILE... [--state NAME] [--format text|md|json] [--relations]
isoblock export   <scene.json> --target runtime|gen-bbox|masks [-o <out.json|dir>] [--bbox-units px|norm1000] [--bbox-order xyxy|yxyx] [--state NAME] [--grow N]
isoblock visibility <scene.json> [--region ID] [--state NAME] [--json]
isoblock occluders  <scene.json> --actor w,d,h (--lane ID | --zone ID) [--step S] [--state NAME] [--json]
```

### `validate`

Checks the file against `schema/isoblock-1.json`, then checks references: duplicate ids, object types that do not exist, relation targets, check parameters that name a missing region, strip, zone, lane, object or anchor (`lane:<id>`, `anchor:<object id>/<anchor id>`), states that hide a missing object, part or region, and assumption paths that do not resolve in the file. A state may only have `hide`, `hideParts`, `hideRegions` and `x-` keys. A `visible_share` check needs exactly one of `ids` and `tag`, and `min` from 0 to 1; a tag that no object has is valid and the check is `skip`.

```
$ isoblock validate yard.scene.json
ok: yard.scene.json is a valid isoblock/1 scene (id yard)
```

`--json` prints `{ "ok", "scene", "error" }` on stdout for every outcome, including a file that cannot be read, and prints nothing on stderr. `ok` is `true` or `false`. `scene` is the top-level `id` when that value is a string, otherwise `null`. `error` is `null`, or `{ "code", "message", "details" }` where `details` is the same lines the text report indents. The exit code is unchanged: 0 when the file is valid, 2 otherwise.

```
$ isoblock validate --json yard.scene.json
{
  "ok": true,
  "scene": "yard",
  "error": null
}
```

A detail that names an unknown check, relation, property, type, object, region, strip, zone, lane, state or relation target ends with ` (did you mean "<name>"?)` when a known name is within two edits (an insertion, a deletion or a substitution). The nearest name is used; when two are equally near, the first in the list for that kind is used. For `a` of `facing` the list continues with `anchor:<object id>/<anchor id>`. A detail that only says a value must match one of several schemas, or the `then` or `else` of a condition, is left out when another detail already points at that value or at something inside it.

On failure without `--json`, nothing else runs. The message starts with a code, then one line per problem:

```
error E_SCHEMA: scene does not match schema isoblock/1 (2 problems)
  /checks/0: must NOT have additional properties: "oops"
  /schema: must be "isoblock/1"
```

| Code | Meaning |
|---|---|
| `E_IO` | The file cannot be read or written |
| `E_JSON_PARSE` | The file is not valid JSON |
| `E_SCHEMA` | The file does not match the schema |
| `E_REF` | A reference does not resolve (duplicate id, unknown type, missing target) |
| `E_PATCH` | A patch is malformed or one of its commands fails (unknown object, pointer that does not resolve, failing JSON Patch `test`) |
| `E_LOCK` | A patch touches a lock (exit code 3) |
| `E_USAGE` | Unknown or unavailable command or flag, or a bad argument |
| `E_INTERNAL` | Unexpected failure inside the tool |

### `check`

Runs every check in the scene's `checks` list, in file order. `--only a,b` runs only the checks with those ids, still in `checks` order; the summary, the `--json` results and the exit code cover that selection. An empty entry or an id the scene does not have is `E_USAGE` (exit 2) and prints no results.

```
$ isoblock check lane.scene.json
scene lane: 7 checks, 3 pass, 3 fail, 0 warn, 1 skip
FAIL c1 lane_clear: lane L1 blocked by d
PASS c2 lane_clear: lane L1 is clear
PASS c3 lane_reaches: lane L1 meets right edge at y=765.58 (view y 150-1000)
FAIL c4 lane_reaches: lane L2 meets right edge at y=1365.58 (view y 150-1000)
FAIL c5 lane_reaches: lane does not reach edge
PASS c6 lane_clear: lane L4 is clear
SKIP c7 reachable: the scene has no zone with kind "walkable"
```

`--json` prints `{ "scene": "<id>", "results": [...] }` instead. Each result has `id`, `check`, `status` (`pass`, `fail`, `warn` or `skip`), `value`, `threshold`, `ids` and `message`; `no_overlap` adds `pairs`, `visible` adds `occluders`, `capacity` adds `accepted` and `rejected`; `sort_consistency` adds `worst` and `positions`; `visible_share` adds `shares` (omitted when the check is `skip`). Keys are always in this order. `message` is one line meant for people; read `status`, `value` and `ids` instead of parsing it.

`--state NAME` checks the scene as it is in one of its states, with the objects that state hides taken out (see [States](#states)). The summary line then reads `scene walk (state open): ...`; `--json` keeps the same shape. An unknown state name exits 2 (`E_USAGE`) and lists the states the scene has.

`--failing` prints only the results whose status is `fail` or `skip`, in `checks` order: the check lines of the text output, and the `results` of `--json`. The summary line and the exit code still cover every check that ran. With `--only`, both the selection and `--failing` apply.

```
$ isoblock check walk.scene.json --state open
scene walk (state open): 17 checks, 13 pass, 4 fail, 0 warn, 0 skip
PASS k1 reachable: path of 3.80 u
PASS k2 reachable: path of 13.10 u
FAIL k3 reachable: path of 3.10 u (max 1.00)
...
```

Exit codes of `check`:

| Code | Meaning |
|---|---|
| 0 | Every check is `pass` or `warn` |
| 1 | At least one check is `fail` or `skip`. A check the tool could not evaluate is not a pass |
| 2 | Invalid input or usage |
| 70 | Internal error |

### `render`

Writes the scene as an SVG image: frame, strips, zones, lanes, objects from back to front (boxes per part, three faces each), region outlines, then labels. The tool always exits 0 when it wrote the file, even if checks fail.

```
$ isoblock render yard.scene.json -o yard.svg
wrote yard.svg
```

Agents do not need the image to work with a scene; use `describe`. Open the SVG only when a person asks to see it. Elements carry `data-layer` and `data-ref` attributes (the object, lane or region id) so a viewer can find them.

`-o` is required and must end in `.svg` or `.png`. `--state NAME` draws the scene in that state: the objects it hides are not drawn (SVG and PNG).

#### Block image (PNG)

`-o out.png` writes the same drawing as a PNG, at 1 pixel per frame unit (the image has the size of the frame), for people and tools that need a picture of the layout (the blocks of a scene to hand to an image generator, or a check by eye).

```
$ isoblock render yard.scene.json -o yard.png
wrote yard.png
```

- The SVG is rasterized by `@resvg/resvg-wasm`, which is inside `dist/isoblock.mjs`: copy that one file anywhere and `node isoblock.mjs render scene.json -o out.png` works, with no other file and no network.
- Text is left out (labels are not drawn) and no fonts are loaded, so the image is the same on every machine. Run the command twice and the files are byte-identical.
- The SVG (`-o out.svg`) keeps its labels.
- A polygon with an opacity below 1 carries it as `fill-opacity` and `stroke-opacity`, both with that value, never as the group attribute `opacity`. With `opacity`, the rasterizer stops (`E_INTERNAL`, exit 70) on a shape that reaches far outside the frame, such as a strip with an open bound under a semi-transparent region. Where such a stroke covers its own fill, the two blend, so a block image from release 0.8.0 differs along those strokes.

### `describe`

Prints a compact summary, about 30 to 60 lines, so an agent never has to read the whole file or an image. Exit code 0 even when checks fail. See the next section.

`--relations` adds one line per violated or skipped relation and a summary line, after the check lines and before the assumptions. `--states` adds one line in that same place, after the relation lines when both flags are given. Each flag adds only its own lines. On `yard`, both flags together add:

```
BAD r1 in_front_of bench×tree: violation 0.7172
relations: 2 · 1 violated · 0 skipped · hard 1 of 1 satisfied · soft penalty 0.7172
states: closed hides bench
```

### `relations`, `solve`, `patch`, `diff`, `compare`

Described in their own sections below: [Relations](#relations), [`solve`](#solve), [Patches](#patches), [`diff`](#diff) and [`compare`](#compare). The section [Workflow: relate, solve, patch](#workflow-relate-solve-patch) shows how they work together.

### `export`

Described in [Export](#export) below.

### `visibility` and `occluders`

Described in [Masks and visibility](#masks-and-visibility).

### Not available yet

`--state` belongs to `check`, `render`, `compare`, `export --target gen-bbox`, `export --target masks`, `visibility` and `occluders`. On any other command it is a usage error (`flag '--state' does not apply to '<command>'`), and so it is with `export --target runtime`: the runtime file carries all states.

Export targets `godot`, `phaser` and `tiled` are not scheduled (the Godot adapter reads the `runtime` file instead). `compare --render` is not scheduled either. The check `state_stable` is not implemented: it returns `skip`.

## Editor

`dist/editor.html` is a page for people (and for agents that drive a browser). Build it with `npm run build`, then open the file in a browser: double-click it or use a `file://` address. It is one file, needs no server and makes no network request. It uses the same code as the command line tool for geometry, projection and checks, so its check results equal `isoblock check`.

### Opening and saving

- **Open**, or drop a scene file on the page, reads the file and validates it like `isoblock validate`. A file that is not valid is not opened; the status line starts with the error code (`E_JSON_PARSE`, `E_SCHEMA` or `E_REF`) and the scene that was open stays open.
- The scene file is the only state. There is no autosave and nothing is kept in the browser: the overlays, the snap step and the view mode are forgotten when the page closes.
- **Save** downloads the scene under the name of the file that was opened (or `<id>.scene.json`). The same scene always gives the same bytes: two-space indentation, keys in the order of the opened file, one final newline. Saving twice gives byte-identical files, and the saved file parses to the same data as the file that was opened. Numbers are written the JSON way, so `2.0` becomes `2`.
- `(unsaved)` next to the file name marks changes since the file was opened or saved. Closing the page then asks for confirmation.
- Keys: Ctrl or Cmd with `S` saves, with `Z` undoes, with `Shift+Z` or `Y` redoes. `Esc` clears the selection and the check highlight. Arrow keys nudge the selection (see below). Delete and Backspace remove it, while a text field or select is not focused.

### Views

- **Isometric** draws the scene with its own camera, either the axes form (`angleU`, `angleV`, `pxPerUnit`) or the view form (`elevation`, `direction`, `scale`). **Plan** is top-down: u to the right, v downwards, 40 px per unit; it shows the same objects from above and the frame regions as the ground areas they cover. Zones are drawn in ascending height under the objects, and lanes at the height of their points. **Iso**, **Plan** and **Both** in the toolbar choose what is shown; a narrow window starts with Iso only.
- Drag an empty place to pan, use the wheel or two fingers to zoom, and **Fit** to show everything again. A view repaints only when something changed.

### Moving objects

- Drag an object in either view. The pointer is converted to the ground at the object's base height, which the drag keeps, and `pos` snaps to the grid chosen in **Snap** (off, 0.05, 0.1, 0.25, 0.5 or 1). Only u and v change. One drag is one undo step.
- A locked `pos` cannot be dragged: the object does not move and the status line names the lock. `pos.u` or `pos.v` blocks that axis only; the object still moves along the other one. `pos.h` does not block a drag. Every object with a lock shows a lock icon (dark: `pos` locked; orange with `u` or `v`: one axis; grey: another lock).
- Dragging while a second finger comes down cancels the drag.

### Property panel

Select an object (tap or click it) to see its properties, each with its unit:

- `type`, `pos` (u, v and h), `rot`, and the size `w`, `d`, `h` of its type. Type the new number and leave the field, or press Enter. A size belongs to the type, so it changes every object of that type.
- `pos.h (<unit>)` is the object's base height. It shows 0 when `pos` has two numbers. Changing it is `move <id> h±<difference>`, which writes `pos` with three numbers.
- Every property has a lock toggle: `pos` (the whole position), `pos.u`, `pos.v`, `pos.h`, `rot`, `type`, and for each size a JSON Pointer lock `/types/<type>/size/<0|1|2>`. A locked property cannot be changed from the panel, and the status line says why. Locks are saved in the object's `locks` list. A `pos` lock also locks `pos.h`.
- A yellow `*` marks a number that has an entry in `assumptions` (it is provisional); point at it to read the note and the owner. Editing such a number keeps the entry and updates its `value`. Only a person settles an assumption, from the Assumptions section below. No patch command removes one.
- One checkbox per state, **Hidden in \<state\>**, checked when that state hides the object. Checking it is `hide <state> <id>`; clearing it is `show <state> <id>`. After each of those, one checkbox per part of the object's type, in type order (`body` when the type has no parts), **Hidden in \<state\>: \<part\>**. Checking it is `hide <state> <id>/<part>`; clearing it is `show <state> <id>/<part>`. When the shown state then hides every part, the object counts as hidden and is no longer selected.

### Check panel

The checks of the scene run again after every change, and only the checks that involve the changed objects run again (`in_region` and `no_overlap` even measure only the changed objects). Tapping a row highlights its objects in both views; tapping it again, or `Esc`, clears the highlight. Rows show the same status, id and message as `isoblock check`. A `warn` result shows as `WARN`. `in_region` with `measure: "drawn"`, `min_screen_size` with `measure: "height"` and `lane_apart` are rows like the others, and after a save the panel equals `isoblock check --json` on that file (with `--state <name>` while a state is shown). `lane_apart` does not depend on object positions, so moving an object leaves its row as it was.

Checks that search a grid or rasterize the frame, `reachable`, `sort_consistency` and `visible_share`, are too slow to run on every pointer move. While a drag is going on, their rows keep the last result, are dimmed and say `out of date: runs again when the drag ends`; when the object is dropped (or the drag is cancelled) they run again, so the panel then equals `isoblock check --json` on the saved file. Every other edit (a typed value, a lock, undo, redo, opening a file) runs every check it involves at once.

### State

**State** lists `default`, then the states of the scene. `default` shows every object, unless the scene has a state of that name, in which case choosing it shows that state, as `--state default` does. In a state, both views leave out the objects, parts and frame regions it hides: a hidden object or a hidden part is not drawn and cannot be selected, and a hidden object that was selected is cleared. An object whose every part is hidden counts as hidden. The check panel shows `check --state <name>`. Switching is not an edit: the file does not change, there is no undo step, and the page is not marked unsaved. A newly opened file shows `default`. If the state being shown disappears, the select returns to `default`.

### Adding, copying and deleting

- **Type to add** lists the keys of `types`. **Add** appends an object of that type, as `add <id> <type> <u>,<v>`. The id is `<type><n>` with the smallest integer n ≥ 1 that no object uses. `pos` is the ground point under the center of the view region (the first frame region without `blocksScene`), each coordinate snapped to the nearest multiple of the snap step, a tie rounding up, then rounded to 6 decimals. `rot` is 0. The new object is selected.
- **Duplicate**, enabled while an object is selected, appends a copy as `add <id> <type> <u>,<v> <rot>`, or `add <id> <type> <u>,<v>,<h> <rot>` when `pos` has a base height: the same type, rotation and base height, the id by the rule of Add, and u increased by the footprint's extent along u. Nothing else is copied. The copy is selected.
- **Delete**, and the Delete and Backspace keys while no text field or select has the focus, removes the selected object as `remove` does. A locked object, an object a check names, and a removal that would shift a later object index are refused: the scene stays as it is and the status line gives the reason.

### Nudging

While an object is selected and no text field or select has the focus, the arrow keys move it by the snap step, as `move <id> u±<step>` or `move <id> v±<step>`: right and left along u, down and up along v. Shift moves by 1 unit. Each press is one undo step. A locked axis does not move; the status line gives the reason `patch` would give.

### Assumptions

**Assumptions** lists every entry, in file order: the path shortened as in `describe`, the value, the owner and the note, and a button **Settle \<path\>**. **Settle** replaces itself with **Confirm** and **Cancel** (there is no browser dialog). **Confirm** removes that one entry. The list stays in the file, also when it is empty, and the number keeps its value. **Cancel** leaves the entry. Settling is a person's decision: the editor never adds an assumption, and no patch command removes one.

### Regions

**Regions** lists every frame region, and for each one a checkbox per state, **Region \<id\> hidden in \<state\>**. Checking it is `hide <state> region:<id>`; clearing it is `show <state> region:<id>`. A scene with no states says so.

### Relations and Solve

**Relations** lists every relation, live, including while a drag moves an object: status `OK`, `BAD` or `SKIP` (the button's `data-status` is `satisfied`, `violated` or `skip`, and `data-relation` is the id), the id, `rel`, the targets as `describe` prints them, and the violation or the skip reason. The heading counts violated and skipped relations. Tapping a row highlights its objects; tapping it again clears the highlight. Relations use every object, whatever state is shown.

**Only the selected object**, **Turn objects** and **Solve** run the solver on the open scene, with `--only` when the first box is checked and an object is selected, and with `--rotate` when **Turn objects** is checked. The section then shows `solved` or `conflict`, how many objects move, and the soft penalty to 2 decimals, with **Apply** and **Discard**. Both views draw each moved object, and each turned object, as an outline at the proposed place and rotation, and a line from where it is. A conflict marks those rows with `data-conflict="true"` and the status line names them. **Apply**, enabled when an object moves or turns, is one undo step: the patch `solve --patch -` prints for the scene the proposal was made from, including `--rotate` when it was used. **Discard** drops the proposal. An edit, undo, redo or a newly opened file drops it too; switching state does not. A proposal is never saved.

### Overlays

Toggles, all off at first except the ground layers: **Frame regions**, **Strips**, **Lanes**, **Zones**, **Anchors** (off by default), **Object labels**, **Relations**, **Sort points**, **Occlusion rays** and **Masks**. **Relations** draws a line at height 0 for each relation that is not skipped, and for `facing` a short arrow from the facing point along its front. **Sort points** marks each sprite of the objects drawn in the shown state; the selected object's keys are written beside the dots. **Occlusion rays**, in the isometric view, draws the samples of the highlighted `visible` check. **Masks**, in the isometric view, tints the object raster and marks the selected object's pixels that other objects cover; it waits for the drop, like `visible_share`.

**Occluders of** lists `none`, then each lane that has a piece and each zone of 3 or more points. **Actor size** is `w,d,h` and **Occluder step** defaults to 0.25. With an area and an actor size, both views outline the objects `occluders` lists, and the plan view marks the used positions. It waits for the drop. A size, a step or a grid that `occluders` refuses draws nothing, and the status line gives the reason.

### Touch

One finger drags an object or pans; two fingers zoom and pan. Controls are 44 px high on touch screens, and a finger hits an object when it comes within 24 px of it. While a gesture is going on the view is drawn at pixel ratio 1 and made sharp again when the finger lifts, to keep 200 objects at 60 frames per second.

### Driving the editor from a script

The page has a read-only object `window.isoblock` for tests and tools: `scene()`, `text()` (the text `Save` writes), `state()` (file name, selection, highlight, unsaved changes, view mode, `stale`: the ids of the check rows that are out of date during a drag, and `staleOverlays`: `masks` and `occluders` whose picture is from before the current drag), `overlay(name)`, `screenOf(view, id)` (page coordinates that hit an object), `viewport(view)`, `lockIcons(view)`, `pixelRatio(view)`, `fit(view)`, `redraw(view)` and `frames` (`start()`, `stop()`, `snapshot()`). It cannot change the scene. The tests in `tests/editor/` use it with `playwright-core` and an installed Chromium.

`overlay(name)` returns the data the overlay draws, or `null` when that overlay is off or no scene is open:

- `overlay("relations")` is `{ "results" }`, the `results` of `relations --json` on the current scene.
- `overlay("proposal")` is the shown proposal as `solve --json` prints it, with `--rotate` when **Turn objects** was checked, or `null` when none is shown. It has no checkbox.
- `overlay("sortPoints")` is `{ "sprites": [{ "object", "slice", "key", "point" }] }` for the objects drawn in the shown state. `key` is the runtime file's sort key. `point` is `[u, v, h]`, the center of the sprite's footprint at the object's base height, rounded to 6 decimals. `slice` is the sprite's place among that object's sprites.
- `overlay("rays")` is `{ "check", "samples": [{ "at", "occluded", "by" }] }`. `check` is the id of the highlighted `visible` check, or `null` with no samples when there is none. `at` is the sample on the face before the outward offset. `by` lists the objects whose part the ray runs inside.
- `overlay("masks")` is what `visibility --json` prints for the shown state (no `--state` for `default`, unless the scene has a state of that name).
- `overlay("occluders")` is what `occluders --json` prints for the chosen area, actor size and step, or `null` when the area is `none` or the command would exit 2.

During a drag, `staleOverlays` lists `masks` and `occluders` while those pictures stay on the last run. The drop runs them again.

## Reading `describe`

```
scene yard v1 draft · unit u · camera iso30 · 80 px/u · frame 1000x1000 (view y 150-1000)
id      type   pos(u,v)    size(w,d,h)       rot  locks
tree    tree   3.00,0.20   1.20,1.20,2.40*   0    pos
actor   actor  2.30,0.97   0.40,0.40,1.20    0    -
crate1  crate  6.00,0.50   0.60,0.60,0.60    0    -
crate2  crate  6.80,0.50   0.60,0.60,0.60    0    -
bench   bench  3.40,2.60   1.20,0.40,0.50    0    -
FAIL c4 clearance crate1×crate2: gap 0.20 < 0.50
FAIL c7 lane_reaches haul: meets right edge at y≈1104 (view y 150-1000)
FAIL c8 visible actor: 40% occluded (tree)
assumptions: tree.size.h=2.40
(* = provisional value)
```

- **Header:** scene id, version and status from `meta`, unit, camera (`iso30`, `dimetric21`, `u<angleU>/v<angleV>`, or `e<elevation>/d<direction>` for the view form), pixels per unit (`pxPerUnit` or `scale`), frame size, and the first region that does not block the scene.
- **Object table:** one row per object. `pos` is the footprint's minimum (u, v) corner after rotation. When any object has a base height, the column is `pos(u,v,h)` and every row prints three numbers, with 0 for a `pos` of two. `size` is the type's size `w,d,h` before rotation. `rot` is 0, 90, 180 or 270. `locks` lists locked properties, comma-separated, or `-`.
- **`*`:** a number that has an entry in `assumptions`. It is provisional: ask before relying on it.
- **Check lines:** one per `fail`, `warn` or `skip` check, in `checks` order, with the ids involved. The gameplay checks read `FAIL k3 reachable bench2: path of 3.10 u (max 1.00)`, `FAIL s1 capacity seat: 4 usable < 6 (blocked: ...)`, `FAIL m1 min_screen_size walker1: 126 px < 200 px` and `FAIL s1 sort_consistency shed, box, counter, kiosk: drawn out of order, worst 545.60 px2`. A drawn region reads `FAIL drawn in_region tower: outside view`, a height reads `FAIL size_height min_screen_size tower: 192 px tall < 200 px`, and a lane separation reads `FAIL walks_near lane_apart walk1×walk2: 0.30 < 0.50` or `FAIL walks_cross lane_apart walk1×walk3: overlap 0.60`. A warning reads the value, the margin and the bound, for example `WARN gap_ab clearance crate_a×crate_b: gap 0.60, within 0.25 of 0.50`, `WARN figure_seen visible figure: 31% occluded, within 15% of 40%`, `WARN reach_seat reachable bench: path of 6.50 u, within 1.50 of 7.00`, `WARN seats capacity seat: 2 usable, within 1 of 2`, `WARN figure_tall min_screen_size figure: 85 px tall, within 10 px of 80 px` and `WARN street_shown visible_share lamp: 81% shown, within 20% of 70%`. With none, the output says `checks: all N pass` (or `checks: none`).
- **Numbers:** 2 decimals (up to 4 when 2 would lose information), whole pixels after `≈`, whole percentages.
- **Assumptions:** `<type>.size.<w|d|h>`, `<type>.<part>.<u0|v0|h0|u1|v1|h1>`, or the JSON Pointer for other paths. `-` when there are none.
- **`--relations`:** after the check lines, one `BAD` line per violated relation (`BAD r1 in_front_of bench×tree: violation 0.7172`; a hard relation starts the text after the colon with `hard; `) and one `SKIP` line per skipped relation, then `relations: <n> · <v> violated · <k> skipped · hard <h> of <H> satisfied · soft penalty <p>`. With no relations the only line is `relations: none`.
- **`--states`:** one line, `states: <name> hides <what>` for each state in file order, joined with ` · `. What a state hides is up to three items joined with `; `: its object ids, `parts <object>/<part>, …`, and `regions <ids>`. An empty item is left out, so `cinema hides crate2; regions board` and `bare hides parts mast/body`. A state that hides nothing says `<name> hides nothing`. With no states the line is `states: none`. With both flags, this line follows the relation lines.

## Check reference

Parameters marked optional can be left out. A check with a wrong or unknown parameter makes the file invalid (`E_SCHEMA`). Tolerance when comparing numbers: `value` 0.01 units, pixel values 1 px.

| `check` | Parameters | Passes when | `value` |
|---|---|---|---|
| `in_region` | `region`; optional `strip`, `ids`, `measure` (`footprint` or `drawn`), `maxOutside` (only with `drawn`) | With `footprint` (default): every footprint corner, projected at the object's base height, is inside the region rectangle, edges included, and the footprint's v range is inside the strip's v range. With `drawn`: the share of the screen box of the parts that lies outside the region is at most `maxOutside`, and the strip rule still holds | Number of failing objects. With `drawn`, also `outside` |
| `no_overlap` | optional `ids`, `allow` (pairs, either order) | No two boxes overlap, except allowed pairs. A box is the footprint from the base height to the base height plus the type height. A flat box (height 0) overlaps nothing, and a box that rests on another does not overlap it | Number of overlapping pairs |
| `clearance` | `a`, `b`, `min`; optional `warn` | Edge-to-edge distance between the two footprints is at least `min`. Heights do not change it. With `warn`, a pass whose gap is below `min + warn` is `warn` | The distance |
| `lane_clear` | `lane`; optional `ignore`, `height` (clear height) | No object outside `ignore` blocks the lane. A lane is a polyline: each segment longer than zero becomes a piece, the segment widened by half `width` and not past its ends, with a surface that runs from one end height to the other. An object blocks a piece when its footprint overlaps that piece and it takes space at the surface under the overlap, up to `height` when it is set | Number of blocking objects |
| `lane_reaches` | `lane`, `edge` (`right`, `left`, `top` or `bottom`), `region` | Every meeting of a piece with the frame edge lies inside the region's range along that edge (y for `right` and `left`, x for `top` and `bottom`). Each end of a piece is projected at that end's height | Largest y of those meetings for `right` and `left`, largest x for `top` and `bottom`, in px. `null` and `fail` when no piece meets the edge |
| `lane_apart` | `lane`, `target` (`lane:<id>` or `zone:<id>`); optional `min` (default 0), `warn` | The lane does not overlap the target, and the distance between them is at least `min`. An overlap still fails. With `warn`, a pass whose distance is below `min + warn` is `warn` | The distance. Also `overlap`, the largest area one piece shares with one piece of the other lane, or with the zone |
| `visible` | `target`, `maxOccluded`; optional `from` (default 0.55), `warn` (0 to 1) | The share of the target's camera-facing faces hidden by other objects is at most `maxOccluded`. With `warn`, a pass whose share is above `maxOccluded - warn` is `warn` | Occluded fraction, 0 to 1 |
| `reachable` | `from`, `to` (points); optional `area`, `radius` (0.2), `step` (0.1), `ignore`, `max`, `level` (0), `height` (clear height), `toLevel`, `warn` | A walkable path exists from `from` to `to`, and with `max` it is at most that long. Without `toLevel` the path stays on `level`. With `toLevel` it may cross levels through lanes that join them. `area` together with `toLevel` is `E_SCHEMA`. `warn` requires `max`; a pass whose length is above `max - warn` is `warn` | Path length in units. Without `toLevel`, moves times `step`. With `toLevel`, that plus each connector's length in (u, v, h). `null` and `fail` when there is no path |
| `capacity` | `kind`, `min`; optional `body` (`[0.5, 0.5]`), `ids`, `allow` (object ids), `warn` | At least `min` anchors of `kind` can be used at once. With `warn`, a pass whose count is below `min + warn` is `warn` | Number of usable anchors |
| `min_screen_size` | `target`, `min` (pixels); optional `screenWidth` (default: the frame width), `measure` (`bounds` or `height`), `warn` | The target is at least `min` pixels tall on screen. `bounds` (default) is the screen box of the parts; `height` is their vertical extent times the length of `up` on screen. With `warn`, a pass whose height is below `min + warn` is `warn` | Pixels |
| `sort_consistency` | `actor` (`[w, d, h]`); optional `step` (0.1), `reach` (1), `maxPixels` (0), `area` (zone id), `ids`, `level` (0) | An engine that sorts one key per sprite draws a test actor standing at `level` and the objects in their geometric order, to within `maxPixels` of wrong area for every examined object. The actor overlaps boxes, not footprints | Number of examined objects over `maxPixels`. Also `worst` (px squared) and `positions` |
| `visible_share` | `ids` or `tag`, exactly one; `min` (0 to 1); optional `region`, `warn` (0 to 1) | Each examined object shows at least `min` of its own pixels in the region, measured on the object raster (see [Masks and visibility](#masks-and-visibility)). An object with no pixel there is not examined. With `warn`, when none fail and some are below `min + warn`, the status is `warn` and `ids` lists those objects | The smallest share of the examined objects. Also `shares`, the share of each failing object, or of each object in the margin when the status is `warn` |

Notes:

- `ids` in a result: failing objects (`in_region`), involved objects sorted alphabetically (`no_overlap`), blocking objects (`lane_clear`), `[a, b]` in file order (`clearance`), `[lane]` (`lane_reaches`), `[lane, target id]` (`lane_apart`), `[target]` (`visible`), failing objects in file order (`visible_share`), or the objects inside the margin when `visible_share` is `warn`.
- `warn` is a margin on the passing side of the check's bound, in the unit of `value`. `warn: 0` never warns. A `fail` or `skip` is unchanged. `check` prints a `WARN` line; `check --failing` leaves it out, and the exit code treats `warn` as `pass`. `warn` on a check that counts objects, or on `lane_reaches`, is `E_SCHEMA`. `reachable` with `warn` and without `max` is `E_SCHEMA`. `warn` above 1 on `visible` or `visible_share` is `E_SCHEMA`.
- `visible` samples the top face and the side faces from `from` times the height up to the full height, 64 points per face, and casts a ray toward the camera from each point through the parts of every other object. `occluders` lists the objects that hide at least one point.
- Footprints always use the type's `size` rectangle, even when parts stick out. Parts matter for `visible` and for drawing.
- **A lane is a chain of pieces.** Each segment whose ground length is above zero is a rectangle of the lane's width, not extended past its ends. A segment shorter than that adds no piece, though the lane may still climb there. A lane with no piece is `skip`, as a lane of zero length. A lane of two points along u or v is the one rectangle earlier stages measured, so those results stay. At a bend the outer corner between two pieces is not part of the lane. A stair is measured as a ramp from its first step to its last. `lane_reaches` keeps every meeting with the edge inside the region. A `lane_apart` zone with fewer than 3 points is `skip`. A skipped `lane_apart` has no `overlap`. Heights do not change `clearance` or `capacity`.
- **`skip` is not a pass.** It means the tool could not evaluate the check: the check is not implemented in this stage (`state_stable`), or its input has an unsupported shape (for example `reachable` in a scene with no walkable zone), or the check names an object or a frame region that the chosen state hides, or `visible_share` finds no listed object drawn in its region. A skipped check has `value: null` and `threshold: null`, and `check` exits 1. A tag that no object has is not a schema error: that `visible_share` check is `skip`.

### The gameplay checks

A point in `reachable` is `[u, v]`, `lane:<id>` (the first point of the lane for `from`, its last point for `to`) or `anchor:<object id>/<anchor id>` (the anchor's ground point after rotation; its height is ignored).

**`reachable`** walks a grid:

- **Walkable area:** the polygon of the zone named by `area`, else every zone with `kind: "walkable"`; with neither, `skip`. Zones with `kind: "blocked"` are cut out.
- **Grid:** the cell (i, j) has its center at `((i + 0.5) * step, (j + 0.5) * step)`. A cell is free when its center is in the walkable area (the boundary counts as inside), not in a blocked zone, and at least `radius` away from the footprint of every object, except the objects in `ignore` and the objects whose anchors `from` and `to` name.
- **Start and target** are the free cells nearest to the points (ties: smaller i, then smaller j). If that cell is farther than `step` from the point, the check fails with `start is not on walkable ground` or `target is not on walkable ground`.
- **Path:** the fewest moves between free cells that share an edge; the value is moves times `step`. No path: `fail`, `value: null`, `no walkable path`. With `max`, a longer path fails and keeps its value.
- **`toLevel`:** the path may change level. The levels are `level`, `toLevel`, then the heights of the walkable zones of 3 or more points; two heights within a tiny tolerance are one level. Each level has its own grid. A lane with a piece whose first and last points lie at two different levels, and that no object blocks, is a connector walked both ways. Its ends attach to the free cell nearest each end, and it is left out when an end has no free cell within `step`. Its length is the sum of the distances between its points in (u, v, h). A move on one level costs `step`. The value is the shortest total length. Without `toLevel` the search stays on one level, even when connectors exist. `area` together with `toLevel` is a schema error. More than 4,000,000 cells over all levels is `skip`.
- `ids` are the objects whose anchors `from` and `to` name. A gap close to `step + 2 * radius` wide may open or close as the grid shifts: use a smaller `step` where it matters. A grid of more than 4,000,000 cells is not evaluated (`skip`): use a larger `step`.

**`capacity`** counts seats and the like. Candidates are the anchors with the given `kind`, objects in file order and anchors in type order (`ids` limits the objects). The body of a candidate is a rectangle `body` (`[w along u, d along v]`, never rotated) centered on the anchor's ground point. In order, a candidate is accepted when its body overlaps neither the footprint of another object (except those in `allow`) nor the body of a candidate accepted before. `accepted` and `rejected` list `<object id>/<anchor id>` labels.

**`min_screen_size`** projects the 8 corners of every part of the target and takes the height of their screen bounds, times `screenWidth / frame.w` (so a scene drawn at 1000 px wide can be checked as if the screen were 1920 px wide). That box includes the footprint's depth. `measure: "height"` leaves the depth out: `(highest part − lowest part) × pxPerUnit × verticalScale × screenWidth / frame.w`, which is how tall a character looks. Both are rounded to 6 decimals.

### Drawn boxes and lanes kept apart

**`in_region` with `measure: "drawn"`** uses the same screen box as `min_screen_size`, instead of the footprint at height 0. The share outside is `1 − area(drawn box ∩ region) / area(drawn box)`. A drawn box with no area has share 0 when the whole box lies inside the region (edges included) and 1 otherwise. An object fails when its share is over `maxOutside` (0 to 1, default 0), or when `strip` is set and the footprint fails the strip rule. `threshold` stays 0 whatever `maxOutside` is. `outside` lists the shares of the failing objects, in the same order as `ids`, rounded to 6 decimals (`[]` when none fails). The footprint measure has no `outside` field.

`maxOutside` without `measure: "drawn"` is a schema error. A tall object can stand on a footprint that is inside the view while its top leaves the screen: `"drawn"` reports that, and `maxOutside` allows a chosen share to stick out.

**`lane_apart`** keeps a lane off another lane or off a zone:

```json
{ "id": "gap", "check": "lane_apart", "lane": "walk", "target": "lane:road", "min": 0.5 }
{ "id": "dry", "check": "lane_apart", "lane": "walk", "target": "zone:pond", "min": 0.4 }
```

The overlap of two lanes is the largest area of one piece with one piece of the other, the piece being the segment widened by half the width. The overlap of a lane and a zone is the largest area of the zone clipped to one piece, so the order of the zone's points does not matter. The distance is the smallest distance between a piece and the other shape: 0 when a corner of one lies inside the other or two edges cross, otherwise the smallest distance between an edge of one and an edge of the other. For two lanes of two points along u or v this is the `clearance` distance and the rectangle area. The check passes when the overlap is 0 and the distance is at least `min`. Two shapes that only touch have distance 0 and overlap 0: they pass with `min` 0 and fail with any larger `min`. `value` is the distance and `overlap` is the area, both rounded to 6 decimals. `ids` is `[lane, target id]`.

Lanes and zones are never hidden by a state, so `lane_apart` gives the same result in every state. On `tests/fixtures/measures/measures.scene.json`, `drawn` fails because 0.137931 of the tower's drawn box lies above the view, `size_height` is 192 px against a minimum of 200, and `walks_near` finds the two walk lanes 0.3 apart.

### `sort_consistency` and sprites

Engines usually sort what they draw by one point per sprite. That is exact only for a sprite whose footprint is square. A long object (a wall, a bench, a counter) sorts wrong when a character walks around it. IsoBlock does two things about it:

1. **It cuts long objects into slices** in the runtime file (see [Sprites and slices](#sprites-and-slices)), so that every sprite is close to square.
2. **`sort_consistency` measures what is left.** It walks a test actor around each object, compares the order the engine rule gives with the geometric order, and reports the area of the screen that is drawn in the wrong order.

Parameters: `actor` is the size `[w, d, h]` of the character or vehicle that walks around; `step` is the grid of actor positions (cell centers at `((i + 0.5) * step, (j + 0.5) * step)`); `reach` is how far from an object the actor may stand (edge to edge); `maxPixels` is the wrong area in px squared that the scene accepts; `area` limits the positions to a zone, minus the zones with `kind: "blocked"`; `ids` limits which objects are examined (the others still count as obstacles and as the other side of a pair).

For each examined object the check looks at:

- **actor mismatches:** every position where the actor stands within `reach` of the object, on no object, and (with `area`) on the zone. The engine draws the actor after a sprite when the actor's key is at least the sprite's key. That is wrong when the actor must be drawn first (or the other way round);
- **static mismatches:** every piece of the object against every piece of every other object, with the keys and the sprite list order as the engine has them.

The *wrong area* of a mismatch is the intersection of the two outlines on the screen (the outline of a box is the hull of its 8 projected corners), so a bounding rectangle that overlaps while the outlines only touch counts 0. Pieces whose boxes intersect are not compared. An object's `worst` is the largest wrong area of its mismatches; the check's `value` is the number of examined objects whose worst is over `maxPixels`, and `ids` lists them.

**Reading a result** (`court`, check `s1`, an actor of 0.4 x 0.4 x 1.7, `maxPixels` 0):

```
{ "id": "s1", "check": "sort_consistency", "status": "fail", "value": 4, "threshold": 0,
  "ids": ["shed", "box", "counter", "kiosk"], "worst": 545.6, "positions": 9031 }
```

- `ids` are the objects that need a fix, in file order. Both objects of a pair are listed when the pair is wrong (`shed` and `box`).
- `worst` is the largest wrong area over the examined objects, 545.6 px squared here (the `shed`, which is one sprite of 2 x 1.5).
- `positions` is the number of actor positions used, summed over the examined objects. It shows whether the actor could walk around the object at all (a count of 0 means no position was free: look at `reach`, `area` and `step`).
- `maxPixels` sets what the scene accepts. Raise it for small errors: with `maxPixels: 300` (check `s3`) the `box` (155.88) and the `counter` (19.49) are accepted, and the `shed` and the `kiosk` (409.2) are still reported.

What to do about a failing object, in order:

1. Make its footprint closer to a square: the tool cuts only long footprints into slices, and a footprint such as 2 x 1.5 stays one sprite.
2. Split it into a front part and a back part as separate objects, or make the part that sticks out (the roof of a kiosk, the top of a counter) an object of its own.
3. Move the neighbor that it cannot be sorted against: in `court`, the `box` stands against the front corner of the `shed`, and moving it 0.4 along -u (variant `A` in `tests/fixtures/sort/compare/`) clears that pair.
4. Accept it with `maxPixels` when the error is small and the art hides it.

`skip` results: `area` names a zone with fewer than 3 points (`zone "mark" has 0 points; an area needs 3 or more`), and a search of more than 4,000,000 grid cells around an examined object (use a larger `step`). `sort_consistency` samples a grid, so an error strip narrower than `step` may fall between samples; use a smaller `step` where it matters. In a state, hidden objects have no sprites, block no position and are not examined.

## States

A state hides objects, parts of objects and frame regions:

```json
"states": {
  "open": { "hide": ["barrier1"] },
  "closed": { "hideParts": { "kiosk": ["awning"] }, "hideRegions": ["board"] }
}
```

A state does not move objects. `hideParts` maps an object id to part ids (`body` for a type without parts). `hideRegions` lists frame region ids. `--state NAME` works on `check`, `render`, `compare` and `export --target gen-bbox`; without it every object, part and region is present. In a state:

- hidden objects are not drawn, get no generation box, and do not overlap, block, occlude or count anywhere (lanes, paths, seats, rays). An object whose every part is hidden counts as hidden;
- a hidden part is not drawn, occludes nothing, leaves the sprites and the generation box, and is left out of `min_screen_size` and of `in_region` with `measure: "drawn"`. The object keeps its footprint and its box, so every check measured on them is unchanged;
- a hidden region is not drawn. `in_region` and `lane_reaches` that name it are `skip`. The view region of `solve`, of `describe` and of Add stays the same in every state;
- a check that names a hidden object by itself is `skip` (`clearance` `a` or `b`, the `target` of `visible` and `min_screen_size`, including `measure: "height"`, an anchor in `reachable` `from` or `to`), with a message that says which object and which state;
- the lists `ids`, `allow` and `ignore` of a check lose the hidden objects; a list that loses all of them checks no object (it does not fall back to all objects). `in_region` with `measure: "drawn"` follows that rule, and a hidden object is not part of any drawn box;
- `lane_apart` does not change in a state: lanes and zones stay;
- `sort_consistency` gives hidden objects no sprites and no positions, and does not examine them.

Usage errors (exit 2, `E_USAGE`): a state name the scene does not define (the message lists the states it has), and `--state` with `export --target runtime`: the runtime file carries all states.

`compare --state NAME` evaluates every column in the state and names it in the header (`compare walk · state open · base vs A, B`). The hidden objects are those the **base** scene's state lists, in every column, as every column runs the base's checks; hidden objects are not counted as moved.

## Patches

Agents do not rewrite scene files. They send a small patch, and the tool applies it, checks the locks, and reports what changed. The loop for an agent: `describe` the scene, write a patch, run `patch --dry-run --json`, read the report, and run `patch` again without `--dry-run` once the report is what you want.

```
isoblock patch <scene.json> <patch|-> [-o <out.json>] [--dry-run] [--json]
```

A patch argument of `-` reads the patch from standard input. The same parsing rules apply. The log names that patch `-`.

- The result goes to `-o`, else back into `<scene.json>`, in the saved format (two-space JSON, keys in file order, one final newline).
- `--dry-run` runs everything and prints the report but writes nothing: no scene file and no log line.
- A patch is **atomic**: it applies to a copy of the scene, and any failure leaves the file as it was.
- The scene file must be valid. If it is not, or if the patch file cannot be read, the command stops with exit code 2 and an error on stderr, and prints no report.

### Patch files

A file whose first non-blank character is `[` is a **JSON Patch** (RFC 6902): an array of operations `add`, `remove`, `replace`, `move`, `copy` and `test`, with JSON Pointers into the scene file (`/objects/3/pos/0`, `/objects/-` appends). The pointer `""` (the whole scene) is not allowed. A failing `test` makes the patch invalid.

```
[{"op": "replace", "path": "/objects/3/pos/0", "value": 7.2}]
```

Any other file is **short commands**: one command per line. Blank lines are ignored. A line that starts with `#` is a comment; the first comment line is the patch's **description** (the log and `compare` show it). Tokens are separated by spaces; double quotes group a token that contains spaces (`note="two words"`). Inside quotes, `\"` is a quote and `\\` is a backslash, which makes it possible to write a JSON value with strings: `set /objects/0/tags "[\"a\", \"b\"]"`.

```
# move the bench toward the path
move bench v+0.2
set /types/tree/size/2 2.2 note="measured from approved art"
lock tree pos
relate bench in_front_of tree gap 1..1.5 hard
```

| Command | Effect |
|---|---|
| `move <id> <u±n> [<v±n>] [<h±n>]` | Adds to `pos`. Each axis at most once, in any order, with a sign: `move bench u-0.5 v+0.2`, `move bench h+0.3`. `h±n` adds to the base height; when `pos` has two numbers it gains a third, 0 plus the offset |
| `rot <id> <0\|90\|180\|270>` | Sets `rot` and recomputes `pos` so that the footprint keeps its center. A base height stays as it is |
| `set <pointer> <value> [note="<text>"]` | Replaces the value at an existing JSON Pointer. The value is read as JSON, else as a string (`2.5`, `true`, `"[1, 2]"`, `approved`). `note=` replaces the `note` of the assumption with that `path`; it is an error when there is none |
| `lock <id> <lock>...` | Adds the locks the object does not have yet: `pos`, `pos.u`, `pos.v`, `pos.h`, `rot`, `type`, or a JSON Pointer |
| `relate <a> <rel> <b> [gap <min>..<max>] [axis <u\|v>] [t <min>..<max>] [min <n>] [angle <n>] [hard] [weight <n>] [id=<id>] [source="<text>"]` | Appends a relation. `hard` is always written (`false` when not given). Without `id=` the id is the first free `r1`, `r2`, ... `angle` is the parameter of `facing`, a number from 0 to 180 |
| `add <id> <type> <u>,<v>[,<h>] [<rot>]` | Appends an object `{ "id", "type", "pos": [u, v], "rot" }`, or with `,<h>` `"pos": [u, v, h]`. `rot` is 0, 90, 180 or 270, and 0 when it is left out. An id already in use, or a position or rotation that is not in that form, is `E_PATCH`. An unknown type is `E_REF` after the patch is applied |
| `remove <id>` | Removes the object, every relation whose `a`, `b` or `ids` names it, its entries in each state's `hide` list and `hideParts`, and every assumption whose path is that object's index or below it. If an assumption or a pointer lock sits at a later object index, the index would shift and the command is `E_PATCH`. Checks are left as they are: a check that still names the object makes the result `E_REF`, so change the check in the same patch first |
| `hide <state> <id>` | Appends the object to `states.<state>.hide`, creating `states`, the state and its `hide` list when they are missing. An object already in that list is `E_PATCH` |
| `show <state> <id>` | Removes the object from that list. The state stays, also when the list is empty. An unknown state, or an object the state does not hide, is `E_PATCH`. The object is checked before the state |
| `hide <state> <id>/<part>` | Appends the part to that object's list in `states.<state>.hideParts`, creating `states`, the state, `hideParts` and the list when they are missing. The part is `body` when the type has no parts. A part already listed is `E_PATCH` |
| `show <state> <id>/<part>` | Removes the part from that list. A list that becomes empty loses its key; `hideParts` stays, also when empty. An unknown state, or a part the state does not hide, is `E_PATCH` |
| `hide <state> region:<id>` | Appends the frame region to `states.<state>.hideRegions`, creating `states`, the state and the list when they are missing. A region already listed is `E_PATCH` |
| `show <state> region:<id>` | Removes the region from that list. The list stays, also when empty. An unknown state, or a region the state does not hide, is `E_PATCH` |
| `solve ...` | Not a patch command: a patch that contains it is invalid with `E_USAGE`. Run `isoblock solve --patch` and apply the patch it writes |

- There is no `unlock`: people remove locks in the editor or in the file.
- A command that names an object the scene does not have is `E_PATCH`. When another object id is within two edits, the message ends with ` (did you mean "<id>"?)`. A `show` of an unknown state gets the same suggestion from the state's names. `hide` creates a missing state instead of reporting it.
- The second word of `hide` and `show` is an object id when one matches, else `region:<id>`, else a part. The part is found as an anchor is: the first split from the left at which the left side is an object id and the right side a part of its type (`body` when the type has no parts). When no split gives both, the longest object id names an unknown part of that object. So with objects `a` and `a/b`, `a/b/low` names the part `low` of `a/b` when `a` has no part `b/low`. The command checks the object or the region, then the part, then, for `show`, the state, then whether the item is listed. An unknown part, region or state gets the same suggestion, from the part ids of that type, the frame region ids, or the state names.
- After the last command, every `assumptions[].value` is set to the value its `path` points to. A provisional number stays provisional until a person settles it in the editor. No patch command removes an assumption.
- `move` and `rot` round the coordinates they compute to 6 decimals. `rot` leaves `pos` as it is when the footprint keeps its shape (0 to 180).
- `relate` does not check its names: an unknown object in `a` or `b` is `E_REF` and an unknown relation name is `E_SCHEMA`, both reported after the patch applied.

### Locks

A patch **touches a lock** when, compared with the original scene, any of these happens (only locks of the original scene count):

- a locked value changes: `pos`, `pos.u` (the first number of `pos`), `pos.v`, `pos.h` (the third number; a third number that appears or goes counts), `rot`, `type`, or the value at a JSON Pointer, including when it appears or is removed;
- a lock entry disappears from an object;
- a locked object disappears.

`pos.u` blocks u only: `move o020 v+0.5` is applied while `move o020 u+1` is rejected. A move by zero changes nothing and touches nothing. A touched lock rejects the whole patch: nothing is written, the exit code is 3 and the report lists labels `<object id>.<lock>`, in object order, then lock order.

### Outcomes

The order is fixed:

| Status | When | Error | Exit code |
|---|---|---|---|
| `invalid` | The patch is malformed or a command fails; a `solve` line | `E_PATCH`, `E_USAGE` | 2 |
| `rejected` | The patch touches a lock | `E_LOCK` | 3 |
| `invalid` | The result does not match the schema or has a broken reference | `E_SCHEMA`, `E_REF` | 2 |
| `applied` | Everything else | none | 0 when no check of the result is `fail` or `skip`, else 1 |

### Report

```
$ isoblock patch yard.scene.json spread.patch -o yard2.scene.json
patch yard: applied
~ /objects/crate2/pos [6.8,0.5] -> [7.2,0.5]
check c4 clearance: fail -> pass (0.2 -> 0.6)
failing checks: 2
wrote yard2.scene.json
```

The first line is `patch <scene id>: applied|rejected|invalid`. Then come the error (`error <code>: <message>`), one line per change (the same lines as `diff`) and one line per check that changed, then the number of failing checks. With `--dry-run` the last line is `dry run: nothing written`. The report goes to stdout for all three statuses.

`--json` prints this instead (the files are written as without it):

```
{
  "scene": "yard",
  "status": "applied",
  "error": null,
  "locks": [],
  "diff": [ { "op": "replace", "path": "/objects/crate2/pos", "from": [6.8, 0.5], "to": [7.2, 0.5] } ],
  "checks": [ { "id": "c4", "check": "clearance", "from": "fail", "to": "pass", "value": [0.2, 0.6] } ],
  "failing": 2
}
```

(Shown in a shorter layout; the tool prints standard two-space JSON.)

- `status`: `applied`, `rejected` or `invalid`. `error` is `null` or `{ "code", "message" }`.
- `locks`: the touched lock labels, only for a rejected patch.
- `diff`: the changes from the original to the result, as `diff` prints them (see below).
- `checks`: each check whose status changed or whose value changed by more than 1e-9, with `value: [before, after]`. Checks are matched by id; a check that the patch adds or removes shows in `diff`, not here.
- `failing`: number of `fail` or `skip` results after the patch. A rejected or invalid patch has empty `diff` and `checks` and `failing: null`.

### Patch log

Every applied or lock-rejected patch that is not a dry run adds one line to `<output file without .json>.log.jsonl` (for `-o out.json`: `out.log.jsonl`; without `-o`: next to the scene file). Invalid patches are not logged.

```
{"seq":1,"patch":"tree.patch","description":null,"status":"rejected","error":{"code":"E_LOCK","message":"the patch touches locks: tree.pos"},"locks":["tree.pos"],"diff":[],"checks":[]}
```

`seq` counts the lines of the log from 1. `patch` is the file name of the patch (without its directory) and `description` its first comment line or `null`. The log has no timestamps: the version history of the files records when.

## `diff`

```
isoblock diff <a.json> <b.json> [--json]
```

Lists the changes from scene a to scene b, matching items by identity and not by position:

- Objects are compared key by key. An array whose items are all objects with a unique string `id` (in both scenes) is matched by `id`; the array `assumptions` is matched by `path`. Every other array (`pos`, `size`, `locks`, `points`, ...) is one value. The order of items and keys does not matter.
- Each change has `op` (`add`, `remove` or `replace`), `path` (a JSON Pointer such as `/objects/crate2/pos` or `/relations/r3`, with `~` and `/` escaped), and `from` and `to` as they apply. Entries are sorted by path.
- Text: `diff <a id> -> <b id>: <n> changes`, then `+ <path> <to>`, `- <path> <from>` or `~ <path> <from> -> <to>` per change, with compact JSON values. `--json` prints `{ "a", "b", "changes" }`.
- The exit code is 0 when the command completes, whether or not the scenes differ.

```
$ isoblock diff yard.scene.json yard2.scene.json
diff yard -> yard: 1 changes
~ /objects/crate2/pos [6.8,0.5] -> [7.2,0.5]
```

## `compare`

```
isoblock compare <scene.json> --variant NAME=FILE... [--state NAME] [--format text|md|json] [--relations]
```

Compares the scene with 1 to 4 variants by measured values. It does not choose: it separates what is measurable from what needs judgment (balance, feel, gameplay intent), and a person decides.

- A variant is a patch file or another scene file (a JSON file whose first character is `{`). Names must be unique and cannot be `base`. Columns are in the order given, base first.
- Each variant is applied to a copy of the base. **Locks are ignored but recorded**: a variant that touches a lock is marked, not stopped. A variant that is malformed or gives an invalid scene stops the command with exit code 2.
- **Every column runs the checks of the base scene**, so the columns are comparable. A variant that changes `checks` is compared under the base's checks.
- The label of a variant is the first comment line of its patch, else its name. `--state NAME` evaluates every column in that state (see [States](#states)); `--render` is not scheduled.
- `--relations` adds two rows and, in the JSON output, two keys: `hard relations violated` (`hardViolated`, the ids of hard relations whose status is `violated`) and `soft penalty` (`softPenalty`, rounded to 6 decimals; the text shows 2 decimals). Every column is measured with the base scene's relations on that column's positions, with every object present whatever the state. Without the flag those keys and rows are absent, and the output is unchanged. A count above zero is marked ` ✗`.
- The exit code is 0 when the command completes, even if checks fail.

```
$ isoblock compare yard.scene.json --variant A=yard.A.patch --variant B=yard.B.patch --variant C=yard.C.patch
compare yard · state default · base vs A, B, C
A = actor moves 0.6 along -u · B = crate2 moves 0.4 along u · C = tree moves 1.0 along u
metric                       base    A         B         C
failing checks               3       2         2         2
locks touched                0       0         0         1 ✗ (tree.pos)
clearance crate1×crate2 (u)  0.20 ✗  0.20 ✗    0.60      0.20 ✗
lane_reaches haul (y px)     1104 ✗  1104 ✗    1104 ✗    1104 ✗
visible actor (% occluded)   40 ✗    0         40 ✗      0
objects moved / total (u)    -       1 / 0.60  1 / 0.40  1 / 1.00
```

How to read the table:

- `failing checks`: checks with status `fail` or `skip`. `locks touched`: how many base locks the variant touches, then their labels; any entry marks the variant invalid (variant C above moves the locked tree).
- One row per check that fails, warns or is skipped in some column, or whose value differs from the base in some column, in the order of `checks`. The label names the check and its unit: `in_region <region>[/<strip>] (objects outside)`, `in_region <region>[/<strip>] drawn (objects outside)` for `measure: "drawn"`, `no_overlap (pairs)`, `clearance <a>×<b> (<unit>)`, `lane_clear <lane> (blocking objects)`, `lane_reaches <lane> (y px)` for `right` and `left` and `lane_reaches <lane> (x px)` for `top` and `bottom`, `lane_apart <lane>×<target id> (<unit>)`, `visible <target> (% occluded)`, `reachable <check id> (<unit>)`, `capacity <check id> (usable <kind>)`, `min_screen_size <target> (px)`, `min_screen_size <target> height (px)` for `measure: "height"`, `sort_consistency <check id> (objects out of order)`, `visible_share <check id> (% shown)`; other checks show as `<check> <id>`.
- Cells: counts as integers, clearance, `lane_apart` and distances with 2 decimals, `lane_reaches` in whole pixels (`none` when the lane does not reach the edge), `visible` in whole percent, `visible_share` in whole percent (halves up), `reachable` with 2 decimals (`none` when there is no path), `capacity` and `sort_consistency` as integers, `min_screen_size` in whole pixels (halves up), `skip` for a skipped check. A trailing ` ✗` marks a value whose status is `fail` or `skip`. A trailing ` !` marks a value whose status is `warn`.
- `objects moved / total`: objects present in both scenes whose `pos` differs, including a change of base height, and the sum of their distances in (u, v, h). A `pos` of two numbers has base height 0.

A `sort_consistency` row counts the examined objects drawn out of order, so a variant that moves the `box` clear of the `shed` shows `3 ✗` against the base `4 ✗` in check `s1` (`isoblock compare tests/fixtures/sort/court.scene.json --variant A=tests/fixtures/sort/compare/court.A.patch --variant B=tests/fixtures/sort/compare/court.B.patch`):

```
compare court · state default · base vs A, B
A = move the box clear of the shed · B = turn the counter
metric                                      base    A         B
failing checks                              7       6         7
locks touched                               0       0         0
sort_consistency s1 (objects out of order)  4 ✗     3 ✗       4 ✗
sort_consistency s3 (objects out of order)  2 ✗     2 ✗       2 ✗
sort_consistency s4 (objects out of order)  2 ✗     1 ✗       2 ✗
sort_consistency s5 (objects out of order)  2 ✗     1 ✗       2 ✗
sort_consistency s6 (objects out of order)  skip ✗  skip ✗    skip ✗
sort_consistency s7 (objects out of order)  1 ✗     0         1 ✗
sort_consistency s8 (objects out of order)  3 ✗     3 ✗       3 ✗
objects moved / total (u)                   -       1 / 0.40  1 / 1.56
```

Formats: `text` (default, shown above, columns left-aligned and padded), `md` (the same rows as a Markdown table with the header `| metric | base | A | B | C |`) and `json`:

```
{ "scene", "state", "variants": [{ "name", "label" }], "failing", "locksTouched", "moved",
  "checks": [{ "id", "check", "label", "threshold", "values", "status", "delta" }] }
```

Every list has one entry per column, base first (`label` is `null` for the base; `moved` is `null` for the base). `delta` is the value minus the base value rounded to 6 decimals, `null` for the base and for values that are `null`. `state` is the name given to `--state`, else `default`.

## Relations

Agents describe a layout with **relations** ("the bench is in front of the tree, 1 to 1.5 units away") instead of coordinates. The tool measures each relation, and the solver computes coordinates that meet them. Add relations with the `relate` patch command (see [Patch files](#patch-files)) or write them into `relations` in the scene file.

```
{ "id": "r1", "a": "bench", "rel": "in_front_of", "b": "tree", "gap": [1, 1.5], "hard": false, "weight": 1, "source": "the bench is in front of the tree" }
```

- `hard`: a hard relation must hold (default `false`). A soft relation adds `weight` times its violation to the **soft penalty** (default weight 1).
- `source`: the sentence the relation came from, for people who read the file later. Optional.
- Targets in `a` and `b`: an object id, `zone:<id>`, `lane:<id>`, or a strip edge `strip:<id>.v0` / `strip:<id>.v1`. `a` of `facing` may also be `anchor:<object id>/<anchor id>`. An anchor anywhere else is a reference error.
- Every relation is measured on the ground (height 0) with the footprints, and gives a **violation** of 0 or more: `satisfied` when it is at most 1e-6, else `violated`. A relation the tool cannot measure is `skip`, with `violation: null` and a message that says why. **A skipped hard relation is not satisfied.**

| `rel` | `a` | `b` | Parameters (default) | Violation |
|---|---|---|---|---|
| `left_of`, `right_of` | object | object | `gap [min, max]` (0 to unbounded) | How far the screen-x separation of the two footprints is outside `gap` |
| `in_front_of`, `behind` | object | object | `gap` (0 to unbounded) | The same for the ground-depth separation (toward the camera) |
| `gap` | object | object | `gap` (0 to unbounded) | The same for the edge-to-edge distance (as `clearance`) |
| `against` | object | object, `lane:<id>` or `strip:<id>.v0\|v1` | `gap` (`[0, 0]`) | The same for the distance to the target |
| `inside` | object | `zone:<id>` | | The largest distance of a footprint corner outside the zone |
| `aligned` | object | object | `axis` `u` or `v` (required) | The difference of the footprint centers along the axis |
| `facing` | object or `anchor:<object id>/<anchor id>` | object, `zone:<id>` or `lane:<id>` | `angle` in degrees (45) | How far the angle between the front and the direction to the target exceeds `angle`, in radians |
| `on_lane` | object | `lane:<id>` | `t [min, max]` (`[0, 1]`) | The distance of the center from the lane beyond half the lane width, plus the lane length times how far its position along the lane (0 at the first point, 1 at the last) is outside `t` |
| `clear_of` | object | object or `lane:<id>` | `min` (0) | How much the distance is below `min`, plus the overlap when the footprints overlap |
| `order_along` | | | `ids` (2 or more objects), `axis` (`u`) | The sum of the backward steps of consecutive centers along the axis |

Notes:

- "Left", "right", "in front" and "behind" are seen from the viewer and follow the camera: screen x is `u cos(angleU) + v cos(angleV)` and depth grows toward the camera. A separation is the gap between the two footprints (for `left_of`: the smallest screen x of `b` minus the largest of `a`), so it is negative when they overlap on screen.
- **Distance to a lane** (`against`, `clear_of`) is the distance to the lane's pieces, the same shape `lane_clear` uses. A lane with no piece is `skip`. For `clear_of` the overlap with a lane is the largest penetration of the footprint into a piece. A lane of two points along u or v keeps the earlier value. `on_lane` follows the whole polyline of any lane longer than 0.
- **`facing`** measures from a facing point along a front. For an object the point is the footprint center and the front is the type's `front` (`+u`, `-u`, `+v` or `-v`). For an anchor the point is the anchor's ground point and the front is the anchor's `front`. The front turns with `rot`: at 90, +u becomes +v and +v becomes -u. The target point is the footprint center of an object, the nearest point of a zone's boundary (the facing point itself when it is inside the zone), or the nearest point of a lane's polyline. The angle is 0 when the two points coincide. The violation is the excess over `angle`, in radians, so that it weighs like the distances of the other relations. `skip` when the type or the anchor has no `front`, when `b` is not an object, a zone or a lane, for a zone of fewer than 3 points, and for a lane of length 0. `ids` lists the object of an anchor. `front` is not the anchor's `facing` string.
- A strip edge is the line v = bound; an unbounded edge (`null`) gives `skip`. A zone needs 3 or more points.
- A target of the wrong kind gives `skip` (for example `left_of` a zone, `inside` an object, `clear_of` a strip edge), as does `aligned` without `axis` or `order_along` with fewer than 2 objects.
- `ids` in a result: the objects the relation names, in object order (also when it is skipped).

### `relations`

```
isoblock relations <scene.json> [--json]
```

Measures every relation, in file order. The first line counts the results and gives the soft penalty; then one line per relation: `OK|BAD|SKIP <id> <rel>: <message>`. Messages of hard relations start with `hard;`.

```
$ isoblock relations yard2.scene.json
relations yard: 3 relations, 1 satisfied, 2 violated, 0 skipped; hard: 1 of 2 satisfied; soft penalty 0.7172
BAD r1 in_front_of: depth separation 0.2828, wanted 1.00..1.50 (violation 0.7172)
OK r2 aligned: hard; center difference along v 0.00, wanted 0
BAD r3 clear_of: hard; distance 0.20, wanted >= 0.50 (violation 0.30)
```

`--json` prints `{ "scene", "results" }`; each result has `id`, `rel`, `hard`, `status` (`satisfied`, `violated` or `skip`), `violation` (rounded to 6 decimals, `null` when skipped), `ids` and `message`, in this order. Read `status` and `violation`, not the message.

| Code | Meaning |
|---|---|
| 0 | Every hard relation is satisfied |
| 1 | A hard relation is violated or skipped |
| 2 | Invalid input or usage |

## `solve`

```
isoblock solve <scene.json> [--only a,b] [--rotate] [-o <proposal.json>] [--patch <moves.patch|->] [--json]
```

Proposes positions that meet the relations. It **never writes the input file**: it proposes, and a person or agent accepts the proposal by applying its patch.

- **What moves:** every object without a `pos` lock, or only the objects named in `--only` (comma-separated ids; an unknown id is a usage error). A `pos.u` or `pos.v` lock fixes that coordinate, and so does a JSON Pointer lock on the position (`/objects/3/pos/0`, or a pointer that contains it). Without `--rotate` the solver never changes rotation. With `--rotate` it may set `rot` to 0, 90, 180 or 270 on each movable object that has no `rot` lock, no `pos`, `pos.u` or `pos.v` lock, and no pointer lock on that object's `rot` or `pos`. It never changes type or sizes and never edits relations.
- **Constraints:** a moved footprint keeps its 4 corners inside the view region (the first frame region without `blocksScene`, edges included) and does not overlap another footprint, unless the two overlapped before. An object that does not move is not constrained.
- **Grid:** every coordinate the solver changes is a multiple of 0.05. A coordinate it does not change keeps its exact value.
- **Objective, in this order:** every hard relation satisfied and every constraint met; then the smallest soft penalty; then the smallest total ground distance moved, measured between footprint centers (for an object that does not turn, the distance its `pos` moves); with `--rotate`, then the fewest turned objects.
- **Deterministic:** the same file gives the same output, byte for byte.
- **Outcome:** `solved` when every hard relation that is not skipped is satisfied and the constraints hold. Otherwise `conflict`, with a **minimal conflict set** found by deletion filtering: start from all hard relations that are not skipped; in file order, drop a relation when the solver still finds no solution without it. The relations left are the set. The set is empty when the constraints alone cannot be met.
- **`conflict` is not a proof that no layout exists.** It means this search found none. Objects that start inside a lane, or on top of each other, give the search a poor start, and it can miss a layout that meets every hard relation. The conflict set then names more relations than are actually in the way. Do not delete those relations on the strength of the report. Place the objects roughly where they should stand, or solve fewer of them with `--only`, and solve again. The proposal printed for a `conflict` is the best layout the search found and may break constraints; do not apply it.

```
$ isoblock solve yard2.scene.json --patch moves.patch
solve yard: solved
move crate1 6,0.5 -> 5.7,0.5
move bench 3.4,2.6 -> 3.9,3.15
hard violated: none
soft penalty 0.00, distance 1.0433
wrote moves.patch

$ isoblock solve conflict.scene.json
solve conflict: conflict
hard violated: k4
soft penalty 0.00, distance 0.00
conflict: k1, k2, k4
```

Outputs:

- `-o <proposal.json>`: the scene with the new positions, in the saved format. Every `assumptions[].value` follows its path, as after `patch`.
- `--patch <moves.patch>`: the proposal as short commands: the line `# solve proposal`, then one `move` per moved object, in object order (an axis without an offset is left out). With `--rotate`, an object that turned gets a `rot <id> <rot>` line before its `move`, and that move's offsets run from the position `rot` gives (it keeps the footprint center) to the proposed one. A turned object whose footprint is square may have a `rot` line and no `move`. `patch` applies it with lock checks and the log, and gives the same file as `-o`.
- `--patch -` writes that same patch to standard output and prints no report, so it can be applied directly: `isoblock solve scene.json --patch - | isoblock patch scene.json -`. `--json` together with `--patch -` is a usage error (`E_USAGE`).
- `-o` and `--patch` must name different files, and neither can be the input file. `--patch -` is standard output, not a file.
- `--json` prints `{ "scene", "status", "hardViolated", "softPenalty", "distance", "moved": [{ "id", "from", "to" }], "conflict", "relations" }`. With `--rotate` it also has `turned`: `[{ "id", "from", "to" }]`, after `moved`. `moved` lists objects whose `pos` changed. `hardViolated` lists the hard relations violated in the proposal, `relations` the results of `relations` for the proposal, `softPenalty` and `distance` are rounded to 6 decimals. For a `conflict` the proposal is the best layout the search found and may break constraints; do not apply it.

| Code | Meaning |
|---|---|
| 0 | `solved`, and every check of the proposal is `pass` or `warn` |
| 1 | `conflict`, or a check of the proposal is `fail` or `skip` |
| 2 | Invalid input or usage |

`solve` is not a patch command: a `solve` line in a patch is a usage error.

## Workflow: relate, solve, patch

1. Read `describe` and `relations` to see the layout and what holds.
2. Add relations with a patch, and apply it:

   ```
   $ cat apart.patch
   # keep the crates apart
   relate crate2 clear_of crate1 min 0.5 hard
   $ isoblock patch yard.scene.json apart.patch -o yard2.scene.json
   patch yard: applied
   + /relations/r3 {"id":"r3","a":"crate2","rel":"clear_of","b":"crate1","min":0.5,"hard":true}
   failing checks: 3
   wrote yard2.scene.json
   ```

3. Let the solver propose positions as a patch: `isoblock solve yard2.scene.json --patch moves.patch` (output above). `isoblock solve yard2.scene.json --patch - | isoblock patch yard2.scene.json -` writes the patch to standard output and applies it in one step. On `conflict`, do not apply the proposal. Move the objects into a rough layout, or solve a subset with `--only`, and solve again. The conflict set is the search's report of what it could not satisfy, not a proof that those relations cannot hold together.
4. Review and apply the proposal like any other patch, so locks are checked and the log records it:

   ```
   $ cat moves.patch
   # solve proposal
   move crate1 u-0.3
   move bench u+0.5 v+0.55
   $ isoblock patch yard2.scene.json moves.patch
   patch yard: applied
   ~ /objects/bench/pos [3.4,2.6] -> [3.9,3.15]
   ~ /objects/crate1/pos [6,0.5] -> [5.7,0.5]
   check c4 clearance: fail -> pass (0.2 -> 0.5)
   check c5 clearance: pass -> pass (1.2 -> 1.75)
   failing checks: 2
   wrote yard2.scene.json
   ```

5. Run `relations` and `check` again. Lock what is settled (`lock crate1 pos`) so later solves keep it.

Use `--only` to move a few objects and keep the rest of a settled layout: `isoblock solve scene.json --only bench,crate1 --patch moves.patch`.

## Export

`isoblock export <scene> --target runtime|gen-bbox|masks [-o out.json|dir]` writes a file, or for `masks` a folder, derived from the scene. The scene file stays the only source of truth: an export never writes back, and `-o` naming the scene file is a usage error. Without `-o` a `runtime` or `gen-bbox` file goes to stdout; `masks` requires `-o <dir>`. With `-o` the command prints `wrote <path>`. JSON files use the saved format (two-space indentation, one final newline), and the same scene gives the same bytes. `export` exits 0 when it completes, even if checks fail; it writes drafts too, so a game build decides which `meta.status` it accepts.

| Usage error (exit 2) | Message starts |
|---|---|
| no `--target` | `export needs --target runtime, gen-bbox or masks` |
| `--target godot`, `phaser` or `tiled` | `export target '<name>' is not scheduled` |
| another name | `unknown export target '<name>'` |
| `--bbox-units` or `--bbox-order` with `runtime` or `masks` | `--bbox-units applies to the gen-bbox target only` |
| `--state` with `runtime` | `--state applies to gen-bbox and masks: the runtime file carries all states` |
| `--grow` with `runtime` or `gen-bbox` | `--grow applies to the masks target only` |
| `masks` without `-o` | `export --target masks needs -o <dir>` |
| `--grow` not an integer from 0 to 64 | `--grow must be an integer from 0 to 64` |

### `--target runtime`

The layout an engine needs, as `isoblock-runtime/3`: a reduced copy of the scene with no relations, checks, locks, assumptions or generation hints, plus the screen vectors, the sprites of every object and the states of the scene.

```
$ isoblock export yard.scene.json --target runtime -o yard.runtime.json
wrote yard.runtime.json
```

Top-level keys, in this order: `schema`, `scene` (the scene id), `meta` (`version` and `status`, `null` when the scene has no `meta`), `units`, `camera`, `projection`, `cameraDir`, `frame` (`w`, `h`, `regions` with `blocksScene` always present), `strips`, `objects`, `zones`, `lanes`, `states`, then the scene's top-level `x-` keys. Entries of `units`, `strips`, `zones` and `lanes` are copied with their `x-` keys; an absent list is `[]`. Heights keep the form they have in the scene: a zone without `h` is at 0, and a lane point without a third number is at the lane's `h` (default 0).

Each object, in file order (output of `yard`, one line each):

```
{"id":"tree","type":"tree","pos":[3,0.2],"rot":0,"base":0,"footprint":[3,0.2,4.2,1.4],"tags":["static"],"parts":[{"id":"trunk","box":[3.45,0.65,0,3.75,0.95,1.4],"order":1},{"id":"canopy","box":[2.8,0,1.4,4.4,1.6,2.4],"order":2}],"anchors":[],"sprites":[{"key":8.8,"footprint":[3,0.2,4.2,1.4],"pieces":[{"part":"trunk","box":[3.45,0.65,0,3.75,0.95,1.4]},{"part":"canopy","box":[2.8,0,1.4,4.4,1.6,2.4]}]}]}
{"id":"bench","type":"bench","pos":[3.4,2.6],"rot":0,"base":0,"footprint":[3.4,2.6,4.6,3],"tags":[],"parts":[{"id":"body","box":[3.4,2.6,0,4.6,3,0.5],"order":3}],"anchors":[{"id":"seat1","at":[3.7,2.8,0.5],"facing":"back","kind":"seat"}],"sprites":[{"key":12.8,"footprint":[3.4,2.6,3.8,3],"pieces":[{"part":"body","box":[3.4,2.6,0,3.8,3,0.5]}]},{"key":13.6,"footprint":[3.8,2.6,4.2,3],"pieces":[{"part":"body","box":[3.8,2.6,0,4.2,3,0.5]}]},{"key":14.4,"footprint":[4.2,2.6,4.6,3],"pieces":[{"part":"body","box":[4.2,2.6,0,4.6,3,0.5]}]}]}
```

- `camera` is the scene's camera in its form, with defaults written (`verticalScale` 1, or `direction` 45), then its `x-` keys. `projection` is `{ axisU, axisV, up }`, the screen vectors of SPEC section 5, each component rounded to 9 decimals. Engines project with those vectors and `camera.origin`.
- `base` is the base height (the third number of `pos`, else 0). `footprint` is `[u0, v0, u1, v1]` after rotation. `parts[].box` and `anchors[].at` are in world units after rotation, raised by `base`. A type without parts has one part, `body`. `facing` and `kind` appear only when the type gives them. An object's `x-` keys follow `sprites`.
- `order` is the part's place in the painter's order (SPEC section 13.4): 0 is drawn first. It is computed for all parts of all objects together, so a part of one object can sit between two parts of another (the canopy of a tree in front of an actor, the actor in front of the trunk). An adapter that draws parts instead of sprites uses it as the draw order and does not sort static objects. `render` and the editor draw in the same order.
- Numbers the tool computes (footprints, boxes, anchors, keys) are rounded to 6 decimals; `pos` and `base` are copied. `cameraDir` is the camera direction of SPEC section 5 with each component rounded to 9 decimals (`[1, 1, 1]` for true isometric, and `(0, 0, 1)` at elevation 90).
- `sprites` are the items an engine sorts and draws (see [Sprites and slices](#sprites-and-slices)); the bench above is cut into 3.
- `states` has one entry per state, in file order, as `{ "hide", "hideParts", "hideRegions" }` (`[]`, `{}` and `[]` when absent), then the state's `x-` keys. It is `{}` when the scene has none. The file carries every state, so `export --target runtime` takes no `--state`.

#### Upgrade from `isoblock-runtime/2`

Stages 7 to 11 wrote `isoblock-runtime/2`: the same file without `projection`, `base`, the view form, `hideParts`, `hideRegions` and every `x-` key. For a scene without base heights whose camera has `|cu| = |cv|`, the keys and slices are the same. Export again with `isoblock export <scene> --target runtime` and ship the new file. An adapter that reads `isoblock-runtime/3` rejects `/2` and `/1` (`E_SCHEMA`). Project with `projection` and `camera.origin`. Read `base` for the pivot height, `hideParts` and `hideRegions` in `apply_state`, and pass a base height to `sort_key` for an actor that stands above the ground. See `CHANGELOG.md`.

### Sprites and slices

A **sprite** is what an engine draws and sorts as one item: a whole object, or one slice of a long object. Every object has at least one sprite in `sprites`, listed in ascending order along the object's long axis; the sprite list of the file is the objects in file order with their sprites in that order.

- **Key.** The sort key of a footprint `[u0, v0, u1, v1]` at base height b is `cu * (u0 + u1) + cv * (v0 + v1) + 2 * b` with `c` the `cameraDir` of the file, rounded to 6 decimals. It is twice the depth of the footprint's center at that height. A larger key is closer to the camera. An object's sprites use its base height. An actor's key uses the height it stands on.
- **Slices.** Weight the footprint by the camera: `W = w * |cu| / m` and `D = d * |cv| / m`, with m the larger of `|cu|` and `|cv|`. When m is 0, or `|W - D|` is at most 1e-9, or W or D is at most 1e-9, the object is one sprite. Otherwise it is cut along the long weighted side into the number of slices that brings that side closest to the short one (at most 64; a tie keeps the smaller number). When `|cu| = |cv|`, W and D are the footprint's own width and depth, so the slices are those of earlier stages. The `bench` above is 1.2 x 0.4 under a true-isometric camera, so it has 3 slices of 0.4 x 0.4.
- **Pieces.** `pieces` are the part boxes cut to the slice, listed in the painter's order of their parts (`order`), so drawing them in list order gives the right result within a sprite. The first slice reaches to minus infinity and the last to plus infinity along the long axis, so a part that sticks out of the footprint (an awning) stays with the end slices. A piece no longer than 1e-9 along the long axis is left out.

**The engine rule:** draw sprites in ascending `key`. On equal keys, draw scene sprites in the order of the sprite list, and actors (characters and vehicles that the game adds) after them. An actor's key is the key of its footprint. Draw the pieces of a sprite in list order. The Godot adapter draws by this rule (see [Godot adapter](#godot-adapter)). Static parts keep their `order` for an adapter that draws parts instead of sprites; such an adapter cannot place a moving actor correctly.

One key per sprite is exact next to a square footprint only. Where it is not, `sort_consistency` measures the error (see above).

### `--target gen-bbox`

One screen box per object for image-generation tools that place objects by boxes, as `isoblock-genbbox/1`:

```
$ isoblock export yard.scene.json --target gen-bbox --bbox-units norm1000 --bbox-order yxyx | head -22
{
  "schema": "isoblock-genbbox/1",
  "scene": "yard",
  "frame": {
    "w": 1000,
    "h": 1000
  },
  "units": "norm1000",
  "order": "yxyx",
  "boxes": [
    {
      "id": "tree",
      "type": "tree",
      "box": [
        220,
        383,
        488,
        605
      ],
      "clipped": false,
      "hint": "young tree with a round canopy"
    },
```

- `box` is the screen bounds of every corner of every part of the object, cut to the frame. An object that is outside the frame (nothing left of its box) is not listed. `clipped` is `true` when the frame cut the box. `hint` is the type's `genHint`; it is left out when the type has none. Boxes follow the order of the objects in the scene. `gen-bbox` has no groups; [`masks`](#masks-and-visibility) groups objects by tag.
- `--bbox-units px` (default) gives pixels rounded to 2 decimals; `norm1000` gives `x * 1000 / frame width` and `y * 1000 / frame height` as whole numbers, halves rounded up.
- `--bbox-order xyxy` (default) gives `[x0, y0, x1, y1]`; `yxyx` gives `[y0, x0, y1, x1]`.
- `--state NAME` leaves out the objects that state hides (see [States](#states)): `walk.scene.json --state open` has no box for `barrier1`. The other boxes are the same as without a state.
- Generation never writes back to the scene file. A tool that measures a generated image against the boxes is outside this project.

## Masks and visibility

One raster of the objects answers two questions. Image generation by layers needs, per object and per tag, the shape on the screen and the part that is not covered, so a picture can be cut into layers and a layer can be kept in front of a walking area. Layout work needs to know how much of each object shows in a frame region, and how much of that region the objects cover. Both read the same raster.

The raster is `ceil(frame.w)` by `ceil(frame.h)` pixels, one pixel per frame unit. Each pixel takes the object of the last drawn part whose outline contains the pixel center, in the painter's order of the state. A part's outline is the convex hull of its eight projected corners, snapped to 1/256 px, filled by the top-left rule. Ground, lanes, zones, regions and labels do not take pixels: a region with `blocksScene` covers no object. An object's **full mask** is every pixel inside one of its drawn parts, whether or not something is drawn over it. Its **visible mask** is the pixels the raster gives to it. A tag group's masks are the unions of its objects' masks. Hidden objects and hidden parts are not drawn. The same scene and state give the same pixels.

Masks cover the parts' boxes, not the art drawn inside or past them. `--grow` adds a band of pixels (Chebyshev distance, at most 64) so the art has room for detail the block does not show.

### `export --target masks`

```
isoblock export plaza.scene.json --target masks -o plaza-masks --state closed --grow 2
```

`-o` is the folder. It is created when missing. The command replaces the files it writes and leaves other files in the folder alone. `--state` draws that state. `--grow` defaults to 0. `--bbox-units` and `--bbox-order` belong to `gen-bbox` and are usage errors here.

- `labels.png`: a 16-bit grayscale image of the whole frame. A pixel holds the 1-based position of its object in the scene file, so the numbers are the same in every state; 0 is no object. It is never grown. A scene of more than 65,535 objects cannot be written this way (`E_USAGE`).
- `full/<index>.png` and `visible/<index>.png`: 8-bit grayscale, 255 in the mask and 0 elsewhere, cropped to the box of the grown full mask. Written for each object that has a full pixel. `<index>` is the same number as in `labels.png`. The visible image uses that same box.
- `groups/full/<n>.png` and `groups/visible/<n>.png`: the same for each tag group that has a full pixel. `n` is 1, 2, … in the order of `groups`.
- `masks.json` (`isoblock-masks/1`), in the saved format. `frame` is the raster size. `state` is `null` without `--state`. `objects` lists every object of the file, in file order; `full`, `visible` and `share` are `null` for a hidden object and for an object with no full pixel. `pixels` counts the mask before growing, over the whole raster. `share` is visible pixels divided by full pixels, rounded to 6 decimals. `groups` has one entry per tag, in order of first appearance (objects in file order, each object's tags in its order). `ids` lists every object with that tag, hidden objects included. The group's pixels are those of its drawn objects.

The PNGs are not interlaced. Filters and compression are free, so compare pixels, not bytes. This build writes the same bytes for the same input.

Use the masks to cut objects out of a generated picture, to place them in drawing order, and to keep a layer of the objects that stand in front of a walking area. `labels.png` names the object of each pixel without a separate file per object.

### `visibility`

```
isoblock visibility plaza.scene.json --region focus --json
```

Reports how much of each drawn object shows in a frame region, and how much of the region the objects cover. Without `--region` the region is the whole raster. An unknown region, and a region the state hides, are usage errors (`E_USAGE`). The command exits 0 when it completes.

`--json` prints `{ scene, state, region, objects, tags }`. `region` has `id` (`null` without `--region`), `pixels`, `covered` and `share` (covered divided by pixels). `objects` lists the drawn objects with at least one full pixel in the region, in file order: `full`, `visible`, `share` (visible divided by full) and `cover` (visible divided by the region's pixels). `tags` has one row per tag of those objects, in order of first appearance. `ids` are the listed objects with that tag. `full` is the union of their full masks in the region. `visible` is the sum of their visible pixels. Shares are rounded to 6 decimals. Regions use half-open pixel ranges, so two regions that share an edge share no pixel.

Use it to see which objects are hidden behind others in a frame region, and how full that region already is, before deciding what can go.

### `occluders`

```
isoblock occluders plaza.scene.json --actor 0.5,0.5,1.7 --lane walk --step 0.25 --json
```

Lists the objects that hide part of a moving actor somewhere in a walkable area: what a game or an artist draws on a layer in front of the actors there. Give exactly one of `--lane` and `--zone`. `--actor` is `w,d,h`, three numbers above 0. `--step` defaults to 0.25 and must be above 0.

The area of a lane is the union of its pieces. A point in a piece stands at that piece's surface height, so an actor climbs a ramp or a stair; when two pieces cover the point, the first along the lane wins. A flat lane reports that one height as `level`; a lane that is not flat reports `level: null`. A lane with no piece is a usage error. The area of a zone is its polygon, at the zone's height; the zone needs 3 points or more. A position is a grid center that lies in the area, not in a blocked zone of the level at that point, and whose actor box overlaps no drawn object's box. At each such position an object hides the actor when one of its drawn parts, whose box does not intersect the actor box, is drawn after the actor by the painter's order and the two outlines overlap. This is the geometric order, not the engine's one key per sprite: a flat mat in front of the actor's feet and a deck under an actor standing on it are not occluders. Where `sort_consistency` finds no mismatch, the engine draws the same objects over the actor.

`--json` prints `{ scene, state, area, actor, step, positions, occluders }`. `area` is `{ kind, id, level }` with `kind` `lane` or `zone`. `positions` is how many grid positions were used. `occluders` lists, in file order, each object that hides the actor at one position or more, with that count and the largest overlap of one of its parts with the actor, in px squared rounded to 2 decimals. An unknown lane or zone, a lane with no piece, a zone of fewer than 3 points, a bad actor size, and a grid of more than 1,000,000 points (the message asks for a larger `--step`) are usage errors. The command exits 0 when it completes.

### `visible_share`

The check form of the same raster. Exactly one of `ids` (object ids) and `tag` is set. `min` is required, from 0 to 1. `region` is an optional frame region; without it the region is the whole raster. The examined objects are the listed ones that are drawn and have at least one full pixel in the region. An object's share is its visible pixels in the region divided by its full pixels there. It fails when that share is below `min`. `value` is the smallest share of the examined objects, rounded to 6 decimals. `ids` are the failing objects, in file order, and `shares` their shares in that order (`[]` when none fails). No examined object is `skip`, with a message that no listed object is drawn in the region. A region the state hides is `skip`, as `in_region`. A tag that no object carries is `skip`, not a schema error. One raster per state serves every `visible_share` check of a run.

In `compare` the row is `visible_share <check id> (% shown)` and the cell is the value as a whole percent, halves up. In the editor the row waits for the end of a drag, like `reachable` and `sort_consistency`, because it rasterizes the frame.

## Godot adapter

`adapters/godot/` holds a GDScript adapter for Godot 4.7 (Compatibility renderer). It reads the runtime file and builds a `Node2D` tree with the same projection as `render`, and draws the sprites of the file by the engine rule of SPEC 13.4. Games add their moving objects (actors) through it, switch states with it, and can replace the debug boxes with their own scenes per type. It is not npm code and imports nothing from `src/`.

### Setup

Copy `adapters/godot/isoblock_runtime.gd` into the game project (for example to `res://isoblock/`), and ship the runtime file of an approved scene next to the game data:

```
isoblock export yard.scene.json --target runtime -o game/data/scenes/yard.json
```

Release builds should load only files whose `meta.status` is `approved`; the file carries the status and the game decides. To change the layout, edit the scene file and export again: the engine never edits what the scene file owns.

### Loading

```gdscript
extends Node2D

const Runtime := preload("res://isoblock/isoblock_runtime.gd")

var root: Node2D


func _ready() -> void:
	var loaded := Runtime.load_file("res://data/scenes/yard.json")
	if loaded["code"] != "":
		return
	# The game's art per type (these paths are examples); other types are drawn as debug boxes.
	var scenes := { "bench": preload("res://art/bench.tscn"), "tree": preload("res://art/tree.tscn") }
	var built := Runtime.build(loaded["data"], func(object: Dictionary) -> Color: return Color.from_hsv(float(object["id"].hash() % 360) / 360.0, 0.5, 0.9), scenes)
	if built["code"] != "":
		return
	if built["unmapped"].size() > 0:
		push_warning("drawn as debug boxes: %s" % [built["unmapped"]])
	root = built["root"]
	add_child(root)
	Runtime.apply_state(root, "closed")
	Runtime.add_actor(root, "hero", [0.4, 0.4, 1.2], [2.7, 1.7], preload("res://art/hero.tscn").instantiate())


func walk_to(at: Array) -> void:
	Runtime.move_actor(root, "hero", at)
```

The same script is available as the global class `IsoblockRuntime` once Godot has scanned the project. Ran with Godot 4.7.1 on the `yard` file (debug boxes, no `scenes`): 5 objects, 7 sprites, 2 lanes, `Objects/bench/seat1` at (362.35, 520) with `kind` `seat`; the sprites in draw order have the keys 7.34 (the object `actor`), 8.8 (`tree`), 12.8, 13.6, 14.2, 14.4 and 15.8; `apply_state(root, "closed")` hides `bench`; an actor added at (2.7, 1.7) has the key 8.8 and is drawn right after `tree`.

**Functions** (all static; errors come back as `{ code, message }` with an empty `code` on success, and are also printed):

- `load_file(path)` returns `{ data, code, message }` (`E_IO`, `E_JSON_PARSE`).
- `build(data, color_of, scenes)` returns `{ root, code, message, unmapped }`. `color_of` (optional) takes the object's dictionary and returns the flat `Color` of its debug faces. `scenes` (optional) maps type names to `PackedScene`s. `unmapped` lists the types of the file's objects that `scenes` lacks, each once, in the order of their first object, and `[]` when `scenes` is empty; those types are drawn as debug boxes. On an error nothing is built and `root` is null. `check(data)` validates without building.
- `apply_state(root, name)` shows every object and part, then hides the objects in `states.<name>.hide` and the parts in `hideParts`, with their sprites and anchors. An object whose every part is hidden is hidden as by `hide`. In the debug drawing the polygons of a hidden part are hidden; in an instance, every descendant whose meta `part` equals a hidden part id is hidden, and nodes without `part` stay. It sets the root's meta `hidden_regions` to `hideRegions` (`[]` for `""`). `""` shows everything. An unknown name is `E_STATE` and changes nothing. Actors are not affected.
- `add_actor(root, id, size, at, node, color)` adds a moving object of `size` `[w, d, h]` whose footprint is centered on `at`. `at` is `[u, v]` (standing at height 0) or `[u, v, h]` (standing at height h), or a `Vector2` or `Vector3`. `node` (optional) is the game's node for it, placed at the projection of `at` at the height it stands on. Without a node the actor draws its box in `color`. `move_actor(root, id, at)` moves it and gives it its new place in the draw order; `remove_actor(root, id)` removes and frees it (the game's node too). A duplicate id on `add_actor`, and an unknown id on `move_actor` or `remove_actor`, are `E_ACTOR`.
- A `Vector2` or `Vector3` holds single precision, so its components are read back as the shortest decimal with the same value (4.2, not 4.19999980926514); that keeps the actor's key equal to a sprite's key where the tool says they are equal.
- `sort_key(dir, footprint, base)` is the key of a footprint `[u0, v0, u1, v1]` at base height `base` (default 0) for a camera direction with 9 decimals, such as the file's `cameraDir`. `order_direction(camera)` computes that direction from either camera form. `project(camera, u, v, h)` uses `camera.projection` when the runtime file put it there, else the camera's own form. `project`, `unproject` and `camera_direction` match `tests/golden/projection.json`, its `views` included, within 0.001, and `sort_key` matches `tests/golden/sort.json` and `tests/golden/sort-levels.json`.
- `faces(camera, dir, box)` returns the faces of a box that point toward the camera, as the debug drawing uses them.
- Error codes: `E_SCHEMA` (a `schema` other than `isoblock-runtime/3`, a missing key including `projection`, an object without `sprites`), `E_DUPLICATE_ID` (object, zone or lane ids, or the part or anchor ids of one object), `E_IO`, `E_JSON_PARSE`, `E_STATE`, `E_ACTOR`.

**The tree.** The root is named by the scene id and has four containers:

- `Objects`: one `Node2D` per object, named by its id, with meta `id`, `type`, `rot`, `tags`, `footprint` and `base`. Its children are its anchors: a `Marker2D` named by the anchor id at its projected point, with meta `kind` and `facing`.
- `Sprites`: one `Node2D` per sprite of the runtime file, with meta `object` (the object id), `key` and `slice` (its position in the object's `sprites`). **The child order is the draw order**: ascending key, equal keys in the order of the sprite list (objects in file order, slices in order). Every `z_index` stays 0 and relative, and Godot's y-sort is not used (it treats close keys as equal). A sprite of an unmapped type holds the faces of its pieces that point toward the camera, piece by piece, as `Polygon2D` (antialiasing off, the object's flat color). Actors are children of `Sprites` too, with meta `actor` (the id) and `key` (the key of their footprint): after every scene sprite whose key is at most theirs, before every scene sprite with a larger key, and among actors with equal keys in the order they were added. A moved actor keeps that order among actors of its key.
- `Zones`: one hidden `Polygon2D` per zone, its points projected at the zone's height, and `Lanes`: one hidden `Line2D` per lane, each point projected at its own height, each with its data as meta (`kind`, `points`, and for lanes `dir` and `width` in world units). Gameplay reads zones, lanes and anchors from the meta; the adapter does not move anything.

**Instancing.** A sprite of a mapped type holds an instance of the type's scene, positioned at the object's pivot: the projection of the center of its footprint at its base height. So the origin of the game's scene is that point, and the art is drawn around it in screen pixels (1 pixel per frame unit at scale 1). Instances carry meta `object`, `type`, `rot` and `slice`. An object of one sprite holds its instance directly. Each sprite of a sliced object (a long object, cut into slices so that one key per sprite sorts right next to a moving actor) holds a `Polygon2D` mask, the convex hull of the projected corners of the slice's pieces with `clip_children` set to `CLIP_CHILDREN_ONLY`, and under it its own copy of the instance; each slice shows the part of the image inside its pieces. Art that reaches outside the parts' boxes of a sliced object is cut off, so the parts should follow the art. The adapter does not turn instances: an instance carries the object's `rot` as meta, and the game picks or turns its art for it. To tint an instance, set its `modulate`.

### Test

`npm run test:godot` checks the adapter against the tool. It needs Godot 4.7.1 and Xvfb (or a `DISPLAY`), which are not npm packages: download Godot from the GitHub release `4.7.1-stable`, check the file against that release's `SHA512-SUMS.txt`, keep it outside the repository, and point `GODOT` at it. The export templates in that release are not needed for the tests.

```
GODOT=/opt/godot/Godot_v4.7.1-stable_linux.x86_64 npm run test:godot
```

It builds the tool and runs the adapter's own tests in Godot: golden vectors, the keys of `tests/golden/sort.json` through `sort_key`, the node tree and draw order, `unmapped` and the instances, states, actors and their order on equal keys, and the error codes. A GDScript runtime error in any Godot run counts as a failure. Then it draws, at frame size (1 pixel per frame unit), every case in `tests/fixtures/export/cases.json` once and every case in `tests/fixtures/godot/cases.json` in each of its states in order, and measures each frame against the SVG of `render` (with `--state` for a state; SPEC section 13.6):

- each object alone: the box of its pixels is within 1 pixel of the box of its polygons in the SVG on every edge, the polygons clipped to the frame first;
- the whole frame: at most 100 pixels per 1,000,000 differ in which object they show, compared with a painter's raster of the SVG polygons (a pixel center on an edge goes to the polygon that owns it by the top-left rule);
- `build` returns the case's `unmapped`; the instanced case draws its types from white art colored through `modulate`, each slice clipped by its mask;
- with an actor, at each point of its path (in the last state) the whole frame differs in at most `actorLimit` more pixels than the frame without the actor, against the SVG of the scene with the actor added as its last object (`isoblock-actor`);
- two runs of Godot give identical PNG bytes.

The test prints one line per case and exits 0 only when everything holds. It is not part of `npm test`.
