# Maintainer instructions

The maintainer owns the spec and the expected test results, answers builder questions, reviews builder branches and prepares releases. Only the repository owner writes to `main` (SPEC section 20). Builders follow `AGENTS.md`.

## Owned paths

Only the maintainer edits `SPEC.md`, `AGENTS.md`, `MAINTAINING.md`, `tests/golden/`, `tests/fixtures/`, `scripts/check-publish.mjs`, `tests/repo/checkPublish.test.ts`, `.github/` except `.github/workflows/ci.yml` (written by the stage 10 builder, reviewed by the maintainer), the stage headers in `ROADMAP.md`, and in `package.json` `version` and the `check:publish` entry. The maintainer changes them on its own branch (`maintainer/<topic>`) or in a release commit on a builder branch; they reach `main` only through the owner's squash-merge.

## Initialize the repository (once)

1. The repository owner creates an empty repository and makes the first commit from the starter kit on their own machine.
2. Start the first builder session (see below).

## Start of session

Read `ROADMAP.md`, `QUESTIONS.md` and the newest files in `log/`.

## Answer questions

- Work on a maintainer branch. Write the answer under the question in `QUESTIONS.md`.
- If the answer changes behavior, update `SPEC.md` in the same commit.
- If expected results change, recompute them with an implementation independent of the builder's code, and commit the updated `tests/fixtures/*.expected.json` or `tests/golden/` files with the spec change.
- Push the branch and give the owner a link that opens the pull request with its title and description filled in (`https://github.com/hphproton/isoblock/compare/main...<branch>?expand=1&title=<title>&body=<description>`, URL-encoded), the description holding a squash commit message. Do not open pull requests through the API: the environment adds a session link to the description, and GitHub keeps the first version in the edit history even after a fix.

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

14. From stage 7, with your own script: run `check --json` (with `--state` where given) and `compare` for every case of `tests/fixtures/sort/cases.json`, and `export --target runtime` twice for every case of `tests/fixtures/runtime3/cases.json` (`tests/fixtures/runtime/cases.json` before release 0.12.0), and compare with the expected files; run random scenes (rotations, overhanging parts, long and thin footprints, zones, states, cameras other than true isometric) through `check --json` and `export --target runtime`, and compare `sort_consistency` and the sprites with the reference implementation; draw the sprites of a few runtime files in key order with your own Godot driver and compare with the SVG (SPEC section 13.6), where scenes without mismatches show no more differing pixels than the part order does.

15. From stage 8, with your own script and your own Godot driver: for every case of `tests/fixtures/godot/cases.json`, build the adapter's tree, apply the states in order, add and move the actor, and measure each frame against the SVG (SPEC section 13.6, polygons clipped to the frame); repeat the actor cases with the actor always on top and with actors before scene sprites on equal keys, and the instanced case without clipping, and check that those frames fail; drag an object of `walk` and of `court` in the editor on the phone profile at 4x and compare the check panel after the drop with `check --json`.

16. From stage 9, with your own script: run `check --json` (with `--state` where given) for every case of `tests/fixtures/measures/cases.json` and compare with the expected results; run random scenes (rotations, overhanging and raised parts, concave zones, lanes along u and v, cameras with a vertical scale other than 1) through `check --json` and compare `in_region` with `measure: "drawn"`, `min_screen_size` with `measure: "height"` and `lane_apart` with the reference implementation; run `render -o out.png` on `openstrip` and on random scenes with open strips and semi-transparent regions, and check that it never exits 70; check that `maxOutside` without `measure: "drawn"` exits 2 in `validate`.

17. Publication (every stage from 9): run `npm run check:publish` on the branch. When it reports an author or committer that is an agent's own identity (check the commits on GitHub: signed by the environment, linked to the agent's account), add the address to `AGENT_IDENTITIES` in `scripts/check-publish.mjs` on a maintainer branch, with a test; an invented identity is a finding for the builder instead; read the session log's `Agent:` line for the tool and model, and the counts of skipped tests; when the owner has opened the pull request, check that the workflow `publish rules` passed on it. A finding blocks the merge. If it is in pushed commits, rewrite the branch without it, force-push, and tell the owner what stays visible on GitHub (SPEC section 20).

