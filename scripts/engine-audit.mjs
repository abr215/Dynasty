import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'dynasty-engine-audit-'));
try {
  const compile = (sourcePath, outputPath) => {
    const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
    const result = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
      reportDiagnostics: true,
    });
    const errors = (result.diagnostics || []).filter(d => d.category === ts.DiagnosticCategory.Error);
    assert.equal(errors.length, 0, `${sourcePath} should transpile without syntax errors`);
    fs.writeFileSync(outputPath, result.outputText);
  };
  const dataDir = path.join(temp, 'data');
  const engineDir = path.join(temp, 'engine');
  const kitDir = path.join(engineDir, 'kit');
  fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(kitDir, { recursive: true });
  const dataOut = path.join(dataDir, 'players.js');
  const engineOut = path.join(engineDir, 'simulation.js');
  compile('src/data/players.ts', dataOut);
  compile('src/engine/kit/matchDynamics.ts', path.join(kitDir, 'matchDynamics.js'));
  compile('src/engine/simulation.ts', engineOut);
  const require = createRequire(import.meta.url);
  const { createPlayerPool } = require(dataOut);
  const { simulateMatch } = require(engineOut);
  const players = createPlayerPool();
  assert.equal(players.length, 520, 'player pool should contain 520 records');
  assert.equal(new Set(players.map(p => p.id)).size, players.length, 'player IDs must be unique');
  assert.ok(players.every(p => p.stats.matches === 0 && p.stats.runs === 0), 'new-career stats should start at zero');

  const teams = {
    Scorpions: players.slice(0, 15).map(p => p.id),
    Gladiators: players.slice(15, 30).map(p => p.id),
  };
  const replayA = createPlayerPool(); const replayB = createPlayerPool();
  const replayTeamsA = { Scorpions: replayA.slice(0, 15).map(p => p.id), Gladiators: replayA.slice(15, 30).map(p => p.id) };
  const replayTeamsB = { Scorpions: replayB.slice(0, 15).map(p => p.id), Gladiators: replayB.slice(15, 30).map(p => p.id) };
  const replayOne = simulateMatch('S1-REPLAY', 'Scorpions', 'Gladiators', replayTeamsA, replayA, 20, { Scorpions: 'flat', Gladiators: 'flat' });
  const replayTwo = simulateMatch('S1-REPLAY', 'Scorpions', 'Gladiators', replayTeamsB, replayB, 20, { Scorpions: 'flat', Gladiators: 'flat' });
  assert.deepEqual([replayOne.homeRuns, replayOne.homeWkts, replayOne.awayRuns, replayOne.awayWkts, replayOne.winner], [replayTwo.homeRuns, replayTwo.homeWkts, replayTwo.awayRuns, replayTwo.awayWkts, replayTwo.winner], 'same seeded fixture and state should replay identically');
  const beforeMatches = players.reduce((sum, p) => sum + p.stats.matches, 0);
  const inningsScores = []; let superOvers = 0;
  for (let i = 0; i < 1200; i++) {
    const pitch = ['flat', 'spin-friendly', 'seam-friendly', 'slow'][i % 4];
    const result = simulateMatch(`S1-M${i + 1}`, 'Scorpions', 'Gladiators', teams, players, 20, { Scorpions: pitch, Gladiators: 'flat' });
    assert.ok(result.homeRuns >= 0 && result.awayRuns >= 0, 'scores must be non-negative');
    assert.ok(result.homeWkts >= 0 && result.homeWkts <= 10 && result.awayWkts >= 0 && result.awayWkts <= 10, 'wickets must stay within cricket limits');
    assert.ok(['Scorpions', 'Gladiators', 'Tie'].includes(result.winner), 'winner must match a participating team or be a tie');
    inningsScores.push(result.homeRuns, result.awayRuns); if (result.superOver) superOvers++;
  }
  const afterMatches = players.reduce((sum, p) => sum + p.stats.matches, 0);
  assert.equal(afterMatches - beforeMatches, 1200 * 22, 'each playing XI player should receive one match appearance per match');
  assert.ok(new Set(inningsScores).size > 100, 'match scores should vary rather than repeat a fixed script');
  const averageRuns = inningsScores.reduce((sum, score) => sum + score, 0) / inningsScores.length;
  assert.ok(averageRuns > 80 && averageRuns < 230, `average innings score should remain in a broad cricket-plausible range (got ${averageRuns.toFixed(1)})`);
  assert.ok(players.some(p => p.stats.seasons.some(s => s.season === 'S1')), 'season stats should be written');
  assert.ok(players.some(p => p.tier), 'player tiers should be assigned');
  console.log(`Engine audit PASS: 520 unique player IDs; deterministic replay; 1,200 simulated T20 matches; mean innings score ${averageRuns.toFixed(1)}; ${superOvers} Super Over results; score/wicket bounds, 22 player appearances per match, season records, and tier updates verified.`);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
