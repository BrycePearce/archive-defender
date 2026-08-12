import { ACTS, DIFFICULTIES } from "../../content.ts";
import { burstParticles, showBossDialogue, spawnEnemy } from "../combat.ts";
import { damagePlayer } from "../damage.ts";
import { choosePowerupKind, spawnPowerupDrop } from "../powerups.ts";
import { nextRandom } from "../random.ts";
import type { ArcadeInput, BacklogBomb, BacklogTile, Enemy, GameState } from "../../types.ts";
import {
  BACKLOG_BOMB_INTERCEPT_PADDING,
  BACKLOG_BOMB_SPEED,
  BACKLOG_BOSS_HITS,
  BACKLOG_FIREWALL_GAP_WIDTH,
  BACKLOG_FIREWALL_SPEED,
  BACKLOG_GOLD_BLAST_RADIUS,
  BACKLOG_GOLD_FUSE,
  BACKLOG_INTRO_ACTIVE_STAGE,
  BACKLOG_MAZE_BANNERS,
  BACKLOG_MAZE_MOVING_WALLS,
  BACKLOG_MAZE_RED_WALLS,
  BACKLOG_MAZE_WALL_COUNT,
  BACKLOG_MAZE_WALL_INTERVAL,
  BACKLOG_MOVING_FIREWALL_GAP_WIDTH,
  BACKLOG_RED_WALL_WARNING,
  BACKLOG_RETURN_SPEED,
  BACKLOG_SCAN_BANNERS,
  BACKLOG_SCAN_DIRECTIONS,
  BACKLOG_SCAN_INTERVAL,
  BACKLOG_SECOND_HIT_PAUSE,
  BACKLOG_SECOND_WIPE_WARNING,
  BASE_PLAYER_SPEED,
  MAX_PARTICLES,
  MAX_PROJECTILES,
  PLAYER_RADIUS,
} from "../config.ts";
import { clamp, segmentHitsBacklogTile, sweptMovingCirclesIntersect } from "../geometry.ts";

