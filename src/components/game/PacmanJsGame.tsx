import { useCallback, useEffect, useRef, useState } from 'react';
import { SatsManHeader } from '@/components/game/SatsManHeader';
import type { HighScoreEntry } from '@/hooks/useHighScores';
import { getHighScoreDisplayName, getHighScorePicture } from '@/hooks/useHighScores';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

declare global {
  interface Window {
    GameCoordinator?: new () => PacmanCoordinator;
    satsmanPacmanDestroyed?: boolean;
  }
}

interface PacmanCoordinator {
  destroy?: () => void;
  highScore?: number | string;
  highScoreDisplay?: HTMLElement | null;
  gameEngine?: PacmanGameEngine;
  pacman?: PacmanEntity;
  ghosts?: PacmanEntity[];
  activeTimers?: PacmanTimer[];
  allowPacmanMovement?: boolean;
  allowPause?: boolean;
  cutscene?: boolean;
  remainingDots?: number;
  level?: number;
  lives?: number;
  points?: number;
}

interface PacmanGameEngine {
  running?: boolean;
  started?: boolean;
  lastFrameTimeMs?: number;
  fps?: number;
}

interface PacmanEntity {
  moving?: boolean;
  paused?: boolean;
  display?: boolean;
  position?: {
    left?: number;
    top?: number;
    x?: number;
    y?: number;
  };
}

interface PacmanTimer {
  timerId?: number;
  remaining?: number;
  pausedBySystem?: boolean;
}

interface PacmanDiagnosticSnapshot {
  sampledAt: number;
  score: number;
  level: number;
  lives: number;
  remainingDots: number;
  engineRunning: boolean;
  engineStarted: boolean;
  pacmanMoving: boolean;
  allowPacmanMovement: boolean;
  allowPause: boolean;
  cutscene: boolean;
  activeTimers: number;
  fps: number;
  lastFrameTimeMs: number;
  pacmanPosition: string;
  ghostState: string;
}

interface PacmanWatchdogState {
  lastProgressKey: string;
  lastProgressAt: number;
  lastWarningAt: number;
}

const WATCHDOG_SAMPLE_MS = 1000;
const WATCHDOG_STALL_MS = 5000;

interface PacmanGameOverDetail {
  score: number;
  highScore?: number | string;
  level?: number;
}

type GamepadDirection = 'up' | 'down' | 'left' | 'right';

interface PacmanJsGameProps {
  onGameOver: (snapshot: { score: number; level: number }) => void;
  allTimeHighScore: number;
  dailyHighScore: number;
  allTimeEntry?: HighScoreEntry;
  dailyEntry?: HighScoreEntry;
}

function loadStylesheet(href: string): HTMLLinkElement {
  const existing = document.querySelector<HTMLLinkElement>(`link[href="${href}"]`);
  if (existing) return existing;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
  return link;
}

function loadScript(src: string): Promise<void> {
  if (window.GameCoordinator) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Pacman script failed to load.')), { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Pacman script failed to load.'));
    document.body.appendChild(script);
  });
}

function syncGameViewport(host: HTMLDivElement | null) {
  if (!host) return;
  const viewport = host.querySelector<HTMLElement>('#overflow-mask');
  const gameUi = host.querySelector<HTMLElement>('#game-ui');
  const maze = host.querySelector<HTMLElement>('#maze');
  if (!viewport || !gameUi || !maze) return;

  const gameWidth = Math.max(maze.offsetWidth, gameUi.offsetWidth, 1);
  const gameHeight = Math.max(gameUi.offsetHeight, 1);
  const viewportStyle = window.getComputedStyle(viewport);
  const viewportWidth = Math.max(
    viewport.clientWidth - parseFloat(viewportStyle.paddingLeft) - parseFloat(viewportStyle.paddingRight),
    1,
  );
  const viewportHeight = Math.max(
    viewport.clientHeight - parseFloat(viewportStyle.paddingTop) - parseFloat(viewportStyle.paddingBottom),
    1,
  );
  const scale = Math.min(viewportWidth / gameWidth, viewportHeight / gameHeight);
  host.style.setProperty('--satsman-game-width', `${gameWidth}px`);
  host.style.setProperty('--satsman-game-scale', String(Math.max(0.1, scale)));
}

