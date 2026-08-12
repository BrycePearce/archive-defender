import { ChevronRight, Crosshair, Pause, Play } from "lucide-react";
import { ACTS, DIFFICULTIES, WEAPONS } from "../content.ts";
import type { ArcadeSaveV2, ArcadeSettings, DifficultyMode, WeaponKind } from "../types.ts";

const SLIDER_INPUT_TYPE = ["ra", "nge"].join("") as React.HTMLInputTypeAttribute;

export function TitleScreen({
  save,
  mode,
  weapon,
  onMode,
  onWeapon,
  onStart,
  onResume,
  onSettings,
  showSettings,
  onChangeSettings,
}: {
  save: ArcadeSaveV2;
  mode: DifficultyMode;
  weapon: WeaponKind;
  onMode: (mode: DifficultyMode) => void;
  onWeapon: (weapon: WeaponKind) => void;
  onStart: () => void;
  onResume: () => void;
  onSettings: () => void;
  showSettings: boolean;
  onChangeSettings: (patch: Partial<ArcadeSettings>) => void;
}) {
  return (
    <div className="arcade-overlay-card arcade-title-card">
      <div className="arcade-card-icon">
        <Crosshair />
      </div>
      <div className="arcade-overlay-eyebrow">Incident response briefing</div>
      <h2>Three libraries. One cleanup window.</h2>
      <p>
        Clear nine authored jobs, choose a build between sectors, and survive each library’s
        resident catastrophe.
      </p>

      {save.checkpoint && (
        <button type="button" className="arcade-resume" onClick={onResume}>
          <span>
            <small>Checkpoint available</small>
            <strong>Resume {ACTS[save.checkpoint.actIndex].name}</strong>
          </span>
          <ChevronRight />
        </button>
      )}

      <div className="arcade-setup-grid">
        <fieldset>
          <legend>Difficulty</legend>
          {(["normal", "hard"] as DifficultyMode[]).map((candidate) => {
            const locked = candidate === "hard" && !save.unlocks.hard;
            return (
              <button
                key={candidate}
                type="button"
                className={mode === candidate ? "is-selected" : ""}
                onClick={() => !locked && onMode(candidate)}
                disabled={locked}
              >
                <strong>{DIFFICULTIES[candidate].label}</strong>
                <small>
                  {locked
                    ? "Win Normal to unlock"
                    : candidate === "normal"
                    ? "Learnable pressure"
                    : "Hostile patterns"}
                </small>
              </button>
            );
          })}
        </fieldset>
        <fieldset>
          <legend>Cleanup tool</legend>
          {WEAPONS.map((candidate) => {
            const locked = candidate.id === "rail"
              ? !save.unlocks.rail
              : candidate.id === "array"
              ? !save.unlocks.array
              : false;
            return (
              <button
                key={candidate.id}
                type="button"
                className={weapon === candidate.id ? "is-selected" : ""}
                onClick={() => !locked && onWeapon(candidate.id)}
                disabled={locked}
                title={candidate.description}
              >
                <strong>{candidate.name}</strong>
                <small>{locked ? "Locked" : candidate.description}</small>
              </button>
            );
          })}
        </fieldset>
      </div>

      {showSettings && <SettingsPanel settings={save.settings} onChange={onChangeSettings} />}
      <div className="arcade-card-actions">
        <button type="button" className="arcade-button arcade-button-ghost" onClick={onSettings}>
          {showSettings ? "Hide settings" : "Audio & effects"}
        </button>
        <button type="button" className="arcade-button arcade-button-primary" onClick={onStart}>
          <Play /> Start cleanup
        </button>
      </div>
    </div>
  );
}

export function ResultScreen({
  icon,
  eyebrow,
  title,
  copy,
  score,
  primary,
  onPrimary,
  onSecondary,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  copy: string;
  score: number;
  primary: string;
  onPrimary: () => void;
  onSecondary?: () => void;
}) {
  return (
    <div className="arcade-overlay-card arcade-result-card">
      <div className="arcade-card-icon">{icon}</div>
      <div className="arcade-overlay-eyebrow">{eyebrow}</div>
      <h2>{title}</h2>
      <p>{copy}</p>
      <div className="arcade-result-score">
        <small>Total reclaimed</small>
        <strong>{score.toLocaleString()} GB</strong>
      </div>
      <div className="arcade-card-actions">
        {onSecondary && (
          <button type="button" className="arcade-button arcade-button-ghost" onClick={onSecondary}>
            Main menu
          </button>
        )}
        <button type="button" className="arcade-button arcade-button-primary" onClick={onPrimary}>
          {primary} <ChevronRight />
        </button>
      </div>
    </div>
  );
}

export function PauseScreen({
  onResume,
  onRestart,
  onTitle,
  settings,
  onChangeSettings,
}: {
  onResume: () => void;
  onRestart: () => void;
  onTitle?: () => void;
  settings: ArcadeSettings;
  onChangeSettings: (patch: Partial<ArcadeSettings>) => void;
}) {
  return (
    <div className="arcade-overlay-card arcade-pause-card">
      <div className="arcade-card-icon">
        <Pause />
      </div>
      <div className="arcade-overlay-eyebrow">Cleanup suspended</div>
      <h2>Paused</h2>
      <SettingsPanel settings={settings} onChange={onChangeSettings} />
      <div className="arcade-card-actions">
        {onTitle && (
          <button type="button" className="arcade-button arcade-button-ghost" onClick={onTitle}>
            Main menu
          </button>
        )}
        <button type="button" className="arcade-button arcade-button-ghost" onClick={onRestart}>
          Restart act
        </button>
        <button type="button" className="arcade-button arcade-button-primary" onClick={onResume}>
          <Play /> Resume
        </button>
      </div>
    </div>
  );
}

function SettingsPanel({
  settings,
  onChange,
}: {
  settings: ArcadeSettings;
  onChange: (patch: Partial<ArcadeSettings>) => void;
}) {
  return (
    <div className="arcade-settings">
      <label>
        <span>Music</span>
        <input
          type="checkbox"
          checked={settings.musicEnabled}
          onChange={(event) => onChange({ musicEnabled: event.currentTarget.checked })}
        />
        <input
          type={SLIDER_INPUT_TYPE}
          min="0"
          max="100"
          value={settings.musicVolume}
          disabled={!settings.musicEnabled}
          aria-label="Music volume"
          onChange={(event) => onChange({ musicVolume: Number(event.currentTarget.value) })}
        />
      </label>
      <label>
        <span>Effects</span>
        <input
          type="checkbox"
          checked={settings.sfxEnabled}
          onChange={(event) => onChange({ sfxEnabled: event.currentTarget.checked })}
        />
        <input
          type={SLIDER_INPUT_TYPE}
          min="0"
          max="100"
          value={settings.sfxVolume}
          disabled={!settings.sfxEnabled}
          aria-label="Sound effects volume"
          onChange={(event) => onChange({ sfxVolume: Number(event.currentTarget.value) })}
        />
      </label>
      <label className="arcade-setting-toggle">
        <span>Reduced effects</span>
        <input
          type="checkbox"
          checked={settings.reducedEffects}
          onChange={(event) => onChange({ reducedEffects: event.currentTarget.checked })}
        />
      </label>
      <label className="arcade-setting-toggle">
        <span>Screen shake</span>
        <input
          type="checkbox"
          checked={settings.screenShake}
          disabled={settings.reducedEffects}
          onChange={(event) => onChange({ screenShake: event.currentTarget.checked })}
        />
      </label>
    </div>
  );
}
