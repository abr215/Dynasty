# Dynasty T20 — Final Test Build

This ZIP contains the complete editable source project for local testing. It does not change the live Netlify site.

## What is included

### Live Match Centre
- Three-part match layout with batting/bowling information, central stadium field view, over strip, and match analysis.
- Stadium artwork with fielder/bowler/batter markers and field-position controls. This is a 2D tactical view, not a 3D physics simulation.
- Twenty tactical field presets and editable field positions.
- Pitch report before the toss, at the innings break, and during play. The report describes a flat, spin-friendly, seam-friendly, or slow pitch and the expected batting/bowling effects.
- Batting intent settings: **DEF** (protect wicket), **NOR** (balanced), **AGG** (higher scoring risk), and **ALL** (adaptive).
- Ball-by-ball playback controls, wicket/innings decision prompts, score display, partnership information, and bowling figures.

### Match engine and rules pass
- Pitch and phase now inform field-preset recommendations; phase updates from powerplay through middle overs to death overs.
- Strike rotation accounts for odd completed runs on run-outs.
- Batter balls-faced accounting excludes wides and includes no-balls; legal balls still control the over count.
- Maiden-over checks use bowler-charged runs, excluding byes and leg-byes.
- No-ball bowling figures count no-ball events, rather than all runs on those deliveries.
- Free-hit logic suppresses bowler-credited dismissals while allowing run-outs.
- **Review rules:** only LBW decisions can offer the batting captain a DRS review; run-outs are sent to an automatic third-umpire check. Other wicket types do not open a review panel.
- The bowling picker keeps eligible Playing XI options visible and applies workload/over-limit safety checks.

### Franchise and career features already in the project
- Team/venue setup, auction and squad management, fixtures, standings, season statistics, player history, and browser-local career saves.
- Save Manager import/export and recovery options. Export a career backup before replacing files or moving browsers.
- The default player pool is a curated in-game database; it is not live-synced with an external cricket data provider.

## Run locally

1. Extract the ZIP.
2. Open the extracted project folder in VS Code (the folder containing `package.json`).
3. Open **Terminal → New Terminal** in VS Code.
4. Run these commands one at a time:

```powershell
npm install
npm run dev
```

5. Open the local URL that Vite prints in the terminal.

To run the automated engine audit:

```powershell
npm run test:engine
```

Before deployment, run the production build:

```powershell
npm run build
```

## Validation performed for this ZIP

- TypeScript/TSX syntax transpilation: **13 files checked, 0 syntax errors**.
- Engine audit: **PASS** — 8 dismissal-review rules, 2 field recommendation cases, 6,000 free-hit deliveries, and 1,200 simulated innings across four pitch types, plus 880 intent-mode innings.
- Simulated mean T20 innings runs (one run of this statistical audit): flat 175.1; spin-friendly 174.6; seam-friendly 159.3; slow 169.4. These are aggregate diagnostic samples, not fixed targets for matches.
- Full React/Vite production build: **not verified in this preparation environment**. Dependency installation repeatedly timed out, so run `npm install` and `npm run build` on your machine before deploying.

## Known test limitations

- The stadium is represented by a 2D field view and visual markers; it is not a full 3D simulation.
- The current **Test** format is not a complete multi-day Test rules engine with four innings, declarations, follow-on, and draws. Test the T20 and ODI-style limited-overs flow first.
- The engine audit is a statistical/unit-style test, not a full automated browser test. The UI, saves, complete tournament lifecycle, and a full match should still be tested in the browser.
- This package is a local test build. It has not been published to or connected to the live Netlify deployment.
