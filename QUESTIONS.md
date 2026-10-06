# Questions

The builder records unclear points here. The maintainer answers under each question.

Template:

```
## Q-001 · <short title>
- Spec section: …
- Question: …
- Reading chosen for now: …
- Answer (maintainer): …
```

## Q-001 · Development dependencies
- Spec section: AGENTS.md (stack), SPEC 16
- Question: The stack names `typescript`, `vitest`, `esbuild` and `ajv`. Strict TypeScript for `src/cli` needs Node type declarations, so `@types/node` (types only, no code) is also a dev dependency. Is that approved?
- Reading chosen for now: Keep `@types/node` as a dev dependency, pinned to the Node 20 line to match the minimum Node version. The only runtime dependency is `ajv`. `vitest` is pinned to 3.x: it supports Node 20 (5.x needs Node 22.12 or newer), and with the npm 10.9.4 used here, 4.x fails to resolve (`Cannot read properties of null (reading 'edgesOut')`).
- Answer (maintainer): Approved. `@types/node` is a development dependency (types only) and `AGENTS.md` now lists it. Keep `vitest` on 3.x while the minimum Node version is 20; revisit when the minimum changes.

## Q-002 · Validation beyond the literal schema rules
- Spec section: 6
- Question: Section 6 says `validate` runs "schema and reference checks" but does not list every reference. Which rules should apply?
- Reading chosen for now: Schema errors are `E_SCHEMA`; the checks below are `E_REF`, except the camera rule.
  - Duplicate ids within regions, strips, objects, zones, lanes, relations, checks, and within the parts and the anchors of one type.
  - `objects[].type` exists in `types`.
  - Relation `a`, `b` and `ids` resolve (object id, `zone:<id>`, `lane:<id>`, `strip:<id>.v0` or `.v1`).
  - Parameters of implemented checks name existing regions, strips, lanes and objects. Checks the stage does not implement are not resolved (the `lane` fixture has a `reachable` check whose `from` names a lane).
  - `states.<name>.hide` names existing objects.
  - Every `assumptions[].path` is a JSON Pointer that resolves in the file.
  - Schema: lock entries are `pos`, `pos.u`, `pos.v`, `rot`, `type` or a JSON Pointer; a camera with `angleU` equal to `angleV` (modulo 180) is `E_SCHEMA` because the ground axes are parallel.
  - Sizes and lane widths must be 0 or more.
- Answer (maintainer): Approved as written. SPEC section 6 now lists these rules.

## Q-003 · `describe` layout details that Appendix B does not fix
- Spec section: 12, Appendix B
- Question: Which rules produce the example exactly, and what happens in cases the example does not show?
- Reading chosen for now:
  - Column gaps after the widest cell: 2 spaces for `id`, `type` and `rot`; 3 for `pos` and `size`. This reproduces Appendix B byte for byte.
  - `px/<unit name>` uses the scene's `units.name` (the example's unit is `u`).
  - The provisional mark `*` follows the single number it belongs to (`size/2` marks `h`, `objects/<i>/pos/<k>` marks that coordinate). The `(* = provisional value)` line appears only when a `*` is printed.
  - `size` shows the type's size before rotation; `rot` is a separate column.
  - Lists in check lines (ids, occluders, pairs) are joined with a comma and a space.
  - Without `meta`, the `v<version> <status>` part of the header is left out.
- Answer (maintainer): Approved as written. SPEC Appendix B now states these rules.

## Q-004 · Readings of SPEC 9.1 and 11 for cases the tables leave open
- Spec section: 9.1, 11
- Question: A few edge cases are not stated.
- Reading chosen for now:
  - `no_overlap` with `ids`: both objects of a pair must be in `ids`.
  - `lane_clear`: the widened rectangle is not extended past the two end points.
  - `visible`: "length > EPS" is the Euclidean length of the ray inside a part. A check passes when `value <= maxOccluded + EPS`. A lane with two identical points is an unsupported shape (`skip`).
  - `render` requires `-o` (no output to the terminal); output must end in `.svg`.
  - The SVG layout (colors, labels, draw order of parts) is not specified. Draw order is a pairwise occlusion sort of part boxes; ties and cycles fall back to depth.
- Answer (maintainer): Approved as written. SPEC 9.1 and 11 now state the rules for `no_overlap`, `lane_clear`, `visible`, two-point lanes and `render -o`. The SVG layout stays unspecified; `sort_consistency` (stage 6) will define draw order.
