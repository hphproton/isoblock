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

## Q-005 · Which "frame time" does the stage 2 criterion measure?
- Spec section: 17 (stage 2), 10
- Question: "while dragging, the 95th-percentile frame time is at most 16.7 ms in headless Chromium with 4x CPU slowdown" can mean (a) the main-thread time of the editor's own animation frame callback (pointer input, check update, display list, canvas calls), (b) the time between animation frames, or (c) all main-thread time per frame, including the browser's own paint and commit. It also does not say on which device profile: a phone (one view, touch, 2x screen) or a desktop window with both views.
- Reading chosen for now: `tests/editor/frameTime.test.ts` asserts (a), p95 at most 16.7 ms, on four profiles: desktop with both views driven by mouse, phone driven by touch, and desktop and phone with the pointer driven from inside the page at the display rate (one move per animation frame). With input at the display rate it also asserts the median time between frames (b) at most 18.4 ms, and for the phone the p95 too. Every run prints work, interval and a split by phase, and the session log copies the numbers. The slowdown is `Emulation.setCPUThrottlingRate` with rate 4; the drag moves `o101` of `crowd` along small circles for 170 pointer moves, the first 20 are a warm-up and are not counted.
- Why more than (a): the browser's own paint and commit of the canvas is not in (a) and the slowdown multiplies it by 4. It grows with the number of canvas pixels, so a 2x phone screen dropped 9 to 15 percent of its frames. The editor therefore draws a view at pixel ratio 1 while a gesture moves things and repaints at full density when it ends, and it repaints only a rectangle around the moved object while a drag is going on (a full repaint when it ends). A clipped repaint differs from a full one by anti-aliasing noise on a few edge pixels, which the test allows.
- Answer (maintainer): Frame time means the interval between animation frames, measured on the phone profile: 390x844 CSS px at pixel ratio 2, touch, one view, one pointer move per animation frame, 4x CPU slowdown. The 95th-percentile interval must be at most 18.4 ms (1.1 display intervals). SPEC section 17 now says this. Work time and the desktop profiles stay in the test output and the log as information; they are not criteria, because 4x slowdown emulates a phone CPU, not a desktop one.

## Q-006 · Editing a number that has an assumption
- Spec section: 6, 10
- Question: The property panel edits numbers that can be provisional (`assumptions[]`). `describe` prints `assumptions[].value`. What happens to the entry when the number is edited?
- Reading chosen for now: The entry stays (the number is still provisional; only a person settles it) and its `value` follows the edited number, so the file never contradicts itself and `describe` stays true. `note`, `origin` and `owner` are not touched. The editor never adds or removes assumptions.
- Answer (maintainer): Approved as written. SPEC section 10 now states it.

## Q-007 · Locks that are JSON Pointers
- Spec section: 6
- Question: `locks` may hold a JSON Pointer. Relative to what, and what does it block?
- Reading chosen for now: A pointer is absolute in the scene file. The property panel offers one lock toggle for each number of a type's `size`, which writes `/types/<type>/size/<0|1|2>` into the `locks` of the selected object. An edit of a type's size is blocked when any object lists that pointer, and then it is blocked for every object of the type. Other pointers are kept as they are and shown only as locked entries.
- Answer (maintainer): Approved as written. SPEC section 6 now states that pointer locks are absolute and that a pointer into a type applies to every object of that type.

## Q-008 · Format of the saved scene file
- Spec section: 3 (principle 7), 17
- Question: "saving twice gives byte-identical files" and "a saved file parses to the same data" leave the text format open.
- Reading chosen for now: `JSON.stringify(scene, null, 2)` and one final newline. Keys keep the order they have in the opened file; keys added by an edit (for example `locks`) come last in their object; a `locks` list that becomes empty is removed. Numbers are written the JSON way, so `2.0` in an opened file is saved as `2` (the same number). `src/core/serialize.ts` is the one place that decides this.
- Answer (maintainer): Approved as written. SPEC section 10 now states the saved format.

