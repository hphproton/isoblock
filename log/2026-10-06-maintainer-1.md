# 2026-10-06 · maintainer · session 1

First maintainer session. No code exists yet; stage 1 is open and no builder session has started.

## Done

- Read `MAINTAINING.md`, `AGENTS.md`, `ROADMAP.md`, `QUESTIONS.md`, and SPEC sections 17 and 20.
- Checked `main` at `6c446c9`:
  - One commit, `Add IsoBlock starter kit`.
  - 19 files, matching the starter kit.
  - Author and committer: the repository owner. GitHub reports the signature as verified.
- Content scan of `main` (SPEC section 20): no project-specific names. Non-ASCII characters are notation symbols only (`·`, `…`, `×`, `≈`, `°`, `−`, `∈`, `—`).
- Checked what this session can do (below).

## Session capabilities

Environment: maintainer session in a cloud chat, Node 22.22.0, npm 10.9.4.

| Action | Result |
|---|---|
| Attach the repository with push access | Works |
| Clone, fetch | Works |
| GitHub API read (repository, commit verification) | Works. `gh auth status` reports the token as invalid, but API calls succeed. |
| `main` branch protection | None |
| Push a branch | Works (`maintainer/session-1-check`) |
| Open a pull request | Works through the REST API (#1). `gh pr create` fails: GraphQL is not available here. The pull request shows the owner's account as author. |
| Comment on a pull request | Works through the REST API (#1); shown under the owner's account |
| npm registry (`npm install ajv@8`) | Works |
| SVG to PNG for review step 4 | ImageMagick has no SVG support here; `@resvg/resvg-js` from npm works |
| PyPI | Blocked (HTTP 403); not needed by the stack |
| Other web hosts (`example.com`, `raw.githubusercontent.com`) | Blocked |
| Push tags, delete branches | Not tested; not needed |

Review steps in `MAINTAINING.md` can run in this session, including `npm ci`.

## Open

- Stage 1 builder session: to be started by the owner.
- Squash-merge author: confirm at the first merge that the new commit on `main` carries the owner's identity.
