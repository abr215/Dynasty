import type { BallEvent, GameState, LiveInnings, PitchType, Player, Team } from './types';
import { commentary, type NarrativeKind } from './matchNarrative';

const clamp = (n:number, lo:number, hi:number) => Math.max(lo, Math.min(hi, n));
const rand = () => Math.random();
const lerp = (a:number,b:number,t:number) => a+(b-a)*clamp(t,0,1);
function hash01(str:string):number{let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}return ((h>>>0)%100000)/100000;}
/** Match-level conditions are derived from the fixture id so every match feels different but stays stable while it is played. */
export function matchConditions(fixtureId:string, innings:number, timeOfDay:'day'|'night'='night'){
  const dewRoll=hash01(fixtureId+'|dew');
  const dew=timeOfDay==='night'&&dewRoll<0.62; // dew is only possible in night fixtures
  const dewStrength=dew?0.25+hash01(fixtureId+"|dewS")*0.55:0;
  const mood=(hash01(fixtureId+'|mood|'+innings)-0.5)*2; // -1 bowling day ... +1 batting day for this innings
  const pitchLife=hash01(fixtureId+'|pitch'); // 0 = two-paced/low, 1 = true and bouncy
  return {dew,dewStrength,mood,pitchLife};
}
const isLegal = (e:BallEvent) => e.legal !== false && e.outcome !== 'WD' && e.outcome !== 'NB';

