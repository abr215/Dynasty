/**
 * matchDynamics.ts
 * ---------------------------------------------------------------
 * Framework-agnostic "unpredictability engine" for a cricket sim.
 * Pure TypeScript, zero dependencies. Plug it into ANY ball-by-ball engine.
 *
 * What it adds on top of a plain rating-vs-rating formula:
 *   1. Day-form       : hidden per-match mood for every player (dream day / bad day)
 *   2. Hidden pitch   : pitch report is only a hint, real behaviour is rolled per match
 *   3. Over modes     : bowler on top, batter on top, magic over, carnage over (fat tails)
 *   4. Pressure       : team pressure meter (wickets, dot balls, required rate)
 *   5. Momentum       : swings after boundaries and wickets
 *   6. Collapse       : wickets cluster, fresh batters are fragile
 *   7. Batter flow    : set batters can explode, flow breaks after dots
 *   8. Bowler mood    : confidence rises with wickets, drops when hit
 *   9. Luck           : dropped catches, misfields, overthrows, edges, run-outs, retired hurt
 *  10. Clutch         : temperament matters in tight finishes
 *  11. Drama dial     : realistic / dramatic / chaos (scales every random component)
 *
 * USAGE (per ball):
 *   const dyn = new MatchDynamics({ overs: 20, pitch: 'Flat', dew: false, drama: 'realistic', rng: Math.random });
 *   // at the start of every over:
 *   dyn.startOver(sit, batter, bowler);
 *   // every ball:
 *   const p = dyn.ballProbabilities(batter, bowler, sit);   // -> probabilities to sample from
 *   ... sample an outcome with your own RNG ...
 *   outcome = dyn.applyLuck(outcome, ctx);                   // optional luck layer
 *   dyn.afterBall(outcome, sit, batter, bowler);             // MUST be called after every ball
 *
 * All ratings are 0-100. Map your own player fields onto BatterIn / BowlerIn.
 */

export type Drama = 'realistic' | 'dramatic' | 'chaos';
export type Phase = 'PP' | 'MID' | 'DEATH';
export type Aggression = 'Defensive' | 'Balanced' | 'Aggressive' | 'All-out';
export type FieldSetting = 'Defensive' | 'Balanced' | 'Attacking';
export type BowlingPlan = 'Stock' | 'Yorkers' | 'Bouncers' | 'Slower balls';
export type Pitch = 'Flat' | 'Seam-friendly' | 'Spin-friendly' | 'Slow';

export interface DynamicsConfig {
  overs: number; // overs per innings (20 for T20, 50 for ODI, custom allowed)
  pitch: Pitch;
  dew: boolean;
  drama: Drama;
  rng: () => number; // returns [0,1)
}

export interface BatterIn {
  id: string;
  technique: number;
  power: number;
  vsBowlerType: number; // rating vs the bowler's type (pace or spin) 0-100
  temperament: number;
  consistency: number; // low = boom/bust, high = steady
  form: number; // -10..+10
  fatigue: number; // 0..100
  ballsFaced: number; // in current innings
  runs: number; // in current innings
}

export interface BowlerIn {
  id: string;
  skill: number;
  accuracy: number;
  variation: number;
  phaseSkill: number; // powerplay skill in PP, death skill in DEATH, else (accuracy+variation)/2
  isSpin: boolean;
  form: number; // -10..+10
  fatigue: number; // 0..100
  consistency?: number; // optional, default 65
}

export interface BallSituation {
  over: number; // 0-based over index
  ballsBowled: number; // legal balls bowled in this innings
  innings: 1 | 2;
  runs: number;
  wickets: number;
  maxWickets: number;
  target?: number; // second innings only
  aggression: Aggression;
  field: FieldSetting;
  plan: BowlingPlan;
  freeHit?: boolean;
}

export interface BallProbabilities {
  dot: number;
  one: number;
  two: number;
  three: number;
  four: number;
  six: number;
  wicket: number;
  wide: number;
  noBall: number;
}

export type BallOutcome = 'dot' | '1' | '2' | '3' | '4' | '6' | 'W' | 'wide' | 'noball';

export interface LuckResult {
  outcome: BallOutcome;
  note?: string; // e.g. 'dropped catch', 'misfield', 'overthrow', 'edge for four', 'run out', 'retired hurt'
  extraRuns?: number;
  retiredHurt?: boolean;
}

