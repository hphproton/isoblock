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
- `zones[]` requires `id`. `states.<name>` is an object whose only key is `hide` (plus `x-` keys); `hide`, when present, is an array of object ids. A state only hides objects; moving objects in a state is not scheduled. `relations[]` requires `rel` from section 7; `order_along` needs `ids`, every other `rel` needs `a`.
- `kind`, `dir` and `facing` are free strings. Vocabulary checks belong to a project profile.
- `ids`, when present on a check, must be non-empty. Absent means all objects.
- `checks[].check` must be a name from section 9. For checks not implemented in the current stage, only `id` and `check` are validated.
- A file that fails the schema or a reference check stops with an error message.
- Also schema errors (`E_SCHEMA`): a camera whose ground axes are parallel (`angleU` equal to `angleV` modulo 180); a negative size or lane width; a `locks` entry that is not `pos`, `pos.u`, `pos.v`, `rot`, `type` or a JSON Pointer.

Reference rules (`E_REF`):

- Ids are unique within `frame.regions`, `strips`, `objects`, `zones`, `lanes`, `relations` and `checks`, and within the parts and the anchors of one type.
- `objects[].type` names a key of `types`.
- Relation `a`, `b` and `ids` resolve to an object id, `zone:<id>`, `lane:<id>`, `strip:<id>.v0` or `strip:<id>.v1`.
- Parameters of checks implemented in the current stage name existing regions, strips, zones, lanes, objects and anchors (`lane:<id>`, `anchor:<object id>/<anchor id>`, section 9.2). Parameters of checks not implemented yet are not resolved.
- `states.<name>.hide` names existing objects.
- Every `assumptions[].path` is a JSON Pointer that resolves in the file.

## 7. Relations

Each relation has `id`, `rel`, `hard` (bool, default `false`), `weight` (soft relations, default 1) and `source` (the original sentence, for traceability; optional). A relation is measured on the ground (h = 0) and gives a **violation** ≥ 0.

| `rel` | `a` | `b` | Parameters (default) | Measured value q |
|---|---|---|---|---|
| `left_of`, `right_of` | object | object | `gap [min, max]` ([0, ∞)) | Screen-x separation of the two footprints |
| `in_front_of`, `behind` | object | object | `gap` ([0, ∞)) | Ground-depth separation of the two footprints |
| `gap` | object | object | `gap` ([0, ∞)) | Edge-to-edge distance, as `clearance` in 9.1 |
| `against` | object | object, `lane:<id>` or `strip:<id>.v0\|v1` | `gap` ([0, 0]) | Distance to the target |
| `inside` | object | `zone:<id>` | — | Largest distance from a footprint corner to the zone |
| `aligned` | object | object | `axis` `u` or `v` (required) | Difference of the footprint centers along the axis |
| `facing` | anchor | object or point | — | Not measured yet (`skip`) |
| `on_lane` | object | `lane:<id>` | `t [min, max]` ([0, 1]) | Offset from the lane and position along it |
| `clear_of` | object | object or `lane:<id>` | `min` (0) | Distance to the target |
| `order_along` | — | — | `ids` (2 or more objects), `axis` (`u`) | Order of the footprint centers |

Definitions (footprints, corners and centers as in 9.1; `EPS` and the lane shape rule from 9.1):

- **Screen x on the ground:** `s(u, v) = (u·axisU.x + v·axisV.x) / pxPerUnit`. **Ground depth:** `d(u, v) = (cu·u + cv·v) / hypot(cu, cv)` with `c` from section 5. A footprint's range of s or d is taken over its 4 corners.
- **Separation:** `left_of`: min s(b) − max s(a); `right_of`: min s(a) − max s(b); `in_front_of`: min d(a) − max d(b); `behind`: min d(b) − max d(a).
- **Band violation** of a value q with `[min, max]`: `max(0, min − q) + max(0, q − max)`. It is the violation of `left_of`, `right_of`, `in_front_of`, `behind`, `gap` and `against`.
- **Distance to a target:** to an object, the `clearance` distance; to a lane, the `clearance` distance to the lane rectangle (other lane shapes: `skip`); to a strip edge `strip:<id>.v0` or `.v1`, the line v = that bound: `max(0, v0 − c, c − v1)` for a footprint from v0 to v1 (`skip` when the bound is `null`).
- **`inside`:** the zone needs 3 or more points (else `skip`); the distance of a corner is 0 inside or on the boundary, else its distance to the nearest edge.
- **`on_lane`:** p = center of a; q = the point of the lane polyline nearest to p (the first one along the lane when several are equally near); e = |p − q|; t = length along the lane up to q divided by the lane length. Violation `max(0, e − width/2) + length × (band violation of t with the `t` range)`. A lane of length 0 is `skip`.
- **`clear_of`:** violation `max(0, min − distance) + overlap`, where overlap = min(overlap along u, overlap along v) when the footprints overlap (both > EPS), else 0.
- **`aligned`:** violation = the center difference. **`order_along`:** sum over consecutive ids of `max(0, center_i − center_(i+1))` along the axis.
- **Status:** `skip` when the relation, its targets, a lane shape or a parameter the schema does not enforce (`axis` of `aligned`, 2 or more ids of `order_along`, a missing `b`) is not supported (`violation: null`, the message says why); `satisfied` when the violation is at most 1e-6; else `violated`.
- **Soft penalty:** the sum of `weight × violation` over soft relations that are not skipped.
- **Result shape:** `{ id, rel, hard, status, violation, ids, message }`; `ids` = the objects named in `a`, `b` and `ids`, in object order, also for `skip`; `violation` is rounded to 6 decimals (status and soft penalty use the exact value).

