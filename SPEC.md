# IsoBlock Specification

Status: draft. The project name is provisional.

## 0. Summary

IsoBlock stores the layout of a 2D isometric scene as **data in world units**. People and AI agents edit that data (drag, describe, small patches). The tool checks the scene's rules and exports **one approved layout file** that engines, image-generation pipelines and graybox gameplay can all read.

## 1. Problem

- Layouts described in prose hide conflicts. Generated images hide them further. Hand-written coordinates go stale.
- Engines keep positions in their own scene formats, so layouts are hard to compare or move between engines.
- AI agents that write coordinates directly tend to overflow the frame and overlap objects. They are good at stating **relations** ("the bench is in front of the tree, 1 to 1.5 units away"). A solver should compute coordinates.
- People need to see a layout at once, fix it at once, lock what is settled, and spend few tokens doing so.

## 2. Goals and non-goals

**Goals**

1. One source of truth: the `*.scene.json` file.
2. Precise drag and drop on phone and desktop.
3. Instant rule checks. Each result states pass or fail, the reason and the objects involved.
4. Per-property locks, enforced by the tool rather than by the agent's discipline.
5. AI collaboration through small patches on a compact summary, so cheap models can take part at low token cost.
6. Exports for engines, for image generation and for graybox gameplay.
7. Engine-independent and headless, for CI and agents.
8. Comparison of a base layout with up to 4 variants by measured values, so any model can report measurable trade-offs without judging them.

**Out of scope for now** (open points are in section 19)

- Final art or image generation.
- Physics.
- A general-purpose level editor.
- True 3D or perspective cameras.
- Free rotation. Only 0, 90, 180 and 270 degrees.
- AI calls from inside the editor. Agents use the protocol in section 12.

## 3. Design principles

1. **Data is the truth.** Images, engine scenes and generation boxes are derived outputs. They never write back.
2. **Positions are in world units on the ground** (u, v) plus height h. Pixels appear only at projection.
3. **Describe with relations.** Coordinates come from the solver or from a person dragging.
4. **Every rule is an executable check.** No rule lives only in prose.
5. **Conflicts are reported.** The tool never silently breaks a hard rule or a lock.
6. **Deterministic:** same input, same output (fixed seeds, stable ordering).
7. **Diff-friendly:** stable indentation, stable key order, stable ids.
8. **One pure core** (no DOM, no I/O). Editor, CLI, tests and reference adapters share it.

## 4. Concepts

| Term | Meaning |
|---|---|
| Ground | Plane with axes u and v; h points up |
| Unit | Unit chosen by the scene: meters, tiles, or a reference height such as a standing character. May declare a conversion |
| Camera | Projection parameters from ground to screen |
| Frame | Target canvas (for example 1000×1000) and its screen regions: view, HUD, safe area |
| Type | Shared template: size, parts, anchors, generation hint |
| Object | Instance of a type: position, rotation in 90° steps, locks, tags |
| Part | Sub-box of a type (trunk, canopy, roof). Needed for correct occlusion and draw order |
| Anchor | Meaningful point with a facing: ground contact, seat, queue point, hang point, speech bubble |
| Zone | Ground polygon with a purpose: walkable, blocked, interaction, queue |
| Strip | Band along one axis, defined by a v range. Useful for scenes built in layers |
| Lane | Polyline with width, direction and kind (walk, vehicle) |
| Relation | Constraint between objects, zones and lanes; hard or soft |
| Check | Function returning pass, fail, warn or skip, with a measured value and a message |
| Lock | Ban on changing one property |
| State | Override set for one state: night, rain, an event that hides objects |
| Assumption | Provisional value with a note, origin and owner |
| Profile | Project-specific vocabulary: types, anchor kinds, extra checks |

## 5. Coordinates and projection

Camera fields: `angleU`, `angleV` (degrees from the screen x axis, y pointing down), `pxPerUnit`, `verticalScale`, `origin [x, y]`.

```
axisU = pxPerUnit · (cos angleU, sin angleU)
axisV = pxPerUnit · (cos angleV, sin angleV)
up    = (0, −pxPerUnit · verticalScale)

screen(u, v, h) = origin + u·axisU + v·axisV + h·up
```

- **True isometric:** `angleU = 30`, `angleV = 150`, `verticalScale = 1`.
- **2:1 pixel art:** `angleU ≈ 26.565`, `angleV ≈ 153.435`. `verticalScale` follows the art convention.
- **Inverse for dragging:** from screen to ground at height h0, solve the 2×2 linear system of `axisU` and `axisV`.
- **Camera direction** is the vector `c = (cu, cv, 1)` with `cu·axisU + cv·axisV = −up`; every point on a line along `c` projects to the same screen point. `depth = cu·u + cv·v + h`; larger means closer to the camera. For true isometric, `c = (1, 1, 1)`.
- **"Left/right" for the viewer** is the sign of screen x. **"Front/behind"** follows `depth`. Relations are written from the viewer's side and mapped to world axes through the camera, so they stay valid when the camera changes.
- **Golden vectors:** every implementation (core, engine adapters) must match `tests/golden/projection.json` (see Appendix C).

## 6. Scene file

Short example (full file in Appendix A):