type Rates = { dot: number; one: number; two: number; three: number; four: number; six: number; w: number };
const T20_BASE: Record<Phase, Rates> = {
  PP: { dot: 0.36, one: 0.33, two: 0.064, three: 0.006, four: 0.152, six: 0.052, w: 0.041 },
  MID: { dot: 0.35, one: 0.375, two: 0.068, three: 0.006, four: 0.094, six: 0.042, w: 0.038 },
  DEATH: { dot: 0.29, one: 0.3, two: 0.072, three: 0.006, four: 0.116, six: 0.09, w: 0.068 },
};
const ODI_BASE: Record<Phase, Rates> = {
  PP: { dot: 0.43, one: 0.33, two: 0.062, three: 0.006, four: 0.092, six: 0.021, w: 0.022 },
  MID: { dot: 0.49, one: 0.35, two: 0.066, three: 0.006, four: 0.057, six: 0.017, w: 0.019 },
  DEATH: { dot: 0.33, one: 0.32, two: 0.076, three: 0.006, four: 0.097, six: 0.05, w: 0.052 },
};

const AGG_BOUNDARY: Record<Aggression, number> = { Defensive: 0.68, Balanced: 1, Aggressive: 1.25, 'All-out': 1.55 };
const AGG_WICKET: Record<Aggression, number> = { Defensive: 0.72, Balanced: 1, Aggressive: 1.2, 'All-out': 1.5 };
const AGG_DOT: Record<Aggression, number> = { Defensive: 1.18, Balanced: 1, Aggressive: 0.86, 'All-out': 0.8 };

/** All randomness knobs in one place. Tune these first if matches feel too wild or too flat. */
export const TUNING = {
  dayFormBase: 0.022, // base spread of hidden day-form
  dayFormConsistency: 0.0004, // extra spread per missing consistency point
  dreamDayChance: 0.03, // chance a player has a dream/disaster day
  pitchEaseSd: 0.03,
  pitchWicketSd: 0.045,
  freakPitchChance: 0.015,
  magicOver: 0.004, // chance per over of a "magic over" (bowler unplayable)
  carnageOver: 0.004, // chance per over of a "carnage over" (batter takes over)
  bowlerOnTop: 0.04,
  batterOnTop: 0.04,
  collapsePerWicket: 0.045, // wicket multiplier added per wicket in last 18 balls (max 3)
  freshBatter: 1.04,
  pressureWicket: 0.22,
  bowlerMoodWicket: 0.06,
  maxWicketMult: 2.4, // hard cap vs base wicket rate
  maxBoundaryMult: 2.8,
};

