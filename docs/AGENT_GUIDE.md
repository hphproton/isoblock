# Agent guide

How an AI agent uses IsoBlock. The builder fills each section as commands ship.

Commands in this guide are available now (stage 2): `validate`, `check`, `render`, `describe`, and the editor page `dist/editor.html`. Commands from later stages are listed at the end of the Commands section.

## Install and build

Requires Node 20 or newer.

```
npm ci
npm run build
node dist/isoblock.mjs --help
```

`npm run build` writes two files: `dist/isoblock.mjs`, the command line tool, which has no runtime dependencies beyond Node, and `dist/editor.html`, the editor, one self-contained page (see the Editor section). The examples below call the tool as `isoblock`; run it as `node dist/isoblock.mjs`.

Other scripts: `npm test` runs the test suite, `npm run typecheck` runs the TypeScript checker.

## Commands

Every command takes a scene file (`*.scene.json`, format `isoblock/1`) and reads it first with the schema and reference checks. If the file is not valid, the command stops with exit code 2 and an error message.

```
isoblock validate <scene.json>
isoblock check    <scene.json> [--json]
isoblock render   <scene.json> -o <out.svg>
isoblock describe <scene.json>
```

### `validate`

Checks the file against `schema/isoblock-1.json`, then checks references: duplicate ids, object types that do not exist, relation targets, check parameters that name a missing region, strip, lane or object, states that hide a missing object, and assumption paths that do not resolve in the file.

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
SKIP c7 reachable: check "reachable" is not implemented in this stage
```

`--json` prints `{ "scene": "<id>", "results": [...] }` instead. Each result has `id`, `check`, `status` (`pass`, `fail`, `warn` or `skip`), `value`, `threshold`, `ids` and `message`; `no_overlap` adds `pairs`, `visible` adds `occluders`. Keys are always in this order. `message` is one line meant for people; read `status`, `value` and `ids` instead of parsing it.

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

`-o` is required and must end in `.svg`. PNG output arrives in stage 5.

### `describe`

Prints a compact summary, about 30 to 60 lines, so an agent never has to read the whole file or an image. Exit code 0 even when checks fail. See the next section.

### Not available yet

These commands and flags exist in the spec but arrive in later stages. Using one exits with code 2 and names the stage:

| Command or flag | Stage |
|---|---|
| `patch`, `diff`, `compare` | 3 |
| `solve`, `--only` | 4 |
| `export` (targets `runtime`, `godot`, `gen-bbox`), `-o out.png` | 5 |
| `--state NAME` | 6 |

Export targets `phaser` and `tiled` are not scheduled.

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

### Overlays

Toggles for **Frame regions**, **Strips**, **Lanes**, **Zones**, **Anchors** (off by default) and **Object labels**.

### Touch

One finger drags an object or pans; two fingers zoom and pan. Controls are 44 px high on touch screens, and a finger hits an object when it comes within 24 px of it. While a gesture is going on the view is drawn at pixel ratio 1 and made sharp again when the finger lifts, to keep 200 objects at 60 frames per second.

### Driving the editor from a script

The page has a read-only object `window.isoblock` for tests and tools: `scene()`, `text()` (the text `Save` writes), `state()`, `screenOf(view, id)` (page coordinates that hit an object), `viewport(view)`, `lockIcons(view)`, `pixelRatio(view)`, `fit(view)`, `redraw(view)` and `frames` (`start()`, `stop()`, `snapshot()`). It cannot change the scene. The tests in `tests/editor/` use it with `playwright-core` and an installed Chromium.

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
- **Check lines:** one per `fail`, `warn` or `skip` check, in `checks` order, with the ids involved. With none, the output says `checks: all N pass` (or `checks: none`).
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

Notes:

- `ids` in a result: failing objects (`in_region`), involved objects sorted alphabetically (`no_overlap`), blocking objects (`lane_clear`), `[a, b]` in file order (`clearance`), `[lane]` (`lane_reaches`), `[target]` (`visible`).
- `visible` samples the top face and the side faces from `from` times the height up to the full height, 64 points per face, and casts a ray toward the camera from each point through the parts of every other object. `occluders` lists the objects that hide at least one point.
- Footprints always use the type's `size` rectangle, even when parts stick out. Parts matter for `visible` and for drawing.
- **`lane_clear` and `lane_reaches` support one lane shape:** exactly 2 points, parallel to u or v. Other shapes return `skip`. `lane_reaches` also returns `skip` for the `top` and `bottom` edges.
- **`skip` is not a pass.** It means the tool could not evaluate the check: the check is not implemented in this stage (`reachable`, `capacity`, `min_screen_size`, `sort_consistency`, `state_stable`), or its input has an unsupported shape. A skipped check has `value: null` and `threshold: null`, and `check` exits 1.

## Patches (from stage 3)

Not available yet. Until then, the commands above only read scene files.

## `compare` (from stage 3)

Not available yet.