export function updateBacklogEncounter(
  state: GameState,
  dt: number,
  input: ArcadeInput,
  random: () => number,
) {
  if (state.phase !== "boss" || ACTS[state.actIndex].boss.kind !== "backlog") return;
  const boss = state.enemies.find(
    (enemy) => enemy.kind === "boss" && enemy.bossKind === "backlog" && enemy.health > 0,
  );
  const quotes = ACTS[state.actIndex].boss.breakoutQuotes;
  if (!boss || !quotes) return;

  for (const tile of state.backlogTiles) {
    tile.entranceFor = Math.max(0, tile.entranceFor - dt);
    const shift = state.backlogHits > 0 && state.backlogIntermissionStage === 0
      ? Math.sin(state.elapsed * (0.9 + state.backlogHits * 0.18)) *
        (14 + state.backlogHits * 5)
      : 0;
    tile.x = tile.anchorX + shift;
  }

  if (state.backlogIntroStage < BACKLOG_INTRO_ACTIVE_STAGE) {
    const advancePressed = input.firing || input.secondary;
    const advance = advancePressed && !state.backlogDialogueAdvanceHeld;
    state.backlogDialogueAdvanceHeld = advancePressed;
    if (!advance) return;
    if (state.backlogIntroStage < 4) {
      state.backlogIntroStage += 1;
      const text = quotes.intro[state.backlogIntroStage - 1];
      showBossDialogue(
        state,
        text,
        boss.x,
        boss.y,
        3600,
        state.backlogIntroStage === 4 ? "danger" : "normal",
      );
      if (state.backlogIntroStage === 4) {
        state.bossImpactCues += 1;
        state.screenShake = Math.max(state.screenShake, 0.55);
      }
      return;
    }
    state.backlogIntroStage = BACKLOG_INTRO_ACTIVE_STAGE;
    state.backlogFightStarts += 1;
    state.backlogBombCooldown = 1.15;
    state.backlogRedBombCooldown = 2.7;
    state.banner = "BREAK THE BACKLOG";
    showBossDialogue(state, quotes.start, boss.x, boss.y, 3.1);
    return;
  }

  if (state.backlogIntermissionStage > 0) {
    state.backlogIntermissionFor = Math.max(0, state.backlogIntermissionFor - dt);
    state.backlogFirewallWarningFor = Math.max(0, state.backlogFirewallWarningFor - dt);
    if (state.backlogIntermissionStage === 2 && state.backlogHits === 2) {
      updateBacklogGapMaze(state, dt);
    }
    if (state.backlogIntermissionStage === 2 && state.backlogHits === 3) {
      updateBacklogDeepCleanCycle(state, dt);
    }
    if (state.backlogIntermissionFor > 0) return;
    if (state.backlogIntermissionStage === 4) {
      beginBacklogFirewall(state);
      return;
    }
    if (state.backlogIntermissionStage === 1) {
      const horizontalSpeed = BACKLOG_FIREWALL_SPEED * (1 + state.backlogHits * 0.06);
      state.backlogTiles = [];
      if (state.backlogHits === 2) {
        const gapSpeed = horizontalSpeed * 1.08;
        state.bossDialogue = null;
        state.backlogMazeWallIndex = 0;
        state.backlogMazeNextWallFor = BACKLOG_MAZE_WALL_INTERVAL;
        spawnBacklogMazeWall(state, state.backlogFirewallGaps[0], gapSpeed);
        state.backlogMazeWallIndex = 1;
        state.backlogIntermissionStage = 2;
        state.backlogIntermissionFor = (state.backlogFirewallGaps.length - 1) *
            BACKLOG_MAZE_WALL_INTERVAL +
          (state.height + 100) / gapSpeed;
        return;
      }
      if (state.backlogHits === 3) {
        state.bossDialogue = null;
        state.backlogScanStep = 0;
        state.backlogScanNextFor = BACKLOG_SCAN_INTERVAL;
        spawnBacklogScan(state, state.backlogScanStep);
        state.backlogScanStep = 1;
        state.backlogFirewallDirection = BACKLOG_SCAN_DIRECTIONS[state.backlogScanStep];
        state.backlogIntermissionStage = 2;
        state.backlogIntermissionFor = (BACKLOG_SCAN_DIRECTIONS.length - 1) *
            BACKLOG_SCAN_INTERVAL +
          (Math.max(state.width, state.height) + 150) / BACKLOG_FIREWALL_SPEED;
        return;
      }
      const layers = state.backlogHits >= 3 ? 2 : 1;
      const verticalSpeed = BACKLOG_FIREWALL_SPEED * (1.28 + state.backlogHits * 0.05);
      spawnBacklogFirewall(state, 0, layers, horizontalSpeed);
      spawnBacklogFirewall(state, 1, layers, verticalSpeed);
      state.backlogIntermissionStage = 2;
      state.backlogIntermissionFor = Math.max(
        (state.height + 150) / horizontalSpeed,
        (state.width + 150) / verticalSpeed,
      );
      return;
    }
    if (state.backlogIntermissionStage === 2) {
      if (state.backlogRebuildAfterWall) {
        state.backlogTargetColumn = backlogTargetColumnForRound(state.backlogHits);
        state.backlogTiles = createBacklogTiles(state, state.backlogHits, false);
        state.player.y = Math.max(state.player.y, backlogPlayerBoundary(state));
      }
      state.backlogIntermissionStage = 0;
      state.backlogRebuildAfterWall = false;
      state.backlogBombCooldown = 1.15;
      state.backlogRedBombCooldown = 1.5;
      state.banner = "BREAK THE BACKLOG";
      return;
    }
    if (state.backlogIntermissionStage === 3) {
      boss.health = 0;
      state.backlogIntermissionStage = 0;
      burstParticles(state, boss.x, boss.y, "#f3a65a", 42);
      state.screenShake = 1;
    }
    return;
  }

  updateBacklogBomb(state, boss, dt, random);
}

export function createBacklogTiles(
  state: GameState,
  round: number,
  entrance: boolean,
): BacklogTile[] {
  const columns = 9;
  const rows = 4;
  const gap = 4;
  const margin = 18;
  const width = (state.width - margin * 2 - gap * (columns - 1)) / columns;
  const height = 21;
  const top = Math.max(102, state.height * 0.31);
  const targetColumn = backlogTargetColumnForRound(round);
  const tiles: BacklogTile[] = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      if ((row === 0 || row === rows - 1) && (column === 0 || column === columns - 1)) {
        continue;
      }
      const special = row === 1 && column === (round + 1) % columns
        ? "cache"
        : row === 0 && column === (round + 5) % columns
        ? "duplicate"
        : undefined;
      const collector = !special && (column + row * 3 + round) % 7 === 0;
      const signature = (row * columns + column + round * 4) % 24;
      const drop = special
        ? undefined
        : signature === 2
        ? "enemy"
        : signature === 7
        ? "powerup"
        : signature === 14
        ? "repair"
        : signature === 21
        ? "bomb"
        : undefined;
      const maxHealth = column === targetColumn
        ? 3
        : collector || special || (row + column + round) % 5 === 0
        ? 2
        : 1;
      tiles.push({
        id: round * 100 + row * columns + column + 1,
        x: margin + width / 2 + column * (width + gap),
        anchorX: margin + width / 2 + column * (width + gap),
        y: top + row * (height + gap) + Math.abs(column - 4) * 1.8,
        width,
        height,
        health: maxHealth,
        maxHealth,
        row,
        column,
        collector,
        special,
        drop,
        entranceFor: entrance ? 4.1 + row * 0.24 + column * 0.07 : 0.4 + row * 0.08,
      });
    }
  }
  return tiles;
}