`isoblock relations scene.json [--json]` prints the results: `--json` gives `{ "scene", "results" }`; the text format gives a summary line, then `OK|BAD|SKIP <id> <rel>: <message>` per relation. It exits 0 when every hard relation is satisfied, else 1 (a skipped hard relation is not satisfied).

## 8. Solver

`isoblock solve scene.json [--only a,b] [-o proposal.json] [--patch moves.patch] [--json]`

- **Movable:** the objects (only those in `--only`, when given) without a `pos` lock. A `pos.u` or `pos.v` lock fixes that coordinate, and so does a pointer lock on `/objects/<i>/pos/<k>` or on a pointer that contains it. An empty or unknown id in `--only`, or `-o` or `--patch` naming the input file or each other, is `E_USAGE`. The solver never changes rotation, type or sizes, never edits relations and never writes the input file. It proposes; a person or agent accepts.
- **Constraints** on a proposal besides the hard relations: the 4 corners of every moved footprint project inside the view region (the first frame region without `blocksScene`, edges inclusive); a moved footprint does not overlap another footprint (as in `no_overlap`) unless the two overlapped before solving.
- **Grid:** a coordinate the solver changes is a multiple of 0.05, rounded to 6 decimals. Everything else keeps its exact value.
- **Objective,** in this order: no violated hard relation and no broken constraint; the smallest soft penalty; the smallest total ground distance moved.
- **Deterministic:** the same input gives the same proposal, byte for byte.
- **Outcome:** `solved` when every hard relation that is not skipped is satisfied and the constraints hold. Else `conflict`, with a **minimal conflict set** found by deletion filtering: start from all hard relations that are not skipped; in file order, drop a relation when the solver still finds no solution without it; the relations left are the set (empty when the constraints alone cannot be met).
- **Algorithm** (a guide; the contract is the list above):
  1. Order: locked objects stay; then the most constrained objects; then the rest.
  2. For each movable object, try grid positions inside the view region, coarse to fine. Score by the objective.
  3. Repeat until no improvement or N rounds.
- **Report:** `--json` prints `{ "scene", "status", "hardViolated", "softPenalty", "distance", "moved": [{ "id", "from", "to" }], "conflict", "relations" }`: `hardViolated` = ids of hard relations violated in the proposal; `relations` = the results of section 7 for the proposal. The text format starts with `solve <scene id>: solved|conflict`, then one line per moved object and the conflict set.
- **Outputs:** for `conflict` the proposal is the best layout found with all hard relations and may break constraints. `-o` writes the proposal (the scene with the new positions, assumption values following their paths as in `patch`) in the saved format of section 10. `--patch` writes a short-command patch: the line `# solve proposal`, then one `move` per moved object in object order with its offsets (an axis with no offset is left out), so that `patch` applies the proposal with lock checks and the log.
- **Exit:** 0 when `solved` and every check of the proposal is `pass` or `warn`; else 1.
- **Performance:** 50 objects in under 200 ms in a browser. Measured as the core solve of `tests/fixtures/solver/perf.scene.json` in Node, median of 5 runs.

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

Messages: builders choose message wording, except the `lane_reaches` message above, the `reachable` messages of section 9.2 and the `describe` lines in Appendix B.

### 9.2 Exact definitions for stage 6

Tolerance and EPS as in 9.1; `reachable` values are units, `min_screen_size` values are pixels. A point parameter is `[u, v]`, `lane:<id>` (the lane's first point for `from`, its last point for `to`), or `anchor:<object id>/<anchor id>` (the anchor's ground point after rotation; its h is ignored).

