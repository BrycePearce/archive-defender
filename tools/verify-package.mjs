import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [{ ArcadeGame }, launch, entry, stylesheet] = await Promise.all([
  import("archive-defender"),
  import("archive-defender/launch"),
  readFile(new URL("../package/index.js", import.meta.url), "utf8"),
  readFile(new URL("../package/archive-defender.css", import.meta.url), "utf8"),
]);

assert.equal(typeof ArcadeGame, "function");
assert.equal(typeof launch.ARCADE_OPENING_TRACK_URL, "string");
assert.match(entry, /^"use client";/);
assert.doesNotMatch(stylesheet, /\.(?:btn|flex|gap-[0-9]|size-[0-9])(?:[\s,{:.#]|$)/);
assert.match(stylesheet, /--archive-color-primary/);

console.log("Package exports, client boundary, and standalone stylesheet verified.");