```json
{
  "schema": "isoblock/1",
  "id": "yard",
  "units": { "name": "u", "note": "abstract unit", "perMeter": null },
  "camera": { "angleU": 30, "angleV": 150, "pxPerUnit": 80, "verticalScale": 1, "origin": [300, 300] },
  "frame": {
    "w": 1000, "h": 1000,
    "regions": [
      { "id": "hud", "rect": [0, 0, 1000, 150], "blocksScene": true },
      { "id": "view", "rect": [0, 150, 1000, 1000] }
    ]
  },
  "strips": [
    { "id": "back", "v": [-1.5, 0], "kind": "decor", "scale": "art-directed" },
    { "id": "floor", "v": [0, 4], "kind": "walkable" }
  ],
  "types": {
    "tree": {
      "size": [1.2, 1.2, 2.4],
      "parts": [
        { "id": "trunk", "box": [0.45, 0.45, 0, 0.75, 0.75, 1.4] },
        { "id": "canopy", "box": [-0.2, -0.2, 1.4, 1.4, 1.4, 2.4] }
      ],
      "genHint": "young tree with a round canopy"
    },
    "bench": {
      "size": [1.2, 0.4, 0.5],
      "anchors": [{ "id": "seat1", "at": [0.3, 0.2, 0.5], "facing": "back", "kind": "seat" }]
    }
  },
  "objects": [
    { "id": "tree", "type": "tree", "pos": [3, 0.2], "rot": 0, "locks": ["pos"], "tags": ["static"] }
  ],
  "zones": [],
  "lanes": [
    { "id": "haul", "kind": "vehicle", "width": 0.8, "dir": "to_screen_right", "points": [[5, 4.6], [16, 4.6]] }
  ],
  "relations": [
    { "id": "r1", "a": "bench", "rel": "in_front_of", "b": "tree", "gap": [1, 1.5], "hard": false, "weight": 1, "source": "example relation" }
  ],
  "checks": [
    { "id": "c8", "check": "visible", "target": "actor", "from": 0.55, "maxOccluded": 0.05 }
  ],
  "states": { "closed": { "hide": ["bench"] } },
  "assumptions": [
    { "path": "/types/tree/size/2", "value": 2.4, "note": "height not given in the brief", "owner": "designer" }
  ],
  "meta": { "version": 1, "status": "draft", "approvedBy": null, "approvedAt": null }
}
```

Conventions:

- `size` is `[w along u, d along v, h]` of the unrotated type.
- `rot` ∈ {0, 90, 180, 270}: rotation about the footprint center, from +u toward +v. At 90 and 270 the footprint becomes `d × w`.
- `pos` is the `(min u, min v)` corner of the footprint **after rotation**.
- The footprint used by overlap, clearance and lane checks is always the rectangle from `size`, even when parts stick out. Parts are used for occlusion and drawing and rotate with the object.
- A type without `parts` has one part: the whole `size` box.
- `parts[].box` is `[u0, v0, h0, u1, v1, h1]` in type coordinates.
- `anchors[]`: `id`, `at [u, v, h]` in type coordinates, `facing`, `kind`. Anchors rotate with the object.
- `strips[].v` is `[min, max]` along v; `null` means unbounded on that side.
- `units.perMeter` is the number of units per meter, or `null` when the unit is not tied to meters.
- Relation targets (`a`, `b`): an object id, `zone:<id>`, `lane:<id>`, or a strip edge `strip:<id>.v0` / `strip:<id>.v1`.
- `locks` lists property paths: `pos`, `pos.u`, `pos.v`, `rot`, `type`, or a JSON Pointer. A pointer is absolute in the scene file; a pointer into a type (for example `/types/<t>/size/2`) blocks that value for every object of the type.
- Every unsettled number has an entry in `assumptions`. The editor marks it as provisional.
- A strip with `kind: "decor"` is art-directed backdrop. Physical scale is not checked there (section 18).

Schema rules (`schema/isoblock-1.json`):

- Required top-level keys: `schema`, `id`, `units`, `camera`, `frame`, `types`, `objects`. Optional: `strips`, `zones`, `lanes`, `relations`, `checks`, `states`, `assumptions`, `meta`.
- Required fields inside: `units.name`; `camera.angleU`, `angleV`, `pxPerUnit`, `origin` (`verticalScale` defaults to 1); `frame.w`, `h`, `regions`; region `id`, `rect` (`blocksScene` optional); strip `id`, `v`; type `size`; part `id`, `box`; anchor `id`, `at`; object `id`, `type`, `pos` (`rot` defaults to 0); zone `id` (`kind` and `points`, a ground polygon of at least 3 `[u, v]` points, are optional); lane `id`, `width`, `points` (at least 2); relation `id`, `rel`; check `id`, `check` plus the parameters 9.1 requires; assumption `path`, `value`. Everything else shown in the example is optional.
- Strict where this spec defines a shape: unknown keys are errors (catches typos). Keys starting with `x-` are always allowed, for extensions.
- `zones[]` requires `id`. `states.<name>` is an object; `hide`, when present, is an array of object ids. `relations[]` requires `rel` from section 7; `order_along` needs `ids`, every other `rel` needs `a`.
- `kind`, `dir` and `facing` are free strings. Vocabulary checks belong to a project profile.
- `ids`, when present on a check, must be non-empty. Absent means all objects.
- `checks[].check` must be a name from section 9. For checks not implemented in the current stage, only `id` and `check` are validated.
- A file that fails the schema or a reference check stops with an error message.
- Also schema errors (`E_SCHEMA`): a camera whose ground axes are parallel (`angleU` equal to `angleV` modulo 180); a negative size or lane width; a `locks` entry that is not `pos`, `pos.u`, `pos.v`, `rot`, `type` or a JSON Pointer.

Reference rules (`E_REF`):

- Ids are unique within `frame.regions`, `strips`, `objects`, `zones`, `lanes`, `relations` and `checks`, and within the parts and the anchors of one type.
- `objects[].type` names a key of `types`.
- Relation `a`, `b` and `ids` resolve to an object id, `zone:<id>`, `lane:<id>`, `strip:<id>.v0` or `strip:<id>.v1`.
- Parameters of checks implemented in the current stage name existing regions, strips, lanes and objects. Parameters of checks not implemented yet are not resolved.
- `states.<name>.hide` names existing objects.
- Every `assumptions[].path` is a JSON Pointer that resolves in the file.

## 7. Relation vocabulary

