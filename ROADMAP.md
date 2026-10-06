# Roadmap

Acceptance criteria come from SPEC section 17. One stage is open at a time. The builder ticks tasks; the maintainer opens and closes stages.

## Stage 1 · open

- [ ] Project setup: TypeScript strict, ESM, vitest, esbuild, ajv
- [ ] JSON Schema `schema/isoblock-1.json` and `validate` (schema + references, SPEC section 6); every fixture validates
- [ ] Projection, inverse projection, camera direction; `tests/golden/projection.json` passes
- [ ] Object geometry: footprint, 90° rotation, parts
- [ ] `in_region`
- [ ] `no_overlap`
- [ ] `clearance`
- [ ] `lane_clear` (unsupported lane shapes return `skip`)
- [ ] `lane_reaches` (unsupported lane shapes and `top`/`bottom` edges return `skip`)
- [ ] `visible` (with `occluders`)
- [ ] Catalog checks not implemented in stage 1 return `skip`
- [ ] Display list and SVG output; `render`
- [ ] `describe` (SPEC Appendix B)
- [ ] `check` with text and `--json` output; exit codes (SPEC section 11)
- [ ] `dist/isoblock.mjs` builds and runs with `node`
- [ ] `docs/AGENT_GUIDE.md` covers the 4 commands
- [ ] Session log says `branch ready for review`

**Done when:** all tests pass; every `tests/fixtures/*.scene.json` matches its `*.expected.json` within tolerance; the SVG of `yard` opens and shows the expected layout.

## Stage 2 · not open
Editor (SPEC sections 10, 17).

## Stage 3 · not open
Patches, log, `diff`, `compare` (SPEC sections 11.1, 12, 17).

## Stage 4 · not open
Solver and minimal conflict set (SPEC sections 8, 17).

## Stage 5 · not open
Export targets `runtime`, `godot`, `gen-bbox`; Godot adapter; PNG render (SPEC sections 13, 14, 17).

## Stage 6 · not open
States, `sort_consistency`, `reachable`, `capacity` (SPEC sections 9, 13.4, 17).
