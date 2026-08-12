<div align="center">
  <h1>Archive Defender</h1>
  <p>Reclaim your library. Defend every byte.</p>
  <h3><a href="https://brycepearce.github.io/archive-defender/">▶ Play Archive Defender</a></h3>
  <p><a href="https://www.npmjs.com/package/archive-defender">View the package on npm</a></p>
  <img src="docs/archive-defender.png" alt="Archive Defender gameplay" width="900" />
</div>

Archive Defender is a twin-stick arcade game about stale media, runaway duplicates, and hostile
sessions. It began as the hidden arcade inside
[Plex Librarian](https://github.com/BrycePearce/plex-librarian) and is also available as an
embeddable React package.

## React package

The default component opens on its title screen, starts audio only after player interaction, saves
to `archive-defender:save-v2`, and pauses when the window loses focus or the page is hidden.

```tsx
import { ArcadeGame } from "archive-defender";
import "archive-defender/style.css";

export function GamesPage() {
  return <ArcadeGame onExit={() => navigate("/")} />;
}
```

The package supports React 18.2 and React 19. Its stylesheet is self-contained and scoped beneath
`.arcade-page`; Tailwind CSS and DaisyUI are not required. Hosts can theme the game by setting
`--archive-color-content`, `--archive-color-surface`, `--archive-color-primary`, and
`--archive-color-error` on the component or an ancestor.

Hosts that launch the game from an existing user interaction can opt into an immediate session:

```tsx
<ArcadeGame
  startup="resume-or-new"
  audioStart="immediate"
  initialMode="normal"
  initialWeapon="blaster"
  persistence={{ key: "my-app:archive-defender" }}
  onVictory={(summary) => recordWin(summary.score)}
/>;
```

Available integration props include:

- `startup`: `"title"`, `"new-run"`, `"resume"`, or `"resume-or-new"`.
- `audioStart`: browser-safe `"interaction"` or host-initiated `"immediate"`.
- `initialMode`, `initialWeapon`, and `initialSettings`.
- `persistence`: `false` or an object with a custom `key` and/or `storage` implementation.
- `pauseOnBlur` and `pauseWhenHidden`.
- `onPhaseChange`, `onRunStart`, `onGameOver`, and `onVictory` lifecycle callbacks.
- `onExit`, `exitLabel`, and `className` host UI integration.

Browsers may still reject immediate playback unless mounting follows a user gesture. Hosts can use
the `archive-defender/launch` helpers to prime the opening track during that gesture.

## Controls

- `WASD` or arrow keys to move; mouse to aim and fire.
- `Shift` to dash, `Space` for Deep Scan, `R` to reload, and `Escape` to pause.
- Touch controls are available on touch-capable devices.

## Development

Archive Defender uses Deno 2, React, and Vite.

```bash
deno task verify
```

Install the repository's Git hooks once after cloning:

```bash
deno task hooks:install
```

Commits run formatting and lint checks. Pushes run the complete verification pipeline, including
type checks, tests, and both production builds. Hooks can still be bypassed with Git's `--no-verify`
escape hatch when deliberately needed.

## License

Source code is available under the [MIT License](LICENSE). Music and sound-effect credits are listed
in [`src/game/assets/README.md`](src/game/assets/README.md).
