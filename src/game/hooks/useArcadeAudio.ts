import { useCallback, useEffect } from "react";
import type { RefObject } from "react";
import { ACTS } from "../content.ts";
import type { ArcadeAudio } from "../audio.ts";
import { checkpointFromState, recordScore } from "../persistence.ts";
import type { ArcadeSaveV2, ArcadeSettings, GamePhase, GameState } from "../types.ts";

export function useArcadeAudio({
  stateRef,
  audioRef,
  pausedRef,
  activePhases,
  settings,
  commitSave,
}: {
  stateRef: RefObject<GameState | null>;
  audioRef: RefObject<ArcadeAudio | null>;
  pausedRef: RefObject<boolean>;
  activePhases: ReadonlySet<GamePhase>;
  settings: ArcadeSettings;
  commitSave: (update: (draft: ArcadeSaveV2) => void) => void;
}) {
  useEffect(() => audioRef.current?.applySettings(settings), [audioRef, settings]);

  const beginAudio = useCallback(() => {
    const state = stateRef.current;
    if (!state || state.phase === "title") return;
    if (shouldSilenceIntro(state)) {
      audioRef.current?.silenceMusic();
      return;
    }
    audioRef.current?.startFor(state.actIndex, state.phase, state.endlessRound);
  }, [audioRef, stateRef]);

  const beginOpeningAudio = useCallback(() => {
    const state = stateRef.current;
    if (!state || state.phase === "title") return;
    if (shouldSilenceIntro(state)) {
      audioRef.current?.silenceMusic();
      return;
    }
    audioRef.current?.startOpeningFor(state.actIndex, state.phase, state.endlessRound);
  }, [audioRef, stateRef]);

  const handleTransition = useCallback((state: GameState, previous: GamePhase) => {
    if (state.phase === previous) return;
    if (activePhases.has(state.phase) && !pausedRef.current) {
      if (shouldSilenceIntro(state)) audioRef.current?.silenceMusic();
      else audioRef.current?.startFor(state.actIndex, state.phase, state.endlessRound);
    }
    if (state.phase === "reward") audioRef.current?.playSfx("reward");
    if (state.phase === "boss" || state.phase === "miniboss") {
      audioRef.current?.playSfx("boss");
    }

    if (state.phase === "actComplete") {
      if (previous === "boss") audioRef.current?.playSfx("boss-clear");
      commitSave((draft) => {
        recordScore(draft, state.mode, state.score);
        if (state.actIndex === 0) {
          draft.unlocks.rail = true;
          if (!draft.achievements.includes("Backlog cleared")) {
            draft.achievements.push("Backlog cleared");
          }
        }
        if (state.actIndex < ACTS.length - 1) {
          draft.checkpoint = {
            ...checkpointFromState(state),
            actIndex: state.actIndex + 1,
            health: Math.min(state.player.maxHealth, state.player.health + 1),
          };
        }
      });
    } else if (state.phase === "gameOver") {
      commitSave((draft) => recordScore(draft, state.mode, state.score));
      audioRef.current?.pause();
      audioRef.current?.playSfx("game-over");
    } else if (state.phase === "victory") {
      commitSave((draft) => {
        recordScore(draft, state.mode, state.score);
        draft.victories[state.mode] += 1;
        draft.unlocks.array = true;
        draft.unlocks.endless = true;
        if (state.mode === "normal") draft.unlocks.hard = true;
        draft.checkpoint = null;
        if (!draft.achievements.includes("Library secured")) {
          draft.achievements.push("Library secured");
        }
      });
      audioRef.current?.playSfx("victory");
    }
  }, [activePhases, audioRef, commitSave, pausedRef]);

  return { beginAudio, beginOpeningAudio, handleTransition };
}

function shouldSilenceIntro(state: GameState) {
  return (state.phase === "miniboss" && state.minibossFightStarts === 0) ||
    (state.phase === "boss" &&
      ACTS[state.actIndex].boss.kind === "backlog" &&
      state.backlogFightStarts === 0);
}
