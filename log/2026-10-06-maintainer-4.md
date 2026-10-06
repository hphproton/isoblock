# 2026-10-06 · maintainer · session 4

Opening of stage 3 (patches, log, `diff`, `compare`) from branch `maintainer/stage-3-open`.

## Previous merge

Pull request #3 was squash-merged by the owner as `fd63c17` (release 0.2.0). Author: the owner (GitHub no-reply address). Committer: `GitHub <noreply@github.com>`, verified web-flow signature. The tree equals the reviewed commit `fac8218`. The commit message has no session links.

## Spec

- SPEC 12 defines the patch file (JSON Patch or short commands with comments), the commands `move`, `rot`, `set`, `lock`, `relate` (and `solve` as a stage 4 usage error), atomic application, rounding, assumption values, touched-lock detection and labels, the order of outcomes, output, the `--json` report and the log.
- SPEC 11 adds `patch` flags, `diff --json`, and the error codes `E_PATCH` and `E_LOCK`. 11.1 defines the `compare` measures, labels and the `text`, `md` and `json` formats; layout indicators and `--render` are not scheduled. 11.2 defines `diff`.
- SPEC 17 states the stage 3 criteria and the patch fixture format. Appendix D is regenerated from the fixture: same numbers as before; `-u` in ASCII; distances with 2 decimals; column widths follow the rule in 11.1.

## Fixtures

- `tests/fixtures/patches/`: 20 patches (17 on `yard`, 3 on `crowd`) with expected results: 10 applied, 5 rejected for locks, 5 invalid (`E_PATCH` 3, one of them a failing JSON Patch `test`; `E_REF` 1; `E_USAGE` 1).
- `tests/fixtures/compare/`: variants A, B and C of `yard` and the expected JSON, text and Markdown output.

## Verification

- Expected results come from the maintainer's reference implementation (Python, branch `maintainer/reference`), written without reading the builder's code.
- The reference reproduces all 29 results of the five existing fixtures within tolerance.
- The reference applied 16 patches (lock checks aside). The stage 1 validator accepts every result except the one expected to fail with `E_REF`. On the other 15 results the reference and the current CLI (`check --json`) agree on all 120 check results.
- Clean `npm ci`, typecheck and `npm test` on this branch: typecheck clean, 457 of 457 tests pass, 0 skipped. The new fixtures are in subdirectories, so the stage 1 and 2 tests do not pick them up.