## Q-009 · Plan view, grid snap and what a drag changes
- Spec section: 10
- Question: The plan view, the grid step and "keep h" are only named.
- Reading chosen for now: The plan view has u to the right and v downwards at 40 px per unit; it shows the same objects with their top faces, and frame regions as the ground parallelograms their pixel rectangles cover. The default grid step is 0.1 (choices: off, 0.05, 0.1, 0.25, 0.5, 1), applied to `pos`, the min-u, min-v corner. A drag changes `pos` only. "Keeping h" means the pointer is converted to the ground on the plane at the object's height, so the grabbed point stays under the pointer; the ground movement does not depend on that height, and `tests/core/drag.test.ts` checks it. The pointer must travel 3 px (mouse), 4 px (pen) or 8 px (touch) before a press on an object becomes a drag.
- Answer (maintainer): Approved as written. SPEC section 10 now states the plan view, the snap default and the drag threshold.

## Q-010 · Browser tests need an installed Chromium
- Spec section: AGENTS.md (stack), 17
- Question: The editor tests drive an installed Chromium with `playwright-core` (approved from stage 2, no download). What if no browser is installed?
- Reading chosen for now: `playwright-core` is pinned to `~1.56.1`, which matches Chromium revision 1194 installed in this environment. The tests look for `ISOBLOCK_CHROMIUM`, then `/opt/pw-browsers/chromium`, then Playwright's own path. If none exists the browser tests are skipped, not failed, and vitest prints how many were skipped. Should a missing browser fail the suite instead, so that a review cannot miss it?
- Answer (maintainer): Keep skipping when no Chromium is installed. The maintainer's review requires a run with no skipped tests (`MAINTAINING.md`, review step 1).

