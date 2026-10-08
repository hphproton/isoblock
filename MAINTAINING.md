# Maintainer instructions

The maintainer owns the spec and the expected test results, answers builder questions, reviews builder branches and prepares releases. Only the repository owner writes to `main` (SPEC section 20). Builders follow `AGENTS.md`.

## Owned paths

Only the maintainer edits `SPEC.md`, `AGENTS.md`, `MAINTAINING.md`, `tests/golden/`, `tests/fixtures/`, the stage headers in `ROADMAP.md`, and `version` in `package.json`. The maintainer changes them on its own branch (`maintainer/<topic>`) or in a release commit on a builder branch; they reach `main` only through the owner's squash-merge.

## Initialize the repository (once)

1. The repository owner creates an empty repository and makes the first commit from the starter kit on their own machine.
2. Start the first builder session (see below).

## Start of session

Read `ROADMAP.md`, `QUESTIONS.md` and the newest files in `log/`.

## Answer questions

- Work on a maintainer branch. Write the answer under the question in `QUESTIONS.md`.
- If the answer changes behavior, update `SPEC.md` in the same commit.
- If expected results change, recompute them with an implementation independent of the builder's code, and commit the updated `tests/fixtures/*.expected.json` or `tests/golden/` files with the spec change.
- Push the branch, open a pull request against `main`, and put a squash commit message in its description.

## Review a builder branch

Review by behavior. Read code only when a step below fails.

1. Check out the branch. Run `npm ci`, `npm test`, `npm run build`. The run must show no skipped tests. If the environment cannot install packages, say so in the log; do not claim the tests passed. The frame-time tests of stage 2 depend on the load of the host: when one fails, run that file alone three times on the branch and on `main` in the same container, and call it a regression only when the branch fails more often.
2. For every `tests/fixtures/*.scene.json`, run `node dist/isoblock.mjs check --json <file>` and compare status, value, ids, pairs and occluders with the matching `*.expected.json` within the SPEC 9.1 tolerance. Check the exit code: 1 if any expected result is `fail` or `skip`, else 0. Use your own short script; do not reuse the builder's test code.
3. Run `node dist/isoblock.mjs describe tests/fixtures/yard.scene.json` and compare with SPEC Appendix B.
4. Run `node dist/isoblock.mjs render tests/fixtures/yard.scene.json -o yard.svg`, convert it to an image and look at it: draw order around the tree, both lanes, the crates.
5. Run `validate` on a broken file (for example `{"schema":"x"}`); it must exit 2.
6. Core purity (no Node built-in modules, no `process`, no DOM): list every module specifier in `src/core` with `grep -rhoE "(from|import\\(|require\\() *['\"][^'\"]+['\"]" src/core | sort -u`; each must be relative (`./`, `../`) or an approved package (`ajv`). `@resvg/resvg-wasm` (stage 5) belongs in `src/cli`, not in `src/core`. `grep -rnwE "process|document|window" src/core` prints nothing. Each file in `src/core/checks/` has at most 150 lines.
7. Content rules (SPEC section 20): no non-English text, no project-specific names, scenes or measurements. Scan for non-ASCII characters and review each hit; the symbols used by `describe` output (`·`, `×`, `≈`) are expected.
8. `ROADMAP.md` ticks match what the log reports and what you verified. New questions in `QUESTIONS.md` have answers or a decision to defer.
9. From stage 2, open `dist/editor.html` in Chromium with your own script: save twice (identical bytes, same data as opened); drag a locked object (no move) and a `pos.u` lock (v only); after a few drags, compare the check panel with `check --json` on the saved file; measure the frame interval on the phone profile of SPEC section 17.
10. From stage 3, with your own script: run `patch --json` on a copy of the base scene for every file in `tests/fixtures/patches/` and compare exit code, status, error code, locks, diff, check changes and `failing` with its expected file; check that a rejected patch leaves the scene unchanged and that the log gains one line; run `compare` on `yard` with the three variants in all three formats and compare with the expected files.
11. From stage 4, with your own script: run `relations --json` on the relation fixture and compare with its expected file; run `solve --json -o` (and `--only` when given) on every solver fixture twice; check `status`, `conflict`, the constraints of SPEC section 8 on the proposal (view, overlap, grid, `unchanged`), soft penalty and distance bounds, byte-identical runs, and recompute the relation results of the proposal with the reference implementation; apply the `--patch` output with `patch` and check that it gives the same positions; time `perf`.