const DRAMA_SCALE: Record<Drama, number> = { realistic: 1, dramatic: 1.3, chaos: 1.7 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function phaseOf(over: number, overs: number): Phase {
  let pp: number;
  let death: number;
  if (overs >= 40) {
    pp = 10;
    death = overs - 10;
  } else if (overs >= 15) {
    pp = 6;
    death = overs - 4;
  } else {
    pp = Math.max(1, Math.round(overs * 0.3));
    death = Math.max(pp, overs - Math.max(1, Math.round(overs * 0.2)));
  }
  return over < pp ? 'PP' : over >= death ? 'DEATH' : 'MID';
}

export type OverMode = 'normal' | 'bowler_on_top' | 'batter_on_top' | 'magic_over' | 'carnage_over';

export class MatchDynamics {
  private cfg: DynamicsConfig;
  private ds: number; // drama scale

  // hidden match-level state
  readonly pitchEase: number; // >1 = batting paradise, <1 = bowler's pitch
  readonly pitchWicket: number; // >1 = more wickets
  private dayMult = new Map<string, number>();

  // live state
  pressure = 25; // 0-100, of the CURRENT batting team
  momentum = 0; // -1..+1 for the batting team
  private bowlerMood = new Map<string, number>();
  private recentWickets: number[] = []; // legal ball indices at which wickets fell
  private ballIdx = 0;
  private dotStreak = 0;
  private flow = new Map<string, number>(); // batterId -> remaining flow balls
  overMode: OverMode = 'normal';
  private newBatterBalls = 99;
  private consecWickets = 0;

  constructor(cfg: DynamicsConfig) {
    this.cfg = cfg;
    this.ds = DRAMA_SCALE[cfg.drama];
    const r = cfg.rng;
    // hidden pitch behaviour (report is only a hint)
    const gauss = () => this.gauss();
    let ease = Math.exp(gauss() * TUNING.pitchEaseSd * this.ds);
    let wk = Math.exp(gauss() * TUNING.pitchWicketSd * this.ds);
    if (cfg.pitch === 'Flat') {
      ease *= 1.05;
      wk *= 0.93;
    } else if (cfg.pitch === 'Seam-friendly') {
      ease *= 0.96;
      wk *= 1.08;
    } else if (cfg.pitch === 'Spin-friendly') {
      ease *= 0.97;
      wk *= 1.05;
    } else if (cfg.pitch === 'Slow') {
      ease *= 0.93;
      wk *= 1.02;
    }
    // rare "freak" pitch: road or minefield
    const freak = r();
    if (freak < TUNING.freakPitchChance * this.ds) {
      ease *= 1.12;
      wk *= 0.85;
    } else if (freak > 1 - TUNING.freakPitchChance * this.ds) {
      ease *= 0.9;
      wk *= 1.22;
    }
    this.pitchEase = ease;
    this.pitchWicket = wk;
  }

  // ----------------------------------------------------------------
  // utilities
  // ----------------------------------------------------------------
  private gauss(): number {
    const r = this.cfg.rng;
    let u = 0;
    let v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  /** Hidden "day form" multiplier for a player in this match. Fat tails for dream/disaster days. */
  private dayForm(id: string, consistency: number): number {
    let m = this.dayMult.get(id);
    if (m === undefined) {
      const sd = (TUNING.dayFormBase + (100 - consistency) * TUNING.dayFormConsistency) * this.ds;
      let g = this.gauss() * sd;
      // 6% of players have a dream day or a disaster day
      if (this.cfg.rng() < TUNING.dreamDayChance * this.ds) g += this.gauss() * sd * 2.2;
      m = Math.exp(g);
      this.dayMult.set(id, m);
    }
    return m;
  }

  /** Reveal-able for UI ("Batter looks in great touch today"). 1.0 = normal. */
  getDayForm(id: string): number {
    return this.dayMult.get(id) ?? 1;
  }

  private parRate(): number {
    return this.cfg.overs > 25 ? 5.8 : 8.3;
  }

  // ----------------------------------------------------------------
  // over start: roll the over mode (this is where 6-six overs and 4-wicket overs come from)
  // ----------------------------------------------------------------
  startOver(sit: BallSituation, batter: BatterIn, bowler: BowlerIn): OverMode {
    const r = this.cfg.rng();
    const ds = this.ds;
    // bias by bowler mood / form / fatigue and batter flow
    const mood = this.bowlerMood.get(bowler.id) ?? 0;
    const bowlEdge = clamp(bowler.form * 0.012 + mood * 0.05 - bowler.fatigue * 0.0006, -0.15, 0.15);
    const batEdge = clamp(batter.form * 0.012 + (this.momentum > 0 ? this.momentum * 0.06 : 0), -0.15, 0.15);
    const pBowler = clamp((TUNING.bowlerOnTop + bowlEdge * 0.6 - batEdge * 0.25) * ds, 0.02, 0.25);
    const pBatter = clamp((TUNING.batterOnTop + batEdge * 0.6 - bowlEdge * 0.25) * ds, 0.02, 0.25);
    const pMagic = clamp(TUNING.magicOver * ds * (1 + bowlEdge * 3), 0.002, 0.03);
    const pCarnage = clamp(TUNING.carnageOver * ds * (1 + batEdge * 3), 0.002, 0.03);
    let mode: OverMode = 'normal';
    let acc = pMagic;
    if (r < acc) mode = 'magic_over';
    else if (r < (acc += pCarnage)) mode = 'carnage_over';
    else if (r < (acc += pBowler)) mode = 'bowler_on_top';
    else if (r < (acc += pBatter)) mode = 'batter_on_top';
    this.overMode = mode;
    return mode;
  }

  // ----------------------------------------------------------------
  // THE CORE: probabilities for the next ball
  // ----------------------------------------------------------------
  ballProbabilities(batter: BatterIn, bowler: BowlerIn, sit: BallSituation): BallProbabilities {
    const overs = this.cfg.overs;
    const phase = phaseOf(sit.over, overs);
    const big = overs > 25;
    const base = (big ? ODI_BASE : T20_BASE)[phase];

    // --- effective ratings incl. form, fatigue, day-form
    const settle = Math.min(1, batter.ballsFaced / (big ? 22 : 14));
    let bat = batter.technique * 0.32 + batter.power * 0.22 + batter.vsBowlerType * 0.3 + batter.temperament * 0.16;
    bat *= (1 + batter.form * 0.01) * (1 - Math.max(0, batter.fatigue - 40) * 0.0017) * (0.9 + 0.1 * settle);
    bat *= this.dayForm(batter.id, batter.consistency);

    let bowl = bowler.skill * 0.4 + bowler.accuracy * 0.22 + bowler.variation * 0.14 + bowler.phaseSkill * 0.24;
    bowl *= (1 + bowler.form * 0.01) * (1 - Math.max(0, bowler.fatigue - 40) * 0.0017);
    bowl *= this.dayForm(bowler.id, bowler.consistency ?? 65);

    const diff = (bat - bowl) / 55;

    // --- pressure effect (temperament shields against pressure)
    const pe = clamp(((this.pressure - 40) / 100) * (1.15 - batter.temperament / 100), -0.3, 0.6);

    // --- collapse / fragility
    const lastWindow = this.recentWickets.filter((b) => this.ballIdx - b <= 18).length;
    let wktMult = 1 + TUNING.collapsePerWicket * Math.min(3, lastWindow);
    if (this.newBatterBalls < 6) wktMult *= TUNING.freshBatter;
    // hat-tricks stay rare: the third wicket in a row is harder
    if (this.consecWickets >= 2) wktMult *= 0.55;

    // --- over mode multipliers
    let mW = 1;
    let mB = 1;
    let mS = 1;
    let mD = 1;
    switch (this.overMode) {
      case 'bowler_on_top':
        mW = 1.35;
        mB = 0.72;
        mS = 0.75;
        mD = 1.15;
        break;
      case 'batter_on_top':
        mW = 0.8;
        mB = 1.35;
        mS = 1.5;
        mD = 0.88;
        break;
      case 'magic_over':
        mW = 2.7;
        mB = 0.4;
        mS = 0.35;
        mD = 1.4;
        break;
      case 'carnage_over':
        mW = 0.5;
        mB = 2.3;
        mS = 3.0;
        mD = 0.55;
        break;
    }

    // --- momentum
    const mo = this.momentum;
    const momB = mo > 0 ? 1 + 0.25 * mo * this.ds : 1 + 0.15 * mo * this.ds;
    const momW = 1 - 0.2 * mo * this.ds;

    // --- batter flow
    const inFlow = (this.flow.get(batter.id) ?? 0) > 0;
    const flowB = inFlow ? 1.22 : 1;
    const flowW = inFlow ? 0.9 : 1;

    // --- bowler mood (confidence)
    const bm = this.bowlerMood.get(bowler.id) ?? 0;
    const bmW = 1 + TUNING.bowlerMoodWicket * bm;
    const bmB = 1 - 0.15 * bm;

    // --- pitch / dew / spin-vs-pace
    let pitchW = this.pitchWicket;
    let pitchB = this.pitchEase;
    if (this.cfg.pitch === 'Seam-friendly' && !bowler.isSpin && phase === 'PP') pitchW *= 1.1;
    if (this.cfg.pitch === 'Spin-friendly' && bowler.isSpin) pitchW *= 1.12;
    if (this.cfg.dew && sit.innings === 2) {
      pitchB *= 1.05;
      pitchW *= 0.92;
    }
    if (sit.innings === 2 && bowler.isSpin) pitchW *= 1.04;

    // --- field setting and bowling plan
    const fieldB = sit.field === 'Attacking' ? 1.12 : sit.field === 'Defensive' ? 0.84 : 1;
    const fieldW = sit.field === 'Attacking' ? 1.14 : sit.field === 'Defensive' ? 0.86 : 1;
    const fieldOne = sit.field === 'Defensive' ? 1.15 : sit.field === 'Attacking' ? 0.92 : 1;
    let planB = 1;
    let planW = 1;
    let planDot = 1;
    if (sit.plan === 'Yorkers') {
      planB = clamp(1.1 - (bowler.phaseSkill / 70) * 0.28, 0.7, 1.15);
      planDot = 1.06;
      planW = phase === 'DEATH' ? 1.06 : 0.95;
    } else if (sit.plan === 'Bouncers') {
      planW = 1.1;
      planB = 1.12;
    } else if (sit.plan === 'Slower balls') {
      planW = 1.06;
      planB = 0.93;
      planDot = 1.05;
    }

    // --- clutch: tight finishes reward temperament
    let clutchB = 1;
    let clutchW = 1;
    if (sit.innings === 2 && sit.target) {
      const ballsLeft = overs * 6 - sit.ballsBowled;
      const need = sit.target - sit.runs;
      const norm = (this.parRate() / 8.3) * (ballsLeft / 6) * 8.3;
      if (ballsLeft <= 18 && need > 0 && need <= norm * 1.6) {
        const c = (batter.temperament - 60) / 200;
        clutchB = 1 + c * 1.5;
        clutchW = 1 - c;
      }
    }

    // --- aggression (the manager's buttons) with pressure interplay
    const aggB = AGG_BOUNDARY[sit.aggression];
    const aggW = AGG_WICKET[sit.aggression] * (1 + (sit.aggression === 'Aggressive' || sit.aggression === 'All-out' ? Math.max(0, pe) * 0.4 : 0));
    const aggD = AGG_DOT[sit.aggression];

    // --- assemble
    const boundaryScale = clamp(1 + diff * 0.42, 0.55, 1.8) * aggB * fieldB * planB * pitchB * momB * flowB * bmB * mB * clutchB * (1 - pe * 0.18) * 1.02;
    const powerScale = Math.pow(clamp(batter.power, 20, 100) / 62, 1.25);

    let w = base.w * clamp(1 - diff * 0.42, 0.6, 1.6) * aggW * fieldW * planW * pitchW * wktMult * momW * flowW * bmW * mW * clutchW * (1 + pe * TUNING.pressureWicket);
    w = Math.min(w, base.w * TUNING.maxWicketMult * Math.max(1, this.pitchWicket));
    w *= 1 + (1 - settle) * 0.22;
    let four = base.four * boundaryScale * (0.75 + 0.25 * (batter.technique / 70));
    let six = Math.min(base.six * boundaryScale * powerScale * mS, base.six * TUNING.maxBoundaryMult * 1.8);
    let dot = base.dot * clamp(1 - diff * 0.3, 0.6, 1.5) * aggD * planDot * mD * (1 + pe * 0.5);
    const one = base.one * fieldOne * (sit.aggression === 'Defensive' ? 1.06 : 1);
    const two = base.two;
    const three = base.three;

    const total = dot + one + two + three + four + six + w;
    const wideP = phase === 'DEATH' ? 0.036 : 0.028;
    const nbP = 0.0065 * (sit.plan === 'Yorkers' ? 1.8 : 1) * (this.overMode === 'carnage_over' ? 1.5 : 1);
    return {
      dot: dot / total,
      one: one / total,
      two: two / total,
      three: three / total,
      four: four / total,
      six: six / total,
      wicket: w / total,
      wide: wideP * (1 + Math.max(0, -bm) * 0.5),
      noBall: nbP,
    };
  }

  // ----------------------------------------------------------------
  // Luck layer (call AFTER you sampled an outcome, BEFORE you apply it)
  // ----------------------------------------------------------------
  applyLuck(outcome: BallOutcome, wicketType?: string): LuckResult {
    const r = this.cfg.rng;
    const s = this.ds;
    if (outcome === 'W') {
      if (wicketType === 'Caught' && r() < 0.13) return { outcome: 'dot', note: 'dropped catch' };
      if (wicketType === 'Caught behind' && r() < 0.05) return { outcome: 'dot', note: 'edge falls short of the keeper' };
      return { outcome };
    }
    if (outcome === 'dot') {
      if (r() < 0.015 * s) return { outcome: '4', note: 'edge for four' };
      if (r() < 0.03) return { outcome: '1', note: 'misfield' };
    } else if (outcome === '1' || outcome === '2') {
      if (r() < 0.011 * s) return { outcome: 'W', note: 'run out' };
      if (r() < 0.012) return { outcome: (outcome === '1' ? '2' : '3') as BallOutcome, note: 'overthrow / misfield' };
    }
    // retired hurt (tiny chance, per ball, for the batter)
    if (r() < 0.00012 * s) return { outcome, retiredHurt: true, note: 'retired hurt' };
    return { outcome };
  }

  // ----------------------------------------------------------------
  // State update after every ball (MUST be called)
  // ----------------------------------------------------------------
  afterBall(outcome: BallOutcome, sit: BallSituation, batter: BatterIn, bowler: BowlerIn, legalBall = true) {
    const par = this.parRate();
    if (legalBall) {
      this.ballIdx++;
      this.consecWickets = outcome === 'W' ? this.consecWickets + 1 : 0;
    }
    this.newBatterBalls++;

    const isBoundary = outcome === '4' || outcome === '6';
    // pressure
    let p = this.pressure;
    if (outcome === 'W') {
      p += sit.wickets <= 3 && sit.over < 10 ? 14 : 10;
      this.newBatterBalls = 0;
      this.recentWickets.push(this.ballIdx);
      this.flow.set(batter.id, 0);
    } else if (outcome === 'dot') p += 1.4;
    else if (outcome === '1') p -= 0.6;
    else if (outcome === '2') p -= 1.2;
    else if (outcome === '4') p -= 6;
    else if (outcome === '6') p -= 9;
    if (sit.innings === 2 && sit.target && legalBall) {
      const ballsLeft = Math.max(1, this.cfg.overs * 6 - sit.ballsBowled);
      const rrr = (((sit.target - sit.runs) / ballsLeft) * 6 * 8.3) / par;
      p += clamp((rrr - 8.3) * 0.18, -0.6, 1.2);
    }
    this.pressure = clamp(p + (25 - p) * 0.02, 0, 100);

    // dot streak
    if (outcome === 'dot') this.dotStreak++;
    else if (outcome !== 'wide') this.dotStreak = 0;
    if (this.dotStreak >= 4) this.flow.set(batter.id, 0);

    // momentum
    let m = this.momentum * 0.96;
    if (outcome === '4') m += 0.16;
    else if (outcome === '6') m += 0.24;
    else if (outcome === 'W') m -= 0.34;
    else if (outcome === 'dot') m -= 0.03;
    this.momentum = clamp(m, -1, 1);

    // batter flow: a set batter hitting freely goes into flow (or a sudden explosion)
    if (batter.ballsFaced >= 10 && !(this.flow.get(batter.id) ?? 0)) {
      const sr = batter.ballsFaced > 0 ? (batter.runs / batter.ballsFaced) * 100 : 0;
      const parSr = (par / 6) * 100;
      if (sr >= parSr * 1.15 && this.cfg.rng() < 0.08) this.flow.set(batter.id, 12);
      else if (batter.ballsFaced >= 20 && this.cfg.rng() < 0.012 * this.ds) this.flow.set(batter.id, 14); // sudden explosion
    }
    const f = this.flow.get(batter.id) ?? 0;
    if (f > 0) this.flow.set(batter.id, f - 1);

    // bowler mood
    let bm = this.bowlerMood.get(bowler.id) ?? 0;
    if (outcome === 'W') bm += 0.28;
    else if (isBoundary) bm -= outcome === '6' ? 0.2 : 0.12;
    else if (outcome === 'dot') bm += 0.04;
    this.bowlerMood.set(bowler.id, clamp(bm * 0.97, -1, 1));
  }

  /** Call when a new innings starts. Pressure/momentum reset, hidden pitch and day-form persist. */
  newInnings() {
    this.pressure = 25;
    this.momentum = 0;
    this.recentWickets = [];
    this.ballIdx = 0;
    this.dotStreak = 0;
    this.flow.clear();
    this.newBatterBalls = 99;
    this.consecWickets = 0;
    this.overMode = 'normal';
  }

  /** Optional: textual hints for UI/commentary. */
  describeState(): { pressure: string; momentum: string; overMode: OverMode } {
    const p = this.pressure;
    const m = this.momentum;
    return {
      pressure: p > 70 ? 'Intense pressure' : p > 50 ? 'Building pressure' : p < 15 ? 'Cruising' : 'Steady',
      momentum: m > 0.5 ? 'Batting side on a roll' : m < -0.5 ? 'Bowling side on top' : 'Even contest',
      overMode: this.overMode,
    };
  }
}
