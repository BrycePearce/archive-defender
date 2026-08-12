# Game architecture

The game is organized around a pure, mutable simulation state with React acting as the host.

## Runtime boundaries

- `engine.ts` is the stable public facade and frame orchestrator. Keep exported API compatibility
  here.
- `engine/systems/` contains reusable frame systems such as player control, spawning, and
  progression.
- `engine/encounters/` contains authored encounter mechanics. Encounter modules may depend on shared
  engine primitives, but must not import the `engine.ts` facade.
- `engine/combat.ts`, `powerups.ts`, `damage.ts`, and the smaller utility modules contain reusable
  state transformations.
- `rendering/` owns canvas drawing. Rendering reads `GameState` but never mutates simulation
  behavior.
- `components/` owns React presentation that does not need to control the animation loop.
- `hooks/` owns browser and React lifecycle concerns: the animation controller, persistence, pause
  state, and audio coordination. Keep frame-rate simulation data in refs instead of React state.
- `runtime/` contains pure snapshots and derived configuration shared by hooks and presentation.
- `tests/engine/` mirrors the runtime boundaries and shares deterministic fixtures through
  `support.ts`.

## Dependency direction

`types/content → engine primitives → systems/encounters → engine facade → hooks → React host`

Avoid importing back toward the right side of that chain. When two systems need the same behavior,
move it into a smaller shared engine module instead of introducing module-level configuration or
importing the facade.

## Adding gameplay

- Put a new authored boss or miniboss in `engine/encounters/`.
- Put broadly reusable mechanics in `engine/systems/` or a focused primitive module.
- Add encounter-specific canvas work beside `rendering/backlog.ts`; keep `renderArcade.ts`
  responsible for composition.
- Add tests to the matching file under `tests/engine/`.