12. From stage 5, with your own script: for every case in `tests/fixtures/export/cases.json`, run `export --target runtime` and `export --target gen-bbox` with each flag set twice, compare with the expected files (key order, numbers within the tolerances) and check byte-identical runs; run `render -o out.png` for each case with a `png` and compare the pixels; copy `dist/isoblock.mjs` alone into an empty directory and render a PNG there; check that the part order of the runtime file equals the order of the faces in the SVG of `render`; run `npm run test:godot` with your own Godot 4.7.1 download, then measure the adapter's PNGs against the SVGs with your own script (SPEC section 13.6).

13. From stage 6, with your own script: run `check --json` on `tests/fixtures/gameplay/walk.scene.json` and on every case of `tests/fixtures/states/cases.json` with its `--state`, and compare with the expected files; run `export --target gen-bbox --state`, `render --state -o out.png` and `compare --state` for the cases that list them; run random scenes with zones, anchors and states through `check --json` and compare `reachable`, `capacity` and `min_screen_size` with the reference implementation; check that an unknown state and `--state` with `export --target runtime` exit 2.

14. From stage 7, with your own script: run `check --json` (with `--state` where given) and `compare` for every case of `tests/fixtures/sort/cases.json`, and `export --target runtime` twice for every case of `tests/fixtures/runtime/cases.json`, and compare with the expected files; run random scenes (rotations, overhanging parts, long and thin footprints, zones, states, cameras other than true isometric) through `check --json` and `export --target runtime`, and compare `sort_consistency` and the sprites with the reference implementation; draw the sprites of a few runtime files in key order with your own Godot driver and compare with the SVG (SPEC section 13.6), where scenes without mismatches show no more differing pixels than the part order does.

15. From stage 8, with your own script and your own Godot driver: for every case of `tests/fixtures/godot/cases.json`, build the adapter's tree, apply the states in order, add and move the actor, and measure each frame against the SVG (SPEC section 13.6, polygons clipped to the frame); repeat the actor cases with the actor always on top and with actors before scene sprites on equal keys, and the instanced case without clipping, and check that those frames fail; drag an object of `walk` and of `court` in the editor on the phone profile at 4x and compare the check panel after the drop with `check --json`.

Write the result in `log/<yyyy-mm-dd>-maintainer-<n>.md`: steps run, outcomes, decision.

## Release

1. On the reviewed builder branch, make one release commit: set `version` in `package.json` (stage N → `0.N.0`); rename `Unreleased` in `CHANGELOG.md` to that version; mark the stage done in `ROADMAP.md` and open the next one with the fixtures and expected results it needs (SPEC section 17). When those are not ready, leave the next stage closed and open it later from a maintainer branch; add your review log. Push the branch.
2. Comment on the builder's pull request: the review result and a squash commit message without session links. Use a comment, not a formal approval.
3. Tell the owner the pull request is ready. The owner squash-merges it. Do not merge or push to `main` yourself.
4. After the merge, check that the new commit on `main` carries the owner's identity, and write the outcome in your next log.

The squash commit on `main` is the release, identified by `version` and commit hash. No tags are required.

## Reference implementation

The maintainer computes expected results with its own implementation, kept on branch `maintainer/reference` and never merged. Recompute with it whenever a check, patch, `compare` or export definition changes.

## Start the next builder session

Give the builder this prompt, unchanged:

`Role: builder. Follow AGENTS.md and build only the stage open in ROADMAP.md, including its end-of-session steps: push your branch and open its pull request.`

The words after the colon are the owner's request for the pull request; some agent environments wait for such a request before they open one.

Do not give builders material from any specific game or client project.

## Before making the repository public

- `LICENSE` (MIT) is on `main`.
- Confirm the whole history, commit messages included, follows the content rules in SPEC section 20. If it does not, publish a new repository from a clean snapshot instead of the existing history. Commits up to release 0.1.0 contain session links, so a clean snapshot is expected.
- A public repository also shows every branch, the commits of every pull request (GitHub keeps them under `refs/pull/` after a branch is deleted) and the earlier versions of edited pull request descriptions and comments. Check them with the same rules.

## Before distributing a build

`THIRD_PARTY_NOTICES.md` lists the third-party code that `npm run build` bundles into `dist/`. Before a build is distributed in any form:

- The notices of the Rust crates inside the WebAssembly module of `@resvg/resvg-wasm` are complete, with their license texts.
- The build carries the notices: a builder task writes `THIRD_PARTY_NOTICES.md` next to the built files and a one-line header in each built file that points to it, and a test fails when the packages in the bundles differ from the list.