| `check` | Parameters | Computation | `value` |
|---|---|---|---|
| `reachable` | `from`, `to` (points), `area` (optional zone id), `radius` (default 0.2), `step` (default 0.1), `ignore` (optional object ids), `max` (optional) | Walkable area: the polygon of `area`, else every zone with `kind: "walkable"` and at least 3 points; none: `skip`. Grid cell (i, j), for all integers i and j, has its center at ((i + 0.5)·step, (j + 0.5)·step). A cell is free when its center is inside the walkable area, not inside a zone with `kind: "blocked"`, and at a distance of at least `radius − EPS` from the footprint of every object except those in `ignore` and the objects whose anchors `from` and `to` name. A point is inside a polygon when the even-odd test says so or its distance to the boundary is at most EPS. Start and target: the free cell whose center is nearest the point (distances within EPS of the smallest count as equal; then smaller i, then smaller j). When that distance exceeds `step + EPS`: `fail`, `value = null`, message `start is not on walkable ground` or `target is not on walkable ground`. Path: fewest moves between free cells that share an edge; none: `fail`, `value = null`, message `no walkable path`. Passes when a path exists and, with `max`, `value <= max + EPS` | Moves × step, rounded to 6 decimals |
| `capacity` | `kind`, `min`, `body` (default `[0.5, 0.5]`), `ids` (optional), `allow` (optional) | Candidates: the anchors whose `kind` equals `kind`, of the objects in `ids` (default all); objects in file order, anchors in type order. A candidate's body is the rectangle `body` (w along u, d along v, never rotated) centered on its ground point. Each candidate in order is accepted when its body overlaps (as in `no_overlap`) neither the footprint of an object other than its own and those in `allow`, nor the body of a candidate already accepted. Passes when `value >= min` | Number of accepted candidates |
| `min_screen_size` | `target`, `min` (pixels), `screenWidth` (optional, default `frame.w`) | Height of the screen bounds of the 8 corners of every part of the target, times `screenWidth / frame.w`. Passes when `value >= min − EPS` | Pixels |

Threshold, ids and extra fields:
- `reachable`: `threshold = max` (`null` without it); `ids` = the objects whose anchors `from` and `to` name, in the order of `objects`, each once.
- `capacity`: `threshold = min`; `ids` = the objects with at least one candidate, in the order of `objects`; `accepted` and `rejected` = labels `<object id>/<anchor id>` in candidate order.
- `min_screen_size`: `threshold = min`; `ids = [target]`.
- A zone named by `area` with fewer than 3 points: `skip`.
- `area` may name a zone of any kind; blocked zones are cut out of it too. Zones with fewer than 3 points take no part as walkable or blocked ground. With `radius: 0` objects block no cell. No free cell at all gives `start is not on walkable ground`. A grid of more than 4,000,000 cells is `skip`, with a message that asks for a larger `step`.
- `anchor:<object id>/<anchor id>`: ids may contain `/`; the first split from the left at which the object and an anchor of its type both exist is used.
- `capacity`: objects outside `ids` still block bodies; `ids` of the result also lists objects whose candidates were all rejected. `min_screen_size` values are rounded to 6 decimals.

**States.** `--state NAME` evaluates the scene without the objects in `states.NAME.hide`:
- A check that names a hidden object by itself (`clearance` `a` or `b`, `visible` or `min_screen_size` `target`, an anchor in `reachable` `from` or `to`) is `skip`.
- Lists (`ids`, `allow`, `ignore`) lose the hidden objects; a list that loses all of them names no object (it does not mean all objects). Hidden objects do not overlap, block, occlude or count anywhere.
- Without `--state` every object is present.

## 10. Editor (web page)

