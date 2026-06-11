export type SatsManDirection = 'up' | 'down' | 'left' | 'right';

export type SatsManCell = 'wall' | 'empty' | 'dot' | 'power' | 'door';

export interface SatsManVector {
  x: number;
  y: number;
}

export interface SatsManActor {
  id: string;
  position: SatsManVector;
  spawn: SatsManVector;
  direction: SatsManDirection;
  nextDirection: SatsManDirection;
  speedTilesPerSecond: number;
}

export interface SatsManGhost extends SatsManActor {
  mode: 'chase' | 'frightened' | 'eyes';
  color: string;
}

export interface SatsManSnapshot {
  score: number;
  level: number;
  lives: number;
  remainingDots: number;
  state: 'ready' | 'playing' | 'lifeLost' | 'levelClear' | 'gameOver';
  elapsedMs: number;
  player: SatsManActor;
  ghosts: SatsManGhost[];
  grid: SatsManCell[][];
}

export interface SatsManEngineOptions {
  level?: number;
  lives?: number;
}

export const SATS_MAN_MAZE = [
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  'XooooooooooooXXooooooooooooX',
  'XoXXXXoXXXXXoXXoXXXXXoXXXXoX',
  'XOXXXXoXXXXXoXXoXXXXXoXXXXOX',
  'XoXXXXoXXXXXoXXoXXXXXoXXXXoX',
  'XooooooooooooooooooooooooooX',
  'XoXXXXoXXoXXXXXXXXoXXoXXXXoX',
  'XoXXXXoXXoXXXXXXXXoXXoXXXXoX',
  'XooooooXXooooXXooooXXooooooX',
  'XXXXXXoXXXXX XX XXXXXoXXXXXX',
  'XXXXXXoXXXXX XX XXXXXoXXXXXX',
  'XXXXXXoXX          XXoXXXXXX',
  'XXXXXXoXX XXXXXXXX XXoXXXXXX',
  'XXXXXXoXX X      X XXoXXXXXX',
  '      o   X      X   o      ',
  'XXXXXXoXX X      X XXoXXXXXX',
  'XXXXXXoXX XXXXXXXX XXoXXXXXX',
  'XXXXXXoXX          XXoXXXXXX',
  'XXXXXXoXX XXXXXXXX XXoXXXXXX',
  'XXXXXXoXX XXXXXXXX XXoXXXXXX',
  'XooooooooooooXXooooooooooooX',
  'XoXXXXoXXXXXoXXoXXXXXoXXXXoX',
  'XoXXXXoXXXXXoXXoXXXXXoXXXXoX',
  'XOooXXooooooo  oooooooXXooOX',
  'XXXoXXoXXoXXXXXXXXoXXoXXoXXX',
  'XXXoXXoXXoXXXXXXXXoXXoXXoXXX',
  'XooooooXXooooXXooooXXooooooX',
  'XoXXXXXXXXXXoXXoXXXXXXXXXXoX',
  'XoXXXXXXXXXXoXXoXXXXXXXXXXoX',
  'XooooooooooooooooooooooooooX',
  'XXXXXXXXXXXXXXXXXXXXXXXXXXXX',
] as const;

export const SATS_MAN_DIRECTIONS: Record<SatsManDirection, SatsManVector> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const GHOST_SPAWNS: Array<Pick<SatsManGhost, 'id' | 'position' | 'direction' | 'color'>> = [
  { id: 'blinky', position: { x: 13.5, y: 11 }, direction: 'left', color: '#ff334f' },
  { id: 'pinky', position: { x: 13.5, y: 14 }, direction: 'down', color: '#ff9bd1' },
  { id: 'inky', position: { x: 11.5, y: 14 }, direction: 'up', color: '#36d9ff' },
  { id: 'clyde', position: { x: 15.5, y: 14 }, direction: 'up', color: '#ff9b3d' },
];