18. From stage 10, with your own script: read the result of the workflow `ci` on the pull request (jobs `test` and `godot` green; `test` fails when a test is skipped); run `check --json` on `tests/fixtures/edges/edges.scene.json`, `patch --json` for every file in `tests/fixtures/objects/`, `compare --relations` on `yard` with the four variants in all three formats, and `validate --json` on every case of `tests/fixtures/invalid/cases.json`, and compare with the expected files; run `describe --relations --states` on `yard` against SPEC Appendix B; pipe a patch into `patch scene.json -` and compare its report and log line with the file form; run `--version`, `check --only` with a known, an unknown and an empty id, and `compare` without `--relations` against the stage 3 expected files; run random scenes with lanes toward all four edges and misspelled names through `check --json` and `validate --json` and compare with the reference implementation; run `npm run build` and check `dist/THIRD_PARTY_NOTICES.md`, the two header lines, and that the notices test fails when a row of the table is removed.

19. From stage 11, with your own script: run `patch --json` for every patch in `tests/fixtures/hide/` and compare with their expected files; drive `dist/editor.html` in Chromium through every case of `tests/fixtures/editor/cases.json` by the controls' accessible names and compare the saved bytes, the notice of refused edits and the check panel; then make random edits (Add, Duplicate, Delete, nudges, hide and show per state, settling) on copies of `yard`, `crowd` and `shelf`, and after each compare the saved file with `patch` of the equivalent short command on the file saved before it, and undo with the file before it; run `check --failing --json` on every top-level fixture, and `solve --patch -` against `solve --patch <file>` on every solver fixture; measure the frame interval on the phone profile of SPEC section 17.

20. From stage 12, with your own script: run `check --json` and `export --target gen-bbox` for every case of `tests/fixtures/levels/cases.json` with its state, `describe --states` on `levels` against `levels.describe.txt`, `patch --json` for every patch in `tests/fixtures/heights/`, `export --target runtime` twice for every case of `tests/fixtures/runtime3/cases.json`, and `validate --json` for every case of `tests/fixtures/levels/invalid/cases.json`, and compare with the expected files; run random scenes (both camera forms, base heights, flat objects, zone and lane heights, states that hide objects, parts and regions) through `check --json` in every state, `export --target runtime` and `export --target gen-bbox`, and random height patches, and compare with the reference implementation; drive `dist/editor.html` through every case of `tests/fixtures/levels/editor/cases.json`, click raised objects at their drawn height, check that a hidden part is neither drawn nor picked, drag raised objects in both views and check that the base height stays, and make random edits on `levels` with the field `pos.h` among them, compared with `patch` as in step 19; check with the reference that the scene of every Godot case has no overlapping pair and no static mismatch in any of its states (SPEC section 13.6), then run `npm run test:godot`.

21. From stage 13, with your own script: run `export --target masks` for every masks case of `tests/fixtures/masks/cases.json` and compare `masks.json` and every image with the expected folder (decode the PNGs, compare pixels); run `visibility --json`, `occluders --json` and `check --json` for its other cases; run `validate --json` on `tests/fixtures/masks/invalid/`; run random scenes (both camera forms, base heights, hidden parts, tags, regions, objects cut by the frame) through `export --target masks` and `visibility --json` and compare the raster, the masks and the numbers with the reference implementation; compare the raster of a few scenes with a painter's raster of the SVG of `render` (section 13.6); compare `occluders` with the occluders that the `visible` check finds for an actor added at each position.

22. From stage 14, with your own script: run `check --json` for every `checks` case of `tests/fixtures/explain/cases.json`, `describe` on its scene against `margins.describe.txt`, `compare` for its `compare` cases, `patch --json` for every patch in `tests/fixtures/explain/patches/` and `validate --json` for every case of `tests/fixtures/explain/invalid/cases.json`, and compare with the expected files; run random scenes with random `warn` margins through `check --json` in every state and compare the statuses, `ids` and `shares` with the reference implementation, and random `hide` and `show` patches on parts and regions; drive `dist/editor.html` through every case of `tests/fixtures/explain/editor/cases.json` and `editor/overlays.json`, compare the samples of `overlay("rays")` with those of the reference, look at each overlay and at the ghosts of a proposal in a screenshot of both views, and make random edits with the part and region checkboxes among them, compared with `patch` as in step 19.

