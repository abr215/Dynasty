import type { Player } from '../data/players';
import { MatchDynamics, phaseOf, type Aggression, type BallOutcome, type BallSituation, type BatterIn, type BowlerIn, type BowlingPlan, type Drama, type FieldSetting, type Pitch } from './kit/matchDynamics';

export type BattingLine = { playerId: string; runs: number; balls: number; fours: number; sixes: number; out?: boolean };
export type BowlingLine = { playerId: string; wickets: number; runs: number; overs: number; balls?: number };
export type MatchResult = {
  id: string; home: string; away: string; homeRuns: number; homeWkts: number;
  awayRuns: number; awayWkts: number; winner: string; summary: string;
  batting: BattingLine[]; bowling: BowlingLine[]; superOver?: { homeRuns:number; homeWkts:number; awayRuns:number; awayWkts:number; round:number };
};

type InningsResult = { runs: number; wickets: number; balls: number; batting: BattingLine[]; bowling: BowlingLine[]; playedIds: string[] };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const getSeasonId = (matchId: string) => `S${matchId.match(/^S(\d+)/)?.[1] || '1'}`;
function seededRng(seedText: string) {
  let seed = 2166136261;
  for (let i = 0; i < seedText.length; i++) seed = Math.imul(seed ^ seedText.charCodeAt(i), 16777619);
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function pitchType(value: string | undefined): Pitch {
  if (value === 'spin-friendly') return 'Spin-friendly';
  if (value === 'seam-friendly') return 'Seam-friendly';
  if (value === 'slow') return 'Slow';
  return 'Flat';
}
function asBatter(p: Player, line: BattingLine): BatterIn {
  return { id: p.id, technique: clamp(60 + (p.bat - 65) * 0.55, 35, 82), power: clamp(58 + (p.bat - 65) * 0.65 + (p.role.toLowerCase().includes('finisher') ? 4 : 0), 35, 88), vsBowlerType: clamp(58 + (p.bat - 65) * 0.5, 35, 82), temperament: clamp(65 + (p.stats.form || 0) * 1.5, 45, 82), consistency: clamp(62 + (p.field - 65) * 0.15, 45, 75), form: p.stats.form || 0, fatigue: 0, ballsFaced: line.balls, runs: line.runs };
}
function asBowler(p: Player, overPhase: string): BowlerIn {
  return { id: p.id, skill: clamp(60 + (p.bowl - 65) * 0.65, 30, 84), accuracy: clamp(60 + (p.bowl - 65) * 0.55, 30, 82), variation: clamp(58 + (p.bowl - 65) * 0.6, 30, 82), phaseSkill: clamp(60 + (p.bowl - 65) * 0.65 + (overPhase === 'DEATH' ? 2 : 0), 30, 85), isSpin: /spin/i.test(p.role), form: p.stats.form || 0, fatigue: 0, consistency: 65 };
}
function aggressionFor(runs: number, wickets: number, ballsLeft: number, overs: number, target?: number): Aggression {
  const wicketsLeft = 10 - wickets;
  const phase = phaseOf(Math.floor((overs * 6 - ballsLeft) / 6), overs);
  if (target !== undefined) {
    const requiredRate = Math.max(0, (target - runs) / Math.max(1, ballsLeft) * 6);
    if (requiredRate >= 14 && wicketsLeft >= 3) return 'All-out';
    if (requiredRate >= 10.5 && wicketsLeft >= 3) return 'Aggressive';
    if (requiredRate <= 6 && wicketsLeft <= 4) return 'Defensive';
    return 'Balanced';
  }
  if (phase === 'DEATH' && wicketsLeft >= 5) return 'Aggressive';
  if (phase === 'PP' && wicketsLeft >= 8) return 'Aggressive';
  if (wicketsLeft <= 3) return 'Defensive';
  return 'Balanced';
}
function sampleOutcome(rng: () => number, sit: BallSituation, batter: BatterIn, bowler: BowlerIn, dyn: MatchDynamics): BallOutcome {
  const p = dyn.ballProbabilities(batter, bowler, sit);
  const r = rng();
  if (r < p.wide) return 'wide';
  if (r < p.wide + p.noBall) return 'noball';
  const q = rng(); let acc = 0;
  const outcomes: [BallOutcome, number][] = [['W', p.wicket], ['6', p.six], ['4', p.four], ['3', p.three], ['2', p.two], ['1', p.one], ['dot', p.dot]];
  for (const [outcome, probability] of outcomes) { acc += probability; if (q < acc) return outcome; }
  return 'dot';
}
function playInnings(teamName: string, opponentName: string, rosters: Record<string, string[]>, players: Player[], oversLimit: number, pitch: Pitch, rng: () => number, innings: 1 | 2, target?: number, drama: Drama = 'realistic'): InningsResult {
  const battingSquad = (rosters[teamName] || []).map(id => players.find(p => p.id === id)).filter((p): p is Player => Boolean(p));
  const bowlingSquad = (rosters[opponentName] || []).map(id => players.find(p => p.id === id)).filter((p): p is Player => Boolean(p));
  const battingOrder = [...battingSquad].sort((a, b) => {
    const role = (p: Player) => /batter|finisher|wicketkeeper/i.test(p.role) ? 30 : /all-rounder/i.test(p.role) ? 15 : 0;
    return role(b) + b.bat * 0.45 - (role(a) + a.bat * 0.45);
  }).slice(0, 11);
  const specialistBowlers = bowlingSquad.filter(p => p.bowl >= 45 || /bowler|all-rounder/i.test(p.role));
  const bowlingOrder = (specialistBowlers.length ? specialistBowlers : bowlingSquad).slice(0, 11);
  const dyn = new MatchDynamics({ overs: oversLimit, pitch, dew: rng() < 0.35, drama, rng });
  const batting: BattingLine[] = [];
  const bowlingMap = new Map<string, { wickets: number; runs: number; balls: number }>();
  const lineFor = (p: Player) => { let line = batting.find(x => x.playerId === p.id); if (!line) { line = { playerId: p.id, runs: 0, balls: 0, fours: 0, sixes: 0 }; batting.push(line); } return line; };
  for (const p of bowlingOrder) bowlingMap.set(p.id, { wickets: 0, runs: 0, balls: 0 });
  let total = 0, wickets = 0, legalBalls = 0, striker = 0, nonStriker = 1, nextBatter = 2, freeHit = false;
  const oversUsed: Record<string, number> = {}; let previousBowler = '';
  const maxBalls = oversLimit * 6; const maxQuota = Math.ceil(oversLimit / 5);
  for (let over = 0; over < oversLimit && wickets < 10 && legalBalls < maxBalls && (target === undefined || total < target); over++) {
    const phase = phaseOf(over, oversLimit);
    let eligible = bowlingOrder.filter(p => p.id !== previousBowler && (oversUsed[p.id] || 0) < maxQuota);
    if (!eligible.length) eligible = bowlingOrder.filter(p => (oversUsed[p.id] || 0) < maxQuota);
    if (!eligible.length) eligible = bowlingOrder;
    eligible.sort((a, b) => (b.bowl + (rng() - 0.5) * 8) - (a.bowl + (rng() - 0.5) * 8));
    const bowler = eligible[0];
    if (!bowler || !battingOrder[striker]) break;
    previousBowler = bowler.id; oversUsed[bowler.id] = (oversUsed[bowler.id] || 0) + 1;
    const bowlIn = asBowler(bowler, phase);
    const startingLine = lineFor(battingOrder[striker]);
    const startSit: BallSituation = { over, ballsBowled: legalBalls, innings, runs: total, wickets, maxWickets: 10, target, aggression: aggressionFor(total, wickets, maxBalls - legalBalls, oversLimit, target), field: phase === 'PP' ? 'Attacking' : phase === 'DEATH' ? 'Defensive' : 'Balanced', plan: phase === 'DEATH' ? 'Yorkers' : /spin/i.test(bowler.role) ? 'Stock' : 'Slower balls', freeHit };
    dyn.startOver(startSit, asBatter(battingOrder[striker], startingLine), bowlIn);
    let legalInOver = 0, safety = 0;
    while (legalInOver < 6 && wickets < 10 && legalBalls < maxBalls && safety++ < 24 && (target === undefined || total < target)) {
      const batter = battingOrder[striker]; if (!batter) break;
      const batLine = lineFor(batter);
      const sit: BallSituation = { over, ballsBowled: legalBalls, innings, runs: total, wickets, maxWickets: 10, target, aggression: aggressionFor(total, wickets, maxBalls - legalBalls, oversLimit, target), field: phase === 'PP' ? 'Attacking' : phase === 'DEATH' ? 'Defensive' : 'Balanced', plan: phase === 'DEATH' ? 'Yorkers' : /spin/i.test(bowler.role) ? 'Stock' : 'Slower balls', freeHit };
      const bIn = asBatter(batter, batLine); const wIn = asBowler(bowler, phase);
      let outcome = sampleOutcome(rng, sit, bIn, wIn, dyn);
      if (outcome === 'wide' || outcome === 'noball') {
        total += 1; const fig = bowlingMap.get(bowler.id)!; fig.runs += 1;
        dyn.afterBall(outcome, sit, bIn, wIn, false);
        if (outcome === 'noball') freeHit = true;
        continue;
      }
      let luck = dyn.applyLuck(outcome, outcome === 'W' ? (rng() < 0.6 ? 'Caught' : 'Bowled') : undefined);
      outcome = luck.outcome;
      if (luck.retiredHurt) {
        const incoming = nextBatter++;
        if (incoming < battingOrder.length) striker = incoming;
        dyn.afterBall(outcome, sit, bIn, wIn, true); legalBalls++; legalInOver++; batLine.balls++; bowlingMap.get(bowler.id)!.balls++; freeHit = false; if (incoming >= battingOrder.length) break; continue;
      }
      if (freeHit && outcome === 'W' && !/run out/i.test(luck.note || '')) outcome = '1';
      freeHit = false;
      legalBalls++; legalInOver++; batLine.balls++;
      const fig = bowlingMap.get(bowler.id)!; fig.balls++;
      if (outcome === 'W') {
        batLine.out = true; wickets++;
        if (!/run out/i.test(luck.note || '')) fig.wickets++;
        const incoming = nextBatter++;
        dyn.afterBall('W', sit, bIn, wIn, true);
        if (incoming < battingOrder.length) striker = incoming;
        else break;
      } else {
        const runs = outcome === 'dot' ? 0 : Number.parseInt(outcome, 10);
        batLine.runs += runs; if (runs === 4) batLine.fours++; if (runs === 6) batLine.sixes++;
        total += runs + Number(luck.extraRuns || 0); fig.runs += runs;
        dyn.afterBall(outcome, sit, bIn, wIn, true);
        if (runs % 2 === 1) [striker, nonStriker] = [nonStriker, striker];
      }
      if (target !== undefined && total >= target) break;
    }
    [striker, nonStriker] = [nonStriker, striker];
  }
  const bowling = [...bowlingMap.entries()].filter(([, f]) => f.balls > 0 || f.runs > 0 || f.wickets > 0).map(([playerId, f]) => ({ playerId, wickets: f.wickets, runs: f.runs, balls: f.balls, overs: Number((f.balls / 6).toFixed(1)) }));
  return { runs: total, wickets, balls: legalBalls, batting, bowling, playedIds: [...new Set([...battingSquad.slice(0, 11).map(p => p.id), ...bowlingSquad.slice(0, 11).map(p => p.id)])] };
}
function updateCareerStats(players: Player[], seasonId: string, innings: InningsResult[]) {
  const played = new Set<string>();
  for (const inn of innings) {
    inn.playedIds.forEach(id => played.add(id));
    for (const line of inn.batting) {
      const p = players.find(x => x.id === line.playerId); if (!p) continue;
      p.stats.runs += line.runs; p.stats.centuries += line.runs >= 100 ? 1 : 0;
      p.stats.ballsFaced = (p.stats.ballsFaced || 0) + line.balls; p.stats.dismissals = (p.stats.dismissals || 0) + (line.out ? 1 : 0);
      p.stats.strikeRate = Number((p.stats.runs / Math.max(1, p.stats.ballsFaced) * 100).toFixed(2));
      p.stats.average = Number((p.stats.runs / Math.max(1, p.stats.dismissals || 0)).toFixed(2));
      p.stats.recentScores = [...(p.stats.recentScores || []), line.runs].slice(-5);
      const recentAverage = p.stats.recentScores.reduce((sum: number, score: number) => sum + score, 0) / Math.max(1, p.stats.recentScores.length);
      p.stats.form = clamp(Math.round((recentAverage - 20) / 8), -10, 10);
      let season = p.stats.seasons.find(s => s.season === seasonId);
      if (!season) { season = { season: seasonId, matches: 0, runs: 0, wickets: 0, ballsFaced: 0, dismissals: 0 }; p.stats.seasons.push(season); }
      season.runs += line.runs; season.ballsFaced = (season.ballsFaced || 0) + line.balls; season.dismissals = (season.dismissals || 0) + (line.out ? 1 : 0);
    }
    for (const line of inn.bowling) {
      const p = players.find(x => x.id === line.playerId); if (!p) continue;
      p.stats.wickets += line.wickets; p.stats.ballsBowled = (p.stats.ballsBowled || 0) + (line.balls || Math.round(line.overs * 6));
      p.stats.runsConceded = (p.stats.runsConceded || 0) + line.runs; p.stats.economy = Number((p.stats.runsConceded / Math.max(1, p.stats.ballsBowled / 6)).toFixed(2));
      let season = p.stats.seasons.find(s => s.season === seasonId);
      if (!season) { season = { season: seasonId, matches: 0, runs: 0, wickets: 0, ballsFaced: 0, dismissals: 0 }; p.stats.seasons.push(season); }
      season.wickets += line.wickets;
    }
  }
  for (const id of played) {
    const p = players.find(x => x.id === id); if (!p) continue;
    p.stats.matches++;
    const battingLines = innings.flatMap(inn => inn.batting).filter(line => line.playerId === id);
    const bowlingLines = innings.flatMap(inn => inn.bowling).filter(line => line.playerId === id);
    const runsThisMatch = battingLines.reduce((sum: number, line: BattingLine | BowlingLine) => sum + line.runs, 0);
    const ballsThisMatch = battingLines.reduce((sum: number, line: BattingLine) => sum + line.balls, 0);
    const wicketsThisMatch = bowlingLines.reduce((sum: number, line: BowlingLine) => sum + line.wickets, 0);
    const concededThisMatch = bowlingLines.reduce((sum: number, line: BowlingLine) => sum + line.runs, 0);
    const bowlingBallsThisMatch = bowlingLines.reduce((sum: number, line: BowlingLine) => sum + (line.balls || Math.round(line.overs * 6)), 0);
    const battingContribution = Math.min(100, runsThisMatch * 0.65 + (ballsThisMatch ? runsThisMatch / ballsThisMatch * 25 : 0));
    const bowlingContribution = Math.min(100, wicketsThisMatch * 22 + (bowlingBallsThisMatch ? Math.max(0, 35 - concededThisMatch / (bowlingBallsThisMatch / 6) * 4) : 0));
    const isBowler = /bowler/i.test(p.role) || p.bowl > p.bat + 8;
    const performance = Math.round(isBowler ? Math.max(battingContribution * 0.25, bowlingContribution) : Math.max(battingContribution, bowlingContribution * 0.35));
    p.stats.recentPerformances = [...(p.stats.recentPerformances || []), performance].slice(-5);
    const meanPerformance = p.stats.recentPerformances.reduce((sum: number, value: number) => sum + value, 0) / Math.max(1, p.stats.recentPerformances.length);
    p.stats.form = clamp(Math.round((meanPerformance - 45) / 4), -10, 10);
    const baseAbility = isBowler ? Math.max(p.bowl, p.bat * 0.55) : Math.max(p.bat, p.bowl * 0.55);
    const rating = clamp(Math.round(baseAbility * 0.82 + meanPerformance * 0.18 + (p.stats.form || 0) * 0.4), 0, 100);
    p.tier = rating >= 94 ? 'S' : rating >= 89 ? 'A' : rating >= 84 ? 'A-' : rating >= 79 ? 'B' : rating >= 74 ? 'B-' : rating >= 69 ? 'C' : rating >= 64 ? 'C-' : rating >= 58 ? 'D' : rating >= 52 ? 'D-' : 'E';
    let season = p.stats.seasons.find(s => s.season === seasonId);
    if (!season) { season = { season: seasonId, matches: 0, runs: 0, wickets: 0, ballsFaced: 0, dismissals: 0 }; p.stats.seasons.push(season); }
    season.matches++;
    season.tier = p.tier;
  }
}
export function simulateMatch(id: string, home: string, away: string, rosters: Record<string, string[]>, players: Player[], overs = 20, pitches: Record<string, string> = {}, drama: Drama = 'realistic'): MatchResult {
  const playingXI = Object.fromEntries(Object.entries(rosters).map(([team, ids]) => {
    const selected = ids.map(pid => players.find(p => p.id === pid)).filter((p): p is Player => Boolean(p))
      .sort((a, b) => (b.bat * 0.45 + b.bowl * 0.40 + b.field * 0.15) - (a.bat * 0.45 + a.bowl * 0.40 + a.field * 0.15))
      .slice(0, 11).map(p => p.id);
    return [team, selected];
  }));
  const homePitch = pitchType(pitches[home]);
  const homeRng = seededRng(`${id}|${home}|${away}|first`);
  const awayRng = seededRng(`${id}|${home}|${away}|second`);
  const homeInn = playInnings(home, away, playingXI, players, overs, homePitch, homeRng, 1, undefined, drama);
  const awayInn = playInnings(away, home, playingXI, players, overs, homePitch, awayRng, 2, homeInn.runs + 1, drama);
  const statInnings: InningsResult[] = [homeInn, awayInn];
  let winner = homeInn.runs > awayInn.runs ? home : awayInn.runs > homeInn.runs ? away : 'Tie';
  let superOver: MatchResult['superOver'];
  if (winner === 'Tie') {
    for (let round = 1; round <= 3 && winner === 'Tie'; round++) {
      const soHome = playInnings(home, away, playingXI, players, 1, homePitch, seededRng(`${id}|super-${round}-home`), 1, undefined, drama);
      const soAway = playInnings(away, home, playingXI, players, 1, homePitch, seededRng(`${id}|super-${round}-away`), 2, soHome.runs + 1, drama);
      statInnings.push(soHome, soAway);
      superOver = { homeRuns: soHome.runs, homeWkts: soHome.wickets, awayRuns: soAway.runs, awayWkts: soAway.wickets, round };
      winner = soHome.runs > soAway.runs ? home : soAway.runs > soHome.runs ? away : 'Tie';
    }
  }
  updateCareerStats(players, getSeasonId(id), statInnings);
  const margin = Math.abs(homeInn.runs - awayInn.runs);
  const summary = superOver ? (winner === 'Tie' ? `Scores level at ${homeInn.runs}; still tied after ${superOver.round} Super Over${superOver.round === 1 ? '' : 's'}.` : `${winner} won Super Over ${superOver.round}: ${home} ${superOver.homeRuns}/${superOver.homeWkts} vs ${away} ${superOver.awayRuns}/${superOver.awayWkts}.`) : winner === away ? `${away} chased the target with ${10 - awayInn.wickets} wicket${10 - awayInn.wickets === 1 ? '' : 's'} remaining${awayInn.balls >= overs * 6 - 1 ? ', in a last-ball finish' : ''}.` : `${home} defended the target by ${margin} run${margin === 1 ? '' : 's'}.`;
  return { id, home, away, homeRuns: homeInn.runs, homeWkts: homeInn.wickets, awayRuns: awayInn.runs, awayWkts: awayInn.wickets, winner, summary, batting: [...homeInn.batting, ...awayInn.batting], bowling: [...homeInn.bowling, ...awayInn.bowling], superOver };
}
