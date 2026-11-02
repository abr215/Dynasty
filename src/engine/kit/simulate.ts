/**
 * simulate.ts: self-test harness for matchDynamics.ts.
 * Run:  npx tsx simulate.ts [matches] [drama] [overs]
 * Prints the score distribution so you can verify the engine is unpredictable but realistic.
 */
import { TUNING, MatchDynamics, BatterIn, BowlerIn, BallSituation, Aggression, BallOutcome, phaseOf, Drama } from './matchDynamics';

// ---- tiny seeded RNG (mulberry32)
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(Number(process.env.SEED ?? 12345));
const gauss = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

interface P { id: string; tech: number; pow: number; vsP: number; vsS: number; temp: number; cons: number; form: number; bowl: number; acc: number; vari: number; death: number; pp: number; spin: boolean; canBowl: boolean; }

function makeTeam(prefix: string, strength: number): P[] {
  const team: P[] = [];
  for (let i = 0; i < 11; i++) {
    const bat = clamp(strength + 8 - i * 3.2 + gauss() * 5, 25, 96);
    const isBowler = i >= 5;
    const bowl = isBowler ? clamp(strength + 2 + gauss() * 8, 55, 95) : i >= 3 ? clamp(strength - 14 + gauss() * 8, 30, 80) : 20;
    team.push({
      id: `${prefix}${i}`, tech: bat, pow: clamp(bat + gauss() * 8, 25, 98), vsP: clamp(bat + gauss() * 5, 25, 97), vsS: clamp(bat + gauss() * 5, 25, 97),
      temp: clamp(strength + gauss() * 10, 30, 95), cons: clamp(65 + gauss() * 14, 25, 95), form: clamp(Math.round(gauss() * 3), -8, 8),
      bowl, acc: bowl + gauss() * 4, vari: bowl + gauss() * 4, death: bowl + gauss() * 8, pp: bowl + gauss() * 6, spin: rng() < 0.4, canBowl: bowl >= 50,
    });
  }
  return team;
}

function botAgg(sit: BallSituation, overs: number, ballsLeft: number): Aggression {
  const over = sit.over;
  const par = overs > 25 ? 5.8 : 8.3;
  let lvl = 1;
  const wl = sit.maxWickets - sit.wickets;
  const ph = phaseOf(over, overs);
  if (sit.target) {
    const rrr = ((sit.target - sit.runs) / Math.max(1, ballsLeft)) * 6 * 8.3 / par;
    if (rrr >= 13) lvl = 3; else if (rrr >= 10.5) lvl = 2; else if (rrr <= 7 && wl <= 4) lvl = 0;
    if (ph === 'PP' && rrr < 11) lvl = Math.max(lvl, 1);
  } else {
    if (ph === 'PP') lvl = Math.max(lvl, 1);
    if (ph === 'DEATH' && wl >= 4) lvl = Math.max(lvl, 2);
    if (wl <= 3 && ph !== 'DEATH') lvl = Math.min(lvl, 1);
  }
  return (['Defensive', 'Balanced', 'Aggressive', 'All-out'] as Aggression[])[clamp(lvl, 0, 3)];
}

interface InnRes { runs: number; wickets: number; balls: number; sixesInOver: number; maxSixesOver: number; maxWktsOver: number; hatTrick: boolean; finishedLastBall: boolean; best: number; }

