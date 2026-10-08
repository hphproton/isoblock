# IsoBlock

IsoBlock keeps the layout of a 2D isometric scene as data. People and AI agents edit one scene file; IsoBlock checks it against the scene's rules, renders it, and exports one approved layout to the game engine, to image generation and to graybox gameplay.

Made by [Forty-Two Twice](https://10101042.xyz), an independent game studio. Status: pre-release, version 0.8.0. Scene format `isoblock/1`. Breaking changes and upgrade steps are listed in [`CHANGELOG.md`](CHANGELOG.md).

## Why

- Layouts written in prose hide conflicts, and generated images hide them further.
- AI agents that write coordinates directly tend to overflow the frame and overlap objects. They are good at stating relations ("the bench is in front of the tree, 1 to 1.5 units away"); a solver should compute the coordinates.
- Engines keep positions in their own scene formats, so layouts are hard to compare or move between engines.

IsoBlock makes the scene file the single source of truth, checks it with exact rules, and gives agents a compact text view and small patches, so cheap models can take part at a low token cost.

## Features

- **Scene file** in world units: types with parts, objects, strips, zones, lanes, relations, checks, states, per-property locks and recorded assumptions. The camera sets the projection: true isometric, 2:1 pixel art, or any pair of axis angles.
- **Checks**: `in_region`, `no_overlap`, `clearance`, `lane_clear`, `lane_reaches`, `visible` (occlusion), `reachable`, `capacity`, `min_screen_size` and `sort_consistency`. Each result states pass or fail, the measured value, the threshold and the objects involved.
- **For agents**: `describe` prints a short text summary; `patch` applies short commands or JSON Patch and rejects changes to locked properties; `diff` and `compare` report changes and variants by measured values.
- **Relations and solver**: `relations` measures every relation; `solve` places objects from them and, when they cannot all hold, reports a minimal set of conflicting hard relations.
- **Render**: SVG and PNG, with no native dependencies.
- **Export**: a runtime file (`isoblock-runtime/2`) for engines, and bounding boxes for image generation (`gen-bbox`).
- **Godot 4 adapter** ([`adapters/godot/`](adapters/godot/)): builds a node tree from the runtime file, draws sprites in the tool's draw order, switches states, and places the game's moving actors.
- **Editor** (`dist/editor.html`): one offline page with dragging on isometric and top-down views, locks, undo and a live check panel.

## Quick start

Requires Node 20 or newer.

```
npm ci
npm run build
node dist/isoblock.mjs check tests/fixtures/yard.scene.json
```

The sample scene `yard` contains three deliberate mistakes: two crates closer than allowed, a lane that leaves the frame through the bottom edge instead of the right edge, and a figure hidden behind a tree. `check` reports them and exits with code 1.

`npm run build` writes two files: `dist/isoblock.mjs`, the command line tool (no runtime dependencies beyond Node), and `dist/editor.html`, the editor. Open the editor by double-clicking it; it needs no server and makes no network request.

## Commands

```
isoblock validate  <scene.json>
isoblock check     <scene.json> [--json] [--state NAME]
isoblock render    <scene.json> [--state NAME] -o <out.svg|out.png>
isoblock describe  <scene.json>
isoblock relations <scene.json> [--json]
isoblock solve     <scene.json> [--only a,b] [-o <proposal.json>] [--patch <moves.patch>] [--json]
isoblock patch     <scene.json> <patch> [-o <out.json>] [--dry-run] [--json]
isoblock diff      <a.json> <b.json> [--json]
isoblock compare   <scene.json> --variant NAME=FILE... [--state NAME] [--format text|md|json]
isoblock export    <scene.json> --target runtime|gen-bbox [-o <out.json>]
                   [--bbox-units px|norm1000] [--bbox-order xyxy|yxyx] [--state NAME]
```

Run the tool as `node dist/isoblock.mjs`. Exit codes: `0` success; `1` a check failed or was skipped (`relations`: a hard relation is not satisfied; `solve`: also a conflict); `2` invalid input or usage; `3` a patch touches a lock; `70` internal error. Details and examples: [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md).

## Godot

Copy `adapters/godot/isoblock_runtime.gd` into your project (here to `res://isoblock/`) and export the runtime file of an approved scene:

```
node dist/isoblock.mjs export tests/fixtures/yard.scene.json --target runtime -o game/data/scenes/yard.json
```

```gdscript
extends Node2D

const Runtime := preload("res://isoblock/isoblock_runtime.gd")

func _ready() -> void:
	var loaded := Runtime.load_file("res://data/scenes/yard.json")
	if loaded["code"] != "":
		return
	var built := Runtime.build(loaded["data"])
	if built["code"] == "":
		add_child(built["root"])
```

The adapter targets Godot 4.7. Its API (states, actors, per-type scenes) is described in [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md#godot-adapter).

## Documentation

| File | Contents |
|---|---|
| [`SPEC.md`](SPEC.md) | The specification: scene format, projection, checks, solver, exports, engine integration |
| [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md) | How to use every command, read the results and drive the editor |
| [`ROADMAP.md`](ROADMAP.md) | Stages, acceptance criteria and what is not scheduled |
| [`CHANGELOG.md`](CHANGELOG.md) | Changes per version, with upgrade steps |

## How it is built

IsoBlock is written by AI agents in defined roles, one stage per branch:

1. The maintainer writes the specification and the expected test results first ([`MAINTAINING.md`](MAINTAINING.md)).
2. A builder agent implements the stage on its own branch, test first ([`AGENTS.md`](AGENTS.md)).
3. The maintainer reviews the branch by behavior against the expected results and prepares the release commit.
4. The repository owner merges the pull request into `main`.

Session logs are in [`log/`](log/). Questions on the specification and their answers are in [`QUESTIONS.md`](QUESTIONS.md). IsoBlock was developed in a private repository and published here with its history; the pull request numbers #1 to #17 in commit messages and logs refer to that repository, not to this one.

## Tests

```
npm test             # unit, fixture and end-to-end tests
npm run typecheck    # TypeScript checks
npm run test:godot   # Godot adapter cross-checks; needs Godot 4.7.1 (GODOT=<binary>) and Xvfb or a display
```

## Contributing

Open an issue first to discuss a change. Pull requests follow the rules of [`AGENTS.md`](AGENTS.md) that apply to them: one topic per branch, tests with the change, plain technical English, and no names or data from a specific project.

## License

[MIT](LICENSE), © 2026 Forty-Two Twice. The built files in `dist/` include third-party code under the MIT, BSD-3-Clause and MPL-2.0 licenses: see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