function dispatchGamepadKey(keyCode: number) {
  window.dispatchEvent(new KeyboardEvent('keydown', { keyCode, which: keyCode, bubbles: true }));
}

function getGamepadDirection(gamepad: Gamepad): GamepadDirection | null {
  const horizontal = gamepad.axes[0] ?? 0;
  const vertical = gamepad.axes[1] ?? 0;
  const threshold = 0.45;

  if (gamepad.buttons[12]?.pressed || vertical < -threshold) return 'up';
  if (gamepad.buttons[13]?.pressed || vertical > threshold) return 'down';
  if (gamepad.buttons[14]?.pressed || horizontal < -threshold) return 'left';
  if (gamepad.buttons[15]?.pressed || horizontal > threshold) return 'right';
  return null;
}

function gamepadDirectionToKeyCode(direction: GamepadDirection): number {
  switch (direction) {
    case 'up':
      return 38;
    case 'down':
      return 40;
    case 'left':
      return 37;
    case 'right':
      return 39;
  }
}

function formatPosition(entity?: PacmanEntity): string {
  const position = entity?.position;
  if (!position) return 'unknown';
  const x = position.left ?? position.x ?? 0;
  const y = position.top ?? position.y ?? 0;
  return `${Math.round(x)},${Math.round(y)}`;
}

function createDiagnosticSnapshot(coordinator: PacmanCoordinator): PacmanDiagnosticSnapshot {
  const engine = coordinator.gameEngine;
  const ghosts = coordinator.ghosts ?? [];

  return {
    sampledAt: Date.now(),
    score: Number(coordinator.points ?? 0),
    level: Number(coordinator.level ?? 1),
    lives: Number(coordinator.lives ?? 0),
    remainingDots: Number(coordinator.remainingDots ?? 0),
    engineRunning: Boolean(engine?.running),
    engineStarted: Boolean(engine?.started),
    pacmanMoving: Boolean(coordinator.pacman?.moving),
    allowPacmanMovement: Boolean(coordinator.allowPacmanMovement),
    allowPause: Boolean(coordinator.allowPause),
    cutscene: Boolean(coordinator.cutscene),
    activeTimers: coordinator.activeTimers?.length ?? 0,
    fps: Math.round(Number(engine?.fps ?? 0)),
    lastFrameTimeMs: Math.round(Number(engine?.lastFrameTimeMs ?? 0)),
    pacmanPosition: formatPosition(coordinator.pacman),
    ghostState: ghosts.map((ghost) => `${formatPosition(ghost)}:${ghost.moving ? 'm' : 's'}:${ghost.paused ? 'p' : 'r'}`).join('|'),
  };
}

function getProgressKey(snapshot: PacmanDiagnosticSnapshot): string {
  return [
    snapshot.score,
    snapshot.remainingDots,
    snapshot.level,
    snapshot.lives,
    snapshot.pacmanPosition,
    snapshot.ghostState,
    snapshot.lastFrameTimeMs,
  ].join('|');
}

function isPotentiallyPlayable(snapshot: PacmanDiagnosticSnapshot): boolean {
  return snapshot.engineStarted
    && snapshot.engineRunning
    && snapshot.allowPause
    && !snapshot.cutscene
    && snapshot.remainingDots > 0
    && snapshot.lives >= 0;
}

