import type { Enemy, GameState, Point, StacksEncounterState } from "../../types.ts";
import { burstParticles, spawnEnemy } from "../combat.ts";
import { MAX_ENEMIES, PLAYER_RADIUS } from "../config.ts";
import { damagePlayer } from "../damage.ts";
import { clamp } from "../geometry.ts";
import { nextRandom } from "../random.ts";
import { getCurrentEncounter } from "../selectors.ts";

export const CAPTURE_PULSE_RADIUS = 140;
export const SWEEP_GAP_WIDTH = 160;
const CACHE_ROUTE = [
  [0.65, 0.6],
  [0.72, 0.3],
  [0.25, 0.28],
  [0.3, 0.72],
  [0.75, 0.7],
  [0.5, 0.22],
  [0.22, 0.55],
  [0.78, 0.45],
  [0.5, 0.78],
  [0.5, 0.4],
];
const SWEEP_TIMES = [42, 49, 56, 62];
const TERMINAL_TIMES = [12, 29, 46];

export function createStacksEncounterState(): StacksEncounterState {
  return {
    completionFor: -1,
    nextCache: null,
    pulse: null,
    notice: "",
    noticeFor: 0,
    wave: -1,
    sweepIndex: 0,
    sweep: null,
    terminalIndex: 0,
    terminal: null,
    terminalsRecovered: 0,
  };
}

export function setStacksNotice(state: GameState, text: string, duration = 2.5) {
  state.stacks.notice = text;
  state.stacks.noticeFor = duration;
}

export function catalogCachePosition(state: GameState, index: number): Point {
  const [x, y] = CACHE_ROUTE[index % CACHE_ROUTE.length];
  const marginX = Math.min(64, state.width * 0.15);
  const marginY = Math.min(90, state.height * 0.18);
  return {
    x: marginX + x * Math.max(0, state.width - marginX * 2),
    y: marginY + y * Math.max(0, state.height - marginY * 2),
  };
}

export function captureCatalogCache(state: GameState, cache: Point) {
  state.stacks.pulse = { ...cache, life: 0.55 };
  state.player.dashCooldown = 0;
  // A capture buys breathing room without bypassing enemy health or deletion rewards.
  for (const enemy of state.enemies) {
    const dx = enemy.x - cache.x;
    const dy = enemy.y - cache.y;
    const distance = Math.hypot(dx, dy);
    if (enemy.kind === "boss" || distance > CAPTURE_PULSE_RADIUS) continue;
    const angle = distance > 0 ? Math.atan2(dy, dx) : enemy.id * 2.4;
    enemy.x = clamp(enemy.x + Math.cos(angle) * 100, enemy.radius, state.width - enemy.radius);
    enemy.y = clamp(enemy.y + Math.sin(angle) * 100, enemy.radius, state.height - enemy.radius);
    enemy.dashFor = 0;
  }
  for (const projectile of state.projectiles) {
    if (
      !projectile.friendly &&
      Math.hypot(projectile.x - cache.x, projectile.y - cache.y) < CAPTURE_PULSE_RADIUS
    ) {
      projectile.life = 0;
    }
  }
  for (const hazard of state.hazards) {
    if (Math.hypot(hazard.x - cache.x, hazard.y - cache.y) < CAPTURE_PULSE_RADIUS) hazard.life = 0;
  }
  const captured = state.objectiveProgress;
  if (captured === 5 || captured === 9) {
    setStacksNotice(
      state,
      captured === 5
        ? "CHECKSUM INSTABILITY · INTERCEPTORS INCOMING"
        : "FINAL CACHE · RESTORE THE CATALOG",
      3,
    );
    for (let index = 0; index < 3 && state.enemies.length < MAX_ENEMIES; index++) {
      const enemy = spawnEnemy(
        state,
        index === 0 ? "malicious" : "buffering",
        () => nextRandom(state),
        1,
        false,
      );
      // Interceptors enter from the perimeter; never materialize on the player.
      state.enemies.push(enemy);
    }
  } else {
    setStacksNotice(
      state,
      captured === 10
        ? "CATALOG RESTORED"
        : `CACHE SECURED · CHAIN ×${state.relayStreak} · DASH READY`,
      1.6,
    );
  }
}

/** Keep reinforcement directions readable during the second survival wave. */
export function positionRetentionReinforcement(state: GameState, enemy: Enemy) {
  if (getCurrentEncounter(state)?.id !== "retention-window" || state.objectiveProgress < 20) return;
  const side = Math.floor(state.objectiveProgress / 4) % 2;
  enemy.x = side === 0 ? -enemy.radius : state.width + enemy.radius;
  enemy.y = state.height * (0.25 + nextRandom(state) * 0.5);
}

