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

1. Check out the branch. Run `npm ci`, `npm test`, `npm run build`. The run must show no skipped tests. If the environment cannot install packages, say so in the log; do not claim the tests passed.
2. For every `tests/fixtures/*.scene.json`, run `node dist/isoblock.mjs check --json <file>` and compare status, value, ids, pairs and occluders with the matching `*.expected.json` within the SPEC 9.1 tolerance. Check the exit code: 1 if any expected result is `fail` or `skip`, else 0. Use your own short script; do not reuse the builder's test code.
3. Run `node dist/isoblock.mjs describe tests/fixtures/yard.scene.json` and compare with SPEC Appendix B.
4. Run `node dist/isoblock.mjs render tests/fixtures/yard.scene.json -o yard.svg`, convert it to an image and look at it: draw order around the tree, both lanes, the crates.
5. Run `validate` on a broken file (for example `{"schema":"x"}`); it must exit 2.
6. Core purity (no Node built-in modules, no `process`, no DOM): list every module specifier in `src/core` with `grep -rhoE "(from|import\\(|require\\() *['\"][^'\"]+['\"]" src/core | sort -u`; each must be relative (`./`, `../`) or an approved package (`ajv`). `grep -rnwE "process|document|window" src/core` prints nothing. Each file in `src/core/checks/` has at most 150 lines.
7. Content rules (SPEC section 20): no non-English text, no project-specific names, scenes or measurements. Scan for non-ASCII characters and review each hit; the symbols used by `describe` output (`·`, `×`, `≈`) are expected.
8. `ROADMAP.md` ticks match what the log reports and what you verified. New questions in `QUESTIONS.md` have answers or a decision to defer.
9. From stage 2, open `dist/editor.html` in Chromium with your own script: save twice (identical bytes, same data as opened); drag a locked object (no move) and a `pos.u` lock (v only); after a few drags, compare the check panel with `check --json` on the saved file; measure the frame interval on the phone profile of SPEC section 17.

Write the result in `log/<yyyy-mm-dd>-maintainer-<n>.md`: steps run, outcomes, decision.

## Release

1. On the reviewed builder branch, make one release commit: set `version` in `package.json` (stage N → `0.N.0`); rename `Unreleased` in `CHANGELOG.md` to that version; mark the stage done in `ROADMAP.md` and open the next one with the fixtures and expected results it needs (SPEC section 17). When those are not ready, leave the next stage closed and open it later from a maintainer branch; add your review log. Push the branch.
2. Comment on the builder's pull request: the review result and a squash commit message without session links. Use a comment, not a formal approval.
3. Tell the owner the pull request is ready. The owner squash-merges it. Do not merge or push to `main` yourself.
4. After the merge, check that the new commit on `main` carries the owner's identity, and write the outcome in your next log.

The squash commit on `main` is the release, identified by `version` and commit hash. No tags are required.

## Start the next builder session

Give the builder this prompt, unchanged:

`Role: builder. Follow AGENTS.md and build only the stage open in ROADMAP.md.`

Do not give builders material from any specific game or client project.

## Before making the repository public

- Choose a license and add `LICENSE`.
- Confirm the whole history, commit messages included, follows the content rules in SPEC section 20. If it does not, publish a new repository from a clean snapshot instead of the existing history. Commits up to release 0.1.0 contain session links, so a clean snapshot is expected.
