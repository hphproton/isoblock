# 2026-10-06 · maintainer · session 2

Review of pull request #2 (stage 1, branch `claude/vigilant-dijkstra-6pcezg` at `6f663d9`), release 0.1.0 and opening of stage 2.

## Previous merge

Pull request #1 was squash-merged by the owner as `4938aaa`. Author: the owner (GitHub no-reply address). Committer: `GitHub <noreply@github.com>`, signed with GitHub's web-flow key; GitHub reports it as verified. The tree equals the branch tip. Every author and committer address in the history is a no-reply address.

## Review (MAINTAINING.md)

| Step | Result |
|---|---|
| 1. `npm ci`, `npm run typecheck`, `npm test`, `npm run build` from a clean state | Pass. 20 test files, 202 tests. `dist/isoblock.mjs` 310 kb. Node 22.22.0, npm 10.9.4 |
| 2. `check --json` on every fixture against `*.expected.json` (own script) | 25 of 25 results match; exit code 1 for all four fixtures, as expected |
| 3. `describe` on `yard` | Byte-identical to SPEC Appendix B |
| 4. `render` of `yard`, converted to PNG and inspected | Canopy drawn over the actor's upper body; trunk under the canopy; bench in front of the tree; both crates, crate2 in front; `path` lane on the floor; `haul` leaves through the bottom edge |
| 5. `validate` on `{"schema":"x"}` | Exit 2, `E_SCHEMA`. Malformed JSON and a missing file also exit 2 (`E_JSON_PARSE`, `E_IO`) |
| 6. Core purity | Only relative imports and `ajv` in `src/core`; no `process`, `document`, `window`; longest check file 59 lines |
| 7. Content rules | No project-specific names. Non-ASCII only `·`, `…`, `°`, `×`, `≈` in Markdown files |
| 8. Roadmap and questions | All stage 1 tasks ticked and verified above. Q-001 to Q-004 answered |

Also checked: stage 1 usage errors exit 2 and name the stage (`--state`, `render -o *.png`, `solve`); no build output is tracked; the lock file resolves only from the npm registry; `npm audit --omit=dev` reports 0 vulnerabilities; the projection test reads every section of `tests/golden/projection.json`.

Not verified: Node 20 (only Node 22 is available here).

Decision: accepted.

## Release commit

- `version` 0.1.0; `CHANGELOG.md` section renamed to 0.1.0.
- Answers to Q-001 to Q-004. SPEC section 6 lists the reference rules; 9.1, 11 and Appendix B state the readings the builder chose.
- `AGENTS.md`: development dependencies listed; `playwright-core` approved from stage 2; no session links in commits, pull requests or comments (also SPEC section 20).
- Stage 1 closed, stage 2 opened with a task list. SPEC section 17 makes the stage 2 frame-time and save criteria measurable.
- New fixture `crowd` (200 objects, 20 locked, one provisional value). Expected results were computed by a separate script implementing SPEC 9.1; the builder's CLI gives the same 4 results.
- `tests/core/validate.test.ts`: the fixture-list test now requires the four stage 1 fixtures instead of exactly four files, so new fixtures do not break it. 205 tests pass.
