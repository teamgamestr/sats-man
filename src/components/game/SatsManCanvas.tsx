import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SatsManHeader } from '@/components/game/SatsManHeader';

const MAZE = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#O####.#####.##.#####.####O#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##          ##.#     ',
  '######.## ###--### ##.######',
  '      .   #      #   .      ',
  '######.## ######## ##.######',
  '     #.##          ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#O..##................##..O#',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];

type Direction = 'up' | 'down' | 'left' | 'right';
type Cell = 'wall' | 'empty' | 'dot' | 'power';

interface Actor {
  x: number;
  y: number;
  direction: Direction;
}

interface GameSnapshot {
  score: number;
  level: number;
  lives: number;
  remainingDots: number;
}

interface SatsManCanvasProps {
  onGameOver: (snapshot: GameSnapshot) => void;
}

const TILE = 20;
const WIDTH = MAZE[0].length;
const HEIGHT = MAZE.length;
const INITIAL_DOTS = countDots(createGrid());

const directions: Record<Direction, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function createGrid(): Cell[][] {
  return MAZE.map((row) => row.split('').map((char): Cell => {
    if (char === '#') return 'wall';
    if (char === '.') return 'dot';
    if (char === 'O') return 'power';
    return 'empty';
  }));
}

function countDots(grid: Cell[][]): number {
  return grid.flat().filter((cell) => cell === 'dot' || cell === 'power').length;
}

function canMove(grid: Cell[][], x: number, y: number): boolean {
  if (x < 0 || x >= WIDTH) return true;
  if (y < 0 || y >= HEIGHT) return false;
  return grid[y]?.[x] !== 'wall';
}

function wrapX(x: number): number {
  if (x < 0) return WIDTH - 1;
  if (x >= WIDTH) return 0;
  return x;
}

function manhattan(a: Actor, b: Actor): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function chooseGhostDirection(grid: Cell[][], ghost: Actor, player: Actor, frightenedUntil: number): Direction {
  const options = (Object.keys(directions) as Direction[]).filter((direction) => {
    const delta = directions[direction];
    return canMove(grid, wrapX(ghost.x + delta.x), ghost.y + delta.y);
  });
  const frightened = Date.now() < frightenedUntil;
  const sorted = options.sort((a, b) => {
    const da = directions[a];
    const db = directions[b];
    const actorA = { ...ghost, x: wrapX(ghost.x + da.x), y: ghost.y + da.y };
    const actorB = { ...ghost, x: wrapX(ghost.x + db.x), y: ghost.y + db.y };
    return frightened ? manhattan(actorB, player) - manhattan(actorA, player) : manhattan(actorA, player) - manhattan(actorB, player);
  });
  return sorted[0] ?? ghost.direction;
}