function teamXI(game:GameState, team:Team):Player[] {
  const picked = team.playingXI?.length >= 11 ? team.playingXI : team.playerIds;
  return picked.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>!!p).slice(0,11);
}
function onPitch(pitch:PitchType, player:Player, batting:boolean):number {
  if(pitch==='flat') return batting ? 3.5 : -1.2;
  if(pitch==='seam-friendly') return !batting && player.bowlingType==='pace' ? 7.5 : batting ? -3.5 : 0;
  if(pitch==='spin-friendly') return !batting && player.bowlingType==='spin' ? 8.5 : batting ? -2.2 : 0;
  return batting ? -3.2 : player.bowlingType==='spin' ? 4.5 : 0.5;
}
function phaseFor(inn:LiveInnings, ballsPerInnings:number):'powerplay'|'middle'|'death' {
  const ratio = inn.balls / Math.max(1, ballsPerInnings);
  const pp = ballsPerInnings <= 120 ? 0.30 : 0.20;
  return ratio < pp ? 'powerplay' : ratio >= 0.80 ? 'death' : 'middle';
}
function inningsPressure(inn:LiveInnings, currentRR:number, rrr:number):number {
  // Pressure is now a *context* number (used for intent and shot-risk), not a wicket-pump.
  const wickets = inn.wickets * 2.2 + Math.max(0, inn.wickets-5) * 1.6;
  const recent = inn.events.slice(-12);
  const recentWickets = recent.filter(e=>e.wicket).length * 1.6;
  let dotStreak=0;
  for(let i=inn.events.length-1;i>=0;i--){
    const e=inn.events[i]; if(!isLegal(e)) continue;
    if(e.runs===0) dotStreak++; else break;
  }
  const dotPressure=Math.min(8,dotStreak*1.3);
  const chasePressure=inn.target!==undefined ? clamp((rrr-currentRR)*1.5,-6,16) : 0;
  return clamp(wickets+recentWickets+dotPressure+chasePressure,0,60);
}
function deliverySkill(game:GameState, inn:LiveInnings, batter:Player, bowler:Player, battingTeam:Team, bowlingTeam:Team, pitch:PitchType, phase:'powerplay'|'middle'|'death') {
  const matchup = bowler.bowlingType==='spin' ? batter.attrs.vsSpin : bowler.bowlingType==='pace' ? batter.attrs.vsPace : batter.attrs.paceSpinSkill;
  const phaseBowl = phase==='powerplay' ? bowler.attrs.powerplayBowling : phase==='death' ? bowler.attrs.deathBowling : bowler.attrs.accuracy;
  const batterRole = battingTeam.tacticalRoles?.[batter.id] ?? '';
  const bowlingPlan = bowlingTeam.bowlingPlan?.[bowler.id] ?? 'Flexible';
  const currentRR = inn.balls > 0 ? inn.runs*6/inn.balls : 0;
  const ballsLeft = Math.max(1, (game.liveMatch?.ballsPerInnings ?? 120)-inn.balls);
  const required = inn.target!==undefined ? Math.max(0, inn.target-inn.runs) : 0;
  const rrr = inn.target!==undefined ? required*6/ballsLeft : 0;
  const pressure = inningsPressure(inn,currentRR,rrr);
  const urgency = inn.target!==undefined ? clamp((rrr-currentRR)*0.03,-0.12,0.22) : 0;
  const wicketsInHand = 10-inn.wickets;
  // --- Set-batter model: a batter who has faced 20+ balls is hard to dislodge; a new one is vulnerable.
  const faced = game.liveMatch?.playerBalls?.[batter.id] ?? 0;
  const scored = game.liveMatch?.playerRuns?.[batter.id] ?? 0;
  const setness = clamp((faced-3)/22,0,1)*0.85 + clamp(scored/45,0,1)*0.15;
  // --- Desperation: only when the ask is genuinely steep. Shapes shot choice, never guarantees a wicket.
  const desperation = inn.target!==undefined ? clamp((rrr-11.5)/7,0,1) * (ballsLeft<=36?1:0.7) : 0;
  const cond = matchConditions(game.liveMatch?.fixtureId ?? 'm', game.liveMatch?.innings ?? 1, game.liveMatch?.timeOfDay??'night');
  const secondInnings = inn.target!==undefined;
  const dewEase = secondInnings ? cond.dewStrength : 0; // 0..1, helps batters, hurts bowlers' grip
  const phaseIntent = phase==='death' ? 0.16 : phase==='powerplay' ? 0.07 : 0;
  const roleIntent = /Aggressor|Finisher|Powerplay/i.test(batterRole) ? 0.07 : /Anchor/i.test(batterRole) ? -0.08 : 0;
  const intent = clamp(0.43+phaseIntent+urgency+roleIntent+(pressure>35?0.03:0)+desperation*0.11-(wicketsInHand<=3&&desperation<0.4?0.10:0)-setness*0.02,0.12,0.94);
  const battingSkill = clamp(
    batter.battingRating*0.40 + batter.attrs.technique*0.15 + batter.attrs.powerHitting*0.10 + matchup*0.12 + batter.attrs.running*0.035 + batter.form*0.09 + batter.morale*0.045 + batter.sharpness*0.035 + batter.attrs.temperament*0.045 - batter.fatigue*0.055 + onPitch(pitch,batter,true) + cond.mood*3.2 + dewEase*0.6 + setness*2.5 + (batterRole==='Finisher'&&phase==='death'?3:0) + (batterRole==='Powerplay aggressor'&&phase==='powerplay'?2:0), 20, 108);
  const bowlingSkill = clamp(
    bowler.bowlingRating*0.42 + phaseBowl*0.17 + bowler.attrs.accuracy*0.10 + bowler.attrs.variation*0.075 + bowler.attrs.consistency*0.055 + bowler.form*0.08 + bowler.sharpness*0.055 + bowler.morale*0.035 + bowler.attrs.temperament*0.035 - bowler.fatigue*0.065 + onPitch(pitch,bowler,false) - dewEase*0.6 - cond.mood*2.2 + (bowlingPlan=== (phase==='powerplay'?'Powerplay':phase==='middle'?'Middle overs':'Death') ? 2.4 : 0), 20, 108);
  return { battingSkill, bowlingSkill, edge:(battingSkill-bowlingSkill)/100, intent, pressure, currentRR, rrr, ballsLeft, phase, setness, desperation, dewEase, mood:cond.mood, pitchLife:cond.pitchLife };
}