const PLAYER_SPAWN: SatsManVector = { x: 13.5, y: 23 };
const PLAYER_SPEED = 7.5;
const GHOST_SPEED = 6.8;
const POWER_DURATION_MS = 7000;

export function createSatsManGrid(): SatsManCell[][] {
  return SATS_MAN_MAZE.map((row) => row.split('').map((char): SatsManCell => {
    if (char === 'X') return 'wall';
    if (char === 'o') return 'dot';
    if (char === 'O') return 'power';
    return 'empty';
  }));
}

export function countSatsManDots(grid: SatsManCell[][]): number {
  return grid.reduce((total, row) => total + row.filter((cell) => cell === 'dot' || cell === 'power').length, 0);
}

export function createSatsManEngine(options: SatsManEngineOptions = {}): SatsManEngine {
  return new SatsManEngine(options);
}

export class SatsManEngine {
  private grid = createSatsManGrid();
  private score = 0;
  private level: number;
  private lives: number;
  private state: SatsManSnapshot['state'] = 'ready';
  private elapsedMs = 0;
  private frightenedUntilMs = 0;
  private player = this.createPlayer();
  private ghosts = this.createGhosts();

  constructor(options: SatsManEngineOptions = {}) {
    this.level = options.level ?? 1;
    this.lives = options.lives ?? 2;
  }

  start(): void {
    if (this.state === 'ready') this.state = 'playing';
  }

  setDirection(direction: SatsManDirection): void {
    this.player.nextDirection = direction;
  }

  step(deltaMs: number): SatsManSnapshot {
    if (this.state !== 'playing') return this.getSnapshot();

    const boundedDelta = Math.max(0, Math.min(deltaMs, 250));
    this.elapsedMs += boundedDelta;
    this.movePlayer(boundedDelta);
    this.collectCurrentCell();
    this.moveGhosts(boundedDelta);
    this.resolveCollisions();

    if (countSatsManDots(this.grid) === 0) {
      this.advanceLevel();
    }

    return this.getSnapshot();
  }

  getSnapshot(): SatsManSnapshot {
    return {
      score: this.score,
      level: this.level,
      lives: this.lives,
      remainingDots: countSatsManDots(this.grid),
      state: this.state,
      elapsedMs: this.elapsedMs,
      player: structuredClone(this.player),
      ghosts: structuredClone(this.ghosts),
      grid: this.grid.map((row) => [...row]),
    };
  }

  private createPlayer(): SatsManActor {
    return {
      id: 'pacman',
      position: { ...PLAYER_SPAWN },
      spawn: { ...PLAYER_SPAWN },
      direction: 'left',
      nextDirection: 'left',
      speedTilesPerSecond: PLAYER_SPEED,
    };
  }

  private createGhosts(): SatsManGhost[] {
    return GHOST_SPAWNS.map((ghost) => ({
      ...ghost,
      position: { ...ghost.position },
      spawn: { ...ghost.position },
      nextDirection: ghost.direction,
      speedTilesPerSecond: GHOST_SPEED,
      mode: 'chase',
    }));
  }

  private movePlayer(deltaMs: number): void {
    if (this.canMove(this.player.position, this.player.nextDirection)) {
      this.player.direction = this.player.nextDirection;
    }
    this.moveActor(this.player, deltaMs);
  }

  private moveGhosts(deltaMs: number): void {
    this.ghosts = this.ghosts.map((ghost) => {
      const nextDirection = this.chooseGhostDirection(ghost);
      const nextGhost = { ...ghost, direction: nextDirection, nextDirection };
      this.moveActor(nextGhost, deltaMs);
      return nextGhost;
    });
  }

  private moveActor(actor: SatsManActor, deltaMs: number): void {
    if (!this.canMove(actor.position, actor.direction)) return;
    const delta = SATS_MAN_DIRECTIONS[actor.direction];
    const distance = actor.speedTilesPerSecond * (deltaMs / 1000);
    actor.position = this.wrapPosition({
      x: actor.position.x + delta.x * distance,
      y: actor.position.y + delta.y * distance,
    });
  }

