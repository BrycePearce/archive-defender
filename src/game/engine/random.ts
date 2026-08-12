import type { GameState } from "../types.ts";

export function nextRandom(state: GameState) {
  let value = state.rngState >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.rngState = value >>> 0;
  return state.rngState / 0x1_0000_0000;
}

export function createSeed() {
  try {
    return crypto.getRandomValues(new Uint32Array(1))[0] || 1;
  } catch {
    return (Date.now() ^ Math.floor(Math.random() * 0xffff_ffff)) >>> 0;
  }
}