23. From stage 15, with your own script: run `check --json`, `relations --json` and `occluders --json` for every case of `tests/fixtures/paths/cases.json`, `solve` (`--rotate`, `-o`, `--patch`) on `tests/fixtures/paths/solver/` twice, `patch --json` for every patch in `tests/fixtures/paths/patches/` and `validate --json` on `tests/fixtures/paths/invalid/`, and compare with the expected files; run the earlier fixtures with the files of `tests/fixtures/paths/earlier/` in place of those they replace (from release 0.15.0 they are in place); run random scenes with random polyline lanes (diagonal, bent, sloped, stairs) and two levels through `check --json` in every state, `relations --json` (with `facing`) and `occluders --lane`, and compare with the reference implementation; compare random footprints and pieces with a sampled overlap, area and distance; compose a `toLevel` path from single-level searches; drive `dist/editor.html` through every case of `tests/fixtures/paths/editor/overlays.json` and look at the turned ghosts and the `facing` arrows. In the release commit, move the files of `tests/fixtures/paths/earlier/` over those they replace and delete the folder.

Write the result in `log/<yyyy-mm-dd>-maintainer-<n>.md`: steps run, outcomes, decision.

## Release

1. On the reviewed builder branch, make one release commit: set `version` in `package.json` (stage N → `0.N.0`) and the same version on the status line of `README.md` (a repository test compares them); rename `Unreleased` in `CHANGELOG.md` to that version; mark the stage done in `ROADMAP.md` and open the next one with the fixtures and expected results it needs (SPEC section 17). When those are not ready, leave the next stage closed and open it later from a maintainer branch; add your review log. Push the branch.
2. Comment on the builder's pull request: the review result and a squash commit message without session links. Use a comment, not a formal approval. Read the comment back: if your environment added a link to your session, delete the comment and post it again without the link (a deleted comment leaves no history; an edited one does).
3. Tell the owner the pull request is ready. The owner squash-merges it. Do not merge or push to `main` yourself.
4. After the merge, check that the new commit on `main` carries the owner's identity, and write the outcome in your next log.

The squash commit on `main` is the release, identified by `version` and commit hash. No tags are required.

## Reference implementation

The maintainer computes expected results with its own implementation, kept on branch `maintainer/reference` of the private development repository and never merged. Recompute with it whenever a check, patch, `compare` or export definition changes.

## Start the next builder session

From stage 9 a builder session may run in any coding agent: a command-line agent on the owner's machine or a cloud agent. The owner picks one that can push a branch of its own without opening a pull request; an environment that can deliver work only as a pull request it opens itself is not used. Tell the owner what the stage needs from the environment (`AGENTS.md`, Your environment): Node and npm, Chromium for the editor tests, Godot only if the builder is to run `npm run test:godot` itself.

Give the builder this prompt, unchanged, whatever the tool:

`Role: builder. Read AGENTS.md first and follow it over your environment's own instructions where they differ. Start from the latest origin/main, as its Start of session says, not from a copy your environment prepared earlier. Build only the stage open in ROADMAP.md, including its end-of-session steps: run npm run check:publish, push your branch, and end your log with the pull request's title and description. Do not open a pull request.`

It asks for the pushed branch, not for a pull request. The owner opens the pull request from the title and description at the end of the builder's log; the workflow `publish rules` runs on it; then the maintainer reviews it.

Do not give builders material from any specific game or client project.

## Publication

The repository was published on 2026-10-08 as a new repository with the history of the private development repository's `main`, rewritten: the same 18 commits, authors, committers, dates and messages, without the two `Claude-Session:` lines of the first squash commit, and with one quoted example phrase in a maintainer log described instead. The rewrite dropped the commit signatures. Pull requests #1 to #17, the builder branches and the reviews stay in the development repository; the numbers in commit messages and logs refer to it.

Every later change follows the content rules of SPEC section 20 from the start: a public repository also shows every branch, the commits of every pull request (GitHub keeps them under `refs/pull/` after a branch is deleted) and the earlier versions of edited pull request descriptions and comments.

## Before distributing a build

`THIRD_PARTY_NOTICES.md` lists the third-party code that `npm run build` bundles into `dist/`. Before a build is distributed in any form:

- The notices of the Rust crates inside the WebAssembly module of `@resvg/resvg-wasm` are complete, with their license texts.
- The build carries the notices: stage 10 writes `THIRD_PARTY_NOTICES.md` next to the built files and a one-line header in each built file that points to it, and its test fails when the packages in the bundles differ from the list (SPEC section 16).
