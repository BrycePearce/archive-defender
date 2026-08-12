import {
  ArrowLeft,
  Check,
  Crosshair,
  Gauge,
  Heart,
  Pause,
  Play,
  RotateCcw,
  Shield,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { ACTS, DIFFICULTIES, WEAPONS } from "./content.ts";
import { PauseScreen, ResultScreen, TitleScreen } from "./components/OverlayScreens.tsx";
import { createGameState, getCurrentEncounter } from "./engine.ts";
import { useArcadeController } from "./hooks/useArcadeController.ts";
import type { GameSummary } from "./runtime/summary.ts";
import { TEST_LEVELS } from "./runtime/testLevels.ts";
import type { ArcadeGameOptions } from "./runtime/options.ts";
const LOCAL_TEST_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isLocalTestHost() {
  return typeof globalThis.location !== "undefined" &&
    LOCAL_TEST_HOSTS.has(globalThis.location.hostname);
}

export interface ArcadeGameProps extends ArcadeGameOptions {
  onExit?: () => void;
  exitLabel?: string;
  className?: string;
}

export function ArcadeGame({
  onExit,
  exitLabel = "Exit game",
  className,
  ...options
}: ArcadeGameProps = {}) {
  const {
    canvasRef,
    musicElementARef,
    musicElementBRef,
    inputRef,
    stateRef,
    save,
    summary,
    paused,
    active,
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
  } = useArcadeController(options);

  const bestScore = Math.max(save.bestScores[summary.mode], summary.score);
  const encounter = getCurrentEncounter(
    stateRef.current ?? createGameState(1, 1),
  );
  const weapon = WEAPONS.find((candidate) => candidate.id === summary.weapon) ?? WEAPONS[0];
  const overlay = (() => {
    if (summary.phase === "title") {
      return (
        <TitleScreen
          save={save}
          mode={selectedMode}
          weapon={selectedWeapon}
          onMode={setSelectedMode}
          onWeapon={setSelectedWeapon}
          onStart={() => startRun(selectedMode, selectedWeapon)}
          onResume={resumeRun}
          onSettings={() => setShowSettings((value) => !value)}
          showSettings={showSettings}
          onChangeSettings={changeSettings}
        />
      );
    }
    if (summary.phase === "actComplete") {
      const isFinal = summary.actIndex === ACTS.length - 1;
      return (
        <ResultScreen
          icon={<Check />}
          eyebrow="Act secured"
          title={summary.banner}
          copy={isFinal
            ? "Every library is clean. One final report remains."
            : `${ACTS[summary.actIndex + 1].name} is now cleared for entry.`}
          score={summary.score}
          primary={isFinal ? "Complete archive" : "Enter next act"}
          onPrimary={continueAct}
          onSecondary={save.victories.normal > 0 ? returnToTitle : undefined}
        />
      );
    }
    if (summary.phase === "gameOver") {
      return (
        <ResultScreen
          icon={<RotateCcw />}
          eyebrow="Recovery checkpoint available"
          title="Library overrun"
          copy={summary.gameOverReason ?? "The cleanup job failed safely."}
          score={summary.score}
          primary="Restart this act"
          onPrimary={restartAct}
          onSecondary={save.victories.normal > 0 ? returnToTitle : undefined}
        />
      );
    }
    if (summary.phase === "victory") {
      return (
        <ResultScreen
          icon={<Trophy />}
          eyebrow={`${DIFFICULTIES[summary.mode].label} complete`}
          title="Library secured"
          copy="The Quarantine Array, Hard mode, and endless maintenance are now available."
          score={summary.score}
          primary="Start endless mode"
          onPrimary={startEndless}
          onSecondary={returnToTitle}
        />
      );
    }
    if (paused) {
      return (
        <PauseScreen
          onResume={togglePause}
          onRestart={restartAct}
          onTitle={save.victories.normal > 0 ? returnToTitle : undefined}
          settings={save.settings}
          onChangeSettings={changeSettings}
        />
      );
    }
    return null;
  })();

  return (
    <section
      className={["arcade-page", className].filter(Boolean).join(" ")}
      aria-labelledby="arcade-title"
    >
      <audio ref={musicElementARef} loop preload="none" />
      <audio ref={musicElementBRef} loop preload="none" />
      <header className="arcade-heading">
        <div>
          <div className="arcade-kicker">
            <Crosshair /> Classified shelf maintenance
          </div>
          <h1 id="arcade-title">Archive Defender</h1>
        </div>
        <div className="arcade-heading-actions">
          {isLocalTestHost() && (
            <label className="arcade-level-selector">
              <span>Local test level</span>
              <select
                aria-label="Local test level"
                value={testLevelId(summary)}
                onChange={(event) => selectTestLevel(event.target.value)}
              >
                {ACTS.map((candidateAct, actIndex) => (
                  <optgroup
                    key={candidateAct.id}
                    label={`Act ${actIndex + 1} — ${candidateAct.name}`}
                  >
                    {TEST_LEVELS.filter((level) => level.actIndex === actIndex).map((level) => (
                      <option key={level.id} value={level.id}>{level.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
          )}
          {onExit && (
            <button type="button" className="arcade-button arcade-button-ghost" onClick={onExit}>
              <ArrowLeft /> {exitLabel}
            </button>
          )}
        </div>
      </header>

      <div className="arcade-hud" aria-live="polite">
        <div className="arcade-hud-stat">
          <small>Reclaimed</small>
          <strong>{summary.score.toLocaleString()} GB</strong>
        </div>
        <div className="arcade-hud-stat">
          <small>Best · {DIFFICULTIES[summary.mode].label}</small>
          <strong>{bestScore.toLocaleString()}</strong>
        </div>
        <div
          className={`arcade-hud-stat arcade-combo ${
            summary.comboMultiplier > 1 ? "is-active" : ""
          }`}
        >
          <small>
            {summary.comboCount > 1 ? `${summary.comboCount} deletion chain` : "Combo"}
          </small>
          <strong>×{summary.comboMultiplier}</strong>
        </div>
        <div className="arcade-hud-stat arcade-objective">
          <small>
            {summary.phase === "endless"
              ? "Endless"
              : `Act ${summary.actIndex + 1} · ${
                summary.phase === "boss"
                  ? "Boss"
                  : summary.phase === "miniboss"
                  ? "Miniboss"
                  : `Job ${summary.encounterIndex + 1}`
              }`}
          </small>
          <strong>
            {summary.objective || summary.banner || "Awaiting assignment"}
          </strong>
          <span>
            <i style={{ width: `${summary.actProgress * 100}%` }} />
          </span>
        </div>
        <div className="arcade-vitals">
          <span
            className="arcade-health"
            aria-label={`${summary.health} integrity remaining`}
          >
            {Array.from({ length: summary.maxHealth }, (_, index) => (
              <Heart
                key={index}
                className={index < summary.health ? "is-full" : ""}
              />
            ))}
          </span>
          {summary.shield > 0 && (
            <span className="arcade-shield" title="Snapshot shield">
              <Shield /> {summary.shield}
            </span>
          )}
          {summary.powerups.length > 0 && (
            <span className="arcade-powerups">
              {summary.powerups.map((powerup) => (
                <i key={powerup.label}>
                  {powerup.label}
                  {powerup.remaining >= 0 ? ` ${Math.ceil(powerup.remaining)}s` : ""}
                </i>
              ))}
            </span>
          )}
        </div>
      </div>

      <div className={`arcade-cabinet arcade-act-${summary.actIndex + 1}`}>
        <canvas
          ref={canvasRef}
          className="arcade-canvas"
          aria-label="Archive Defender game area"
        />
        {active && !paused && (
          <>
            {summary.phase !== "boss" && summary.phase !== "miniboss" && (
              <div className="arcade-mission-chip">
                <span>
                  {summary.phase === "reward" ? "Select maintenance patch" : encounter?.name}
                </span>
                <small>
                  {summary.phase === "reward"
                    ? "Shoot one patch to install it and continue."
                    : encounter?.briefing}
                </small>
              </div>
            )}
            <div className="arcade-combat-indicators">
              <div
                className={`arcade-magazine-indicator ${
                  summary.reloadFor > 0 ? "is-reloading" : ""
                }`}
              >
                <span>
                  <small>
                    {summary.reloadFor > 0 ? "Reloading" : summary.magazineLabel}
                  </small>
                  <strong>
                    {summary.reloadFor > 0
                      ? `${summary.reloadFor.toFixed(1)}s`
                      : `${summary.ammo}/${summary.magazineSize}`}
                  </strong>
                </span>
              </div>
              <div
                className={`arcade-secondary-indicator ${
                  summary.secondaryCooldown === 0 ? "is-ready" : ""
                }`}
              >
                <kbd>Space</kbd>
                <span>
                  <small>Deep Scan</small>
                  <strong>
                    {summary.secondaryCooldown === 0
                      ? "Ready"
                      : `${summary.secondaryCooldown.toFixed(1)}s`}
                  </strong>
                </span>
              </div>
            </div>
            <button
              type="button"
              className="arcade-touch-secondary"
              onPointerDown={(event) => {
                event.preventDefault();
                inputRef.current?.queueSecondary();
              }}
              aria-label="Deep Scan Beam"
            >
              <Crosshair />
            </button>
            <button
              type="button"
              className="arcade-touch-dash"
              onPointerDown={(event) => {
                event.preventDefault();
                inputRef.current?.queueDash();
              }}
              aria-label="Dash"
            >
              <Zap />
            </button>
          </>
        )}
        {overlay && <div className="arcade-overlay">{overlay}</div>}
      </div>

      <footer className="arcade-controls">
        <span>
          <kbd>WASD</kbd> Move
        </span>
        <span>
          <kbd>Mouse</kbd> Aim / fire
        </span>
        <span>
          <kbd>Space</kbd> Deep Scan
        </span>
        <span>
          <kbd>R</kbd> Reload
        </span>
        <span>
          <kbd>Shift</kbd> Dash
        </span>
        <span className="arcade-loadout">
          <Gauge /> {weapon.name}
        </span>
        <span className="arcade-footer-actions">
          <button
            type="button"
            className="arcade-button arcade-button-ghost arcade-button-compact"
            onClick={() => changeSettings({ musicEnabled: !save.settings.musicEnabled })}
          >
            {save.settings.musicEnabled ? <Volume2 /> : <VolumeX />}
            Music
          </button>
          <button
            type="button"
            className="arcade-button arcade-button-ghost arcade-button-compact"
            onClick={togglePause}
            disabled={!active}
          >
            {paused ? <Play /> : <Pause />}
            {paused ? "Resume" : "Pause"}
          </button>
        </span>
      </footer>
    </section>
  );
}

function testLevelId(summary: GameSummary) {
  if (summary.phase === "miniboss") return `${summary.actIndex}:miniboss`;
  if (
    summary.phase === "boss" ||
    summary.phase === "actComplete" ||
    summary.phase === "victory"
  ) {
    return `${summary.actIndex}:boss`;
  }
  return `${summary.actIndex}:encounter:${summary.encounterIndex}`;
}