export function backlogPlayerBoundary(state: GameState) {
  const authoredWallBottom = Math.max(102, state.height * 0.31) + 3 * (21 + 4) + 3 * 1.8 +
    21 / 2;
  const livingWallBottom = state.backlogTiles.reduce(
    (bottom, tile) => Math.max(bottom, tile.y + tile.height / 2),
    authoredWallBottom,
  );
  return Math.min(state.height - PLAYER_RADIUS, livingWallBottom + PLAYER_RADIUS + 7);
}

export function backlogTargetColumnForRound(round: number) {
  return [4, 6, 2, 5][Math.min(round, 3)];
}

function backlogColumnCenter(state: GameState, column: number) {
  const columns = 9;
  const gap = 4;
  const margin = 18;
  const width = (state.width - margin * 2 - gap * (columns - 1)) / columns;
  return margin + width / 2 + column * (width + gap);
}

export function backlogTargetCenter(state: GameState) {
  const targetTiles = state.backlogTiles.filter((tile) =>
    tile.column === state.backlogTargetColumn
  );
  if (targetTiles.length === 0) {
    return backlogColumnCenter(state, state.backlogTargetColumn);
  }
  return targetTiles.reduce((sum, tile) => sum + tile.x, 0) / targetTiles.length;
}

function landBacklogHit(state: GameState, boss: Enemy) {
  const quotes = ACTS[state.actIndex].boss.breakoutQuotes;
  recallBacklogBombs(state, boss);
  state.backlogHits += 1;
  state.objectiveProgress = state.backlogHits;
  state.bossPhaseChanges += 1;
  state.screenShake = 1;
  burstParticles(state, boss.x, boss.y, "#f8d477", 32);

  if (state.backlogHits >= BACKLOG_BOSS_HITS) {
    state.score += boss.points;
    state.kills += 1;
    state.backlogIntermissionStage = 3;
    state.backlogIntermissionFor = 2.6;
    state.banner = "BACKLOG CLEARED";
    if (quotes) showBossDialogue(state, quotes.defeat, boss.x, boss.y, 2.6);
    return;
  }

  boss.health = BACKLOG_BOSS_HITS - state.backlogHits;
  const hitQuote = quotes?.hits[state.backlogHits - 1];
  const hitPause = state.backlogHits === 2 ? BACKLOG_SECOND_HIT_PAUSE : 1.7;
  if (hitQuote) showBossDialogue(state, hitQuote, boss.x, boss.y, hitPause);
  state.backlogTiles = [];
  state.backlogIntermissionStage = 4;
  state.backlogIntermissionFor = hitPause;
  state.backlogRebuildAfterWall = true;
}

function recallBacklogBombs(state: GameState, boss: Enemy) {
  for (const bomb of state.backlogBombs) {
    const dx = boss.x - bomb.x;
    const dy = boss.y - bomb.y;
    const distance = Math.hypot(dx, dy) || 1;
    const directionX = dx / distance;
    const directionY = dy / distance;
    const steps = Math.min(9, Math.max(3, Math.ceil(distance / 52)));
    const color = bomb.kind === "red" ? "#ff526e" : bomb.returned ? "#9defff" : "#f8d477";
    for (let step = 0; step < steps && state.particles.length < MAX_PARTICLES; step++) {
      const progress = step / steps;
      const life = 0.28 + progress * 0.2;
      state.particles.push({
        id: state.nextParticleId++,
        x: bomb.x + dx * progress * 0.7,
        y: bomb.y + dy * progress * 0.7,
        vx: directionX * (260 + progress * 180),
        vy: directionY * (260 + progress * 180),
        life,
        maxLife: life,
        color,
        size: 3.5 - progress * 1.4,
      });
    }
    burstParticles(
      state,
      bomb.x,
      bomb.y,
      bomb.kind === "red" ? "#ff526e" : bomb.returned ? "#70dff2" : "#f8d477",
      4,
    );
  }
  state.backlogBombs = [];
}

function updateBacklogBomb(
  state: GameState,
  boss: Enemy,
  dt: number,
  random: () => number,
) {
  if (!state.backlogBombs.some((bomb) => bomb.kind === "returnable")) {
    state.backlogBombCooldown = Math.max(0, state.backlogBombCooldown - dt);
    if (state.backlogBombCooldown <= 0) spawnBacklogGoldBomb(state, boss, random);
  }
  state.backlogRedBombCooldown = Math.max(0, state.backlogRedBombCooldown - dt);
  if (state.backlogRedBombCooldown <= 0) {
    spawnBacklogRedBombBurst(state, boss, random);
  }

  for (const bomb of [...state.backlogBombs]) {
    updateSingleBacklogBomb(state, boss, bomb, dt);
  }
}