export function SatsManCanvas({ onGameOver }: SatsManCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef(createGrid());
  const playerRef = useRef<Actor>({ x: 13, y: 16, direction: 'left' });
  const desiredDirectionRef = useRef<Direction>('left');
  const ghostsRef = useRef<Actor[]>([
    { x: 13, y: 10, direction: 'left' },
    { x: 14, y: 10, direction: 'right' },
    { x: 12, y: 10, direction: 'up' },
    { x: 15, y: 10, direction: 'down' },
  ]);
  const [snapshot, setSnapshot] = useState<GameSnapshot>({ score: 0, level: 1, lives: 3, remainingDots: INITIAL_DOTS });
  const snapshotRef = useRef(snapshot);
  const frightenedUntilRef = useRef(0);
  const tickRef = useRef(0);
  const gameOverRef = useRef(false);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  const resetPositions = useCallback(() => {
    playerRef.current = { x: 13, y: 16, direction: 'left' };
    desiredDirectionRef.current = 'left';
    ghostsRef.current = [
      { x: 13, y: 10, direction: 'left' },
      { x: 14, y: 10, direction: 'right' },
      { x: 12, y: 10, direction: 'up' },
      { x: 15, y: 10, direction: 'down' },
    ];
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    context.fillStyle = '#03040a';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const grid = gridRef.current;

    for (let y = 0; y < HEIGHT; y += 1) {
      for (let x = 0; x < WIDTH; x += 1) {
        const cell = grid[y][x];
        if (cell === 'wall') {
          context.fillStyle = '#172dff';
          context.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
        } else if (cell === 'dot') {
          context.fillStyle = '#f8dca1';
          context.beginPath();
          context.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 2, 0, Math.PI * 2);
          context.fill();
        } else if (cell === 'power') {
          context.fillStyle = '#fff7d1';
          context.beginPath();
          context.arc(x * TILE + TILE / 2, y * TILE + TILE / 2, 6, 0, Math.PI * 2);
          context.fill();
        }
      }
    }

    const frightened = Date.now() < frightenedUntilRef.current;
    ghostsRef.current.forEach((ghost, index) => {
      context.fillStyle = frightened ? '#52a8ff' : ['#ff334f', '#ff9bd1', '#36d9ff', '#ff9b3d'][index] ?? '#fff';
      context.beginPath();
      context.arc(ghost.x * TILE + TILE / 2, ghost.y * TILE + TILE / 2, TILE * 0.42, Math.PI, 0);
      context.lineTo(ghost.x * TILE + TILE * 0.92, ghost.y * TILE + TILE * 0.9);
      context.lineTo(ghost.x * TILE + TILE * 0.08, ghost.y * TILE + TILE * 0.9);
      context.closePath();
      context.fill();
    });

    const player = playerRef.current;
    const mouth = Math.sin(Date.now() / 80) * 0.18 + 0.28;
    const angleMap: Record<Direction, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: Math.PI * 1.5 };
    const angle = angleMap[player.direction];
    context.fillStyle = '#ffd21f';
    context.beginPath();
    context.moveTo(player.x * TILE + TILE / 2, player.y * TILE + TILE / 2);
    context.arc(player.x * TILE + TILE / 2, player.y * TILE + TILE / 2, TILE * 0.46, angle + mouth, angle - mouth + Math.PI * 2);
    context.closePath();
    context.fill();
  }, []);

  const endGame = useCallback(() => {
    if (gameOverRef.current) return;
    gameOverRef.current = true;
    onGameOver(snapshotRef.current);
  }, [onGameOver]);

  const step = useCallback(() => {
    if (gameOverRef.current) return;
    tickRef.current += 1;
    const grid = gridRef.current;
    const player = playerRef.current;
    const desired = directions[desiredDirectionRef.current];
    if (canMove(grid, wrapX(player.x + desired.x), player.y + desired.y)) {
      player.direction = desiredDirectionRef.current;
    }
    const delta = directions[player.direction];
    if (canMove(grid, wrapX(player.x + delta.x), player.y + delta.y)) {
      player.x = wrapX(player.x + delta.x);
      player.y += delta.y;
    }

    const cell = grid[player.y]?.[player.x];
    if (cell === 'dot' || cell === 'power') {
      grid[player.y][player.x] = 'empty';
      const gained = cell === 'power' ? 50 : 10;
      if (cell === 'power') frightenedUntilRef.current = Date.now() + 7000;
      setSnapshot((prev) => ({ ...prev, score: prev.score + gained, remainingDots: prev.remainingDots - 1 }));
    }

    if (snapshotRef.current.remainingDots <= 1) {
      gridRef.current = createGrid();
      frightenedUntilRef.current = 0;
      resetPositions();
      setSnapshot((prev) => ({ ...prev, level: prev.level + 1, remainingDots: countDots(gridRef.current) }));
      return;
    }

    const ghostCadence = Math.max(1, 3 - Math.floor(snapshotRef.current.level / 3));
    if (tickRef.current % ghostCadence === 0) {
      ghostsRef.current = ghostsRef.current.map((ghost) => {
        const direction = chooseGhostDirection(grid, ghost, player, frightenedUntilRef.current);
        const ghostDelta = directions[direction];
        return { x: wrapX(ghost.x + ghostDelta.x), y: ghost.y + ghostDelta.y, direction };
      });
    }

    const collisionIndex = ghostsRef.current.findIndex((ghost) => ghost.x === player.x && ghost.y === player.y);
    if (collisionIndex >= 0) {
      if (Date.now() < frightenedUntilRef.current) {
        ghostsRef.current[collisionIndex] = { x: 13, y: 10, direction: 'left' };
        setSnapshot((prev) => ({ ...prev, score: prev.score + 200 }));
      } else if (snapshotRef.current.lives <= 1) {
        setSnapshot((prev) => ({ ...prev, lives: 0 }));
        endGame();
      } else {
        setSnapshot((prev) => ({ ...prev, lives: prev.lives - 1 }));
        resetPositions();
      }
    }
  }, [endGame, resetPositions]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const keyMap: Record<string, Direction | undefined> = {
        ArrowUp: 'up',
        KeyW: 'up',
        ArrowDown: 'down',
        KeyS: 'down',
        ArrowLeft: 'left',
        KeyA: 'left',
        ArrowRight: 'right',
        KeyD: 'right',
      };
      const next = keyMap[event.code];
      if (next) {
        event.preventDefault();
        desiredDirectionRef.current = next;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    const interval = window.setInterval(() => {
      step();
      draw();
    }, 125);
    draw();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.clearInterval(interval);
    };
  }, [draw, step]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-black p-4 pt-24 text-white">
      <SatsManHeader />
      <div className="grid w-full max-w-[560px] grid-cols-4 gap-2 rounded-xl border border-yellow-400/40 bg-zinc-950 p-3 text-center font-mono text-xs uppercase tracking-widest text-yellow-100">
        <div><div className="text-yellow-400">Score</div><div>{snapshot.score}</div></div>
        <div><div className="text-yellow-400">Level</div><div>{snapshot.level}</div></div>
        <div><div className="text-yellow-400">Lives</div><div>{snapshot.lives}</div></div>
        <div><div className="text-yellow-400">Dots</div><div>{snapshot.remainingDots}</div></div>
      </div>
      <canvas
        ref={canvasRef}
        width={WIDTH * TILE}
        height={HEIGHT * TILE}
        className="w-full max-w-[560px] rounded-lg border-4 border-blue-700 bg-black shadow-[0_0_40px_rgba(37,99,235,0.4)]"
        aria-label="Sats-Man game board"
      />
      <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-zinc-400">
        <span>Move with arrows or WASD.</span>
        <Button size="sm" variant="outline" onClick={endGame}>End Game</Button>
      </div>
    </div>
  );
}