| `rel` | Meaning | Parameters |
|---|---|---|
| `left_of`, `right_of` | On the viewer's screen | `gap [min, max]` |
| `in_front_of`, `behind` | By depth toward the camera | `gap` |
| `against` | Flush with an edge or line | `gap` |
| `gap` | Edge-to-edge distance | `[min, max]` |
| `inside` | Within a zone or strip | — |
| `aligned` | Same row along u or v | `axis` |
| `facing` | Anchor faces an object or point | — |
| `on_lane` | Anchor or object lies on a lane | `t [min, max]` |
| `clear_of` | No overlap, minimum gap | `min` |
| `order_along` | Order along an axis | `ids[]` |

Each relation has `id`, `rel`, `hard` (bool, default `false`), `weight` (soft relations, default 1) and `source` (the original sentence, for traceability; optional).

## 8. Solver

- **Input:** objects (some locked) and relations. **Output:** new positions and a report.
- **Algorithm** (simple, deterministic):
  1. Order: locked objects stay; then the most constrained objects; then the rest.
  2. For each movable object, try grid positions (snap step, for example 0.05) inside its allowed area. Score by: hard violations (must be 0), then total soft penalty, then distance from the old position.
  3. Repeat local search until no improvement or N rounds.
  4. If no solution has zero hard violations, return the best one with a **minimal conflict set**: the smallest set of hard relations that cannot hold together (found by deletion filtering).
- **The solver never** changes locked properties, edits or deletes relations, or saves. It proposes; a person or agent accepts.
- It can run on part of a scene (`only: [ids]`).
- **Performance:** 50 objects in under 200 ms in a browser.

## 9. Check catalog

| `check` | Passes when |
|---|---|
| `in_region` | Footprints lie inside a frame region and, optionally, a strip |
| `no_overlap` | Footprints do not overlap, except declared pairs (for example a person on a seat). Stage 1 checks footprints only; volume overlap for stacked objects comes later |
| `clearance` | Edge-to-edge gap between A and B is at least `min` |
| `lane_clear` | No object blocks a lane, except objects that belong to it (listed in `ignore`) |
| `lane_reaches` | A lane meets a given frame edge inside a region |
| `reachable` | A walkable path exists from an entry to an anchor (BFS on a fine grid) |
| `capacity` | N anchors of kind X are usable at once, counting seated bodies |
| `visible` | The required part of an object (for example its upper 45%) is occluded no more than a threshold. Uses rays toward the camera through parts |
| `min_screen_size` | On-screen height of an object is at least a pixel value (legibility) |
| `sort_consistency` | The engine's draw-order rule agrees with geometric order; reports objects that need slicing (section 13.4) |
| `state_stable` | Static objects keep their position across states |

Result shape: `{ id, check, status: pass|fail|warn|skip, value, threshold, ids[], message }`. `message` is one line.

Status `skip` means the tool could not evaluate the check: the check is not implemented in the current stage, or its input has a shape the current stage does not support. Skip is never a pass (section 11). A skip result has `value: null`, `threshold: null`, `ids: []` and a message that says why.

Checks re-run incrementally: when an object changes, only checks that involve it run again.

### 9.1 Exact definitions for stage 1

These definitions are the contract with `tests/fixtures/*.expected.json`. Parameters are required unless marked optional or given a default. The maintainer computes the expected files with an implementation independent of the builder's code. Tolerance: `value` ±0.01 units; pixel values ±1 px. Comparison constant `EPS = 1e-9`.

| `check` | Parameters | Computation | `value` |
|---|---|---|---|
| `in_region` | `region` (required), `strip` (optional), `ids` (default: all objects) | Project the 4 footprint corners at h = 0. An object fails if a corner lies outside the region `rect` (edges inclusive), or if its footprint v range is not inside the strip's v range | Number of failing objects; `ids` = failing objects |
| `no_overlap` | `ids` (optional), `allow` (optional; list of permitted pairs, order-insensitive) | Two footprints overlap when the intersection along u **and** along v are both > EPS | Number of overlapping pairs; `ids` = objects involved; `pairs` = the pairs |
| `clearance` | `a`, `b`, `min` | Edge-to-edge distance: `hypot(max(0, b.u0−a.u1, a.u0−b.u1), max(0, b.v0−a.v1, a.v0−b.v1))`. Passes if ≥ `min` | The distance |
| `lane_clear` | `lane`, `ignore` (optional) | Lane must have exactly 2 points and be parallel to u or v; its shape is that segment widened by `width/2` on each side. An object blocks it when its footprint overlaps that rectangle (as in `no_overlap`). Other lane shapes: `skip` | Number of blocking objects; `ids` = blocking objects |
| `lane_reaches` | `lane`, `edge` (`right`, `left`, `top` or `bottom`; stage 1 evaluates `right` and `left` and returns `skip` for the others), `region` | Same lane shape rule. Project the 4 lane corners; intersect that polygon with the frame edge line (`x = frame.w` or `x = 0`). Passes if an intersection exists and lies entirely inside the region's y range. No intersection: `fail`, `value = null`, `message = "lane does not reach edge"` | Largest y of the intersection (px) |
| `visible` | `target`, `from` (start height ratio, default 0.55), `maxOccluded` | Sample the faces of the target's `size` box that face the camera (normal · c > EPS): the top face fully; side faces only from `from·h` to `h`. Each face: 8×8 grid at cell centers, offset outward by 1e-6. Cast `p + t·c` (t > EPS) from each sample; a sample is occluded if the ray runs inside any part of another object for a length > EPS (slab test; touching a face, edge or corner does not count) | Occluded fraction (0–1) |

Threshold, ids and extra fields per check:
- `in_region`, `no_overlap`, `lane_clear`: `threshold = 0`; `ids` as in the table.
- `clearance`: `threshold = min`; `ids = [a, b]`.
- `lane_reaches`: `threshold = [y0, y1]` of the region; `ids = [lane id]`.
- `visible`: `threshold = maxOccluded`; `ids = [target]`; `occluders` = ids of objects with a part that occludes at least one sample.