- **Two views:** isometric with the scene camera, and a top-down plan (more precise dragging, nothing hidden).
- **Drag:** screen to ground, grid snap, keep h. Locked objects cannot be dragged and show a lock icon. A drag changes `pos` only; snap applies to `pos` (default step 0.1). A press becomes a drag after the pointer moves 3 px (mouse), 4 px (pen) or 8 px (touch).
- **Plan view:** u to the right, v down; objects drawn by their top faces.
- **Property panel:** numbers with units; a lock toggle per property; provisional mark for assumptions.
- **Check panel:** pass/fail updates live; tapping a row highlights the objects involved.
- **Toggleable overlays:** strips, lanes, zones, anchors, frame regions, occlusion rays, sort points.
- **State switch:** day, night, events (not scheduled).
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
isoblock relations scene.json [--json]  # relation results (section 7)
isoblock solve    scene.json [--only a,b] [-o proposal.json] [--patch moves.patch] [--json]
isoblock render   scene.json [--state NAME] -o out.svg|out.png
isoblock describe scene.json            # compact summary for agents (section 12)
isoblock patch    scene.json patch.txt [-o out.json] [--dry-run] [--json]
isoblock diff     a.json b.json [--json]
isoblock compare  scene.json --variant A=a.patch --variant B=b.patch [--state NAME] [--format text|md|json] [--render]
isoblock export   scene.json --target runtime|gen-bbox [-o out.json] [--bbox-units px|norm1000] [--bbox-order xyxy|yxyx] [--state NAME]
```

Commands and flags arrive in the stages listed in section 17. A command, flag, export target or output format not available in the current stage is a usage error (exit 2) that names the stage that adds it, or says it is not scheduled. Examples in stage 1: `--state` (stage 6), `render -o out.png` (stage 5). `compare --render` and the export targets `godot`, `phaser` and `tiled` are not scheduled.

`render` requires `-o`; the file extension selects the format: `.svg`, or `.png` from stage 5 (section 14).

`--state NAME` (stage 6) applies to `check`, `render`, `compare` and `export --target gen-bbox`: the command works on the scene in that state (section 9.2); hidden objects are not drawn and get no generation box. An unknown state name is a usage error, `default` included unless the scene defines it. `check --json --state` prints `{ "scene", "results" }` as without a state. With `export --target runtime` it is a usage error: the runtime file carries all states from stage 7.

`export` writes to `-o`, else to stdout, in the saved format of section 10. `--target` is required; `-o` naming the input file is a usage error. `--bbox-units` and `--bbox-order` belong to `gen-bbox`; with `runtime` they are a usage error.

`check` output:
- Default: one summary line, then one line per check: `PASS|FAIL|WARN|SKIP <id> <check>: <message>`.
- `--json`: `{ "scene", "results" }`; `results` has the same shape as in `*.expected.json`. Expected files omit `message` except where 9.1 fixes its wording; comparisons ignore other messages.

Exit codes:

| Code | Meaning |
|---|---|
| 0 | Success. For `check`, `patch` and `solve`: every check of the resulting scene is `pass` or `warn` (for `solve` also: `solved`). For `relations`: every hard relation is satisfied |
| 1 | `check`, `patch`, `solve`: at least one check of the resulting scene is `fail` or `skip` (for `solve` also: `conflict`). `relations`: a hard relation is violated or skipped. A check the tool could not evaluate is not a pass |
| 2 | Invalid input or usage: unreadable file, malformed JSON, schema or reference error, malformed or failing patch, unknown or unavailable command or flag. Error codes: `E_IO`, `E_JSON_PARSE`, `E_SCHEMA`, `E_REF`, `E_PATCH`, `E_USAGE` |
| 3 | `patch`: the patch touches a lock (`E_LOCK`) |
| 70 | Internal error (`E_INTERNAL`) |

`validate`, `render`, `describe`, `diff`, `compare` and `export` exit 0 when they complete, even if checks fail.

### 11.1 `compare`: variants by measured values

- **Input:** a base scene and 1–4 variants, `--variant NAME=FILE`, in the order given. A variant file is a patch (section 12) or another scene file (a JSON object with `schema`). Optionally at one state (`--state`, stage 6): every column is evaluated in that state, and the header names it; without it the header says `default`. The hidden objects are those of the base scene's state, also for a scene variant with its own `states`; they are left out of `moved`.
- **Method:** apply each variant to a copy of the base, ignoring locks but recording the locks it touches, and run the base scene's checks on every column. A variant file whose first non-blank character is `{` is a scene; any other file is a patch. Names are unique, not empty and not `base`. A variant that is malformed or produces an invalid scene stops `compare` with exit 2.
- **Measures** (the JSON output has all of them):
  - `failing`: number of checks with status `fail` or `skip` (violated hard relations and the soft penalty are not scheduled for `compare`; use `relations`);
  - `locksTouched`: labels `<object id>.<lock>` of the base locks the variant touches (section 12); any entry marks the variant invalid;
  - `checks`: every check with its label, threshold, `values` (one per column), `status` (one per column) and `delta` (value minus the base value, rounded to 6 decimals; `null` for the base and for values that are `null` or not numbers);
  - `moved`: objects present in both scenes whose `pos` moved more than 1e-9, as `count` and total `distance` (sum of ground distances, rounded to 6 decimals); `null` for the base.
- **Check labels:** `in_region <region>[/<strip>] (objects outside)`, `no_overlap (pairs)`, `clearance <a>×<b> (<unit>)` with the ids in the order of the result's `ids`, `lane_clear <lane> (blocking objects)`, `lane_reaches <lane> (y px)`, `visible <target> (% occluded)`, `reachable <check id> (<unit>)`, `capacity <check id> (usable <kind>)`, `min_screen_size <target> (px)`.
- **Variant labels:** the first comment line of the patch (section 12), else the variant name.
- **`text` format** (Appendix D is the contract): line 1 `compare <scene id> · state <state> · base vs <names>`; line 2 `<name> = <label>` for each variant, joined with ` · `; then a table. Rows: `failing checks`; `locks touched` (count, then ` ✗ (<labels>)` when not zero); one row per check that is `fail` or `skip` in some column, or whose value differs from the base in some column (a non-zero delta, or `null` against a number), in `checks` order; `objects moved / total (<unit>)` (`-` for the base, else `<count> / <distance>`). Cells: counts as integers; clearance values and distances with 2 decimals; `lane_reaches` whole pixels (`none` when `null`); `visible` whole percent; `reachable` with 2 decimals (`none` when `null`); `capacity` as an integer; `min_screen_size` whole pixels, halves up; `skip` for skipped checks; ` ✗` after a value whose status is `fail` or `skip`. Columns are left-aligned; each column is as wide as its widest cell (header included, counted in Unicode code points) plus 2 spaces; trailing spaces are removed.
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
| `solve ...` | Not a patch command (usage error): run `isoblock solve --patch` and apply its patch |

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

### 13.2 Loading at runtime

- The game ships the runtime file of an approved scene (section 13.7). A thin engine adapter reads it, places nodes with the same projection, applies the file's draw order, and turns zones, lanes and anchors into gameplay objects.
- **Pros:** one source; hot reload during development; switching engines means rewriting only the adapter (about 150–300 lines).
- **Cons:** the engine's editor does not show the layout unless the adapter runs in the editor (for example a Godot `@tool` script). That is not scheduled.
- Generating engine scenes at build time (`.tscn` for Godot, scene JSON for Phaser, TMX/JSON for Tiled) is not scheduled: a second loading path would double the upkeep and drift from the first.

### 13.3 Adapter contract (every engine)

- `project(u, v, h) → (x, y)`, matching the golden vectors.
- Draw order from the runtime file: a part with a smaller `order` is drawn earlier. Adapters do not sort static objects themselves. Moving objects: stage 6 (section 13.4).
- Zones become areas, lanes become paths, anchors become oriented points (`seat`, `queue_point`, `spawn`, `exit`, `wait`) that keep their `kind` and `facing`.
- Validate on load: the `schema` value and duplicate ids. Report errors; never ignore them silently.
- From stage 7: `instantiate(type) → node` through the type → prefab/scene/sprite map, with the image pivot at the type's ground-contact anchor from the asset contract, together with slicing (section 13.4); types without a mapping are reported; on a state change, apply that state's overrides (hide/show, reposition). Stage 5 adapters draw parts as debug boxes.

### 13.4 Draw order: the main isometric trap

- Engines usually sort by one point per sprite (pivot y). That works for tile-sized objects. Long objects (a row of seats, a wall, a vehicle) sort wrong when a character walks around them.
- **Fixes, in order of preference:**
  1. Slice long objects along their long axis; each slice is a sprite with its own sort point.
  2. Split an object into a front part and a back part.
  3. Static objects: precomputed topological order. Moving objects: sort by foot depth.
- **Tool support:** `sort_consistency` walks a test actor through points around each object, compares the engine rule with geometric order, and reports objects that need slicing. Export includes `slices` for them (stage 7).
- **Painter's order of parts** (from stage 5 the rule for `render`, the editor and the runtime file):
  1. List every part of every object: objects in file order, parts in type order (a type without parts has one part, `body`). A part's position in this list is its index.
  2. For each part: its world box (section 6); `c` = the camera direction of section 5 with each component rounded to 9 decimals; `depth` = `c · center` of the box, rounded to 6 decimals; its screen bounds = the smallest and largest x and y of its 8 projected corners.
  3. Two parts need an order only when their screen bounds overlap by more than EPS along x and along y.
  4. Each axis (u, v, h) along which the two boxes are apart (the upper end of one is at most the lower end of the other plus EPS) votes: when `|c|` on that axis is at most EPS, the pair needs no order; otherwise the vote puts first the box on the side away from the camera (the lower box when `c` is positive on that axis). Votes that disagree: no order. No axis apart: the box with the smaller depth goes first; equal depths need no order.
  5. Place parts one at a time: among the unplaced parts whose required predecessors are all placed, take the one with the smallest depth, then the smallest index. When there is none (a cycle), take the unplaced part with the smallest depth, then the smallest index.
  - The rounding in step 2 keeps exact ties exact, so every implementation gives the same order. Ground, outlines and labels of the display list keep their place.

### 13.5 Flow and versions

```
scene.json (git) → isoblock export --target runtime → <game>/data/scenes/<id>.json → adapter
```

- Release builds load only scenes with `meta.status = "approved"`; drafts are for development. The runtime file carries the status and the game enforces this; `export` writes drafts too.
- Each breaking change of the scene format or the runtime format bumps its `schema` value and is listed in `CHANGELOG.md` with upgrade steps. From version 1.0.0 it also ships a migration script.

### 13.6 Cross-checks

- Core and every adapter run the golden vectors of `tests/golden/projection.json`, within 0.001.
- An engine screenshot of the adapter's debug drawing (section 13.8) and the tool's render agree:
  - **Each object alone** (every other object hidden): the box of the object's pixels lies within 1 px of the box of its polygons in the SVG of `render`, on every edge. Pixel boxes run from the first to one past the last pixel. Both boxes are clipped to the frame; an object outside the frame draws nothing in either.
  - **Whole frame:** compared with a painter's raster of the SVG object polygons (each pixel center takes the last polygon that contains it, in document order, else the background), at most 100 pixels per 1,000,000 differ in which object they show.
  - A pixel center exactly on a polygon edge belongs to the polygon by the top-left rule, as GPUs fill. An object whose clipped SVG box is less than 1 px wide or high may cover no pixel center; it then has no pixel box, and that is not a failure.
  - Two runs give identical PNG bytes.
- Each object is also measured alone because an edge that another object hides cannot be measured in the whole frame.

### 13.7 Runtime file (`isoblock-runtime/1`)

`export --target runtime` writes the layout an engine needs: a reduced copy of the scene without relations, checks, locks, assumptions or generation hints.

```json
{ "schema": "isoblock-runtime/1", "scene": "yard", "meta": { "version": 1, "status": "draft" },
  "units": {}, "camera": {}, "cameraDir": [1, 1, 1], "frame": {}, "strips": [], "objects": [], "zones": [], "lanes": [] }
```

- Top-level keys in that order. `scene` is the scene `id`; `meta.version` and `meta.status` come from the scene's `meta`, `null` when absent.
- `units` and every entry of `strips`, `zones` and `lanes` are copied from the scene file without their `x-` keys, keys in file order. An absent list is `[]`.
- `camera`: `angleU`, `angleV`, `pxPerUnit`, `verticalScale` (default 1), `origin`. `cameraDir`: the `c` of section 13.4, with its 9 decimals.
- `frame`: `w`, `h` and `regions`, each `{ "id", "rect", "blocksScene" }` (`blocksScene` default `false`).
- `objects` in file order, each `{ "id", "type", "pos", "rot", "footprint", "tags", "parts", "anchors" }`:
  - `rot` defaults to 0; `footprint` is `[u0, v0, u1, v1]` after rotation (section 6); `tags` is `[]` when the object has none.
  - `parts` in type order, each `{ "id", "box", "order" }`: `box` is `[u0, v0, h0, u1, v1, h1]` in world units after rotation; `order` is the part's position in the painter's order of section 13.4 (0 is drawn first).
  - `anchors`: the type's anchors as `{ "id", "at", "facing", "kind" }`, `at` = `[u, v, h]` in world units after rotation; `facing` and `kind` only when the type gives them. `[]` when the type has none.
- Numbers the tool computes (footprints, part boxes, anchor positions) are rounded to 6 decimals; `pos` and copied values are written as they are in the scene. The file uses the saved format of section 10. Same input, same bytes.
- Not in stages 5 and 6: states and slices (stage 7).

### 13.8 Godot adapter

- Lives in `adapters/godot/`: GDScript for Godot 4.7 with the Compatibility renderer, 150–300 lines without its tests. It is not npm code and imports nothing from `src/`.
- Loads a runtime file and builds a `Node2D` tree: one node per object; one child per part with `z_index` = `order` (absolute). A scene with more parts than the `z_index` range holds is an error.
- **Debug drawing:** each part draws the faces of its box that point toward the camera (as the display list does) as `Polygon2D` with antialiasing off, in one flat color per object that the caller chooses.
- Each anchor becomes a `Marker2D` named by its id at its projected point, with `kind` and `facing` as metadata. Each zone becomes a `Polygon2D` of its projected ground points and each lane a `Line2D` through its projected points; both are hidden by default and keep their data as metadata.
- A wrong `schema` value or a duplicate id is reported with its code, and nothing is built. Codes: `E_SCHEMA`, `E_DUPLICATE_ID`, `E_Z_RANGE` (more parts than the `z_index` range), `E_IO`, `E_JSON_PARSE`.
- **Tests:** `npm run test:godot` runs the golden vectors and the cross-checks of section 13.6 for every case in `tests/fixtures/export/cases.json`, at frame size, 1 px per frame unit, under Xvfb with Godot 4.7.1 (`GODOT` names the binary). It is not part of `npm test`, because Godot is not an npm package; the maintainer runs it at review.

## 14. Image-generation integration

- **`gen-bbox`** (`export --target gen-bbox`): one screen box per object, with a short description from `types[].genHint`, for image-generation tools that place objects by boxes.

```json
{ "schema": "isoblock-genbbox/1", "scene": "yard", "frame": { "w": 1000, "h": 1000 }, "units": "px", "order": "xyxy",
  "boxes": [{ "id": "tree", "type": "tree", "box": [383.14, 220, 604.84, 488], "clipped": false, "hint": "young tree with a round canopy" }] }
```

  - `box`: the screen bounds of every corner of every part of the object, intersected with the frame `[0, 0, w, h]`. An object is left out when that intersection is at most EPS wide or at most EPS high. `clipped` is `true` when the frame cut the bounds.
  - `--bbox-units px` (default): pixels rounded to 2 decimals. `norm1000`: `x · 1000 / w` and `y · 1000 / h`, rounded to integers, halves up.
  - `--bbox-order xyxy` (default): `[x0, y0, x1, y1]`. `yxyx`: `[y0, x0, y1, x1]`.
  - `hint` only when the type has a `genHint`. Boxes follow file order. Groups are not scheduled.
- **Block image** (`render -o out.png`, stage 5): the SVG that `render -o out.svg` writes, without its text elements, rasterized by `@resvg/resvg-wasm` at 1 px per frame unit with no fonts loaded. Text is left out, so the image does not depend on the fonts of the machine. `dist/isoblock.mjs` carries the WebAssembly module and needs no other file.
- **Per-object masks:** not scheduled.
- **After generation:** a hook for external measuring tools to compare object positions in the new image with the layout. Measuring is outside the core.
- Generation never writes back to the scene file.

## 15. Graybox gameplay hooks

- Anchors, zones and lanes carry a `kind` with gameplay meaning. The game-rules layer (outside this project) reads it.
- **Later:** an editor "dry run" mode: moving objects follow lanes to anchors, to reveal jams, crowding and occlusion.

## 16. Code architecture

```
src/
  core/      pure TypeScript: schema, model, projection, geometry, checks, displayList, describe (later: sort, solver, patch)
  cli/       Node: arguments, file I/O, SVG output; PNG from stage 5 via @resvg/resvg-wasm, bundled into dist/isoblock.mjs
  editor/    from stage 2: one HTML page + ES modules, no framework; draws the displayList on Canvas 2D
schema/      isoblock-1.json
adapters/
  godot/     from stage 5: GDScript adapter for Godot 4.7 and its test project (section 13.8)
scripts/     build and test scripts (test-godot.mjs from stage 5)
tests/
  golden/    projection.json (stage 7 adds sort.json)
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
  - few dependencies: `ajv`, and `@resvg/resvg-wasm` from stage 5 (more only when the maintainer approves);
  - fixed seeds;
  - coded errors;
  - TypeScript strict mode.
- **Size budget (guide):** core about 7,000 lines after stage 7 (5,694 after stage 6); editor 1,500–2,000; each adapter 150–300.
- Engine adapters live in `adapters/<engine>/`. They are not npm code, import nothing from `src/`, and read only the runtime file.

## 17. Roadmap and acceptance criteria

| Stage | Scope | Done when |
|---|---|---|
| 1 | Schema, projection, geometry, display list, SVG; checks `in_region`, `no_overlap`, `clearance`, `lane_clear`, `lane_reaches`, `visible`; `skip` for unsupported checks and lane shapes; CLI `validate`, `check`, `render` (SVG), `describe`; exit codes of section 11 | All tests pass; `tests/golden/projection.json` matches; all `tests/fixtures/*.scene.json` match their `*.expected.json` within tolerance; `render` of `yard` produces an SVG that opens and shows the expected layout |
| 2 | Editor: drag on both views, locks, undo, save, live check panel | 200 objects at 60 fps on a mid-range phone, measured on `tests/fixtures/crowd.scene.json` in headless Chromium with 4x CPU slowdown, phone profile (390x844 CSS px at pixel ratio 2, touch, one view), one pointer move per animation frame: the 95th-percentile interval between animation frames is at most 18.4 ms (1.1 display intervals) in at least one of up to 3 runs, each on a fresh page, where a run must meet every condition of its test, because a busy host drops frames now and then; dragging a locked object is blocked; a saved file parses to the same data as the file opened, and saving twice gives byte-identical files |
| 3 | Patches: short commands and JSON Patch, lock rejection, log; `diff`; `compare` | The 20 patches in `tests/fixtures/patches/` give their expected results; `compare` on `yard` with the 3 variants in `tests/fixtures/compare/` gives `yard.expected.json`, and its `text` and `md` output equal `yard.expected.txt` and `yard.expected.md` byte for byte |
| 4 | Relations (section 7), `relations`, solver and minimal conflict set (section 8) | `relations` on `tests/fixtures/relations/relations.scene.json` gives its expected results; every scene in `tests/fixtures/solver/` meets its expected file; the solve of `perf` meets the performance rule of section 8 |
| 5 | Painter's order of parts (section 13.4); `export --target runtime` (section 13.7) and `gen-bbox` (section 14); PNG render (section 14); Godot adapter and its cross-checks (sections 13.6, 13.8) | Every case in `tests/fixtures/export/cases.json` meets its expected files: the runtime file, and the `gen-bbox` file for each listed flag set, equal their expected files as JSON (same keys in the same order, numbers within the case file's tolerances) and are byte-identical over two runs; for each case with a `png`, `render -o out.png` decodes to the same size as that PNG and each RGBA channel of each pixel is within 1 of it; `dist/isoblock.mjs`, copied alone into an empty directory, writes a PNG; `npm run test:godot` passes section 13.6 on every case |
| 6 | States (hiding objects) and `--state` for `check`, `render`, `compare` and `export --target gen-bbox`; checks `reachable`, `capacity` and `min_screen_size` (section 9.2) | `check --json` on `tests/fixtures/gameplay/walk.scene.json` gives `walk.expected.json`; every case of `tests/fixtures/states/cases.json` meets its expected files; earlier fixtures still match |
| 7 | `sort_consistency` and slicing (section 13.4); runtime file with states and slices; Godot adapter: states, `instantiate` by type with pivots, sorting of moving objects | Criteria and fixtures are written when the stage opens |

