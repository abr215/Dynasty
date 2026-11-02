import type {GameState, Player, Role, Team} from './types';

export type AuctionTier = Player['basePriceTier'];
export interface AuctionSignal { key: string; group: string; score: number }
export interface AuctionAssessment {
  eligible: boolean;
  fairValue: number;
  maxBid: number;
  interest: number;
  signalScore: number;
  signalCount: number;
  strategy: string;
  reasons: string[];
  signals: AuctionSignal[];
}

export const AUCTION_DECISION_SIGNAL_COUNT = 110;
const clamp = (v:number,min=0,max=1) => Math.max(min,Math.min(max,v));
const n = (v:number,lo=0,hi=100) => clamp((v-lo)/(hi-lo || 1));
export const auctionBasePrice = (p:Player):number => ({Marquee:2,A:1,B:.5,C:.3,Uncapped:.2}[p.basePriceTier]);
export const auctionTierOrder = (p:Player):number => ({Uncapped:0,C:1,B:2,A:3,Marquee:4}[p.basePriceTier]);
export const auctionBidIncrement = (bid:number):number => bid<1?.05:bid<2?.1:bid<5?.2:.25;
export const auctionNextBid = (bid:number,base:number):number => bid>0?+(bid+auctionBidIncrement(bid)).toFixed(2):base;
export const auctionMoney = (v:number):string => v<1?`₹${Math.round(v*100)} L`:`₹${v.toFixed(2).replace(/\.00$/,'')} Cr`;

export function auctionRoleGroup(role:Role):keyof Team['squadNeeds'] {
  if (role==='Pace Bowler') return 'pace';
  if (role==='Spin Bowler') return 'spin';
  if (role.includes('All-rounder')) return 'all';
  if (role==='Wicketkeeper-Batter') return 'wk';
  return 'bat';
}

function countRoster(team:Team,game:GameState) {
  const roster=team.playerIds.map(id=>game.players.find(p=>p.id===id)).filter(Boolean) as Player[];
  return {
    roster,
    bat:roster.filter(p=>['Opener','Top-order','Middle-order','Finisher','Wicketkeeper-Batter'].includes(p.role)).length,
    pace:roster.filter(p=>p.role==='Pace Bowler').length,
    spin:roster.filter(p=>p.role==='Spin Bowler').length,
    all:roster.filter(p=>p.role.includes('All-rounder')).length,
    wk:roster.filter(p=>p.role==='Wicketkeeper-Batter').length,
    overseas:roster.filter(p=>p.overseas).length,
  };
}

function playerRoleFit(p:Player,team:Team,game:GameState) {
  const c=countRoster(team,game);
  const group=auctionRoleGroup(p.role);
  const need=team.squadNeeds[group] ?? 0;
  const count=c[group] ?? 0;
  const size=Math.max(1,game.rules.maxSquad);
  const progress=team.playerIds.length/size;
  return {c,group,need,count,progress};
}

function skillScore(p:Player) {
  const roleSkill = p.role==='Pace Bowler'||p.role==='Spin Bowler'
    ? p.bowlingRating
    : p.role.includes('All-rounder') ? (p.battingRating*.52+p.bowlingRating*.48)
    : p.battingRating;
  return roleSkill;
}

/**
 * The manager scores 100 separate signals in 10 decision groups. The signals include
 * player quality, skill fit, role scarcity, roster composition, development, conditions,
 * market timing, price pressure, rival budgets, and manager personality. The result is
 * an explainable valuation, not a random bid.
 */