function updateSingleBacklogBomb(
  state: GameState,
  boss: Enemy,
  bomb: BacklogBomb,
  dt: number,
) {
  bomb.previousX = bomb.x;
  bomb.previousY = bomb.y;
  bomb.life -= dt;
  if (bomb.lobFor > 0) {
    bomb.lobFor = Math.max(0, bomb.lobFor - dt);
    bomb.x += bomb.vx * dt;
    bomb.y += bomb.vy * dt;
    if (bomb.lobFor === 0) {
      if (bomb.kind === "red") {
        bomb.vx = 0;
        bomb.vy = 0;
      } else {
        const dx = state.player.x - bomb.x;
        const dy = state.player.y - bomb.y;
        const distance = Math.hypot(dx, dy) || 1;
        bomb.vx = (dx / distance) * BACKLOG_BOMB_SPEED;
        bomb.vy = (dy / distance) * BACKLOG_BOMB_SPEED;
      }
    }
    return;
  }
  const fuseSlow = bomb.kind === "red" && bomb.life < 0.8 ? 0.18 : 1;
  bomb.x += bomb.vx * dt * fuseSlow;
  bomb.y += bomb.vy * dt * fuseSlow;

  if (bomb.x < bomb.radius || bomb.x > state.width - bomb.radius) {
    bomb.x = clamp(bomb.x, bomb.radius, state.width - bomb.radius);
    bomb.vx *= -1;
  }
  if (bomb.y > state.height + bomb.radius) {
    removeBacklogBomb(state, bomb);
    if (bomb.kind === "returnable" && !bomb.returned) {
      const quotes = ACTS[state.actIndex].boss.breakoutQuotes?.misses ?? [];
      const quote = quotes[state.backlogBombThrowIndex % quotes.length];
      if (quote) showBossDialogue(state, quote, boss.x, boss.y, 1.8);
    }
    return;
  }
  if (bomb.y < bomb.radius) {
    bomb.y = bomb.radius;
    bomb.vy = Math.abs(bomb.vy);
    bomb.returned = false;
  }

  if (bomb.kind === "returnable") {
    const struckTile = state.backlogTiles.find((tile) => segmentHitsBacklogTile(bomb, tile));
    if (struckTile) {
      bounceBacklogBombOffTile(state, bomb, struckTile);
      return;
    }
  }

  if (
    Math.hypot(bomb.x - state.player.x, bomb.y - state.player.y) <=
      bomb.radius + PLAYER_RADIUS
  ) {
    if (state.player.invulnerableFor <= 0) {
      damagePlayer(state, 1, "Archived by the backlog");
    }
    explodeBacklogBomb(state, bomb, false);
    return;
  }

  if (bomb.life <= 0) explodeBacklogBomb(state, bomb, true);
}

function spawnBacklogGoldBomb(
  state: GameState,
  boss: Enemy,
  random: () => number,
) {
  spawnBacklogBomb(state, boss, "returnable", random, 0);
  state.backlogBombCooldown = 1.1;
  const quotes = ACTS[state.actIndex].boss.breakoutQuotes?.volleys ?? [];
  const quote = quotes[state.backlogBombThrowIndex % quotes.length];
  state.backlogBombThrowIndex += 1;
  if (quote && backlogCombatDialogueAvailable(state)) {
    showBossDialogue(state, quote, boss.x, boss.y, 2.2);
  }
}

function spawnBacklogRedBombBurst(
  state: GameState,
  boss: Enemy,
  random: () => number,
) {
  const maximum = Math.min(4, 1 + state.backlogHits);
  const count = 1 + Math.floor(random() * maximum);
  for (let index = 0; index < count; index++) {
    spawnBacklogBomb(state, boss, "red", random, index - (count - 1) / 2);
  }
  state.backlogBombThrowIndex += 1;
  const pressure = Math.min(3, state.backlogHits);
  state.backlogRedBombCooldown = Math.max(1.2, 3.5 - pressure * 0.45) + random() * 1.8;
  const quotes = ACTS[state.actIndex].boss.breakoutQuotes?.redBomb ?? [];
  const quote = quotes[state.backlogBombThrowIndex % quotes.length];
  if (quote && random() < 0.42 && backlogCombatDialogueAvailable(state)) {
    showBossDialogue(state, quote, boss.x, boss.y, 2, "danger");
  }
}

function backlogCombatDialogueAvailable(state: GameState) {
  return !state.bossDialogue || state.bossDialogue.life <= 0.35;
}