  private canMove(position: SatsManVector, direction: SatsManDirection): boolean {
    const delta = SATS_MAN_DIRECTIONS[direction];
    const next = this.wrapPosition({ x: position.x + delta.x * 0.55, y: position.y + delta.y * 0.55 });
    const cell = this.cellAt(next);
    return cell !== 'wall' && cell !== 'door';
  }

  private collectCurrentCell(): void {
    const cellPosition = this.gridPosition(this.player.position);
    const cell = this.grid[cellPosition.y]?.[cellPosition.x];
    if (cell !== 'dot' && cell !== 'power') return;

    this.grid[cellPosition.y][cellPosition.x] = 'empty';
    this.score += cell === 'power' ? 50 : 10;
    if (cell === 'power') {
      this.frightenedUntilMs = this.elapsedMs + POWER_DURATION_MS;
      this.ghosts = this.ghosts.map((ghost) => ({ ...ghost, mode: ghost.mode === 'eyes' ? 'eyes' : 'frightened' }));
    }
  }

  private resolveCollisions(): void {
    const collidedGhost = this.ghosts.find((ghost) => this.distance(ghost.position, this.player.position) < 0.75);
    if (!collidedGhost) return;

    if (this.elapsedMs < this.frightenedUntilMs && collidedGhost.mode !== 'eyes') {
      this.score += 200;
      this.ghosts = this.ghosts.map((ghost) => (ghost.id === collidedGhost.id ? { ...ghost, position: { ...ghost.spawn }, mode: 'eyes' } : ghost));
      return;
    }

    this.lives -= 1;
    if (this.lives < 0) {
      this.state = 'gameOver';
      return;
    }

    this.state = 'lifeLost';
    this.resetActors();
    this.state = 'playing';
  }

  private advanceLevel(): void {
    this.level += 1;
    this.state = 'levelClear';
    this.grid = createSatsManGrid();
    this.frightenedUntilMs = 0;
    this.resetActors();
    this.state = 'playing';
  }

  private resetActors(): void {
    this.player = this.createPlayer();
    this.ghosts = this.createGhosts();
  }

  private chooseGhostDirection(ghost: SatsManGhost): SatsManDirection {
    const frightened = this.elapsedMs < this.frightenedUntilMs && ghost.mode === 'frightened';
    const options = (Object.keys(SATS_MAN_DIRECTIONS) as SatsManDirection[]).filter((direction) => this.canMove(ghost.position, direction));
    const ranked = options.sort((a, b) => {
      const aDistance = this.distance(this.nextPosition(ghost.position, a), this.player.position);
      const bDistance = this.distance(this.nextPosition(ghost.position, b), this.player.position);
      return frightened ? bDistance - aDistance : aDistance - bDistance;
    });
    return ranked[0] ?? ghost.direction;
  }

  private nextPosition(position: SatsManVector, direction: SatsManDirection): SatsManVector {
    const delta = SATS_MAN_DIRECTIONS[direction];
    return this.wrapPosition({ x: position.x + delta.x, y: position.y + delta.y });
  }

  private cellAt(position: SatsManVector): SatsManCell {
    const gridPosition = this.gridPosition(position);
    return this.grid[gridPosition.y]?.[gridPosition.x] ?? 'wall';
  }

  private gridPosition(position: SatsManVector): SatsManVector {
    return {
      x: Math.max(0, Math.min(this.grid[0].length - 1, Math.round(position.x))),
      y: Math.max(0, Math.min(this.grid.length - 1, Math.round(position.y))),
    };
  }

  private wrapPosition(position: SatsManVector): SatsManVector {
    const width = this.grid[0].length;
    if (position.x < 0) return { ...position, x: width - 1 };
    if (position.x >= width) return { ...position, x: 0 };
    return position;
  }

  private distance(a: SatsManVector, b: SatsManVector): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