export function assessAuctionBid(
  team:Team,
  player:Player,
  game:GameState,
  currentBid=0,
  rivals:Team[]=game.teams,
  lotIndex=0,
  lotCount=Math.max(1,game.auction.lotIds.length),
):AuctionAssessment {
  const base=auctionBasePrice(player);
  const {c,group,need,count,progress}=playerRoleFit(player,team,game);
  const startingPurse=Math.max(1,game.rules.startingPurse || team.auctionBudget || team.purse || 100);
  const target=Math.max(1,game.rules.maxSquad || game.rules.minSquad || 15);
  const spotsLeft=Math.max(0,target-team.playerIds.length);
  const otherSpots=Math.max(0,spotsLeft-1);
  const overseasAllowed=!player.overseas || c.overseas < game.rules.maxOverseasSquad;
  const squadAllowed=team.playerIds.length < target;
  const remainingBudgetFloor=Math.max(.2,Math.min(1.2,(startingPurse/target)*.5));
  const futureReserve=otherSpots*remainingBudgetFloor;
  const financiallyAvailable=Math.max(0,team.purse-futureReserve);
  const perPlayerCeiling=startingPurse*.60;
  const affordability=clamp(team.purse/startingPurse);
  const budgetPerSpot=team.purse/Math.max(1,spotsLeft);
  const lotProgress=clamp(lotIndex/Math.max(1,lotCount-1));
  const recommendedPortfolioSlots=Math.min(target,Math.max(3,Math.ceil(target*(.34+.66*lotProgress))));
  const pacingAllowed=team.playerIds.length<recommendedPortfolioSlots||lotProgress>=.94;
  const currentPriceRatio=currentBid/Math.max(base,.2);
  const roleNeedRatio=clamp(need/5);
  const skill=skillScore(player);
  const rosterAverage=c.roster.length?c.roster.reduce((s,p)=>s+p.overall,0)/c.roster.length:0;
  const rolePeers=c.roster.filter(p=>auctionRoleGroup(p.role)===group);
  const roleAverage=rolePeers.length?rolePeers.reduce((s,p)=>s+p.overall,0)/rolePeers.length:0;
  const matchingPlayers=game.players.filter(p=>auctionRoleGroup(p.role)===group && !game.auction.soldIds.includes(p.id) && !game.teams.some(t=>t.playerIds.includes(p.id)));
  const topPeer=matchingPlayers.length?Math.max(...matchingPlayers.map(p=>p.overall)):player.overall;
  const roleScarcity=1-clamp((matchingPlayers.length-1)/Math.max(4,target));
  const pitchFit=team.pitch==='flat'
    ? (player.role==='Opener'||player.role==='Top-order'||player.role==='Finisher'?1:.65)
    : team.pitch==='spin-friendly'
      ? (player.role==='Spin Bowler'||player.bowlingType==='spin'?1:player.role.includes('All-rounder')?.78:.56)
      : team.pitch==='seam-friendly'
        ? (player.role==='Pace Bowler'||player.bowlingType==='pace'?1:player.role.includes('All-rounder')?.78:.56)
        : (player.role==='Spin Bowler'||player.role.includes('All-rounder')?.88:.7);
  const rivalsWithSlots=rivals.filter(t=>t.id!==team.id&&t.playerIds.length<target);
  const competingRivals=rivalsWithSlots.filter(t=>{
    const rg=auctionRoleGroup(player.role);
    const rCount=countRoster(t,game);
    const foreignOk=!player.overseas||rCount.overseas<game.rules.maxOverseasSquad;
    return foreignOk && t.purse>=base && ((t.squadNeeds[rg]??0)>0 || t.playerIds.length<Math.ceil(target*.6));
  });
  const rivalPurses=competingRivals.map(t=>t.purse).sort((a,b)=>b-a);
  const bestRivalPurse=rivalPurses[0]??0;
  const leader=rivals.find(t=>t.id===game.auction.leadingTeamId);
  const leaderPurse=leader?.purse ?? 0;
  const pursePressure=leader&&leader.id!==team.id?clamp((leaderPurse-team.purse)/startingPurse):0;
  const rivalNeeds=competingRivals.length?Math.max(...competingRivals.map(t=>(t.squadNeeds[group]??0)/5)):0;
  const career=player.career;
  const experience=clamp(career.matches/60);
  const careerOutput=player.role.includes('Bowler')?clamp(career.wickets/50):clamp(career.runs/1500);
  const battingOrBowlingVsPitch=team.pitch==='flat'?n(player.battingRating,40,100):team.pitch==='spin-friendly'?n(player.bowlingRating,40,100):team.pitch==='seam-friendly'?n(player.bowlingRating,45,100):n((player.battingRating+player.bowlingRating)/2,35,100);
  const form=n(player.form,35,95);
  const morale=n(player.morale,40,100);
  const sharpness=n(player.sharpness,40,100);
  const fitness=n(player.attrs.fitness,35,100);
  const agePeak=clamp(1-Math.abs(player.age-28)/22);
  const youth=clamp((36-player.age)/16);
  const injuryRisk=player.injury?player.injury.severity==='Season-ending'?1:player.injury.severity==='Serious'?.8:player.injury.severity==='Moderate'?.45:.2:0;
  const aggression=clamp(team.auctionAggression/100);
  const prudence=1-aggression;
  const roleBalance=clamp(1-(count/Math.max(1,target*.45)));
  const roleReplacement=1-clamp(roleAverage/100);
  const overseasPressure=player.overseas?clamp(c.overseas/Math.max(1,game.rules.maxOverseasSquad)):0;
  const budgetBurn=1-affordability;
  const priceDiscipline=1-clamp(currentBid/Math.max(1,startingPurse*.6));
  const qualityGap=clamp((player.overall-rosterAverage+25)/60);
  const captaincy= n(player.attrs.leadership,45,100);
  const versatility=clamp((Number(player.role.includes('All-rounder'))*0.55 + Number(player.role==='Wicketkeeper-Batter')*.2 + Number(player.bowlingType!=='none')*.25));
  const temperament=n(player.attrs.temperament,45,100);
  const potential=n(player.attrs.potential,50,100);
  const accuracy=n(player.attrs.accuracy,40,100);
  const deathSkill=n(player.attrs.deathBowling,35,100);
  const powerplaySkill=n(player.attrs.powerplayBowling,35,100);
  const variation=n(player.attrs.variation,35,100);
  const power=n(player.attrs.powerHitting,35,100);
  const technique=n(player.attrs.technique,35,100);
  const paceSkill=n(player.attrs.vsPace,35,100);
  const spinSkill=n(player.attrs.vsSpin,35,100);
  const running=n(player.attrs.running,35,100);
  const consistency=n(player.attrs.consistency,40,100);
  const fielding=n(player.fieldingRating,35,100);
  const roleNeed=clamp(need/4);
  const lateUrgency=clamp((lotProgress-.45)/.55);
  const reservePressure=clamp(futureReserve/Math.max(1,team.purse));
  const valueGap=clamp((currentBid/Math.max(base,.2))/8);
  const rivalAffordability=clamp(bestRivalPurse/startingPurse);
  const marketHeat=clamp(competingRivals.length/Math.max(1,game.teams.length-1));
  const contenderStrength=clamp(competingRivals.filter(t=>t.purse>=startingPurse*.25).length/Math.max(1,game.teams.length-1));
  const opportunityCost=clamp((team.purse/Math.max(1,spotsLeft))/startingPurse*target);
  const nominationValue=clamp((player.overall-60)/40);
  const tierValue=player.basePriceTier==='Marquee'?1:player.basePriceTier==='A'?.82:player.basePriceTier==='B'?.62:player.basePriceTier==='C'?.4:.22;
  const internationalDemand=player.overseas?clamp(competingRivals.filter(t=>countRoster(t,game).overseas<game.rules.maxOverseasSquad).length/Math.max(1,game.teams.length-1)):1;
  const domesticFit=player.nationality==='India'?.98:.72;
  const sameNationBalance=clamp(1-c.roster.filter(p=>p.nationality===player.nationality).length/Math.max(1,target*.5));
  const auctionStageValue=lotProgress<.25?.72:lotProgress<.65?.9:1;
  const availableDepth=clamp(matchingPlayers.length/Math.max(1,target));
  const pressureOpportunity=leader&&leader.id!==team.id&&leaderPurse>=team.purse*1.5?1:0;
  const closingSlots=clamp((spotsLeft/target));
  const needUrgency=roleNeed*closingSlots;
  const antiOverpay=clamp(1-currentBid/Math.max(1,perPlayerCeiling));
  const reserveSafety=clamp((team.purse-futureReserve)/startingPurse);

  // 11 categories × 10 named signals = 110 manager inputs. All scores are normalized.
  const signals:AuctionSignal[] = [
    ...[
      ['overall-quality',n(player.overall,45,100)],['role-skill',n(skill,35,100)],['batting-output',n(player.battingRating,30,100)],['bowling-output',n(player.bowlingRating,25,100)],['fielding-value',fielding],['power-hitting',power],['technical-security',technique],['pace-matchup',paceSkill],['spin-matchup',spinSkill],['consistency-rating',consistency]
    ].map(([key,score])=>({key:String(key),group:'player-quality',score:Number(score)})),
    ...[
      ['current-form',form],['morale',morale],['sharpness',sharpness],['fitness',fitness],['temperament',temperament],['career-experience',experience],['career-output',careerOutput],['age-peak-window',agePeak],['recent-form-recovery',clamp((player.form-50)/45)],['fatigue-readiness',1-n(player.fatigue,0,100)]
    ].map(([key,score])=>({key:String(key),group:'form-and-condition',score:Number(score)})),
    ...[
      ['development-potential',potential],['youth-upside',youth],['retirement-risk',1-n(player.retirementRisk,0,100)],['future-resale-value',clamp(youth*.6+potential*.4)],['contract-flexibility',n(player.contract.yearsLeft,0,4)],['leadership-profile',captaincy],['adaptability',versatility],['long-term-fitness',fitness],['improvement-headroom',clamp((player.attrs.potential-player.overall+30)/50)],['age-risk-adjustment',1-clamp(Math.max(0,player.age-32)/12)]
    ].map(([key,score])=>({key:String(key),group:'development',score:Number(score)})),
    ...[
      ['declared-role-need',roleNeed],['role-depth-gap',roleBalance],['weakest-role-replacement',roleReplacement],['roster-quality-gap',qualityGap],['wicketkeeper-cover',group==='wk'?roleNeed:clamp(1-c.wk/2)],['pace-attack-depth',group==='pace'?roleNeed:clamp(1-c.pace/5)],['spin-attack-depth',group==='spin'?roleNeed:clamp(1-c.spin/3)],['all-rounder-balance',group==='all'?roleNeed:clamp(1-c.all/3)],['squad-build-progress',progress],['lineup-role-compatibility',clamp(roleNeed*.65+qualityGap*.35)]
    ].map(([key,score])=>({key:String(key),group:'squad-need',score:Number(score)})),
    ...[
      ['home-pitch-fit',pitchFit],['conditions-skill-match',battingOrBowlingVsPitch],['seam-threat',team.pitch==='seam-friendly'?n(player.bowlingRating,50,100):.55],['spin-threat',team.pitch==='spin-friendly'?n(player.bowlingRating,50,100):.55],['flat-track-batting',team.pitch==='flat'?n(player.battingRating,50,100):.55],['death-over-utility',player.role.includes('Bowler')?deathSkill:power],['powerplay-utility',player.role.includes('Bowler')?powerplaySkill:technique],['variation-toolkit',variation],['control-and-accuracy',accuracy],['two-skill-flexibility',versatility]
    ].map(([key,score])=>({key:String(key),group:'tactical-fit',score:Number(score)})),
    ...[
      ['role-market-scarcity',roleScarcity],['top-peer-quality-gap',n(player.overall-topPeer+50,0,100)],['unclaimed-role-depth',availableDepth],['marquee-premium',tierValue],['overall-market-rank',nominationValue],['role-demand-vs-supply',clamp((target*game.teams.length/Math.max(1,matchingPlayers.length))/2)],['wicketkeeper-scarcity',group==='wk'?clamp(1-matchingPlayers.length/Math.max(1,target)):0.5],['overseas-player-availability',internationalDemand],['auction-stage-premium',auctionStageValue],['market-heat',marketHeat]
    ].map(([key,score])=>({key:String(key),group:'market-scarcity',score:Number(score)})),
    ...[
      ['available-purse',affordability],['budget-per-open-slot',clamp(budgetPerSpot/Math.max(1,startingPurse/target))],['minimum-squad-reserve',reserveSafety],['remaining-purse-discipline',priceDiscipline],['purse-burn-pressure',1-budgetBurn],['single-player-cap-room',antiOverpay],['future-slot-reserve',1-reservePressure],['opportunity-cost',opportunityCost],['base-price-affordability',clamp((team.purse-base)/Math.max(1,team.purse))],['value-for-money',clamp(1-currentBid/Math.max(1,perPlayerCeiling))]
    ].map(([key,score])=>({key:String(key),group:'financial-discipline',score:Number(score)})),
    ...[
      ['rival-purse-strength',rivalAffordability],['rival-role-need',rivalNeeds],['number-of-contenders',marketHeat],['contender-budget-health',contenderStrength],['leader-purse-pressure',pursePressure],['pressure-bid-opportunity',pressureOpportunity],['rival-affordability-gap',clamp((bestRivalPurse-team.purse+startingPurse)/ (2*startingPurse))],['rival-roster-completion',clamp(1-(Math.max(0,...competingRivals.map(t=>t.playerIds.length))/target))],['competitive-denial-value',clamp(rivalNeeds*.7+marketHeat*.3)],['auction-contest-depth',clamp(competingRivals.length/Math.max(1,game.teams.length-1))]
    ].map(([key,score])=>({key:String(key),group:'rivalry',score:Number(score)})),
    ...[
      ['manager-aggression',aggression],['manager-prudence',prudence],['manager-risk-tolerance',aggression*.8+form*.2],['patient-bidding-style',prudence*.75+priceDiscipline*.25],['contrarian-entry',clamp((1-marketHeat)*.6+roleNeed*.4)],['late-auction-urgency',lateUrgency],['surprise-reentry-appetite',clamp(aggression*.65+roleNeed*.35)],['pressure-play-appetite',clamp(aggression*.55+pressureOpportunity*.45)],['star-chasing-tendency',clamp(aggression*.5+tierValue*.5)],['budget-protection-instinct',clamp(prudence*.6+reserveSafety*.4)]
    ].map(([key,score])=>({key:String(key),group:'manager-psychology',score:Number(score)})),
    ...[
      ['current-price-vs-base',1-clamp(currentPriceRatio/20)],['increment-affordability',clamp((team.purse-currentBid)/Math.max(.05,auctionBidIncrement(currentBid||base)))],['nomination-order-value',lotProgress],['tier-timing',tierValue*auctionStageValue],['remaining-role-lots',availableDepth],['remaining-team-demand',closingSlots],['bid-price-curve',1-clamp(currentBid/Math.max(1,base*10))],['late-purse-protection',1-clamp(lotProgress*budgetBurn)],['auction-window-value',clamp(1-Math.abs(lotProgress-.6))],['closing-lot-alert',clamp((lotProgress-.75)/.25)]
    ].map(([key,score])=>({key:String(key),group:'auction-timing',score:Number(score)})),
    ...[
      ['overseas-quota-room',player.overseas?1-overseasPressure:1],['domestic-squad-balance',domesticFit],['nationality-balance',sameNationBalance],['injury-risk-adjustment',1-injuryRisk],['fielding-and-athleticism',fielding],['bowling-control-profile',accuracy],['late-overs-suitability',player.role.includes('Bowler')?deathSkill:power],['match-winning-ceiling',clamp((player.overall-60)/40)],['team-average-upgrade',qualityGap],['role-versatility-premium',versatility]
    ].map(([key,score])=>({key:String(key),group:'squad-and-match-utility',score:Number(score)})),
  ];
  const groupAverage=(name:string)=>{const values=signals.filter(s=>s.group===name);return values.reduce((sum,s)=>sum+s.score,0)/Math.max(1,values.length)};
  const signalScore=signals.reduce((sum,s)=>sum+s.score,0)/signals.length;
  const q=groupAverage('player-quality');
  const f=groupAverage('form-and-condition');
  const d=groupAverage('development');
  const needScore=groupAverage('squad-need');
  const tactics=groupAverage('tactical-fit');
  const scarcity=groupAverage('market-scarcity');
  const psych=groupAverage('manager-psychology');
  const matchUtility=groupAverage('squad-and-match-utility');
  const financial=groupAverage('financial-discipline');
  const rivalry=groupAverage('rivalry');
  const timing=groupAverage('auction-timing');
  const difficulty=game.league.difficulty==='Legend'?1.09:game.league.difficulty==='Hard'?1.045:game.league.difficulty==='Easy'?.93:1;
  // Each of the 11 ten-signal groups now influences valuation. The cap and
  // remaining-squad reserve are applied after fair value so psychology never
  // overrides the manager's budget discipline.
  const rawFairValue=(base + Math.max(0,player.overall-64)*.38 + Math.max(0,skill-75)*.055 + Math.max(0,need-1)*.52 + Math.max(0,player.form-65)*.035 + Math.max(0,player.attrs.potential-player.overall)*.025 + (tactics-.5)*1.4 + (scarcity-.5)*1.2 + (matchUtility-.5)*.7 + (d-.5)*.45 + (f-.5)*.7 + (financial-.5)*.65 + (rivalry-.5)*.6 + (timing-.5)*.45 + (signalScore-.5)*.45) * (0.91 + q*.18 + needScore*.08) * (0.88 + psych*.24) * difficulty;
  // A contested player can earn a controlled market premium. This is a manager-specific
  // stretch based on aggression, role urgency and scarcity; it never bypasses the global
  // 60%-of-original-purse ceiling or the required reserve for the remaining squad.
  const contestStretch=1+clamp(aggression*.22+roleNeed*.12+scarcity*.04,0,.36);
  const fairValue=Math.max(base,+(rawFairValue*contestStretch).toFixed(2));
  const maxBid=Math.max(0,+Math.min(fairValue,perPlayerCeiling,financiallyAvailable).toFixed(2));
  const eligible=squadAllowed&&overseasAllowed&&team.purse>=base&&maxBid>=base;
  const interest=eligible?clamp((maxBid-base)/Math.max(1,perPlayerCeiling-base)):.0;
  const reasons:string[]=[];
  if(need>=3)reasons.push(`Priority role: ${group}`);
  if(player.overall>=90)reasons.push('Elite player quality');
  if(player.form>=82)reasons.push('Strong current form');
  if(roleScarcity>.6)reasons.push('Limited role supply');
  if(pitchFit>.85)reasons.push('Excellent home-pitch fit');
  if(financiallyAvailable<fairValue)reasons.push('Future-squad reserve protects purse');
  if(player.overseas&&c.overseas>=game.rules.maxOverseasSquad-1)reasons.push('Overseas quota nearly full');
  if(!pacingAllowed)reasons.push('Squad pacing: protecting room for later premium lots; may still contest if value is strong');
  if(!reasons.length)reasons.push('Value and squad balance assessment');
  const strategy=pressureOpportunity&&need>=2?'Purse-pressure challenger':lateUrgency>.55?'Late-market opportunist':aggression>.72?'Aggressive value hunter':prudence>.65?'Disciplined budget manager':'Balanced squad builder';
  return {eligible,fairValue,maxBid,interest,signalScore,signalCount:signals.length,strategy,reasons,signals};
}