function spawnBacklogBomb(
  state: GameState,
  boss: Enemy,
  kind: BacklogBomb["kind"],
  random: () => number,
  spreadIndex: number,
) {
  const wallBottom = state.backlogTiles.reduce(
    (bottom, tile) => Math.max(bottom, tile.y + tile.height / 2),
    boss.y + boss.radius,
  );
  const playerAreaTop = Math.min(state.height - 70, backlogPlayerBoundary(state) + 8);
  const landingY = kind === "red"
    ? playerAreaTop + random() * Math.max(0, state.height - 42 - playerAreaTop)
    : Math.min(state.height - 70, wallBottom + 42);
  const x = clamp(boss.x + spreadIndex * 9 + (random() - 0.5) * 20, 22, state.width - 22);
  const y = boss.y + boss.radius * 0.2;
  const landingX = clamp(
    38 + random() * Math.max(0, state.width - 76) + spreadIndex * 18,
    38,
    state.width - 38,
  );
  const lobDuration = 0.58 + random() * 0.52;
  const maxLife = kind === "red" ? 3.2 : BACKLOG_GOLD_FUSE;
  state.backlogBombs.push({
    x,
    y,
    previousX: x,
    previousY: y,
    vx: (landingX - x) / lobDuration,
    vy: (landingY - y) / lobDuration,
    radius: kind === "red" ? 13 : 11,
    kind,
    returned: false,
    lobFor: lobDuration,
    lobDuration,
    life: maxLife,
    maxLife,
  });
  burstParticles(state, x, y, kind === "red" ? "#ff526e" : "#f8d477", 6);
  boss.warningFor = 0.38;
}

function explodeBacklogBomb(state: GameState, bomb: BacklogBomb, damagePlayerInBlast: boolean) {
  if (damagePlayerInBlast && bomb.kind === "returnable") {
    const blastTiles = state.backlogTiles.filter((tile) => {
      const dx = Math.max(Math.abs(tile.x - bomb.x) - tile.width / 2, 0);
      const dy = Math.max(Math.abs(tile.y - bomb.y) - tile.height / 2, 0);
      return Math.hypot(dx, dy) <= BACKLOG_GOLD_BLAST_RADIUS;
    });
    let destroyed = 0;
    for (const tile of blastTiles) {
      if (damageBacklogTile(state, tile, 1)) destroyed += 1;
    }
    if (blastTiles.length > 0) {
      state.banner = destroyed > 1
        ? "BACKLOG BLAST"
        : destroyed === 1
        ? "CELL PURGED"
        : "BACKLOG CRACKED";
    }
  }
  if (
    damagePlayerInBlast &&
    state.player.invulnerableFor <= 0 &&
    Math.hypot(state.player.x - bomb.x, state.player.y - bomb.y) <= 76 + PLAYER_RADIUS
  ) {
    damagePlayer(
      state,
      1,
      bomb.kind === "red"
        ? "Failed to heed the blinking red warning"
        : "Held onto an unstable return for too long",
    );
  }
  burstParticles(state, bomb.x, bomb.y, bomb.kind === "red" ? "#ff526e" : "#f8d477", 28);
  state.screenShake = Math.max(state.screenShake, 0.72);
  removeBacklogBomb(state, bomb);
}

function bounceBacklogBombOffTile(
  state: GameState,
  bomb: BacklogBomb,
  tile: BacklogTile,
) {
  const left = tile.x - tile.width / 2;
  const right = tile.x + tile.width / 2;
  const top = tile.y - tile.height / 2;
  const bottom = tile.y + tile.height / 2;
  if (bomb.previousY >= bottom) {
    bomb.y = bottom + bomb.radius;
    bomb.vy = Math.abs(bomb.vy);
  } else if (bomb.previousY <= top) {
    bomb.y = top - bomb.radius;
    bomb.vy = -Math.abs(bomb.vy);
  } else if (bomb.previousX <= left) {
    bomb.x = left - bomb.radius;
    bomb.vx = -Math.abs(bomb.vx);
  } else if (bomb.previousX >= right) {
    bomb.x = right + bomb.radius;
    bomb.vx = Math.abs(bomb.vx);
  } else {
    bomb.vy *= -1;
  }
  bomb.returned = false;
  const destroyed = damageBacklogTile(state, tile, 1);
  if (!destroyed) {
    state.banner = `RETENTION: ${tile.health} HIT${tile.health === 1 ? "" : "S"} LEFT`;
  } else if (!tile.special && !tile.drop) {
    state.banner = "CELL PURGED";
  }
  state.screenShake = Math.max(state.screenShake, 0.28);
}

