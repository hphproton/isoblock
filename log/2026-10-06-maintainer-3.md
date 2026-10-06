# 2026-10-06 · maintainer · session 3

Review of pull request #3 (stage 2, branch `claude/builder-stage-setup-60wev6` at `25dec47`) and release 0.2.0.

## Previous merge

Pull request #2 was squash-merged by the owner as `84b9153` (release 0.1.0). Author: the owner (GitHub no-reply address). Committer: `GitHub <noreply@github.com>`, verified web-flow signature. The tree equals the reviewed commit `9450df8`. The commit message has no session links.

## Review (MAINTAINING.md)

| Step | Result |
|---|---|
| 1. Clean `npm ci`, typecheck, `npm test`, build | Typecheck clean. `npm test`: 456 of 457 passed, 0 skipped; `tests/editor/panel.test.ts` "updates the fields while an object is dragged" failed, and failed 4 of 5 times alone. Build writes `dist/isoblock.mjs` and `dist/editor.html` (401 kb) |
| 2. `check --json` on every fixture (own script) | 29 of 29 results match, exit codes match |
| 3. `describe yard` | Byte-identical to Appendix B |
| 4. `render` | Same SVG bytes as the build of `main` for all five fixtures |
| 5. `validate` on a broken file | Exit 2 |
| 6. Core purity | Only relative imports and `ajv`; no `process`, `document`, `window`; `src/core` does not import the editor or the CLI; longest check file 83 lines |
| 7. Content rules | No project-specific names; non-ASCII only notation symbols in Markdown; no session links in files or commit messages |
| 8. Roadmap and questions | Stage 2 ticks match the work verified here; Q-005 to Q-011 answered |
| 9. Editor, own Playwright script on `crowd` | Save twice gives identical bytes and the same data as opened; `o010` (`pos` lock) does not move; `o020` (`pos.u` lock) moves along v only; a free drag snaps to 0.1; after four edits the check panel equals `check --json` on the saved file; undo restores the object and the check; no page errors; no network requests |

Frame interval on `crowd` at 4x CPU slowdown, one pointer move per animation frame from inside the page, 179 frames counted:

| Profile | p50 / p95 / max (ms) | Frames over 20 ms |
|---|---|---|
| Phone, 390x844 at pixel ratio 2, touch, one view (4 runs) | 16.7 / 16.7-16.8 / 16.8 | 0 |
| Desktop 1280x800, both views (9 runs) | 16.7 / 16.7-33.4 / 33.3-100 | 2 to 31 |

The phone profile meets the stage 2 criterion as SPEC section 17 now states it. The desktop profile with both views drops up to about 17 percent of frames at 4x; it is information, not a criterion.

## Fix made in review

The failing test found a real defect. When a drag ends, the store keeps the same scene object, so the property panel did not see a change and showed a value up to 100 ms old until its throttle timer fired. `src/editor/props.ts` now also treats the end of a drag as a change. After the fix the test passed 5 of 5 times alone, and a clean run passes 457 of 457 tests with 0 skipped; typecheck and build pass, and the fixture comparison still gives 29 of 29.

## Release commit

- `version` 0.2.0; `CHANGELOG.md` section renamed; stage 2 closed.
- Stage 3 stays closed: the patch syntax, the report format, the sample patches and the `compare` fixture are not ready. The maintainer opens it from a maintainer branch. `MAINTAINING.md` now allows this.
- Q-005 to Q-011 answered. SPEC sections 6, 10 and 17 state the readings; the stage 2 frame-time criterion is the frame interval on the phone profile.
- `AGENTS.md` layout lists `src/editor/` and `scripts/`. `MAINTAINING.md` review step 1 requires no skipped tests; new step 9 reviews the editor.

## Notes for later

- The page exposes a read-only test hook `window.isoblock` (scene, state, screen positions, redraw). Acceptable; keep it free of writes.
- Plan view strips end 8 units beyond the content at the time the view was fitted (builder log).
- Not verified: Node 20, real phones, Firefox, Safari, a GPU canvas, pen input.
- The description of pull request #3 ends with a footer that links to the builder session; the commits have none.