Further rules:
- `no_overlap` with `ids`: a pair counts only when both objects are in `ids`.
- Lane shape (`lane_clear`, `lane_reaches`): the segment widened by `width/2` on each side, not extended past its end points. A lane whose two points are identical is an unsupported shape (`skip`).
- `visible`: the length compared with EPS is the Euclidean length of the ray inside a part. The check passes when `value <= maxOccluded + EPS`.

Ordering:
- Results follow the order of `checks` in the scene file.
- Object ids in `ids` and `occluders` follow the order of `objects`, including `clearance`. Exception: `no_overlap` sorts `ids` alphabetically; each pair in `pairs` is sorted alphabetically, and the list of pairs is sorted ascending.

Messages: builders choose message wording, except the `lane_reaches` message above and the `describe` lines in Appendix B.

## 10. Editor (web page)

- **Two views:** isometric with the scene camera, and a top-down plan (more precise dragging, nothing hidden).
- **Drag:** screen to ground, grid snap, keep h. Locked objects cannot be dragged and show a lock icon. A drag changes `pos` only; snap applies to `pos` (default step 0.1). A press becomes a drag after the pointer moves 3 px (mouse), 4 px (pen) or 8 px (touch).
- **Plan view:** u to the right, v down; objects drawn by their top faces.
- **Property panel:** numbers with units; a lock toggle per property; provisional mark for assumptions.
- **Check panel:** pass/fail updates live; tapping a row highlights the objects involved.
- **Toggleable overlays:** strips, lanes, zones, anchors, frame regions, occlusion rays, sort points.
- **State switch:** day, night, events.
- **History:** undo, redo; saved versions with notes; compare two versions.
- **Export:** frame image, scene file, engine package, generation boxes.
- **Touch:** one-finger drag, two-finger zoom, large hit targets.
- **Performance:** 60 fps with 200 objects on a mid-range phone. Canvas 2D; redraw only on change.
- **Storage:** reads and writes scene files; no hidden state outside the file. Saved files are JSON with 2-space indentation and a final newline; keys keep their order, keys added by an edit come last, an empty `locks` list is removed, and numbers are written as JSON numbers (`2.0` becomes `2`).
- **Assumptions:** editing a provisional number updates its `assumptions[].value`; the entry stays until a person removes it.

## 11. CLI (headless)

```
isoblock validate scene.json            # schema and reference checks
isoblock check    scene.json [--json] [--state NAME]
isoblock solve    scene.json [--only a,b] [-o out.json]
isoblock render   scene.json [--state NAME] -o out.svg|out.png
isoblock describe scene.json            # compact summary for agents (section 12)
isoblock patch    scene.json patch.txt [-o out.json] [--dry-run] [--json]
isoblock diff     a.json b.json [--json]
isoblock compare  scene.json --variant A=a.patch --variant B=b.patch [--state NAME] [--format text|md|json] [--render]
isoblock export   scene.json --target runtime|godot|phaser|tiled|gen-bbox
```

Commands and flags arrive in the stages listed in section 17. A command, flag, export target or output format not available in the current stage is a usage error (exit 2) that names the stage that adds it, or says it is not scheduled. Examples in stage 1: `--state` (stage 6), `render -o out.png` (stage 5). `compare --render` is not scheduled.

`render` requires `-o`; the file extension selects the format (`.svg`, and `.png` from stage 5).

`check` output:
- Default: one summary line, then one line per check: `PASS|FAIL|WARN|SKIP <id> <check>: <message>`.
- `--json`: `{ "scene", "results" }`; `results` has the same shape as in `*.expected.json`. Expected files omit `message` except where 9.1 fixes its wording; comparisons ignore other messages.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Success. For `check`, `patch` and `solve`: every check of the resulting scene is `pass` or `warn` |
| 1 | `check`, `patch`, `solve`: at least one check of the resulting scene is `fail` or `skip`. A check the tool could not evaluate is not a pass |
| 2 | Invalid input or usage: unreadable file, malformed JSON, schema or reference error, malformed or failing patch, unknown or unavailable command or flag. Error codes: `E_IO`, `E_JSON_PARSE`, `E_SCHEMA`, `E_REF`, `E_PATCH`, `E_USAGE` |
| 3 | `patch`: the patch touches a lock (`E_LOCK`) |
| 70 | Internal error (`E_INTERNAL`) |

`validate`, `render`, `describe`, `diff`, `compare` and `export` exit 0 when they complete, even if checks fail.

### 11.1 `compare`: variants by measured values

- **Input:** a base scene and 1–4 variants, `--variant NAME=FILE`, in the order given. A variant file is a patch (section 12) or another scene file (a JSON object with `schema`). Optionally at one state (from stage 6).
- **Method:** apply each variant to a copy of the base, ignoring locks but recording the locks it touches, and run the base scene's checks on every column. A variant file whose first non-blank character is `{` is a scene; any other file is a patch. Names are unique, not empty and not `base`. A variant that is malformed or produces an invalid scene stops `compare` with exit 2.
- **Measures** (the JSON output has all of them):
  - `failing`: number of checks with status `fail` or `skip`; from stage 4 also violated hard relations and total soft penalty;
  - `locksTouched`: labels `<object id>.<lock>` of the base locks the variant touches (section 12); any entry marks the variant invalid;
  - `checks`: every check with its label, threshold, `values` (one per column), `status` (one per column) and `delta` (value minus the base value, rounded to 6 decimals; `null` for the base and for values that are `null` or not numbers);
  - `moved`: objects present in both scenes whose `pos` moved more than 1e-9, as `count` and total `distance` (sum of ground distances, rounded to 6 decimals); `null` for the base.
