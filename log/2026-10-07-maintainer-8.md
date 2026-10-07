# 2026-10-07 · maintainer · session 8

Review of trial E1 (pull request #8, branch `trial/e1-godot` at `bdd1bc1`) and opening of stage 5 from branch `maintainer/stage-5-open`.

## Previous merge

Pull request #7 (stage 4, release 0.4.0) was squash-merged by the owner as `22d7be2`. Author: the owner (GitHub no-reply address). Committer: `GitHub <noreply@github.com>`, verified web-flow signature. The tree equals the reviewed commit `c97a5f8`. The commit message has no session links.

## Engine decision

The owner chose trial E1 (one builder session to test Godot 4.7 before deciding) and the reduced stage 5 ("A thin": runtime file, generation boxes, block image and one adapter; no generated `.tscn`). The rule agreed before the trial: if it passes, the engine is Godot 4.7 with GDScript. It passed, so the engine is Godot 4.7.

## Trial E1 review

Everything ran in the maintainer's session with its own Godot 4.7.1 download (checked against `SHA512-SUMS.txt`), its own export templates, Android SDK and scripts.

| Step | Builder | Maintainer rerun |
|---|---|---|
| Tests | 772 of 772 | 772 of 772, 0 skipped (one earlier full run right after a container start failed `editor: frame time` at 33.4 ms on 2 cores; the test passed 3 of 3 runs alone and in the next full run) |
| Golden vectors | 13, largest difference 0.00046 | the same |
| Render under Xvfb, twice | identical bytes | identical bytes, and identical to the builder's PNG from another container |
| Compare with the SVG | `actor` hidden by the canopy (5.2 px); each object alone within 0.48 px | the same |
| Light and normal map | identical bytes over two runs | the same bytes |
| Debug APK | 28,263,434 bytes, signature verifies | the same size, verifies (v2, v3), with JDK 21 and build-tools 35.0.1 |
| Web build | 38,292,738 bytes; `index.wasm` 37,900,721 (10,043,929 gzip) | the same sizes; screenshot 9 px from the Xvfb PNG |
| Edit loop | 2.24 to 2.28 s | 2.67 s |

Independent check (own script: each object's isolated PNG against its SVG polygon box clipped to the frame, and a painter's raster of the SVG colored with the loader's colors) on the loader's output for five scenes: `yard` 0.48 px / 2 pixels, `lane` 0.49 / 2, `overlap` 0.41 / 0, `visible` 0.21 / 0, `crowd` (200 objects) 0.49 / 17 of 1,000,000.

Decision: trial complete; not merged. The answers to its five open questions are in the review comment and in SPEC 13.4, 13.6 and 13.8.

## Spec

- SPEC 11: `export --target runtime|gen-bbox` with `-o`, `--bbox-units`, `--bbox-order`; targets `godot`, `phaser`, `tiled` not scheduled; `render -o out.png`.
- SPEC 13.2 and 13.3: one loading path (the runtime file); `instantiate` by type and states move to stage 6.
- SPEC 13.4: the exact painter's order of parts, with the camera direction rounded to 9 decimals and depth to 6, so that ties are exact in every implementation.
- SPEC 13.6: the 1 px measure, as answered in the trial: each object alone within 1 px; the whole frame within 100 pixels per 1,000,000 of a painter's raster of the SVG; identical bytes over two runs.
- SPEC 13.7: the runtime file `isoblock-runtime/1`. SPEC 13.8: the Godot adapter and `npm run test:godot`.
- SPEC 14: `gen-bbox` format and the block image (`@resvg/resvg-wasm`, no fonts). SPEC 16, 17, 18, 19 follow; open question 5 (runtime file complete or reduced) is answered by 13.7.
- AGENTS.md: `@resvg/resvg-wasm`, Godot 4.7.1 and Xvfb for `test:godot`, `adapters/` in the layout. MAINTAINING.md: review step 12. ROADMAP.md: stage 5 open.

## Fixtures

`tests/fixtures/export/`: `cases.json` with six cases (`yard`, `lane`, `overlap`, `visible`, `crowd`, and the new synthetic scene `garden`: rotations 0 to 270, parts, anchors, zones, a three-segment lane, one object cut by the frame edge and one outside the frame, status `approved`); a runtime file per case; nine `gen-bbox` files (all four flag combinations appear); block images for `yard` and `garden`.

## Verification

- The reference implementation (branch `maintainer/reference`, new `reference/isoexp.py`, `reference/make_stage5.py`) computes the runtime files and boxes. Its part boxes match every face polygon of the current SVG on eight scenes. Its part order equals the current SVG order on six of them; on `crowd` and `perf` the current core breaks depth ties by floating-point noise (its camera direction is 1.0000000000000002), which the rounding of SPEC 13.4 removes. The builder updates the core; `render` of those two scenes will change order only between parts with equal rounded depth.
- The block images: `@resvg/resvg-js` 2.6.2 and `@resvg/resvg-wasm` 2.6.2 give byte-identical PNGs for both scenes.
- Clean typecheck and `npm test` on this branch: 772 of 772 pass, 0 skipped. No current test reads `tests/fixtures/export/`.