function removeBacklogBomb(state: GameState, bomb: BacklogBomb) {
  state.backlogBombs = state.backlogBombs.filter((candidate) => candidate !== bomb);
  if (
    bomb.kind === "returnable" &&
    !state.backlogBombs.some((candidate) => candidate.kind === "returnable")
  ) state.backlogBombCooldown = 0.9;
}

function damageBacklogTile(state: GameState, tile: BacklogTile, damage: number) {
  tile.health = Math.max(0, tile.health - damage);
  if (tile.health > 0) {
    burstParticles(state, tile.x, tile.y, "#fff0bd", 4);
    return false;
  }
  destroyBacklogTile(state, tile);
  state.backlogTiles = state.backlogTiles.filter((candidate) => candidate !== tile);
  return true;
}

function destroyBacklogTile(state: GameState, tile: BacklogTile) {
  state.score += tile.collector ? 25 : 12;
  const color = tile.special === "cache"
    ? "#71f6bd"
    : tile.special === "duplicate"
    ? "#ff7eb6"
    : tile.collector
    ? "#f8d477"
    : "#70dff2";
  burstParticles(state, tile.x, tile.y, color, 10);
  if (tile.special === "cache") {
    state.player.ammo = state.player.magazineSize;
    state.player.reloadFor = 0;
    state.banner = "CACHE RECOVERED";
  } else if (tile.special === "duplicate" || tile.drop === "enemy") {
    const livingAdds = state.enemies.filter((enemy) =>
      enemy.kind !== "boss" && enemy.health > 0
    ).length;
    if (livingAdds < 3) {
      const enemy = spawnEnemy(state, "file", () => nextRandom(state), 0.9);
      enemy.x = tile.x;
      enemy.y = tile.y;
      state.enemies.push(enemy);
      state.banner = "DUPLICATE RESTORED";
    }
  } else if (tile.drop === "powerup") {
    spawnPowerupDrop(
      state,
      choosePowerupKind(state, () => nextRandom(state)),
      tile.x,
      tile.y,
      true,
      true,
    );
    state.banner = "BONUS FEATURE UNLOCKED";
  } else if (tile.drop === "repair") {
    spawnPowerupDrop(state, "repair", tile.x, tile.y, true, true);
    state.banner = "+1 HP AVAILABLE";
  } else if (tile.drop === "bomb") {
    spawnBacklogBonusBall(state, tile.x, tile.y);
    state.banner = "MULTIBALL-ISH";
  }
}

function spawnBacklogBonusBall(state: GameState, x: number, y: number) {
  state.backlogBombs.push({
    x,
    y,
    previousX: x,
    previousY: y,
    vx: 0,
    vy: 145,
    radius: 11,
    kind: "returnable",
    returned: false,
    lobFor: 0,
    lobDuration: 0,
    life: BACKLOG_GOLD_FUSE,
    maxLife: BACKLOG_GOLD_FUSE,
  });
  burstParticles(state, x, y, "#f8d477", 14);
}

function beginBacklogFirewall(state: GameState) {
  const quotes = ACTS[state.actIndex].boss.breakoutQuotes;
  const boss = state.enemies.find((enemy) => enemy.bossKind === "backlog");
  state.backlogIntermissionStage = 1;
  state.backlogIntermissionFor = state.backlogHits === 2
    ? BACKLOG_SECOND_WIPE_WARNING
    : 1.35 * DIFFICULTIES[state.mode].warningMultiplier;
  state.backlogFirewallWarningFor = state.backlogIntermissionFor;
  state.backlogRebuildAfterWall = true;
  state.backlogFirewallDirection = state.backlogHits >= 3 ? 1 : 0;
  if (state.backlogHits === 2) {
    const margin = BACKLOG_FIREWALL_GAP_WIDTH / 2 + 34;
    const leftMaximum = Math.max(margin, state.width * 0.34);
    const rightMinimum = Math.min(state.width - margin, state.width * 0.66);
    const beginLeft = nextRandom(state) < 0.5;
    const maximumTraversal = BASE_PLAYER_SPEED * (BACKLOG_MAZE_WALL_INTERVAL - 0.35);
    const gaps: number[] = [];
    for (let layer = 0; layer < BACKLOG_MAZE_WALL_COUNT; layer++) {
      const useLeft = layer % 2 === 0 ? beginLeft : !beginLeft;
      const minimum = useLeft ? margin : rightMinimum;
      const maximum = useLeft ? leftMaximum : state.width - margin;
      const rolled = minimum + nextRandom(state) * Math.max(0, maximum - minimum);
      const previous = gaps.at(-1) ?? state.player.x;
      gaps.push(clamp(rolled, previous - maximumTraversal, previous + maximumTraversal));
    }
    state.backlogFirewallGaps = gaps;
  }
  const text = quotes?.firewalls[Math.max(0, state.backlogHits - 1)];
  const dialogueFor = state.backlogHits === 2 ? BACKLOG_SECOND_WIPE_WARNING : 2.4;
  if (text && boss) showBossDialogue(state, text, boss.x, boss.y, dialogueFor, "danger");
}