function scoreOutcome(edge:number,intent:number,phase:'powerplay'|'middle'|'death',setness=0,desperation=0,mood=0,dewEase=0):'0'|'1'|'2'|'3'|'4'|'6' {
  // Weights are normalized after contextual adjustments. Most legal balls remain dots or singles;
  // skilled batting increases boundaries but never guarantees one. Set batters find gaps and boundaries more
  // easily, and a steep chase makes shots go big or go wrong (the wicket side lives in simulateDelivery).
  const w = [0.36,0.32,0.085,0.012,0.13,0.063];
  const form = edge + mood*0.03 + dewEase*0.012;
  w[0] -= form*0.11;
  w[1] -= form*0.025;
  w[2] += form*0.018 + setness*0.014;
  w[4] += form*0.075 + (phase==='powerplay'?0.006:0) + (intent-0.43)*0.08 + setness*0.03 + desperation*0.02;
  w[5] += form*0.052 + (phase==='death'?0.016:0) + (intent-0.43)*0.055 + setness*0.018 + desperation*0.05;
  w[0] -= (intent-0.43)*0.08 + setness*0.07;
  w[1] += setness*0.03 - desperation*0.05;
  for(let i=0;i<w.length;i++) w[i]=Math.max(0.002,w[i]);
  const total=w.reduce((a,b)=>a+b,0); const r=rand()*total; let acc=0;
  const values:('0'|'1'|'2'|'3'|'4'|'6')[]=['0','1','2','3','4','6'];
  for(let i=0;i<w.length;i++){acc+=w[i];if(r<acc)return values[i];}
  return '0';
}
function dismissalFor(bowler:Player, bowlingTeam:Team, players:Player[]):{type:BallEvent['dismissalType'];fielderId?:string;kind:NarrativeKind} {
  const picked = bowlingTeam.playingXI?.length >= 11 ? bowlingTeam.playingXI : bowlingTeam.playerIds;
  const xi = picked.map(id=>players.find(p=>p.id===id)).filter((p):p is Player=>!!p).slice(0,11);
  const keeper=xi.find(p=>p.id===bowlingTeam.wicketkeeperId)||xi.find(p=>p.role==='Wicketkeeper-Batter');
  const fielders=xi.filter(p=>p.id!==bowler.id).sort((a,b)=>b.attrs.fielding-a.attrs.fielding);
  const x=rand();
  if(x<0.36)return {type:'caught',fielderId:(fielders[0]||keeper)?.id,kind:'caught'};
  if(x<0.53)return {type:'bowled',kind:'bowled'};
  if(x<0.70)return {type:'lbw',kind:'lbw'};
  if(x<0.78&&bowler.bowlingType==='spin'&&keeper)return {type:'stumped',fielderId:keeper.id,kind:'stumped'};
  // Run-outs are generated only by the separate running-between-wickets pathway below.
  if(x<0.95)return {type:'caught-behind',fielderId:keeper?.id,kind:'caught'};
  return {type:'hit wicket',kind:'wicket'};
}
export function simulateDelivery(game:GameState, inn:LiveInnings):BallEvent {
  const match=game.liveMatch;
  const battingTeam=game.teams.find(t=>t.id===inn.battingTeamId)!;
  const bowlingTeam=game.teams.find(t=>t.id===inn.bowlingTeamId)!;
  const batter=game.players.find(p=>p.id===inn.strikerId)!;
  const bowler=game.players.find(p=>p.id===inn.bowlerId)!;
  const home=game.teams.find(t=>t.id===match?.homeTeamId)!;
  const pitch=home.pitch;
  const phase=phaseFor(inn, match?.ballsPerInnings ?? 120);
  const ctx=deliverySkill(game,inn,batter,bowler,battingTeam,bowlingTeam,pitch,phase);
  const over=Math.floor(inn.balls/6); const ball=(inn.balls%6)+1;
  const id=`${inn.battingTeamId}-${match?.fixtureId??'match'}-${match?.innings??1}-${inn.events.length+1}`;
  const control=bowler.attrs.accuracy*0.58+bowler.attrs.consistency*0.20+bowler.sharpness*0.12+bowler.form*0.10-bowler.fatigue*0.08;
  const wideP=clamp(0.014+(72-control)*0.00023+bowler.fatigue*0.00007,0.004,0.045);
  const noBallP=clamp(0.0035+(68-control)*0.00009+bowler.fatigue*0.000025,0.001,0.018);
  const byeP=0.0075; const legByeP=0.019;
  const roll=rand(); let cursor=0;
  let outcome:BallEvent['outcome']='0',runs=0,batRuns=0,extras=0,completedRuns=0,legal=true;
  let extraType:string|undefined; let wicket=false; let dismissalType:BallEvent['dismissalType']; let dismissedPlayerId:string|undefined; let fielderId:string|undefined;
  let kind:NarrativeKind='dot';
  if(roll<(cursor+=wideP)){outcome='WD';runs=1;extras=1;extraType='wide';legal=false;kind='wide';}
  else if(roll<(cursor+=noBallP)){
    // A no-ball still allows bat runs, but it does not consume a legal delivery.
    const shot=scoreOutcome(ctx.edge,ctx.intent,phase,ctx.setness,ctx.desperation,ctx.mood,ctx.dewEase);
    batRuns=Number(shot);runs=1+batRuns;extras=1;completedRuns=batRuns;
    outcome='NB';extraType='no-ball';legal=false;kind='noBall';
  }
  else if(roll<(cursor+=byeP)){outcome='B';runs=1+(rand()<0.18?2:0);extras=runs;extraType='bye';completedRuns=runs;kind='bye';}
  else if(roll<(cursor+=legByeP)){outcome='LB';runs=1+(rand()<0.35?1:0)+(rand()<0.06?1:0);extras=runs;extraType='leg-bye';completedRuns=runs;kind='legBye';}
  else {
    // --- Wicket probability v2 ---
    // 1) Skill gap and conditions set the base. 2) Pressure/risk add a *small* amount, and set batters absorb most of it.
    // 3) New batters are genuinely vulnerable, set batters genuinely hard to remove. 4) Steep chases create hit-or-miss shots.
    const skillTerm=(ctx.bowlingSkill-ctx.battingSkill)*0.00052;
    const pitchTerm=(pitch==='seam-friendly'&&bowler.bowlingType==='pace'?0.008:0)+(pitch==='spin-friendly'&&bowler.bowlingType==='spin'?0.007:0)+(pitch==='seam-friendly'&&bowler.bowlingType==='pace'&&phase==='powerplay'?0.004:0)+(pitch==='spin-friendly'&&bowler.bowlingType==='spin'&&phase==='middle'?0.003:0)+(ctx.pitchLife<0.25?0.004:0);
    const pressureTerm=ctx.pressure*0.000055*(1-ctx.setness*0.8);
    const riskTerm=(ctx.intent-0.43)*0.020*(1-ctx.setness*0.5);
    const desperationTerm=ctx.desperation*0.020*(1-ctx.setness*0.65);
    const newBatterBoost=lerp(1.28,1,clamp(((game.liveMatch?.playerBalls?.[batter.id]??0))/8,0,1));
    const settledShield=lerp(1,0.60,ctx.setness);
    const dewShield=1-ctx.dewEase*0.05;
    const tailBoost=batter.battingRating<45?1.18:1;
    const base=0.0425+skillTerm+pitchTerm+pressureTerm+riskTerm+desperationTerm+(phase==='death'?0.003:0)+(bowler.attrs.consistency<55?0.004:0);
    const wicketP=inn.freeHit ? 0 : clamp(base*newBatterBoost*settledShield*dewShield*tailBoost,0.008,0.10);
    if(rand()<wicketP){
      outcome='W';runs=0;batRuns=0;extras=0;legal=true;wicket=true;
      const dismissal=dismissalFor(bowler,bowlingTeam,game.players);dismissalType=dismissal.type;fielderId=dismissal.fielderId;kind=dismissal.kind;
      dismissedPlayerId=dismissalType==='run out'&&rand()<0.20?inn.nonStrikerId:batter.id;
      if(wicket){
        const batterName=game.players.find(p=>p.id===dismissedPlayerId)?.name??batter.name;
        return {id,over,ball,strikerId:batter.id,bowlerId:bowler.id,outcome,runs,batRuns,extras,completedRuns,legal,wicket,dismissalType,dismissedPlayerId,fielderId,commentary:commentary(kind,batterName,bowler.name,{phase,pressure:ctx.pressure>38,seq:inn.events.length})};
      }
    }
    if(!wicket){
      const score=scoreOutcome(ctx.edge,ctx.intent,phase,ctx.setness,ctx.desperation,ctx.mood,ctx.dewEase);outcome=score;const n=Number(score);runs=n;batRuns=n;completedRuns=n;
      kind=score==='6'?'six':score==='4'?'four':score==='3'?'three':score==='2'?'two':score==='1'?'single':'dot';
      // Run-outs are rare but more likely when the batting pair take risks under pressure.
      // Run-outs only occur while the pair are running, not on a clean four or six boundary.
      if(n>0 && n<4 && rand()<clamp(0.0015+(ctx.intent*0.004)+(battingTeam.record.played*0.00005),0.0015,0.008)){
        wicket=true;outcome='W';dismissalType='run out';dismissedPlayerId=rand()<0.14?inn.nonStrikerId:batter.id;fielderId=teamXI(game,bowlingTeam).filter(p=>p.id!==bowler.id).sort((a,b)=>b.attrs.fielding-a.attrs.fielding)[0]?.id;kind='runOut';
        // One run of a single can be cut off; on two/three-run attempts, credit only completed runs.
        runs=Math.max(0,n-1);batRuns=runs;completedRuns=runs;
      }
    }
  }
  const batterName=game.players.find(p=>p.id===(dismissedPlayerId??batter.id))?.name??batter.name;
  let text=commentary(kind,batterName,bowler.name,{phase,pressure:ctx.pressure>38,seq:inn.events.length});
  if(outcome==='NB'&&batRuns>0) text+=` The no-ball brings one extra, plus ${batRuns} run${batRuns===1?'':'s'} off the bat.`;
  if(inn.target!==undefined && ctx.rrr>ctx.currentRR+1.75 && runs===0 && !wicket) text+=` ${commentary('pressure',batter.name,bowler.name,{seq:inn.events.length})}`;
  return {id,over,ball,strikerId:batter.id,bowlerId:bowler.id,outcome,runs,batRuns,extras,extraType,completedRuns,legal,wicket,dismissalType,dismissedPlayerId,fielderId,commentary:text};
}

export function getCurrentPartnership(inn:LiveInnings) {
  if(inn.partnershipCurrent) return inn.partnershipCurrent;
  let lastWicket=-1;for(let i=inn.events.length-1;i>=0;i--){if(inn.events[i].wicket){lastWicket=i;break;}}
  const tail=inn.events.slice(lastWicket+1);
  return {batter1Id:inn.strikerId,batter2Id:inn.nonStrikerId,runs:tail.reduce((s,e)=>s+e.runs,0),balls:tail.filter(isLegal).length};
}

export function currentRunChase(inn:LiveInnings, ballsLimit:number) {
  if(inn.target===undefined) return undefined;
  const ballsRemaining=Math.max(0,ballsLimit-inn.balls);
  const runsNeeded=Math.max(0,inn.target-inn.runs);
  const requiredRate=ballsRemaining>0?runsNeeded*6/ballsRemaining:0;
  const currentRate=inn.balls>0?inn.runs*6/inn.balls:0;
  return {target:inn.target,runsNeeded,ballsRemaining,requiredRate,currentRate,neededOvers:`${Math.floor(ballsRemaining/6)}.${ballsRemaining%6}`};
}
