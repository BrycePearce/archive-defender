import { useEffect, useRef, useState } from "react";
import { ACTS } from "../content.ts";
import {
  createGameState,
  createStateFromCheckpoint,
  dispatchGameAction,
  jumpToTestLevel,
  resizeGameState,
  stepGame,
} from "../engine.ts";
import type { TestLevelTarget } from "../engine.ts";
import { ArcadeInputController } from "../input.ts";
import { ArcadeAudio } from "../audio.ts";
import { ARCADE_OPENING_TRACK_URL, claimArcadeLaunchMusic } from "../../arcadeLaunch.ts";
import { checkpointFromState, createDefaultSave } from "../persistence.ts";
import { renderArcade } from "../renderer.ts";
import type { ArcadeSettings, DifficultyMode, GamePhase, GameState, WeaponKind } from "../types.ts";
import backlogBossMusicUrl from "../assets/backlog-boss.mp3?url";
import backfillMinibossMusicUrl from "../assets/backfill-miniboss.ogg?url";
import duplicateBossMusicUrl from "../assets/duplicate-boss.ogg?url";
import duplicateMusicUrl from "../assets/duplicate-vault.mp3?url";
import rogueMusicUrl from "../assets/rogue-access.mp3?url";
import rogueBossMusicUrl from "../assets/rogue-boss.mp3?url";
import bossDefeatSfxUrl from "../assets/sfx/boss-defeat.wav?url";
import bossPhaseSfxUrl from "../assets/sfx/boss-phase.wav?url";
import gameOverSfxUrl from "../assets/sfx/game-over.wav?url";
import shieldBlockSfxUrl from "../assets/sfx/shield-block.wav?url";
import talk1SfxUrl from "../assets/sfx/talk-1.wav?url";
import talk2SfxUrl from "../assets/sfx/talk-2.wav?url";
import talk3SfxUrl from "../assets/sfx/talk-3.wav?url";
import talk4SfxUrl from "../assets/sfx/talk-4.wav?url";
import victoryStingSfxUrl from "../assets/sfx/victory-sting.ogg?url";
import { INITIAL_SUMMARY, summarizeGame } from "../runtime/summary.ts";
import type { GameSummary } from "../runtime/summary.ts";
import {
  captureArcadeSignals,
  initialArcadeSignals,
  syncArcadeAudioSignals,
} from "../runtime/audioSignals.ts";
import { TEST_LEVELS } from "../runtime/testLevels.ts";
import { useArcadeSave } from "./useArcadeSave.ts";
import { useArcadePause } from "./useArcadePause.ts";
import { useArcadeAudio } from "./useArcadeAudio.ts";

const ACTIVE_PHASES = new Set<GamePhase>([
  "encounter",
  "reward",
  "miniboss",
  "boss",
  "endless",
]);