- **Check labels:** `in_region <region>[/<strip>] (objects outside)`, `no_overlap (pairs)`, `clearance <a>×<b> (<unit>)` with the ids in the order of the result's `ids`, `lane_clear <lane> (blocking objects)`, `lane_reaches <lane> (y px)`, `visible <target> (% occluded)`.
- **Variant labels:** the first comment line of the patch (section 12), else the variant name.
- **`text` format** (Appendix D is the contract): line 1 `compare <scene id> · state <state> · base vs <names>`; line 2 `<name> = <label>` for each variant, joined with ` · `; then a table. Rows: `failing checks`; `locks touched` (count, then ` ✗ (<labels>)` when not zero); one row per check that is `fail` or `skip` in some column, or whose value differs from the base in some column (a non-zero delta, or `null` against a number), in `checks` order; `objects moved / total (<unit>)` (`-` for the base, else `<count> / <distance>`). Cells: counts as integers; clearance values and distances with 2 decimals; `lane_reaches` whole pixels (`none` when `null`); `visible` whole percent; `skip` for skipped checks; ` ✗` after a value whose status is `fail` or `skip`. Columns are left-aligned; each column is as wide as its widest cell (header included, counted in Unicode code points) plus 2 spaces; trailing spaces are removed.
- **`md` format:** the same rows as a Markdown table with the header `| metric | base | <names> |`.
- **`json` format:** `{ "scene", "state", "variants": [{ "name", "label" }], "failing", "locksTouched", "moved", "checks": [{ "id", "check", "label", "threshold", "values", "status", "delta" }] }`; every list has one entry per column, base first (`label` is `null` for the base).
- **Not scheduled:** layout indicators (occupied share of the view per third of the frame, largest empty area, on-screen size of key objects) and `--render`.
- **Limit:** `compare` does not choose. It separates what is measurable from what needs judgment (balance, feel, gameplay intent); a person decides.
- **In the editor:** quick switching between variants with a delta table (not scheduled).

### 11.2 `diff`

`diff a.json b.json` lists the changes from scene a to scene b, matching items by identity, not by position:

- Objects are compared key by key. An array whose items, in both scenes, are all objects with a string `id` that is unique in its list is matched by `id` (an empty list qualifies); `assumptions` is matched by `path` in the same way. Every other array (`pos`, `size`, `locks`, `points`, ...) is one value. Item order is ignored.
- Each entry is `{ "op": "add"|"remove"|"replace", "path", "from"?, "to"? }`: `add` has `to`, `remove` has `from`, `replace` has both. `path` is a JSON Pointer built from keys and matched ids (`/objects/crate2/pos`, `/relations/r3`), escaped as in RFC 6901. Entries are sorted by `path` (code point order).
- `--json` prints `{ "a", "b", "changes" }` with the two scene ids. The text format prints `diff <a id> -> <b id>: <n> changes`, then one line per entry: `+ <path> <to>`, `- <path> <from>`, `~ <path> <from> -> <to>`, values as compact JSON.

## 12. AI collaboration protocol (token-efficient)

- **Agents do not read images by default.** They read `describe` output, about 30–60 lines:
  - object table: id, type, position, size, rotation, locks;
  - failing and skipped checks;
  - open assumptions.
- **Agents do not rewrite files.** They send small patches, as JSON Patch (RFC 6902) or short commands:

```
# move the bench toward the path
move bench v+0.2
set /types/tree/size/2 2.2 note="measured from approved art"
lock tree pos
relate bench in_front_of tree gap 1..1.5 hard
```

- **Patch file:** a file whose first non-blank character is `[` is a JSON Patch (an array of operations). Any other file is short commands: one command per line; blank lines are ignored; a line starting with `#` is a comment, and the first comment line is the patch's description. Tokens are separated by spaces; double quotes group a token that contains spaces (`note="two words"`); inside quotes `\"` is a quote and `\\` a backslash. The whole file is parsed before any command runs; an error names its line. A patch without commands applies and changes nothing.
- **Short commands** (stage 3):

| Command | Effect |
|---|---|
| `move <id> <u±n> [<v±n>]` | Adds to `pos`; each axis at most once (`move bench u-0.5 v+0.2`) |
| `rot <id> <0\|90\|180\|270>` | Sets `rot`, keeping the footprint center: `pos` is recomputed when the footprint changes shape, else left as it is |
| `set <pointer> <value> [note="<text>"]` | Replaces the value at an existing JSON Pointer below the root. The value is read as JSON, else as a string. `note=` replaces the `note` of the assumption with that `path`; it is an error when there is none |
| `lock <id> <lock>...` | Appends locks the object does not have yet (`pos`, `pos.u`, `pos.v`, `rot`, `type` or a JSON Pointer) |
| `relate <a> <rel> <b> [gap <min>..<max>] [axis <u\|v>] [t <min>..<max>] [min <n>] [hard] [weight <n>] [id=<id>] [source="<text>"]` | Appends a relation `{ id, a, rel, b, <parameters>, hard, weight?, source? }`; `hard` is always written (default `false`); without `id=` the id is the first free `r1`, `r2`, ... |
| `solve ...` | Stage 4 (usage error until then) |

  There is no `unlock`: people remove locks in the editor or in the file. A command naming an unknown object or command, a bad offset or a pointer that does not resolve is `E_PATCH`.
