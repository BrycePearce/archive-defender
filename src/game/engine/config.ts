import type { TemporaryPowerupKind } from "../types.ts";

export const PLAYER_RADIUS = 13;
export const BASE_PLAYER_SPEED = 255;
export const BASE_PROJECTILE_SPEED = 610;
export const BASE_FIRE_INTERVAL = 0.14;
export const BASE_DASH_COOLDOWN = 2.35;
export const BASE_DASH_DURATION = 0.2;
export const DASH_SPEED = 760;

export const MAX_ENEMIES = 140;
export const MAX_PROJECTILES = 260;
export const MAX_HAZARDS = 80;
export const MAX_PARTICLES = 280;

export const RELAY_RADIUS = 18;
export const UPGRADE_TARGET_RADIUS = 28;
export const BASE_SECONDARY_COOLDOWN = 7.5;
export const DEEP_SCAN_BASE_WIDTH = 10;
export const DEEP_SCAN_BACKLOG_KNOCKBACK = 48;
export const REFLECT_LIFE_MULTIPLIER = 3.5;
export const REFLECT_BOUNCES = 8;
export const REFLECT_DURATION = 8;
export const PRISM_DURATION = 10;
export const PRISM_SECONDARY_COOLDOWN_MULTIPLIER = 0.5;
export const REWARD_REVEAL_DELAY = 1;
export const DOCUMENT_BURST_RADIUS = 46;
export const DOCUMENT_BURST_WARNING = 0.45;

export const NORMAL_DROP_CHANCE = 0.015;
export const ELITE_DROP_CHANCE = 0.35;
export const DROP_PITY_KILLS = 12;
export const DROP_COOLDOWN = 6;
export const MACHINE_GUN_AMMO = 48;
export const SUPER_SHOT_AMMO = 8;
export const MACHINE_GUN_RELOAD = 1.35;
export const SUPER_SHOT_RELOAD = 1.7;
export const FREEZE_DURATION = 4;
export const FROZEN_DAMAGE_MULTIPLIER = 1.75;
export const SINGULARITY_DURATION = 3;
export const SINGULARITY_RADIUS = 24;
export const SINGULARITY_PLACEMENT_DISTANCE = 170;

export const BACKFILL_INTRO_ACTIVE_STAGE = 8;
export const BACKLOG_INTRO_ACTIVE_STAGE = 5;
export const BACKLOG_BOSS_HITS = 4;
export const BACKLOG_FIREWALL_SPEED = 185;
export const BACKLOG_BOMB_SPEED = 245;
export const BACKLOG_RETURN_SPEED = 390;
export const BACKLOG_BOMB_INTERCEPT_PADDING = 5;
export const BACKLOG_GOLD_FUSE = 15;
export const BACKLOG_GOLD_BLAST_RADIUS = 86;
export const BACKLOG_FIREWALL_GAP_WIDTH = 64;
export const BACKLOG_MOVING_FIREWALL_GAP_WIDTH = 82;
export const BACKLOG_MAZE_WALL_COUNT = 10;
export const BACKLOG_MAZE_WALL_INTERVAL = 2.1;
export const BACKLOG_MAZE_MOVING_WALLS = 4;
export const BACKLOG_MAZE_RED_WALLS = new Set([3, 7]);
export const BACKLOG_RED_WALL_WARNING = 0.9;
export const BACKLOG_SCAN_INTERVAL = 2.75;
export const BACKLOG_SECOND_HIT_PAUSE = 3;
export const BACKLOG_SECOND_WIPE_WARNING = 3;
export const BACKLOG_SCAN_DIRECTIONS = [1, 3, 0, 2, 1, 0] as const;
export const BACKLOG_SCAN_BANNERS = [
  "DEEP CLEAN: 17%",
  "DEEP CLEAN: 34%",
  "DEEP CLEAN: 51%",
  "DEEP CLEAN: 68%",
  "DEEP CLEAN: 99%",
  "DEEP CLEAN: STILL 99%",
];
export const BACKLOG_MAZE_BANNERS = [
  "UP NEXT: MORE BACKLOG",
  "SKIP INTRO UNAVAILABLE",
  "ARE YOU STILL DODGING?",
  "AUTOPLAYING SEASON TWO",
  "BUFFERING YOUR ESCAPE",
  "CONTINUE WATCHING: YES",
  "CREDITS COUNT AS CONTENT",
  "RECOMMENDED BECAUSE YOU PANICKED",
  "UP NEXT: THE SAME THING",
  "SEASON FINALE (PART 1 OF 6)",
];

export const DUPLICATE_EXPLOSIVE_CHANCE = 0.62;
export const DUPLICATE_ENEMY_CHANCE = 0.22;
export const DUPLICATE_POWERUP_CHANCE = 0.05;
export const POWERUP_WEIGHTS: Record<TemporaryPowerupKind, number> = {
  "machine-gun": 2,
  "super-shot": 1.6,
  shield: 1.4,
  reflect: 1,
  prism: 1,
  freeze: 0.35,
  singularity: 0.35,
  repair: 1.2,
};