export function useArcadeController() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const musicElementARef = useRef<HTMLAudioElement>(null);
  const musicElementBRef = useRef<HTMLAudioElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const inputRef = useRef<ArcadeInputController | null>(null);
  const audioRef = useRef<ArcadeAudio | null>(null);
  const frameRef = useRef<number | null>(null);
  const settingsRef = useRef<ArcadeSettings>(createDefaultSave().settings);
  const previousSignalsRef = useRef(initialArcadeSignals());
  const { save, saveRef, commitSave, changeSettings } = useArcadeSave();
  const [summary, setSummary] = useState<GameSummary>(INITIAL_SUMMARY);
  const [selectedMode, setSelectedMode] = useState<DifficultyMode>("normal");
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponKind>("blaster");
  const [showSettings, setShowSettings] = useState(false);
  const [runId, setRunId] = useState(0);
  settingsRef.current = save.settings;

  const {
    paused,
    pausedRef,
    setPauseState,
    togglePause,
    pauseActiveGame,
  } = useArcadePause(stateRef, audioRef, ACTIVE_PHASES);

  const { beginAudio, beginOpeningAudio, handleTransition } = useArcadeAudio({
    stateRef,
    audioRef,
    pausedRef,
    activePhases: ACTIVE_PHASES,
    settings: save.settings,
    commitSave,
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const musicElementA = musicElementARef.current;
    const musicElementB = musicElementBRef.current;
    if (!canvas || !musicElementA || !musicElementB) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const launchMusic = claimArcadeLaunchMusic();
    const audio = new ArcadeAudio(
      [launchMusic ?? musicElementA, musicElementB],
      {
        stale: ARCADE_OPENING_TRACK_URL,
        "backfill-miniboss": backfillMinibossMusicUrl,
        "backlog-boss": backlogBossMusicUrl,
        duplicate: duplicateMusicUrl,
        "duplicate-boss": duplicateBossMusicUrl,
        rogue: rogueMusicUrl,
        "rogue-boss": rogueBossMusicUrl,
      },
      settingsRef.current,
      launchMusic ? "stale" : null,
      {
        shield: shieldBlockSfxUrl,
        "boss-phase": bossPhaseSfxUrl,
        "boss-defeat": bossDefeatSfxUrl,
        talk: [talk1SfxUrl, talk2SfxUrl, talk3SfxUrl, talk4SfxUrl],
        "game-over": gameOverSfxUrl,
        victory: victoryStingSfxUrl,
      },
    );
    audioRef.current = audio;
    let cssWidth = 1;
    let cssHeight = 1;
    let previousTime = performance.now();
    let accumulator = 0;
    let lastSummaryAt = 0;
    let lastSummaryPhase: GamePhase = stateRef.current?.phase ?? "title";
    let adoptingLaunchMusic = launchMusic !== null;
    const fixedStep = 1 / 60;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      cssWidth = Math.max(1, bounds.width);
      cssHeight = Math.max(1, bounds.height);
      const scale = Math.min(globalThis.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssWidth * scale);
      canvas.height = Math.round(cssHeight * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      if (!stateRef.current) {
        const currentSave = saveRef.current ?? createDefaultSave();
        if (currentSave.victories.normal === 0 && currentSave.checkpoint) {
          stateRef.current = createStateFromCheckpoint(
            cssWidth,
            cssHeight,
            currentSave.checkpoint,
          );
        } else {
          stateRef.current = createGameState(cssWidth, cssHeight);
          if (currentSave.victories.normal === 0) {
            dispatchGameAction(stateRef.current, {
              type: "start",
              mode: "normal",
              weapon: "blaster",
            });
            commitSave((draft) => {
              draft.checkpoint = checkpointFromState(stateRef.current!);
            });
          }
        }
        setSummary(summarizeGame(stateRef.current));
      } else {
        resizeGameState(stateRef.current, cssWidth, cssHeight);
      }
      if (ACTIVE_PHASES.has(stateRef.current.phase)) {
        if (
          (stateRef.current.phase === "miniboss" &&
            stateRef.current.minibossFightStarts === 0) ||
          (stateRef.current.phase === "boss" &&
            ACTS[stateRef.current.actIndex].boss.kind === "backlog" &&
            stateRef.current.backlogFightStarts === 0)
        ) {
          audio.silenceMusic();
        } else if (adoptingLaunchMusic) {
          adoptingLaunchMusic = false;
          audio.startOpeningFor(
            stateRef.current.actIndex,
            stateRef.current.phase,
            stateRef.current.endlessRound,
          );
        } else {
          audio.startFor(
            stateRef.current.actIndex,
            stateRef.current.phase,
            stateRef.current.endlessRound,
          );
        }
      }
    };

    const input = new ArcadeInputController(canvas, {
      onInteract: beginAudio,
      onPause: togglePause,
      onBlur: pauseActiveGame,
    });
    inputRef.current = input;
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    const frame = (time: number) => {
      const state = stateRef.current;
      if (!state) return;
      const elapsed = Math.min(0.25, Math.max(0, (time - previousTime) / 1000));
      previousTime = time;

      if (!pausedRef.current && ACTIVE_PHASES.has(state.phase)) {
        accumulator = Math.min(accumulator + elapsed, fixedStep * 6);
        while (accumulator >= fixedStep) {
          stepGame(state, input.read(state.player), fixedStep);
          accumulator -= fixedStep;
        }
      } else {
        accumulator = 0;
      }

      renderArcade(context, state, cssWidth, cssHeight, {
        paused: pausedRef.current,
        settings: settingsRef.current,
        touch: input.getTouchVisuals(),
      });

      const previousSignals = previousSignalsRef.current;
      handleTransition(state, previousSignals.phase);
      previousSignalsRef.current = syncArcadeAudioSignals(
        audio,
        state,
        previousSignals,
      );

      if (time - lastSummaryAt >= 100 || state.phase !== lastSummaryPhase) {
        lastSummaryAt = time;
        lastSummaryPhase = state.phase;
        setSummary(summarizeGame(state));
      }
      frameRef.current = requestAnimationFrame(frame);
    };
    frameRef.current = requestAnimationFrame(frame);

    const onVisibilityChange = () => {
      if (document.hidden) pauseActiveGame();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      input.destroy();
      audio.destroy();
      inputRef.current = null;
      audioRef.current = null;
    };
  }, [
    beginAudio,
    commitSave,
    pauseActiveGame,
    handleTransition,
    runId,
    togglePause,
  ]);

  const startRun = (mode: DifficultyMode, weapon: WeaponKind) => {
    const state = stateRef.current;
    if (!state) return;
    dispatchGameAction(state, { type: "start", mode, weapon });
    previousSignalsRef.current = captureArcadeSignals(state);
    commitSave((draft) => {
      draft.checkpoint = checkpointFromState(state);
    });
    setPauseState(false);
    setSummary(summarizeGame(state));
    beginOpeningAudio();
  };

  const resumeRun = () => {
    const checkpoint = save.checkpoint;
    const canvas = canvasRef.current;
    if (!checkpoint || !canvas) return;
    stateRef.current = createStateFromCheckpoint(
      Math.max(1, canvas.clientWidth),
      Math.max(1, canvas.clientHeight),
      checkpoint,
    );
    previousSignalsRef.current = captureArcadeSignals(stateRef.current);
    setPauseState(false);
    setSummary(summarizeGame(stateRef.current));
    beginOpeningAudio();
  };

  const continueAct = () => {
    const state = stateRef.current;
    if (!state) return;
    dispatchGameAction(state, { type: "continueAct" });
    if (state.phase === "encounter") {
      commitSave((draft) => {
        draft.checkpoint = checkpointFromState(state);
      });
    }
    setSummary(summarizeGame(state));
    beginAudio();
  };

  const restartAct = () => {
    const checkpoint = save.checkpoint;
    const canvas = canvasRef.current;
    if (!checkpoint || !canvas) {
      setRunId((value) => value + 1);
      return;
    }
    stateRef.current = createStateFromCheckpoint(
      Math.max(1, canvas.clientWidth),
      Math.max(1, canvas.clientHeight),
      checkpoint,
    );
    setPauseState(false);
    setSummary(summarizeGame(stateRef.current));
    beginOpeningAudio();
  };

  const returnToTitle = () => {
    const state = stateRef.current;
    if (!state) return;
    if (save.victories.normal === 0) {
      restartAct();
      return;
    }
    dispatchGameAction(state, { type: "returnToTitle" });
    audioRef.current?.pause();
    setPauseState(false);
    setSummary(summarizeGame(state));
  };

  const startEndless = () => {
    const state = stateRef.current;
    if (!state) return;
    dispatchGameAction(state, { type: "startEndless" });
    setPauseState(false);
    setSummary(summarizeGame(state));
    beginOpeningAudio();
  };

  const selectTestLevel = (id: string) => {
    const level = TEST_LEVELS.find((candidate) => candidate.id === id);
    const state = stateRef.current;
    if (!level || !state) return;
    const target: TestLevelTarget = level.kind === "encounter"
      ? {
        actIndex: level.actIndex,
        kind: level.kind,
        encounterIndex: level.encounterIndex,
      }
      : { actIndex: level.actIndex, kind: level.kind };
    jumpToTestLevel(
      state,
      target,
      state.phase === "title" ? selectedMode : state.mode,
      state.phase === "title" ? selectedWeapon : state.weapon,
    );
    previousSignalsRef.current = captureArcadeSignals(state);
    audioRef.current?.pause();
    setPauseState(false);
    setSummary(summarizeGame(state));
    beginOpeningAudio();
  };

  return {
    canvasRef,
    musicElementARef,
    musicElementBRef,
    inputRef,
    stateRef,
    save,
    summary,
    paused,
    active: ACTIVE_PHASES.has(summary.phase),
    selectedMode,
    setSelectedMode,
    selectedWeapon,
    setSelectedWeapon,
    showSettings,
    setShowSettings,
    changeSettings,
    togglePause,
    startRun,
    resumeRun,
    continueAct,
    restartAct,
    returnToTitle,
    startEndless,
    selectTestLevel,
  };
}