- **Application:** commands or operations apply in order to a copy of the scene; the patch is atomic (any error leaves the scene unchanged). Coordinates computed by `move` and `rot` are rounded to 6 decimals. Afterwards every `assumptions[].value` is set to the value its `path` points to.
- **Locks:** a patch touches a lock when, compared with the original scene, a locked value changes (`pos`, `pos.u` = `pos[0]`, `pos.v` = `pos[1]`, `rot`, `type`, or the value at a pointer, including its appearance or removal), a lock entry disappears, or a locked object disappears. Only locks of the original scene count. Labels are `<object id>.<lock>`, in object order, then lock order.
- **Order of outcomes:** malformed patch or failing command (`E_PATCH`, or `E_USAGE` for a later-stage command, exit 2); then locks (`E_LOCK`, exit 3, `patch` writes nothing); then schema and references of the result (`E_SCHEMA`, `E_REF`, exit 2); else the patch is applied (exit 0 or 1 by the checks of the result).
- **Output:** the result is written to `-o out.json`, else back to the input file, in the saved format of section 10. `--dry-run` writes nothing. The report goes to stdout; an error that stops `patch` before there is an outcome (unreadable or invalid scene, unreadable patch file, bad flags) goes to stderr without a report.
- **Report:** `--json` prints `{ "scene", "status": "applied"|"rejected"|"invalid", "error": null | { "code", "message" }, "locks", "diff", "checks", "failing" }`: `locks` = touched lock labels; `diff` = the `diff` entries from the original to the result (section 11.2); `checks` = `[{ "id", "check", "from", "to", "value": [before, after] }]` for each check whose status changed or whose value changed by more than 1e-9; `failing` = number of `fail` or `skip` results after the patch. A rejected or invalid patch reports empty `diff` and `checks` and `failing: null`; only a rejected one lists `locks`. The text format starts with `patch <scene id>: applied|rejected|invalid`, then one line per diff entry and per changed check; wording beyond that is free.
- **Log:** every applied or lock-rejected patch that is not a dry run appends one line to `<output file without .json>.log.jsonl`: `{ "seq", "patch", "description", "status", "error", "locks", "diff", "checks" }`, where `seq` is the number of non-blank lines already in the log plus one and `patch` is the patch file name without its directory. For an output name that does not end in `.json`, `.log.jsonl` is appended to the whole name. No timestamps: the version history of the files records when.
- **Any form of description works:** words, a sketch, a screenshot of another product with "like this, without that". The model turns it into relations and rough positions; the solver refines them. The model never writes final coordinates.
- Images go to the agent only when a person asks.

## 13. Engine integration

### 13.1 Ownership

| What | Owner |
|---|---|
| Positions, footprints, anchors, zones, lanes, per-state visibility | Scene file |
| Images, animation, shaders, lights | Engine and art pipeline |
| Behavior, game rules | Gameplay code |
| Which asset a type uses, and where its pivot is | Asset contract (type → asset map) |

The engine never edits what the scene file owns. To change the layout, edit the scene file and export again.

### 13.2 Two loading modes

- **A. Load at runtime (recommended).**
  - The game ships the approved `scene.runtime.json`. A thin engine adapter reads it, creates nodes by `type`, places them with the same projection, assigns draw order, and turns zones, lanes and anchors into gameplay objects.
  - **Pros:** one source; hot reload during development; switching engines means rewriting only the adapter (about 150–300 lines).
  - **Cons:** the engine's editor does not show the layout unless the adapter runs in the editor (for example a Godot `@tool` script).
- **B. Generate engine scenes at build time:** `.tscn` for Godot, scene JSON for Phaser, TMX/JSON for Tiled.
  - **Pros:** visible in the engine's editor.
  - **Cons:** easy to drift. Generated files must say "generated, do not edit".
- **Recommendation:** A is the main path; B is for viewing only.

### 13.3 Adapter contract (every engine)

- `project(u, v, h) → (x, y)`, matching the golden vectors.
- `sortKey(object | actor)` following section 13.4.
- `instantiate(type) → node`, through the type → prefab/scene/sprite map.
- Image pivot = the type's ground-contact anchor, from the asset contract.
- Zones become collision or navigation areas. Lanes become paths. Anchors become oriented gameplay points (`seat`, `queue_point`, `spawn`, `exit`, `wait`).
- On a state change, apply that state's overrides (hide/show, reposition).
- Validate on load: schema version, duplicate ids, types without a mapping. Report errors; never ignore them silently.

### 13.4 Draw order: the main isometric trap

- Engines usually sort by one point per sprite (pivot y). That works for tile-sized objects. Long objects (a row of seats, a wall, a vehicle) sort wrong when a character walks around them.
- **Fixes, in order of preference:**
  1. Slice long objects along their long axis; each slice is a sprite with its own sort point.
  2. Split an object into a front part and a back part.
  3. Static objects: precomputed topological order. Moving objects: sort by foot depth.
- **Tool support:** `sort_consistency` walks a test actor through points around each object, compares the engine rule with geometric order, and reports objects that need slicing. Export includes `slices` for them.

### 13.5 Flow and versions

```
scene.json (git) → isoblock export --target runtime → <game>/data/scenes/<id>.json → adapter
```

- Only scenes with `meta.status = "approved"` are exported for release builds. Drafts are for development.
- Each breaking format change bumps the `schema` value and is listed in `CHANGELOG.md` with upgrade steps. From version 1.0.0 it also ships a migration script.

### 13.6 Cross-checks

- Core and every adapter run the golden vectors.
- An engine screenshot (debug overlay) and the tool's render differ by at most 1 px.

## 14. Image-generation integration

- **`gen-bbox`:** one screen box per object or group, with a short description from `types[].genHint`. Configurable format: normalized 0–1000 or pixels; `[y0, x0, y1, x1]` or `[x0, y0, x1, y1]`.
- **Layout references:** block image and per-object masks (PNG).
- **After generation:** a hook for external measuring tools to compare object positions in the new image with the layout. Measuring is outside the core.
- Generation never writes back to the scene file.

## 15. Graybox gameplay hooks

- Anchors, zones and lanes carry a `kind` with gameplay meaning. The game-rules layer (outside this project) reads it.
- **Later:** an editor "dry run" mode: moving objects follow lanes to anchors, to reveal jams, crowding and occlusion.

## 16. Code architecture

