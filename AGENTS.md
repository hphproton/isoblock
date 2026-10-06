# Builder instructions

You are the builder. You implement exactly one roadmap stage per branch. The maintainer reviews your branch (`MAINTAINING.md`); only the repository owner merges into `main`.

## Start of session

1. Start from the latest `main`. Create your own branch; never work on `main`.
2. Read, in order: this file, `ROADMAP.md` (the stage marked **open**), `QUESTIONS.md`, then the `SPEC.md` sections that stage needs (always 0–9.1, 11, 16, 17, 20 and the appendices).
3. Read the newest file in `log/` if one exists.

## Rules

- **Build only the open stage.** Do not start features from later stages.
- **Do not edit** `SPEC.md`, `AGENTS.md`, `MAINTAINING.md`, `tests/golden/`, `tests/fixtures/`. If they look wrong or contradict each other, add an entry to `QUESTIONS.md` (question, spec section, the safest reading you chose), then continue with other work.
- **Tests first.** Every check has a test that loads its fixture and compares with `*.expected.json` within the tolerance in SPEC 9.1.
- **Stack:** Node ≥ 20, TypeScript strict, ESM; `vitest` for tests; `esbuild` for bundling. Runtime dependencies: `ajv`, plus any the spec approves for the open stage (`resvg-wasm` from stage 5). Development dependencies: `typescript`, `vitest` (3.x while the minimum Node version is 20), `esbuild`, `@types/node`; from stage 2 also `playwright-core`, to drive an already installed Chromium in editor tests (no browser download). Ask in `QUESTIONS.md` before adding any other dependency.
- **Layout:** one package. `src/core/` is pure: no Node built-in modules, no `process`, no DOM. `src/cli/` handles files and arguments. Plus `schema/`, `tests/`. `dist/` is build output and is not committed.
- **Clean code:** pure functions; immutable data; one file per check, at most 150 lines; no global state; coded errors.
- **Language:** everything you write to the repository is plain technical English: code, comments, CLI messages, test names, docs, logs, commit messages.
- **Neutral content:** never add names, scenes, measurements or criteria from any specific game or client project. New test data is synthetic.
- **Commits:** small, imperative subject line in English, for example `Add clearance check`.
- **No session links:** commit messages, pull request descriptions and comments never contain `Claude-Session` lines or other links to agent sessions or chats.
- **Versions:** do not change `version` in `package.json`; the maintainer sets it in the release commit.

## Stop and ask the maintainer when

- An acceptance criterion cannot pass without changing a fixture or golden file.
- The scene file format would need to change.
- A new dependency is needed.

Record the question in `QUESTIONS.md`, choose the safest reading, and note it in your session log.

## End of session (required, in order)

1. Run the full test suite from a clean state.
2. Tick in `ROADMAP.md` only the tasks you finished **and verified** in this session.
3. Update `CHANGELOG.md` under `Unreleased`.
4. Update `docs/AGENT_GUIDE.md` for every new or changed command.
5. Write `log/<yyyy-mm-dd>-builder-<n>.md`: what you did, test results (counts), open questions, and either `branch ready for review` or what is still missing.
6. Push your branch. If no pull request exists for it, open one against `main`, titled `Stage <N>: <short summary>`, with your session log summary as the description. Do not merge, tag or open releases.
