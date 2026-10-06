# Agent guide

How an AI agent uses IsoBlock. The builder fills each section as commands ship.

Commands in this guide are available now (stage 4): `validate`, `check`, `render`, `describe`, `relations`, `solve`, `patch`, `diff`, `compare`, and the editor page `dist/editor.html`. Commands from later stages are listed at the end of the Commands section.

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
isoblock relations <scene.json> [--json]
isoblock solve    <scene.json> [--only a,b] [-o <proposal.json>] [--patch <moves.patch>] [--json]
isoblock patch    <scene.json> <patch> [-o <out.json>] [--dry-run] [--json]
isoblock diff     <a.json> <b.json> [--json]
isoblock compare  <scene.json> --variant NAME=FILE... [--format text|md|json]
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

### `relations`, `solve`, `patch`, `diff`, `compare`

Described in their own sections below: [Relations](#relations), [`solve`](#solve), [Patches](#patches), [`diff`](#diff) and [`compare`](#compare). The section [Workflow: relate, solve, patch](#workflow-relate-solve-patch) shows how they work together.

### Not available yet

These commands and flags exist in the spec but arrive in later stages. Using one exits with code 2 and names the stage:

| Command or flag | Stage |
|---|---|
| `export` (targets `runtime`, `godot`, `gen-bbox`), `-o out.png` | 5 |
| `--state NAME` (also `compare --state`) | 6 |

Export targets `phaser` and `tiled` are not scheduled. `compare --render` is not scheduled either.

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
- The label of a variant is the first comment line of its patch, else its name. `--state` is added in stage 6 and `--render` is not scheduled.
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
- One row per check that fails or is skipped in some column, or whose value differs from the base in some column, in the order of `checks`. The label names the check and its unit: `in_region <region>[/<strip>] (objects outside)`, `no_overlap (pairs)`, `clearance <a>×<b> (<unit>)`, `lane_clear <lane> (blocking objects)`, `lane_reaches <lane> (y px)`, `visible <target> (% occluded)`; other checks show as `<check> <id>`.
- Cells: counts as integers, clearance with 2 decimals, `lane_reaches` in whole pixels (`none` when the lane does not reach the edge), `visible` in whole percent, `skip` for a skipped check. A trailing ` ✗` marks a value whose status is `fail` or `skip`.
- `objects moved / total`: objects present in both scenes whose `pos` differs, and the sum of their ground distances.

Formats: `text` (default, shown above, columns left-aligned and padded), `md` (the same rows as a Markdown table with the header `| metric | base | A | B | C |`) and `json`:

```
{ "scene", "state", "variants": [{ "name", "label" }], "failing", "locksTouched", "moved",
  "checks": [{ "id", "check", "label", "threshold", "values", "status", "delta" }] }
```

Every list has one entry per column, base first (`label` is `null` for the base; `moved` is `null` for the base). `delta` is the value minus the base value rounded to 6 decimals, `null` for the base and for values that are `null`. `state` is `default` until stage 6 adds states.

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