```
src/
  core/      pure TypeScript: schema, model, projection, geometry, checks, displayList, describe (later: sort, solver, patch)
  cli/       Node: arguments, file I/O, SVG output (PNG from stage 5 via resvg-wasm, optional dependency)
  editor/    from stage 2: one HTML page + ES modules, no framework; draws the displayList on Canvas 2D
schema/      isoblock-1.json
tests/
  golden/    projection.json (stage 6 adds sort.json)
  fixtures/  *.scene.json + *.expected.json (synthetic scenes, maintained by the maintainer)
docs/        AGENT_GUIDE.md
dist/        build output, not committed
```

- **The core draws nothing.** It outputs a **display list** (polygons, colors, draw order, labels). The editor draws it on Canvas; the CLI writes SVG. One geometry source, two outputs.
- **Clean code rules:**
  - pure functions, no global state;
  - immutable data (each patch creates a new scene);
  - the core imports no Node built-in modules and does not use `process` or the DOM;
  - one file per check, at most 150 lines, with its own test;
  - few dependencies (JSON Schema validation only, unless the maintainer approves more);
  - fixed seeds;
  - coded errors;
  - TypeScript strict mode.
- **Size budget (guide):** core about 5,500 lines after stage 6 (3,578 after stage 3); editor 1,500–2,000; each adapter 150–300.
- Engine adapters live outside this package until stage 5 decides their layout.

## 17. Roadmap and acceptance criteria

| Stage | Scope | Done when |
|---|---|---|
| 1 | Schema, projection, geometry, display list, SVG; checks `in_region`, `no_overlap`, `clearance`, `lane_clear`, `lane_reaches`, `visible`; `skip` for unsupported checks and lane shapes; CLI `validate`, `check`, `render` (SVG), `describe`; exit codes of section 11 | All tests pass; `tests/golden/projection.json` matches; all `tests/fixtures/*.scene.json` match their `*.expected.json` within tolerance; `render` of `yard` produces an SVG that opens and shows the expected layout |
| 2 | Editor: drag on both views, locks, undo, save, live check panel | 200 objects at 60 fps on a mid-range phone, measured on `tests/fixtures/crowd.scene.json` in headless Chromium with 4x CPU slowdown, phone profile (390x844 CSS px at pixel ratio 2, touch, one view), one pointer move per animation frame: the 95th-percentile interval between animation frames is at most 18.4 ms (1.1 display intervals); dragging a locked object is blocked; a saved file parses to the same data as the file opened, and saving twice gives byte-identical files |
| 3 | Patches: short commands and JSON Patch, lock rejection, log; `diff`; `compare` | The 20 patches in `tests/fixtures/patches/` give their expected results; `compare` on `yard` with the 3 variants in `tests/fixtures/compare/` gives `yard.expected.json`, and its `text` and `md` output equal `yard.expected.txt` and `yard.expected.md` byte for byte |
| 4 | Solver and minimal conflict set | A synthetic scene with conflicting hard relations returns the expected minimal conflict set |
| 5 | `export` targets `runtime`, `godot`, `gen-bbox`; Godot adapter; cross golden tests; PNG render | The sample scene loaded in Godot differs by at most 1 px |
| 6 | States, `sort_consistency` and slicing, `reachable`, `capacity` | The bundled tests pass |

Export targets `phaser` and `tiled` are not scheduled.

Patch fixtures: `tests/fixtures/patches/<name>.patch` with `<name>.expected.json` = `{ base, tolerance, exit, status, error, locks, diff, checks, failing }`. `base` names `tests/fixtures/<base>.scene.json`; `exit` is the exit code of `isoblock patch` on a copy of that scene; `error` is the error code or `null`; `locks`, `diff`, `checks` and `failing` are the fields of the `--json` report (`failing` is `null` unless the patch is applied). Check values compare within `tolerance.value` (pixels `tolerance.valuePx`), diff numbers within `tolerance.coordinate`; messages are not compared.

One stage per branch. A stage starts only after the previous one is squash-merged into `main`. Before opening a stage, the maintainer adds the fixtures and expected results its acceptance criteria need. The maintainer reviews by behavior (`describe`, render, check results on fixtures), not by reading code.

Versions: the maintainer sets `version` in `package.json` in the release commit on the builder branch. Stage N releases as `0.N.0`; fixes between stages bump the patch number.

## 18. Known limits

- **Boxes are not final shapes.** Re-check visibility and collisions once real art exists. Parts that follow the art closely reduce the error.
- **Orthographic projection does not shrink distant objects.** A backdrop stays as wide as the foreground, so it is often drawn at its own scale (a `decor` strip). Physical scale is not checked there.
- **A simple solver can get stuck in a weak solution.** People can always drag and lock.
- **Each engine sorts draw order its own way.** Golden tests and `sort_consistency` are mandatory.

## 19. Open questions

1. Should the base unit be meters or a reference height? A reference height suits art; meters suit mixed character sizes. A declared conversion may cover both.
2. Is free rotation needed?
3. Should walkable areas be polygons or grids?
4. Is concurrent editing needed? (Initially: no.)
5. Should the runtime file be complete, or reduced to what engines need?

## 20. Repository workflow

Three roles work with this repository:

- **Builder:** a coding agent or person that implements one roadmap stage per branch. Instructions: `AGENTS.md`.
- **Maintainer:** owns this spec and the test data, answers questions, reviews builder branches and prepares releases. Instructions: `MAINTAINING.md`.
- **Repository owner:** the only one who writes to `main`.

| File | Content | Edited by |
|---|---|---|
| `SPEC.md` | This specification | Maintainer |
| `AGENTS.md`, `MAINTAINING.md` | Role instructions | Maintainer |
| `ROADMAP.md` | Stages with task checklists and acceptance criteria from section 17 | Maintainer opens and closes stages; builder ticks tasks |
| `QUESTIONS.md` | Unclear points. The builder asks, picks the safest reading and records it; the maintainer answers | Both |
| `tests/golden/`, `tests/fixtures/` | Test data and expected results | Maintainer |
| `docs/AGENT_GUIDE.md` | Guide for agents that use the tool: install, commands, patch syntax, check meanings, `describe` and `compare` examples | Builder |
| `CHANGELOG.md` | Changes per stage; scene-format breaks; migration scripts | Builder writes under `Unreleased`; the maintainer renames it to the version in the release commit |
| `log/` | One file per work session | Whoever ran the session |

