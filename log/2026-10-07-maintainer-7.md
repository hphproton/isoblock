# 2026-10-07 · maintainer · session 7

Review of pull request #7 (stage 4, branch `ccr-85d33b2b-j83trr` at `df264d8`) and release 0.4.0.

## Previous merge

Pull request #6 (stage 4 opening) was squash-merged by the owner as `c9a00c9`. Author: the owner (GitHub no-reply address). Committer: `GitHub <noreply@github.com>`, verified web-flow signature. The tree equals the reviewed commit `9129892`. The commit message has no session links.

## Review (MAINTAINING.md)

| Step | Result |
|---|---|
| 1. Clean `npm ci`, typecheck, `npm test`, build | Typecheck clean. 56 test files, 772 tests, all pass, 0 skipped. The builder's `perf` test: median 63 ms here |
| 2 to 5 | 29 of 29 fixture results match; `describe yard` equals Appendix B; `render` gives the same SVG bytes as `main`; a broken file exits 2 |
| 6. Core purity | Only relative imports and `ajv`; no `process`, `document`, `window`; no `Math.random` or clock in `src/core` |
| 7. Content rules | No project-specific names or session links; non-ASCII only notation symbols in Markdown |
| 8. Roadmap and questions | Stage 4 ticks match the work verified here; Q-016 and Q-017 answered |
| 9. Editor | `dist/editor.html` is byte-identical to the build of `main` |
| 10. Patches and `compare` | All 20 patch fixtures, the log, `--dry-run`, `-o`, `diff` and `compare` still give their expected results |
| 11. Relations and solver (own script, built CLI) | Relation fixture: 22 of 22 results match. 300 random relations on the fixture scene agree with the reference implementation (status, `ids`, violation within 1e-4; 155 skipped). Solver: all four fixtures give the expected status and conflict set; two runs are byte-identical; the input file is not written; on the solved proposals, recomputed with the reference, no hard relation is violated, every moved coordinate is on the grid, no moved footprint leaves the view or creates an overlap, the `unchanged` objects keep their positions, and only positions change; applying the `--patch` output with `patch` gives the same bytes as `-o` |

Solver results (soft penalty and distance against their bounds): `feasible` 0 / 0.5 and 15.75 / 33.75; `only` 2.70 / 3.2 and 3.00 / 6.00; `conflict` `k1`, `k2`, `k4`; `perf` 0 / 0.5 and 10.36 / 21.51. The whole CLI run takes 190 to 380 ms including Node start-up.

The reference implementation gave skipped `inside` and `on_lane` results fewer `ids` than the builder's reading in Q-016; the reference now follows that reading, and the fixture is unaffected.

Not verified: Node 20, Windows.

Decision: accepted without changes to the builder's work.

## Release commit

- `version` 0.4.0; `CHANGELOG.md` section renamed; stage 4 closed.
- Q-016 and Q-017 answered; SPEC 7 and 8 state the readings.
- SPEC 16: core size guide about 6,500 lines after stage 6; `src/core` is 4,866 lines now.
- Stage 5 stays closed: the owner decides the engine first, then the maintainer specifies the export formats and adds the fixtures.
