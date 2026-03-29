# @bunny-editor/svg-toolkit

Parse, serialize, scale, and work with SVG paths in TypeScript.

## What's in here

- **Path parser** — turns SVG path `d` strings into typed command objects with named properties (`cmd.x`, `cmd.rx`, `cmd.largeArc` etc.)
- **Serializer** — turns commands back into SVG strings
- **Scaler** — scales path coordinates while keeping arc flags and rotation untouched
- **Arc → Cubic** — converts arc segments to cubic Bezier curves
- **Path points** — resolves all shorthand commands (H, V, S, T, A) to absolute cubic/line points with bounding box calculation
- **Style resolver** — parses `<style>` blocks inside SVGs and resolves the cascade (specificity, selectors, combinators)

Never throws on bad input. Returns what it can parse + warnings for the rest.

## Install

```bash
npm install @bunny-editor/svg-toolkit
```

## Parsing paths

```ts
import { parsePath } from '@bunny-editor/svg-toolkit';

const commands = parsePath('M10 20 L30 40 A5 5 0 1 0 50 60 Z');

// Every command has named properties — no more values[0], values[1]
for (const cmd of commands) {
  if (cmd.type === 'M') console.log(cmd.x, cmd.y);
  if (cmd.type === 'A') console.log(cmd.rx, cmd.largeArc, cmd.sweep);
  if (cmd.type === 'C') console.log(cmd.x1, cmd.y1, cmd.x2, cmd.y2);
}
```

TypeScript narrows the type automatically when you check `cmd.type`.

## API

### `parsePath(d: string): TypedPathCommand[]`

Turns an SVG path string into a command array:

```ts
const cmds = parsePath('M10 20 C1 2 3 4 5 6');
cmds[0]; // { type: 'M', x: 10, y: 20, values: [10, 20] }
cmds[1]; // { type: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6, values: [...] }
```

### `parsePathDetailed(d: string): { commands, warnings }`

Same thing, but also tells you about any weirdness it encountered:

```ts
const { commands, warnings } = parsePathDetailed('M10 20 $ L30 40');
// commands: 2 valid commands parsed
// warnings: ["Unexpected character '$' at position 7"]
```

### `serializeCommands(commands): string`

Turns commands back into an SVG path string. Relative/absolute is preserved.

```ts
const cmds = parsePath('M10 20 l5 5');
serializeCommands(cmds); // "M10 20 l5 5"
```

### `scalePath(pathData, scale): string`

Scales coordinates in a path string. Knows to scale arc radii but leave flags and rotation alone.

```ts
scalePath('M10 20 A5 5 45 1 0 30 40', 2);
// "M20 40 A10 10 45 1 0 60 80"
```

## Command types

All commands have `type`, `relative`, and `values[]`. The `values` array is kept for backward compatibility — you probably want to use the named properties instead.

| Command | Type | Properties |
|---------|------|------------|
| MoveTo | `M` | `x`, `y` |
| LineTo | `L` | `x`, `y` |
| HLineTo | `H` | `x` |
| VLineTo | `V` | `y` |
| CurveTo | `C` | `x1`, `y1`, `x2`, `y2`, `x`, `y` |
| SmoothCurveTo | `S` | `x2`, `y2`, `x`, `y` |
| QuadCurveTo | `Q` | `x1`, `y1`, `x`, `y` |
| SmoothQuadCurveTo | `T` | `x`, `y` |
| Arc | `A` | `rx`, `ry`, `xAxisRotation`, `largeArc`, `sweep`, `x`, `y` |
| ClosePath | `Z` | — |

Arc's `largeArc` and `sweep` are booleans. Everything else is a number.

Since it's a TypeScript discriminated union, `switch`/`if` on `cmd.type` narrows automatically.

## Edge cases

SVG path syntax has a lot of quirks. These all parse correctly:

| Input | What happens |
|------|--------|
| `M10-5` | Negative sign starts a new number → x=10, y=-5 |
| `M10.5.3` | Second dot starts a new number → x=10.5, y=0.3 |
| `M1e-3,2.5E+4` | Scientific notation → x=0.001, y=25000 |
| `A25 26 0 0150-25` | Compressed arc flags → flags=0,1 x=50 y=-25 |
| `M10 10 20 20` | Extra params after M become L commands |
| `M10,,20` | Extra commas treated as whitespace |
| `M10 20 $ L30 40` | Garbage skipped, rest still parsed (with warning) |

## Other modules

**`geometry.ts`** — Converts SVG arcs to cubic Bezier curves. Useful if your rendering target doesn't support arcs natively (e.g. Canvas).

**`path-points.ts`** — Resolves all shorthand commands (H, V, S, T) and arcs into absolute cubic/line points. Also computes bounding boxes using cubic/quadratic extrema (not just endpoint min/max).

**`style-resolver.ts`** — Parses `<style>` blocks inside SVGs and resolves the cascade. Handles specificity, compound selectors, and combinators. Useful when you need to flatten styles for export.

## License

MIT