**Branches and releases**
- Only the repository owner writes to `main`, in two ways: commits made and signed on the owner's machine, or squash-merges of pull requests, done by the owner on GitHub or locally. Every commit on `main` therefore carries the owner's identity.
- Builders push only to their own branch. The maintainer pushes to its own branches and adds the release commit to a reviewed builder branch. Both open pull requests against `main`; neither merges, tags, or writes to `main`.
- At the end of a stage the builder records "branch ready for review" in its session log, pushes the branch and opens a pull request.
- The maintainer reviews the branch, pushes a release commit to it (version, roadmap, changelog, next-stage fixtures), and posts the review result and a squash commit message as a pull request comment. The review is a comment, not a formal approval.
- The owner squash-merges the pull request. That squash commit on `main` is the release, identified by `version` and commit hash. No tags or GitHub Releases are required.
- The maintainer's own changes (spec, answers, test data) follow the same path from a maintainer branch.
- `dist/` is not committed. Build it from the merged commit with `npm run build`. Outputs: `dist/isoblock.mjs` (single-file CLI) and, from stage 2, `dist/editor.html` (single-file editor).

**Content rules**
- Everything under version control is written in plain technical English: code, comments, messages, tests, docs, logs, commit messages.
- This repository is project-neutral. It never contains names, scenes, measurements or criteria taken from a specific game or client project. Fixtures and examples are synthetic.
- Commit messages, pull request descriptions and comments contain no links to agent sessions or chats (for example `Claude-Session` lines).
- A stage's checklist is ticked only for work that was done and verified in that session.

---

## Appendix A. Sample scene `yard`

A small synthetic yard: a backdrop strip and a walkable floor; a tree with a wide canopy; an actor standing behind the tree; two crates placed too close together; a bench in front of the tree; a walking path across the floor; a vehicle lane in the foreground.

Full file: `tests/fixtures/yard.scene.json`. The scene **contains three deliberate failures**: the crates are 0.2 apart (minimum 0.5), the vehicle lane leaves the frame through the bottom edge instead of the right edge of the view region, and the canopy hides about 40% of the actor's upper body.

## Appendix B. `describe` output example

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

Format rules:
- Header: starts with `scene <id> v<version> <status>`; without `meta`, `v<version> <status>` is left out. `px/<unit>` uses `units.name`.
- Object table: columns are left-aligned; each is as wide as its widest cell (header included) plus a gap of 2 spaces after `id`, `type` and `rot`, and 3 after `pos(u,v)` and `size(w,d,h)`. `size` is the type's size before rotation.
- `*` follows each number that an assumption path points to. The line `(* = provisional value)` appears only when a `*` is printed.
- Lists inside check lines (ids, occluders) are joined with `, `.
- Positions, sizes, gaps and assumption values: 2 decimals (up to 4 when 2 would lose information). Pixel values: whole numbers after `≈`. Fractions: whole percentages.
- Assumption paths are shortened: `/types/<t>/size/<0|1|2>` prints as `<t>.size.<w|d|h>`; `/types/<t>/parts/<k>/box/<0..5>` prints as `<t>.<part id>.<u0|v0|h0|u1|v1|h1>`; any other path prints as the JSON Pointer. Entries are joined with ` · `.
- Camera label: `iso30`, `dimetric21`, or `u<angleU>/v<angleV>`.
- The frame label names the first region without `blocksScene`.
- One line per failing, warning or skipped check, in `checks` order, using these templates (`WARN` lines use the same template as `FAIL`):
  - `FAIL <id> in_region <ids, comma-separated>: outside <region>` (append `/<strip>` when a strip is given)
  - `FAIL <id> no_overlap <a×b, …>: <n> overlapping pairs`
  - `FAIL <id> clearance <a×b>: gap <value> < <min>`
  - `FAIL <id> lane_clear <lane>: blocked by <ids, comma-separated>`
  - `FAIL <id> lane_reaches <lane>: meets <edge> edge at y≈<value> (<region> y <y0>-<y1>)`, or `FAIL <id> lane_reaches <lane>: does not reach <edge> edge`
  - `FAIL <id> visible <target>: <percent>% occluded (<occluders, comma-separated>)`
  - `SKIP <id> <check>: <message>`
- With no such line, print `checks: all N pass` (`checks: none` when the scene declares no checks).
- No assumptions: `assumptions: -`.

## Appendix C. Golden vectors for projection

Full set (inverse projection and a 2:1 camera included): `tests/golden/projection.json`.

Camera: `angleU 30`, `angleV 150`, `pxPerUnit 100`, `verticalScale 1`, `origin [0, 0]`. Rounded to 3 decimals.

| (u, v, h) | (x, y) |
|---|---|
| (1, 0, 0) | (86.603, 50.000) |
| (0, 1, 0) | (−86.603, 50.000) |
| (0, 0, 1) | (0.000, −100.000) |
| (2, 1, 0.5) | (86.603, 100.000) |
| (1.5, 0.25, 1.2) | (108.253, −32.500) |

Camera direction: `c = (1, 1, 1)`.

## Appendix D. `compare` output example

Output of `isoblock compare tests/fixtures/yard.scene.json --variant A=tests/fixtures/compare/yard.A.patch --variant B=tests/fixtures/compare/yard.B.patch --variant C=tests/fixtures/compare/yard.C.patch` (`tests/fixtures/compare/yard.expected.txt`). Variant C moves the locked tree, so it is invalid.

```
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