Export targets `godot`, `phaser` and `tiled`, the check `state_stable` and states that move objects are not scheduled.

Gameplay fixture: `tests/fixtures/gameplay/walk.scene.json` with `walk.expected.json`, in the format of the stage 1 check fixtures; messages are compared only where 9.1 or 9.2 fixes them.

State fixtures: `tests/fixtures/states/cases.json` = `{ cases, compare }`. Each case `{ scene, state, checks, genBbox, png }`: `check --json --state <state>` matches `checks` (format and tolerance of the check fixtures; the file also names its `state`); `export --target gen-bbox --state <state>` matches `genBbox` (as the stage 5 `gen-bbox` files, `px` tolerance 0.02) unless it is `null`; `render --state <state> -o out.png` matches `png` (each RGBA channel within 1) unless it is `null`. Each `compare` entry `{ scene, state, variants: [{ name, file }], expected: { json, text, md } }`: `compare --state <state>` with the variants in that order gives `text` and `md` byte for byte and `json` as the stage 3 compare fixture. Paths in `scene` are from the repository root; the others are in `tests/fixtures/states/`.

Export fixtures: `tests/fixtures/export/cases.json` = `{ tolerance, cases }`, each case `{ name, scene, runtime, genBbox: [{ args, file }], png }`. `scene` is a path from the repository root; `runtime`, `file` and `png` are file names in `tests/fixtures/export/`; `args` are the flags added to `export --target gen-bbox`; `png` is `null` when the case has none. Tolerances: `world` for runtime numbers, `px` and `norm1000` for `gen-bbox` numbers by unit, `pngChannel` for PNG channels. The expected PNGs come from resvg 2.6.2 with no fonts loaded.

