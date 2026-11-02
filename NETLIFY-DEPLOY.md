# Dynasty T20 — Netlify Deployment

## Deploy
1. Extract this project folder.
2. Push the contents of this folder to a GitHub repository (package.json must be at repository root).
3. In Netlify, import the GitHub repository.
4. Build command: `npm run build`
5. Publish directory: `dist`
6. Deploy. The included `netlify.toml` sets these values automatically.

## Local checks
Run from the folder containing `package.json`:

```bash
npm install
npm run test:project
npm run test:engine
npm run build
```

## Current verification status
- Project source-marker check: PASS (`node scripts/project-check.mjs`).
- TypeScript/Vite production build: NOT VERIFIED in the current environment because dependency installation timed out and left an incomplete `node_modules` folder.
- Engine audit: NOT VERIFIED for the same reason (TypeScript package could not be loaded).
- Netlify deployment itself has not been run from this environment.

## Scope and limitations
This package consolidates the latest available React + TypeScript + Vite project. It includes the existing auction/player catalogue, in-game career stats and season/tier logic, match simulation with seeded randomness, bowling constraints, and Super Over handling already present in the source. It does not claim that every previously discussed wishlist item is implemented: for example, full 3D/live player animation, deep strategic auction AI, all external real-world career statistics, and exhaustive 5,000+ match calibration are not verified as complete.

`src/engine/matchNarrative.ts` is not included in this React project and commentary has not been changed. Do not replace files with similarly named files from a different project version without checking their imports/types first.
