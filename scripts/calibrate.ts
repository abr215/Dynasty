import {generatePlayers} from '../src/engine/players';
import {simulateDelivery} from '../src/engine/ballSimulation';
const players=generatePlayers();
const pick=(n:number,seed:number)=>{const arr=players.filter(p=>p.nationality==='India'||true);return arr;};
function mkTeam(id:string,idx:number,pitch:any):any{
  const pool=players.filter(p=>p.overall>=78);
  const xi:any[]=[];
  const want=['Opener','Opener','Top-order','Middle-order','Wicketkeeper-Batter','Batting All-rounder','Bowling All-rounder','Spin Bowler','Pace Bowler','Pace Bowler','Pace Bowler'];
  const used=new Set<string>();
  for(const r of want){const c=pool.filter(p=>p.role===r&&!used.has(p.id));const p=c[Math.floor(Math.random()*c.length)];used.add(p.id);xi.push(p);}
  return {id,name:id,pitch,kind:'bot',playerIds:xi.map(p=>p.id),playingXI:xi.map(p=>p.id),record:{played:10},tacticalRoles:{},bowlingPlan:{},wicketkeeperId:xi[4].id};
}
function playInnings(game:any,battingId:string,bowlingId:string,target?:number){
  const m=game.liveMatch;const bt=game.teams.find((t:any)=>t.id===battingId),bw=game.teams.find((t:any)=>t.id===bowlingId);
  const inn:any={battingTeamId:battingId,bowlingTeamId:bowlingId,runs:0,wickets:0,balls:0,target,strikerId:bt.playingXI[0],nonStrikerId:bt.playingXI[1],bowlerId:'',events:[],freeHit:false};
  let next=2;const overs:Record<string,number>={};let last='';const bowlers=bw.playingXI.map((id:string)=>players.find(p=>p.id===id)!).filter((p:any)=>p.bowlingRating>=55);
  m.innings=target===undefined?1:2;
  while(inn.balls<120&&inn.wickets<10&&!(target!==undefined&&inn.runs>=target)){
    if(inn.balls%6===0){const el=bowlers.filter((b:any)=>b.id!==last&&(overs[b.id]??0)<4);const b=el[Math.floor(Math.random()*el.length)]||bowlers[0];inn.bowlerId=b.id;last=b.id;overs[b.id]=(overs[b.id]??0)+1;}
    const e=simulateDelivery(game,inn);inn.events.push(e);inn.runs+=e.runs;
    const legal=e.legal!==false&&e.outcome!=='WD'&&e.outcome!=='NB';
    if(legal){inn.balls++;m.playerBalls[e.strikerId]=(m.playerBalls[e.strikerId]||0)+1;}
    m.playerRuns[e.strikerId]=(m.playerRuns[e.strikerId]||0)+(e.batRuns||0);
    inn.freeHit=e.outcome==='NB';
    if(e.wicket){inn.wickets++;const out=e.dismissedPlayerId||e.strikerId;if(next<11){if(out===inn.strikerId)inn.strikerId=bt.playingXI[next++];else inn.nonStrikerId=bt.playingXI[next++];}else break;}
    else if((e.completedRuns??e.runs)%2===1&&legal||(!legal&&e.batRuns%2===1)){const t=inn.strikerId;inn.strikerId=inn.nonStrikerId;inn.nonStrikerId=t;}
    if(legal&&inn.balls%6===0){const t=inn.strikerId;inn.strikerId=inn.nonStrikerId;inn.nonStrikerId=t;}
  }
  return inn;
}
const N=Number(process.argv[2]||1500);const pitches=['flat','spin-friendly','seam-friendly','slow'];
let sc:number[]=[],aos=0,chaseWins=0,chaseAO=0,w1=0,w2=0,over200=0,under100=0,close=0,fiftiesPlus=0,thirds=0;
for(let i=0;i<N;i++){
  const pitch=pitches[i%4];const A=mkTeam('A',0,pitch),B=mkTeam('B',1,pitch);
  const game:any={players,teams:[A,B],liveMatch:{fixtureId:'fx'+i,homeTeamId:'A',awayTeamId:'B',innings:1,ballsPerInnings:120,playerRuns:{},playerBalls:{}}};
  const i1=playInnings(game,'A','B');const i2=playInnings(game,'B','A',i1.runs+1);
  sc.push(i1.runs,i2.runs);w1+=i1.wickets;w2+=i2.wickets;
  if(i1.wickets>=10)aos++;if(i2.wickets>=10){aos++;chaseAO++;}
  if(i2.runs>i1.runs)chaseWins++;
  for(const x of[i1.runs,i2.runs]){if(x>=200)over200++;if(x<100)under100++;}
  if(Math.abs(i1.runs-i2.runs)<=10)close++;
  // runs by batters
  const per:Record<string,number>=game.liveMatch.playerRuns;
}
const avg=sc.reduce((a,b)=>a+b,0)/sc.length;const sd=Math.sqrt(sc.reduce((a,b)=>a+(b-avg)**2,0)/sc.length);
console.log(`matches=${N} avg=${avg.toFixed(1)} sd=${sd.toFixed(1)} wk/inn 1st=${(w1/N).toFixed(2)} 2nd=${(w2/N).toFixed(2)} chaseWin=${(100*chaseWins/N).toFixed(1)}% allOut=${(100*aos/(2*N)).toFixed(1)}% chaseAllOut=${(100*chaseAO/N).toFixed(1)}% 200+=${(100*over200/(2*N)).toFixed(1)}% <100=${(100*under100/(2*N)).toFixed(1)}% closeWithin10=${(100*close/N).toFixed(1)}%`);