Patch fixtures: `tests/fixtures/patches/<name>.patch` with `<name>.expected.json` = `{ base, tolerance, exit, status, error, locks, diff, checks, failing }`. `base` names `tests/fixtures/<base>.scene.json`; `exit` is the exit code of `isoblock patch` on a copy of that scene; `error` is the error code or `null`; `locks`, `diff`, `checks` and `failing` are the fields of the `--json` report (`failing` is `null` unless the patch is applied). Check values compare within `tolerance.value` (pixels `tolerance.valuePx`), diff numbers within `tolerance.coordinate`; messages are not compared.

Relation fixture: `tests/fixtures/relations/relations.expected.json` = `{ scene, tolerance, results }`, with `id`, `rel`, `hard`, `status`, `violation` (within `tolerance.value`) and `ids` per relation; messages are not compared.

Solver fixtures: `tests/fixtures/solver/<name>.scene.json` with `<name>.expected.json` = `{ scene, only, status, conflict, hardViolated, maxSoftPenalty, maxDistance, unchanged, referenceSoftPenalty, referenceDistance }`. `isoblock solve` (with `--only` when `only` is not `null`) must give `status` and exactly `conflict`; for `solved`: no violated hard relation (`hardViolated` is `[]`), the constraints of section 8 hold, `softPenalty` ≤ `maxSoftPenalty`, `distance` ≤ `maxDistance`, the objects in `unchanged` keep their positions, every changed coordinate is on the 0.05 grid, and two runs give byte-identical output. `maxSoftPenalty` is the maintainer's reference result plus 0.5; `maxDistance` is twice the reference distance, at least the reference distance plus 2. The `reference*` fields are information.

