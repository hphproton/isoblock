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
- Free rotation of objects. Only 0, 90, 180 and 270 degrees. The camera may look from any direction (section 5).
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
| Camera | Projection parameters from ground to screen: two axis angles and a scale, or (from stage 12) an elevation, a direction and a scale |
| Frame | Target canvas (for example 1000×1000) and its screen regions: view, HUD, safe area |
| Type | Shared template: size, parts, anchors, generation hint |
| Object | Instance of a type: position with an optional base height, rotation in 90° steps, locks, tags |
| Part | Sub-box of a type (trunk, canopy, roof). Needed for correct occlusion and draw order |
| Sprite | What an engine draws and sorts as one item: a whole object, or one slice of a long object (section 13.4) |
| Actor | A moving object the game adds at runtime (a character, a cart). Not in the scene file |
| Anchor | Meaningful point with a facing: ground contact, seat, queue point, hang point, speech bubble |
| Zone | Ground polygon with a purpose (walkable, blocked, interaction, queue), at a height: below 0 for a sunken area, above 0 for a raised one (stage 12) |
| Strip | Band along one axis, defined by a v range. Useful for scenes built in layers |
| Lane | Polyline with width, direction and kind (walk, vehicle), at a height that may change from point to point (stage 12) |
| Relation | Constraint between objects, zones and lanes; hard or soft |
| Check | Function returning pass, fail, warn or skip, with a measured value and a message |
| Lock | Ban on changing one property |
| State | Override set for one state: night, rain, an event. It hides objects and, from stage 12, parts of objects and frame regions |
| Assumption | Provisional value with a note, origin and owner |
| Profile | Project-specific vocabulary: types, anchor kinds, extra checks |

## 5. Coordinates and projection

A camera has one of two forms. Stages 1 to 11 have the axes form only; stage 12 adds the view form.

- **Axes form:** `angleU`, `angleV` (degrees from the screen x axis, y pointing down), `pxPerUnit`, `verticalScale` (default 1), `origin [x, y]`.
- **View form** (stage 12): `elevation` (degrees above the ground, greater than 0 and at most 90), `direction` (degrees, default 45: the horizontal direction from the scene toward the camera, measured from +u toward +v), `scale` (pixels per unit across the view, greater than 0), `origin [x, y]`.

Both forms give three screen vectors:

```
axes form:  axisU = pxPerUnit · (cos angleU, sin angleU)
            axisV = pxPerUnit · (cos angleV, sin angleV)
            up    = (0, −pxPerUnit · verticalScale)

view form:  axisU = scale · (sin direction, sin elevation · cos direction)
            axisV = scale · (−cos direction, sin elevation · sin direction)
            up    = (0, −scale · cos elevation)

screen(u, v, h) = origin + u·axisU + v·axisV + h·up
```

- **The view form is an orthographic camera** that looks down at `elevation` from `direction`. A horizontal segment of 1 unit across the view is `scale` px long; a vertical edge of 1 unit is `scale · cos elevation` px; a ground axis is shorter on screen the more it points toward the camera, so the two ground axes have equal screen lengths only when `direction` is 45 plus a multiple of 90. At direction 45 the view form equals the axes form with `angleU = atan(sin elevation)`, `angleV = 180 − angleU`, `pxPerUnit = scale · sqrt((1 + sin² elevation) / 2)` and `verticalScale = cos elevation / sqrt((1 + sin² elevation) / 2)`; true isometric is `elevation = asin(tan 30°) ≈ 35.264` with `scale = pxPerUnit · sqrt(3/2)`.
- **Unit length** `N`: `pxPerUnit` in the axes form, `scale` in the view form. Relations measure screen x in units of `N` (section 7).
- **True isometric:** `angleU = 30`, `angleV = 150`, `verticalScale = 1`.
- **2:1 pixel art:** `angleU ≈ 26.565`, `angleV ≈ 153.435`. `verticalScale` follows the art convention.
- **Inverse for dragging:** from screen to ground at height h0, solve the 2×2 linear system of `axisU` and `axisV`.
- **Camera direction** is the vector `c = (cu, cv, 1)` with `cu·axisU + cv·axisV = −up`; every point on a line along `c` projects to the same screen point. `depth = cu·u + cv·v + h`; larger means closer to the camera. For true isometric, `c = (1, 1, 1)`. In the view form `c = (cot elevation · cos direction, cot elevation · sin direction, 1)`, and `(0, 0, 1)` at elevation 90.
- **"Left/right" for the viewer** is the sign of screen x. **"Front/behind"** follows `depth`. Relations are written from the viewer's side and mapped to world axes through the camera, so they stay valid when the camera changes.
- **Golden vectors:** every implementation (core, engine adapters) must match `tests/golden/projection.json` (see Appendix C), with view-form cameras from stage 12.

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
- `pos` is the `(min u, min v)` corner of the footprint **after rotation**. From stage 12 it may have a third number, the object's **base height** (default 0): its parts, anchors and size box are raised by it, so an object can stand on another (section 9.5).
- The footprint used by overlap, clearance and lane checks is always the rectangle from `size`, even when parts stick out. Parts are used for occlusion and drawing and rotate with the object.
- A type without `parts` has one part: the whole `size` box.
- `parts[].box` is `[u0, v0, h0, u1, v1, h1]` in type coordinates.
- `anchors[]`: `id`, `at [u, v, h]` in type coordinates, `facing`, `kind`. Anchors rotate with the object.
- `types.<t>.front` and `anchors[].front` (stage 15, optional): the side the type or the anchor faces, `"+u"`, `"-u"`, `"+v"` or `"-v"` in type coordinates. It turns with the object's `rot`, as the footprint does: at 90, +u becomes +v and +v becomes −u. The relation `facing` measures it (section 7). `facing` stays a free string.
- `strips[].v` is `[min, max]` along v; `null` means unbounded on that side.
- `zones[].h` (stage 12, default 0) is the height of the zone's polygon: below 0 for a sunken area such as a channel, above 0 for a raised one.
- `lanes[].h` (stage 12, default 0) is the lane's height. A lane point is `[u, v]` or, from stage 12, `[u, v, h]`: its own height, which overrides the lane's. A lane whose points all have the same height is **flat** at that height (section 9.5).
- `states.<name>` hides objects (`hide`), parts of objects (`hideParts`, stage 12: object id → part ids) and frame regions (`hideRegions`, stage 12). A type without `parts` has one part, `body`.
- `units.perMeter` is the number of units per meter, or `null` when the unit is not tied to meters.
- Relation targets (`a`, `b`): an object id, `zone:<id>`, `lane:<id>`, or a strip edge `strip:<id>.v0` / `strip:<id>.v1`; from stage 15 also `anchor:<object id>/<anchor id>` as `a` of `facing` (section 7).
- `locks` lists property paths: `pos`, `pos.u`, `pos.v`, `pos.h` (stage 12), `rot`, `type`, or a JSON Pointer. A pointer is absolute in the scene file; a pointer into a type (for example `/types/<t>/size/2`) blocks that value for every object of the type.
- Every unsettled number has an entry in `assumptions`. The editor marks it as provisional.
- A strip with `kind: "decor"` is art-directed backdrop. Physical scale is not checked there (section 18).

Schema rules (`schema/isoblock-1.json`):

- Required top-level keys: `schema`, `id`, `units`, `camera`, `frame`, `types`, `objects`. Optional: `strips`, `zones`, `lanes`, `relations`, `checks`, `states`, `assumptions`, `meta`.
- Required fields inside: `units.name`; `camera.origin` and either `angleU`, `angleV`, `pxPerUnit` (`verticalScale` defaults to 1) or, from stage 12, `elevation` and `scale` (`direction` defaults to 45), with no key of the other form; `frame.w`, `h`, `regions`; region `id`, `rect` (`blocksScene` optional); strip `id`, `v`; type `size`; part `id`, `box`; anchor `id`, `at`; object `id`, `type`, `pos` (2 numbers, or 3 from stage 12; `rot` defaults to 0); zone `id` (`kind`, `points`, a ground polygon of at least 3 `[u, v]` points, and from stage 12 `h` are optional); lane `id`, `width`, `points` (at least 2, each of 2 numbers, or 3 from stage 12; `h` optional from stage 12); relation `id`, `rel`; check `id`, `check` plus the parameters sections 9.1 to 9.7 require; assumption `path`, `value`. Everything else shown in the example is optional, and so are the keys later stages add: `front` on types and anchors and `angle` on relations (stage 15, a number from 0 to 180).
- Strict where this spec defines a shape: unknown keys are errors (catches typos). Keys starting with `x-` are always allowed, for extensions.
- `zones[]` requires `id`. `states.<name>` is an object whose keys are `hide` and, from stage 12, `hideParts` and `hideRegions` (plus `x-` keys), all optional: `hide` is an array of object ids, `hideParts` an object whose keys are object ids and whose values are arrays of part ids, `hideRegions` an array of frame region ids. A state hides; moving objects in a state is not scheduled. `relations[]` requires `rel` from section 7; `order_along` needs `ids`, every other `rel` needs `a`.
- `kind`, `dir` and `facing` are free strings. Vocabulary checks belong to a project profile.
- `ids`, when present on a check, must be non-empty. Absent means all objects.
- `checks[].check` must be a name from section 9. For checks not implemented in the current stage, only `id` and `check` are validated.
- A file that fails the schema or a reference check stops with an error message: the error code, a message and one detail line per problem. `validate --json` prints the same as JSON (section 11).
- Also schema errors (`E_SCHEMA`): a camera whose ground axes are parallel (`angleU` equal to `angleV` modulo 180); from stage 12, a view-form camera with an `elevation` not greater than 0 or greater than 90, or a `scale` not greater than 0; a negative size or lane width; a `locks` entry that is not `pos`, `pos.u`, `pos.v`, `pos.h`, `rot`, `type` or a JSON Pointer.

Error details (stage 10):

- A detail line that reports an unknown name ends with ` (did you mean "<name>"?)` when a known name is within Levenshtein distance 2 of it (insertions, deletions and substitutions of code points, case-sensitive). The nearest name is suggested; on a tie, the first in the order of the pool. Pools: for `check`, the names of section 9; for `rel`, the names of section 7; for a property the schema does not allow, the property names the schema allows at that place; for an object's `type`, the keys of `types`; for a reference to an object, region, strip, zone, lane or state, the ids of that kind in file order; for a part in `hideParts` (stage 12) and in the short commands `hide` and `show` (stage 14), the part ids of the object's type in type order; for a relation target, the object ids, then `zone:<id>`, `lane:<id>`, `strip:<id>.v0` and `strip:<id>.v1` of the scene, in file order, and from stage 15 for `a` of `facing` then `anchor:<object id>/<anchor id>` of every anchor (objects in file order, anchors in type order). Without a name within distance 2, nothing is appended. The `E_PATCH` message of a short command that names an unknown object gets the same suffix (section 12).
- A detail that only says a value must match one of several schemas (`oneOf`, a discriminator) is left out when another detail reports a problem at or below its path; from stage 15 so is a detail that only says a value must match the `then` or `else` schema of a condition. Fixtures: `tests/fixtures/invalid/` (section 17).

Reference rules (`E_REF`):

- Ids are unique within `frame.regions`, `strips`, `objects`, `zones`, `lanes`, `relations` and `checks`, and within the parts and the anchors of one type.
- `objects[].type` names a key of `types`.
- Relation `a`, `b` and `ids` resolve to an object id, `zone:<id>`, `lane:<id>`, `strip:<id>.v0` or `strip:<id>.v1`; from stage 15 `a` of `facing` may also resolve to `anchor:<object id>/<anchor id>`, by the rule of section 9.2 (the first split from the left at which the object and an anchor of its type both exist). An anchor anywhere else is a reference error.
- Parameters of checks implemented in the current stage name existing regions, strips, zones, lanes, objects and anchors (`lane:<id>`, `anchor:<object id>/<anchor id>`, section 9.2). Parameters of checks not implemented yet are not resolved.
- `states.<name>.hide` names existing objects. From stage 12, the keys of `states.<name>.hideParts` name existing objects, each of its part ids names a part of that object's type (`body` for a type without `parts`), and `states.<name>.hideRegions` names existing frame regions.
- Every `assumptions[].path` is a JSON Pointer that resolves in the file.

## 7. Relations

Each relation has `id`, `rel`, `hard` (bool, default `false`), `weight` (soft relations, default 1) and `source` (the original sentence, for traceability; optional). A relation is measured on the ground (h = 0) and gives a **violation** ≥ 0. Base heights and the heights of zones and lanes (stage 12) do not change it.

| `rel` | `a` | `b` | Parameters (default) | Measured value q |
|---|---|---|---|---|
| `left_of`, `right_of` | object | object | `gap [min, max]` ([0, ∞)) | Screen-x separation of the two footprints |
| `in_front_of`, `behind` | object | object | `gap` ([0, ∞)) | Ground-depth separation of the two footprints |
| `gap` | object | object | `gap` ([0, ∞)) | Edge-to-edge distance, as `clearance` in 9.1 |
| `against` | object | object, `lane:<id>` or `strip:<id>.v0\|v1` | `gap` ([0, 0]) | Distance to the target |
| `inside` | object | `zone:<id>` | — | Largest distance from a footprint corner to the zone |
| `aligned` | object | object | `axis` `u` or `v` (required) | Difference of the footprint centers along the axis |
| `facing` | object or `anchor:<object id>/<anchor id>` | object, `zone:<id>` or `lane:<id>` | `angle` in degrees (45) | Angle between its front and the direction to the target (stage 15; before it `skip`) |
| `on_lane` | object | `lane:<id>` | `t [min, max]` ([0, 1]) | Offset from the lane and position along it |
| `clear_of` | object | object or `lane:<id>` | `min` (0) | Distance to the target |
| `order_along` | — | — | `ids` (2 or more objects), `axis` (`u`) | Order of the footprint centers |

Definitions (footprints, corners and centers as in 9.1; `EPS` from 9.1; the lane shape of 9.1, and from stage 15 that of 9.8):

- **Screen x on the ground:** `s(u, v) = (u·axisU.x + v·axisV.x) / N`, with the unit length `N` of section 5 (`pxPerUnit` in the axes form). **Ground depth:** `d(u, v) = (cu·u + cv·v) / hypot(cu, cv)` with `c` from section 5. A footprint's range of s or d is taken over its 4 corners.
- **Separation:** `left_of`: min s(b) − max s(a); `right_of`: min s(a) − max s(b); `in_front_of`: min d(a) − max d(b); `behind`: min d(b) − max d(a).
- **Band violation** of a value q with `[min, max]`: `max(0, min − q) + max(0, q − max)`. It is the violation of `left_of`, `right_of`, `in_front_of`, `behind`, `gap` and `against`.
- **Distance to a target:** to an object, the `clearance` distance; to a lane, the `clearance` distance to the lane rectangle (other lane shapes: `skip`), and from stage 15 the distance to the lane shape of 9.8: the smallest polygon distance between the footprint and one of its pieces (a lane without a piece: `skip`); to a strip edge `strip:<id>.v0` or `.v1`, the line v = that bound: `max(0, v0 − c, c − v1)` for a footprint from v0 to v1 (`skip` when the bound is `null`).
- **`inside`:** the zone needs 3 or more points (else `skip`); the distance of a corner is 0 inside or on the boundary, else its distance to the nearest edge.
- **`on_lane`:** p = center of a; q = the point of the lane polyline nearest to p (the first one along the lane when several are equally near); e = |p − q|; t = length along the lane up to q divided by the lane length. Violation `max(0, e − width/2) + length × (band violation of t with the `t` range)`. A lane of length 0 is `skip`.
- **`clear_of`:** violation `max(0, min − distance) + overlap`, where overlap = min(overlap along u, overlap along v) when the footprints overlap (both > EPS), else 0. From stage 15, for a lane target, overlap = the largest penetration (9.8) of the footprint into one of the lane's pieces when it is above EPS, else 0; for a lane of two points along u or v this is the stage 1 value.
- **`facing`** (stage 15): the **facing point** F and **front** f of `a`: for an object, the center of its footprint and the unit vector of its type's `front`; for `anchor:<object id>/<anchor id>`, the anchor's ground point (as in 9.2) and the unit vector of the anchor's `front`; either turned by the object's `rot` (section 6). The **target point** T: the footprint center of an object; for `zone:<id>`, F itself when F is inside the zone or on its boundary (as in `reachable`, 9.2), else the nearest point of its boundary; for `lane:<id>`, the point of the lane polyline nearest to F (on ties the first along the lane, as in `on_lane`). θ = the angle in degrees between f and T − F, from 0 to 180, and 0 when |T − F| ≤ EPS. Violation `max(0, θ − angle) · π / 180` (radians, so that it weighs like the distances of the other relations). `skip` when `a` is neither an object nor an anchor, when its type or anchor has no `front`, when `b` is not an object, a zone or a lane, for a zone of fewer than 3 points and for a lane of length 0. `ids` lists the object of an anchor.
- **`aligned`:** violation = the center difference. **`order_along`:** sum over consecutive ids of `max(0, center_i − center_(i+1))` along the axis.
- **Status:** `skip` when the relation, its targets, a lane shape or a parameter the schema does not enforce (`axis` of `aligned`, 2 or more ids of `order_along`, a missing `b`) is not supported (`violation: null`, the message says why); `satisfied` when the violation is at most 1e-6; else `violated`.
- **Soft penalty:** the sum of `weight × violation` over soft relations that are not skipped.
- **Result shape:** `{ id, rel, hard, status, violation, ids, message }`; `ids` = the objects named in `a`, `b` and `ids`, in object order, also for `skip`; `violation` is rounded to 6 decimals (status and soft penalty use the exact value).

`isoblock relations scene.json [--json]` prints the results: `--json` gives `{ "scene", "results" }`; the text format gives a summary line, then `OK|BAD|SKIP <id> <rel>: <message>` per relation. It exits 0 when every hard relation is satisfied, else 1 (a skipped hard relation is not satisfied).

## 8. Solver

`isoblock solve scene.json [--only a,b] [--rotate] [-o proposal.json] [--patch moves.patch|-] [--json]`

- **Movable:** the objects (only those in `--only`, when given) without a `pos` lock. A `pos.u` or `pos.v` lock fixes that coordinate, and so does a pointer lock on `/objects/<i>/pos/<k>` or on a pointer that contains it. An empty or unknown id in `--only`, or `-o` or `--patch` naming the input file or each other, is `E_USAGE`. The solver never changes rotation (except with `--rotate`, below), type, sizes or base heights, never edits relations and never writes the input file. It proposes; a person or agent accepts.
- **Constraints** on a proposal besides the hard relations: the 4 corners of every moved footprint, at the object's base height, project inside the view region (the first frame region without `blocksScene`, edges inclusive); a moved object does not overlap another (as in `no_overlap`: footprints in stages 4 to 11, boxes from stage 12, section 9.5) unless the two overlapped before solving.
- **Grid:** a coordinate the solver changes is a multiple of 0.05, rounded to 6 decimals. Everything else keeps its exact value.
- **Objective,** in this order: no violated hard relation and no broken constraint; the smallest soft penalty; the smallest total ground distance moved, where an object moves by the ground distance between its footprint centers before and after (for an object that does not turn, the distance its `pos` moves); with `--rotate`, then the fewest turned objects.
- **Turning (stage 15):** with `--rotate` the solver may also set the `rot` of each movable object that has no `rot` lock, no `pos`, `pos.u` or `pos.v` lock, and no pointer lock at or above `/objects/<i>/rot` or `/objects/<i>/pos` or below `/objects/<i>/pos` (the **turnable** objects), to 0, 90, 180 or 270. A turned object's footprint follows section 6; the constraints and the grid rule apply to the footprint at its new rotation. Without `--rotate` nothing turns, and every result of stages 4 to 14 stays as it was.
- **Deterministic:** the same input gives the same proposal, byte for byte.
- **Outcome:** `solved` when every hard relation that is not skipped is satisfied and the constraints hold. Else `conflict`, with a **minimal conflict set** found by deletion filtering: start from all hard relations that are not skipped; in file order, drop a relation when the solver still finds no solution without it; the relations left are the set (empty when the constraints alone cannot be met).
- **`conflict` is not a proof.** It means the solver found no layout, not that none exists: a search from poor start positions (for example objects that start inside a lane or on top of each other) can miss a layout that meets every hard relation, and the conflict set then names more relations than needed (section 18). The usual remedy is to place the objects roughly by hand, or to solve fewer objects with `--only`, and solve again.
- **Algorithm** (a guide; the contract is the list above):
  1. Order: locked objects stay; then the most constrained objects; then the rest.
  2. For each movable object, try grid positions inside the view region, coarse to fine. Score by the objective.
  3. Repeat until no improvement or N rounds.
