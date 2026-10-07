# 2026-10-07 · maintainer · session 9

Review of pull request #10 (stage 5, branch `ccr-82e9995b-dsnnju` at `86212f0`) and release 0.5.0.

## Previous merge

Pull request #9 (stage 5 opening) was squash-merged by the owner as `28a612d`. Author: the owner (GitHub no-reply address). Committer: `GitHub <noreply@github.com>`, verified web-flow signature. The tree equals the reviewed commit `f7c84ae`. The commit message has no session links.

## Review (MAINTAINING.md)

| Step | Result |
|---|---|
| 1. Clean `npm ci`, typecheck, `npm test`, build | Typecheck clean. 63 test files, 911 tests, all pass, 0 skipped. `dist/isoblock.mjs` 3,726,651 bytes, `dist/editor.html` 401,570 bytes. The frame-time tests of stage 2 failed in the builder's container on this branch and on `main`; here both full runs passed, and run alone one of their four tests failed in 2 of 6 runs on this branch and in 2 of 4 runs on `main` (p95 33.3 ms, one dropped frame), so the failures come from the host, not from this branch |
| 2 to 5 | 29 of 29 fixture results match; `describe yard` equals Appendix B; a broken file exits 2. `render` gives the same SVG bytes as `main` for `yard`, `lane`, `overlap`, `visible`, `garden` and the relation scene; for `crowd` and `perf` the same lines in another order, the order of SPEC 13.4 (equal to the reference implementation on all eight scenes) |
| 6. Core purity | Only relative imports and `ajv`; no `process`, `document`, `window`; `@resvg/resvg-wasm` only in `src/cli`. `src/core` is 5,128 lines |
| 7. Content rules | No project-specific names or session links; non-ASCII only notation symbols in Markdown |
| 8. Roadmap and questions | Stage 5 ticks match the work verified here; Q-018 to Q-020 answered |
| 9. Editor (own script) | Saves, locks, snap, property panel, check panel against the CLI, undo, no page errors, no network requests: all pass. The desktop two-view frame interval at 4x (information only) is the same as `main` in this container |
| 10, 11 | All 20 patch fixtures, the log, `--dry-run`, `-o`, `diff`, `compare` in three formats; the relation fixture, 300 random relations against the reference, all four solver fixtures: no problems |
| 12. Export, block image, Godot (own scripts) | See below |

Step 12:

- Every case of `tests/fixtures/export/cases.json`: the runtime file and each `gen-bbox` flag set equal the expected files (key order, tolerances); two runs and stdout give identical bytes; the part order of the runtime file equals the face order of the SVG.
- 60 random scenes (four cameras including 2:1 and vertical scales 0.8 and 1.2, rotations, parts, anchors, objects cut by or outside the frame): runtime files and `gen-bbox` in pixels and `norm1000` agree with the reference implementation; 0 mismatches.
- Block images of `yard` and `garden`: byte-identical to the expected files. `dist/isoblock.mjs` copied alone into an empty directory writes the same `yard.png`.
- Usage errors: missing target, `godot`, `phaser`, `tiled`, unknown target, bbox flags with `runtime`, a bad flag value, `-o` naming the input: exit 2 with a message each.
- `npm run test:godot` with the maintainer's own Godot 4.7.1 (checked against `SHA512-SUMS.txt`): passes in 23 s; adapter tests 152 checks, 0 failed; the same numbers as the builder's log.
- Own driver and measure: a separate GDScript driver draws each case with the adapter's public functions (own colors, every object alone and the whole frame), and a separate script measures against the SVG with a half-open even-odd rule. Worst edge alone and differing frame pixels: `yard` 0.48 / 2, `lane` 0.49 / 2, `overlap` 0.41 / 0, `visible` 0.21 / 0, `crowd` 0.49 / 17, `garden` 0.50 / 2 (limits 1 px and 100). Objects outside the frame draw nothing.
- The adapter is 228 lines; it builds the tree of SPEC 13.8 and reports its error codes.

Not verified: Node 20, Windows, Godot on a GPU.

Decision: accepted without changes to the builder's work.

## Release commit

- `version` 0.5.0; `CHANGELOG.md` section renamed; stage 5 closed; stage 6 stays closed until its fixtures exist.
- Q-018 to Q-020 answered; SPEC 11, 13.6, 13.7, 13.8 and 14 state the readings; SPEC 16 size note.
- AGENTS.md: the Godot export templates are needed only when a stage exports builds.
- MAINTAINING.md step 1: how to judge a failing frame-time test.
