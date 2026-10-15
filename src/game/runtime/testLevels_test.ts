import { assertEquals } from "@std/assert";
import { createGameState, jumpToTestLevel } from "../engine.ts";
import { TEST_LEVELS } from "./testLevels.ts";

Deno.test("local test selector follows the story's playable order", () => {
  assertEquals(TEST_LEVELS.filter((level) => level.actIndex === 0).map((level) => level.id), [
    "0:encounter:0",
    "0:encounter:1",
    "0:miniboss",
    "0:encounter:2",
    "0:boss",
  ]);
});

Deno.test("every local test option jumps to its intended encounter, including unused acts", () => {
  const state = createGameState(960, 600);
  for (const level of TEST_LEVELS) {
    jumpToTestLevel(state, level);
    assertEquals(state.actIndex, level.actIndex);
    assertEquals(state.phase, level.kind);
    if (level.kind === "encounter") assertEquals(state.encounterIndex, level.encounterIndex);
    if (level.kind === "miniboss") assertEquals(state.encounterIndex, 1);
  }
});