- **Report:** `--json` prints `{ "scene", "status", "hardViolated", "softPenalty", "distance", "moved": [{ "id", "from", "to" }], "conflict", "relations" }`: `hardViolated` = ids of hard relations violated in the proposal; `relations` = the results of section 7 for the proposal. With `--rotate` (stage 15) it also has `turned`: `[{ "id", "from", "to" }]`, the rotations of the turned objects in object order, after `moved`; `moved` lists the objects whose `pos` changed, so a turned object whose footprint is square may be in `turned` only. The text format starts with `solve <scene id>: solved|conflict`, then one line per moved object, one per turned object and the conflict set.
- **Outputs:** for `conflict` the proposal is the best layout found with all hard relations and may break constraints. `-o` writes the proposal (the scene with the new positions, assumption values following their paths as in `patch`) in the saved format of section 10. `--patch` writes a short-command patch: the line `# solve proposal`, then one `move` per moved object in object order with its offsets (an axis with no offset is left out), so that `patch` applies the proposal with lock checks and the log. From stage 15, for an object that turned, a `rot <id> <rot>` line comes before its `move`, whose offsets then run from the position that `rot` gives (it keeps the footprint center, section 12) to the proposed one. From stage 11, `--patch -` writes that patch to standard output instead, and no report is printed, so that `isoblock solve scene.json --patch - | isoblock patch scene.json -` applies the proposal; `--json` together with `--patch -` is `E_USAGE`.
- **Exit:** 0 when `solved` and every check of the proposal is `pass` or `warn`; else 1.
- **Performance:** 50 objects in under 200 ms in a browser. Measured as the core solve of `tests/fixtures/solver/perf.scene.json` in Node, median of 5 runs.

## 9. Check catalog

| `check` | Passes when |
|---|---|
| `in_region` | Footprints lie inside a frame region and, optionally, a strip. From stage 9 it can measure what is drawn instead: the screen box of all parts at their heights, with an allowed share outside |
| `no_overlap` | Objects do not overlap, except declared pairs (for example a person on a seat). Stages 1 to 11 compare footprints; from stage 12 boxes, so an object resting on another and a flat object pass (section 9.5) |
| `clearance` | Edge-to-edge gap between A and B is at least `min` |
| `lane_clear` | No object blocks a lane, except objects that belong to it (listed in `ignore`). From stage 12 at the lane's height, up to a clear height (section 9.5); from stage 15 on any polyline lane, ramps and stairs included (section 9.8) |
| `lane_reaches` | A lane meets a given frame edge inside a region |
| `lane_apart` | A lane keeps at least a distance from another lane or from a zone, and does not overlap it (from stage 9) |
| `reachable` | A walkable path exists from an entry to an anchor (BFS on a fine grid). From stage 12 on one level, given by a height (section 9.5); from stage 15 across levels, through the lanes that join them (section 9.8) |
| `capacity` | N anchors of kind X are usable at once, counting seated bodies |
| `visible` | The required part of an object (for example its upper 45%) is occluded no more than a threshold. Uses rays toward the camera through parts |
| `min_screen_size` | On-screen height of an object is at least a pixel value (legibility). From stage 9 it can measure only the vertical extent of the parts, for example a character's height on screen |
| `sort_consistency` | An engine that sorts one key per sprite (section 13.4) draws a test actor and the objects in their geometric order; reports objects where it does not, with the area drawn wrong |
| `visible_share` | Each listed object shows at least a share of its own pixels in a frame region, measured on the object raster of section 14.1 (from stage 13, section 9.6) |
| `state_stable` | Static objects keep their position across states |

Result shape: `{ id, check, status: pass|fail|warn|skip, value, threshold, ids[], message }`. `message` is one line.

Status `skip` means the tool could not evaluate the check: the check is not implemented in the current stage, or its input has a shape the current stage does not support. Skip is never a pass (section 11). A skip result has `value: null`, `threshold: null`, `ids: []` and a message that says why.

Status `warn` (from stage 14) means the check passes, but its value lies inside the warning margin that its `warn` parameter sets next to its bound (section 9.7). It counts as a pass (section 11). Before stage 14 no check returns it.

Checks re-run incrementally: when an object changes, only checks that involve it run again.

### 9.1 Exact definitions for stage 1

These definitions are the contract with `tests/fixtures/*.expected.json`. Parameters are required unless marked optional or given a default. The maintainer computes the expected files with an implementation independent of the builder's code. Tolerance: `value` ±0.01 units; pixel values ±1 px. Comparison constant `EPS = 1e-9`.

| `check` | Parameters | Computation | `value` |
|---|---|---|---|
| `in_region` | `region` (required), `strip` (optional), `ids` (default: all objects) | Project the 4 footprint corners at h = 0. An object fails if a corner lies outside the region `rect` (edges inclusive), or if its footprint v range is not inside the strip's v range | Number of failing objects; `ids` = failing objects |
| `no_overlap` | `ids` (optional), `allow` (optional; list of permitted pairs, order-insensitive) | Two footprints overlap when the intersection along u **and** along v are both > EPS | Number of overlapping pairs; `ids` = objects involved; `pairs` = the pairs |
| `clearance` | `a`, `b`, `min` | Edge-to-edge distance: `hypot(max(0, b.u0−a.u1, a.u0−b.u1), max(0, b.v0−a.v1, a.v0−b.v1))`. Passes if ≥ `min` | The distance |
| `lane_clear` | `lane`, `ignore` (optional) | Lane must have exactly 2 points and be parallel to u or v; its shape is that segment widened by `width/2` on each side. An object blocks it when its footprint overlaps that rectangle (as in `no_overlap`). Other lane shapes: `skip` | Number of blocking objects; `ids` = blocking objects |
| `lane_reaches` | `lane`, `edge` (`right`, `left`, `top` or `bottom`; stages 1 to 9 evaluate `right` and `left` and return `skip` for the others; from stage 10 all four are evaluated), `region` | Same lane shape rule. Project the 4 lane corners; intersect that polygon with the frame edge line (`x = frame.w` for `right`, `x = 0` for `left`, `y = 0` for `top`, `y = frame.h` for `bottom`). Passes if an intersection exists and lies entirely inside the region's range along that line (its y range for `right` and `left`, its x range for `top` and `bottom`). No intersection: `fail`, `value = null`, `message = "lane does not reach edge"` | Largest y of the intersection (px) for `right` and `left`; largest x for `top` and `bottom` |
| `visible` | `target`, `from` (start height ratio, default 0.55), `maxOccluded` | Sample the faces of the target's `size` box that face the camera (normal · c > EPS): the top face fully; side faces only from `from·h` to `h`. Each face: 8×8 grid at cell centers, offset outward by 1e-6. Cast `p + t·c` (t > EPS) from each sample; a sample is occluded if the ray runs inside any part of another object for a length > EPS (slab test; touching a face, edge or corner does not count) | Occluded fraction (0–1) |

Threshold, ids and extra fields per check:
- `in_region`, `no_overlap`, `lane_clear`: `threshold = 0`; `ids` as in the table.
- `clearance`: `threshold = min`; `ids = [a, b]`.
- `lane_reaches`: `threshold = [y0, y1]` of the region for `right` and `left`, `[x0, x1]` for `top` and `bottom`; `ids = [lane id]`. Fixture for all four edges: `tests/fixtures/edges/edges.scene.json` (stage 10).
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

**States.** `--state NAME` evaluates the scene without the objects in `states.NAME.hide` (from stage 12 also without its hidden parts, and with its hidden regions, section 9.5):
- A check that names a hidden object by itself (`clearance` `a` or `b`, `visible` or `min_screen_size` `target`, an anchor in `reachable` `from` or `to`) is `skip`.
- Lists (`ids`, `allow`, `ignore`) lose the hidden objects; a list that loses all of them names no object (it does not mean all objects). Hidden objects do not overlap, block, occlude or count anywhere.
- Without `--state` every object is present.

### 9.3 Exact definition for stage 7

Tolerance and EPS as in 9.1. Areas are in frame pixels squared (px²); `worst` compares within the pixel tolerance.

| `check` | Parameters | `value` |
|---|---|---|
| `sort_consistency` | `actor` (`[w, d, h]`, required), `step` (default 0.1), `reach` (default 1), `maxPixels` (default 0), `area` (optional zone id), `ids` (optional object ids) | Number of examined objects whose worst area exceeds `maxPixels + EPS` |

Computation:

1. **Sprites:** every object's sprites and keys and the sprite list, as in section 13.4.
2. **Examined objects:** the objects in `ids` (default: all objects).
3. **Actor positions** of an examined object X: for all integers i and j, the point p = ((i + 0.5)·step, (j + 0.5)·step) and the actor footprint `[p.u − w/2, p.v − d/2, p.u + w/2, p.v + d/2]`. A position is used when the `clearance` distance (9.1) between that footprint and X's footprint is at most `reach + EPS`, the footprint overlaps (as in `no_overlap`) no object's footprint, and, with `area`, p is inside that zone and not inside a zone with `kind: "blocked"` and 3 or more points (inside as in `reachable`, 9.2). The actor box is the actor footprint from h = 0 to h = `actor[2]`; the actor key is the key of the actor footprint.
4. **Actor mismatches:** for each used position and each piece of each sprite of X: skip the piece when its box intersects the actor box (the two overlap by more than EPS along u, along v and along h). Otherwise, when the actor box and the piece need an order (section 13.4, painter's order steps 3 and 4, with the actor box as a part), the engine draws the actor after the sprite when the actor key ≥ the sprite key, else before. A mismatch is a pair where the engine's order differs from the needed order.
5. **Static mismatches:** for each piece P of a sprite S of X and each piece Q of a sprite T of another object, skipping pairs whose boxes intersect: when P and Q need an order, the engine draws S before T when key(S) < key(T), or when the keys are equal and S comes earlier in the sprite list. A mismatch is a pair where that order differs from the needed order.
6. **Wrong area** of a mismatch: the area of the intersection of the two outlines, where the outline of a box is the convex hull of its 8 projected corners. An object's worst area is the largest wrong area of its mismatches (actor and static), 0 without any.
7. **Status:** `fail` when an examined object's worst area exceeds `maxPixels + EPS`, else `pass`.

Threshold, ids and extra fields:
- `threshold = 0`; `ids` = the examined objects whose worst area exceeds `maxPixels + EPS`, in the order of `objects`; `worst` = the largest worst area of the examined objects, rounded to 2 decimals (0 when there is none); `positions` = the number of used actor positions, summed over the examined objects.
- Two `skip` rules, tried in this order: a zone named by `area` with fewer than 3 points; then `(u1 − u0 + 2·reach + w) · (v1 − v0 + 2·reach + d) / step²` above 4,000,000 for an examined object with footprint `[u0, v0, u1, v1]`, with a message that asks for a larger `step`.
- `positions` counts a position once for each examined object it is used for.
- Under a state (9.2), the sprites, keys and the painter's order that orders their pieces come from the scene without the hidden objects. Hidden objects have no sprites, block no actor position and are not examined; an `ids` list that loses all its objects examines none (`pass`, `value` 0).
- The wrong area is the size of the region that the engine draws in the wrong order when nothing else covers it. Bounding rectangles that overlap while the outlines only touch give an area of 0, so they never fail.

### 9.4 Exact definitions for stage 9

Tolerance and EPS as in 9.1. Values in pixels compare within 1 px, other values within 0.01.

**`in_region` with `measure`.** Optional parameter `measure`: `"footprint"` (default) or `"drawn"`.

- `"footprint"`: as in 9.1.
- `"drawn"`: the object's **drawn box** is the screen bounds of the 8 corners of every part (after rotation), as `min_screen_size` measures them (9.2). Its **share outside** is `1 − area(drawn box ∩ region rect) / area(drawn box)`; a drawn box with an area of at most EPS has a share outside of 0 when it lies inside the region rect (edges inclusive, within EPS), else 1. An object fails when its share outside exceeds `maxOutside + EPS`, or, with `strip`, when its footprint fails the strip rule of 9.1.
- `maxOutside` (optional, 0 to 1, default 0) is allowed only with `measure: "drawn"`; with the default measure it is a schema error.
- The result has the shape of 9.1, `threshold = 0` whatever `maxOutside` is. With `"drawn"` it also has `outside`: the shares outside of the failing objects, in the order of the result's `ids` (the order of `objects`), rounded to 6 decimals (`[]` when none fails).

**`min_screen_size` with `measure`.** Optional parameter `measure`: `"bounds"` (default) or `"height"`.

- `"bounds"`: as in 9.2.
- `"height"`: `(max h1 − min h0) · pxPerUnit · verticalScale · screenWidth / frame.w`, over the target's parts: the screen length of a vertical edge from the lowest to the highest part. It does not include the footprint's depth, so it matches "how tall a character looks". Rounded to 6 decimals; passes when `value >= min − EPS`.

**`lane_apart`.**

| Parameters | Computation | `value` |
|---|---|---|
| `lane` (lane id), `target` (`lane:<id>` or `zone:<id>`), `min` (default 0) | Shapes: a lane by the lane shape rule of 9.1 (other lane shapes: `skip`); a zone by its polygon of `points` (fewer than 3 points: `skip`). **Overlap:** for two lanes, the area of the intersection of the two rectangles; for a zone, the area of the zone polygon clipped to the lane rectangle (Sutherland-Hodgman against the four sides, then the absolute value of the shoelace formula, so the order of the zone's points does not matter). **Distance:** 0 when a corner of one shape lies inside the other (even-odd rule) or two edges cross; else the smallest distance between an edge of one shape and an edge of the other; for two lanes this equals the `clearance` distance of 9.1. Passes when the overlap is at most EPS and the distance is at least `min − EPS` | The distance, rounded to 6 decimals |

- `threshold = min`; `ids` = `[lane, target id]`, in that order; `overlap` = the overlap area, rounded to 6 decimals. A `skip` result has the shape of section 9 (`ids: []`) and no `overlap`.
- Two shapes that only touch have distance 0 and overlap 0: they pass with `min` 0 and fail with any larger `min`.
- Lanes and zones are never hidden by a state, so `lane_apart` gives the same result in every state.

**Under a state** (9.2), `in_region` with `"drawn"` and `min_screen_size` with `"height"` follow the rules of the default measures: hidden objects leave the lists, and a hidden `target` makes the check `skip`.

### 9.5 Exact definitions for stage 12

Tolerance and EPS as in 9.1. A scene without base heights, flat objects, zone or lane heights and hidden parts or regions gives the results of stage 11, except `sort_consistency` where `|cu| ≠ |cv|` (its slices are weighted, section 13.4).

**Boxes and levels.**

- An object's **base height** b is the third number of its `pos`, 0 when `pos` has two. Its world parts and anchors (section 13.7) are raised by b. Its **box** is its footprint (section 6) from h = b to h = b + H, where H is the third number of its type's `size`. A box with H = 0 is **flat**.
- Two boxes **overlap** when their footprints overlap as in `no_overlap` of 9.1 and their height ranges overlap by more than EPS: `min(b1 + H1, b2 + H2) − max(b1, b2) > EPS`. A flat box overlaps nothing; a box that rests on another (`b2 = b1 + H1`) does not overlap it.
- An object **takes space at level L up to a clear height K** when `b + H > L + EPS` and `b < L + K − EPS`; without K, only the first condition counts. An object entirely at or below the level (the deck a path runs on, a flat mat on the path) takes no space there; neither does one entirely above the clear height (a deck over a path, with K set).
- A zone's **level** is its `h` (default 0). A lane is **flat** when all its points have the same height within EPS (a point's third number, else the lane's `h`, default 0); its level is that height.

**Checks** (the parameters and rules of 9.1 to 9.4, with these changes):

- `no_overlap`: a pair counts when the two boxes overlap. `ids` and `allow` as before.
- `lane_clear`: new optional parameter `height`, the clear height (default: none). A lane that is not flat is an unsupported shape (`skip`). An object blocks the lane when its footprint overlaps the lane rectangle (9.1) and it takes space at the lane's level up to `height`.
- `lane_reaches`: the lane's corners are projected at the heights of the end points they belong to.
- `reachable`: new optional parameters `level` (default 0) and `height`, the clear height (default: none). Without `area`, the walkable area is every zone with `kind: "walkable"`, 3 or more points and a level equal to `level` within EPS; with `area`, that zone, whatever its level. Blocked zones count only when their level equals `level` within EPS. The distance rule of 9.2 that makes a cell not free applies only to objects that take space at `level` up to `height`.
- `sort_consistency`: new optional parameter `level` (default 0). The actor box runs from h = `level` to h = `level + actor[2]`, and the actor key is that of a footprint at base height `level` (section 13.4). A position is used when the actor box overlaps no object's box (instead of no footprint) and, with `area`, its point is inside that zone and not inside a blocked zone whose level equals `level` within EPS.
- `visible`: the sampled faces are those of the target's box, so a side face is sampled from h = `b + from·H` to h = `b + H`.
- `in_region` with the footprint measure: the 4 footprint corners are projected at the object's base height.
- `min_screen_size` with `measure: "height"`: `(max h1 − min h0) · |up.y| · screenWidth / frame.w`, with `up` of section 5; in the axes form this is the value of 9.4.
- `clearance`, `capacity`, `lane_apart` and the relations of section 7 measure on the ground plan: heights do not change them.

**States with parts and regions.** Under `--state NAME`, besides the rules of 9.2:

- `states.NAME.hideParts` hides parts, by object id and part id. An object whose every part is hidden counts as hidden (9.2).
- A hidden part is not drawn (`render`, the editor) and has no share in its object's generation box (`gen-bbox` takes the screen bounds of the other parts). It occludes nothing in `visible`, and `sort_consistency` leaves its pieces out of the sprites. `min_screen_size` and `in_region` with `measure: "drawn"` measure the other parts. The object keeps its `size`, footprint and box, so every check measured on them gives the result it gives without the hidden part.
- `states.NAME.hideRegions` hides frame regions: a hidden region is not drawn. `in_region` and `lane_reaches` that name it are `skip`, with a message that names the region and the state. Everything else keeps the region: the view region of `solve`, of `describe` and of the editor's Add is the same in every state.
- `describe --states` and the runtime file list the hidden parts and regions (Appendix B, section 13.7).

### 9.6 Exact definition for stage 13

Tolerance and EPS as in 9.1; shares compare within 0.001.

| `check` | Parameters | `value` |
|---|---|---|
| `visible_share` | `ids` (object ids) or `tag` (a tag), exactly one of the two; `region` (optional frame region id; default the whole raster); `min` (0 to 1) | The smallest share of the examined objects, rounded to 6 decimals |

Computation:

1. The object raster of section 14.1, in the state of the run.
2. **Region pixels:** the pixels whose centers (i + 0.5, j + 0.5) have x0 ≤ x < x1 and y0 ≤ y < y1, with `[x0, y0, x1, y1]` the region's `rect`; without `region`, every pixel of the raster. Half-open edges make regions that share an edge share no pixel.
3. **Examined objects:** the listed objects (those in `ids`, or those whose `tags` contain `tag`) that are drawn and whose full mask (section 14.1) has at least one region pixel. An object of no full pixel there (outside the region or the frame, or too small to cover a pixel center) is not examined.
4. For each examined object, F = its full pixels and V = its visible pixels among the region pixels; its **share** is V / F. It fails when its share is below `min − EPS`.

Threshold, ids and extra fields:

- `threshold = min`; `ids` = the failing objects, in the order of `objects`; `shares` = their shares, rounded to 6 decimals, in the same order (`[]` when none fails). `fail` when an object fails, else `pass`.
- No examined object: `skip`, with a message that says no listed object is drawn in the region. A region that the state hides: `skip`, as `in_region` (9.5). Under a state the lists lose the hidden objects (9.2); a tag names only the objects that are drawn.
- Schema and references (section 6): exactly one of `ids` and `tag`; `tag` a non-empty string; `min` a number from 0 to 1, required; `region` names a frame region and `ids` objects, with the suggestions of section 6. A tag that no object has is not an error: the check is `skip`.
- One raster per state serves every `visible_share` check of a run.

### 9.7 Exact definition for stage 14

Tolerance and EPS as in 9.1; shares as in 9.6.

**Warning margins.** The checks below take an optional parameter `warn`: a number ≥ 0 in the unit of the check's `value`. It sets a margin on the passing side of the check's bound B. A result that would be `pass` is `warn` instead when its value lies in the margin: for a lower bound when `value < B + warn − EPS`, for an upper bound when `value > B − warn + EPS`. The value compared is the result's `value` as section 9 reports it, rounded where it says so.

| `check` | B | Side | Unit of `warn` |
|---|---|---|---|
| `clearance` | `min` | lower | units |
| `lane_apart` | `min` (default 0) | lower: the distance; an overlap still fails | units |
| `visible` | `maxOccluded` | upper | fraction (0 to 1) |
| `reachable` | `max`, required with `warn` | upper | units |
| `capacity` | `min` | lower | anchors |
| `min_screen_size` | `min` | lower | pixels, both measures, after `screenWidth` |
| `visible_share` | `min` | lower | share (0 to 1) |

- `fail` and `skip` results do not change, and a `warn` result has the fields of the `pass` result it replaces, except as stated next. `warn: 0` never warns: the margin is empty.
- `visible_share`: when no examined object fails and some have a share below `min + warn − EPS`, the status is `warn`, `ids` lists those objects in the order of `objects` and `shares` gives their shares (rounded to 6 decimals); `value` stays the smallest share.
- Schema (section 6): `warn` is a number ≥ 0, and at most 1 on `visible` and `visible_share`; `reachable` with `warn` requires `max`. `warn` on another check is a property the schema does not allow (`E_SCHEMA`): a count of objects (`in_region`, `no_overlap`, `lane_clear`, `sort_consistency`) or a position on an edge (`lane_reaches`) has no distance to a bound.
- Where it shows: `check` prints `WARN` lines, and `check --failing` leaves them out, since they pass (section 11); `describe` prints a `WARN` line per warning check (Appendix B); `compare` marks the cell with ` !` (section 11.1); the editor's check panel shows the row as `WARN` (section 10). Exit codes treat `warn` as `pass` (section 11).

Fixtures: `tests/fixtures/explain/` (section 17).

### 9.8 Exact definitions for stage 15

Tolerance and EPS as in 9.1. This section replaces the lane shape rule of 9.1 (exactly 2 points, parallel to u or v) and the rule of 9.5 that a lane that is not flat is an unsupported shape.

**Lane shape.** A lane's points P0 … Pn (n ≥ 1) have ground points (u, v) and heights (section 6: a point's third number, else the lane's `h`, else 0). Each segment from Pk to Pk+1 whose ground length L is above EPS gives a **piece**: with e = (Pk+1 − Pk) / L along the segment and n = (−e.v, e.u) across it, the rectangle with corners Pk + n·w/2, Pk+1 + n·w/2, Pk+1 − n·w/2 and Pk − n·w/2, w being the lane's `width`. A segment of ground length at most EPS gives no piece (a lane may still climb there). The lane's **shape** is the union of its pieces; a lane without a piece is an unsupported shape (`skip`, as a lane of zero length before). The **surface** of piece k at a ground point x has the height h_k + t·(h_(k+1) − h_k), with t = ((x − Pk) · e) / L clamped to [0, 1]: a piece whose ends have different heights is a ramp, and a stair is drawn and measured as one.
- A lane of 2 points along u or v has one piece, the rectangle of 9.1, so every result that stages 1 to 14 measure on such a lane stays as it was. What changes is that lanes those stages skip (more than 2 points, a direction other than u or v, a flat check on a lane that is not flat) are now measured.
- **Penetration** of two convex polygons: for each edge of either polygon, the unit normal of that edge; for each such axis, the overlap of the two polygons' projections onto it (the smaller of the two maxima minus the larger of the two minima); the penetration is the smallest of these overlaps. Two convex polygons **overlap** when their penetration is above EPS. For a footprint and an axis-parallel rectangle this is the rule of `no_overlap` (9.1).
- **Polygon distance** of two polygons: 0 when a vertex of one lies inside the other (even-odd rule) or two edges cross, else the smallest distance between an edge of one and an edge of the other. For two axis-parallel rectangles this is the `clearance` distance.
- **Inside a piece:** a point lies inside a piece when its offset along e from Pk is from −EPS to L + EPS and its offset along n is at most w/2 + EPS in size.

**Checks** (the parameters of 9.1 to 9.7, with these changes):

- `lane_clear`: an object blocks the lane when its footprint overlaps one of the lane's pieces and, over that overlap, it takes space at the surface: with the polygon where the footprint and the piece intersect (the footprint clipped to the piece), and lo and hi the lowest and highest surface heights at its vertices, the object blocks when b + H > lo + EPS and, with `height` K, b < hi + K − EPS (b and H as in 9.5). On a flat piece this is the rule of 9.5. `ids` and `value` as in 9.1.
- `lane_reaches`: each piece is projected with its two corners next to Pk at h_k and its two next to Pk+1 at h_(k+1); each projected piece meets the frame edge line in a segment or not at all. No piece meets it: `fail`, `value = null`, `message = "lane does not reach edge"`. Otherwise `value` is the largest y (for `right` and `left`) or x (for `top` and `bottom`) of those segments, and the check passes when every one of them lies inside the region's range along the line (edges inclusive, within EPS). A polyline that meets the edge twice passes only when both meetings lie in the range.
- `lane_apart`: the distance is the smallest polygon distance between a piece of the lane and a piece of the target lane, or the target zone's polygon; `overlap` is the largest area of the intersection of a piece of the lane with a piece of the target lane (one convex polygon clipped to the other), or with the zone polygon (the zone clipped to the piece, as in 9.4). For two lanes of two points along u or v these are the values of 9.4.
- `reachable` with `toLevel` (new optional parameter, a number): the path may cross levels.
  1. **Levels:** `level` (default 0), `toLevel`, then the heights of the walkable zones of 3 or more points in file order; two heights within EPS are one level (the first one listed stands for it). Each level has the grid of 9.2: its walkable area is the walkable zones of 3 or more points at that level, its blocked zones those at that level, and a cell is free by the distance rule of 9.5 for the objects that take space at that level up to `height`; the bounding rectangle of its walkable area sets its cells, as in 9.2. A level without a walkable zone has no cell.
  2. **Connectors:** a lane with at least one piece whose first and last points have heights at two different levels, and that no object blocks (as in `lane_clear` above, with `height` as K; the objects in `ignore` and the objects whose anchors `from` and `to` name do not block). Each end is attached to the free cell of its level nearest to its ground point, by the nearest-cell rule of 9.2; a connector with an end that has no free cell within `step + EPS` is not used. A connector can be walked both ways; its length is the sum over its segments of the distance between their end points in (u, v, h).
  3. **Path:** the start is the free cell of `level` nearest to `from` and the target the free cell of `toLevel` nearest to `to` (the messages of 9.2 when there is none); a move between two free cells of one level that share an edge has the length `step`, a connector its length. `value` is the smallest total length of a path, rounded to 6 decimals; none: `fail`, `value = null`, message `no walkable path`. Passes as in 9.2.
  - Without `toLevel` the search stays on one level, as in 9.5, even when connectors exist. `area` together with `toLevel` is a schema error. More than 4,000,000 cells over all levels is `skip`, with the message of 9.2.
- `occluders` with `--lane` takes any lane with a piece (section 11.4).

**Relations:** `against` and `clear_of` measure lanes on this shape, and `facing` is measured (section 7). Fixtures: `tests/fixtures/paths/` (section 17).

## 10. Editor (web page)

- **Two views:** isometric with the scene camera, and a top-down plan (more precise dragging, nothing hidden).
- **Drag:** screen to ground, grid snap, keep h. Locked objects cannot be dragged and show a lock icon. A drag changes `pos` only; snap applies to `pos` (default step 0.1). A press becomes a drag after the pointer moves 3 px (mouse), 4 px (pen) or 8 px (touch).
- **Plan view:** u to the right, v down; objects drawn by their top faces.
- **Property panel:** numbers with units; a lock toggle per property; provisional mark for assumptions.
- **Check panel:** pass/fail updates live; tapping a row highlights the objects involved. From stage 8, during a drag the rows of `reachable` and `sort_consistency` keep their last result and show that it is out of date; the drop, or a cancelled drag, re-runs them. From stage 13 the rows of `visible_share` do the same. From stage 14 a `warn` result shows as `WARN` (section 9.7).
- **Toggleable overlays:** strips, lanes, zones, anchors, frame regions; from stage 14 relations, sort points, occlusion rays, masks and occluders (below).
- **State switch (stage 11):** a select with the accessible name `State` lists `default`, then the states of the scene in file order. In a state, both views leave out the objects it hides (as `render --state`); a hidden object cannot be selected or dragged and is no longer selected; the check panel shows the results of `check --state <name>` on the current scene. `default` shows every object; a state of the scene named `default` is not listed again, and choosing `default` then shows that state, as `--state default` does. Switching is not an edit: no history step, nothing in the file changes, and it does not make the page unsaved. A newly opened file shows `default`; when the state shown no longer exists, the switch goes back to `default`.
- **Edits (stage 11):** each edit below is one history step, undone and redone as one, and changes the scene exactly as the short command named with it (section 12) would, written in the saved format. When that command would not apply (`patch` would exit 2 or 3), the scene does not change and a notice gives the reason. Controls are found by their accessible names:
  - **Add:** a select `Type to add` (the keys of `types`, in file order) and a button `Add` append an object of that type, as `add <id> <type> <u>,<v>`: the id is `<type><n>` with the smallest integer n ≥ 1 that no object uses; `pos` is the ground point (h = 0) that projects to the center of the view region (the first frame region without `blocksScene`), each coordinate snapped to the nearest multiple of the snap step (halves up) and rounded to 6 decimals; `rot` is 0. The new object is selected.
  - **Duplicate:** a button `Duplicate`, enabled while an object is selected, appends a copy of it, as `add <id> <type> <u>,<v> <rot>`: the same `type` and `rot`, the id by the rule of Add, and its `pos` with u increased by the extent of its footprint along u (after rotation), rounded to 6 decimals. From stage 12 a `pos` of three numbers is copied with its base height, as `add <id> <type> <u>,<v>,<h> <rot>`. Nothing else is copied: no locks, relations, `hide` entries or assumptions. The copy is selected.
  - **Delete:** a button `Delete`, and the keys Delete and Backspace while no text field or select has the focus, remove the selected object as `remove <id>`: with its relations, its `hide` entries and its assumptions. A locked object (`E_LOCK`), an object that a check names (`E_REF`) and an index shift (`E_PATCH`) leave the scene unchanged.
  - **Nudge:** while an object is selected and no text field or select has the focus, the arrow keys move it by the snap step, as `move <id> u±<step>` or `move <id> v±<step>`: right and left along +u and −u, down and up along +v and −v, in both views; with Shift, by 1 unit. Each key press is one edit. A locked axis does not move.
  - **Hide per state:** the property panel of the selected object has one checkbox per state, in file order, with the accessible name `Hidden in <state>`, checked when that state's `hide` lists the object. Checking it is `hide <state> <id>`; clearing it is `show <state> <id>`.
  - **Settle an assumption:** a section `Assumptions` lists every entry of `assumptions` in file order: its path shortened as in `describe` (Appendix B), its value, `owner` and `note`, and a button `Settle <shortened path>`. Pressing it puts the buttons `Confirm` and `Cancel` in its place (no browser dialog); `Confirm` removes that entry from `assumptions` (the list stays, also when empty), and the number keeps its value. No patch command settles an assumption: settling is a person's decision.
- **Heights and cameras (stage 12):** both views draw both camera forms (section 5), zones in ascending height under the objects (section 14), lanes at their heights and objects at their base heights. A drag keeps the base height: the object follows the pointer at that height (the inverse of section 5 at h0 = its base height). The property panel has a number field with the accessible name `pos.h (<unit>)` after the field of `pos.v`, showing 0 when `pos` has two numbers, and a lock toggle for `pos.h`; changing the field is `move <id> h<±difference>` (section 12), which writes `pos` with three numbers. In a state, both views also leave out the parts and regions the state hides (section 9.5); a hidden part cannot be picked.
- **Parts and regions per state (stage 14):** edits by the rules of stage 11 (Edits), as the short commands of section 12:
  - In the property panel, after each checkbox `Hidden in <state>`, one checkbox per part of the selected object's type, in type order (`body` for a type without `parts`), with the accessible name `Hidden in <state>: <part>`, checked when `states.<state>.hideParts` lists that part for the object. Checking it is `hide <state> <id>/<part>`; clearing it is `show <state> <id>/<part>`.
  - A section `Regions` lists the frame regions in file order, each with one checkbox per state in file order, with the accessible name `Region <id> hidden in <state>`, checked when that state's `hideRegions` lists the region. Checking it is `hide <state> region:<id>`; clearing it is `show <state> region:<id>`. Without states the section says that the scene has none.
  - When the shown state comes to hide every part of the selected object, the object counts as hidden (section 9.5) and is no longer selected.
- **Relation panel (stage 14):** a section `Relations` lists every relation in file order, one row each: its status as `relations` prints it (`OK`, `BAD` or `SKIP`), its id, `rel` and targets (as in Appendix B, `<a>×<b>`), and its violation with the number rule of Appendix B, or the reason of a `skip`. A row is a button with `data-relation` (the id) and `data-status` (`satisfied`, `violated` or `skip`); the heading shows the number of violated and skipped relations. The rows are the results of `relations --json` on the current scene, with every object present whatever the shown state (section 7); they update on every change, the pointer moves of a drag included, since relations measure footprints and search no grid. Tapping a row highlights the objects of its `ids` in both views, as a check row does; tapping it again clears the highlight.
- **Solve (stage 14):** in the section `Relations`, a checkbox `Only the selected object` and a button `Solve`, enabled while a scene is open and no proposal is shown. From stage 15 a checkbox `Turn objects` adds `--rotate` (section 8).
  - Pressing `Solve` runs the solver of section 8 on the current scene, as `solve` does: with `--only <id>` when the checkbox is checked and an object `<id>` is selected, else without `--only`, and with `--rotate` when `Turn objects` is checked. The result is the **proposal**: the section shows `solved` or `conflict`, the number of moved objects and the soft penalty (2 decimals), and the buttons `Apply` and `Discard`.
  - Both views draw each moved object as a ghost at its proposed position: the outlines of its parts at their heights, without fill, and a line from its footprint center to the ghost's. A turned object's ghost is drawn at its proposed rotation. With `conflict`, the rows of the conflict set carry `data-conflict="true"` and a notice names them.
  - `Apply`, disabled when no object moves (from stage 15: and none turns), is one edit: it changes the scene as `patch` applies the patch that `solve --patch -` prints for the scene the proposal was made for (with `--only` and `--rotate` when they were used). `Discard` removes the proposal and changes nothing.
  - An edit, undo, redo or an opened file removes the proposal; switching the state does not. A proposal is never saved.
- **Overlays (stage 14):** in the overlays section, all off by default and the same in both views unless stated:
  - `Relations`: for each relation that is not skipped, a line at h = 0 from the center of the footprint of `a` to its target: the footprint center of an object, the nearest point of a lane's polyline, the nearest point of a zone polygon's boundary, or the nearest point of the line v = bound of a strip edge; for `order_along`, a line through the footprint centers of `ids` in order; from stage 15, for `facing`, a line from its facing point to its target point and a short arrow from the facing point along its front (section 7). Lines take the color of their status (satisfied or violated); violated hard relations are drawn wider; each line carries its relation id. The highlighted relation is drawn over the others.
  - `Sort points`: for each sprite (section 13.4) of the objects drawn in the shown state, a dot at its sort point, the center of the sprite's footprint at the object's base height; the keys of the selected object's sprites are written next to their dots.
  - `Occlusion rays`, in the isometric view: when the highlighted check row is a `visible` check whose result is not `skip`, its samples (sections 9.1 and 9.5) in the shown state, one dot each; an occluded sample in another color, with a line along its ray to the point where the ray leaves the last part it runs inside.
  - `Masks`, in the isometric view: the object raster of section 14.1 in the shown state, each object's visible pixels tinted in its color, and the pixels of the selected object's full mask that other objects cover marked. It waits for the drop like the rows of `visible_share`.
  - `Occluders of`: a select that lists `none` (the default), then `lane:<id>` for each lane that `occluders` accepts (flat, with the lane shape of 9.1; from stage 15 every lane with a piece, section 9.8) and `zone:<id>` for each zone of 3 or more points, lanes first, each in file order; a text field `Actor size` (`w,d,h`, empty at first) and a number field `Occluder step` (default 0.25). With an area chosen and an actor size, both views outline the objects that `occluders` lists for that area, actor and step in the shown state, and the plan view marks the used positions. It waits for the drop. An actor size or step that `occluders` refuses, or a grid it finds too large, draws nothing, and a notice gives the reason.
- **Script contract (stage 14):** the page has a read-only object `window.isoblock` for tests and tools (`docs/AGENT_GUIDE.md` lists its other members). Its method `overlay(name)` returns the data an overlay draws in the current scene and shown state, or `null` when the overlay is off or no scene is open:
  - `overlay("relations")`: `{ "results" }`, the `results` of `relations --json`.
  - `overlay("proposal")`: the shown proposal as `solve --json` prints it for the scene and the `--only` (and from stage 15 `--rotate`) it was made with; `null` when none is shown. It has no checkbox.
  - `overlay("sortPoints")`: `{ "sprites": [{ "object", "slice", "key", "point" }] }` in the order of the sprite list (section 13.4), without the hidden objects: `slice` is the sprite's position among its object's sprites, `key` its key as the runtime file gives it, `point` the sort point `[u, v, h]`, rounded to 6 decimals.
  - `overlay("rays")`: `{ "check", "samples": [{ "at", "occluded", "by" }] }`: `check` is the id of the highlighted `visible` check (`null`, with no samples, when there is none); `at` is a sample's point `[u, v, h]` on its face before the outward offset, rounded to 6 decimals; `occluded` as in 9.1; `by` the ids of the objects with a part that the ray runs inside, in object order (`[]` when not occluded). The order of the samples is free.
  - `overlay("masks")`: the object that `visibility --json` prints for the scene in the shown state: with `--state <name>`, and for `default` without `--state` unless the scene defines a state named `default` (State switch, above).
  - `overlay("occluders")`: the object that `occluders --json` prints for the chosen area, actor size and step in the shown state; `null` without an area or with input that `occluders` refuses.
  - `state()` also gives `staleOverlays`: the names among `masks` and `occluders` whose data are out of date during a drag. Their data stay those of the last run until the drop.
- **History:** undo, redo; saved versions with notes; compare two versions.
- **Export:** frame image, scene file, engine package, generation boxes.
- **Touch:** one-finger drag, two-finger zoom, large hit targets.
- **Performance:** 60 fps with 200 objects on a mid-range phone. Canvas 2D; redraw only on change. From stage 8, checks that search a grid (`reachable`, `sort_consistency`, and from stage 13 `visible_share`, which rasterizes the frame) re-run when a drag ends, not on every pointer move, so that dragging keeps the frame rate on scenes that use them; from stage 14 so do the overlays `Masks` and `Occluders of`. Other edits (a property, undo, redo, a loaded file) re-run every check they involve at once.
- **Storage:** reads and writes scene files; no hidden state outside the file. Saved files are JSON with 2-space indentation and a final newline; keys keep their order, keys added by an edit come last, an empty `locks` list is removed, and numbers are written as JSON numbers (`2.0` becomes `2`).
- **Assumptions:** editing a provisional number updates its `assumptions[].value`; the entry stays until a person settles it (stage 11, Edits) or removes it from the file.

## 11. CLI (headless)

```
isoblock --version                      # the version of package.json (stage 10)
isoblock validate scene.json [--json]   # schema and reference checks (--json from stage 10)
isoblock check    scene.json [--json] [--state NAME] [--only a,b] [--failing]
isoblock relations scene.json [--json]  # relation results (section 7)
isoblock solve    scene.json [--only a,b] [--rotate] [-o proposal.json] [--patch moves.patch|-] [--json]
isoblock render   scene.json [--state NAME] -o out.svg|out.png
isoblock describe scene.json [--relations] [--states]   # compact summary for agents (section 12)
isoblock patch    scene.json patch.txt|- [-o out.json] [--dry-run] [--json]
isoblock diff     a.json b.json [--json]
isoblock compare  scene.json --variant A=a.patch --variant B=b.patch [--state NAME] [--format text|md|json] [--relations] [--render]
isoblock export   scene.json --target runtime|gen-bbox|masks [-o out.json|dir] [--bbox-units px|norm1000] [--bbox-order xyxy|yxyx] [--state NAME] [--grow N]
isoblock visibility scene.json [--region ID] [--state NAME] [--json]               # stage 13 (section 11.3)
isoblock occluders  scene.json --actor w,d,h (--lane ID | --zone ID) [--step S] [--state NAME] [--json]   # stage 13 (section 11.4)
```

Commands and flags arrive in the stages listed in section 17. A command, flag, export target or output format not available in the current stage is a usage error (exit 2) that names the stage that adds it, or says it is not scheduled. Examples in stage 1: `--state` (stage 6), `render -o out.png` (stage 5). `compare --render` and the export targets `godot`, `phaser` and `tiled` are not scheduled.

Stage 10 adds:

- `isoblock --version` prints `isoblock <version>`, the `version` of `package.json` as it was when the tool was built, and exits 0. It is the only argument that works without a command.
- `validate --json` prints `{ "ok", "scene", "error" }`: `ok` is `true` or `false`; `scene` is the top-level `id` of the parsed file when it is a string, else `null`; `error` is `null`, or `{ "code", "message", "details" }` with the detail lines of the text output (`details` is an array, possibly empty). Every failure, an unreadable file included, is reported this way on stdout with nothing on stderr. The exit code does not change: 0 when valid, 2 otherwise.
- `check --only a,b` runs only the checks with those ids, in `checks` order. The summary line, the `--json` results and the exit code cover those checks only. An empty or unknown id is `E_USAGE`.
- `describe --relations` and `describe --states` add the relation and state lines of Appendix B; each flag adds its lines only.
- `patch scene.json -` reads the patch from standard input. The log names the patch `-` (section 12).
- `compare --relations` adds the relation rows and keys of section 11.1.

Stage 11 adds:

- `check --failing` prints only the results whose status is `fail` or `skip`: the check lines of the text output and the `results` of `--json`, in `checks` order. The summary line and the exit code still cover every check that ran. With `--only`, it applies to the selected checks.
- `solve --patch -` writes the patch to standard output and no report (section 8).

Stage 12 adds no command and no flag. The new check parameters are those of section 9.5; `--state` covers hidden parts and regions; `render` and `export` take both camera forms.

Stage 13 adds:

- `export --target masks -o <dir> [--state NAME] [--grow N]` writes the masks of section 14.1 into the folder `<dir>`. `-o` is required; `--grow` takes an integer from 0 to 64 (default 0) and belongs to `masks`; `--bbox-units` and `--bbox-order` with `masks`, and `--grow` with another target, are usage errors.
- `visibility` (section 11.3) and `occluders` (section 11.4).
- The check `visible_share` (section 9.6).

Stage 14 adds no command and no flag. Checks take the warning margin `warn` (section 9.7): `check` prints `WARN` lines for them and `--failing` leaves them out; `describe` and `compare` show them (Appendix B, section 11.1). The short commands `hide` and `show` take parts and frame regions (section 12).

Stage 15 adds:

- `solve --rotate` (section 8).
- Every lane with a piece in the lane checks, the relations and `occluders --lane` (sections 7, 9.8 and 11.4); `reachable` with `toLevel` and the relation `facing` (sections 9.8 and 7); `relate ... angle <n>` (section 12).

`render` requires `-o`; the file extension selects the format: `.svg`, or `.png` from stage 5 (section 14).

`--state NAME` (stage 6) applies to `check`, `render`, `compare` and `export --target gen-bbox`, and from stage 13 to `export --target masks`, `visibility` and `occluders`: the command works on the scene in that state (section 9.2); hidden objects are not drawn and get no generation box. An unknown state name is a usage error, `default` included unless the scene defines it. `check --json --state` prints `{ "scene", "results" }` as without a state. With `export --target runtime` it is a usage error: the runtime file carries all states (section 13.7).

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

`validate`, `render`, `describe`, `diff`, `compare`, `export`, `visibility` and `occluders` exit 0 when they complete, even if checks fail.

### 11.1 `compare`: variants by measured values

- **Input:** a base scene and 1–4 variants, `--variant NAME=FILE`, in the order given. A variant file is a patch (section 12) or another scene file (a JSON object with `schema`). Optionally at one state (`--state`, stage 6): every column is evaluated in that state, and the header names it; without it the header says `default`. The hidden objects are those of the base scene's state, also for a scene variant with its own `states`; they are left out of `moved`.
- **Method:** apply each variant to a copy of the base, ignoring locks but recording the locks it touches, and run the base scene's checks on every column. A variant file whose first non-blank character is `{` is a scene; any other file is a patch. Names are unique, not empty and not `base`. A variant that is malformed or produces an invalid scene stops `compare` with exit 2.
- **Measures** (the JSON output has all of them):
  - `failing`: number of checks with status `fail` or `skip`;
  - `locksTouched`: labels `<object id>.<lock>` of the base locks the variant touches (section 12); any entry marks the variant invalid;
  - with `--relations` (stage 10): `hardViolated` and `softPenalty`. Every column is measured with the base scene's relations (section 7) on its own positions, with every object present whatever the state (`relations` has no `--state`). `hardViolated` = the ids of the hard relations whose status is `violated`, in file order; `softPenalty` = the soft penalty rounded to 6 decimals. Without the flag the two keys are absent and the two rows are not printed;
  - `checks`: every check with its label, threshold, `values` (one per column), `status` (one per column) and `delta` (value minus the base value, rounded to 6 decimals; `null` for the base and for values that are `null` or not numbers);
  - `moved`: objects present in both scenes whose `pos` moved more than 1e-9, as `count` and total `distance` (sum of ground distances, rounded to 6 decimals); `null` for the base. From stage 12 the base height is a third coordinate (0 when `pos` has two numbers): a change of it is a move, and distances are taken in (u, v, h).
- **Check labels:** `in_region <region>[/<strip>] (objects outside)`, `no_overlap (pairs)`, `clearance <a>×<b> (<unit>)` with the ids in the order of the result's `ids`, `lane_clear <lane> (blocking objects)`, `lane_reaches <lane> (y px)` for the edges `right` and `left` and `lane_reaches <lane> (x px)` for `top` and `bottom`, `visible <target> (% occluded)`, `reachable <check id> (<unit>)`, `capacity <check id> (usable <kind>)`, `min_screen_size <target> (px)`, `sort_consistency <check id> (objects out of order)`. From stage 9: `in_region <region>[/<strip>] drawn (objects outside)` for `measure: "drawn"`, `min_screen_size <target> height (px)` for `measure: "height"`, and `lane_apart <lane>×<target id> (<unit>)`. From stage 13: `visible_share <check id> (% shown)`, its cells the value as a whole percent, halves up.
- **Variant labels:** the first comment line of the patch (section 12), else the variant name.
- **`text` format** (Appendix D is the contract): line 1 `compare <scene id> · state <state> · base vs <names>`; line 2 `<name> = <label>` for each variant, joined with ` · `; then a table. Rows: `failing checks`; `locks touched` (count, then ` ✗ (<labels>)` when not zero); with `--relations`, `hard relations violated` (count, then ` ✗` when not zero) and `soft penalty` (2 decimals); one row per check that is `fail` or `skip` in some column (from stage 14 also `warn`), or whose value differs from the base in some column (a non-zero delta, or `null` against a number), in `checks` order; `objects moved / total (<unit>)` (`-` for the base, else `<count> / <distance>`). Cells: counts as integers; clearance values, `lane_apart` values and distances with 2 decimals; `lane_reaches` whole pixels (`none` when `null`); `visible` whole percent; `reachable` with 2 decimals (`none` when `null`); `capacity` and `sort_consistency` as integers; `min_screen_size` whole pixels, halves up; `skip` for skipped checks; ` ✗` after a value whose status is `fail` or `skip`, and from stage 14 ` !` after a value whose status is `warn` (section 9.7). Columns are left-aligned; each column is as wide as its widest cell (header included, counted in Unicode code points) plus 2 spaces; trailing spaces are removed.
- **`md` format:** the same rows as a Markdown table with the header `| metric | base | <names> |`.
- **`json` format:** `{ "scene", "state", "variants": [{ "name", "label" }], "failing", "locksTouched", "hardViolated"?, "softPenalty"?, "moved", "checks": [{ "id", "check", "label", "threshold", "values", "status", "delta" }] }`, in that key order; every list has one entry per column, base first (`label` is `null` for the base). `hardViolated` and `softPenalty` are present only with `--relations`.
- **Not scheduled:** layout indicators (occupied share of the view per third of the frame, largest empty area, on-screen size of key objects) and `--render`.
- **Limit:** `compare` does not choose. It separates what is measurable from what needs judgment (balance, feel, gameplay intent); a person decides.
- **In the editor:** quick switching between variants with a delta table (not scheduled).

### 11.2 `diff`

`diff a.json b.json` lists the changes from scene a to scene b, matching items by identity, not by position:

- Objects are compared key by key. An array whose items, in both scenes, are all objects with a string `id` that is unique in its list is matched by `id` (an empty list qualifies); `assumptions` is matched by `path` in the same way. Every other array (`pos`, `size`, `locks`, `points`, ...) is one value. Item order is ignored.
- Each entry is `{ "op": "add"|"remove"|"replace", "path", "from"?, "to"? }`: `add` has `to`, `remove` has `from`, `replace` has both. `path` is a JSON Pointer built from keys and matched ids (`/objects/crate2/pos`, `/relations/r3`), escaped as in RFC 6901. Entries are sorted by `path` (code point order).
- `--json` prints `{ "a", "b", "changes" }` with the two scene ids. The text format prints `diff <a id> -> <b id>: <n> changes`, then one line per entry: `+ <path> <to>`, `- <path> <from>`, `~ <path> <from> -> <to>`, values as compact JSON.

### 11.3 `visibility` (stage 13)

`visibility scene.json [--region ID] [--state NAME] [--json]` measures, on the object raster of section 14.1 in that state, how much of each object shows in a frame region and how much of the region the objects cover. Without `--region` the region is the whole raster. `--json` prints, in this key order:

```json
{ "scene": "yard", "state": null,
  "region": { "id": null, "pixels": 1000000, "covered": 57720, "share": 0.05772 },
  "objects": [{ "id": "actor", "type": "actor", "tags": [], "full": 6262, "visible": 5038, "share": 0.804535, "cover": 0.005038 }],
  "tags": [{ "tag": "static", "ids": ["tree"], "full": 34470, "visible": 34470, "share": 1, "cover": 0.03447 }] }
```

- `region`: `id` (`null` without `--region`); `pixels`, the region pixels of section 9.6; `covered`, those the raster gives to an object; `share` = covered / pixels.
- `objects`: the drawn objects with at least one full pixel in the region, in file order. `full` and `visible` count their full and visible pixels in the region (section 14.1); `share` = visible / full; `cover` = visible / region pixels.
- `tags`: one row per tag of the listed objects, in order of first appearance (objects in file order, each object's tags in its order). `ids` = the listed objects with that tag; `full` = the pixels of the union of their full masks in the region; `visible` = the sum of their visible pixels; `share` and `cover` as for objects.
- Shares are rounded to 6 decimals. The text format prints a header with the scene, the state, the region and its covered share, then one line per object and one per tag with the same numbers; its layout is the builder's choice.
- An unknown region, and a region that the state hides, are usage errors (`E_USAGE`).

### 11.4 `occluders` (stage 13)

`occluders scene.json --actor w,d,h (--lane ID | --zone ID) [--step S] [--state NAME] [--json]` lists the objects that hide part of a moving object, the actor, somewhere in a walkable area: what a game or an artist draws on a layer in front of the actors there.

1. **Area and level.** `--lane`: a flat lane (9.5) with the lane shape of 9.1, at its level; a point is in the area when it lies in the lane rectangle, edges included within EPS. From stage 15 any lane with a piece (9.8): a point is in the area when it lies inside one of its pieces (9.8), and the level there is the surface height of the first such piece in lane order, so an actor climbs a ramp or a stair. `--zone`: a zone of 3 or more points, at its level (`h`); in the area as in `reachable` (9.2). Exactly one of the two. An unknown lane or zone, a lane without a piece (before stage 15: another lane shape and a lane that is not flat) and a zone of fewer than 3 points are usage errors, and so is an `--actor` that is not three numbers above 0.
2. **Positions.** For all integers i and j, p = ((i + 0.5)·step, (j + 0.5)·step), with `step` > 0 (default 0.25). A position is used when p is in the area and not inside a zone with `kind: "blocked"`, 3 or more points and the level at p (inside as in 9.2), and the **actor box** (footprint `[p.u − w/2, p.v − d/2, p.u + w/2, p.v + d/2]`, from h = level to h = level + h) overlaps no box of a drawn object (9.5). More than 1,000,000 grid points in the bounding rectangle of the area (for a lane, of the corners of its pieces) is a usage error that asks for a larger `step`.
3. **Hiding.** At a used position, an object hides the actor when one of its drawn parts, whose box does not intersect the actor box (9.3 step 4), needs an order with the actor box that puts the actor first (section 13.4, painter's order steps 3 and 4, with the actor box listed before the part), and the two outlines (convex hulls of the 8 projected corners, as in 9.3 step 6, not snapped) intersect with an area above EPS.
4. `--json` prints `{ "scene", "state", "area": { "kind", "id", "level" }, "actor", "step", "positions", "occluders": [{ "id", "positions", "area" }] }`: `kind` is `lane` or `zone`; `level` is the zone's level or the flat lane's, and from stage 15 `null` for a lane that is not flat; `actor` = `[w, d, h]`; `positions` = the used positions; `occluders` in file order, each object that hides the actor at one position or more, with the number of those positions and the largest intersection area of one of its parts with the actor (px², rounded to 2 decimals). The text format prints a header and one line per occluder; its layout is the builder's choice.

The order is the painter's (geometric) order, not the engine rule: where `sort_consistency` (9.3) finds no mismatch, the engine draws the same objects over the actor.

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

- **Patch file:** a file whose first non-blank character is `[` is a JSON Patch (an array of operations). Any other file is short commands: one command per line; blank lines are ignored; a line starting with `#` is a comment, and the first comment line is the patch's description. Tokens are separated by spaces; double quotes group a token that contains spaces (`note="two words"`); inside quotes `\"` is a quote and `\\` a backslash. The whole file is parsed before any command runs; an error names its line. A patch without commands applies and changes nothing. From stage 10, `patch` reads the patch from standard input when the patch argument is `-`; the same rules apply.
- **Short commands** (stage 3; `add` and `remove` from stage 10; `hide` and `show` from stage 11; heights in `move`, `add` and `lock` from stage 12; parts and regions in `hide` and `show` from stage 14; `angle` in `relate` from stage 15):

| Command | Effect |
|---|---|
| `move <id> <u±n> [<v±n>] [<h±n>]` | Adds to `pos`; each axis at most once, in any order (`move bench u-0.5 v+0.2`). `h±n` (stage 12) adds to the base height; when `pos` has two numbers, it gets a third, `0` plus the offset |
| `rot <id> <0\|90\|180\|270>` | Sets `rot`, keeping the footprint center: `pos` is recomputed when the footprint changes shape, else left as it is; a base height stays as it is |
| `set <pointer> <value> [note="<text>"]` | Replaces the value at an existing JSON Pointer below the root. The value is read as JSON, else as a string. `note=` replaces the `note` of the assumption with that `path`; it is an error when there is none |
| `lock <id> <lock>...` | Appends locks the object does not have yet (`pos`, `pos.u`, `pos.v`, `pos.h` from stage 12, `rot`, `type` or a JSON Pointer) |
| `relate <a> <rel> <b> [gap <min>..<max>] [axis <u\|v>] [t <min>..<max>] [min <n>] [angle <n>] [hard] [weight <n>] [id=<id>] [source="<text>"]` | Appends a relation `{ id, a, rel, b, <parameters>, hard, weight?, source? }`; `hard` is always written (default `false`); without `id=` the id is the first free `r1`, `r2`, ... `angle` (stage 15) is the parameter of `facing`, a number |
| `add <id> <type> <u>,<v>[,<h>] [<rot>]` | Appends `{ "id", "type", "pos": [u, v], "rot" }` to `objects`, or with `,<h>` (stage 12) `"pos": [u, v, h]` (`rot` is 0 unless given; 0, 90, 180 or 270; `u`, `v` and `h` are decimal numbers). An id already in use, a malformed position or rotation is `E_PATCH`; an unknown type is a reference error of the result (`E_REF`) |
| `remove <id>` | Removes the object at index `i`, the relations whose `a`, `b` or `ids` name it, its entries in `states.<name>.hide` and, from stage 12, `states.<name>.hideParts`, and the assumptions whose `path` is `/objects/<i>` or below. When an assumption path or a pointer lock is at or below `/objects/<j>` with `j > i` (the index would shift), the command is `E_PATCH`. Checks are left as they are: a check that names the object makes the result invalid (`E_REF`), so the same patch must change the check first |
| `hide <state> <id>` | Appends the object to `states.<state>.hide`, creating `states`, the state and its `hide` list when they are missing (a key that an edit adds comes last, section 10). An object already in that list is `E_PATCH` |
| `show <state> <id>` | Removes the object from `states.<state>.hide`; the state stays, also with an empty list. An unknown state, or an object that the state does not hide, is `E_PATCH`. The object is checked before the state |
| `hide <state> <id>/<part>` | Stage 14. Appends the part to the object's list in `states.<state>.hideParts`, creating `states`, the state, `hideParts` and the object's list when they are missing. A part already in that list is `E_PATCH` |
| `hide <state> region:<id>` | Stage 14. Appends the frame region to `states.<state>.hideRegions`, creating `states`, the state and the list when they are missing. A region already in that list is `E_PATCH` |
| `show <state> <id>/<part>` | Stage 14. Removes the part from the object's list in `states.<state>.hideParts`; a list that becomes empty goes with its key, and `hideParts` stays, also empty. An unknown state, or a part that the state does not hide, is `E_PATCH` |
| `show <state> region:<id>` | Stage 14. Removes the region from `states.<state>.hideRegions`; the list stays, also empty. An unknown state, or a region that the state does not hide, is `E_PATCH` |
| `solve ...` | Not a patch command (usage error): run `isoblock solve --patch` and apply its patch |

  From stage 14 the second argument of `hide` and `show` is read in this order: an object id names that object (the commands of stage 11); else `region:<id>` names a frame region; else `<id>/<part>` names a part, split at the first `/` from the left whose left side is an object id (ids may contain `/`), and the part must be one of the object's type (`body` for a type without `parts`); else the text before the first `/` (the whole argument when it has none) is an unknown object. From stage 15 the part is found as an anchor is (9.2): the first split from the left at which the left side is an object id and the right side a part of its type; when no split gives both, the last split whose left side is an object id (the longest such id) names an unknown part of that object, for its message and suggestion. So with objects `a` and `a/b`, `a/b/low` names the part `low` of `a/b` when `a` has no part `b/low`. The command checks the object or the region, then the part, then, for `show`, the state, then whether the item is listed. An unknown object, part, region or state is `E_PATCH` with the suggestion of section 6 in its message (pools: the object ids, the part ids of the object's type, the frame region ids, the state names). A state that hides every part of an object hides the object (section 9.5).

  There is no `unlock`: people remove locks in the editor or in the file. A command naming an unknown object or command, a bad offset or a pointer that does not resolve is `E_PATCH`; the message for an unknown object, and from stage 11 for an unknown state of `show`, carries the suggestion of section 6.
- **Application:** commands or operations apply in order to a copy of the scene; the patch is atomic (any error leaves the scene unchanged). Coordinates computed by `move` and `rot` are rounded to 6 decimals. Afterwards every `assumptions[].value` is set to the value its `path` points to.
- **Locks:** a patch touches a lock when, compared with the original scene, a locked value changes (`pos`, `pos.u` = `pos[0]`, `pos.v` = `pos[1]`, `pos.h` = `pos[2]` from stage 12, `rot`, `type`, or the value at a pointer, including its appearance or removal; for `pos` and `pos.h`, a third number that appears or goes counts as a change), a lock entry disappears, or a locked object disappears. Only locks of the original scene count. Labels are `<object id>.<lock>`, in object order, then lock order.
- **Order of outcomes:** malformed patch or failing command (`E_PATCH`, or `E_USAGE` for a later-stage command, exit 2); then locks (`E_LOCK`, exit 3, `patch` writes nothing); then schema and references of the result (`E_SCHEMA`, `E_REF`, exit 2); else the patch is applied (exit 0 or 1 by the checks of the result).
- **Output:** the result is written to `-o out.json`, else back to the input file, in the saved format of section 10. `--dry-run` writes nothing. The report goes to stdout; an error that stops `patch` before there is an outcome (unreadable or invalid scene, unreadable patch file, bad flags) goes to stderr without a report.
- **Report:** `--json` prints `{ "scene", "status": "applied"|"rejected"|"invalid", "error": null | { "code", "message" }, "locks", "diff", "checks", "failing" }`: `locks` = touched lock labels; `diff` = the `diff` entries from the original to the result (section 11.2); `checks` = `[{ "id", "check", "from", "to", "value": [before, after] }]` for each check whose status changed or whose value changed by more than 1e-9; `failing` = number of `fail` or `skip` results after the patch. A rejected or invalid patch reports empty `diff` and `checks` and `failing: null`; only a rejected one lists `locks`. The text format starts with `patch <scene id>: applied|rejected|invalid`, then one line per diff entry and per changed check; wording beyond that is free.
- **Log:** every applied or lock-rejected patch that is not a dry run appends one line to `<output file without .json>.log.jsonl`: `{ "seq", "patch", "description", "status", "error", "locks", "diff", "checks" }`, where `seq` is the number of non-blank lines already in the log plus one and `patch` is the patch file name without its directory (`-` for standard input). For an output name that does not end in `.json`, `.log.jsonl` is appended to the whole name. No timestamps: the version history of the files records when.
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
- **Pros:** one source; hot reload during development; switching engines means rewriting only the adapter (about 150–400 lines).
- **Cons:** the engine's editor does not show the layout unless the adapter runs in the editor (for example a Godot `@tool` script). That is not scheduled.
- Generating engine scenes at build time (`.tscn` for Godot, scene JSON for Phaser, TMX/JSON for Tiled) is not scheduled: a second loading path would double the upkeep and drift from the first.

### 13.3 Adapter contract (every engine)

- `project(u, v, h) → (x, y)`, matching the golden vectors; from stage 12 with the `projection` vectors of the runtime file (section 13.7).
- Draw order from the runtime file: adapters draw its `sprites` by the engine rule of section 13.4 (from stage 8; stage 5 to 7 adapters draw parts by `order`). Adapters do not sort static objects by any other rule. Actors, the moving objects the game adds, take their place by the same rule.
- Zones become areas and lanes paths, at their heights (stage 12); anchors become oriented points (`seat`, `queue_point`, `spawn`, `exit`, `wait`) that keep their `kind` and `facing`.
- Validate on load: the `schema` value and duplicate ids. Report errors; never ignore them silently.
- From stage 8: `instantiate(type) → node` through a type → prefab/scene/sprite map from the game. The image's pivot (the origin of the game's scene) sits on the projected center of the object's footprint at its base height (h = 0 before stage 12). A sliced object shows one copy of the image per slice, each cut to that slice (section 13.8). Types without a mapping are reported and drawn as debug boxes. On a state change, apply that state's overrides: hide and show objects, and from stage 12 parts (section 13.8).

### 13.4 Draw order: the main isometric trap

- Engines usually sort by one point per sprite (pivot y). That works for tile-sized objects. Long objects (a row of seats, a wall, a vehicle) sort wrong when a character walks around them.
- **Fixes, in order of preference:**
  1. Slice long objects along their long axis; each slice is a sprite with its own sort point.
  2. Split an object into a front part and a back part.
  3. Static objects: precomputed topological order. Moving objects: sort by foot depth.
- **Tool support:** the runtime file splits long objects into slices (below). `sort_consistency` (section 9.3) walks a test actor around each object, compares the engine rule with the geometric order, and reports the objects that still need a fix by hand: a front part and a back part as separate objects, other parts, or a footprint closer to a square.
- **Painter's order of parts** (from stage 5 the rule for `render`, the editor and the runtime file):
  1. List every part of every object: objects in file order, parts in type order (a type without parts has one part, `body`). A part's position in this list is its index.
  2. For each part: its world box (section 6); `c` = the camera direction of section 5 with each component rounded to 9 decimals; `depth` = `c · center` of the box, rounded to 6 decimals; its screen bounds = the smallest and largest x and y of its 8 projected corners.
  3. Two parts need an order only when their screen bounds overlap by more than EPS along x and along y.
  4. Each axis (u, v, h) along which the two boxes are apart (the upper end of one is at most the lower end of the other plus EPS) votes: when `|c|` on that axis is at most EPS, the pair needs no order; otherwise the vote puts first the box on the side away from the camera (the lower box when `c` is positive on that axis). When each box is apart from the other along an axis (both flat at the same coordinate, from stage 12 a common case along h), the box that comes first in the list of step 1 counts as the lower one. Votes that disagree: no order. No axis apart: the box with the smaller depth goes first; equal depths need no order.
  5. Place parts one at a time: among the unplaced parts whose required predecessors are all placed, take the one with the smallest depth, then the smallest index. When there is none (a cycle), take the unplaced part with the smallest depth, then the smallest index.
  - The rounding in step 2 keeps exact ties exact, so every implementation gives the same order. Ground, outlines and labels of the display list keep their place.
- **Sprites and sort keys** (from stage 7; used by the runtime file and `sort_consistency`):
  1. The key of a footprint `[u0, v0, u1, v1]` at base height b is `cu·(u0 + u1) + cv·(v0 + v1) + 2·b` with `c` as in step 2 of the painter's order, rounded to 6 decimals. It is twice the depth of the footprint's center at height b; the doubling keeps footprints with 6-decimal corners clear of rounding ties. An object's sprites use its base height (0 before stage 12); an actor's key uses the height it stands on (0 before stage 12).
  2. Each object becomes one or more sprites. Start from its footprint and its part boxes in world units, rounded to 6 decimals as in the runtime file; w = u1 − u0 and d = v1 − v0. Weigh them by the camera (stage 12; before it W = w and D = d): with the weights `ku = |cu|` and `kv = |cv|` and m the larger of the two, `W = w·ku/m` and `D = d·kv/m`; when m ≤ EPS the object is one sprite. When |W − D| ≤ EPS, or W or D is at most EPS, the object is one sprite. Otherwise the long axis is u when W > D, else v. With L the larger and S the smaller of W and D, the number of slices n is the integer n ≥ 1 that makes |L/n − S| smallest (a tie within EPS goes to the smaller n), and at most 64. When |cu| = |cv|, W = w and D = d, so the slices are those of stages 7 to 11.
  3. Along the long axis, from a0 to a1, the slice boundaries are t0 = a0, tn = a1, and tk = a0 + k·(a1 − a0)/n rounded to 6 decimals for 0 < k < n. Slice k (counted from 0) has the object's footprint with the long-axis range [tk, tk+1]; its key is the key of that footprint.
  4. The pieces of slice k are the part boxes with their long-axis range cut to [tk, tk+1], except that the first slice reaches to −∞ and the last to +∞, so parts that stick out of the footprint stay with the end slices. A piece no longer than EPS along the axis is left out. An object of one sprite has its footprint as sprite footprint and its whole part boxes as pieces. Pieces are listed in ascending painter's order of their parts.
  5. **Sprite list:** objects in file order; the sprites of an object in ascending order along its long axis.
  6. **Engine rule:** sprites are drawn in ascending key. On equal keys, scene sprites are drawn in the order of the sprite list, and actors after them. An actor's key is the key of its footprint. The pieces of a sprite are drawn in their list order.
  - One key per sprite gives the geometric order next to every actor position only when the sprite's footprint has `|cu|·w = |cv|·d`: a square when `|cu| = |cv|` (true isometric and 2:1 cameras, and every view form whose direction is 45 plus a multiple of 90). Slicing brings sprites close to that shape; `sort_consistency` measures the rest.

### 13.5 Flow and versions

```
scene.json (git) → isoblock export --target runtime → <game>/data/scenes/<id>.json → adapter
```

- Release builds load only scenes with `meta.status = "approved"`; drafts are for development. The runtime file carries the status and the game enforces this; `export` writes drafts too.
- Each breaking change of the scene format or the runtime format bumps its `schema` value and is listed in `CHANGELOG.md` with upgrade steps. From version 1.0.0 it also ships a migration script.

### 13.6 Cross-checks

- Core and every adapter run the golden vectors of `tests/golden/projection.json`, within 0.001.
- An engine screenshot of the adapter's debug drawing (section 13.8) and the tool's render agree:
  - **Each object alone** (every other object hidden): the box of the object's pixels lies within 1 px of the box of its polygons in the SVG of `render`, on every edge. Pixel boxes run from the first to one past the last pixel. The polygons are clipped to the frame before their box is taken (from stage 8; stage 5 to 7 clipped the box, which differs for a polygon that the frame cuts along a slanted edge); an object outside the frame draws nothing in either.
  - **Whole frame:** compared with a painter's raster of the SVG object polygons (each pixel center takes the last polygon that contains it, in document order, else the background), at most 100 pixels per 1,000,000 differ in which object they show.
  - A pixel center exactly on a polygon edge belongs to the polygon by the top-left rule, as GPUs fill. An object whose clipped SVG box is less than 1 px wide or high may cover no pixel center; it then has no pixel box, and that is not a failure.
  - Two runs give identical PNG bytes.
- Each object is also measured alone because an edge that another object hides cannot be measured in the whole frame.
- From stage 8 the adapter draws sprites by the engine rule, so these checks hold for scenes where no two objects overlap (`no_overlap`) and `sort_consistency` finds no static mismatch; the maintainer checks the scenes of the Godot cases for both, in each of their states. In a state, the SVG is the one of `render --state`. With an actor, the reference is the SVG of the scene with the actor added as its last object (type and id `isoblock-actor`, size `[w, d, h]`, footprint centered on the actor's position, from stage 12 at the height it stands on as its base height), at positions where the actor has no mismatch (section 9.3) with any sprite; there the whole frame may differ in at most `actorLimit` more pixels than the same frame without the actor (section 17).

### 13.7 Runtime file (`isoblock-runtime/3`)

`export --target runtime` writes the layout an engine needs: a reduced copy of the scene without relations, checks, locks, assumptions or generation hints. From stage 12 it is `isoblock-runtime/3`:

```json
{ "schema": "isoblock-runtime/3", "scene": "yard", "meta": { "version": 1, "status": "draft" },
  "units": {}, "camera": {}, "projection": {}, "cameraDir": [1, 1, 1], "frame": {}, "strips": [], "objects": [],
  "zones": [], "lanes": [], "states": {} }
```

- Top-level keys in that order, then the scene's top-level `x-` keys in file order. `scene` is the scene `id`; `meta.version` and `meta.status` come from the scene's `meta`, `null` when absent.
- `units` and every entry of `strips`, `zones` and `lanes` are copied from the scene file with all their keys, `x-` keys included, in file order. An absent list is `[]`. Heights keep the form they have in the scene: a zone without `h` is at 0, a lane point without a third number is at its lane's `h` (default 0).
- `camera`: the scene's camera in its form, defaults written, then its `x-` keys: `angleU`, `angleV`, `pxPerUnit`, `verticalScale` (default 1), `origin` for the axes form; `elevation`, `direction` (default 45), `scale`, `origin` for the view form. `projection`: `{ "axisU", "axisV", "up" }`, the screen vectors of section 5, each component rounded to 9 decimals; engines project with them and `camera.origin`. `cameraDir`: the `c` of section 13.4, with its 9 decimals.
- `frame`: `w`, `h` and `regions`, each `{ "id", "rect", "blocksScene" }` (`blocksScene` default `false`) followed by the region's `x-` keys.
- `objects` in file order, each `{ "id", "type", "pos", "rot", "base", "footprint", "tags", "parts", "anchors", "sprites" }` followed by the object's `x-` keys:
  - `rot` defaults to 0; `base` is the base height (the third number of `pos`, else 0); `footprint` is `[u0, v0, u1, v1]` after rotation (section 6); `tags` is `[]` when the object has none.
  - `parts` in type order, each `{ "id", "box", "order" }`: `box` is `[u0, v0, h0, u1, v1, h1]` in world units after rotation, raised by `base`; `order` is the part's position in the painter's order of section 13.4 (0 is drawn first).
  - `anchors`: the type's anchors as `{ "id", "at", "facing", "kind" }`, `at` = `[u, v, h]` in world units after rotation, raised by `base`; `facing` and `kind` only when the type gives them. `[]` when the type has none.
  - `sprites`: the object's sprites of section 13.4 in their order, each `{ "key", "footprint", "pieces" }`; `pieces` in their order, each `{ "part", "box" }` with the part's id and the piece's box in world units.
- `states`: one entry per state of the scene, in file order, each `{ "hide", "hideParts", "hideRegions" }` with the ids as the scene lists them (`[]`, `{}` and `[]` when absent), followed by the state's `x-` keys. `{}` when the scene has no states.
- Numbers the tool computes (footprints, part boxes, anchor positions, keys, sprite footprints, piece boxes) are rounded to 6 decimals, the `projection` vectors to 9; `pos`, `base` and copied values are written as they are in the scene. The file uses the saved format of section 10. Same input, same bytes.
- Stages 7 to 11 wrote `isoblock-runtime/2`: the same file without `projection`, `base`, the view form, `hideParts`, `hideRegions` and every `x-` key, with keys and slices that equal those of `/3` for a scene without base heights whose camera has `|cu| = |cv|`. Stages 5 and 6 wrote `isoblock-runtime/1`: also without `sprites` and `states`. `CHANGELOG.md` gives the upgrade steps.

### 13.8 Godot adapter

- Lives in `adapters/godot/`: GDScript for Godot 4.7 with the Compatibility renderer, 150–400 lines without its tests. It is not npm code and imports nothing from `src/`.
- Reads `isoblock-runtime/3` (from stage 12; `isoblock-runtime/2` in stages 7 to 11) and reports any other `schema` value as `E_SCHEMA`. It projects with the file's `projection` and `camera.origin`.
- **`build(data, color_of, scenes)`** (from stage 8; `color_of` and `scenes` optional) returns `{ root, code, message, unmapped }` and builds a `Node2D` tree:
  - `Objects`: one `Node2D` per object, named by its id, with metadata `id`, `type`, `rot`, `tags`, `footprint` and, from stage 12, `base`. Each anchor becomes a `Marker2D` child named by its id at its projected point, with `kind` and `facing` as metadata.
  - `Sprites`: one `Node2D` per sprite of the runtime file, with metadata `object` (the object id), `key` and `slice` (its position in the object's `sprites`). Their child order is the draw order of the engine rule (section 13.4); every `z_index` stays 0 and relative. Godot's y-sort is not used: it treats close keys as equal.
  - `Zones` and `Lanes`: each zone a `Polygon2D` of its points projected at its height and each lane a `Line2D` through its points projected at their heights (heights from stage 12); hidden, with their data as metadata.
- **Debug drawing:** a sprite of an unmapped type draws, piece by piece in list order, the faces of the piece's box that point toward the camera (as the display list does) as `Polygon2D` with antialiasing off, in one flat color per object that `color_of(object)` returns.
- **Instancing:** `scenes` maps type names to `PackedScene`s. A sprite of a mapped type holds an instance of that scene positioned at the object's pivot: the projection of the center of the object's footprint at its base height. Instances carry metadata `object`, `type`, `rot` and `slice`. An object of one sprite holds the instance directly. Each sprite of a sliced object holds a `Polygon2D` mask (the convex hull of the projected corners of the sprite's pieces, `clip_children` = `CLIP_CHILDREN_ONLY`) with its own instance as child, so each slice shows the part of the image inside its pieces; art outside the parts' boxes of a sliced object is not drawn. `unmapped` lists the types of the file's objects that `scenes` lacks, each once, in the order of their first object; it is `[]` when `scenes` is empty.
- **`apply_state(root, name)`**: shows every object and part and hides, with their sprites and anchors, the objects in `states.<name>.hide`; `""` shows everything. From stage 12 it also hides the parts in `states.<name>.hideParts`: in the debug drawing, the polygons of their pieces; in an instance, every descendant node whose metadata `part` equals the id of a hidden part of that object (the game's scene for a type marks the nodes that draw each part; nodes without `part` stay). An object whose every part is hidden is hidden as by `hide`. It sets the root's metadata `hidden_regions` to `states.<name>.hideRegions` (`[]` for `""`): frame regions belong to the game's interface, which reads it. An unknown name is `E_STATE` and changes nothing. Actors are not affected.
- **Actors:** `add_actor(root, id, size, at, node, color)` adds a moving object of `size` = `[w, d, h]` with its footprint centered on `at` = `(u, v)`, standing at height 0, or from stage 12 `at` = `(u, v, h)`, standing at height h; `move_actor(root, id, at)` and `remove_actor(root, id)` follow it. An actor is a child of `Sprites` with metadata `actor` (its id) and `key` (the key of its footprint, section 13.4), placed by the engine rule (its key that of its footprint at the height it stands on, section 13.4): after every scene sprite whose key is at most its key, before every scene sprite with a larger key; among actors with equal keys, in the order they were added (a moved actor keeps its place in that order; one removed and added again comes last). `at` is an array `[u, v]` or `[u, v, h]`, or a `Vector2` or `Vector3` whose single-precision components are read as the shortest decimals with the same value. `node`, when given, is the game's node for the actor, placed at the projection of `at` at the height it stands on; else the actor draws its box like a debug part in `color`. A duplicate id on `add_actor` and an unknown id on `move_actor` or `remove_actor` are `E_ACTOR`.
- **`sort_key(dir, footprint, base = 0)`** returns the key of section 13.4 for a camera direction with 9 decimals, a footprint and a base height (`base` from stage 12); the adapter uses it for actors.
- Errors are returned as `{ code, message }` and also printed; `build` builds nothing on an error. Codes: `E_SCHEMA` (also a file without `states` or an object without `sprites`), `E_DUPLICATE_ID`, `E_IO`, `E_JSON_PARSE`, `E_STATE`, `E_ACTOR`. `E_Z_RANGE` (stage 5 to 7) is gone with `z_index`. Lookups use metadata, not node names, because Godot changes some characters of names.
- **Tests:** `npm run test:godot` runs the golden vectors (`tests/golden/projection.json`, and the keys of `tests/golden/sort.json` through `sort_key` from stage 8, and of `tests/golden/sort-levels.json` with base heights from stage 12), the adapter's own tests, the cross-checks of section 13.6 for every case of `tests/fixtures/export/cases.json`, and from stage 8 every case of `tests/fixtures/godot/cases.json` and from stage 12 of `tests/fixtures/levels/godot.json` (section 17; a view-form camera, base heights, actors on a raised level, states that hide parts and a region), at frame size, 1 px per frame unit, under Xvfb with Godot 4.7.1 (`GODOT` names the binary). It is not part of `npm test`, because Godot is not an npm package; the maintainer runs it at review.

## 14. Image-generation integration

- **`gen-bbox`** (`export --target gen-bbox`): one screen box per object, with a short description from `types[].genHint`, for image-generation tools that place objects by boxes.

```json
{ "schema": "isoblock-genbbox/1", "scene": "yard", "frame": { "w": 1000, "h": 1000 }, "units": "px", "order": "xyxy",
  "boxes": [{ "id": "tree", "type": "tree", "box": [383.14, 220, 604.84, 488], "clipped": false, "hint": "young tree with a round canopy" }] }
```

  - `box`: the screen bounds of every corner of every part of the object (in a state, every part it does not hide, section 9.5), intersected with the frame `[0, 0, w, h]`. An object is left out when that intersection is at most EPS wide or at most EPS high. `clipped` is `true` when the frame cut the bounds.
  - `--bbox-units px` (default): pixels rounded to 2 decimals. `norm1000`: `x · 1000 / w` and `y · 1000 / h`, rounded to integers, halves up.
  - `--bbox-order xyxy` (default): `[x0, y0, x1, y1]`. `yxyx`: `[y0, x0, y1, x1]`.
  - `hint` only when the type has a `genHint`. Boxes follow file order. `gen-bbox` has no groups; the masks of section 14.1 have them, by tag.
- **Ground layers** (the display list of `render` and the editor): the frame background, then the strips, the zones and the lanes, under every object; the region outlines over the objects. From stage 12 the zones go in ascending height (zones of one height in file order) at their heights and the lanes at their heights, and a state leaves out the regions it hides. A zone above the ground is still drawn under every object: the object that carries a raised surface draws it.
- **Block image** (`render -o out.png`, stage 5): the SVG that `render -o out.svg` writes, without its text elements, rasterized by `@resvg/resvg-wasm` at 1 px per frame unit with no fonts loaded. Text is left out, so the image does not depend on the fonts of the machine. `dist/isoblock.mjs` carries the WebAssembly module and needs no other file.
- **Transparency** (from stage 9): a polygon drawn with an opacity below 1 carries it as `fill-opacity` and `stroke-opacity`, both with that value, never as the group attribute `opacity`. This holds for the SVG and therefore for the block image. With `opacity`, resvg 2.6.2 builds an off-screen layer for the shape and stops with `unreachable` (exit 70) on scenes whose shapes reach far outside the frame, such as a strip with an open bound under a semi-transparent region; with `fill-opacity` and `stroke-opacity` it draws them. Where the stroke of such a polygon covers its own fill, the two now blend, so the block images of release 0.8.0 differ along those strokes.
- **Per-object masks** (stage 13): section 14.1.
- **After generation:** a hook for external measuring tools to compare object positions in the new image with the layout. Measuring is outside the core.
- Generation never writes back to the scene file.

### 14.1 Object raster and masks (stage 13)

- **Raster:** W = ⌈frame.w⌉ by H = ⌈frame.h⌉ pixels, 1 px per frame unit, as the block image. Pixel (i, j), with 0 ≤ i < W and 0 ≤ j < H, has its center at (i + 0.5, j + 0.5).
- **Outline of a part:** the convex hull of the 8 corners of its world box (after rotation and base height; world coordinates are not rounded), projected by section 5, with each screen coordinate snapped to 1/256 px: X = ⌊256·x + 0.5⌋ and Y = ⌊256·y + 0.5⌋, in double precision. Pixel centers become (256·i + 128, 256·j + 128), so the test below is exact in integers. Collinear corners are dropped; an outline of fewer than 3 points, or of zero area, contains no pixel center.
- **Inside (top-left rule):** order the outline's vertices so that the shoelace sum Σ (X_k·Y_(k+1) − X_(k+1)·Y_k), indices modulo the number of vertices, is positive (clockwise on the screen, y pointing down). For an edge from (X0, Y0) to (X1, Y1), E(P) = (X1 − X0)·(P.y − Y0) − (Y1 − Y0)·(P.x − X0). A pixel center P is inside when, for every edge, E(P) > 0, or E(P) = 0 and the edge is a top edge (Y0 = Y1 and X1 > X0) or a left edge (Y1 < Y0). It is the rule of section 13.6.
- **Object raster:** take every part that is drawn in the state (not a part of a hidden object, not a hidden part, section 9.5) in the painter's order of section 13.4, computed on the scene in that state. Each pixel takes the object of the last part whose outline contains its center, else no object. Ground layers, regions and labels do not take part: a region with `blocksScene` covers no object. Because the faces of a box that face the camera cover its outline, this is the painter's raster of section 13.6 up to the snapping and the 2 decimals of the SVG.
- **Masks:** an object's **full mask** is the set of pixels whose centers lie inside the outline of at least one of its drawn parts, whatever is drawn over them; its **visible mask** is the set of pixels the raster gives to it. A **tag group** is the set of objects whose `tags` contain that tag; its masks are the unions of theirs.
- **Grow** by n pixels (an integer, 0 ≤ n ≤ 64): a pixel is in the grown mask when a pixel of the mask lies at most n pixels from it along x and at most n along y, within the raster. Growing gives an image tool a band around an outline for detail that the art adds.

`export --target masks -o <dir>` creates the folder `<dir>` when it is missing, replaces the files it writes and leaves other files alone:

- `labels.png`: the raster, a 16-bit grayscale PNG of W × H pixels. A pixel holds the 1-based position of its object in `objects` of the scene file, hidden objects counted, so the numbers are the same in every state; 0 for no object. It is never grown. A scene of more than 65,535 objects cannot be written this way: a usage error.
- `full/<index>.png` and `visible/<index>.png`, for each object with a full pixel (`<index>` as in `labels.png`): 8-bit grayscale PNGs, 255 in the mask and 0 elsewhere, of the **box** of its grown full mask, from its first pixel to one past its last pixel along x and along y (as in section 13.6). Its visible image has the same box.
- `groups/full/<n>.png` and `groups/visible/<n>.png`, for each tag group with a full pixel: those groups are numbered n = 1, 2, … in the order of `groups`; a group without a full pixel has no file and takes no number.
- `masks.json`, in the saved format of section 10:

```json
{ "schema": "isoblock-masks/1", "scene": "yard", "state": null, "frame": { "w": 1000, "h": 1000 }, "grow": 0, "labels": "labels.png",
  "objects": [{ "id": "actor", "index": 2, "type": "actor", "tags": [],
    "full": { "file": "full/2.png", "box": [364, 335, 420, 463], "pixels": 6262 }, "visible": { "file": "visible/2.png", "pixels": 5038 }, "share": 0.804535 }],
  "groups": [{ "tag": "static", "ids": ["tree"],
    "full": { "file": "groups/full/1.png", "box": [383, 220, 605, 488], "pixels": 34470 }, "visible": { "file": "groups/visible/1.png", "pixels": 34470 }, "share": 1 }] }
```

  - `frame` holds W and H. `objects` lists every object of the file in file order; `full`, `visible` and `share` are `null` for a hidden object and for an object without a full pixel. `pixels` counts a mask before growing, over the whole raster; `share` = visible pixels / full pixels, rounded to 6 decimals.
  - `groups` has one entry per tag, in order of first appearance (objects in file order, each object's tags in its order); `ids` lists every object with that tag in file order, hidden objects included; `full`, `visible` and `share` are those of its drawn objects, as for an object.
  - The PNGs are not interlaced; their filters and compression are free, so tools compare pixels, not bytes. Same input, same pixels.

## 15. Graybox gameplay hooks

- Anchors, zones and lanes carry a `kind` with gameplay meaning. The game-rules layer (outside this project) reads it.
- **Later:** an editor "dry run" mode: moving objects follow lanes to anchors, to reveal jams, crowding and occlusion.

## 16. Code architecture

```
src/
  core/      pure TypeScript: schema, model, projection, geometry, checks, displayList, describe (later: sort, solver, patch)
  cli/       Node: arguments, file I/O, SVG output; PNG from stage 5 via @resvg/resvg-wasm, bundled into dist/isoblock.mjs; from stage 13 the mask PNGs, encoded with node:zlib (the core computes the raster)
  editor/    from stage 2: one HTML page + ES modules, no framework; draws the displayList on Canvas 2D
schema/      isoblock-1.json
adapters/
  godot/     from stage 5: GDScript adapter for Godot 4.7 and its test project (section 13.8)
scripts/     build and test scripts (test-godot.mjs from stage 5)
tests/
  golden/    projection.json; sort.json (from stage 7)
  fixtures/  *.scene.json + *.expected.json (synthetic scenes, maintained by the maintainer)
docs/        AGENT_GUIDE.md
.github/
  workflows/ publish-rules.yml (from stage 9, maintainer): the publication check on every pull request
            ci.yml (from stage 10, builder): the test suite and the Godot cross-checks on every push and pull request
dist/        build output, not committed; from stage 10 also THIRD_PARTY_NOTICES.md
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
- **Size budget (guide):** core about 7,000 lines (8,608 after stage 14, of which about 930 are the raster, the masks, visibility and occluders); editor 1,500–2,500 (2,994 lines after stage 14; stage 14 added about 890 for parts and regions per state, the relation panel, Solve and the overlays); each adapter 150–400.
- Engine adapters live in `adapters/<engine>/`. They are not npm code, import nothing from `src/`, and read only the runtime file.
- **Notices in the build (stage 10):** `npm run build` copies `THIRD_PARTY_NOTICES.md` to `dist/` unchanged and writes a header line into each built file: line 2 of `dist/isoblock.mjs` (after the shebang) is `// Third-party notices: THIRD_PARTY_NOTICES.md next to this file.`, and the line after the doctype of `dist/editor.html` is `<!-- Third-party notices: THIRD_PARTY_NOTICES.md next to this file. -->`. A test bundles both entry points with esbuild's metafile and fails when the set of packages whose files it contains (name and version from the nearest `package.json` under `node_modules/`) differs from the rows of the notices table that list that file in their `In` column.
- **Continuous integration (stage 10):** `.github/workflows/ci.yml` runs on every push and pull request. Job `test`: Node 20 and 22, `npm ci`, `npm run typecheck`, `npm test` with Chromium installed by `node node_modules/playwright-core/cli.js install chromium` (the run must show no skipped tests), then the notices test. Job `godot`: downloads the Linux build of Godot 4.7.1 from the GitHub release `4.7.1-stable`, checks it against the release's `SHA512-SUMS.txt`, and runs `npm run test:godot` under Xvfb. The workflow installs nothing else and uses no secrets: it runs on `push` and `pull_request` only (never `pull_request_target`), with `permissions: contents: read`, and names each action with a version tag. Both jobs run on `ubuntu-24.04`, because `playwright-core` 1.56 cannot install Chromium on a newer runner image (Q-026); move to a newer image in the stage that upgrades it.

## 17. Roadmap and acceptance criteria

| Stage | Scope | Done when |
|---|---|---|
| 1 | Schema, projection, geometry, display list, SVG; checks `in_region`, `no_overlap`, `clearance`, `lane_clear`, `lane_reaches`, `visible`; `skip` for unsupported checks and lane shapes; CLI `validate`, `check`, `render` (SVG), `describe`; exit codes of section 11 | All tests pass; `tests/golden/projection.json` matches; all `tests/fixtures/*.scene.json` match their `*.expected.json` within tolerance; `render` of `yard` produces an SVG that opens and shows the expected layout |
| 2 | Editor: drag on both views, locks, undo, save, live check panel | 200 objects at 60 fps on a mid-range phone, measured on `tests/fixtures/crowd.scene.json` in headless Chromium with 4x CPU slowdown, phone profile (390x844 CSS px at pixel ratio 2, touch, one view), one pointer move per animation frame: the 95th-percentile interval between animation frames is at most 18.4 ms (1.1 display intervals) in at least one of up to 3 runs, each on a fresh page, where a run must meet every condition of its test, because a busy host drops frames now and then; dragging a locked object is blocked; a saved file parses to the same data as the file opened, and saving twice gives byte-identical files |
| 3 | Patches: short commands and JSON Patch, lock rejection, log; `diff`; `compare` | The 20 patches in `tests/fixtures/patches/` give their expected results; `compare` on `yard` with the 3 variants in `tests/fixtures/compare/` gives `yard.expected.json`, and its `text` and `md` output equal `yard.expected.txt` and `yard.expected.md` byte for byte |
| 4 | Relations (section 7), `relations`, solver and minimal conflict set (section 8) | `relations` on `tests/fixtures/relations/relations.scene.json` gives its expected results; every scene in `tests/fixtures/solver/` meets its expected file; the solve of `perf` meets the performance rule of section 8 |
| 5 | Painter's order of parts (section 13.4); `export --target runtime` (section 13.7) and `gen-bbox` (section 14); PNG render (section 14); Godot adapter and its cross-checks (sections 13.6, 13.8) | Every case in `tests/fixtures/export/cases.json` meets its expected files: the runtime file, and the `gen-bbox` file for each listed flag set, equal their expected files as JSON (same keys in the same order, numbers within the case file's tolerances) and are byte-identical over two runs; for each case with a `png`, `render -o out.png` decodes to the same size as that PNG and each RGBA channel of each pixel is within 1 of it; `dist/isoblock.mjs`, copied alone into an empty directory, writes a PNG; `npm run test:godot` passes section 13.6 on every case |
| 6 | States (hiding objects) and `--state` for `check`, `render`, `compare` and `export --target gen-bbox`; checks `reachable`, `capacity` and `min_screen_size` (section 9.2) | `check --json` on `tests/fixtures/gameplay/walk.scene.json` gives `walk.expected.json`; every case of `tests/fixtures/states/cases.json` meets its expected files; earlier fixtures still match |
| 7 | Sprites, slices and sort keys (section 13.4); `sort_consistency` (section 9.3); runtime file `isoblock-runtime/2` with sprites and states (section 13.7); the Godot adapter reads it | `tests/golden/sort.json` matches; every case of `tests/fixtures/sort/cases.json` meets its expected files; every case of `tests/fixtures/runtime/cases.json` equals its runtime file as JSON (same keys in the same order, numbers within its `world` tolerance) and is byte-identical over two runs; `npm run test:godot` passes on every export case; earlier fixtures still match, except the stage 5 runtime files, which the runtime cases replace |
| 8 | Godot adapter: sprites and actors drawn by the engine rule (section 13.4), states, `instantiate` by type with pivots and clipped slices (section 13.8); cross-checks with states and actors (section 13.6). Editor: grid checks re-run when a drag ends (section 10) | `npm run test:godot` passes: the keys of `tests/golden/sort.json` through `sort_key`; every case of `tests/fixtures/export/cases.json`, and every case of `tests/fixtures/godot/cases.json` in each of its states, meets section 13.6 (each object alone within 1 px with clipped polygons, whole frame within 100 pixels per 1,000,000, two runs identical); `build` returns each case's `unmapped`; at each actor position the whole frame differs in at most `actorLimit` more pixels than the same frame without the actor. In the editor, dragging an object of `tests/fixtures/gameplay/walk.scene.json` and of `tests/fixtures/sort/court.scene.json` meets the stage 2 frame-time criterion, and after the drop the check panel equals `check --json` on the saved file. All tests pass; earlier fixtures still match |
| 9 | Fixes and measures: transparency without group opacity in the SVG and the block image (section 14); `in_region` with `measure: "drawn"`, `min_screen_size` with `measure: "height"` and the check `lane_apart` (section 9.4), in `check`, `compare` and the editor's check panel; the meaning of `conflict` in the docs (section 8). Publication check for every builder branch (section 20) | Every case of `tests/fixtures/measures/cases.json` meets its expected results; every case of `tests/fixtures/export/cases.json` and of `tests/fixtures/states/cases.json` meets its expected files with the block images of release 0.9.0, including `openstrip`, whose block image release 0.8.0 could not write; `npm run check:publish` passes on the builder branch; all tests pass; earlier fixtures still match, except the block images, which this stage replaces |
| 10 | Agent protocol, round 2, and distribution: `--version`, `validate --json`, `check --only`, `describe --relations` and `--states`, `patch` from standard input (section 11); the short commands `add` and `remove` (section 12); name suggestions and quieter schema errors (section 6); `compare --relations` (section 11.1); `lane_reaches` on `top` and `bottom` (section 9.1); the notices in the build and continuous integration (section 16) | `check --json` on `tests/fixtures/edges/edges.scene.json` gives `edges.expected.json`; the 10 patches in `tests/fixtures/objects/` give their expected results; `compare --relations` on `yard` with the 4 variants in `tests/fixtures/compare/` gives `yard.relations.expected.json`, and its `text` and `md` output equal `yard.relations.expected.txt` and `yard.relations.expected.md` byte for byte; every case of `tests/fixtures/invalid/cases.json` meets its code, scene and detail rules; `describe --relations --states` on `yard` equals Appendix B; `patch` from standard input gives the same report and log as from a file; `npm run build` writes `dist/THIRD_PARTY_NOTICES.md` and the two header lines, and the notices test passes; the workflow passes on the branch; all tests pass; earlier fixtures still match |
| 11 | Editor, round 2: add, duplicate, delete and nudge objects, a state switch, hiding per state, settling an assumption (section 10); the short commands `hide` and `show` (section 12); `check --failing` and `solve --patch -` (sections 8 and 11) | The 7 patches in `tests/fixtures/hide/` give their expected results; every case of `tests/fixtures/editor/cases.json` meets its expected outcome; `check --failing --json` on every top-level `tests/fixtures/*.scene.json` gives the `fail` and `skip` results of its expected file, in order, and the exit code of the full check; `solve --patch -` on every scene in `tests/fixtures/solver/` prints the bytes that `solve --patch <file>` writes; the stage 2 and stage 8 frame-time criteria still hold; the workflow passes on the branch; all tests pass; earlier fixtures still match |
| 12 | Heights and cameras: the view form of the camera (section 5); base heights, boxes, levels and the check changes of section 9.5; zone and lane heights; states that hide parts and frame regions (section 9.5); heights in `move`, `add` and `lock` (section 12); sort keys with base heights and slices weighted by the camera (section 13.4); the runtime file `isoblock-runtime/3` (section 13.7) and the Godot adapter that reads it (section 13.8); ground layers by height (section 14); the editor items of section 10 | `tests/golden/projection.json`, its `views` included, and `tests/golden/sort-levels.json` match; every case of `tests/fixtures/levels/cases.json` meets its expected results; `describe --states` on `tests/fixtures/levels/levels.scene.json` gives `levels.describe.txt` without the check lines; the patches in `tests/fixtures/heights/` give their expected results; every case of `tests/fixtures/runtime3/cases.json` equals its runtime file as JSON and is byte-identical over two runs; every case of `tests/fixtures/levels/invalid/cases.json` meets its rules; `npm run test:godot` passes on every case of `tests/fixtures/export/cases.json`, of `tests/fixtures/godot/cases.json` and of `tests/fixtures/levels/godot.json`; every case of `tests/fixtures/editor/cases.json` and of `tests/fixtures/levels/editor/cases.json` meets its expected outcome; the stage 2 and stage 8 frame-time criteria still hold; the workflow passes on the branch; all tests pass; earlier fixtures still match, except the runtime files of `tests/fixtures/runtime/`, which those of `tests/fixtures/runtime3/` replace |
| 13 | Masks and visibility: the object raster and `export --target masks` (section 14.1); `visibility` and `occluders` (sections 11.3 and 11.4); the check `visible_share` (section 9.6) in `check`, `compare` and the editor's check panel | Every case of `tests/fixtures/masks/cases.json` meets its expected results: the `masks` cases their folders, the `visibility` and `occluders` cases their files, the `checks` cases their check results; every case of `tests/fixtures/masks/invalid/cases.json` meets its rules; the stage 2 and stage 8 frame-time criteria still hold; the workflow passes on the branch; all tests pass; earlier fixtures still match |
| 14 | The editor explains: warning margins (section 9.7) in `check`, `describe`, `compare` and the check panel; parts and regions in the short commands `hide` and `show` (section 12); in the editor, the part and region checkboxes, the relation panel, Solve with its proposal, the overlays and the script contract of section 10 | Every case of `tests/fixtures/explain/cases.json` meets its expected results: the `checks` cases their check results, `describe` its `WARN` lines, the `compare` cases their files; the patches in `tests/fixtures/explain/patches/` give their expected results; every case of `tests/fixtures/explain/editor/cases.json` meets its expected outcome and every case of `tests/fixtures/explain/editor/overlays.json` its rule; every case of `tests/fixtures/explain/invalid/cases.json` meets its rules; the stage 2 and stage 8 frame-time criteria still hold; the workflow passes on the branch; all tests pass; earlier fixtures still match |
| 15 | Lanes and levels: the lane shape of any polyline with a height per point, and on it `lane_clear`, `lane_reaches`, `lane_apart`, `against`, `clear_of` and `occluders` (sections 7, 9.8 and 11.4); `reachable` across levels with `toLevel` (section 9.8); the relation `facing` with `front` on types and anchors (sections 6 and 7); `solve --rotate` (section 8); `relate ... angle` and the part rule of `hide` and `show` (section 12); `Turn objects` and the other editor items of section 10 | Every case of `tests/fixtures/paths/cases.json` meets its expected results: the `checks` cases their check results, `relations` its results, the `occluders` cases their files; every scene of `tests/fixtures/paths/solver/` meets its expected file; the patches in `tests/fixtures/paths/patches/` give their expected results; every case of `tests/fixtures/paths/editor/overlays.json` meets its rule; every case of `tests/fixtures/paths/invalid/cases.json` meets its rules; the earlier fixtures match, with the files of `tests/fixtures/paths/earlier/` in place of those they replace; the stage 2 and stage 8 frame-time criteria still hold; the workflow passes on the branch; all tests pass |

Export targets `godot`, `phaser` and `tiled`, the check `state_stable` and states that move objects are not scheduled. Also not scheduled, but asked for by users of the tool: a relation that puts an object on another; parts above a clear height that may overhang the footprint without blocking the ground under them; a slice length per type, or slices along the short axis, for long thin objects; the tallest object a point may hold without occluding given objects and lanes; road markings generated from lanes and zones with road attributes; leaving out the objects and zones that a frame region does not show; `sort_consistency` results that do not flip when an object moves by less than `step`. Asked for after stage 15: rounded lane bends, lane shapes with a width per point, the `front` of objects and anchors in the runtime file.

Edge fixture (stage 10): `tests/fixtures/edges/edges.scene.json` with `edges.expected.json`, in the format of the stage 1 check fixtures.

Object patch fixtures (stage 10; from stage 11 also `hide` and `show` in `tests/fixtures/hide/`, the patches 31 to 37; from stage 12 heights in `tests/fixtures/heights/`): `tests/fixtures/objects/<name>.patch`, `tests/fixtures/hide/<name>.patch` and `tests/fixtures/heights/<name>.patch` with `<name>.expected.json`, as the patch fixtures, except that `base` is a path from the repository root (`tests/fixtures/yard.scene.json`, `tests/fixtures/objects/shelf.scene.json` or, from stage 12, `tests/fixtures/levels/levels.scene.json`).

Editor fixtures (stage 11): `tests/fixtures/editor/cases.json` = `{ cases }`, each case `{ name, scene, snap, steps, patch, expected, refused, panelState, hidden }`. In headless Chromium at a size where both views show, open `scene` (a path from the repository root) in `dist/editor.html`, set the snap step to `snap`, then do `steps` in order: `{ select: <id> }` taps the object in the plan view; `{ key: <key> }` presses that key (`Shift+` holds Shift) with no field focused; `{ press: <name>, type? }` chooses `type` in `Type to add` when given, then presses the button `<name>`; `{ state: <name> }` chooses it in `State`; `{ toggle: <name> }` clicks the checkbox `<name>` in the property panel of the selected object; `{ settle: <path> }` presses the `Settle` button of the assumption with that path, then `Confirm`; `{ undo: <n> }` presses `Undo` n times; from stage 12, `{ field: <name>, value: <number> }` sets the number field `<name>` of the property panel of the selected object to `value` and presses Enter. Then press `Save`. When `expected` names a file in `tests/fixtures/editor/`, the saved file equals it byte for byte; when it is `null`, the saved file equals the file saved right after opening, and when `refused` is true a notice was shown. `patch` is the short-command patch that gives the same file (information; `null` when there is none). With `panelState`, the `State` select shows that state, the check panel equals `check --json --state <panelState>` on the saved file, and the objects in `hidden` are neither drawn nor selectable; without it, the check panel equals `check --json` on the saved file.

Relation compare fixture (stage 10): `compare --relations` on `yard` with the variants `A`, `B`, `C` and `D` of `tests/fixtures/compare/`, in that order, gives `yard.relations.expected.json` (as the stage 3 compare fixture; `softPenalty` within `tolerance.value`), `yard.relations.expected.txt` and `yard.relations.expected.md`.

Invalid fixtures (stage 10): `tests/fixtures/invalid/cases.json` = `{ cases: [{ file, code, scene, contains, excludes }] }`; `file` is in `tests/fixtures/invalid/`. `validate --json` on it exits 2 and prints `ok: false`, `error.code` equal to `code` and `scene` equal to `scene`; every string of `contains` is a substring of `error.message` or of a line of `error.details`; no string of `excludes` is a substring of any of them.

Godot fixtures: `tests/fixtures/godot/cases.json` = `{ actorLimit, cases }`, each case `{ name, scene, states, instantiate, unmapped, actor }` (from stage 12 the points of an actor's `path` may have a third number, the height it stands on); `scene` is a path from the repository root. The harness exports the runtime file of the scene and builds it. When `instantiate` lists types, it maps each to a scene that draws, in white and relative to the object's pivot, the faces of the parts of the first object of that type (a case lists only types whose objects share one rotation), and gives each instance its object's color through `modulate`; `build` must return `unmapped` (otherwise `null` and the map is empty). It then applies the states of `states` in order (`null` = `""`, the default) and checks section 13.6 after each, against `render --state <state>` (or `render`). With `actor` = `{ size, path }`, it adds an actor of `size` at the first point of `path` in the last state, in a color of its own, and moves it to each next point: at each point the whole frame differs from the reference of section 13.6 in at most `actorLimit` more pixels than the frame of that state without the actor. The maintainer checked every actor position with the reference implementation: free, and without mismatch against any sprite.

Level fixtures (stage 12): `tests/fixtures/levels/` holds the scene `levels.scene.json` and the files below. They are kept apart from the earlier fixture lists so that release 0.11.0 passes its own suite on the branch that opens stage 12. `cases.json` = `{ tolerance, cases }`, each case `{ scene, state, checks, genBbox }`. `check --json`, with `--state <state>` unless `state` is `null`, matches `checks` in the format of the measure fixtures, where `pairs`, `occluders`, `positions` and `worst` compare as in the check and sort fixtures; `export --target gen-bbox`, with the same state, matches `genBbox` (a file in `tests/fixtures/levels/`, as the stage 5 `gen-bbox` files, `px` tolerance 0.02) unless it is `null`. `scene` is a path from the repository root. `levels.describe.txt` holds the output of `describe --states` on `levels.scene.json` without its check lines. `godot.json` holds Godot cases in the format of the Godot fixtures, on `godot.scene.json`: `levels.scene.json` with `crate2` moved off `post_b`, a plinth that is one sprite under this camera and no checks, because `levels` itself has an overlapping pair and a static mismatch (section 13.6, Q-027); `editor/cases.json` holds editor cases in the format of the editor fixtures, with their expected files in `editor/`; `invalid/cases.json` holds invalid cases in the format of the invalid fixtures, with their files in `invalid/`.

Mask fixtures (stage 13): `tests/fixtures/masks/` holds the scene `plaza.scene.json`, `cases.json`, the expected results in `expected/` and `invalid/`, apart from the earlier fixture lists so that release 0.12.0 passes its own suite on the branch that opens stage 13. `cases.json` = `{ tolerance, masks, visibility, occluders, checks }`; `scene` is a path from the repository root and `expected` a path in `tests/fixtures/masks/`:

- `masks`, each `{ name, scene, state, grow, expected }`: `export --target masks -o <dir>`, with `--state <state>` unless `state` is `null` and `--grow <grow>`, writes a `masks.json` equal to `<expected>/masks.json` as JSON (same keys, file names and lists), with `pixels` within `tolerance.pixels`, `share` within `tolerance.share` and box edges within `tolerance.box`; each mask image, placed at its box, differs from the expected image placed at its box in at most `tolerance.pixels` pixels, and `labels.png` from the expected one in at most `tolerance.labelPixels` pixels.
- `visibility`, each `{ name, scene, state, region, expected }`: `visibility --json` (with `--region` unless `region` is `null`, and `--state`) equals the expected file: lists and ids exactly, region pixels exactly, other counts within `tolerance.pixels`, shares and covers within `tolerance.share`.
- `occluders`, each `{ name, scene, state, lane or zone, actor, step, expected }`: `occluders --json --actor <w,d,h> --lane|--zone <id> --step <step>` (and `--state`) equals the expected file: `positions`, ids and the positions of each occluder exactly, `area` within `tolerance.area`.
- `checks`, each `{ scene, state, checks }`: `check --json` (with `--state`) matches `checks` as the measure fixtures do: `status`, `threshold` and `ids` exactly, `value` and `shares` within `tolerance.share`.
- `invalid/cases.json` holds invalid cases in the format of the invalid fixtures, with their files in `invalid/`.

The expected results come from the maintainer's reference implementation. Two implementations of section 14.1 can differ in the last bits of a projected coordinate, which can move a snapped vertex by 1/256 px and a few pixels along an edge; the tolerances absorb that.

Explain fixtures (stage 14): `tests/fixtures/explain/` holds the scene `margins.scene.json` and the files below, apart from the earlier fixture lists so that release 0.13.0 passes its own suite on the branch that opens stage 14. `scene` is a path from the repository root; other paths are in `tests/fixtures/explain/`.

- `cases.json` = `{ tolerance, checks, describe, compare }`. `checks`, each `{ scene, state, checks }`: `check --json`, with `--state <state>` unless `state` is `null`, matches `checks` as the measure fixtures do (`status`, `threshold` and `ids` exactly, `value` within `tolerance.value` or, for pixels, `tolerance.valuePx`, `shares` within `tolerance.share`). `describe` = `{ scene, expected }`: the lines of `describe` that start with `WARN` equal the lines of `expected`, in order. `compare`, each `{ scene, state, variants: [{ name, file }], expected: { json, txt, md } }`: `compare`, with `--state` unless `state` is `null` and the variants in that order, gives `txt` and `md` byte for byte and `json` as the stage 3 compare fixture.
- `patches/<name>.patch` with `<name>.expected.json`, as the object patch fixtures, on `tests/fixtures/levels/levels.scene.json`. When an expected file has `contains`, each of its strings is also a substring of `error.message` in the `--json` report.
- `editor/cases.json` holds editor cases in the format of the editor fixtures, with their expected files in `editor/`; a `toggle` step whose name starts with `Region ` clicks that checkbox in the section `Regions`.
- `editor/overlays.json` = `{ cases }`, each `{ name, scene, state, overlay }` with the fields below. Open `scene` in `dist/editor.html` as the editor fixtures do and choose `state` in `State` unless it is `null`; then, by `overlay`:
  - `relations`: turn on `Relations`. `overlay("relations")`, and the rows of the section `Relations` by `data-relation` and `data-status`, equal `relations --json` on the opened file. With `drag` = `{ object, dx, dy }`: drag that object in the plan view by (dx, dy) CSS pixels in 8 or more pointer moves, drop it and press `Save`; they equal `relations --json` on the saved file.
  - `proposal`: when `only` is an id, select that object and check `Only the selected object`. Press `Solve`: `overlay("proposal")` equals `solve --json` on the opened file, with `--only <only>` when `only` is an id; when its `status` is `conflict`, the rows of its conflict set carry `data-conflict="true"` and no other row does. Then press `then` (`Apply` or `Discard`) and `Save`. After `Apply` the saved file equals the one that `isoblock solve <file> --patch - | isoblock patch <file> - -o <out>` writes from the opened file (with the same `--only`), and `Undo` gives back the opened file; after `Discard` it equals the file saved right after opening, and `overlay("proposal")` is `null`.
  - `sortPoints`: turn on `Sort points`. For each object drawn in the state, the entries of `overlay("sortPoints")` with that `object` equal the object's `sprites` in `export --target runtime`, in order: the same `key`, and `point` the center of the sprite's `footprint` at the object's `base`. Hidden objects have none.
  - `rays`: turn on `Occlusion rays` and tap the check row `check`. `overlay("rays")` names that check and has 64 samples per sampled face (section 9.1); the share of occluded samples equals the `value` of that check in `check --json` (with the state), and the ids in `by`, over all samples, are its `occluders`.
  - `masks`: turn on `Masks`. `overlay("masks")` equals `visibility --json` (with the state) on the opened file. With `drag`, as for `relations`: during the drag `staleOverlays` contains `masks`; after the drop and `Save`, `overlay("masks")` equals `visibility --json` on the saved file.
  - `occluders`: choose `area` in `Occluders of`, type `actor` in `Actor size` and `step` in `Occluder step`. `overlay("occluders")` equals `occluders --json --actor <actor> --step <step>` with `--lane <id>` or `--zone <id>` as `area` names it (and the state) on the opened file; when that command exits 2, it is `null` and a notice was shown. With `drag`, as for `masks`, with `occluders` in `staleOverlays`.
  - `null`: the check panel has one row per result of `check --json` (with the state), in order, whose `data-status` is the result's status, `warn` included.
- `invalid/cases.json` holds invalid cases in the format of the invalid fixtures, with their files in `invalid/`.

The check results, `WARN` lines, compare outputs, patch results and editor files come from the maintainer's reference implementation. The overlay cases compare the editor with the command line of the same build, whose outputs the earlier fixtures check.

Path fixtures (stage 15): `tests/fixtures/paths/` holds the scenes `paths.scene.json` and `slash.scene.json` and the files below, apart from the earlier fixture lists so that release 0.14.0 passes its own suite on the branch that opens stage 15. `scene` and `base` are paths from the repository root; other paths are in `tests/fixtures/paths/`.

- `cases.json` = `{ tolerance, checks, relations, occluders }`. `checks`, each `{ scene, state, checks }`: `check --json`, with `--state <state>` unless `state` is `null`, matches `checks` as the measure fixtures do (`status`, `threshold` and `ids` exactly, `value` within `tolerance.value` or, for pixels, `tolerance.valuePx`, `overlap` within `tolerance.value`, and the fixed messages of 9.1, 9.2 and 9.8 where the expected result has a `message`). `relations` = `{ scene, results }`: `relations --json` matches `results` as the relation fixture does. `occluders`, each `{ name, scene, state, lane, actor, step, expected }`: `occluders --json --lane <lane> --actor <w,d,h> --step <step>` (and `--state`) equals `expected` as the occluders cases of the mask fixtures do, `area.level` included.
- `solver/<name>.scene.json` with `<name>.expected.json`: as the solver fixtures, run with `--rotate` when `rotate` is `true`; when `rot` is not `null`, the proposal that `-o` writes gives every object the `rot` that `rot` names for it (0 when the object has none).
- `patches/<name>.patch` with `<name>.expected.json`, as the patch fixtures of `tests/fixtures/explain/patches/` (with `contains`), on `base`.
- `editor/overlays.json` holds cases in the format of `tests/fixtures/explain/editor/overlays.json`. A `proposal` case with `rotate` checks `Turn objects` (and leaves it clear when `rotate` is `false`) before `Solve`, and its command lines take `--rotate` when `rotate` is `true`.
- `invalid/cases.json` holds invalid cases in the format of the invalid fixtures, with their files in `invalid/`.
- `earlier/<path>` replaces `tests/fixtures/<path>` for this stage. These files hold the earlier results that change because stage 15 measures lanes that stage 14 skipped: `lane.expected.json` (`c6`), `edges/edges.expected.json` (`c10`), `measures/cases.json` (`diag_shape`), `levels/cases.json` (`steps_clear`), `relations/relations.expected.json` (`r17`) and, in `heights/43-height-lock-other-axis.expected.json`, the check changes, which now name `steps_clear`. Nothing else in them differs. The release commit of stage 15 moves them over the files they replace.

The check results, relation results, occluders, patch results, solver bounds and replaced results come from the maintainer's reference implementation; the overlay cases compare the editor with the command line of the same build.

Measure fixtures (stage 9): `tests/fixtures/measures/cases.json` = `{ tolerance, cases }`, each case `{ scene, state, checks }`: `check --json`, with `--state <state>` unless `state` is `null`, matches `checks` in the format of the check fixtures: `status`, `threshold` and `ids` exactly, `value` within the tolerance, and `outside` and `overlap`, where the expected result has them, within `tolerance.value`; a result that the expected file gives without `outside` or `overlap` must not have them. `scene` is a path from the repository root.

Golden sort vectors: `tests/golden/sort.json` = `{ tolerance, keys, slices }`. Each entry of `keys` `{ camera, footprint, key }`, from stage 12 also with `base`: the key of that footprint at that base height (0 without it) under that camera, in either form (section 5). Each entry of `slices` `{ name, camera, footprint, parts: [{ id, box, order }], sprites }`, from stage 12 also with `base`: the sprites (as in the runtime file) of an object with that footprint, base height and those part boxes in world units and painter's orders. Numbers match within `tolerance`. From stage 12, `tests/golden/sort-levels.json` has the same format, with keys at base heights and under view-form cameras, and slices weighted by the camera.

Sort fixtures: `tests/fixtures/sort/cases.json` = `{ cases, compare }`. Each case `{ scene, state, checks }`: `check --json`, with `--state <state>` unless `state` is `null`, matches `checks` in the format of the check fixtures (`sort_consistency`: `status`, `value` and `ids` exactly, `worst` within `tolerance.valuePx`, `positions` exactly). Each `compare` entry is as in the state fixtures, with `state` `null` for `default`. Paths in `scene` are from the repository root; the others are in `tests/fixtures/sort/`.

Runtime fixtures: `tests/fixtures/runtime/cases.json` = `{ tolerance: { world }, cases: [{ name, scene, runtime }] }`: `export --target runtime` of `scene` (a path from the repository root) equals `runtime` (in `tests/fixtures/runtime/`) as JSON, numbers within `world`. From stage 12, `tests/fixtures/runtime3/cases.json` has the same format, with the files of `isoblock-runtime/3`: every case of `tests/fixtures/runtime/` and `levels`. Release 0.12.0 removed `tests/fixtures/runtime/` and its `isoblock-runtime/2` files.

Gameplay fixture: `tests/fixtures/gameplay/walk.scene.json` with `walk.expected.json`, in the format of the stage 1 check fixtures; messages are compared only where 9.1 or 9.2 fixes them.

State fixtures: `tests/fixtures/states/cases.json` = `{ cases, compare }`. Each case `{ scene, state, checks, genBbox, png }`: `check --json --state <state>` matches `checks` (format and tolerance of the check fixtures; the file also names its `state`); `export --target gen-bbox --state <state>` matches `genBbox` (as the stage 5 `gen-bbox` files, `px` tolerance 0.02) unless it is `null`; `render --state <state> -o out.png` matches `png` (each RGBA channel within 1) unless it is `null`. Each `compare` entry `{ scene, state, variants: [{ name, file }], expected: { json, text, md } }`: `compare --state <state>` with the variants in that order gives `text` and `md` byte for byte and `json` as the stage 3 compare fixture. Paths in `scene` are from the repository root; the others are in `tests/fixtures/states/`.

Export fixtures: `tests/fixtures/export/cases.json` = `{ tolerance, cases }`, each case `{ name, scene, genBbox: [{ args, file }], png }`. `scene` is a path from the repository root; `file` and `png` are file names in `tests/fixtures/export/`; `args` are the flags added to `export --target gen-bbox`; `png` is `null` when the case has none. Tolerances: `px` and `norm1000` for `gen-bbox` numbers by unit, `pngChannel` for PNG channels. Runtime files are in the runtime fixtures; the stage 5 runtime files (`isoblock-runtime/1`) were removed with release 0.7.0. The expected PNGs come from resvg 2.6.2 with no fonts loaded; from stage 9 they are drawn from SVGs with `fill-opacity` and `stroke-opacity` (section 14).

Patch fixtures: `tests/fixtures/patches/<name>.patch` with `<name>.expected.json` = `{ base, tolerance, exit, status, error, locks, diff, checks, failing }`. `base` names `tests/fixtures/<base>.scene.json`; `exit` is the exit code of `isoblock patch` on a copy of that scene; `error` is the error code or `null`; `locks`, `diff`, `checks` and `failing` are the fields of the `--json` report (`failing` is `null` unless the patch is applied). Check values compare within `tolerance.value` (pixels `tolerance.valuePx`), diff numbers within `tolerance.coordinate`; messages are not compared.

Relation fixture: `tests/fixtures/relations/relations.expected.json` = `{ scene, tolerance, results }`, with `id`, `rel`, `hard`, `status`, `violation` (within `tolerance.value`) and `ids` per relation; messages are not compared.

Solver fixtures: `tests/fixtures/solver/<name>.scene.json` with `<name>.expected.json` = `{ scene, only, status, conflict, hardViolated, maxSoftPenalty, maxDistance, unchanged, referenceSoftPenalty, referenceDistance }` (from stage 15, those of `tests/fixtures/paths/solver/` also have `rotate` and `rot`, above). `isoblock solve` (with `--only` when `only` is not `null`) must give `status` and exactly `conflict`; for `solved`: no violated hard relation (`hardViolated` is `[]`), the constraints of section 8 hold, `softPenalty` ≤ `maxSoftPenalty`, `distance` ≤ `maxDistance`, the objects in `unchanged` keep their positions, every changed coordinate is on the 0.05 grid, and two runs give byte-identical output. `maxSoftPenalty` is the maintainer's reference result plus 0.5; `maxDistance` is twice the reference distance, at least the reference distance plus 2. The `reference*` fields are information.

One stage per branch. A stage starts only after the previous one is squash-merged into `main`. Before opening a stage, the maintainer adds the fixtures and expected results its acceptance criteria need. The maintainer reviews by behavior (`describe`, render, check results on fixtures), not by reading code.

Versions: the maintainer sets `version` in `package.json` in the release commit on the builder branch. Stage N releases as `0.N.0`; fixes between stages bump the patch number.

## 18. Known limits

- **Boxes are not final shapes.** Re-check visibility and collisions once real art exists. Parts that follow the art closely reduce the error.
- **Orthographic projection does not shrink distant objects.** A backdrop stays as wide as the foreground, so it is often drawn at its own scale (a `decor` strip). Physical scale is not checked there.
- **A simple solver can get stuck in a weak solution.** People can always drag and lock. A weak solver also widens the conflict set, because deletion filtering trusts it to find solutions.
- **Each engine sorts draw order its own way.** Golden tests and `sort_consistency` are mandatory. The runtime file carries the order of static parts so that adapters do not sort them.
- **The block image has no text** (section 14).
- **`reachable` works on a grid.** A gap close to `step + 2 · radius` wide may open or close as the grid shifts; use a smaller `step` where it matters.
- **One sort key per sprite is never exact next to a footprint that is not square** (section 13.4). Slices shrink the error to thin strips at sprite corners; `maxPixels` sets how much of it a scene accepts.
- **Grid checks wait for the drop.** `reachable` and `sort_consistency` take too long to run on every pointer move, so during a drag their rows show the last result, out of date (section 10). Up to release 0.7.0 they did run on every move, and dragging on `walk` and `court` fell to about 12 frames per second.
- **`sort_consistency` samples actor positions on a grid.** An error strip narrower than `step` may fall between samples and change as objects move by less than `step`.
- **Zones are drawn under every object, whatever their height** (section 14). A raised walkable surface shows as the object that carries it.
- **One key per sprite and base heights.** A sprite's key adds twice its base height (section 13.4). At a low elevation the ground terms outweigh it, so an object or an actor on the far side of a wide raised object can be drawn before the slice it stands on; `sort_consistency` with `level` measures it, and a raised surface made of narrower objects has less of it.
- **`reachable` crosses levels only through lanes.** Without `toLevel` it stays on one level; with it (stage 15) a path changes level through the lanes whose two ends lie at two levels, attached at those ends only (section 9.8). A level without a walkable zone has no cells, and a ramp drawn as an object rather than a lane joins nothing.
- **A lane is a chain of rectangles** (section 9.8). At a bend the outer corner between two pieces is not part of the lane: an object there does not block it, and distances to the lane do not count it. Where that corner matters, widen the lane or mark the corner with a zone. A stair is measured as a ramp from its first step to its last.
- **Masks are of blocks.** The masks of section 14.1 cover the parts' boxes at 1 px per frame unit; art drawn inside or past them differs, which is what growing a mask leaves room for. A region with `blocksScene` is an interface over the scene and covers no object in the raster.
- **`occluders` follows the geometric order.** It lists what the painter's order draws over the actor; an engine that sorts one key per sprite draws the same only where `sort_consistency` finds no mismatch.
- **A warning is a margin on one bound** (section 9.7). It says that a value is close to failing, not why, and checks that count objects have none.
- **The editor's raster overlays wait for the drop.** `Masks` and `Occluders of` rasterize the frame or search a grid, so during a drag they show their last data, out of date (section 10).
- **A proposal is the solver's,** with its limits (section 8): the ghosts show where it would move objects, and `conflict` still names more relations than needed when the search starts from poor positions.
- **`facing` measures from one point** (section 7): an object faces from its footprint center, so a long object can count as facing a target that only one end of it sees; an anchor gives a better point. The solver turns objects in quarter turns, and only the objects it may move (section 8).

## 19. Open questions

1. Should the base unit be meters or a reference height? A reference height suits art; meters suit mixed character sizes. A declared conversion may cover both.
2. Is free rotation needed?
3. Should walkable areas be polygons or grids?
4. Is concurrent editing needed? (Initially: no.)

## 20. Repository workflow

Three roles work with this repository:

- **Builder:** a coding agent of any vendor, or a person, that implements one roadmap stage per branch. Instructions: `AGENTS.md`. The rules of this section hold whichever tool runs the session.
- **Maintainer:** owns this spec and the test data, answers questions, reviews builder branches and prepares releases. Instructions: `MAINTAINING.md`.
- **Repository owner:** the only one who writes to `main`.

| File | Content | Edited by |
|---|---|---|
| `SPEC.md` | This specification | Maintainer |
| `AGENTS.md`, `MAINTAINING.md` | Role instructions | Maintainer |
| `ROADMAP.md` | Stages with task checklists and acceptance criteria from section 17 | Maintainer opens and closes stages; builder ticks tasks |
| `QUESTIONS.md` | Unclear points. The builder asks, picks the safest reading and records it; the maintainer answers | Both |
| `tests/golden/`, `tests/fixtures/` | Test data and expected results | Maintainer |
| `scripts/check-publish.mjs`, `tests/repo/checkPublish.test.ts`, the `check:publish` entry of `package.json`, `.github/` except `.github/workflows/ci.yml` | The publication check, its tests and the workflow that runs it on pull requests | Maintainer |
| `.github/workflows/ci.yml` | The test workflow (section 16) | Builder, from stage 10; the maintainer reviews it |
| `docs/AGENT_GUIDE.md` | Guide for agents that use the tool: install, commands, patch syntax, check meanings, `describe` and `compare` examples | Builder |
| `CHANGELOG.md` | Changes per stage; scene-format breaks; migration scripts | Builder writes under `Unreleased`; the maintainer renames it to the version in the release commit |
| `log/` | One file per work session | Whoever ran the session |

**Branches and releases**
- Only the repository owner writes to `main`, in two ways: commits made and signed on the owner's machine, or squash-merges of pull requests, done by the owner on GitHub or locally. Every commit on `main` therefore carries the owner's identity.
- Builders push only to their own branch; they do not open pull requests, issues or releases, comment on GitHub, merge, tag or write to `main`. An agent's environment may add a link to the agent's session to anything the agent writes on GitHub, and GitHub keeps every earlier version of an edited description or comment, so the builder writes the pull request's title and description in its log and the owner opens the pull request. An environment that can deliver work only by opening a pull request itself is not used for builder sessions.
- The maintainer pushes to its own branches, adds the release commit to a reviewed builder branch and posts its review as a pull request comment. It opens no pull request, merges nothing and does not write to `main`. It reads each comment back after posting; a comment that carries an agent trace is deleted and posted again without it.
- At the end of a stage the builder records "branch ready for review" in its session log, pushes the branch and ends the log with the pull request's title and description; the owner opens the pull request.
- The maintainer reviews the branch, pushes a release commit to it (version, roadmap, changelog, next-stage fixtures), and posts the review result and a squash commit message as a pull request comment. The review is a comment, not a formal approval.
- The owner squash-merges the pull request. That squash commit on `main` is the release, identified by `version` and commit hash. No tags or GitHub Releases are required; the owner may publish a GitHub release of it, with the source archives only until built files may be distributed (`MAINTAINING.md`, Before distributing a build).
- The maintainer's own changes (spec, answers, test data) follow the same path from a maintainer branch.
- `dist/` is not committed. Build it from the merged commit with `npm run build`. Outputs: `dist/isoblock.mjs` (single-file CLI) and, from stage 2, `dist/editor.html` (single-file editor); from stage 10 also `dist/THIRD_PARTY_NOTICES.md`, which travels with the two files.
- From stage 10, the workflow of section 16 runs the test suite on every push and pull request. A pull request is reviewed only when it passes.

**Content rules**
- Everything under version control is written in plain technical English: code, comments, messages, tests, docs, logs, commit messages.
- This repository is project-neutral. It never contains names, scenes, measurements or criteria taken from a specific game or client project. Fixtures and examples are synthetic.
- **No agent traces.** Commit messages, pull request titles and descriptions, comments and committed files contain no links to agent sessions, tasks, runs or chats and no identifiers of them, from any tool: no `Claude-Session:` or similar trailer lines, no task or session URLs, no "generated with" footers that point to a session. This holds even when an agent's environment adds them; the agent removes them before it pushes. Commit messages contain no URLs at all. The repository is public: every pushed commit, branch and edit of a description is visible, and a pushed commit cannot be taken back.
- **Commit identity.** Every commit on a builder or maintainer branch has the author and committer identity that the agent's environment sets up for its agent, signed the way that environment signs; an agent does not invent an identity. A person commits with their GitHub no-reply address. Accepted addresses: a no-reply address (its local part is `noreply` or `no-reply`, a `+tag` allowed, or its domain is a no-reply domain such as `users.noreply.github.com`) or an agent identity listed in `scripts/check-publish.mjs`, which the maintainer extends when a new agent's own identity is first seen. Addresses at reserved domains (`example.com`, `example.org`, `example.net`, `.invalid`, `.example`, `.test`) are not identities: they are refused for authors and committers and allowed only in text. Any other address in a commit message or an added line is taken for a personal one and refused.
- **Commit messages.** The subject is one line in English in the imperative mood, starts with a capital letter, has at most 72 characters and no period at the end, and carries no prefix such as `feat:` or `[stage 9]`. A body follows one blank line, in plain sentences wrapped at 72 columns, saying what changed and why. The message ends, after one more blank line, with trailers of two kinds only: `Co-authored-by:` (any letter case) and `Signed-off-by:`, one per address, each address accepted by the identity rule. A `Co-authored-by:` line credits the person who started the session or the model, when the environment adds it or when the author identity does not name the model.
- **Branch names** are public: builders push `builder/<topic>` (for a stage, `builder/stage-<N>`), the maintainer `maintainer/<topic>`. A name that an agent's environment generates can identify its session, so it is renamed before the first push.
- **Starting and pushing.** A builder session starts from the latest `main`: it fetches `origin` and creates its branch from `origin/main`, never from a copy of the repository that its environment prepared earlier. Nobody force-pushes or deletes a branch, except the maintainer rewriting a branch to remove an agent trace (below).
- **Publication check.** `npm run check:publish` runs `scripts/check-publish.mjs`: it checks the branch name, every commit of the branch that is not on `main` (identity, message) and the lines the branch adds to text files (session links, addresses), and with `--title` and `--body-file` a pull request's title and description. A branch `builder/stage-<N>` must build the stage that `ROADMAP.md` on `main` marks open and start at or after the commit that opened it; a branch must contain its copy on `origin`, when git knows one, so that pushing needs no force. Builders run it before their first push; the maintainer runs it at review; the workflow `.github/workflows/publish-rules.yml` runs the base branch's copy on every pull request, with its title and description. A finding blocks the merge. Commits pushed with a finding stay visible on GitHub even after the branch is rewritten, which is why the check runs before the first push; when it happens anyway, the maintainer rewrites the branch and force-pushes it, and tells the owner, who decides whether to ask GitHub to remove what is left.
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
- Object table: columns are left-aligned; each is as wide as its widest cell (header included) plus a gap of 2 spaces after `id`, `type` and `rot`, and 3 after `pos(u,v)` and `size(w,d,h)`. `size` is the type's size before rotation. From stage 12, when the `pos` of some object has three numbers, the column header is `pos(u,v,h)` and every row prints three numbers, the base height 0 for a `pos` of two.
- `*` follows each number that an assumption path points to. The line `(* = provisional value)` appears only when a `*` is printed.
- Lists inside check lines (ids, occluders) are joined with `, `.
- Positions, sizes, gaps and assumption values: 2 decimals (up to 4 when 2 would lose information). Pixel values: whole numbers after `≈`. Fractions: whole percentages.
- Assumption paths are shortened: `/types/<t>/size/<0|1|2>` prints as `<t>.size.<w|d|h>`; `/types/<t>/parts/<k>/box/<0..5>` prints as `<t>.<part id>.<u0|v0|h0|u1|v1|h1>`; any other path prints as the JSON Pointer. Entries are joined with ` · `.
- Camera label: `iso30`, `dimetric21`, or `u<angleU>/v<angleV>`; for the view form (stage 12) `e<elevation>/d<direction>`, and the header gives `<scale> px/<unit>`.
- The frame label names the first region without `blocksScene`.
- One line per failing, warning or skipped check, in `checks` order, using these templates (for `WARN` lines, from stage 14, see the next item):
  - `FAIL <id> in_region <ids, comma-separated>: outside <region>` (append `/<strip>` when a strip is given)
  - `FAIL <id> no_overlap <a×b, …>: <n> overlapping pairs`
  - `FAIL <id> clearance <a×b>: gap <value> < <min>`
  - `FAIL <id> lane_clear <lane>: blocked by <ids, comma-separated>`
  - `FAIL <id> lane_reaches <lane>: meets <edge> edge at y≈<value> (<region> y <y0>-<y1>)` for `right` and `left`, `FAIL <id> lane_reaches <lane>: meets <edge> edge at x≈<value> (<region> x <x0>-<x1>)` for `top` and `bottom` (stage 10), or `FAIL <id> lane_reaches <lane>: does not reach <edge> edge`
  - `FAIL <id> visible <target>: <percent>% occluded (<occluders, comma-separated>)`
  - `SKIP <id> <check>: <message>`
- `WARN` lines (stage 14, section 9.7) give the value, the margin and the bound: distances, path lengths and their margins in units with the rule for gaps above; pixels as whole numbers, halves up; fractions as whole percentages, halves up; counts as they are.
  - `WARN <id> clearance <a×b>: gap <value>, within <warn> of <min>`, with the ids in the order of the result's `ids`
  - `WARN <id> lane_apart <lane>×<target id>: <value>, within <warn> of <min>`
  - `WARN <id> visible <target>: <percent>% occluded, within <warn percent>% of <maxOccluded percent>%`
  - `WARN <id> reachable <ids, comma-separated, or path when none>: path of <value> <unit>, within <warn> of <max>`
  - `WARN <id> capacity <kind>: <value> usable, within <warn> of <min>`
  - `WARN <id> min_screen_size <target>: <value> px, within <warn> px of <min> px`; with `measure: "height"`, `<value> px tall, within …`
  - `WARN <id> visible_share <ids, comma-separated>: <percent>% shown, within <warn percent>% of <min percent>%`, with the ids of the result and its `value`
- With no such line, print `checks: all N pass` (`checks: none` when the scene declares no checks).
- No assumptions: `assumptions: -`.

Stage 10 flags. `describe --relations` inserts, after the check lines and before `assumptions:`, one line per violated or skipped relation in `relations` order, then a summary line; `describe --states` inserts one line at the same place, after the relation lines when both flags are given. Output of `isoblock describe tests/fixtures/yard.scene.json --relations --states`, lines 11 to 13 (the other lines are those of the example above):

```
BAD r1 in_front_of bench×tree: violation 0.7172
relations: 2 · 1 violated · 0 skipped · hard 1 of 1 satisfied · soft penalty 0.7172
states: closed hides bench
```

- `BAD <id> <rel> <targets>: [hard; ]violation <value>` for a violated relation (`hard; ` only when it is hard); `SKIP <id> <rel> <targets>: <message>` for a skipped one. `<targets>` is `<a>×<b>` (`<a>` alone when there is no `b`) as written in the relation, so `zone:`, `lane:` and `strip:` targets are printed as they are; for `order_along` it is the `ids` joined with `×`.
- Summary: `relations: <n> · <v> violated · <k> skipped · hard <h> of <H> satisfied · soft penalty <p>` with `n` relations, `v` violated, `k` skipped, `h` satisfied hard relations of `H` hard relations, and `p` the soft penalty of section 7; `relations: none` when the scene has no relations. Violations and the penalty use the number rule of the gaps (2 decimals, up to 4).
- States: `states: <name> hides <ids, comma-separated>` for each state in file order, joined with ` · `; a state that hides nothing prints `<name> hides nothing`; `states: none` when the scene has no states. From stage 12 what a state hides is up to three items joined with `; `: its object ids (comma-separated), `parts <object id>/<part id>, …` in the order of `hideParts` and its lists, and `regions <ids, comma-separated>`; an empty item is left out, so `cinema hides crate2; parts kiosk/awning; regions board` and `bare hides parts mast/body`.

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

View form (stage 12): `elevation 30`, `direction 60`, `scale 100`, `origin [0, 0]`. `axisU = (86.603, 25.000)`, `axisV = (−50.000, 43.301)`, `up = (0, −86.603)`, `c = (0.866025, 1.5, 1)`.

| (u, v, h) | (x, y) |
|---|---|
| (1, 0, 0) | (86.603, 25.000) |
| (0, 1, 0) | (−50.000, 43.301) |
| (0, 0, 1) | (0.000, −86.603) |
| (2, 1, 0.5) | (123.205, 50.000) |
| (1.5, 0.25, 1.2) | (117.404, −55.598) |

The file's `views` hold more view-form cameras, each with its `axisU`, `axisV`, `up`, `cameraDir` and cases; one of them, `elevation 35.264389682754654` (asin(tan 30°)), `direction 45`, `scale 122.474487`, gives the axes-form camera above within the tolerance.

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

With `--relations` (stage 10) and a fourth variant `D=tests/fixtures/compare/yard.D.patch`, which moves `crate2` along v and so breaks the hard relation `r2` (`tests/fixtures/compare/yard.relations.expected.txt`):

```
compare yard · state default · base vs A, B, C, D
A = actor moves 0.6 along -u · B = crate2 moves 0.4 along u · C = tree moves 1.0 along u · D = crate2 moves 0.3 along v
metric                       base    A         B         C               D
failing checks               3       2         2         2               3
locks touched                0       0         0         1 ✗ (tree.pos)  0
hard relations violated      0       0         0         0               1 ✗
soft penalty                 0.72    0.72      0.72      1.42            0.72
clearance crate1×crate2 (u)  0.20 ✗  0.20 ✗    0.60      0.20 ✗          0.20 ✗
lane_reaches haul (y px)     1104 ✗  1104 ✗    1104 ✗    1104 ✗          1104 ✗
visible actor (% occluded)   40 ✗    0         40 ✗      0               40 ✗
objects moved / total (u)    -       1 / 0.60  1 / 0.40  1 / 1.00        1 / 0.30
```
