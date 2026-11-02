import fs from 'node:fs';
import assert from 'node:assert/strict';
for (const file of ['index.html','src/main.tsx','src/App.tsx','src/styles.css','src/data/players.ts','src/engine/simulation.ts','package.json','README.md','public/bhopal-premier-league-backup.json']) {
  assert.ok(fs.existsSync(new URL(`../${file}`, import.meta.url)), `Missing ${file}`);
}
const players = fs.readFileSync(new URL('../src/data/players.ts', import.meta.url), 'utf8');
assert.match(players, /while\(pool\.length<520\)/);
assert.match(players, /matches:0,runs:0/);
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
for (const feature of ['View Career Stats','Skip Tournament','LIVE SQUAD MONITOR','Season review','Load Career','Light theme','Dark theme','randomizeEmblem','GOING ONCE','retention-grid','stadium-board','playingXI','Start Bidding','Season-wise records','auctionQueue']) {
  if (feature === 'Going ONCE') assert.match(app, /GOING ONCE/);
  else assert.ok(app.includes(feature), `Missing feature/source marker: ${feature}`);
}
assert.match(app, /t\.human\)\.map/); // identity editor is restricted to human franchises
assert.match(app, /s\.league&&s\.rules/); // legacy save migration path
const engine = fs.readFileSync(new URL('../src/engine/simulation.ts', import.meta.url), 'utf8');
assert.match(engine, /recentPerformances/);
assert.match(engine, /season\.tier = p\.tier/);
assert.match(app, /setAuctionRunning\(false\);setStage\('auction'\)/); // opening auction room must not auto-start bidding
assert.match(app, /setLotStarted\(true\);setAuctionRunning\(true\)/); // explicit per-player start control
const namesMatch = app.match(/const realTeamNames=\[([^;]+)\];/);
assert.ok(namesMatch, 'team name catalogue exists');
const names = [...namesMatch[1].matchAll(/'([^']+)'/g)].map(m => m[1].toLowerCase());
assert.ok(names.length >= 50, 'at least 50 team names should be available');
assert.equal(new Set(names).size, names.length, 'team names must be unique');
console.log(`Project checks PASS: required controls, explicit per-lot start, player stats, tier history and ${names.length} unique franchise names.`);
