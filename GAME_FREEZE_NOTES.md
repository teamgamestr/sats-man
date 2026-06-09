# Game Freeze Notes

## Context

Sats-Man currently wraps a patched vendored Pacman game from `public/pacman/build/app.js` via `src/components/game/PacmanJsGame.tsx`. The game sometimes appears to freeze mid-play.

## Likely Causes

- The vendored game mixes `requestAnimationFrame`, `setInterval`, and custom `Timer` objects.
- Several gameplay events intentionally pause movement: start countdown, death sequence, level clear, power pellet, and eating ghosts.
- If one of those timer callbacks fails, stalls, or runs after state has changed, flags like `pacman.moving`, `allowPacmanMovement`, `allowPause`, or ghost `paused` can remain stuck.
- Browser throttling from tab backgrounding, mobile lock screen, or OS interruption can pause `requestAnimationFrame` and delay timers, especially during cutscenes or power-up states.
- The patched `SoundManager` uses async fetch/decode paths. Audio failures should mostly affect sound, but async ambience transitions are another fragile area.
- Because the game is DOM-driven and vendored, React cannot directly observe or recover internal state except by destroying/restarting the coordinator.

## Suspicious Code Areas

- `public/pacman/build/app.js` `GameEngine`: `requestAnimationFrame` loop and pause/start transitions.
- `GameCoordinator.startGameplay()`: delayed transition from cutscene to movement.
- `GameCoordinator.deathSequence()`: nested timers before movement resumes.
- `GameCoordinator.advanceLevel()`: nested timers and entity reset.
- `GameCoordinator.eatGhost()`: temporary pause of Pacman, ghosts, and active timers.
- `Timer.pause()` / `Timer.resume()`: custom remaining-time bookkeeping.
- `SoundManager.setAmbience()`: async audio fetch/decode and `fetchingAmbience` guard.

## Recommended Next Steps

1. Add lightweight diagnostics before changing architecture.
2. Track `gameEngine.running`, `gameEngine.started`, `pacman.moving`, `allowPacmanMovement`, `allowPause`, `cutscene`, `activeTimers.length`, `remainingDots`, `level`, and last frame time.
3. Add a watchdog that detects no progress for several seconds while the game is not intentionally paused or in a cutscene.
4. On suspected freeze, log a state snapshot and offer a clean restart/end-game path.
5. Harden fragile vendored code with guards around timer callbacks, async audio failures, `removeChild`, destroyed state, and stale timers.
6. Only consider a full port after collecting evidence about where freezes happen.

## Porting Recommendation

Do not port the whole game yet. A full port is likely only worth it if freezes become frequent/reproducible or if we want long-term ownership of gameplay, mechanics, mobile controls, score integrity, and accessibility.

If porting becomes necessary, prefer an incremental path:

1. Extract game state and engine logic into TypeScript.
2. Keep existing sprite/audio assets.
3. Add tests around movement, collisions, scoring, level transitions, and ghost AI.
4. Replace DOM sprite mutation with React or canvas only after behavior is stable.

The pragmatic first step is diagnostics plus a watchdog, not a rewrite.
