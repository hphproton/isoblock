# Agent guide

How an AI agent uses IsoBlock. The builder fills each section as commands ship.

Commands in this guide are available now (stage 6): `validate`, `check`, `render`, `describe`, `relations`, `solve`, `patch`, `diff`, `compare`, `export`, and the editor page `dist/editor.html`. Commands from later stages are listed at the end of the Commands section.

## Install and build

Requires Node 20 or newer.

```
npm ci
npm run build
node dist/isoblock.mjs --help
```

`npm run build` writes two files: `dist/isoblock.mjs`, the command line tool, which has no runtime dependencies beyond Node (the PNG renderer is inside it), and `dist/editor.html`, the editor, one self-contained page (see the Editor section). The examples below call the tool as `isoblock`; run it as `node dist/isoblock.mjs`.

Other scripts: `npm test` runs the test suite, `npm run typecheck` runs the TypeScript checker, `npm run test:godot` runs the Godot adapter checks (see [Godot adapter](#godot-adapter); it needs Godot and Xvfb, which are not npm packages).

## Commands

Every command takes a scene file (`*.scene.json`, format `isoblock/1`) and reads it first with the schema and reference checks. If the file is not valid, the command stops with exit code 2 and an error message.

```
isoblock validate <scene.json>
isoblock check    <scene.json> [--json] [--state NAME]
isoblock render   <scene.json> [--state NAME] -o <out.svg|out.png>
isoblock describe <scene.json>
isoblock relations <scene.json> [--json]
isoblock solve    <scene.json> [--only a,b] [-o <proposal.json>] [--patch <moves.patch>] [--json]
isoblock patch    <scene.json> <patch> [-o <out.json>] [--dry-run] [--json]
isoblock diff     <a.json> <b.json> [--json]
isoblock compare  <scene.json> --variant NAME=FILE... [--state NAME] [--format text|md|json]
isoblock export   <scene.json> --target runtime|gen-bbox [-o <out.json>] [--bbox-units px|norm1000] [--bbox-order xyxy|yxyx] [--state NAME]
```

### `validate`

Checks the file against `schema/isoblock-1.json`, then checks references: duplicate ids, object types that do not exist, relation targets, check parameters that name a missing region, strip, zone, lane, object or anchor (`lane:<id>`, `anchor:<object id>/<anchor id>`), states that hide a missing object, and assumption paths that do not resolve in the file. A state may only have `hide` (and `x-` keys).

```
$ isoblock validate yard.scene.json
ok: yard.scene.json is a valid isoblock/1 scene (id yard)
```

On failure, nothing else runs. The message starts with a code, then one line per problem:

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

Runs every check in the scene's `checks` list, in file order.

```
$ isoblock check lane.scene.json
scene lane: 7 checks, 2 pass, 3 fail, 0 warn, 2 skip
FAIL c1 lane_clear: lane L1 blocked by d
PASS c2 lane_clear: lane L1 is clear
PASS c3 lane_reaches: lane L1 meets right edge at y=765.58 (view y 150-1000)
FAIL c4 lane_reaches: lane L2 meets right edge at y=1365.58 (view y 150-1000)
FAIL c5 lane_reaches: lane does not reach edge
SKIP c6 lane_clear: lane "L4" has 3 points; only 2-point lanes are supported
SKIP c7 reachable: the scene has no zone with kind "walkable"
```

`--json` prints `{ "scene": "<id>", "results": [...] }` instead. Each result has `id`, `check`, `status` (`pass`, `fail`, `warn` or `skip`), `value`, `threshold`, `ids` and `message`; `no_overlap` adds `pairs`, `visible` adds `occluders`, `capacity` adds `accepted` and `rejected`; `sort_consistency` adds `worst` and `positions`. Keys are always in this order. `message` is one line meant for people; read `status`, `value` and `ids` instead of parsing it.

`--state NAME` checks the scene as it is in one of its states, with the objects that state hides taken out (see [States](#states)). The summary line then reads `scene walk (state open): ...`; `--json` keeps the same shape. An unknown state name exits 2 (`E_USAGE`) and lists the states the scene has.

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

### `describe`

Prints a compact summary, about 30 to 60 lines, so an agent never has to read the whole file or an image. Exit code 0 even when checks fail. See the next section.

### `relations`, `solve`, `patch`, `diff`, `compare`

Described in their own sections below: [Relations](#relations), [`solve`](#solve), [Patches](#patches), [`diff`](#diff) and [`compare`](#compare). The section [Workflow: relate, solve, patch](#workflow-relate-solve-patch) shows how they work together.

### `export`

Described in [Export](#export) below.

### Not available yet

`--state` belongs to `check`, `render`, `compare` and `export --target gen-bbox`. On any other command it is a usage error (`flag '--state' does not apply to '<command>'`), and so it is with `export --target runtime`: the runtime file carries all states.

Export targets `godot`, `phaser` and `tiled` are not scheduled (the Godot adapter reads the `runtime` file instead). `compare --render` is not scheduled either. The check `state_stable` is not implemented: it returns `skip`.

## Editor

`dist/editor.html` is a page for people (and for agents that drive a browser). Build it with `npm run build`, then open the file in a browser: double-click it or use a `file://` address. It is one file, needs no server and makes no network request. It uses the same code as the command line tool for geometry, projection and checks, so its check results equal `isoblock check`.

### Opening and saving

- **Open**, or drop a scene file on the page, reads the file and validates it like `isoblock validate`. A file that is not valid is not opened; the status line starts with the error code (`E_JSON_PARSE`, `E_SCHEMA` or `E_REF`) and the scene that was open stays open.
- The scene file is the only state. There is no autosave and nothing is kept in the browser: the overlays, the snap step and the view mode are forgotten when the page closes.
- **Save** downloads the scene under the name of the file that was opened (or `<id>.scene.json`). The same scene always gives the same bytes: two-space indentation, keys in the order of the opened file, one final newline. Saving twice gives byte-identical files, and the saved file parses to the same data as the file that was opened. Numbers are written the JSON way, so `2.0` becomes `2`.
- `(unsaved)` next to the file name marks changes since the file was opened or saved. Closing the page then asks for confirmation.
- Keys: Ctrl or Cmd with `S` saves, with `Z` undoes, with `Shift+Z` or `Y` redoes. `Esc` clears the selection and the check highlight.

### Views

- **Isometric** draws the scene with its own camera. **Plan** is top-down: u to the right, v downwards, 40 px per unit; it shows the same objects from above and the frame regions as the ground areas they cover. **Iso**, **Plan** and **Both** in the toolbar choose what is shown; a narrow window starts with Iso only.
- Drag an empty place to pan, use the wheel or two fingers to zoom, and **Fit** to show everything again. A view repaints only when something changed.

### Moving objects

- Drag an object in either view. The pointer is converted to the ground at the height of the object (h is kept), and `pos` snaps to the grid chosen in **Snap** (off, 0.05, 0.1, 0.25, 0.5 or 1). Only `pos` changes. One drag is one undo step.
- A locked `pos` cannot be dragged: the object does not move and the status line names the lock. `pos.u` or `pos.v` blocks that axis only; the object still moves along the other one. Every object with a lock shows a lock icon (dark: `pos` locked; orange with `u` or `v`: one axis; grey: another lock).
- Dragging while a second finger comes down cancels the drag.

### Property panel

Select an object (tap or click it) to see its properties, each with its unit:

- `type`, `pos` (u and v), `rot`, and the size `w`, `d`, `h` of its type. Type the new number and leave the field. A size belongs to the type, so it changes every object of that type.
- Every property has a lock toggle: `pos` (both axes), `pos.u`, `pos.v`, `rot`, `type`, and for each size a JSON Pointer lock `/types/<type>/size/<0|1|2>`. A locked property cannot be changed from the panel, and the status line says why. Locks are saved in the object's `locks` list.
- A yellow `*` marks a number that has an entry in `assumptions` (it is provisional); point at it to read the note and the owner. Editing such a number keeps the entry and updates its `value`.

### Check panel

The checks of the scene run again after every change, and only the checks that involve the changed objects run again (`in_region` and `no_overlap` even measure only the changed objects). Tapping a row highlights its objects in both views; tapping it again, or `Esc`, clears the highlight. Rows show the same status, id and message as `isoblock check`.

Checks that search a grid, `reachable` and `sort_consistency`, are too slow to run on every pointer move. While a drag is going on, their rows keep the last result, are dimmed and say `out of date: runs again when the drag ends`; when the object is dropped (or the drag is cancelled) they run again, so the panel then equals `isoblock check --json` on the saved file. Every other edit (a typed value, a lock, undo, redo, opening a file) runs every check it involves at once.

### Overlays

Toggles for **Frame regions**, **Strips**, **Lanes**, **Zones**, **Anchors** (off by default) and **Object labels**.

### Touch

One finger drags an object or pans; two fingers zoom and pan. Controls are 44 px high on touch screens, and a finger hits an object when it comes within 24 px of it. While a gesture is going on the view is drawn at pixel ratio 1 and made sharp again when the finger lifts, to keep 200 objects at 60 frames per second.

### Driving the editor from a script

The page has a read-only object `window.isoblock` for tests and tools: `scene()`, `text()` (the text `Save` writes), `state()` (file name, selection, highlight, unsaved changes, view mode, and `stale`: the ids of the check rows that are out of date during a drag), `screenOf(view, id)` (page coordinates that hit an object), `viewport(view)`, `lockIcons(view)`, `pixelRatio(view)`, `fit(view)`, `redraw(view)` and `frames` (`start()`, `stop()`, `snapshot()`). It cannot change the scene. The tests in `tests/editor/` use it with `playwright-core` and an installed Chromium.

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

- **Header:** scene id, version and status from `meta`, unit, camera (`iso30`, `dimetric21`, or `u<angleU>/v<angleV>`), pixels per unit, frame size, and the first region that does not block the scene.
- **Object table:** one row per object. `pos` is the footprint's minimum (u, v) corner after rotation. `size` is the type's size `w,d,h` before rotation. `rot` is 0, 90, 180 or 270. `locks` lists locked properties, comma-separated, or `-`.
- **`*`:** a number that has an entry in `assumptions`. It is provisional: ask before relying on it.
- **Check lines:** one per `fail`, `warn` or `skip` check, in `checks` order, with the ids involved. The gameplay checks read `FAIL k3 reachable bench2: path of 3.10 u (max 1.00)`, `FAIL s1 capacity seat: 4 usable < 6 (blocked: ...)`, `FAIL m1 min_screen_size walker1: 126 px < 200 px` and `FAIL s1 sort_consistency shed, box, counter, kiosk: drawn out of order, worst 545.60 px2`. With none, the output says `checks: all N pass` (or `checks: none`).
- **Numbers:** 2 decimals (up to 4 when 2 would lose information), whole pixels after `≈`, whole percentages.
- **Assumptions:** `<type>.size.<w|d|h>`, `<type>.<part>.<u0|v0|h0|u1|v1|h1>`, or the JSON Pointer for other paths. `-` when there are none.

## Check reference

Parameters marked optional can be left out. A check with a wrong or unknown parameter makes the file invalid (`E_SCHEMA`). Tolerance when comparing numbers: `value` 0.01 units, pixel values 1 px.

| `check` | Parameters | Passes when | `value` |
|---|---|---|---|
| `in_region` | `region`; optional `strip`, `ids` | Every footprint corner (projected at height 0) is inside the region rectangle, edges included, and the footprint's v range is inside the strip's v range | Number of failing objects |
| `no_overlap` | optional `ids`, `allow` (pairs, either order) | No two footprints overlap by more than 1e-9 along both axes, except allowed pairs. Touching is not overlap | Number of overlapping pairs |
| `clearance` | `a`, `b`, `min` | Edge-to-edge distance between the two footprints is at least `min` | The distance |
| `lane_clear` | `lane`; optional `ignore` | No object outside `ignore` has a footprint that overlaps the lane | Number of blocking objects |
| `lane_reaches` | `lane`, `edge` (`right`, `left`), `region` | The lane meets the frame edge, and the whole meeting segment lies inside the region's y range | Largest y of the meeting segment, in px. `null` and `fail` when the lane does not reach the edge |
| `visible` | `target`, `maxOccluded`; optional `from` (default 0.55) | The share of the target's camera-facing faces hidden by other objects is at most `maxOccluded` | Occluded fraction, 0 to 1 |
| `reachable` | `from`, `to` (points); optional `area`, `radius` (0.2), `step` (0.1), `ignore`, `max` | A walkable path exists from `from` to `to` on a grid of free cells, and with `max` it is at most that long | Path length in units (moves times `step`). `null` and `fail` when there is no path |
| `capacity` | `kind`, `min`; optional `body` (`[0.5, 0.5]`), `ids`, `allow` (object ids) | At least `min` anchors of `kind` can be used at once | Number of usable anchors |
| `min_screen_size` | `target`, `min` (pixels); optional `screenWidth` (default: the frame width) | The target is at least `min` pixels tall on screen | Pixels |
| `sort_consistency` | `actor` (`[w, d, h]`); optional `step` (0.1), `reach` (1), `maxPixels` (0), `area` (zone id), `ids` | An engine that sorts one key per sprite draws a test actor and the objects in their geometric order, to within `maxPixels` of wrong area for every examined object | Number of examined objects over `maxPixels`. Also `worst` (px squared) and `positions` |

Notes:

- `ids` in a result: failing objects (`in_region`), involved objects sorted alphabetically (`no_overlap`), blocking objects (`lane_clear`), `[a, b]` in file order (`clearance`), `[lane]` (`lane_reaches`), `[target]` (`visible`).
- `visible` samples the top face and the side faces from `from` times the height up to the full height, 64 points per face, and casts a ray toward the camera from each point through the parts of every other object. `occluders` lists the objects that hide at least one point.
- Footprints always use the type's `size` rectangle, even when parts stick out. Parts matter for `visible` and for drawing.
- **`lane_clear` and `lane_reaches` support one lane shape:** exactly 2 points, parallel to u or v. Other shapes return `skip`. `lane_reaches` also returns `skip` for the `top` and `bottom` edges.
- **`skip` is not a pass.** It means the tool could not evaluate the check: the check is not implemented in this stage (`state_stable`), or its input has an unsupported shape (for example `reachable` in a scene with no walkable zone), or the check names an object that the chosen state hides. A skipped check has `value: null` and `threshold: null`, and `check` exits 1.

### The gameplay checks

A point in `reachable` is `[u, v]`, `lane:<id>` (the first point of the lane for `from`, its last point for `to`) or `anchor:<object id>/<anchor id>` (the anchor's ground point after rotation; its height is ignored).

**`reachable`** walks a grid:

- **Walkable area:** the polygon of the zone named by `area`, else every zone with `kind: "walkable"`; with neither, `skip`. Zones with `kind: "blocked"` are cut out.
- **Grid:** the cell (i, j) has its center at `((i + 0.5) * step, (j + 0.5) * step)`. A cell is free when its center is in the walkable area (the boundary counts as inside), not in a blocked zone, and at least `radius` away from the footprint of every object, except the objects in `ignore` and the objects whose anchors `from` and `to` name.
- **Start and target** are the free cells nearest to the points (ties: smaller i, then smaller j). If that cell is farther than `step` from the point, the check fails with `start is not on walkable ground` or `target is not on walkable ground`.
- **Path:** the fewest moves between free cells that share an edge; the value is moves times `step`. No path: `fail`, `value: null`, `no walkable path`. With `max`, a longer path fails and keeps its value.
- `ids` are the objects whose anchors `from` and `to` name. A gap close to `step + 2 * radius` wide may open or close as the grid shifts: use a smaller `step` where it matters. A grid of more than 4,000,000 cells is not evaluated (`skip`): use a larger `step`.

**`capacity`** counts seats and the like. Candidates are the anchors with the given `kind`, objects in file order and anchors in type order (`ids` limits the objects). The body of a candidate is a rectangle `body` (`[w along u, d along v]`, never rotated) centered on the anchor's ground point. In order, a candidate is accepted when its body overlaps neither the footprint of another object (except those in `allow`) nor the body of a candidate accepted before. `accepted` and `rejected` list `<object id>/<anchor id>` labels.

**`min_screen_size`** projects the 8 corners of every part of the target and takes the height of their screen bounds, times `screenWidth / frame.w` (so a scene drawn at 1000 px wide can be checked as if the screen were 1920 px wide).

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

A state is a named set of hidden objects (tents put up for an event, a closed gate):

```json
"states": { "open": { "hide": ["barrier1"] }, "empty": { "hide": ["walker1", "rock1"] } }
```

A state only hides objects (and may carry `x-` keys); states that move objects are not scheduled. `--state NAME` works on `check`, `render`, `compare` and `export --target gen-bbox`; without it every object is present. In a state:

- hidden objects are not drawn, get no generation box, and do not overlap, block, occlude or count anywhere (lanes, paths, seats, rays);
- a check that names a hidden object by itself is `skip` (`clearance` `a` or `b`, the `target` of `visible` and `min_screen_size`, an anchor in `reachable` `from` or `to`), with a message that says which object and which state;
- the lists `ids`, `allow` and `ignore` of a check lose the hidden objects; a list that loses all of them checks no object (it does not fall back to all objects);
- `sort_consistency` gives hidden objects no sprites and no positions, and does not examine them.

Usage errors (exit 2, `E_USAGE`): a state name the scene does not define (the message lists the states it has), and `--state` with `export --target runtime`: the runtime file carries all states.

`compare --state NAME` evaluates every column in the state and names it in the header (`compare walk · state open · base vs A, B`). The hidden objects are those the **base** scene's state lists, in every column, as every column runs the base's checks; hidden objects are not counted as moved.

## Patches

Agents do not rewrite scene files. They send a small patch, and the tool applies it, checks the locks, and reports what changed. The loop for an agent: `describe` the scene, write a patch, run `patch --dry-run --json`, read the report, and run `patch` again without `--dry-run` once the report is what you want.

```
isoblock patch <scene.json> <patch> [-o <out.json>] [--dry-run] [--json]
```

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
| `move <id> <u±n> [<v±n>]` | Adds to `pos`. Each axis at most once, in either order, with a sign: `move bench u-0.5 v+0.2`, `move bench v+1` |
| `rot <id> <0\|90\|180\|270>` | Sets `rot` and recomputes `pos` so that the footprint keeps its center |
| `set <pointer> <value> [note="<text>"]` | Replaces the value at an existing JSON Pointer. The value is read as JSON, else as a string (`2.5`, `true`, `"[1, 2]"`, `approved`). `note=` replaces the `note` of the assumption with that `path`; it is an error when there is none |
| `lock <id> <lock>...` | Adds the locks the object does not have yet: `pos`, `pos.u`, `pos.v`, `rot`, `type`, or a JSON Pointer |
| `relate <a> <rel> <b> [gap <min>..<max>] [axis <u\|v>] [t <min>..<max>] [min <n>] [hard] [weight <n>] [id=<id>] [source="<text>"]` | Appends a relation. `hard` is always written (`false` when not given). Without `id=` the id is the first free `r1`, `r2`, ... |
| `solve ...` | Not a patch command: a patch that contains it is invalid with `E_USAGE`. Run `isoblock solve --patch` and apply the patch it writes |

- There is no `unlock`: people remove locks in the editor or in the file.
- `move` and `rot` round the coordinates they compute to 6 decimals. `rot` leaves `pos` as it is when the footprint keeps its shape (0 to 180).
- `relate` does not check its names: an unknown object in `a` or `b` is `E_REF` and an unknown relation name is `E_SCHEMA`, both reported after the patch applied.
- After the last command, every `assumptions[].value` is set to the value its `path` points to. A provisional number stays provisional: only a person removes the entry.

### Locks

A patch **touches a lock** when, compared with the original scene, any of these happens (only locks of the original scene count):

- a locked value changes: `pos`, `pos.u` (the first number of `pos`), `pos.v`, `rot`, `type`, or the value at a JSON Pointer, including when it appears or is removed;
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
isoblock compare <scene.json> --variant NAME=FILE... [--format text|md|json]
```

Compares the scene with 1 to 4 variants by measured values. It does not choose: it separates what is measurable from what needs judgment (balance, feel, gameplay intent), and a person decides.

- A variant is a patch file or another scene file (a JSON file whose first character is `{`). Names must be unique and cannot be `base`. Columns are in the order given, base first.
- Each variant is applied to a copy of the base. **Locks are ignored but recorded**: a variant that touches a lock is marked, not stopped. A variant that is malformed or gives an invalid scene stops the command with exit code 2.
- **Every column runs the checks of the base scene**, so the columns are comparable. A variant that changes `checks` is compared under the base's checks.
- The label of a variant is the first comment line of its patch, else its name. `--state NAME` evaluates every column in that state (see [States](#states)); `--render` is not scheduled.
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
- One row per check that fails or is skipped in some column, or whose value differs from the base in some column, in the order of `checks`. The label names the check and its unit: `in_region <region>[/<strip>] (objects outside)`, `no_overlap (pairs)`, `clearance <a>×<b> (<unit>)`, `lane_clear <lane> (blocking objects)`, `lane_reaches <lane> (y px)`, `visible <target> (% occluded)`, `reachable <check id> (<unit>)`, `capacity <check id> (usable <kind>)`, `min_screen_size <target> (px)`, `sort_consistency <check id> (objects out of order)`; other checks show as `<check> <id>`.
- Cells: counts as integers, clearance with 2 decimals, `lane_reaches` in whole pixels (`none` when the lane does not reach the edge), `visible` in whole percent, `reachable` with 2 decimals (`none` when there is no path), `capacity` and `sort_consistency` as integers, `min_screen_size` in whole pixels (halves up), `skip` for a skipped check. A trailing ` ✗` marks a value whose status is `fail` or `skip`.
- `objects moved / total`: objects present in both scenes whose `pos` differs, and the sum of their ground distances.

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
- Targets in `a` and `b`: an object id, `zone:<id>`, `lane:<id>`, or a strip edge `strip:<id>.v0` / `strip:<id>.v1`.
- Every relation is measured on the ground (height 0) with the footprints, and gives a **violation** of 0 or more: `satisfied` when it is at most 1e-6, else `violated`. A relation the tool cannot measure is `skip`, with `violation: null` and a message that says why. **A skipped hard relation is not satisfied.**

| `rel` | `a` | `b` | Parameters (default) | Violation |
|---|---|---|---|---|
| `left_of`, `right_of` | object | object | `gap [min, max]` (0 to unbounded) | How far the screen-x separation of the two footprints is outside `gap` |
| `in_front_of`, `behind` | object | object | `gap` (0 to unbounded) | The same for the ground-depth separation (toward the camera) |
| `gap` | object | object | `gap` (0 to unbounded) | The same for the edge-to-edge distance (as `clearance`) |
| `against` | object | object, `lane:<id>` or `strip:<id>.v0\|v1` | `gap` (`[0, 0]`) | The same for the distance to the target |
| `inside` | object | `zone:<id>` | | The largest distance of a footprint corner outside the zone |
| `aligned` | object | object | `axis` `u` or `v` (required) | The difference of the footprint centers along the axis |
| `facing` | anchor | object or point | | Not measured yet: always `skip` |
| `on_lane` | object | `lane:<id>` | `t [min, max]` (`[0, 1]`) | The distance of the center from the lane beyond half the lane width, plus the lane length times how far its position along the lane (0 at the first point, 1 at the last) is outside `t` |
| `clear_of` | object | object or `lane:<id>` | `min` (0) | How much the distance is below `min`, plus the overlap when the footprints overlap |
| `order_along` | | | `ids` (2 or more objects), `axis` (`u`) | The sum of the backward steps of consecutive centers along the axis |

Notes:

- "Left", "right", "in front" and "behind" are seen from the viewer and follow the camera: screen x is `u cos(angleU) + v cos(angleV)` and depth grows toward the camera. A separation is the gap between the two footprints (for `left_of`: the smallest screen x of `b` minus the largest of `a`), so it is negative when they overlap on screen.
- **Distance to a lane** (`against`, `clear_of`) uses the lane rectangle, as `lane_clear` does: only 2-point lanes parallel to u or v; other lanes give `skip`. `on_lane` follows the whole polyline of any lane longer than 0.
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
isoblock solve <scene.json> [--only a,b] [-o <proposal.json>] [--patch <moves.patch>] [--json]
```

Proposes positions that meet the relations. It **never writes the input file**: it proposes, and a person or agent accepts the proposal by applying its patch.

- **What moves:** every object without a `pos` lock, or only the objects named in `--only` (comma-separated ids; an unknown id is a usage error). A `pos.u` or `pos.v` lock fixes that coordinate, and so does a JSON Pointer lock on the position (`/objects/3/pos/0`, or a pointer that contains it). The solver never changes rotation, type or sizes and never edits relations.
- **Constraints:** a moved footprint keeps its 4 corners inside the view region (the first frame region without `blocksScene`, edges included) and does not overlap another footprint, unless the two overlapped before. An object that does not move is not constrained.
- **Grid:** every coordinate the solver changes is a multiple of 0.05. A coordinate it does not change keeps its exact value.
- **Objective, in this order:** every hard relation satisfied and every constraint met; then the smallest soft penalty; then the smallest total ground distance moved.
- **Deterministic:** the same file gives the same output, byte for byte.
- **Outcome:** `solved` when every hard relation that is not skipped is satisfied and the constraints hold. Otherwise `conflict`, with a **minimal conflict set**: the hard relations that cannot hold together. To find it, the solver starts from all hard relations and, in file order, drops each one without which it still finds no solution. Remove or relax one relation of the set (or a lock) and solve again. Every relation in the set is needed: without it, the solver found a solution for the rest. The set relies on the solver, though: when a search misses a solution, the set can, rarely, hold together after all.

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
- `--patch <moves.patch>`: the proposal as short commands: the line `# solve proposal`, then one `move` per moved object, in object order (an axis without an offset is left out). `patch` applies it with lock checks and the log, and gives the same file as `-o`.
- `-o` and `--patch` must name different files, and neither can be the input file.
- `--json` prints `{ "scene", "status", "hardViolated", "softPenalty", "distance", "moved": [{ "id", "from", "to" }], "conflict", "relations" }`: `hardViolated` lists the hard relations violated in the proposal, `relations` the results of `relations` for the proposal, `softPenalty` and `distance` are rounded to 6 decimals. For a `conflict` the proposal is the best layout found and may break constraints; do not apply it.

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

3. Let the solver propose positions as a patch: `isoblock solve yard2.scene.json --patch moves.patch` (output above). On `conflict`, change the relations in the conflict set and solve again.
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

`isoblock export <scene> --target runtime|gen-bbox [-o out.json]` writes a file derived from the scene. The scene file stays the only source of truth: an export never writes back, and `-o` naming the scene file is a usage error. Without `-o` the file goes to stdout; with `-o` the command prints `wrote <path>`. Both files use the saved format (two-space indentation, one final newline), and the same scene gives the same bytes. `export` exits 0 when it completes, even if checks fail; it writes drafts too, so a game build decides which `meta.status` it accepts.

| Usage error (exit 2) | Message starts |
|---|---|
| no `--target` | `export needs --target runtime or gen-bbox` |
| `--target godot`, `phaser` or `tiled` | `export target '<name>' is not scheduled` |
| another name | `unknown export target '<name>'` |
| `--bbox-units` or `--bbox-order` with `runtime` | `--bbox-units applies to the gen-bbox target only` |
| `--state` with `runtime` | `--state applies to the gen-bbox target only` |

### `--target runtime`

The layout an engine needs, as `isoblock-runtime/2`: a reduced copy of the scene with no relations, checks, locks, assumptions or generation hints, plus the sprites of every object and the states of the scene.

```
$ isoblock export yard.scene.json --target runtime -o yard.runtime.json
wrote yard.runtime.json
```

Top-level keys, in this order: `schema`, `scene` (the scene id), `meta` (`version` and `status`, `null` when the scene has no `meta`), `units`, `camera` (`verticalScale` always present), `cameraDir`, `frame` (`w`, `h`, `regions` with `blocksScene` always present), `strips`, `objects`, `zones`, `lanes`, `states`. Entries of `units`, `strips`, `zones` and `lanes` are copied without their `x-` keys; an absent list is `[]`.

Each object, in file order (output of `yard`, one line each):

```
{"id":"tree","type":"tree","pos":[3,0.2],"rot":0,"footprint":[3,0.2,4.2,1.4],"tags":["static"],"parts":[{"id":"trunk","box":[3.45,0.65,0,3.75,0.95,1.4],"order":1},{"id":"canopy","box":[2.8,0,1.4,4.4,1.6,2.4],"order":2}],"anchors":[],"sprites":[{"key":8.8,"footprint":[3,0.2,4.2,1.4],"pieces":[{"part":"trunk","box":[3.45,0.65,0,3.75,0.95,1.4]},{"part":"canopy","box":[2.8,0,1.4,4.4,1.6,2.4]}]}]}
{"id":"bench","type":"bench","pos":[3.4,2.6],"rot":0,"footprint":[3.4,2.6,4.6,3],"tags":[],"parts":[{"id":"body","box":[3.4,2.6,0,4.6,3,0.5],"order":3}],"anchors":[{"id":"seat1","at":[3.7,2.8,0.5],"facing":"back","kind":"seat"}],"sprites":[{"key":12.8,"footprint":[3.4,2.6,3.8,3],"pieces":[{"part":"body","box":[3.4,2.6,0,3.8,3,0.5]}]},{"key":13.6,"footprint":[3.8,2.6,4.2,3],"pieces":[{"part":"body","box":[3.8,2.6,0,4.2,3,0.5]}]},{"key":14.4,"footprint":[4.2,2.6,4.6,3],"pieces":[{"part":"body","box":[4.2,2.6,0,4.6,3,0.5]}]}]}
```

- `footprint` is `[u0, v0, u1, v1]` after rotation. `parts[].box` is `[u0, v0, h0, u1, v1, h1]` in world units after rotation; a type without parts has one part, `body`. `anchors[].at` is `[u, v, h]` in world units after rotation; `facing` and `kind` appear only when the type gives them.
- `order` is the part's place in the painter's order (SPEC section 13.4): 0 is drawn first. It is computed for all parts of all objects together, so a part of one object can sit between two parts of another (the canopy of a tree in front of an actor, the actor in front of the trunk). An adapter that draws parts instead of sprites uses it as the draw order and does not sort static objects. `render` and the editor draw in the same order.
- Numbers the tool computes (footprints, boxes, anchors) are rounded to 6 decimals; `pos` is copied. `cameraDir` is the camera direction of SPEC section 5 with each component rounded to 9 decimals (`[1, 1, 1]` for true isometric).
- `sprites` are the items an engine sorts and draws (see [Sprites and slices](#sprites-and-slices)); the bench above is cut into 3.
- `states` has one entry per state of the scene, in file order, as `{ "hide": [ids] }` (`{ "closed": { "hide": ["bench"] } }`); it is `{}` when the scene has none. The file carries every state, so `export --target runtime` takes no `--state`.

#### Upgrade from `isoblock-runtime/1`

Stages 5 and 6 wrote `isoblock-runtime/1`: the same file without `sprites` and `states`. Export again with `isoblock export <scene> --target runtime` and ship the new file; an adapter that reads `isoblock-runtime/2` rejects the old one (`E_SCHEMA`). A loader that reads the version 1 keys keeps working on the new keys it knows, but must accept the new `schema` value. See `CHANGELOG.md`.

### Sprites and slices

A **sprite** is what an engine draws and sorts as one item: a whole object, or one slice of a long object. Every object has at least one sprite in `sprites`, listed in ascending order along the object's long axis; the sprite list of the file is the objects in file order with their sprites in that order.

- **Key.** The sort key of a footprint `[u0, v0, u1, v1]` is `cu * (u0 + u1) + cv * (v0 + v1)` with `c` the `cameraDir` of the file, rounded to 6 decimals. It is twice the ground depth of the footprint's center. A larger key is closer to the camera.
- **Slices.** An object whose footprint is not square is cut along its long side into the number of slices that brings the slice length closest to the short side (at most 64; a tie keeps the smaller number). The `bench` above is 1.2 x 0.4, so it has 3 slices of 0.4 x 0.4. A square footprint, or one with no width or no depth, is one sprite.
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

- `box` is the screen bounds of every corner of every part of the object, cut to the frame. An object that is outside the frame (nothing left of its box) is not listed. `clipped` is `true` when the frame cut the box. `hint` is the type's `genHint`; it is left out when the type has none. Boxes follow the order of the objects in the scene. Groups are not scheduled.
- `--bbox-units px` (default) gives pixels rounded to 2 decimals; `norm1000` gives `x * 1000 / frame width` and `y * 1000 / frame height` as whole numbers, halves rounded up.
- `--bbox-order xyxy` (default) gives `[x0, y0, x1, y1]`; `yxyx` gives `[y0, x0, y1, x1]`.
- `--state NAME` leaves out the objects that state hides (see [States](#states)): `walk.scene.json --state open` has no box for `barrier1`. The other boxes are the same as without a state.
- Generation never writes back to the scene file. A tool that measures a generated image against the boxes is outside this project.

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
- `apply_state(root, name)` shows every object, then hides the objects that `states.<name>.hide` lists, with their sprites and anchors; `""` is the default state and hides nothing. An unknown name is `E_STATE` and changes nothing. Actors are not affected.
- `add_actor(root, id, size, at, node, color)` adds a moving object of `size` `[w, d, h]` whose footprint is centered on `at`. `node` (optional) is the game's node for it; it is placed at the projection of `at` at h = 0. Without a node the actor draws its box in `color`. `move_actor(root, id, at)` moves it and gives it its new place in the draw order; `remove_actor(root, id)` removes and frees it (the game's node too). A duplicate id on `add_actor`, and an unknown id on `move_actor` or `remove_actor`, are `E_ACTOR`.
- `at` is an array `[u, v]` (double precision) or a `Vector2`. A `Vector2` holds single precision, so its components are read back as the shortest decimal with the same value (4.2, not 4.19999980926514); that keeps the actor's key equal to a sprite's key where the tool says they are equal.
- `sort_key(dir, footprint)` is the key of a footprint `[u0, v0, u1, v1]` (SPEC 13.4) for a camera direction with 9 decimals, such as the file's `cameraDir`; `order_direction(camera)` computes that direction from a camera. `project(camera, u, v, h)`, `unproject(camera, point, h)` and `camera_direction(camera)` match `tests/golden/projection.json` within 0.001, and `sort_key` matches the keys of `tests/golden/sort.json`.
- `faces(camera, dir, box)` returns the faces of a box that point toward the camera, as the debug drawing uses them.
- Error codes: `E_SCHEMA` (a `schema` other than `isoblock-runtime/2`, a missing key, an object without `sprites`), `E_DUPLICATE_ID` (object, zone or lane ids, or the part or anchor ids of one object), `E_IO`, `E_JSON_PARSE`, `E_STATE`, `E_ACTOR`.

**The tree.** The root is named by the scene id and has four containers:

- `Objects`: one `Node2D` per object, named by its id, with meta `id`, `type`, `rot`, `tags` and `footprint`. Its children are its anchors: a `Marker2D` named by the anchor id at its projected point, with meta `kind` and `facing`.
- `Sprites`: one `Node2D` per sprite of the runtime file, with meta `object` (the object id), `key` and `slice` (its position in the object's `sprites`). **The child order is the draw order**: ascending key, equal keys in the order of the sprite list (objects in file order, slices in order). Every `z_index` stays 0 and relative, and Godot's y-sort is not used (it treats close keys as equal). A sprite of an unmapped type holds the faces of its pieces that point toward the camera, piece by piece, as `Polygon2D` (antialiasing off, the object's flat color). Actors are children of `Sprites` too, with meta `actor` (the id) and `key` (the key of their footprint): after every scene sprite whose key is at most theirs, before every scene sprite with a larger key, and among actors with equal keys in the order they were added. A moved actor keeps that order among actors of its key.
- `Zones`: one hidden `Polygon2D` per zone, and `Lanes`: one hidden `Line2D` per lane, each with its data as meta (`kind`, `points`, and for lanes `dir` and `width` in world units). Gameplay reads zones, lanes and anchors from the meta; the adapter does not move anything.

**Instancing.** A sprite of a mapped type holds an instance of the type's scene, positioned at the object's pivot: the projection of the center of its footprint at h = 0. So the origin of the game's scene is the point on the ground under the middle of the object, and the art is drawn around it in screen pixels (1 pixel per frame unit at scale 1). Instances carry meta `object`, `type`, `rot` and `slice`. An object of one sprite holds its instance directly. Each sprite of a sliced object (a long object, cut into slices so that one key per sprite sorts right next to a moving actor) holds a `Polygon2D` mask, the convex hull of the projected corners of the slice's pieces with `clip_children` set to `CLIP_CHILDREN_ONLY`, and under it its own copy of the instance; each slice shows the part of the image inside its pieces. Art that reaches outside the parts' boxes of a sliced object is cut off, so the parts should follow the art. The adapter does not turn instances: an instance carries the object's `rot` as meta, and the game picks or turns its art for it. To tint an instance, set its `modulate`.

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
