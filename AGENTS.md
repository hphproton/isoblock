# Builder instructions

You are the builder: a coding agent of any vendor, or a person. You implement exactly one roadmap stage per branch. The maintainer reviews your branch (`MAINTAINING.md`); only the repository owner merges into `main`.

These instructions hold whichever tool runs the session. Where your environment's own instructions say otherwise about commits, trailers, links, branches or GitHub, this file wins.

## Your environment

Check these before you start, and say in your log which you have:

- **git** with push access to a branch of your own. You never need write access to `main`, and you never open pull requests (below).
- **Node 20 or newer** and access to the npm registry (`npm ci`).
- **Chromium**, for the editor tests: set `ISOBLOCK_CHROMIUM` to the binary if it is not found by itself (`tests/helpers/browser.ts`). Without one, the editor tests are skipped: a skipped test is not a passed test, so report the number skipped.
- **Godot 4.7.1 and Xvfb**, for `npm run test:godot` (SPEC 13.8): download Godot from the GitHub release `4.7.1-stable`, check it against its `SHA512-SUMS.txt`, keep it outside the repository and set `GODOT`. Without them, say so in your log; the maintainer runs it at review.
- **Your git identity:** a no-reply email address for author and committer (SPEC section 20): one whose local part is `noreply` or `no-reply`, one at a no-reply domain such as GitHub's `users.noreply.github.com`, or `builder@noreply.invalid`. If `git config user.email` shows a personal address, set a no-reply one for this clone before your first commit.

## Start of session

1. Start from the latest `main`. Create your own branch named `builder/stage-<N>` (SPEC section 20); never work on `main`. If your environment created a branch with another name, rename it (`git branch -m builder/stage-<N>`) before your first push: names an environment generates can identify your session. Do not read other branches.
2. Read, in order: this file, `ROADMAP.md` (the stage marked **open**), `QUESTIONS.md`, then the `SPEC.md` sections that stage needs (always 0–9.1, 11, 16, 17, 20 and the appendices).
3. Read the newest file in `log/` if one exists.

## Rules

- **Build only the open stage.** Do not start features from later stages.
- **Do not edit** `SPEC.md`, `AGENTS.md`, `MAINTAINING.md`, `tests/golden/`, `tests/fixtures/`, `scripts/check-publish.mjs`, `tests/repo/checkPublish.test.ts`, `.github/`. If they look wrong or contradict each other, add an entry to `QUESTIONS.md` (question, spec section, the safest reading you chose), then continue with other work.
- **Tests first.** Every check has a test that loads its fixture and compares with `*.expected.json` within the tolerance in SPEC 9.1.
- **Stack:** Node ≥ 20, TypeScript strict, ESM; `vitest` for tests; `esbuild` for bundling. Runtime dependencies: `ajv`, plus any the spec approves for the open stage (`@resvg/resvg-wasm` from stage 5). Development dependencies: `typescript`, `vitest` (3.x while the minimum Node version is 20), `esbuild`, `@types/node`; from stage 2 also `playwright-core`, to drive an already installed Chromium in editor tests (no browser download). Godot is not an npm package (above). Ask in `QUESTIONS.md` before adding any other dependency.
- **Layout:** one package. `src/core/` is pure: no Node built-in modules, no `process`, no DOM. `src/cli/` handles files and arguments. `src/editor/` is the web page (DOM allowed, its own `tsconfig.json`). `scripts/` holds build and test scripts. `adapters/<engine>/` holds engine adapters (from stage 5, `adapters/godot/` in GDScript); they are not npm code and import nothing from `src/`. Plus `schema/`, `tests/`. `dist/` is build output and is not committed.
- **Clean code:** pure functions; immutable data; one file per check, at most 150 lines; no global state; coded errors.
- **Language:** everything you write to the repository is plain technical English: code, comments, CLI messages, test names, docs, logs, commit messages.
- **Neutral content:** never add names, scenes, measurements or criteria from any specific game or client project. New test data is synthetic.
- **Commits:** small, imperative subject line in English, for example `Add clearance check`. No URLs in commit messages. At most one `Co-Authored-By:` line, with the name of your agent or model and a no-reply address; every address in a message is a no-reply address.
- **No agent traces** (SPEC section 20): nothing you commit or push links to or names your session, task, run or chat: no session or task URLs, no `*-Session:` lines, no "generated with" footers that point to a session. Many environments add such lines to commit messages or descriptions by themselves; remove them before you push. Every commit you push is public and cannot be taken back.
- **Versions:** do not change `version` in `package.json`; the maintainer sets it in the release commit.

## Stop and ask the maintainer when

- An acceptance criterion cannot pass without changing a fixture or golden file.
- The scene file format would need to change beyond what the open stage specifies.
- A new dependency is needed.

Record the question in `QUESTIONS.md`, choose the safest reading, and note it in your session log.

## End of session (required, in order)

1. Run the full test suite from a clean state. Note the counts: passed, failed, skipped.
2. Tick in `ROADMAP.md` only the tasks you finished **and verified** in this session.
3. Update `CHANGELOG.md` under `Unreleased`.
4. Update `docs/AGENT_GUIDE.md` for every new or changed command.
5. Write `log/<yyyy-mm-dd>-builder-<n>.md`. Under its heading, start with a line `Agent: <tool and version>, model: <model>` for the tool and model that ran the session, then: what you did; test results (counts, including skipped tests and whether `npm run test:godot` ran); open questions; and either `branch ready for review` or what is still missing. End it with the pull request's title, `Stage <N>: <short summary>`, and its description, your log summary, for the owner to paste.
6. Commit, then run `npm run check:publish`. It must report nothing; if it does, rewrite the commits that are not pushed yet and run it again. If it finds something in a commit you already pushed, do not push again: say so in your log and to the owner; the maintainer decides how the branch is rewritten.
7. Push your branch. Do not open a pull request, issue or comment, even if your tool offers it: anything an agent writes on GitHub can carry a link to its session, and GitHub keeps every edit. The owner opens the pull request from your log. Do not merge, tag or open releases.