export interface BidCandidate { team:Team; assessment:AuctionAssessment; priority:number; surprise:boolean; pressurePlay:boolean }
export function chooseAuctionChallenger(
  player:Player,
  game:GameState,
  currentBid:number,
  leaderId:string|undefined,
  biddersThisLot:string[],
  lotIndex:number,
  lotCount:number,
  random=Math.random,
):BidCandidate|undefined {
  const next=auctionNextBid(currentBid,auctionBasePrice(player));
  const candidates=game.teams.filter(t=>t.kind==='bot'&&t.id!==leaderId).map(team=>{
    const assessment=assessAuctionBid(team,player,game,currentBid,game.teams,lotIndex,lotCount);
    const leader=game.teams.find(t=>t.id===leaderId);
    const pressurePlay=Boolean(leader&&leader.id!==team.id&&leader.purse>=team.purse*1.45&&assessment.maxBid>=next&&assessment.interest>.25&&assessment.reasons.some(r=>r.startsWith('Priority role')));
    const surprise=!biddersThisLot.includes(team.id)&&currentBid>0&&assessment.maxBid>=next&&assessment.interest>.30;
    const surpriseChance=assessment.interest>.72?.38:assessment.interest>.5?.30:.22;
    const surpriseBoost=surprise&&random()<surpriseChance?1.22:1;
    const pressureBoost=pressurePlay&&random()<.30?1.16:1;
    const urgency=team.playerIds.length<Math.ceil(game.rules.maxSquad*.55)?1.18:team.playerIds.length<Math.ceil(game.rules.maxSquad*.8)?1.08:1;
    const stableHash=[...team.id+player.id].reduce((sum,c)=>sum+c.charCodeAt(0),0)%11/100;
    const priority=(assessment.maxBid + assessment.interest*1.6 + (team.auctionAggression/100)*.65 + urgency*.3 + stableHash)*surpriseBoost*pressureBoost;
    return {team,assessment,priority,surprise:surprise&&surpriseBoost>1,pressurePlay:pressurePlay&&pressureBoost>1};
  }).filter(c=>c.assessment.eligible&&c.assessment.maxBid>=next&&c.team.purse>=next)
    // Bidding-war discipline: near the top of its own valuation a manager often walks away instead of chasing.
    // Role-critical lots (priority role) and low-interest-fatigue managers are less likely to fold.
    .filter(c=>{
      const ratio=next/Math.max(1,c.assessment.maxBid);
      if(ratio<=0.88)return true;
      const critical=c.assessment.reasons.some(r=>r.startsWith('Priority role'));
      const foldChance=(critical?0.18:0.42)+(ratio-0.88)*1.4-(c.team.auctionAggression/100)*0.25;
      return random()>Math.max(0.05,Math.min(0.85,foldChance));
    });
  if(!candidates.length)return undefined;
  candidates.sort((a,b)=>b.priority-a.priority||b.assessment.maxBid-a.assessment.maxBid);
  // A little personality variance stops every franchise acting like the same script.
  const top=candidates[0];
  if(candidates.length>1&&random()<.12){
    const second=candidates[1];
    if(second.assessment.interest>top.assessment.interest*.82)return second;
  }
  return top;
}