function playInnings(dyn: MatchDynamics, bat: P[], bowl: P[], overs: number, innings: 1 | 2, target?: number): InnRes {
  dyn.newInnings();
  const bowlers = bowl.filter((b) => b.canBowl);
  const used: Record<string, number> = {}; let last = '';
  const stats: Record<string, { r: number; b: number }> = {}; bat.forEach((b) => (stats[b.id] = { r: 0, b: 0 }));
  let striker = 0, non = 1, next = 2, runs = 0, wkts = 0, balls = 0;
  let maxSix = 0, maxW = 0, hat = false, recentW: number[] = [];
  const maxBalls = overs * 6;
  const quota = Math.ceil(overs / 5);
  let best = 0;
  for (let over = 0; over < overs && wkts < 10; over++) {
    // pick bowler
    const elig = bowlers.filter((b) => b.id !== last && (used[b.id] ?? 0) < quota);
    const pool = elig.length ? elig : bowlers.filter((b) => (used[b.id] ?? 0) < quota);
    const ph = phaseOf(over, overs);
    pool.sort((a, b) => (b.bowl + (ph === 'DEATH' ? b.death : ph === 'PP' ? b.pp : 0) * 0.4) - (a.bowl + (ph === 'DEATH' ? a.death : ph === 'PP' ? a.pp : 0) * 0.4) + (rng() - 0.5) * 14);
    const bw = pool[0]; used[bw.id] = (used[bw.id] ?? 0) + 1; last = bw.id;
    const bIn = (): BowlerIn => ({ id: bw.id, skill: bw.bowl, accuracy: bw.acc, variation: bw.vari, phaseSkill: ph === 'DEATH' ? bw.death : ph === 'PP' ? bw.pp : (bw.acc + bw.vari) / 2, isSpin: bw.spin, form: bw.form, fatigue: 0 });
    const mkBat = (i: number): BatterIn => ({ id: bat[i].id, technique: bat[i].tech, power: bat[i].pow, vsBowlerType: bw.spin ? bat[i].vsS : bat[i].vsP, temperament: bat[i].temp, consistency: bat[i].cons, form: bat[i].form, fatigue: 0, ballsFaced: stats[bat[i].id].b, runs: stats[bat[i].id].r });
    const sitBase = (): BallSituation => ({ over, ballsBowled: balls, innings, runs, wickets: wkts, maxWickets: 10, target, aggression: 'Balanced', field: 'Balanced', plan: 'Stock' });
    let s0 = sitBase();
    s0.aggression = botAgg(s0, overs, maxBalls - balls);
    dyn.startOver(s0, mkBat(striker), bIn());
    let legal = 0, sixes = 0, wInOver = 0, safety = 0;
    while (legal < 6 && wkts < 10 && safety++ < 20) {
      const sit = sitBase();
      sit.aggression = botAgg(sit, overs, maxBalls - balls);
      sit.field = ph === 'PP' ? 'Attacking' : ph === 'DEATH' ? 'Defensive' : 'Balanced';
      sit.plan = ph === 'DEATH' ? 'Yorkers' : 'Stock';
      const b = mkBat(striker), w = bIn();
      const p = dyn.ballProbabilities(b, w, sit);
      const r = rng();
      let outcome: BallOutcome = 'dot';
      if (r < p.wide) outcome = 'wide';
      else if (r < p.wide + p.noBall) outcome = 'noball';
      else {
        const q = rng(); let acc = 0;
        const t: [BallOutcome, number][] = [['W', p.wicket], ['6', p.six], ['4', p.four], ['3', p.three], ['2', p.two], ['1', p.one], ['dot', p.dot]];
        for (const [k, v] of t) { acc += v; if (q < acc) { outcome = k; break; } }
      }
      if (outcome === 'wide') { runs += 1; dyn.afterBall('wide', sit, b, w, false); if (target && runs >= target) break; continue; }
      if (outcome === 'noball') { runs += 1; dyn.afterBall('noball', sit, b, w, false); continue; }
      const lk = dyn.applyLuck(outcome, outcome === 'W' ? (rng() < 0.55 ? 'Caught' : 'Bowled') : undefined);
      outcome = lk.outcome;
      legal++; balls++;
      stats[bat[striker].id].b++;
      if (outcome === 'W') {
        wkts++; wInOver++; recentW.push(balls); if (recentW.length >= 3 && recentW[recentW.length - 1] - recentW[recentW.length - 3] === 2 && Math.floor((recentW[recentW.length - 3] - 1) / 6) === Math.floor((recentW[recentW.length - 1] - 1) / 6)) hat = true;
        dyn.afterBall('W', sit, b, w);
        if (next < 11) striker = next++; else break;
      } else {
        const rr = outcome === 'dot' ? 0 : parseInt(outcome, 10);
        runs += rr; stats[bat[striker].id].r += rr; if (stats[bat[striker].id].r > best) best = stats[bat[striker].id].r;
        if (rr === 6) sixes++;
        dyn.afterBall(outcome, sit, b, w);
        if (rr % 2 === 1) { const t = striker; striker = non; non = t; }
      }
      if (target && runs >= target) break;
    }
    if (sixes > maxSix) maxSix = sixes; if (wInOver > maxW) maxW = wInOver;
    if (target && runs >= target) { return { runs, wickets: wkts, balls, sixesInOver: sixes, maxSixesOver: maxSix, maxWktsOver: maxW, hatTrick: hat, finishedLastBall: balls >= maxBalls - 1, best }; }
    const t = striker; striker = non; non = t;
  }
  return { runs, wickets: wkts, balls, sixesInOver: 0, maxSixesOver: maxSix, maxWktsOver: maxW, hatTrick: hat, finishedLastBall: false, best };
}

