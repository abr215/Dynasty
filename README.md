# Dynasty T20 — Phase 18 Safety & Save Build

Complete source project for the Dynasty T20 franchise cricket management game.

## Phase 18 changes

### Bowling-rotation safety
- The bowling picker lists the whole confirmed Playing XI, not just two specialist candidates.
- Specialists and all-rounders appear first; remaining XI players are available as emergency/part-time options.
- Every player row shows O–M–R–W figures, economy, bowling rating, form and availability status.
- The safety guard calculates remaining legal bowling capacity and the no-consecutive-overs rule before approving a selection. Unsafe picks are disabled when a safe alternative exists.
- The UI highlights a recommended safe pick and explains why other bowlers are unavailable.
- **Auto-pick safely · all remaining overs** enables automatic selection at subsequent over breaks. **Manual next over** lets a manager switch back to manual control without interrupting the current over.
- AI bowling selection spreads workload more intelligently and uses part-time options if its specialists reach their limits.

### Career-save protection
- Background autosave after game-state updates.
- IndexedDB persistence with a localStorage save fallback.
- A latest-career recovery snapshot and a **Continue Last Career** button on the entrance screen.
- Save Manager can list, load, delete, import and export careers, and offers an additional recovery export.
- LocalStorage fallback saves are merged with IndexedDB saves instead of disappearing when the database is empty.
- Save imports are checked for core career structure before replacing the active game.

## Install and run

Open the folder containing `package.json` in VS Code. In that exact folder, run:

```powershell
npm install
npm run dev
```

Open the localhost URL printed by Vite.

## Important

- This is a local browser testing build, not a live-hosted multiplayer release.
- Career autosaves are browser-local. Use **Export career backup** to move a career to another browser or computer.
- A full production build should be run on the user's machine after dependencies install successfully. Source syntax and the standalone bowling-safety engine were checked in the preparation environment; React/Vite production compilation could not be confirmed here because dependencies were not installed.
