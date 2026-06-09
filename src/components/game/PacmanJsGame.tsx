import { useCallback, useEffect, useRef } from 'react';
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
}

interface PacmanGameOverDetail {
  score: number;
  highScore?: number | string;
  level?: number;
}

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

export function PacmanJsGame({ onGameOver, allTimeHighScore, dailyHighScore, allTimeEntry, dailyEntry }: PacmanJsGameProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const coordinatorRef = useRef<PacmanCoordinator | null>(null);
  const allTimeHighScoreRef = useRef(allTimeHighScore);

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

    const handleGameOver = (event: Event) => {
      const detail = (event as CustomEvent<PacmanGameOverDetail>).detail;
      endGame({ score: Number(detail.score) || 0, level: Number(detail.level) || 1 });
    };
    window.addEventListener('satsman:pacman-game-over', handleGameOver);

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

  useEffect(() => {
    const display = document.getElementById('high-score-display');
    if (!display) return;

    const renderRelayHighScore = () => {
      display.innerText = String(allTimeHighScoreRef.current || '00');
    };
    const observer = new MutationObserver(renderRelayHighScore);

    renderRelayHighScore();
    observer.observe(display, { childList: true, characterData: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-black pt-16 text-white">
      <SatsManHeader />
      <div ref={hostRef} className="satsman-pacman-host">
        <div id="overflow-mask" className="overflow-mask">
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
            <div id="row-top" className="row top" style={{ gap: 'clamp(1rem, 4vw, 3rem)', justifyContent: 'center', padding: '0 1rem' }}>
              <div className="column" style={{ minWidth: '7rem', width: 'auto' }}>
                <div style={{ textAlign: 'center' }}>SCORE</div>
                <div id="points-display" style={{ marginRight: 0, textAlign: 'center' }} />
              </div>
              <div className="column" style={{ minWidth: '9rem', width: 'auto' }}>
                <div style={{ textAlign: 'center' }}>ALL TIME HIGH</div>
                <div id="high-score-display" style={{ marginRight: 0, textAlign: 'center' }}>{allTimeHighScore || '00'}</div>
                <HudScorer entry={allTimeEntry} />
              </div>
              <div className="column" style={{ minWidth: '7rem', width: 'auto' }}>
                <div style={{ textAlign: 'center' }}>DAILY HIGH</div>
                <div style={{ marginRight: 0, textAlign: 'center' }}>{dailyHighScore || '00'}</div>
                <HudScorer entry={dailyEntry} />
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
