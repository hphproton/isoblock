# 2026-10-07 · maintainer · session 6

Opening of stage 4 (relations, solver, minimal conflict set) from branch `maintainer/stage-4-open`.

## Previous merge

Pull request #5 was squash-merged by the owner as `8645aa0` (release 0.3.0). Author: the owner (GitHub no-reply address). Committer: `GitHub <noreply@github.com>`, verified web-flow signature. The tree equals the reviewed commit `3b622d6`. The commit message has no session links.

## Spec

- SPEC 7 now measures every relation: screen-x and ground-depth separation for the directional relations, band violations for `gap` and `against`, distances to objects, lanes and strip edges, zones for `inside`, lane offset and position for `on_lane`, `clear_of` with overlap, `aligned`, `order_along`. `facing` stays `skip`. It also defines status, soft penalty, the result shape and the new command `isoblock relations`.
- SPEC 8 is now a contract: movable objects and lock axes, view and overlap constraints, the 0.05 grid, the objective order, determinism, `solved` or `conflict` with deletion filtering in file order, the report, `-o` and `--patch` outputs, exit codes and the performance measurement. The algorithm is a guide.
- SPEC 11: `relations` and the new `solve` flags; exit codes for both. `compare` does not get relation rows (not scheduled), so its fixture stays valid.
- SPEC 12: `solve` is not a patch command; `isoblock solve --patch` writes a patch that `patch` applies with lock checks and the log.
- SPEC 17: stage 4 criteria and the fixture formats.

## Fixtures

- `tests/fixtures/relations/`: 7 objects, 2 zones, 3 lanes, 2 strips, 22 relations covering every `rel` and target kind: 10 satisfied, 9 violated, 3 skipped (`facing`, `clear_of` to a 3-point lane, `left_of` to a zone).
- `tests/fixtures/solver/`: `feasible` (2 locked and 6 movable objects, 6 hard and 5 soft relations, scrambled start), `only` (the solved `feasible` layout with 3 objects displaced; `--only d,e`), `conflict` (a cycle of three hard `left_of` plus two satisfiable hard relations; expected set `k1`, `k2`, `k4`), `perf` (50 objects in 5 rows, 5 locked, 94 relations, 6 displaced).
- Expected solver results are bounds, not positions: `status`, the exact conflict set, the soft-penalty and distance bounds, and the objects that must not move.

## Verification

- The reference implementation (branch `maintainer/reference`, new `reference/isorel.py`) measures the relations and solves all four scenes: `feasible` solved with soft penalty 0 (distance 16.9), `only` solved with soft penalty 2.7 (the displaced object outside `--only` keeps its soft violation), `conflict` gives `k1`, `k2`, `k4`, `perf` solved with soft penalty 0 (distance 10.8; about 14 s in Python).
- The current validator accepts all five new scenes.
- Clean `npm ci`, typecheck and `npm test` on this branch: typecheck clean, 687 of 687 tests pass, 0 skipped. The new fixtures are in subdirectories that no current test reads.
