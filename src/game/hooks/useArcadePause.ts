import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ArcadeAudio } from "../audio.ts";
import type { GamePhase, GameState } from "../types.ts";

export function useArcadePause(
  stateRef: RefObject<GameState | null>,
  audioRef: RefObject<ArcadeAudio | null>,
  activePhases: ReadonlySet<GamePhase>,
) {
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  const setPauseState = useCallback((next: boolean) => {
    pausedRef.current = next;
    setPaused(next);
    if (next) audioRef.current?.pause();
    else audioRef.current?.resume();
  }, [audioRef]);

  const togglePause = useCallback(() => {
    const state = stateRef.current;
    if (!state || !activePhases.has(state.phase)) return;
    setPauseState(!pausedRef.current);
  }, [activePhases, setPauseState, stateRef]);

  const pauseActiveGame = useCallback(() => {
    const state = stateRef.current;
    if (state && activePhases.has(state.phase) && !pausedRef.current) {
      setPauseState(true);
    }
  }, [activePhases, setPauseState, stateRef]);

  return { paused, pausedRef, setPauseState, togglePause, pauseActiveGame };
}