function updateBacklogDeepCleanCycle(state: GameState, dt: number) {
  if (state.backlogScanStep >= BACKLOG_SCAN_DIRECTIONS.length) return;
  state.backlogScanNextFor -= dt;
  if (state.backlogScanNextFor > 0) return;
  spawnBacklogScan(state, state.backlogScanStep);
  state.backlogScanStep += 1;
  state.backlogScanNextFor += BACKLOG_SCAN_INTERVAL;
  if (state.backlogScanStep < BACKLOG_SCAN_DIRECTIONS.length) {
    state.backlogFirewallDirection = BACKLOG_SCAN_DIRECTIONS[state.backlogScanStep];
  }
}

function spawnBacklogScan(state: GameState, step: number) {
  const direction = BACKLOG_SCAN_DIRECTIONS[step];
  const speed = BACKLOG_FIREWALL_SPEED * (1.12 + step * 0.035);
  spawnBacklogFirewall(state, direction, 1, speed);
  state.banner = BACKLOG_SCAN_BANNERS[step];
}

function spawnBacklogFirewall(
  state: GameState,
  direction: number,
  layers: number,
  speed = BACKLOG_FIREWALL_SPEED,
) {
  const vertical = direction === 1 || direction === 3;
  const span = vertical ? state.height : state.width;
  const radius = 8;
  const spacing = 14;
  const layerGap = 44;
  const velocityX = direction === 1 ? -speed : direction === 3 ? speed : 0;
  const velocityY = direction === 0 ? speed : direction === 2 ? -speed : 0;
  for (let layer = 0; layer < layers; layer++) {
    const trailing = layer * layerGap;
    const originX = direction === 1
      ? state.width + radius + trailing
      : direction === 3
      ? -radius - trailing
      : 0;
    const originY = direction === 0
      ? -radius - trailing
      : direction === 2
      ? state.height + radius + trailing
      : 0;
    const life = ((vertical ? state.width : state.height) + trailing + 80) /
      speed;
    for (let offset = -radius; offset <= span + radius; offset += spacing) {
      if (state.projectiles.length >= MAX_PROJECTILES) return;
      const x = vertical ? originX : offset;
      const y = vertical ? offset : originY;
      state.projectiles.push({
        id: state.nextProjectileId++,
        x,
        y,
        previousX: x,
        previousY: y,
        vx: velocityX * DIFFICULTIES[state.mode].projectileSpeedMultiplier,
        vy: velocityY * DIFFICULTIES[state.mode].projectileSpeedMultiplier,
        radius,
        damage: 1,
        pierce: 0,
        life,
        friendly: false,
        hitIds: [],
        bouncesRemaining: 0,
        reflected: false,
        pattern: "backlog-firewall",
      });
    }
  }
}

function updateBacklogGapMaze(state: GameState, dt: number) {
  if (state.backlogMazeWallIndex >= state.backlogFirewallGaps.length) return;
  state.backlogMazeNextWallFor -= dt;
  if (state.backlogMazeNextWallFor > 0) return;
  const speed = BACKLOG_FIREWALL_SPEED * (1 + state.backlogHits * 0.06) * 1.08;
  spawnBacklogMazeWall(
    state,
    state.backlogFirewallGaps[state.backlogMazeWallIndex],
    speed,
  );
  state.backlogMazeWallIndex += 1;
  state.backlogMazeNextWallFor += BACKLOG_MAZE_WALL_INTERVAL;
}

function spawnBacklogMazeWall(state: GameState, gapX: number | undefined, speed: number) {
  const radius = 8;
  const spacing = 14;
  const redWall = BACKLOG_MAZE_RED_WALLS.has(state.backlogMazeWallIndex);
  const originY = redWall ? radius : -radius;
  const life = (state.height + 100) / speed;
  const movingRank = state.backlogMazeWallIndex -
    (BACKLOG_MAZE_WALL_COUNT - BACKLOG_MAZE_MOVING_WALLS);
  const gapHalf =
    (movingRank >= 0 ? BACKLOG_MOVING_FIREWALL_GAP_WIDTH : BACKLOG_FIREWALL_GAP_WIDTH) / 2;
  const horizontalSpeed = movingRank >= 0
    ? (movingRank % 2 === 0 ? -1 : 1) * (42 + movingRank * 10)
    : 0;
  const horizontalPadding = Math.abs(horizontalSpeed) * life + spacing;
  state.banner = redWall ? "UNSKIPPABLE — TAB REQUIRED" : BACKLOG_MAZE_BANNERS[
    Math.min(state.backlogMazeWallIndex, BACKLOG_MAZE_BANNERS.length - 1)
  ];
  for (
    let x = -radius - horizontalPadding;
    x <= state.width + radius + horizontalPadding;
    x += spacing
  ) {
    if (!redWall && gapX !== undefined && Math.abs(x - gapX) < gapHalf + radius) continue;
    state.projectiles.push({
      id: state.nextProjectileId++,
      x,
      y: originY,
      previousX: x,
      previousY: originY,
      vx: horizontalSpeed,
      vy: speed * DIFFICULTIES[state.mode].projectileSpeedMultiplier,
      radius,
      damage: 1,
      pierce: 0,
      life,
      friendly: false,
      hitIds: [],
      bouncesRemaining: 0,
      reflected: false,
      pattern: redWall ? "backlog-firewall-red" : "backlog-firewall",
      warningFor: redWall ? BACKLOG_RED_WALL_WARNING : 0,
    });
  }
}