export function PacmanJsGame({ onGameOver, allTimeHighScore, dailyHighScore, allTimeEntry, dailyEntry }: PacmanJsGameProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const coordinatorRef = useRef<PacmanCoordinator | null>(null);
  const allTimeHighScoreRef = useRef(allTimeHighScore);
  const watchdogRef = useRef<PacmanWatchdogState>({ lastProgressKey: '', lastProgressAt: 0, lastWarningAt: 0 });
  const [diagnosticSnapshot, setDiagnosticSnapshot] = useState<PacmanDiagnosticSnapshot | null>(null);
  const [suspectedFreeze, setSuspectedFreeze] = useState<PacmanDiagnosticSnapshot | null>(null);
  const gamepadStateRef = useRef<{ frameId: number; lastDirection: GamepadDirection | null; lastPausePressed: boolean }>({
    frameId: 0,
    lastDirection: null,
    lastPausePressed: false,
  });

  const endGame = useCallback((snapshot: { score: number; level: number }) => {
    window.satsmanPacmanDestroyed = true;
    if (hostRef.current) hostRef.current.style.display = 'none';
    coordinatorRef.current?.destroy?.();
    coordinatorRef.current = null;
    onGameOver(snapshot);
  }, [onGameOver]);

  useEffect(() => {
    let cancelled = false;
    loadStylesheet('/pacman/build/app.css');
    const host = hostRef.current;
    const handleResize = () => syncGameViewport(hostRef.current);
    const gamepadState = gamepadStateRef.current;
    watchdogRef.current = { lastProgressKey: '', lastProgressAt: Date.now(), lastWarningAt: 0 };
    window.addEventListener('resize', handleResize);

    const watchdogInterval = window.setInterval(() => {
      const coordinator = coordinatorRef.current;
      if (!coordinator) return;

      const snapshot = createDiagnosticSnapshot(coordinator);
      setDiagnosticSnapshot(snapshot);
      const progressKey = getProgressKey(snapshot);
      const watchdog = watchdogRef.current;

      if (progressKey !== watchdog.lastProgressKey || !isPotentiallyPlayable(snapshot)) {
        watchdog.lastProgressKey = progressKey;
        watchdog.lastProgressAt = snapshot.sampledAt;
        if (!isPotentiallyPlayable(snapshot)) setSuspectedFreeze(null);
        return;
      }

      const stalledMs = snapshot.sampledAt - watchdog.lastProgressAt;
      if (stalledMs >= WATCHDOG_STALL_MS && snapshot.sampledAt - watchdog.lastWarningAt >= WATCHDOG_STALL_MS) {
        watchdog.lastWarningAt = snapshot.sampledAt;
        setSuspectedFreeze(snapshot);
        console.warn('[Sats-Man] Pacman watchdog suspected a freeze', { stalledMs, snapshot });
      }
    }, WATCHDOG_SAMPLE_MS);

    const handleGameOver = (event: Event) => {
      const detail = (event as CustomEvent<PacmanGameOverDetail>).detail;
      endGame({ score: Number(detail.score) || 0, level: Number(detail.level) || 1 });
    };
    window.addEventListener('satsman:pacman-game-over', handleGameOver);

    const pollGamepads = () => {
      const gamepads = navigator.getGamepads?.() ?? [];
      const gamepad = Array.from(gamepads).find((pad) => pad?.connected);

      if (gamepad) {
        const direction = getGamepadDirection(gamepad);
        if (direction && direction !== gamepadState.lastDirection) {
          dispatchGamepadKey(gamepadDirectionToKeyCode(direction));
        }
        gamepadState.lastDirection = direction;

        const pausePressed = Boolean(gamepad.buttons[9]?.pressed || gamepad.buttons[8]?.pressed);
        if (pausePressed && !gamepadState.lastPausePressed) {
          dispatchGamepadKey(27);
        }
        gamepadState.lastPausePressed = pausePressed;
      } else {
        gamepadState.lastDirection = null;
        gamepadState.lastPausePressed = false;
      }

      gamepadState.frameId = window.requestAnimationFrame(pollGamepads);
    };

    gamepadState.frameId = window.requestAnimationFrame(pollGamepads);

    loadScript('/pacman/build/app.js')
      .then(() => {
        if (cancelled || !window.GameCoordinator) return;
        window.satsmanPacmanDestroyed = false;
        if (allTimeHighScoreRef.current > 0) {
          localStorage.setItem('highScore', String(allTimeHighScoreRef.current));
        }
        coordinatorRef.current = new window.GameCoordinator();

        window.setTimeout(() => {
          if (cancelled) return;
          const startButton = document.getElementById('game-start') as HTMLButtonElement | null;
          if (startButton && !startButton.disabled) {
            startButton.click();
            window.setTimeout(() => syncGameViewport(hostRef.current), 0);
          }
        }, 0);
      })
      .catch((error: unknown) => {
        console.error(error);
      });

    return () => {
      cancelled = true;
      window.satsmanPacmanDestroyed = true;
      window.removeEventListener('satsman:pacman-game-over', handleGameOver);
      window.removeEventListener('resize', handleResize);
      window.clearInterval(watchdogInterval);
      window.cancelAnimationFrame(gamepadState.frameId);
      coordinatorRef.current?.destroy?.();
      coordinatorRef.current = null;
      const audioElements = host?.querySelectorAll('audio');
      audioElements?.forEach((audio) => audio.pause());
    };
  }, [endGame]);

  useEffect(() => {
    allTimeHighScoreRef.current = allTimeHighScore;
    if (allTimeHighScore > 0) {
      localStorage.setItem('highScore', String(allTimeHighScore));
    }

    const coordinator = coordinatorRef.current;
    if (coordinator && allTimeHighScore > Number(coordinator.highScore || 0)) {
      coordinator.highScore = allTimeHighScore;
    }

    const display = document.getElementById('high-score-display');
    if (display && allTimeHighScore > 0) {
      display.innerText = String(allTimeHighScore);
    }
  }, [allTimeHighScore]);

  return (
    <div className="min-h-screen bg-black pt-20 text-white">
      <SatsManHeader />
      <div ref={hostRef} className="satsman-pacman-host">
        <div id="overflow-mask" className="overflow-mask">
          {diagnosticSnapshot && (
            <div className="pointer-events-none absolute bottom-3 left-3 z-[4] max-w-[18rem] rounded-lg border border-cyan-300/50 bg-black/85 p-2 font-mono text-[0.55rem] leading-tight text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.22)] sm:text-[0.65rem]">
              <div className="font-black uppercase tracking-widest text-cyan-300">Diagnostics</div>
              <div>FPS {diagnosticSnapshot.fps} | timers {diagnosticSnapshot.activeTimers} | dots {diagnosticSnapshot.remainingDots}</div>
              <div>run {diagnosticSnapshot.engineRunning ? 'yes' : 'no'} | move {diagnosticSnapshot.pacmanMoving ? 'yes' : 'no'} | cutscene {diagnosticSnapshot.cutscene ? 'yes' : 'no'}</div>
              {suspectedFreeze && <div className="mt-1 text-yellow-300">Watchdog: possible freeze logged</div>}
            </div>
          )}
          <div className="pointer-events-none absolute left-0 right-0 top-3 z-[3] px-3 text-center text-[0.55rem] sm:top-4 sm:text-[0.65rem]">
            <div className="mx-auto grid max-w-3xl grid-cols-3 gap-2 rounded-xl border-2 border-blue-700 bg-black/80 p-2 shadow-[0_0_28px_rgba(37,99,235,0.26)] backdrop-blur-sm">
              <HudScoreBlock label="Score" valueId="points-display" />
              <HudScoreBlock label="All Time High" value={allTimeHighScore} entry={allTimeEntry} />
              <HudScoreBlock label="Daily High" value={dailyHighScore} entry={dailyEntry} />
            </div>
          </div>
          <div id="fps-display" className="fps-display" />
          <div id="preload-div" className="preload-div" />

          <div id="main-menu-container" className="main-menu-container">
            <div className="mt-[18vh] text-center text-5xl font-black uppercase tracking-widest text-yellow-300 drop-shadow-[0_0_16px_rgba(250,204,21,0.7)] sm:text-7xl">
              Sats-Man
            </div>
            <button id="game-start" className="game-start" type="button">PLAY</button>
          </div>

          <div className="header-buttons">
            <span aria-hidden="true" />
            <span>
              <button type="button" aria-label="Pause game" className="satsman-icon-button">
                <span id="pause-button" className="material-icons satsman-control-icon satsman-pause-icon" />
              </button>
              <button type="button" aria-label="Toggle sound" className="satsman-icon-button">
                <span id="sound-button" className="material-icons satsman-control-icon satsman-volume-on-icon" />
              </button>
              <button type="button" aria-label="End game" className="satsman-icon-button" onClick={() => endGame({ score: 0, level: 1 })}>
                <span className="material-icons satsman-control-icon satsman-stop-icon" />
              </button>
            </span>
          </div>

          <div id="paused-text" className="paused-text">PAUSED</div>

          <div id="game-ui" className="game-ui">
            <div id="row-top" className="row top invisible h-0 overflow-hidden">
              <div className="column _25">
                <div>Score</div>
                <div id="points-display-shadow" />
              </div>
              <div className="column _50">
                <div>High Score</div>
                <div id="high-score-display" />
              </div>
            </div>

            <div id="maze" className="maze">
              <img id="maze-img" className="maze-img" src="/pacman/app/style/graphics/spriteSheets/maze/maze_blue.svg" alt="Maze" />
              <div id="maze-cover" className="maze-cover" />
              <div id="dot-container" />
              <p id="pacman" className="pacman" />
              <p id="pacman-arrow" className="pacman" />
              <p id="clyde" className="ghost" />
              <p id="inky" className="ghost" />
              <p id="pinky" className="ghost" />
              <p id="blinky" className="ghost" />
            </div>

            <div id="bottom-row" className="row bottom">
              <div id="extra-lives" className="extra-lives" />
              <div id="fruit-display" className="fruit-display" />
            </div>
          </div>

          <div id="left-cover" className="loading-cover left" />
          <div id="right-cover" className="loading-cover right" />
          <div id="loading-container" className="loading-container">
            <div id="loading-pacman" className="loading-pacman" />
            <div id="loading-dot-mask" className="loading-dot-mask" />
            {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95].map((value) => (
              <div key={value} className={`loading-dot _${value}`} />
            ))}
          </div>

          <div id="error-message" className="error-message">
            <div className="header"><div>OOPS!</div><div className="error-pacman" /></div>
            <div className="body">We were unable to load the images/sounds needed to play the game.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HudScoreBlock({ label, value, valueId, entry }: { label: string; value?: number; valueId?: string; entry?: HighScoreEntry }) {
  return (
    <div className="min-w-0 rounded-lg border border-cyan-300/40 bg-cyan-300/10 px-2 py-1">
      <div className="truncate font-black uppercase tracking-widest text-cyan-300">{label}</div>
      <div id={valueId} className="mt-1 text-sm font-black text-white sm:text-base">
        {typeof value === 'number' ? (value || 0).toLocaleString() : '00'}
      </div>
      {entry && <HudScorer entry={entry} />}
    </div>
  );
}

function HudScorer({ entry }: { entry?: HighScoreEntry }) {
  const name = getHighScoreDisplayName(entry);
  const picture = getHighScorePicture(entry);

  return (
    <div className="mt-1 flex min-w-0 items-center justify-center gap-1 text-[0.55rem] text-cyan-100">
      <Avatar size="sm" className="size-5 border border-cyan-300 bg-black">
        <AvatarImage src={picture} alt={name} />
        <AvatarFallback className="bg-black text-[0.5rem] font-black text-cyan-200">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="max-w-24 truncate">{name}</span>
    </div>
  );
}