export function updateStacksEncounter(state: GameState, dt: number) {
  if (state.phase !== "encounter") return;
  const encounter = getCurrentEncounter(state);
  if (encounter?.id !== "catalog-lock" && encounter?.id !== "retention-window") return;
  const stacks = state.stacks;
  stacks.noticeFor = Math.max(0, stacks.noticeFor - dt);
  if (stacks.pulse) {
    stacks.pulse.life -= dt;
    if (stacks.pulse.life <= 0) stacks.pulse = null;
  }
  if (stacks.completionFor >= 0) return;
  if (encounter.id !== "retention-window") return;
  const progress = state.objectiveProgress;
  const remaining = state.objectiveTarget - progress;
  const wave = remaining <= 10 ? 3 : progress >= 42 ? 2 : progress >= 20 ? 1 : 0;
  if (wave !== stacks.wave) {
    stacks.wave = wave;
    setStacksNotice(
      state,
      [
        "RETENTION PURGE · 1/3 · HOLD THE LINE",
        "RETENTION PURGE · 2/3 · SIDE CHANNELS OPEN",
        "RETENTION PURGE · 3/3 · SWEEP PROTOCOL",
        "PURGE COMPLETING · FIND THE SWEEP GAP",
      ][wave],
      3,
    );
  }
  if (
    !stacks.sweep && stacks.sweepIndex < SWEEP_TIMES.length &&
    progress >= SWEEP_TIMES[stacks.sweepIndex]
  ) {
    const vertical = stacks.sweepIndex % 2 === 1;
    const span = vertical ? state.height : state.width;
    stacks.sweep = {
      vertical,
      position: -16,
      gap: clamp(
        vertical ? state.player.y : state.player.x,
        Math.min(100, span / 2),
        Math.max(span / 2, span - 100),
      ),
      warningFor: state.mode === "hard" ? 1.1 : 1.5,
    };
    stacks.sweepIndex++;
  }
  const sweep = stacks.sweep;
  if (sweep) {
    if (sweep.warningFor > 0) {
      sweep.warningFor = Math.max(0, sweep.warningFor - dt);
    } else {
      const length = sweep.vertical ? state.width : state.height;
      const before = sweep.position;
      sweep.position += (length + 32) / 4.5 * dt;
      const along = sweep.vertical ? state.player.x : state.player.y;
      const across = sweep.vertical ? state.player.y : state.player.x;
      if (
        state.player.invulnerableFor <= 0 && along >= before - PLAYER_RADIUS - 10 &&
        along <= sweep.position + PLAYER_RADIUS + 10 &&
        Math.abs(across - sweep.gap) > SWEEP_GAP_WIDTH / 2 - PLAYER_RADIUS
      ) {
        damagePlayer(state, 1, "The retention sweep caught the archive.");
        if (state.player.health <= 0) return;
      }
      if (sweep.position > length + 16) stacks.sweep = null;
    }
  }
  if (
    !stacks.terminal && stacks.terminalIndex < TERMINAL_TIMES.length &&
    progress >= TERMINAL_TIMES[stacks.terminalIndex] && remaining > 10
  ) {
    const index = stacks.terminalIndex++;
    stacks.terminal = {
      x: state.width * (index % 2 === 0 ? 0.25 : 0.75),
      y: state.height * (index === 1 ? 0.65 : 0.4),
      life: 9,
      charge: 0,
    };
    setStacksNotice(state, "OPTIONAL TERMINAL · HOLD TO CUT 4s", 2);
  }
  const terminal = stacks.terminal;
  if (terminal) {
    terminal.life -= dt;
    const inRange = Math.hypot(state.player.x - terminal.x, state.player.y - terminal.y) < 34;
    terminal.charge = inRange ? terminal.charge + dt : Math.max(0, terminal.charge - dt * 2);
    if (terminal.charge >= 0.65 && remaining > 10) {
      state.objectiveProgress = Math.min(state.objectiveTarget - 10, state.objectiveProgress + 4);
      stacks.terminalsRecovered++;
      state.score += 100;
      burstParticles(state, terminal.x, terminal.y, "#68d3b5", 20);
      setStacksNotice(state, "TERMINAL FLUSHED · 4s SAVED", 2);
      stacks.terminal = null;
    } else if (terminal.life <= 0 || remaining <= 10) stacks.terminal = null;
  }
}