One stage per branch. A stage starts only after the previous one is squash-merged into `main`. Before opening a stage, the maintainer adds the fixtures and expected results its acceptance criteria need. The maintainer reviews by behavior (`describe`, render, check results on fixtures), not by reading code.

Versions: the maintainer sets `version` in `package.json` in the release commit on the builder branch. Stage N releases as `0.N.0`; fixes between stages bump the patch number.

## 18. Known limits

- **Boxes are not final shapes.** Re-check visibility and collisions once real art exists. Parts that follow the art closely reduce the error.
- **Orthographic projection does not shrink distant objects.** A backdrop stays as wide as the foreground, so it is often drawn at its own scale (a `decor` strip). Physical scale is not checked there.
- **A simple solver can get stuck in a weak solution.** People can always drag and lock. A weak solver also widens the conflict set, because deletion filtering trusts it to find solutions.
- **Each engine sorts draw order its own way.** Golden tests and `sort_consistency` are mandatory. The runtime file carries the order of static parts so that adapters do not sort them.
- **The block image has no text** (section 14).
- **`reachable` works on a grid.** A gap close to `step + 2 · radius` wide may open or close as the grid shifts; use a smaller `step` where it matters.

## 19. Open questions

1. Should the base unit be meters or a reference height? A reference height suits art; meters suit mixed character sizes. A declared conversion may cover both.
2. Is free rotation needed?
3. Should walkable areas be polygons or grids?
4. Is concurrent editing needed? (Initially: no.)

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