## Q-011 · Build script and test runner changes
- Spec section: 16, 20, AGENTS.md (layout)
- Question: Stage 2 needs a build step that inlines the editor into one file, and tests that must not rebuild `dist/` while another test file reads it. The layout in AGENTS.md names `src/core`, `src/cli`, `schema` and `tests`; SPEC 16 adds `src/editor`.
- Reading chosen for now: `npm run build` runs `scripts/build.mjs` (esbuild's API; one file of 39 lines) and writes `dist/isoblock.mjs` and `dist/editor.html`. The editor lives in `src/editor` with its own `tsconfig.json` that has the DOM types; the root `tsconfig.json` leaves it out so that `src/core` and `src/cli` cannot use DOM types by accident, and `npm run typecheck` runs both. `vitest` builds once in a global setup and runs test files one after another, because the frame-time test must not compete with other browsers.
- Answer (maintainer): Approved. `AGENTS.md` now lists `src/editor/` and `scripts/` in the layout.

## Q-012 · Patch syntax details that SPEC section 12 leaves open
- Spec section: 12
- Question: Which rules apply where the text of section 12 is silent?
- Reading chosen for now:
  - Parsing comes before applying: the whole file is parsed first (the first malformed line wins, in line order), then the commands run in order. A failing command names its line (`line 3: ...`).
  - Quotes: inside double quotes, `\"` is a quote and `\\` is a backslash; every other backslash stays as it is. Without this a JSON value that holds strings (`set /objects/0/tags "[\"a\"]"`) cannot be written.
  - `move`: each offset needs a sign (`u+1`, `v-0.5`); the axes may come in either order; at least one is required.
  - `rot` to the rotation the object already has changes nothing. When the footprint keeps its shape (0 and 180, 90 and 270) `pos` is left as it is, so no coordinate is rounded for nothing.
  - `set`: a pointer must start with `/`; the root is not allowed. `note=` adds the `note` key when the assumption has none.
  - `lock`: names are checked when the patch is parsed (`pos`, `pos.u`, `pos.v`, `rot`, `type` or a string starting with `/`), else `E_PATCH`. A pointer lock is not required to resolve. `pos.u` is appended even when `pos` is already listed.
  - `relate`: each option at most once; the key order is `id, a, rel, b, gap, axis, t, min, hard, weight, source`. The names `a` and `b` and the relation name are not checked by the command: an unknown target is `E_REF` and an unknown `rel` is `E_SCHEMA`, both after the patch applied (the order of outcomes in section 12).
  - JSON Patch: an operation on the whole scene (path `""`) is `E_PATCH`. `test` compares with deep equality (numbers by value, key order ignored).
  - A patch without any command (empty, or only comments) applies and changes nothing. A description that is only `#` counts as no description.
- Answer (maintainer): Approved as written. SPEC section 12 now states parsing before applying, the quote escapes, `rot` without a change of shape, and the empty patch.

## Q-013 · What `patch` prints and logs
- Spec section: 11, 12
- Question: Section 12 fixes the first line of the text report, the `--json` report and the fields of a log line. Not fixed: which stream carries which outcome, what the log holds for errors, how `seq` and the file name are chosen.
- Reading chosen for now:
  - The report (text or `--json`) goes to stdout for `applied`, `rejected` and `invalid`. Errors that stop the command before there is an outcome (unreadable or invalid scene file, unreadable patch file, bad flags) go to stderr as for every other command and print no report.
  - The text report is the status line, `error <code>: <message>`, one line per change, one line per changed check, `failing checks: <n>`; then `wrote <path>` or `dry run: nothing written`. The `message` of an `E_SCHEMA` or `E_REF` error carries its detail lines, joined with `; `.
  - A log line holds the fields of section 12 in that order; `error` has the shape of the report (`null` or `{ code, message }`). `seq` is the number of non-blank lines already in the log plus one. `patch` is the file name of the patch without its directory. For an output that does not end in `.json`, `.log.jsonl` is appended to the whole name.
  - `checks` in the report and in the log compare the checks of the original and of the result by id. A check that exists on one side only is not listed (it shows in `diff`).
- Answer (maintainer): Approved as written. SPEC section 12 now states the output streams, `seq` and the log name for outputs without `.json`.

## Q-014 · `diff` identity rules
- Spec section: 11.2
- Question: "An array whose items, in both scenes, are all objects with a string `id` is matched by `id`" does not say what happens with an empty list, repeated ids, or `assumptions` in other places.
- Reading chosen for now: Both lists must have items that are all objects with a string key (`id`, or `path` for the top-level `assumptions`), and the keys must be unique in each list; an empty list qualifies. Otherwise the array is one value. The summary line always says `<n> changes`, also for 1.
- Answer (maintainer): Approved as written. SPEC 11.2 now states that keys must be unique and that an empty list qualifies.

## Q-015 · `compare` details that section 11.1 leaves open
- Spec section: 11.1, Appendix D
- Question: A few cases are not stated.
- Reading chosen for now:
  - "Run the same checks": every column runs the checks of the base scene. A variant that changes `checks` (or a scene file with other checks) is compared under the base's checks; if a base check names an object the variant lacks, the variant gives an invalid scene (`E_REF`, exit 2).
  - A variant file is a scene when its first non-blank character is `{`, else a patch. A scene variant is validated like any scene file; its locks are compared with the base like a patch's.
  - Names: unique, not empty, and not `base`. `--variant NAME=FILE` splits at the first `=`.
  - The label of a check that is not implemented (always `skip`) is `<check> <id>`. A skipped cell reads `skip ✗`, and `none ✗` is a failed `lane_reaches` that finds no edge.
  - A row shows when its status is `fail` or `skip` in some column or a delta (rounded to 6 decimals) is not zero, or a value is `null` in one column and a number in another.
  - `moved` counts an object when its ground distance from the base position exceeds 1e-9. A `delta` that rounds to zero is written `0`, never `-0`.
  - `state` is `default` in the text and the JSON until stage 6.
  - In the `md` format a vertical bar inside a cell is written `\|`.
- Answer (maintainer): Approved as written. SPEC 11.1 now states that every column runs the base's checks, how a scene variant is recognised, the variant names, the null-versus-number row rule and the 1e-9 threshold for `moved`.
