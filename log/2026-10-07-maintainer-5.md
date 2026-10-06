# 2026-10-07 · maintainer · session 5

Review of pull request #5 (stage 3, branch `ccr-644e6fdd-ispyj2` at `0d1dbc7`) and release 0.3.0.

## Previous merge

Pull request #4 (stage 3 opening) was squash-merged by the owner as `c053924`. Author: the owner (GitHub no-reply address). Committer: `GitHub <noreply@github.com>`, verified web-flow signature. The tree equals the reviewed commit `f94dd61`. The commit message has no session links.

## Review (MAINTAINING.md)

| Step | Result |
|---|---|
| 1. Clean `npm ci`, typecheck, `npm test`, build | Typecheck clean. 49 test files, 687 tests, all pass, 0 skipped. `dist/isoblock.mjs` 359 kb, `dist/editor.html` 401 kb |
| 2. `check --json` on every fixture (own script) | 29 of 29 results match, exit codes match |
| 3. `describe yard` | Byte-identical to Appendix B |
| 4. `render` | Same SVG bytes as the build of `main` for all five fixtures |
| 5. `validate` on a broken file | Exit 2 |
| 6. Core purity | Only relative imports and `ajv`; no `process`, `document`, `window`; longest check file 83 lines |
| 7. Content rules | No project-specific names, no session links in files or commit messages; non-ASCII only notation symbols in Markdown |
| 8. Roadmap and questions | Stage 3 ticks match the work verified here; Q-012 to Q-015 answered |
| 9. Editor | `dist/editor.html` is byte-identical to the build of `main` (reviewed in session 3) |
| 10. Patches and `compare` (own script, built CLI) | All 20 patch fixtures give the expected exit code, status, error code, locks, diff, check changes and `failing`; rejected and invalid patches leave the scene unchanged; the log gains one line for applied and rejected patches and none for invalid ones, with the fields in order; `--dry-run` writes nothing; `-o` writes elsewhere and `seq` counts 1, 2; `diff --json` after two patches lists both changes; `compare` text and md equal the expected files byte for byte and json matches within tolerance |

Also checked: 60 random patches (`move`, `rot`, `lock`, `set` on `yard`, `crowd` and `overlap`) give the same exit code, status, locks, diff and check changes in the CLI and in the maintainer's reference implementation. A scene file works as a `compare` variant.

Not verified: Node 20, Windows.

Decision: accepted without changes to the builder's work.

## Release commit

- `version` 0.3.0; `CHANGELOG.md` section renamed; stage 3 closed.
- Q-012 to Q-015 answered; SPEC 11.1, 11.2 and 12 state the readings.
- SPEC 16: the size guide now says about 5,500 core lines after stage 6. The old guide (1,500-2,500) did not foresee patches and `compare`; `src/core` is 3,578 lines now.
- Stage 4 stays closed until the maintainer defines how each relation is measured and adds the solver fixtures.