if (process.env.FLAT) { Object.assign(TUNING, { dayFormBase: 0, dayFormConsistency: 0, dreamDayChance: 0, pitchEaseSd: 0, pitchWicketSd: 0, freakPitchChance: 0, magicOver: 0, carnageOver: 0, bowlerOnTop: 0, batterOnTop: 0, collapsePerWicket: 0, freshBatter: 1, pressureWicket: 0, bowlerMoodWicket: 0 }); }
const N = Number(process.argv[2] ?? 4000);
const drama = (process.argv[3] ?? 'realistic') as Drama;
const overs = Number(process.argv[4] ?? 20);
const pitches = ['Flat', 'Seam-friendly', 'Spin-friendly', 'Slow'] as const;
const scores: number[] = []; let ao = 0, c200 = 0, c220 = 0, c240 = 0, lt100 = 0, lt60 = 0, lt80 = 0, close = 0, lastBall = 0, ties = 0, sixOvers = 0, w4Overs = 0, hats = 0, chaseWins = 0, maxS = 0, minS = 999, cent = 0, tot = 0;
for (let i = 0; i < N; i++) {
  const A = makeTeam('A', 76 + gauss() * 2.5), B = makeTeam('B', 76 + gauss() * 2.5);
  const dyn = new MatchDynamics({ overs, pitch: pitches[i % 4], dew: rng() < 0.35, drama, rng });
  const i1 = playInnings(dyn, A, B, overs, 1);
  const i2 = playInnings(dyn, B, A, overs, 2, i1.runs + 1);
  for (const x of [i1, i2]) {
    scores.push(x.runs); tot++;
    if (x.wickets >= 10) ao++; if (x.runs >= 200) c200++; if (x.runs >= 220) c220++; if (x.runs >= 240) c240++;
    if (x.runs < 100) lt100++; if (x.runs < 80) lt80++; if (x.runs < 60) lt60++;
    if (x.maxSixesOver >= 6) sixOvers++; if (x.maxWktsOver >= 4) w4Overs++; if (x.hatTrick) hats++; if (x.best >= 100) cent++;
    maxS = Math.max(maxS, x.runs); minS = Math.min(minS, x.runs);
  }
  if (i2.runs >= i1.runs + 1) chaseWins++;
  if (i2.runs === i1.runs) ties++;
  const margin = i2.runs >= i1.runs + 1 ? (i2.balls >= overs * 6 - 6 ? 0 : 99) : i1.runs - i2.runs;
  if (i2.runs >= i1.runs + 1 && i2.balls >= overs * 6 - 6) close++; else if (i2.runs < i1.runs + 1 && margin <= 8 && i2.wickets < 10) close++;
  if (i2.runs >= i1.runs + 1 && i2.balls >= overs * 6 - 1) lastBall++;
}
const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
const sd = Math.sqrt(scores.reduce((a, b) => a + (b - avg) ** 2, 0) / scores.length);
const pct = (n: number, d = tot) => ((100 * n) / d).toFixed(2) + '%';
console.log(`=== ${N} matches | overs=${overs} | drama=${drama} ===`);
console.log(`avg=${avg.toFixed(1)} sd=${sd.toFixed(1)} min=${minS} max=${maxS}`);
console.log(`<60: ${pct(lt60)} | <80: ${pct(lt80)} | <100: ${pct(lt100)} | all-out: ${pct(ao)}`);
console.log(`200+: ${pct(c200)} | 220+: ${pct(c220)} | 240+: ${pct(c240)} | 100+ by a batter: ${pct(cent)}`);
console.log(`chase wins: ${pct(chaseWins, N)} | ties->super over: ${pct(ties, N)} | chase decided in last over: ${pct(close, N)} | won off last ball: ${pct(lastBall, N)}`);
console.log(`6 sixes in an over (per match): ${pct(sixOvers, N)} | 4+ wkts in an over: ${pct(w4Overs)} | hat-tricks: ${pct(hats, N)}`);