export function runSmartAuction(game:GameState,lots:Player[]):void {
  const target=game.rules.maxSquad||game.rules.minSquad;
  const working=game.teams.map(t=>({...t,playerIds:[...t.playerIds],purse:t.purse,squadNeeds:{...t.squadNeeds}}));
  const owned=new Set(working.flatMap(t=>t.playerIds));
  let available=lots.filter(p=>!owned.has(p.id)).sort((a,b)=>b.overall-a.overall||auctionTierOrder(b)-auctionTierOrder(a)||a.name.localeCompare(b.name));
  const openSlots=working.reduce((sum,t)=>sum+Math.max(0,target-t.playerIds.length),0);
  // Broaden the pool only if an older/incomplete career lacks enough nominated players.
  if(available.length<openSlots){
    const availableIds=new Set(available.map(p=>p.id));
    for(const p of game.players)if(!owned.has(p.id)&&!availableIds.has(p.id)){available.push(p);availableIds.add(p.id);}
    available.sort((a,b)=>b.overall-a.overall||auctionTierOrder(b)-auctionTierOrder(a)||a.name.localeCompare(b.name));
  }
  const alreadySold=new Set(game.auction.soldIds);
  let guard=0;
  const totalLots=Math.max(1,available.length+working.reduce((n,t)=>n+t.playerIds.length,0));
  while(working.some(t=>t.playerIds.length<target)&&available.length&&guard<game.players.length*3){
    guard++;
    const openTeams=working.filter(t=>t.playerIds.length<target);
    if(!openTeams.length)break;
    // Prioritise the player that is scarcest for open teams, while leaving high-value lots until later.
    let pickedIndex=available.findIndex(p=>openTeams.some(t=>{
      const overseas=t.playerIds.map(id=>game.players.find(x=>x.id===id)).filter((x):x is Player=>x!==undefined&&x.overseas).length;
      return (!p.overseas||overseas<game.rules.maxOverseasSquad)&&t.purse>=auctionBasePrice(p);
    }));
    if(pickedIndex<0)break;
    const p=available.splice(pickedIndex,1)[0];
    const viable=openTeams.map(t=>{
      const assessment=assessAuctionBid(t,p,{...game,teams:working},0,working,totalLots-available.length,Math.max(1,totalLots));
      const slotsLeft=target-t.playerIds.length;
      const pacing=clampBudget(t.purse,game.rules.startingPurse,slotsLeft);
      const need= t.squadNeeds[auctionRoleGroup(p.role)]??0;
      const fitBonus=need*.24;
      const score=assessment.maxBid + fitBonus + pacing + ((target-t.playerIds.length)/target)*.2;
      return {team:t,assessment,score};
    }).filter(x=>x.assessment.eligible&&x.team.purse>=auctionBasePrice(p));
    viable.sort((a,b)=>b.score-a.score||a.team.playerIds.length-b.team.playerIds.length||a.team.id.localeCompare(b.team.id));
    let chosen=viable[0];
    if(!chosen){
      const fallback=openTeams.filter(t=>t.purse>=auctionBasePrice(p)).sort((a,b)=>clampBudget(b.purse,game.rules.startingPurse,target-b.playerIds.length)-clampBudget(a.purse,game.rules.startingPurse,target-a.playerIds.length)||a.playerIds.length-b.playerIds.length)[0];
      if(!fallback){available.push(p);continue;}
      chosen={team:fallback,assessment:assessAuctionBid(fallback,p,{...game,teams:working},0,working,game.auction.soldIds.length,Math.max(1,lots.length)),score:0};
    }
    const winner=chosen.team;
    const runner=viable.find(x=>x.team.id!==winner.id);
    const base=auctionBasePrice(p);
    const slotReserve=Math.max(.2,Math.min(1.2,(game.rules.startingPurse/target)*.5))*Math.max(0,target-winner.playerIds.length-1);
    const cap=Math.min(chosen.assessment.maxBid,game.rules.startingPurse*.6,Math.max(base,winner.purse-slotReserve));
    const runnerValue=runner?Math.min(runner.assessment.maxBid,cap):base;
    const clearing=runner?Math.max(base,runnerValue+auctionBidIncrement(runnerValue)):base;
    const price=+Math.min(cap,Math.max(base,clearing)).toFixed(2);
    winner.purse=Math.max(0,+(winner.purse-price).toFixed(2));
    winner.playerIds.push(p.id);
    const group=auctionRoleGroup(p.role);
    winner.squadNeeds[group]=Math.max(0,(winner.squadNeeds[group]??0)-1);
    alreadySold.add(p.id);
  }
  // Final roster completion: if unusual quota/budget constraints blocked a lot, fill open slots from the best eligible reserve players at base price.
  while(working.some(t=>t.playerIds.length<target)){
    const team=working.filter(t=>t.playerIds.length<target).sort((a,b)=>a.playerIds.length-b.playerIds.length||b.purse-a.purse)[0];
    if(!team)break;
    const currentOwned=new Set(working.flatMap(t=>t.playerIds));
    const overseas=team.playerIds.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>p!==undefined&&p.overseas).length;
    const eligibleReserve=game.players.filter(x=>!currentOwned.has(x.id)&&(!x.overseas||overseas<game.rules.maxOverseasSquad)&&team.purse>=auctionBasePrice(x));
    // Completion must never break the overseas quota. Prefer affordable domestic depth if
    // the high-rated overseas options are no longer eligible.
    const p=eligibleReserve.sort((a,b)=>auctionTierOrder(a)-auctionTierOrder(b)||b.overall-a.overall||a.name.localeCompare(b.name))[0];
    if(!p)break;
    team.playerIds.push(p.id);
    const base=auctionBasePrice(p);
    team.purse=Math.max(0,+(team.purse-base).toFixed(2));
    const g=auctionRoleGroup(p.role);team.squadNeeds[g]=Math.max(0,(team.squadNeeds[g]??0)-1);
    alreadySold.add(p.id);
  }
  for(const t of working){
    const actual=game.teams.find(x=>x.id===t.id);
    if(actual){actual.playerIds=t.playerIds.slice(0,target);actual.purse=+t.purse.toFixed(2);actual.auctionBudget=game.rules.startingPurse;actual.squadNeeds={...t.squadNeeds};}
  }
  const ownedAfterAuction=new Set(working.flatMap(t=>t.playerIds));
  const actuallySold=lots.filter(p=>ownedAfterAuction.has(p.id)).map(p=>p.id);
  const actuallyUnsold=lots.filter(p=>!ownedAfterAuction.has(p.id)).map(p=>p.id);
  game.auction.soldIds=[...new Set([...game.auction.soldIds,...actuallySold])];
  game.auction.unsoldIds=[...new Set([...(game.auction.unsoldIds??[]),...actuallyUnsold])].filter(id=>!ownedAfterAuction.has(id));
  game.auction.status='complete';
  game.auction.skipped=true;
  game.auction.completedAt=new Date().toISOString();
  game.phase='squads';
}
function clampBudget(purse:number,starting:number,slots:number){
  const perSlot=Math.max(.2,Math.min(1.2,starting/Math.max(1,slots)*.5));
  return clamp(purse/Math.max(.2,slots*perSlot),0,2);
}