export function resolveBacklogTileProjectileCollisions(state: GameState) {
  if (
    state.phase !== "boss" ||
    state.backlogIntroStage < BACKLOG_INTRO_ACTIVE_STAGE ||
    state.backlogIntermissionStage > 0 ||
    state.backlogTiles.length === 0
  ) return;
  for (const projectile of state.projectiles) {
    if (!projectile.friendly || projectile.life <= 0) continue;
    const tile = state.backlogTiles.find(
      (candidate) => segmentHitsBacklogTile(projectile, candidate),
    );
    if (!tile) continue;
    burstParticles(
      state,
      projectile.x,
      projectile.y,
      tile.collector ? "#f8d477" : "#70dff2",
      3,
    );
    projectile.life = -1;
  }
}

export function resolveBacklogBombProjectileCollisions(state: GameState) {
  if (
    state.backlogIntroStage < BACKLOG_INTRO_ACTIVE_STAGE ||
    state.backlogIntermissionStage > 0
  ) return;
  for (const bomb of state.backlogBombs) {
    if (bomb.kind !== "returnable" || bomb.returned || bomb.lobFor > 0) continue;
    const projectile = state.projectiles.find((candidate) =>
      candidate.friendly &&
      candidate.life > 0 &&
      sweptMovingCirclesIntersect(
        candidate,
        bomb,
        bomb.radius + candidate.radius + BACKLOG_BOMB_INTERCEPT_PADDING,
      )
    );
    if (!projectile) continue;
    returnBacklogBomb(state, bomb, projectile.vx, projectile.vy);
    projectile.life = -1;
    state.enemyHits += 1;
  }
}

export function resolveBacklogFirewallProjectileCollisions(state: GameState) {
  if (state.phase !== "boss" || ACTS[state.actIndex].boss.kind !== "backlog") return;
  for (const projectile of state.projectiles) {
    if (!projectile.friendly || projectile.life <= 0) continue;
    const segment = state.projectiles.find((candidate) =>
      !candidate.friendly &&
      candidate.life > 0 &&
      candidate.pattern === "backlog-firewall" &&
      sweptMovingCirclesIntersect(
        projectile,
        candidate,
        projectile.radius + candidate.radius,
      )
    );
    if (!segment) continue;
    segment.life = -1;
    burstParticles(state, segment.x, segment.y, "#f8d477", 5);
    state.enemyHits += 1;
    if (projectile.pierce <= 0) projectile.life = -1;
    else projectile.pierce -= 1;
  }
}

export function resolveBacklogBombBossCollisions(state: GameState) {
  if (
    state.phase !== "boss" ||
    ACTS[state.actIndex].boss.kind !== "backlog" ||
    state.backlogIntermissionStage > 0
  ) return;
  const boss = state.enemies.find((enemy) => enemy.bossKind === "backlog" && enemy.health > 0);
  if (!boss) return;
  const bomb = state.backlogBombs.find((candidate) =>
    candidate.kind === "returnable" &&
    candidate.returned &&
    candidate.lobFor <= 0 &&
    sweptMovingCirclesIntersect(candidate, boss, boss.radius + candidate.radius + 20)
  );
  if (bomb) landBacklogHit(state, boss);
}

export function returnBacklogBomb(
  state: GameState,
  bomb: BacklogBomb,
  directionX: number,
  directionY: number,
) {
  const magnitude = Math.hypot(directionX, directionY) || 1;
  bomb.vx = (directionX / magnitude) * BACKLOG_RETURN_SPEED;
  bomb.vy = (directionY / magnitude) * BACKLOG_RETURN_SPEED;
  bomb.returned = true;
  state.banner = "RETURN TO SENDER";
  state.screenShake = Math.max(state.screenShake, 0.35);
  burstParticles(state, bomb.x, bomb.y, "#70dff2", 12);
}
