import {useEffect,useRef,useState} from 'react';
import type {ReactNode,InputHTMLAttributes,SelectHTMLAttributes,ChangeEvent} from 'react';
import {Activity,ArrowDown,ArrowLeft,ArrowRight,ArrowUp,BarChart3,CalendarDays,Check,ChevronDown,Crown,Database,Download,FolderOpen,Gavel,Grid3X3,HeartPulse,Flame,LayoutDashboard,Lock,Palette,Play,RefreshCw,Save,Shield,SlidersHorizontal,Sparkles,Target,TrendingUp,Trophy,Upload,UserCheck,Users,Wallet,Zap} from 'lucide-react';
import type {Format,GameState,JerseyStyle,Team,Player,CrestShape,PitchType,Role,Standing,TeamRecord,SeasonPlayerStats,LiveInnings,BallEvent,SeasonArchive,OffseasonState} from './engine/types';
import {generatePlayers} from './engine/players';
import {saveGame,loadGames,loadLatestGame,deleteGame,downloadJSON,readJSONFile} from './engine/store';
import {removePakistaniPlayersFromGame} from './store/gameStore';
import {setGame,useGame} from './store/gameStore';
import {assessAuctionBid,chooseAuctionChallenger,runSmartAuction,AUCTION_DECISION_SIGNAL_COUNT} from './engine/auctionAI';
import {commentary as matchCommentary, MATCH_SCRIPT_COUNT} from './engine/matchNarrative';
import {simulateDelivery, getCurrentPartnership, currentRunChase} from './engine/ballSimulation';
import {getBowlingOptions, bowlerUnavailableReason as engineBowlerUnavailableReason, wouldLeaveBowlingDeadEnd, recommendSafeBowler, bowlingSafetySummary} from './engine/bowlingSafety';

const colors=['#F4B740','#16D7C5','#7A7CFF','#C56BFF','#FF667A','#61C9FF','#8ED081','#F28A52','#D4D8E4','#E65CF6'];
const shapes:CrestShape[]=['shield','roundel','diamond','crown','hex','badge','monogram'];
const jerseys:JerseyStyle[]=['solid','sash','pinstripe','gradient','halves','hoops','split'];
const icons=['lion','tiger','eagle','bolt','crown','bat','ball','mountain','wave','flame','phoenix','falcon','bull','star'];
const botNames=['Royals','Thunderbolts','Falcons','Titans','Warriors','Strikers','Panthers','Comets','Dragons','Blazers','Chargers','Knights','Rangers','Giants'];
const botManagers=['Arjun Mehta','Daniel Brooks','Kabir Rao','Ethan Cole','Vikram Shah','Noah Bennett','Rohan Malhotra','Owen Clarke','Aarav Sethi','Ryan Mercer','Aditya Kapoor','Liam Fraser','Dev Malhotra','Marcus Reed'];
const botGrounds=['Crown Arena','Thunder Dome','Falcon Park','Victory Oval','Summit Ground','Royal Pavilion','Forge Stadium','North Star Arena','The Citadel','Grand Pavilion'];
const pitches:PitchType[]=['flat','spin-friendly','seam-friendly','slow'];
const roleGroup=(r:Role)=>r==='Pace Bowler'?'pace':r==='Spin Bowler'?'spin':r.includes('All-rounder')?'all':r==='Wicketkeeper-Batter'?'wk':'bat';
const money=(n:number)=>n<1?`₹${Math.round(n*100)} L`:`₹${n.toFixed(2).replace(/\.00$/,'')} Cr`;
const basePrice=(p:Player)=>({Marquee:2,A:1,B:.5,C:.3,Uncapped:.2}[p.basePriceTier]);
const bidIncrement=(n:number)=>n<1?.05:n<2?.1:n<5?.2:.25;
const nextBid=(n:number,base:number)=>n>0?+(n+bidIncrement(n)).toFixed(2):base;
const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
const nationalityLabel=(n:string)=>n;
const managerArchetype=(t:Team)=>t.auctionAggression>=84?'Market Disruptor':t.auctionAggression>=74?'Aggressive Builder':t.auctionAggression>=62?'Value Hunter':'Patient Planner';

function Crest({team,size=44}:{team:Pick<Team,'primary'|'secondary'|'crestShape'|'icon'|'code'>;size?:number}){const shape=team.crestShape;return <div className={`crest crest-${shape}`} style={{width:size,height:size,background:`linear-gradient(135deg,${team.primary},${team.secondary})`}}><span>{team.icon==='monogram'?team.code:iconGlyph(team.icon)}</span></div>}
function iconGlyph(icon:string){const map:Record<string,string>={lion:'L',tiger:'T',eagle:'E',bolt:'B',crown:'C',bat:'B',ball:'•',mountain:'M',wave:'W',flame:'F',phoenix:'P',falcon:'F',bull:'B',star:'★'};return map[icon]??icon.slice(0,1).toUpperCase()}
function Logo({large=false}:{large?:boolean}){return <div className={`brand ${large?'brand-large':''}`}><div className="brand-mark"><Crown size={large?28:21}/></div><div><div className="brand-name">DYNASTY<span>T20</span></div><div className="brand-sub">FRANCHISE MANAGER</div></div></div>}
function Panel({children,className='',style}:{children:ReactNode;className?:string;style?:React.CSSProperties}){return <section style={style} className={`panel ${className}`}>{children}</section>}
function Kicker({children}:{children:ReactNode}){return <div className="kicker">{children}</div>}
function Button({children,primary=false,ghost=false,onClick,disabled=false,className=''}:{children:ReactNode;primary?:boolean;ghost?:boolean;onClick?:()=>void;disabled?:boolean;className?:string}){return <button disabled={disabled} onClick={onClick} className={`btn ${primary?'btn-primary':''} ${ghost?'btn-ghost':''} ${className}`}>{children}</button>}
function Field({label,...p}:{label:string}&InputHTMLAttributes<HTMLInputElement>){return <label className="field-wrap"><span>{label}</span><input {...p}/></label>}
function Select({label,children,...p}:{label:string}&SelectHTMLAttributes<HTMLSelectElement>){return <label className="field-wrap"><span>{label}</span><select {...p}>{children}</select></label>}
function Stat({label,value,sub}:{label:string;value:string|number;sub?:string}){return <div className="stat"><span>{label}</span><strong>{value}</strong>{sub&&<small>{sub}</small>}</div>}
function PlayerProfileTrigger({playerId}:{playerId:string}){const open=(e:any)=>{e.preventDefault();e.stopPropagation();window.dispatchEvent(new CustomEvent('dynasty:player-profile',{detail:playerId}));};return <span role="button" tabIndex={0} className="player-profile-trigger" title="Open player career stats" aria-label="Open player career stats" onClick={open} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')open(e);}}><span>☰</span></span>}
function PlayerCareerModal({player,game,onClose}:{player:Player;game:GameState;onClose:()=>void}){
 const c=player.career;const matches=player.matchHistory??[];const seasons=Array.from(new Set(matches.map(x=>x.season))).sort((a,b)=>b-a).map(year=>{const rows=matches.filter(x=>x.season===year);const runs=rows.reduce((n,x)=>n+x.batting.runs,0);const balls=rows.reduce((n,x)=>n+x.batting.balls,0);const outs=rows.filter(x=>x.batting.out).length;const wkts=rows.reduce((n,x)=>n+x.bowling.wickets,0);const bowlBalls=rows.reduce((n,x)=>n+x.bowling.balls,0);const conceded=rows.reduce((n,x)=>n+x.bowling.runsConceded,0);return{year,played:rows.length,innings:rows.filter(x=>x.batting.balls>0||x.batting.runs>0).length,runs,avg:outs?runs/outs:0,sr:balls?runs/balls*100:0,wkts,econ:bowlBalls?conceded*6/bowlBalls:0,catches:rows.reduce((n,x)=>n+x.fielding.catches,0),stumpings:rows.reduce((n,x)=>n+x.fielding.stumpings,0),runouts:rows.reduce((n,x)=>n+x.fielding.runOuts,0)}});
 const team=game.teams.find(t=>t.playerIds.includes(player.id));const fmt=(n:number)=>Number.isFinite(n)?n.toFixed(2):'—';
 return <div className="player-profile-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><section className="player-profile-modal" role="dialog" aria-modal="true" aria-label={`${player.name} career profile`}><header className="player-profile-modal-head"><div className="player-profile-identity"><div className="player-profile-avatar">{player.avatar}</div><div><span className="eyebrow">PLAYER CAREER PROFILE</span><h2>{player.name}</h2><p>{player.nationality} · {player.role} · {player.battingHand} · {player.bowlingType||'No bowling style'}</p><small>{team?`${team.code} · ${team.name}`:'Free Agent'} · Age {player.age} · OVR {player.overall}</small></div></div><button className="player-profile-close" onClick={onClose} aria-label="Close profile">×</button></header>
 <div className="player-profile-body"><div className="player-profile-section-title">CAREER OVERVIEW</div><div className="player-profile-metrics"><div><small>MATCHES</small><b>{c.matches}</b></div><div><small>INNINGS</small><b>{c.innings}</b></div><div><small>RUNS</small><b>{c.runs}</b></div><div><small>AVERAGE</small><b>{fmt(c.avg)}</b></div><div><small>STRIKE RATE</small><b>{fmt(c.sr)}</b></div><div><small>HIGH SCORE</small><b>{c.highest}</b></div><div><small>50s / 100s</small><b>{c.fifties} / {c.hundreds}</b></div><div><small>4s / 6s</small><b>{c.fours} / {c.sixes}</b></div></div>
 <div className="player-profile-section-title">BOWLING CAREER</div><div className="player-profile-metrics"><div><small>WICKETS</small><b>{c.wickets}</b></div><div><small>ECONOMY</small><b>{fmt(c.economy)}</b></div><div><small>BOWLING AVG</small><b>{c.wickets?fmt(c.runsConceded/c.wickets):'—'}</b></div><div><small>BEST FIGURES</small><b>{c.bestFigures||'—'}</b></div><div><small>3W / 4W / 5W</small><b>{c.threeWickets} / {c.fourWickets} / {c.fiveWickets}</b></div><div><small>DOT BALLS</small><b>{c.dotBalls}</b></div><div><small>MAIDENS</small><b>{c.maidens}</b></div><div><small>BALLS BOWLED</small><b>{c.ballsBowled}</b></div></div>
 <div className="player-profile-section-title">FIELDING & SPECIALITY</div><div className="player-profile-metrics"><div><small>CATCHES</small><b>{c.catches}</b></div><div><small>STUMPINGS</small><b>{c.stumpings}</b></div><div><small>RUN OUTS</small><b>{c.runOuts}</b></div><div><small>PLAYER OF MATCH</small><b>{c.pom}</b></div><div><small>BAT STYLE</small><b>{player.battingHand}</b></div><div><small>BOWL STYLE</small><b>{player.bowlingType||'—'}</b></div><div><small>BAT RATING</small><b>{player.battingRating}</b></div><div><small>BOWL RATING</small><b>{player.bowlingRating}</b></div></div>
 <div className="player-profile-section-title">SEASON-BY-SEASON PERFORMANCE</div>{seasons.length?<div className="player-profile-table-wrap"><table className="player-profile-table"><thead><tr><th>SEASON</th><th>MAT</th><th>INN</th><th>RUNS</th><th>AVG</th><th>SR</th><th>WKTS</th><th>ECON</th><th>CT</th><th>RO</th></tr></thead><tbody>{seasons.map(x=><tr key={x.year}><td>{x.year}</td><td>{x.played}</td><td>{x.innings}</td><td>{x.runs}</td><td>{fmt(x.avg)}</td><td>{fmt(x.sr)}</td><td>{x.wkts}</td><td>{fmt(x.econ)}</td><td>{x.catches}</td><td>{x.runouts}</td></tr>)}</tbody></table></div>:<div className="player-profile-empty">No season-by-season match history is saved for this player yet. Career totals above use the player's saved career record.</div>}
 <div className="player-profile-section-title">PLAYER ATTRIBUTES</div><div className="player-profile-attributes"><span>Form <b>{player.form}</b></span><span>Fitness <b>{player.attrs.fitness}</b></span><span>Power <b>{player.attrs.powerHitting}</b></span><span>Technique <b>{player.attrs.technique}</b></span><span>Temperament <b>{player.attrs.temperament}</b></span><span>Fielding <b>{player.fieldingRating}</b></span></div>
 </div></section></div>
}


function App(){const game=useGame();const [screen,setScreen]=useState<'home'|'setup'|'dashboard'|'tournament'|'teams'|'auction'|'squads'|'fixtures'|'season'|'records'|'offseason'|'saves'>('home');const continueCareer=async()=>{try{const latest=await loadLatestGame();if(latest){setGame(latest);setScreen(latest.liveMatch&&latest.liveMatch.status!=='completed'?'season':latest.phase==='auction'?'auction':latest.phase==='squads'?'squads':'dashboard');}}catch{setScreen('saves')}};if(!game)return screen==='setup'?<Setup onBack={()=>setScreen('home')} onCreate={g=>{setGame(g);setScreen('dashboard')}}/>:screen==='saves'?<SaveManager onBack={()=>setScreen('home')}/>:<Home onNew={()=>setScreen('setup')} onLoad={()=>setScreen('saves')} onContinue={continueCareer}/>;return <GameShell game={game} screen={screen} setScreen={setScreen} onReset={()=>{setGame(null);setScreen('home')}}/>}

function Home({onNew,onLoad,onContinue}:{onNew:()=>void;onLoad:()=>void;onContinue:()=>void}){const [hasCareer,setHasCareer]=useState(false);useEffect(()=>{let active=true;loadGames().then(saves=>{if(active)setHasCareer(saves.length>0)}).catch(()=>undefined);return()=>{active=false}},[]);return <div className="title-screen"><div className="title-noise"/><header className="title-head"><Logo large/><Button ghost onClick={onLoad}><FolderOpen size={16}/> Load Career</Button></header><main className="title-main"><div className="title-copy"><Kicker><Zap size={13}/> PROFESSIONAL CRICKET FRANCHISE SIMULATOR</Kicker><h1>Build a franchise.<br/><em>Build an era.</em></h1><p>Own the identity, build the squad, run the auction, choose the XI and manage the season. Designed as a serious management game — not a generic dashboard template.</p><div className="title-actions"><Button primary onClick={onNew}><Play size={17} fill="currentColor"/> Start New Game <ArrowRight size={17}/></Button>{hasCareer&&<Button onClick={onContinue}><RefreshCw size={16}/> Continue Last Career</Button>}<Button ghost onClick={onLoad}>Load Career</Button></div><div className="title-meta"><span><Shield size={15}/> Real player pool</span><span><Gavel size={15}/> Smart AI auction</span><span><Trophy size={15}/> Season records</span><span><Save size={15}/> Automatic recovery saves</span></div></div><div className="title-showcase"><div className="showcase-top"><span>DYNASTY ENGINE</span><span>v3.1</span></div><div className="showcase-logo"><div className="showcase-ring"><Crown size={42}/></div><div><b>DYNASTY</b><small>FRANCHISE MANAGER</small></div></div><div className="showcase-grid"><div><b>01</b><span>Identity</span></div><div><b>02</b><span>Auction</span></div><div><b>03</b><span>XI + Captain</span></div><div><b>04</b><span>Season</span></div></div><div className="showcase-foot"><span>Career protection</span><strong>Autosave + recovery + JSON backup</strong></div></div></main></div>}

function makeRecord():TeamRecord{return{played:0,won:0,lost:0,points:0,nr:0,runsFor:0,runsAgainst:0,netRunRate:0,titles:0,lastFive:[]}}
function makeTeam(i:number,kind:'human'|'bot'):Team{const primary=colors[(i*2)%colors.length],secondary=colors[(i*2+1)%colors.length];return{id:`team-${i+1}`,name:kind==='human'?`My Franchise ${i+1}`:botNames[i%botNames.length],code:kind==='human'?`TM${i+1}`:botNames[i%botNames.length].slice(0,3).toUpperCase(),city:kind==='human'?'': '',ground:kind==='human'?`Home Ground ${i+1}`:botGrounds[i%botGrounds.length],pitch:pitches[i%pitches.length],kind,manager:kind==='human'?`Manager ${i+1}`:botManagers[i%botManagers.length],primary,secondary,jersey:jerseys[i%jerseys.length],crest:botNames[i%botNames.length],crestShape:shapes[i%shapes.length],icon:icons[i%icons.length],purse:100,playerIds:[],auctionBudget:100,auctionAggression:60+(i%4)*10,squadNeeds:{bat:5,pace:4,spin:2,all:2,wk:2},record:makeRecord(),playingXI:[]}}

function selectAuctionPool(players:Player[],target:number):Player[]{
  const order:Record<Player['basePriceTier'],number>={Uncapped:0,C:1,B:2,A:3,Marquee:4};
  const weights:Record<Player['basePriceTier'],number>={Uncapped:.07,C:.20,B:.30,A:.27,Marquee:.16};
  const selected:Player[]=[];const picked=new Set<string>();
  const tiers:Player['basePriceTier'][]=['Uncapped','C','B','A','Marquee'];
  for(const tier of tiers){
    const quota=Math.floor(target*weights[tier]);
    const bucket=players.filter(p=>p.basePriceTier===tier).sort((a,b)=>b.overall-a.overall||a.name.localeCompare(b.name));
    for(const p of bucket.slice(0,quota)){selected.push(p);picked.add(p.id);}
  }
  const fill=players.filter(p=>!picked.has(p.id)).sort((a,b)=>order[a.basePriceTier]-order[b.basePriceTier]||b.overall-a.overall||a.name.localeCompare(b.name));
  while(selected.length<Math.min(target,players.length)&&fill.length){const p=fill.shift()!;selected.push(p);picked.add(p.id);}
  return selected.slice(0,target);
}

function Setup({onBack,onCreate}:{onBack:()=>void;onCreate:(g:GameState)=>void}){
 const [step,setStep]=useState(1); const [format,setFormat]=useState<Format>('T20'); const [teams,setTeams]=useState(6); const [humans,setHumans]=useState(3); const [leagueName,setLeagueName]=useState('Dynasty Championship'); const [overs,setOvers]=useState(20); const [purse,setPurse]=useState(100); const [squadSize,setSquadSize]=useState(15); const availablePoolSize=generatePlayers().length; const [auctionPoolSize,setAuctionPoolSize]=useState(availablePoolSize); const [humanTeams,setHumanTeams]=useState<Team[]>(()=>[0,1,2].map(i=>makeTeam(i,'human')));
 const updateHuman=(i:number,patch:Partial<Team>)=>setHumanTeams(ts=>ts.map((t,n)=>n===i?{...t,...patch}:t));
 const resizeHumans=(n:number)=>setHumanTeams(ts=>Array.from({length:n},(_,i)=>ts[i]??makeTeam(i,'human')));
 const requiredLots=teams*squadSize; const poolOptions=Array.from(new Set([requiredLots,...[80,100,120,140,160,180,200,220,250].filter(n=>n>=requiredLots&&n<=availablePoolSize),availablePoolSize])).filter(n=>n>=requiredLots&&n<=availablePoolSize).sort((a,b)=>a-b);
 const create=()=>{const seed=20261008; const all=[...humanTeams.slice(0,humans)]; for(let i=humans;i<teams;i++){const t=makeTeam(i,'bot');t.name=botNames[i%botNames.length];t.code=t.name.slice(0,3).toUpperCase();t.icon=icons[(i+4)%icons.length];t.primary=colors[(i*3+1)%colors.length];t.secondary=colors[(i*3+4)%colors.length];all.push(t)} const players=generatePlayers(); const target=teams*squadSize; const selectedPool=selectAuctionPool(players,Math.max(target,Math.min(auctionPoolSize,players.length))); const tierOrder:Record<Player['basePriceTier'],number>={Uncapped:0,C:1,B:2,A:3,Marquee:4}; const lots=selectedPool.sort((a,b)=>tierOrder[a.basePriceTier]-tierOrder[b.basePriceTier]||b.overall-a.overall||a.name.localeCompare(b.name)).map(p=>p.id); const standings=all.map(t=>({...makeRecord(),teamId:t.id})); const g:GameState={version:6,seed,league:{name:leagueName,year:2026,format,overs:format==='T20'?20:format==='ODI'?50:format==='Test'?90:overs,teamCount:teams,humanCount:humans,difficulty:'Legend'},rules:{startingPurse:purse,minSquad:squadSize,maxSquad:squadSize,maxOverseasSquad:8,maxOverseasXI:4,retentions:0,tradeWindow:true,injuries:true,seasons:1},teams:all.map(t=>({...t,purse,auctionBudget:purse})),players,activeTeamId:all[0].id,saveName:leagueName.toLowerCase().replace(/[^a-z0-9]+/g,'-'),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),phase:'auction',auction:{status:'not-started',lotIds:lots,currentIndex:0,currentBid:0,bidHistory:[],soldIds:[],unsoldIds:[]},fixtures:[],standings,records:{seasonRuns:{},seasonWickets:{}}}; onCreate(g)};
 return <div className="app-bg"><header className="setup-head"><Logo/><button className="text-button" onClick={onBack}><ArrowLeft size={16}/> Exit</button></header><main className="setup-wrap"><div className="stepper"><span className={step>=1?'active':''}>01 PLATFORM</span><i/><span className={step>=2?'active':''}>02 LEAGUE</span><i/><span className={step>=3?'active':''}>03 FRANCHISE IDENTITY</span></div>{step===1&&<Panel><Kicker>PLATFORM</Kicker><h2>Choose the competition format</h2><p className="muted">Match length and tactical rules follow the selected format.</p><div className="choice-grid">{(['T20','ODI','Test','Custom'] as Format[]).map(f=><button key={f} className={`choice ${format===f?'selected':''}`} onClick={()=>{setFormat(f);if(f==='T20')setOvers(20)}}><span>{f==='T20'?'20':f==='ODI'?'50':f==='Test'?'5':'+'}</span><b>{f}</b><small>{f==='T20'?'Franchise short-form':f==='ODI'?'50-over cricket':f==='Test'?'Multi-day format':'Custom overs'}</small></button>)}</div>{format==='Custom'&&<Field label="Overs per innings" type="number" min="1" max="90" value={overs} onChange={e=>setOvers(+e.target.value)}/>}<div className="step-actions"><Button primary onClick={()=>setStep(2)}>Continue <ArrowRight size={17}/></Button></div></Panel>}{step===2&&<Panel><Kicker>LEAGUE CONFIGURATION</Kicker><h2>Set the competition rules</h2><p className="muted">Set the purse and exact squad size. Every franchise must finish with exactly this many players.</p><div className="form-grid"><Field label="Competition name" value={leagueName} onChange={e=>setLeagueName(e.target.value)}/><Select label="Total franchises" value={teams} onChange={e=>{const n=+e.target.value;setTeams(n);setHumans(Math.min(humans,n-1));const valid=[15,16,18,20].filter(size=>n*size<=generatePlayers().length);const nextSize=valid.includes(squadSize)?squadSize:(valid[valid.length-1]??Math.floor(generatePlayers().length/n));if(nextSize!==squadSize)setSquadSize(nextSize);setAuctionPoolSize(prev=>Math.min(generatePlayers().length,Math.max(n*nextSize,prev)))}}>{[4,5,6,7,8,10].filter(n=>[15,16,18,20].some(size=>n*size<=generatePlayers().length)).map(n=><option key={n}>{n}</option>)}</Select><Select label="Franchises you manage" value={humans} onChange={e=>{const n=+e.target.value;setHumans(n);resizeHumans(n)}}>{Array.from({length:Math.min(4,teams-1)},(_,i)=>i+1).map(n=><option key={n}>{n}</option>)}</Select><Select label="Starting purse" value={purse} onChange={e=>setPurse(+e.target.value)}>{[20,30,40,50,60,70,80,90,100].map(n=><option key={n} value={n}>{`₹${n} Cr`}</option>)}</Select><Select label="Exact squad size" value={squadSize} onChange={e=>{const size=+e.target.value;setSquadSize(size);setAuctionPoolSize(prev=>Math.min(availablePoolSize,Math.max(prev,teams*size)))}}>{[15,16,18,20].filter(n=>teams*n<=availablePoolSize).map(n=><option key={n}>{n}</option>)}</Select><Select label="Auction player pool" value={Math.max(requiredLots,Math.min(auctionPoolSize,availablePoolSize))} onChange={e=>setAuctionPoolSize(+e.target.value)}>{poolOptions.map(n=><option key={n} value={n}>{n===availablePoolSize?`${n} players · all available`: `${n} players`}</option>)}</Select></div><div className="config-strip"><Stat label="Human franchises" value={humans}/><Stat label="AI franchises" value={teams-humans}/><Stat label="Auction lots" value={Math.max(requiredLots,Math.min(auctionPoolSize,availablePoolSize))} sub={`minimum ${requiredLots} squad places`}/><Stat label="Purse / team" value={`₹${purse} Cr`}/></div><div className="step-actions"><Button ghost onClick={()=>setStep(1)}><ArrowLeft size={17}/> Back</Button><Button primary onClick={()=>setStep(3)}>Create identities <ArrowRight size={17}/></Button></div></Panel>}{step===3&&<Panel><Kicker>FRANCHISE IDENTITY</Kicker><h2>Design your franchises</h2><p className="muted">Only your franchises are editable. AI franchises create their own names, managers, grounds and identities.</p><div className="team-editor-stack">{humanTeams.slice(0,humans).map((t,i)=><TeamEditor key={t.id} team={t} index={i} onChange={patch=>updateHuman(i,patch)}/>)}</div><div className="step-actions"><Button ghost onClick={()=>setStep(2)}><ArrowLeft size={17}/> Back</Button><Button primary onClick={create}>Enter Dynasty <ArrowRight size={17}/></Button></div></Panel>}</main></div>}

function TeamEditor({team,index,onChange}:{team:Team;index:number;onChange:(p:Partial<Team>)=>void}){return <div className="identity-card"><div className="identity-head"><div><span className="identity-index">FRANCHISE {String(index+1).padStart(2,'0')}</span><h3>{team.name}</h3></div><Crest team={team} size={60}/></div><div className="form-grid three"><Field label="Team name" value={team.name} onChange={e=>onChange({name:e.target.value})}/><Field label="Short code" maxLength={4} value={team.code} onChange={e=>onChange({code:e.target.value.toUpperCase()})}/><Field label="Home city / region" value={team.city} placeholder="Optional" onChange={e=>onChange({city:e.target.value})}/><Field label="Manager" value={team.manager??''} onChange={e=>onChange({manager:e.target.value})}/><Field label="Home ground" value={team.ground} onChange={e=>onChange({ground:e.target.value})}/><Select label="Pitch profile" value={team.pitch} onChange={e=>onChange({pitch:e.target.value as PitchType})}>{pitches.map(p=><option key={p}>{p}</option>)}</Select></div><div className="design-grid"><div><span className="mini-label">EMBLEM SHAPE</span><div className="option-row">{shapes.map(s=><button key={s} className={`mini-choice ${team.crestShape===s?'active':''}`} onClick={()=>onChange({crestShape:s})}>{s}</button>)}</div></div><div><span className="mini-label">MARK / ICON</span><div className="icon-grid">{icons.map(ic=><button key={ic} className={`icon-choice ${team.icon===ic?'active':''}`} onClick={()=>onChange({icon:ic})}>{iconGlyph(ic)}</button>)}</div></div><div><span className="mini-label">PRIMARY COLOUR</span><div className="swatches">{colors.map(c=><button aria-label={c} key={c} className={`swatch ${team.primary===c?'active':''}`} style={{background:c}} onClick={()=>onChange({primary:c})}/>)}</div></div><div><span className="mini-label">SECONDARY COLOUR</span><div className="swatches">{colors.map(c=><button aria-label={c} key={c} className={`swatch ${team.secondary===c?'active':''}`} style={{background:c}} onClick={()=>onChange({secondary:c})}/>)}</div></div><div><span className="mini-label">JERSEY PATTERN</span><div className="option-row wrap">{jerseys.map(j=><button key={j} className={`mini-choice ${team.jersey===j?'active':''}`} onClick={()=>onChange({jersey:j})}>{j}</button>)}</div></div><div className="monogram-box"><span className="mini-label">MONOGRAM PREVIEW</span><div className="mono-preview"><Crest team={{...team,icon:'monogram'}} size={50}/><strong>{team.code}</strong><small>{team.name}</small></div></div></div></div>}

function GameShell({game,screen,setScreen,onReset}:{game:GameState;screen:string;setScreen:(s:any)=>void;onReset:()=>void}){const [profileId,setProfileId]=useState<string|null>(null);useEffect(()=>{const open=(e:Event)=>setProfileId((e as CustomEvent<string>).detail);window.addEventListener('dynasty:player-profile',open);return()=>window.removeEventListener('dynasty:player-profile',open)},[]);const active=game.teams.find(t=>t.id===game.activeTeamId)??game.teams[0];const nav=[['dashboard','Command Centre',LayoutDashboard],['tournament','Tournament Hub',Trophy],['teams','My Franchises',Palette],['auction','Mega Auction',Gavel],['squads','Squad & XI',Users],['fixtures','Fixtures',CalendarDays],['season','Match Centre',Activity],['records','Record Book',Database],['offseason','Season Transition',RefreshCw],['saves','Save Manager',Save]] as const;const profile=profileId?game.players.find(p=>p.id===profileId):undefined;return <><div className="game-layout"><aside className="sidebar"><Logo/><div className="side-season"><span>SEASON {game.league.year}</span><b>{game.league.name}</b></div><nav>{nav.map(([id,label,Icon])=><button key={id} className={screen===id?'active':''} onClick={()=>screen==='saves'&&id==='saves'?setScreen('saves'):setScreen(id)}><Icon size={17}/>{label}</button>)}</nav><div className="side-bottom"><div><span>FORMAT</span><b>{game.league.format}</b></div><button onClick={onReset}>Exit career</button></div></aside><div className="game-main"><header className="topbar"><div><span>DYNASTY T20</span><i>/</i><b>{game.league.name}</b></div><div className="top-actions"><span className="pill"><Users size={14}/>{game.teams.length} TEAMS</span><span className="pill accent"><Crown size={14}/>{active.code} · {active.name}</span></div></header><div className="mobile-nav">{nav.slice(0,6).map(([id,label,Icon])=><button key={id} className={screen===id?'active':''} onClick={()=>setScreen(id)}><Icon size={15}/><span>{label.split(' ')[0]}</span></button>)}</div><main className="content">{screen==='dashboard'&&<Dashboard game={game} setScreen={setScreen}/>} {screen==='tournament'&&<TournamentDashboard game={game} setScreen={setScreen}/>} {screen==='teams'&&<Teams game={game}/>} {screen==='auction'&&<Auction game={game} setScreen={setScreen}/>} {screen==='squads'&&<Squads game={game}/>} {screen==='fixtures'&&<Fixtures game={game} setScreen={setScreen}/>} {screen==='season'&&<Season game={game} setScreen={setScreen}/>} {screen==='records'&&<Records game={game}/>} {screen==='offseason'&&<Offseason game={game} setScreen={setScreen}/>} {screen==='saves'&&<SaveManager onBack={()=>setScreen('dashboard')}/>}</main></div></div>{profile&&<PlayerCareerModal player={profile} game={game} onClose={()=>setProfileId(null)}/>}</>}

function Dashboard({game,setScreen}:{game:GameState;setScreen:(s:any)=>void}){const [selected,setSelected]=useState(game.activeTeamId);const team=game.teams.find(t=>t.id===selected)??game.teams[0];const sorted=[...game.teams].sort((a,b)=>b.record.points-a.record.points||b.record.netRunRate-a.record.netRunRate);return <div className="page"><PageHead kicker="COMMAND CENTRE" title="Run the franchise, not just the squad." sub="A management view first. Player lists stay inside Squad & XI so the dashboard remains a decision surface." action={<Select label="" value={selected} onChange={e=>setSelected(e.target.value)}>{game.teams.filter(t=>t.kind==='human').map(t=><option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</Select>}/><div className="hero-team"><div className="hero-team-left"><Crest team={team} size={76}/><div><span className="eyebrow">ACTIVE FRANCHISE</span><h2>{team.name} <small>{team.code}</small></h2><p>{team.manager} · {team.ground} · {team.pitch}</p></div></div><div className="hero-record"><div><span>RECORD</span><strong>{team.record.won}-{team.record.lost}</strong></div><div><span>POINTS</span><strong>{team.record.points}</strong></div><div><span>PURSE</span><strong>{money(team.purse)}</strong></div></div></div><div className="stats-grid four"><Stat label="Squad" value={`${team.playerIds.length}/${game.rules.maxSquad}`} sub="players signed"/><Stat label="Overseas" value={team.playerIds.filter(id=>game.players.find(p=>p.id===id)?.overseas).length} sub="squad count"/><Stat label="Team form" value={team.record.lastFive.length?team.record.lastFive.join(' '):'—'} sub="last five"/><Stat label="Home pitch" value={team.pitch} sub="current profile"/></div><div className="dashboard-grid"><Panel><div className="panel-head"><div><Kicker>LEAGUE INTEL</Kicker><h3>Every rival, one screen.</h3></div><button className="text-button" onClick={()=>setScreen('teams')}>Open franchises <ArrowRight size={15}/></button></div><div className="rival-list">{sorted.map(t=><div className={`rival-row ${t.id===team.id?'selected':''}`} key={t.id}><Crest team={t} size={38}/><div className="rival-name"><b>{t.code} · {t.name}</b><small>{t.kind==='bot'?'AI franchise':'Human franchise'} · {t.manager}</small></div><div className="rival-stat"><span>SQUAD</span><b>{t.playerIds.length}</b></div><div className="rival-stat"><span>FORM</span><b>{t.record.lastFive.length?t.record.lastFive.join(' '):'—'}</b></div><div className="rival-stat"><span>PITCH</span><b>{t.pitch}</b></div></div>)}</div></Panel><Panel><Kicker>FRANCHISE STATUS</Kicker><h3>Next decisions</h3><div className="decision-list"><button onClick={()=>setScreen('auction')}><Gavel/><span><b>{game.auction.status==='complete'?'Auction complete':'Auction control'}</b><small>{game.auction.status==='complete'?'Review the squad build':'Bid or auto-run the market'}</small></span><ArrowRight/></button><button onClick={()=>setScreen('squads')}><Users/><span><b>Set playing XI</b><small>Choose captain and match squad</small></span><ArrowRight/></button><button onClick={()=>setScreen('fixtures')}><CalendarDays/><span><b>Fixture desk</b><small>Review opponents and venues</small></span><ArrowRight/></button></div></Panel></div></div>}

function PageHead({kicker,title,sub,action}:{kicker:string;title:string;sub:string;action?:ReactNode}){return <div className="page-head"><div><Kicker>{kicker}</Kicker><h1>{title}</h1><p>{sub}</p></div>{action&&<div className="head-action">{action}</div>}</div>}

function Teams({game}:{game:GameState}){
  const [notice,setNotice]=useState('');
  const [manageTeamId,setManageTeamId]=useState(game.teams.find(t=>t.kind==='human')?.id??game.teams[0]?.id??'');
  const [playerQuery,setPlayerQuery]=useState('');
  const canEditStructure=game.fixtures.length===0&&game.phase==='auction'&&game.auction.status==='not-started';
  const canManagePlayers=game.fixtures.length===0&&game.phase!=='completed'&&!['live','paused'].includes(game.auction.status);
  const selectedTeam=game.teams.find(t=>t.id===manageTeamId)??game.teams[0];
  const isPakistani=(p:Player)=>[p.nationality as string,(p as any).country,(p as any).nation,(p as any).countryCode]
    .some(v=>typeof v==='string'&&['pakistan','pakistani','pak','pk'].includes(v.trim().toLowerCase().replace(/[^a-z]/g,'')));
  const assignedIds=new Set(game.teams.flatMap(t=>t.playerIds));
  const freeAgents=game.players.filter(p=>!assignedIds.has(p.id)&&!isPakistani(p)&&(!playerQuery.trim()||p.name.toLowerCase().includes(playerQuery.trim().toLowerCase())||p.nationality.toLowerCase().includes(playerQuery.trim().toLowerCase())||p.role.toLowerCase().includes(playerQuery.trim().toLowerCase()))).slice(0,80);
  const addFranchise=(kind:'human'|'bot')=>{
    if(!canEditStructure||game.teams.length>=14){setNotice('Team structure can only change before the auction starts. Maximum 14 teams.');return;}
    const i=game.teams.length;const t=makeTeam(i,kind);t.id=`team-extra-${kind}-${Date.now()}`;t.name=kind==='human'?`My Franchise ${i+1}`:botNames[i%botNames.length];t.code=kind==='human'?`TM${i+1}`:t.name.slice(0,3).toUpperCase();t.purse=game.rules.startingPurse;t.auctionBudget=game.rules.startingPurse;
    game.teams.push(t);game.league.teamCount=game.teams.length;game.league.humanCount=game.teams.filter(x=>x.kind==='human').length;game.standings.push({...makeRecord(),teamId:t.id});game.auction.lotIds=game.players.filter(p=>p.auctionEligible!==false&&!game.teams.some(team=>team.playerIds.includes(p.id))&&!isPakistani(p)).map(p=>p.id);setGame({...game});setManageTeamId(t.id);setNotice(`${t.name} added.`);
  };
  const removeFranchise=(id:string)=>{
    if(!canEditStructure||game.teams.length<=2){setNotice('At least two franchises are required. Structure changes are pre-auction only.');return;}
    const team=game.teams.find(t=>t.id===id);if(!team)return;
    if(team.playerIds.length){setNotice('Release all players from this franchise before removing it.');return;}
    game.teams=game.teams.filter(t=>t.id!==id);game.standings=game.standings.filter(x=>x.teamId!==id);game.league.teamCount=game.teams.length;game.league.humanCount=game.teams.filter(t=>t.kind==='human').length;game.auction.lotIds=game.players.filter(p=>p.auctionEligible!==false&&!game.teams.some(team=>team.playerIds.includes(p.id))&&!isPakistani(p)).map(p=>p.id);setGame({...game});setManageTeamId(game.teams[0]?.id??'');setNotice(`${team.name} removed.`);
  };
  const changePitch=(id:string,pitch:PitchType)=>{const t=game.teams.find(x=>x.id===id);if(t){t.pitch=pitch;setGame({...game});setNotice(`${t.name} pitch profile updated.`);}};
  const changeSquadSize=(size:number)=>{
    if(!canEditStructure){setNotice('Squad size is locked after the auction starts.');return;}
    if(game.teams.some(t=>t.playerIds.length>size)){setNotice('Squad size cannot be lower than a franchise current roster.');return;}
    game.rules.minSquad=size;game.rules.maxSquad=size;
    game.auction.lotIds=game.players.filter(p=>p.auctionEligible!==false&&!game.teams.some(t=>t.playerIds.includes(p.id))&&!isPakistani(p)).map(p=>p.id);
    setGame({...game});setNotice(`Squad target changed to ${size} players per franchise.`);
  };
  const changePurse=(amount:number)=>{
    if(!canEditStructure)return;
    game.rules.startingPurse=amount;game.teams.forEach(t=>{t.purse=amount;t.auctionBudget=amount;});setGame({...game});setNotice(`Auction purse set to ₹${amount} Cr for every franchise.`);
  };
  const changeOverseasSquad=(limit:number)=>{
    if(!canEditStructure)return;
    if(game.teams.some(t=>t.playerIds.filter(id=>game.players.find(p=>p.id===id)?.overseas).length>limit)){setNotice('At least one current squad exceeds that overseas limit.');return;}
    game.rules.maxOverseasSquad=limit;game.rules.maxOverseasXI=Math.min(game.rules.maxOverseasXI,limit);setGame({...game});setNotice(`Overseas squad limit set to ${limit}.`);
  };
  const changeOverseasXI=(limit:number)=>{
    if(!canEditStructure)return;
    if(limit>game.rules.maxOverseasSquad){setNotice('Playing XI overseas limit cannot exceed the squad overseas limit.');return;}
    game.rules.maxOverseasXI=limit;setGame({...game});setNotice(`Playing XI overseas limit set to ${limit}.`);
  };
  const assignPlayer=(p:Player)=>{
    if(!selectedTeam||!canManagePlayers)return;
    if(selectedTeam.playerIds.length>=game.rules.maxSquad){setNotice(`${selectedTeam.name} has reached its ${game.rules.maxSquad}-player squad limit.`);return;}
    const overseas=selectedTeam.playerIds.filter(id=>game.players.find(x=>x.id===id)?.overseas).length;
    if(p.overseas&&overseas>=game.rules.maxOverseasSquad){setNotice(`${selectedTeam.name} has reached its overseas limit (${game.rules.maxOverseasSquad}).`);return;}
    selectedTeam.playerIds=[...selectedTeam.playerIds,p.id];
    game.auction.lotIds=game.auction.lotIds.filter(id=>id!==p.id);
    game.auction.unsoldIds=game.auction.unsoldIds.filter(id=>id!==p.id);
    game.auction.soldIds=game.auction.soldIds.filter(id=>id!==p.id);
    if(game.auction.soldPrices)delete game.auction.soldPrices[p.id];
    setGame({...game});setNotice(`${p.name} assigned to ${selectedTeam.name}.`);
  };
  const releasePlayer=(p:Player)=>{
    if(!selectedTeam||!canManagePlayers)return;
    selectedTeam.playerIds=selectedTeam.playerIds.filter(id=>id!==p.id);
    selectedTeam.playingXI=(selectedTeam.playingXI??[]).filter(id=>id!==p.id);
    if(selectedTeam.captainId===p.id)delete selectedTeam.captainId;
    if(selectedTeam.viceCaptainId===p.id)delete selectedTeam.viceCaptainId;
    if(selectedTeam.wicketkeeperId===p.id)delete selectedTeam.wicketkeeperId;
    if(selectedTeam.bowlingPlan)delete selectedTeam.bowlingPlan[p.id];
    if(selectedTeam.tacticalRoles)delete selectedTeam.tacticalRoles[p.id];
    if(game.auction.status==='complete')game.auction.unsoldIds=[...new Set([...game.auction.unsoldIds,p.id])];
    else if(!game.auction.lotIds.includes(p.id))game.auction.lotIds.push(p.id);
    game.auction.soldIds=game.auction.soldIds.filter(id=>id!==p.id);
    if(game.auction.soldPrices)delete game.auction.soldPrices[p.id];
    setGame({...game});setNotice(`${p.name} released from ${selectedTeam.name}.`);
  };
  return <div className="page">
    <PageHead kicker="FRANCHISE ROOM" title="Franchise & tournament controls" sub="Manage franchise identities, squad composition, auction rules, home pitch profiles and free-agent assignments." action={canEditStructure?<div className="row"><Button ghost onClick={()=>addFranchise('human')}>Add human team</Button><Button primary onClick={()=>addFranchise('bot')}>Add AI team</Button></div>:undefined}/>
    {notice&&<p className="muted">{notice}</p>}
    <div className="franchise-grid">{game.teams.map(t=><Panel key={t.id} className={t.kind==='human'?'human-card':''}>
      <div className="franchise-top"><Crest team={t} size={58}/><div><span className="eyebrow">{t.kind==='human'?'MANAGED':'AI CONTROLLED'}</span><h3>{t.name}</h3><p>{t.code} · {t.manager}</p></div></div>
      <div className="team-metrics"><Stat label="Record" value={`${t.record.won}-${t.record.lost}`}/><Stat label="Squad" value={t.playerIds.length}/><Stat label="Purse" value={money(t.purse)}/><Stat label="Pitch" value={t.pitch}/></div>
      <div className="form-grid"><Field label="Franchise name" value={t.name} onChange={e=>{t.name=e.target.value;setGame({...game});}}/><Field label="Short code" maxLength={4} value={t.code} onChange={e=>{t.code=e.target.value.toUpperCase();setGame({...game});}}/><Field label="Manager" value={t.manager??''} onChange={e=>{t.manager=e.target.value;setGame({...game});}}/><Field label="Home ground" value={t.ground} onChange={e=>{t.ground=e.target.value;setGame({...game});}}/><Select label="Home pitch" value={t.pitch} onChange={e=>changePitch(t.id,e.target.value as PitchType)}><option value="flat">Flat / batting</option><option value="spin-friendly">Spin-friendly</option><option value="seam-friendly">Seam-friendly</option><option value="slow">Slow / two-paced</option></Select>{canEditStructure&&t.playerIds.length===0&&game.teams.length>2&&<Button ghost onClick={()=>removeFranchise(t.id)}>Remove franchise</Button>}</div>
      <div className="team-form-line"><span>LAST FIVE</span><div>{Array.from({length:5},(_,i)=>{const x=t.record.lastFive[i];return <b key={i} className={x==='W'?'win':x==='L'?'loss':'neutral'}>{x??'—'}</b>})}</div></div>
    </Panel>)}</div>
    <Panel>
      <Kicker>TOURNAMENT RULES · DIRECT CONTROLS</Kicker>
      <div className="team-metrics"><Stat label="Franchises" value={game.teams.length}/><Stat label="Starting purse" value={money(game.rules.startingPurse)}/><Stat label="Squad size" value={game.rules.maxSquad}/><Stat label="Overseas squad" value={game.rules.maxOverseasSquad}/><Stat label="Overseas XI" value={game.rules.maxOverseasXI}/></div>
      {canEditStructure?<div className="form-grid">
        <Select label="Auction purse per franchise" value={game.rules.startingPurse} onChange={e=>changePurse(Number(e.target.value))}>{[20,25,30,35,40,45,50,55,60,65,70,75,80,85,90,95,100].map(n=><option key={n} value={n}>{money(n)}</option>)}</Select>
        <Select label="Exact squad size" value={game.rules.maxSquad} onChange={e=>changeSquadSize(Number(e.target.value))}>{[11,12,13,14,15,16,17,18,19,20,22,25].map(n=><option key={n} value={n}>{n} players</option>)}</Select>
        <Select label="Overseas players per squad" value={game.rules.maxOverseasSquad} onChange={e=>changeOverseasSquad(Number(e.target.value))}>{Array.from({length:12},(_,n)=>n).map(n=><option key={n} value={n}>{n} players</option>)}</Select>
        <Select label="Overseas players in XI" value={game.rules.maxOverseasXI} onChange={e=>changeOverseasXI(Number(e.target.value))}>{Array.from({length:Math.min(11,game.rules.maxOverseasSquad)+1},(_,n)=>n).map(n=><option key={n} value={n}>{n} players</option>)}</Select>
      </div>:<p className="muted">Team count, squad size, purse and overseas quotas are locked once the auction starts. Home pitch and squad player management remain available before the first fixture.</p>}
    </Panel>
    <Panel>
      <div className="panel-head"><div><Kicker>PLAYER ROSTER MANAGER</Kicker><h3>Assign or release players directly</h3><p>Move players between the free-agent pool and a franchise without editing JSON or code.</p></div><span className="muted">{game.players.length} players in database</span></div>
      <div className="form-grid"><Select label="Select franchise" value={selectedTeam?.id??''} onChange={e=>setManageTeamId(e.target.value)}>{game.teams.map(t=><option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</Select><Field label="Search free agents" placeholder="Player, country or role" value={playerQuery} onChange={e=>setPlayerQuery(e.target.value)}/></div>
      {selectedTeam&&<div className="team-metrics"><Stat label="Current squad" value={`${selectedTeam.playerIds.length}/${game.rules.maxSquad}`}/><Stat label="Overseas used" value={`${selectedTeam.playerIds.filter(id=>game.players.find(p=>p.id===id)?.overseas).length}/${game.rules.maxOverseasSquad}`}/><Stat label="Free agents shown" value={freeAgents.length}/></div>}
      {!canManagePlayers?<p className="muted">Direct roster changes are locked during a live auction and after league fixtures begin.</p>:<div className="form-grid">
        <div><h4>Current squad · release players</h4><div className="scout-list">{(selectedTeam?.playerIds??[]).map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>Boolean(p)).map(p=><div className="scout-row" key={p.id}><div><b>{p.name}</b><small>{p.nationality} · {p.role}{p.overseas?' · Overseas':''}</small></div><PlayerProfileTrigger playerId={p.id}/><Button ghost onClick={()=>releasePlayer(p)}>Release</Button></div>)}</div></div>
        <div><h4>Free agents · assign players</h4><div className="scout-list">{freeAgents.map(p=><div className="scout-row" key={p.id}><div><b>{p.name}</b><small>{p.nationality} · {p.role}{p.overseas?' · Overseas':''}</small></div><PlayerProfileTrigger playerId={p.id}/><Button primary disabled={!selectedTeam||selectedTeam.playerIds.length>=game.rules.maxSquad||(p.overseas&&selectedTeam.playerIds.filter(id=>game.players.find(x=>x.id===id)?.overseas).length>=game.rules.maxOverseasSquad)} onClick={()=>assignPlayer(p)}>Assign</Button></div>)}{!freeAgents.length&&<p className="muted">No free agents match this search.</p>}</div></div>
      </div>}
    </Panel>
  </div>;
}

function Auction({game,setScreen}:{game:GameState;setScreen:(s:any)=>void}){
  const mappedLots=game.auction.lotIds.map(id=>game.players.find(p=>p.id===id)).filter(Boolean) as Player[];
  const order:Record<Player['basePriceTier'],number>={Uncapped:0,C:1,B:2,A:3,Marquee:4};
  const lots=game.auction.status==='not-started'? [...mappedLots].sort((a,b)=>order[a.basePriceTier]-order[b.basePriceTier]||b.overall-a.overall||a.name.localeCompare(b.name)):mappedLots;
  const [lotIndex,setLotIndex]=useState(game.auction.currentIndex);
  const [bid,setBid]=useState(game.auction.currentBid||0);
  const [leader,setLeader]=useState(game.auction.leadingTeamId);
  const [activeHuman,setActiveHuman]=useState(game.activeTeamId);
  const [squadViewId,setSquadViewId]=useState<string>(game.activeTeamId);
  const [recent,setRecent]=useState<string[]>([]);
  const [thinking,setThinking]=useState(false);
  const responseTimer=useRef<number|undefined>(undefined);
  const [hammerStage,setHammerStage]=useState<'open'|'once'|'twice'|'sold'>('open');
  const [biddersThisLot,setBiddersThisLot]=useState<string[]>([]);
  const [search,setSearch]=useState('');
  const [tierFilter,setTierFilter]=useState('All tiers');
  const [cataloguePage,setCataloguePage]=useState(0);
  const [showAllCatalogue,setShowAllCatalogue]=useState(false);
  const cataloguePageSize=40;
  const player=lots[lotIndex];
  const humans=game.teams.filter(t=>t.kind==='human');
  const bots=game.teams.filter(t=>t.kind==='bot');
  const currentTeam=game.teams.find(t=>t.id===activeHuman);
  const base=player?basePrice(player):0;
  const next=player?nextBid(bid,base):0;
  const leaderTeam=leader?game.teams.find(t=>t.id===leader):undefined;
  const target=game.rules.maxSquad||game.rules.minSquad;
  const filteredPreview=lots.filter(p=>{
    const q=search.trim().toLowerCase();
    return (!q||p.name.toLowerCase().includes(q)||p.nationality.toLowerCase().includes(q)||p.role.toLowerCase().includes(q))&&(tierFilter==='All tiers'||p.basePriceTier===tierFilter);
  });
  const visiblePreview=showAllCatalogue?filteredPreview:filteredPreview.slice(cataloguePage*cataloguePageSize,(cataloguePage+1)*cataloguePageSize);
  const tierCounts=Object.fromEntries((['Uncapped','C','B','A','Marquee'] as const).map(t=>[t,lots.filter(p=>p.basePriceTier===t).length])) as Record<Player['basePriceTier'],number>;

  const push=(team:Team,amount:number,tag='')=>{
    if(responseTimer.current!==undefined){window.clearTimeout(responseTimer.current);responseTimer.current=undefined;}
    setThinking(false);setBid(amount);setLeader(team.id);setHammerStage('open');setBiddersThisLot(ids=>ids.includes(team.id)?ids:[...ids,team.id]);
    game.auction.currentIndex=lotIndex;game.auction.currentBid=amount;game.auction.leadingTeamId=team.id;
    game.auction.bidHistory=[...game.auction.bidHistory,{teamId:team.id,amount}];
    setRecent(r=>[`${tag?tag+' · ':''}${team.code} · ${money(amount)}`,...r].slice(0,14));setGame({...game});
  };
  const startAuction=()=>{
    game.auction.lotIds=lots.map(p=>p.id);game.auction.currentIndex=0;game.auction.currentBid=0;game.auction.leadingTeamId=undefined;game.auction.status='live';game.auction.skipped=false;
    setLotIndex(0);setBid(0);setLeader(undefined);setHammerStage('open');setBiddersThisLot([]);setThinking(false);setRecent([]);setGame({...game});
  };
  const pauseAuction=()=>{if(responseTimer.current!==undefined){window.clearTimeout(responseTimer.current);responseTimer.current=undefined;}setThinking(false);game.auction.currentIndex=lotIndex;game.auction.status='paused';setGame({...game});};
  const resumeAuction=()=>{game.auction.status='live';setGame({...game});};
  const hardBidLimit=(team:Team)=>{
    const starting=Math.max(1,game.rules.startingPurse||team.auctionBudget||team.purse);
    const spotsAfter=Math.max(0,target-team.playerIds.length-1);
    const reservePerSlot=Math.max(.2,Math.min(1.2,(starting/Math.max(1,target))*.5));
    // Keep one extraordinary purchase at or below 60% of the original purse,
    // and reserve a minimum budget for the remaining roster slots.
    return Math.max(0,Math.min(starting*.6,team.purse-spotsAfter*reservePerSlot));
  };
  const teamBidState=(team:Team)=>{
    if(!player)return {ok:false,reason:'No lot'};
    const overseas=team.playerIds.filter(id=>game.players.find(p=>p.id===id)?.overseas).length;
    if(game.auction.status!=='live')return {ok:false,reason:'Paused'};
    if(hammerStage==='sold')return {ok:false,reason:'Sold'};
    if(leader===team.id)return {ok:false,reason:'Leading'};
    if(team.playerIds.length>=target)return {ok:false,reason:'Squad full'};
    if(player.overseas&&overseas>=game.rules.maxOverseasSquad)return {ok:false,reason:'Overseas full'};
    if(team.purse<next)return {ok:false,reason:'Low purse'};
    if(next>hardBidLimit(team))return {ok:false,reason:'Over ceiling'};
    return {ok:true,reason:''};
  };
  const bidForTeam=(team:Team)=>{
    if(!teamBidState(team).ok)return;
    push(team,next);setActiveHuman(team.id);
  };
  const humanBid=()=>{if(currentTeam)bidForTeam(currentTeam);};
  const closeCurrentLot=()=>{
    if(!player||game.auction.status!=='live')return;
    let winner=game.teams.find(t=>t.id===leader);
    const formerTeamId=game.offseason?.previousOwnerByPlayerId?.[player.id];
    const formerTeam=formerTeamId?game.teams.find(t=>t.id===formerTeamId):undefined;
    const rtmLeft=formerTeam?game.offseason?.rtmRemaining?.[formerTeam.id]??0:0;
    // During a next-season auction, a released player's former human franchise gets an RTM prompt after the hammer. No purse is charged until the former manager accepts or passes.
    if(winner&&bid>0&&formerTeam&&formerTeam.id!==winner.id&&rtmLeft>0&&formerTeam.playerIds.length<target&&formerTeam.purse>=bid&& !game.auction.pendingRTM&& !(game.auction.declinedRTMPlayerIds??[]).includes(player.id)){
      if(formerTeam.kind==='human'){
        game.auction.pendingRTM={playerId:player.id,formerTeamId:formerTeam.id,winningTeamId:winner.id,bid};
        game.auction.status='paused';setGame({...game});return;
      }
      const assessment=assessAuctionBid(formerTeam,player,game,bid,game.teams,lotIndex,lots.length);
      const roleKey=roleGroup(player.role) as keyof Team['squadNeeds'];
      const rtmNeed=(formerTeam.squadNeeds[roleKey]??0)>0;
      if(assessment.maxBid>=bid && (rtmNeed||player.overall>=84) && Math.random()<.58){
        winner=formerTeam;game.offseason!.rtmRemaining[formerTeam.id]=Math.max(0,rtmLeft-1);
        game.auction.leadingTeamId=formerTeam.id;setLeader(formerTeam.id);setRecent(r=>[`RTM · ${formerTeam.code} · ${money(bid)}`,...r].slice(0,14));
      }
    }
    if(winner&&bid>0&&winner.playerIds.length<target&&bid<=winner.purse){
      const overseas=winner.playerIds.filter(id=>game.players.find(p=>p.id===id)?.overseas).length;
      if((!player.overseas||overseas<game.rules.maxOverseasSquad)&&bid<=Math.max(0,Math.min((game.rules.startingPurse||winner.auctionBudget)*.6,winner.purse))){
        winner.playerIds=[...winner.playerIds,player.id];winner.purse=+(winner.purse-bid).toFixed(2);game.auction.soldPrices={...(game.auction.soldPrices??{}),[player.id]:bid};
        const key=roleGroup(player.role) as keyof Team['squadNeeds'];winner.squadNeeds[key]=Math.max(0,winner.squadNeeds[key]-1);game.auction.soldIds=[...new Set([...game.auction.soldIds,player.id])];
      }else game.auction.unsoldIds=[...new Set([...game.auction.unsoldIds,player.id])];
    }else game.auction.unsoldIds=[...new Set([...game.auction.unsoldIds,player.id])];
    const nextIndex=lotIndex+1;game.auction.currentIndex=nextIndex;game.auction.currentBid=0;game.auction.leadingTeamId=undefined;
    if(game.teams.every(t=>t.playerIds.length>=target)){
      const owned=new Set(game.teams.flatMap(t=>t.playerIds));
      game.auction.unsoldIds=[...new Set([...game.auction.unsoldIds,...lots.slice(nextIndex).map(p=>p.id).filter(id=>!owned.has(id))])];
      game.auction.status='complete';game.auction.completedAt=new Date().toISOString();game.phase='squads';autoSelectAI(game);
      setGame({...game});setLotIndex(lots.length);setBid(0);setLeader(undefined);setHammerStage('open');setThinking(false);return;
    }
    if(nextIndex>=lots.length){finalizeSquads(game);setGame({...game});setLotIndex(nextIndex);return;}
    setGame({...game});setLotIndex(nextIndex);setBid(0);setLeader(undefined);setHammerStage('open');setBiddersThisLot([]);setThinking(false);
  };
  const skip=()=>{if(responseTimer.current!==undefined){window.clearTimeout(responseTimer.current);responseTimer.current=undefined;}setThinking(false);smartAutoAuction(game,lots);setGame({...game});setLotIndex(lots.length);setBid(0);setLeader(undefined);};
  // Skip this lot for human managers: only AI franchises may acquire it. If no
  // bot has a valid valuation/budget/quota, the player is recorded as unsold.
  const skipCurrentPlayer=()=>{
    if(!player||game.auction.status!=='live'||bid>0||Boolean(leader))return;
    if(responseTimer.current!==undefined){window.clearTimeout(responseTimer.current);responseTimer.current=undefined;}
    setThinking(false);
    const eligible=game.teams.filter(t=>t.kind==='bot'&&t.playerIds.length<target&&t.purse>=base&&(!player.overseas||t.playerIds.filter(id=>game.players.find(p=>p.id===id)?.overseas).length<game.rules.maxOverseasSquad))
      .map(t=>({team:t,assessment:assessAuctionBid(t,player,game,0,game.teams,lotIndex,lots.length)}))
      .filter(x=>x.assessment.maxBid>=base)
      .sort((a,b)=>b.assessment.maxBid-a.assessment.maxBid);
    const winner=eligible[0]?.team;
    if(winner){
      const price=base;
      winner.playerIds=[...winner.playerIds,player.id];winner.purse=+(winner.purse-price).toFixed(2);
      game.auction.soldPrices={...(game.auction.soldPrices??{}),[player.id]:price};
      const key=roleGroup(player.role) as keyof Team['squadNeeds'];winner.squadNeeds[key]=Math.max(0,winner.squadNeeds[key]-1);
      game.auction.soldIds=[...new Set([...game.auction.soldIds,player.id])];
      setRecent(r=>[`SKIPPED LOT · ${winner.code} · ${money(price)}`,...r].slice(0,14));
    }else{
      game.auction.unsoldIds=[...new Set([...game.auction.unsoldIds,player.id])];
      setRecent(r=>[`SKIPPED LOT · UNSOLD · ${player.name}`,...r].slice(0,14));
    }
    const nextIndex=lotIndex+1;game.auction.currentIndex=nextIndex;game.auction.currentBid=0;game.auction.leadingTeamId=undefined;
    if(game.teams.every(t=>t.playerIds.length>=target)){game.auction.status='complete';game.auction.completedAt=new Date().toISOString();game.phase='squads';autoSelectAI(game);}
    else if(nextIndex>=lots.length){finalizeSquads(game);}
    setGame({...game});setLotIndex(nextIndex);setBid(0);setLeader(undefined);setHammerStage('open');setBiddersThisLot([]);
  };
  useEffect(()=>{
    if(!player||game.auction.status!=='live')return;

    let timer:number;
    const clearTimer=()=>{window.clearTimeout(timer);if(responseTimer.current===timer)responseTimer.current=undefined;};

    if(game.teams.every(t=>t.playerIds.length>=target)){
      game.auction.status='complete';game.phase='squads';game.auction.completedAt=game.auction.completedAt||new Date().toISOString();
      autoSelectAI(game);setGame({...game});setLotIndex(lots.length);return;
    }

    // AI managers may independently open a lot after the user presses Start.
    // The lot is never auto-started before startAuction; once live, AI can bid first.
    if(bid===0&&!leader){
      const opener=chooseAuctionChallenger(player,game,0,undefined,[],lotIndex,lots.length);
      if(opener){
        setThinking(true);
        const delay=900+Math.floor(Math.random()*1700);
        timer=window.setTimeout(()=>{
          responseTimer.current=undefined;
          const teamNow=game.teams.find(t=>t.id===opener.team.id);
          const opening=basePrice(player);
          if(teamNow&&teamNow.kind==='bot'&&teamNow.purse>=opening&&opener.assessment.maxBid>=opening&&teamNow.playerIds.length<target){
            push(teamNow,opening,'AI OPENING BID');
          }else setThinking(false);
        },delay);responseTimer.current=timer;return clearTimer;
      }
    }

    // Once the hammer is down, bids are closed. Keep SOLD visible briefly before
    // settling the player and moving to the next lot.
    if(hammerStage==='sold'){
      setThinking(false);
      timer=window.setTimeout(()=>{responseTimer.current=undefined;closeCurrentLot();},1700);responseTimer.current=timer;
      return clearTimer;
    }

    if(bid>0&&leader){
      const candidate=chooseAuctionChallenger(player,game,bid,leader,biddersThisLot,lotIndex,lots.length);
      if(candidate){
        setThinking(true);
        // Natural manager deliberation: one of three realistic response windows.
        // The interval varies automatically between bids; no speed buttons are shown.
        const r=Math.random();
        const delay=r<.28?500:r<.76?1000:2000;
        timer=window.setTimeout(()=>{
          responseTimer.current=undefined;
          const amount=nextBid(bid,basePrice(player));
          const teamNow=game.teams.find(t=>t.id===candidate.team.id);
          if(teamNow&&teamNow.id!==game.auction.leadingTeamId&&teamNow.purse>=amount&&candidate.assessment.maxBid>=amount){
            const tag=candidate.surprise?'LATE RE-ENTRY':candidate.pressurePlay?'PURSE PRESSURE':'';
            push(teamNow,amount,tag);
          }else setThinking(false);
        },delay);responseTimer.current=timer;
        return clearTimer;
      }
    }

    setThinking(false);
    // Three seconds of silence starts the automatic hammer. During Once and Twice,
    // the human or an eligible AI manager can still bid; any bid resets the clock.
    const quietDelay=3000;
    timer=window.setTimeout(()=>{
      responseTimer.current=undefined;
      if(game.auction.status!=='live')return;
      if(hammerStage==='open')setHammerStage('once');
      else if(hammerStage==='once')setHammerStage('twice');
      else setHammerStage('sold');
    },quietDelay);responseTimer.current=timer;
    return clearTimer;
  },[bid,leader,lotIndex,biddersThisLot,game.auction.status,hammerStage]);

  if(game.auction.status==='not-started'){
    return <div className="page auction-register-page">
      <PageHead kicker="MEGA AUCTION · LOT REGISTER" title="Meet the market before the hammer falls." sub="Review every nominated player, base price and rating before starting. Depth players open in lakhs; premium players come later in crores." action={<Button ghost onClick={skip}><Zap size={16}/> Auto-build every squad</Button>}/>
      <div className="auction-register-stats">
        <div><span>REGISTERED LOTS</span><b>{lots.length}</b><small>{game.teams.length} franchises × {target} squad places</small></div>
        <div><span>STARTING PURSE</span><b>{money(game.rules.startingPurse)}</b><small>per franchise</small></div>
        <div><span>AI MANAGERS</span><b>{bots.length}</b><small>{AUCTION_DECISION_SIGNAL_COUNT}+ decision signals</small></div>
        <div><span>OPENING LADDER</span><b>₹20L–₹2Cr</b><small>tier-based base prices</small></div>
      </div>
      <Panel className="auction-register-panel">
        <div className="auction-register-toolbar"><div><Kicker>PLAYER CATALOGUE</Kicker><h3>The auction list</h3><p>These are the nominated players for this career. Every listed player is a unique lot.</p></div><Button primary onClick={startAuction}><Gavel size={17}/> Start Auction <ArrowRight size={16}/></Button></div>
        <div className="auction-filters"><Field label="Search players" placeholder="Search name, country or role" value={search} onChange={e=>{setSearch(e.target.value);setCataloguePage(0)}}/><Select label="Player tier" value={tierFilter} onChange={e=>{setTierFilter(e.target.value);setCataloguePage(0)}}><option>All tiers</option><option>Uncapped</option><option>C</option><option>B</option><option>A</option><option>Marquee</option></Select><Button ghost onClick={()=>{setShowAllCatalogue(v=>!v);setCataloguePage(0);}}>{showAllCatalogue?'Use paginated view':'Show all players'}</Button><div className="tier-pills">{(['Uncapped','C','B','A','Marquee'] as const).map(t=><button key={t} onClick={()=>{setTierFilter(t);setCataloguePage(0)}} className={tierFilter===t?'active':''}><b>{t}</b><span>{tierCounts[t]||0}</span></button>)}</div></div>
        <div className="auction-player-list"><div className="auction-list-head"><span>LOT</span><span>PLAYER</span><span>ROLE</span><span>OVR</span><span>FORM</span><span>BASE</span></div>{visiblePreview.map(p=>{const number=lots.findIndex(x=>x.id===p.id)+1;return <div className="auction-list-row" key={p.id}><span className="auction-list-number">{String(number).padStart(3,'0')}</span><div className="auction-list-player"><div className="player-avatar tiny">{p.avatar}</div><div><b>{p.name}</b><small>{p.nationality} · {p.basePriceTier}</small></div></div><PlayerProfileTrigger playerId={p.id}/><span>{p.role}</span><b className="auction-ovr">{p.overall}</b><span className={`auction-form ${p.form>=80?'good':p.form<60?'low':''}`}>{p.form}</span><b className="auction-list-base">{money(basePrice(p))}</b></div>})}{!filteredPreview.length&&<div className="empty-state">No players match those filters.</div>}</div>
        <div className="auction-register-footer"><span>Showing {Math.min(filteredPreview.length,cataloguePage*cataloguePageSize+1)}–{Math.min(filteredPreview.length,(cataloguePage+1)*cataloguePageSize)} of {filteredPreview.length} matching lots · {lots.length} total</span><div className="row-actions"><Button ghost disabled={cataloguePage===0} onClick={()=>setCataloguePage(p=>Math.max(0,p-1))}>Previous</Button><Button ghost disabled={(cataloguePage+1)*cataloguePageSize>=filteredPreview.length} onClick={()=>setCataloguePage(p=>p+1)}>Next</Button><Button primary onClick={startAuction}><Gavel size={17}/> Start Auction <ArrowRight size={16}/></Button></div></div>
      </Panel>
    </div>;
  }

  if(game.auction.status==='complete'||!player)return <div className="page"><PageHead kicker="MEGA AUCTION" title="Auction complete. Every franchise has a full squad." sub="Manager valuation, budget discipline and squad completion are complete. Review the final rosters before setting the Playing XI." action={<Button primary onClick={()=>{game.phase='squads';setGame({...game});setScreen('squads')}}>Open Squad & XI <ArrowRight size={16}/></Button>}/><AuctionComplete game={game} setScreen={setScreen}/></div>;
  const activeAssessment=currentTeam?assessAuctionBid(currentTeam,player,game,bid,game.teams,lotIndex,lots.length):undefined;
  const nextAmount=next;
  const humanOverseas=currentTeam?.playerIds.filter(id=>game.players.find(p=>p.id===id)?.overseas).length||0;
  const humanHardLimit=currentTeam?hardBidLimit(currentTeam):0;
  const isSelectedHumanLeading=Boolean(currentTeam&&leader===currentTeam.id);
  const humanBlockReason=!currentTeam?'Select a franchise':isSelectedHumanLeading?'Your selected franchise is leading; it cannot bid against itself. Choose another managed franchise to enter.':currentTeam.playerIds.length>=target?'Squad is full':player.overseas&&humanOverseas>=game.rules.maxOverseasSquad?'Overseas quota is full':currentTeam.purse<nextAmount?'Insufficient purse':nextAmount>humanHardLimit?'Bid exceeds this franchise’s spending ceiling':'';
  const humanEligible=Boolean(currentTeam&&!isSelectedHumanLeading&&game.auction.status==='live'&&currentTeam.playerIds.length<target&&(!player.overseas||humanOverseas<game.rules.maxOverseasSquad)&&currentTeam.purse>=nextAmount&&nextAmount<=humanHardLimit);
  const aiAssessments=bots.map(t=>({team:t,assessment:assessAuctionBid(t,player,game,bid,game.teams,lotIndex,lots.length)})).sort((a,b)=>b.assessment.maxBid-a.assessment.maxBid);
  return <div className="page auction-live-page">
    <PageHead kicker="MEGA AUCTION · LIVE MARKET" title="Every bid has a reason. Every rupee has a job." sub="Managers track role needs, expected value, form, pitch fit, scarcity, rival purses and future squad reserves. Pressure bids and late surprise entries are possible — but AI never exceeds its valuation cap." action={<div className="auction-head-actions">{game.auction.status==='live'&&<Button ghost disabled={bid>0||Boolean(leader)} onClick={skipCurrentPlayer}>Skip this player · AI / Unsold</Button>}<Button ghost onClick={skip}><Zap size={16}/> Auto-finish auction</Button>{game.auction.status==='paused'?<Button primary onClick={resumeAuction}><Play size={16}/> Resume Auction</Button>:<Button className="pause-auction-btn" onClick={pauseAuction}><Lock size={15}/> Pause Auction</Button>}</div>}/>
    {game.auction.pendingRTM&&(()=>{const pending=game.auction.pendingRTM!;const former=game.teams.find(t=>t.id===pending.formerTeamId);const winning=game.teams.find(t=>t.id===pending.winningTeamId);const rtmPlayer=game.players.find(p=>p.id===pending.playerId);return <Panel className="rtm-prompt-panel"><div><Kicker>RIGHT TO MATCH</Kicker><h2>{former?.name??'Former franchise'} can match the bid</h2><p>{rtmPlayer?.name??'This player'} has a winning bid of <b>{money(pending.bid)}</b> from {winning?.name??'the leading franchise'}. You have {game.offseason?.rtmRemaining?.[pending.formerTeamId]??0} RTM card(s) remaining.</p><small>Accepting transfers the player to your franchise at the winning price and consumes one RTM card.</small></div><div className="rtm-prompt-actions"><Button primary onClick={()=>{const current=game.auction.pendingRTM;if(!current)return;const owner=game.teams.find(t=>t.id===current.formerTeamId);if(!owner||owner.purse<current.bid||owner.playerIds.length>=target){window.alert('This franchise cannot afford or roster this RTM player.');return;}game.auction.pendingRTM=undefined;game.auction.status='live';game.auction.leadingTeamId=owner.id;game.offseason!.rtmRemaining[owner.id]=Math.max(0,(game.offseason?.rtmRemaining[owner.id]??1)-1);setLeader(owner.id);setBid(current.bid);setHammerStage('twice');setGame({...game});}}>Use RTM card</Button><Button ghost onClick={()=>{const current=game.auction.pendingRTM;if(current)game.auction.declinedRTMPlayerIds=[...new Set([...(game.auction.declinedRTMPlayerIds??[]),current.playerId])];game.auction.pendingRTM=undefined;game.auction.status='live';setHammerStage('twice');setGame({...game});}}>Pass on RTM</Button></div></Panel>})()}
    {game.auction.status==='paused'&&!game.auction.pendingRTM&&<div className="auction-paused-banner"><Lock size={17}/><div><b>Auction paused</b><span>The clock is stopped. No manager can bid until you resume.</span></div><Button primary onClick={resumeAuction}>Resume bidding</Button></div>}
    <div className="auction-live-status"><div><span>LOT</span><b>{String(lotIndex+1).padStart(3,'0')} <small>/ {lots.length}</small></b></div><div><span>LOTS SOLD</span><b>{game.auction.soldIds.length}</b></div><div><span>YOUR PURSE</span><b>{money(currentTeam?.purse||0)}</b></div><div><span>LIVE CONTENDERS</span><b>{biddersThisLot.length}</b></div><div className="auction-progress"><span>AUCTION PROGRESS</span><div><i style={{width:`${Math.min(100,lotIndex/Math.max(1,lots.length)*100)}%`}}/></div></div></div>
    <div className="auction-grid">
      <Panel className="lot-panel">
        <div className="lot-meta"><span>LOT {String(lotIndex+1).padStart(3,'0')} / {lots.length}</span><span>{player.basePriceTier.toUpperCase()} · OPEN {money(base)}</span></div>
        <div className="player-hero"><div className="player-avatar">{player.avatar}</div><div><h2>{player.name}</h2><p>{player.nationality} · {player.role} · Age {player.age}</p><div className="rating-row"><b>{player.overall}</b><span>OVR</span><b>{player.battingRating}</b><span>BAT</span><b>{player.bowlingRating}</b><span>BOWL</span><b>{player.form}</b><span>FORM</span></div></div><div className="base-price"><span>OPENING</span><b>{money(base)}</b><small>NEXT {money(nextAmount)}</small></div></div>
        <div className="bid-board"><span>{thinking?'MANAGERS ARE MAKING A DECISION':game.auction.status==='paused'?'AUCTION PAUSED':hammerStage==='once'?'GOING ONCE':hammerStage==='twice'?'GOING TWICE':hammerStage==='sold'?'SOLD · HAMMER DOWN':'CURRENT BID'}</span><strong>{money(bid||base)}</strong><small>{leaderTeam?`Leading · ${leaderTeam.code} · ${leaderTeam.name}`:`Opening at ${money(base)}`}</small><div className={`auctioneer-state hammer-${hammerStage}`}>{thinking?<><i className="thinking-pulse"/> Manager deliberation · checking valuation caps</>:hammerStage==='once'?'Going once. Managers can still raise before the hammer.':hammerStage==='twice'?'Going twice. One last chance to challenge this price.':hammerStage==='sold'?`SOLD · ${leaderTeam?.name||'No sale'} — hammer down.`:leader?`Leading bid stands at ${money(bid)} — awaiting the next challenger.`:'Auctioneer has opened the lot. A franchise may open at the base price.'}</div></div>
        <div className="bid-desk"><div className="bid-desk-head"><span>YOUR FRANCHISE BID DESK</span><small>{humans.length} human team{humans.length===1?'':'s'} · one button each · {thinking?'managers deciding…':hammerStage==='once'?'going once':hammerStage==='twice'?'going twice':hammerStage==='sold'?'sold':'live'}</small></div>
          <div className="bid-desk-grid" style={{gridTemplateColumns:`repeat(${Math.min(humans.length,3)},minmax(0,1fr))`}}>{humans.map(t=>{const st=teamBidState(t);const lead=leader===t.id;return <div key={t.id} className={`bid-team-card ${lead?'is-leading':''} ${st.ok?'can-bid':''} ${activeHuman===t.id?'is-active':''}`} style={{['--team-a' as any]:t.primary,['--team-b' as any]:t.secondary}} onClick={()=>setActiveHuman(t.id)}>
            <div className="bid-team-top"><Crest team={t} size={34}/><div><b>{t.code}</b><small>{t.name}</small></div></div>
            <div className="bid-team-stats"><span>PURSE<b>{money(t.purse)}</b></span><span>SQUAD<b>{t.playerIds.length}/{target}</b></span></div>
            <button className={`btn3d ${lead?'btn3d-lead':st.ok?'btn3d-bid':'btn3d-off'}`} disabled={!st.ok} onClick={e=>{e.stopPropagation();bidForTeam(t);}}><span className="btn3d-face">{lead?'LEADING':st.ok?(bid?`BID ${money(next)}`:`OPEN ${money(base)}`):st.reason.toUpperCase()}</span></button>
          </div>})}</div></div>
        {currentTeam&&<div className={`manager-advice ${activeAssessment&&activeAssessment.maxBid>=nextAmount?'can-contest':'hold-line'}`}><div><span>YOUR MANAGER'S READ</span><b>{activeAssessment?.strategy||'Select a franchise'}</b><small>{activeAssessment?.reasons.slice(0,2).join(' · ')}</small></div><div><span>AI VALUE ESTIMATE</span><b>{money(activeAssessment?.maxBid||0)}</b><small>Hard spending limit: {money(humanHardLimit)}</small></div></div>}
        <div className="auction-ladder"><div><span>NEXT INCREMENT</span><b>{money(bidIncrement(Math.max(base,bid)))}</b></div><div><span>AI CONTENDERS</span><b>{aiAssessments.filter(x=>x.assessment.eligible&&x.assessment.maxBid>=nextAmount).length} in range</b></div><div><span>PRICE CEILING</span><b>60% of original purse / player</b></div></div>
        <div className="auction-note"><Activity size={15}/>{leader?`${leaderTeam?.name} is leading. The AI can challenge, apply purse pressure, or re-enter late if its valuation still supports the price.`:'The first bidder opens at the tier base. Other managers assess price before entering.'}</div>{!thinking&&humanBlockReason&&<div className="bid-block-reason"><span>MANAGER DESK</span><b>{humanBlockReason}</b>{isSelectedHumanLeading&&<small>To place another bid, select a different human-controlled franchise above. A franchise cannot bid against itself.</small>}</div>}
      </Panel>
      <Panel className="war-room"><div className="panel-head"><div><Kicker>FRANCHISE WAR ROOM</Kicker><h3>Manager intent</h3><p>Live budgets, likely entry and hard valuations.</p></div></div>{game.teams.map(t=>{const v=assessAuctionBid(t,player,game,bid,game.teams,lotIndex,lots.length);const isLead=leader===t.id;const inRange=v.eligible&&v.maxBid>=nextAmount;return <div className={`war-row ${isLead?'leading':''} ${inRange?'in-range':''} ${squadViewId===t.id?'viewing':''}`} key={t.id} onClick={()=>setSquadViewId(t.id)} title="Click to view this franchise's squad"><Crest team={t} size={34}/><div className="war-team-copy"><b>{t.code} · {t.name}</b><small>{t.kind==='human'?'HUMAN MANAGER':inRange?(biddersThisLot.includes(t.id)?'AI · STILL IN THE FIGHT':'AI · CAN CHALLENGE'):'AI · OUT OF RANGE'}{t.kind==='bot'?` · ${managerArchetype(t)}`:''} · {t.playerIds.length}/{target}</small><div className="manager-cap-track"><i style={{width:`${Math.min(100,v.maxBid/Math.max(1,game.rules.startingPurse*.6)*100)}%`}}/></div></div><div className="war-finances"><strong>{money(t.purse)}</strong><small>cap {money(v.maxBid)}</small></div></div>})}<div className="recent-bids"><div className="mini-label">LIVE BID TAPE</div>{recent.length?recent.map((r,i)=><span key={i}>{r}</span>):<small>Awaiting the opening bid</small>}</div><div className="auction-brain-note"><b>110 decision signals</b><p>Role fit · form · pitch · scarcity · future reserve · rival pressure · manager temperament.</p></div></Panel>
    </div>
    <Panel className="squad-scout-panel"><div className="panel-head"><div><Kicker>FRANCHISE SQUAD SCOUT</Kicker><h3>See every team's players, live</h3><p>Tap a franchise to see who they have bought, what they paid, and what they still need.</p></div></div>
      <div className="scout-tabs">{game.teams.map(t=><button key={t.id} className={`scout-tab ${squadViewId===t.id?'active':''}`} onClick={()=>setSquadViewId(t.id)} style={{['--team-a' as any]:t.primary}}><i/>{t.code}<small>{t.playerIds.length}</small></button>)}</div>
      {(()=>{const st=game.teams.find(t=>t.id===squadViewId)??game.teams[0];const roster=st.playerIds.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>Boolean(p));const os=roster.filter(p=>p.overseas).length;return <div className="scout-body"><div className="scout-summary"><Crest team={st} size={42}/><div><b>{st.name}</b><small>{st.kind==='human'?'Human managed':`AI · ${managerArchetype(st)}`} · Purse {money(st.purse)} · {roster.length}/{target} players · {os}/{game.rules.maxOverseasSquad} overseas</small></div></div>
        {roster.length?<div className="scout-list">{roster.map(p=><div className="scout-row" key={p.id}><span className="player-avatar tiny">{p.avatar}</span><div><b>{p.name}{p.overseas?<em> ✈</em>:null}</b><small>{p.nationality} · {p.role}</small></div><span>{p.overall}<small>OVR</small></span><strong>{game.auction.soldPrices?.[p.id]?money(game.auction.soldPrices[p.id]):'—'}</strong></div>)}</div>:<div className="empty-state">No players bought yet.</div>}</div>})()}
    </Panel>
    {hammerStage==='sold'&&player&&<div className="sold-overlay"><div className="sold-card" style={{['--team-a' as any]:leaderTeam?.primary??'#f0643b'}}><div className="sold-stamp">{leaderTeam?'SOLD':'UNSOLD'}</div><div className="sold-player">{player.name}</div><div className="sold-meta">{player.nationality} · {player.role} · OVR {player.overall}</div>{leaderTeam?<><div className="sold-price">{money(bid)}</div><div className="sold-team"><Crest team={leaderTeam} size={44}/><b>{leaderTeam.name}</b></div></>:<div className="sold-team"><b>No bids received</b></div>}</div></div>}
  </div>;
}

function smartAutoAuction(game:GameState,lots:Player[]){runSmartAuction(game,lots);autoSelectAI(game)}
function finalizeSquads(game:GameState){const target=game.rules.maxSquad||game.rules.minSquad;if(game.teams.every(t=>t.playerIds.length>=target)){game.auction.status='complete';game.phase='squads';autoSelectAI(game);return;}const sold=new Set(game.auction.soldIds);const rostered=new Set(game.teams.flatMap(t=>t.playerIds));const remaining=game.auction.lotIds.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>p!==undefined&&!sold.has(p.id)&&!rostered.has(p.id));smartAutoAuction(game,remaining);}

function xiPlayerScore(p:Player,team:Team,game:GameState):number{
  const battingRole=['Opener','Top-order','Middle-order','Finisher','Wicketkeeper-Batter'].includes(p.role);
  const allRound=p.role.includes('All-rounder');
  const skill=allRound?(p.battingRating*.48+p.bowlingRating*.52):battingRole?p.battingRating:p.bowlingRating;
  const pitchBonus=team.pitch==='spin-friendly'&&p.role==='Spin Bowler'?5:team.pitch==='seam-friendly'&&p.role==='Pace Bowler'?5:team.pitch==='flat'&&battingRole?3:team.pitch==='slow'&&(p.role==='Spin Bowler'||allRound)?3:0;
  const injury=p.injury&&p.injury.daysRemaining>0?(p.injury.severity==='Season-ending'?45:p.injury.severity==='Serious'?30:p.injury.severity==='Moderate'?17:8):0;
  return p.overall*.35+skill*.27+p.form*.13+p.attrs.fitness*.08+p.sharpness*.06+p.morale*.04+(100-p.fatigue)*.04+p.attrs.temperament*.02+p.attrs.consistency*.02+pitchBonus-injury;
}
function chooseBestXI(team:Team,game:GameState):Player[]{
  const roster=team.playerIds.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>Boolean(p));
  const fit=roster.filter(p=>!p.injury||p.injury.daysRemaining<=0).sort((a,b)=>xiPlayerScore(b,team,game)-xiPlayerScore(a,team,game));
  const pool=(fit.length>=11?fit:roster.slice().sort((a,b)=>xiPlayerScore(b,team,game)-xiPlayerScore(a,team,game)));
  const chosen:Player[]=[];
  const overseasCount=()=>chosen.filter(p=>p.overseas).length;
  const canAdd=(p:Player)=>!chosen.some(x=>x.id===p.id)&&chosen.length<11&&(!p.overseas||overseasCount()<game.rules.maxOverseasXI);
  const addBest=(filter:(p:Player)=>boolean,count:number)=>{for(const p of pool.filter(filter)){if(count<=0)break;if(canAdd(p)){chosen.push(p);count--}}};
  // Preserve a stable match-day structure: openers, keeper, all-round coverage, pace and spin.
  addBest(p=>p.role==='Opener',2);
  addBest(p=>p.role==='Wicketkeeper-Batter',1);
  addBest(p=>p.role==='Top-order'||p.role==='Middle-order'||p.role==='Finisher',2);
  addBest(p=>p.role.includes('All-rounder'),2);
  addBest(p=>p.role==='Pace Bowler',2);
  addBest(p=>p.role==='Spin Bowler',1);
  addBest(()=>true,11-chosen.length);
  // If the overseas limit and injuries constrained the first pass, complete from any roster candidates legally.
  for(const p of pool){if(chosen.length===11)break;if(canAdd(p))chosen.push(p)}
  return chosen.slice(0,11);
}
function captainForXI(xi:Player[]):Player|undefined{return xi.slice().sort((a,b)=>(b.attrs.leadership+b.form*.18+b.morale*.08-b.fatigue*.08)-(a.attrs.leadership+a.form*.18+a.morale*.08-a.fatigue*.08))[0]}
function autoSelectAI(game:GameState){for(const t of game.teams){if(t.kind!=='bot'||t.playerIds.length<11)continue;const xi=chooseBestXI(t,game);t.playingXI=xi.map(p=>p.id);const captain=captainForXI(xi);t.captainId=captain?.id;t.viceCaptainId=xi.filter(p=>p.id!==captain?.id).sort((a,b)=>b.attrs.leadership-a.attrs.leadership)[0]?.id;t.wicketkeeperId=[...xi].filter(p=>p.role==='Wicketkeeper-Batter').sort((a,b)=>b.attrs.wicketkeeping-a.attrs.wicketkeeping)[0]?.id;const bowlers=xi.filter(p=>p.role.includes('Bowler')||p.role.includes('All-rounder'));const death=[...bowlers].sort((a,b)=>b.attrs.deathBowling-a.attrs.deathBowling)[0]?.id;const power=[...bowlers].filter(p=>p.id!==death).sort((a,b)=>b.attrs.powerplayBowling-a.attrs.powerplayBowling)[0]?.id;t.bowlingPlan={};for(const p of bowlers)t.bowlingPlan[p.id]=p.id===death?'Death':p.id===power?'Powerplay':p.role==='Spin Bowler'?'Middle overs':'Flexible';t.tacticalRoles={};for(const p of xi)t.tacticalRoles[p.id]=p.role==='Opener'?'Powerplay aggressor':p.role==='Finisher'?'Finisher':p.role==='Wicketkeeper-Batter'?'Keeper-batter':p.role.includes('Bowler')?(p.id===death?'Death specialist':p.id===power?'Powerplay specialist':'Middle-overs controller'):'Anchor'}}

function AuctionComplete({game,setScreen}:{game:GameState;setScreen:(s:any)=>void}){
  const [search,setSearch]=useState('');
  const [roleFilter,setRoleFilter]=useState('All roles');
  const [tierFilter,setTierFilter]=useState('All tiers');
  const [cataloguePage,setCataloguePage]=useState(0);
  const [showAllCatalogue,setShowAllCatalogue]=useState(false);
  const cataloguePageSize=40;
  const owned=new Set(game.teams.flatMap(t=>t.playerIds));
  const unsold=[...new Set(game.auction.unsoldIds)].map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>Boolean(p)&&!owned.has(p!.id));
  const filtered=unsold.filter(p=>(!search.trim()||p.name.toLowerCase().includes(search.toLowerCase())||p.nationality.toLowerCase().includes(search.toLowerCase()))&&(roleFilter==='All roles'||p.role===roleFilter)&&(tierFilter==='All tiers'||p.basePriceTier===tierFilter));
  const soldCount=new Set(game.auction.soldIds.filter(id=>owned.has(id))).size;
  const canReauction=game.teams.some(t=>t.playerIds.length<(game.rules.maxSquad||game.rules.minSquad));
  const beginReauction=()=>{
    if(!canReauction){window.alert('Every franchise has reached its configured squad size. Unsold players are archived below; open a squad slot before running another auction round.');return;}
    game.auction.previousUnsoldIds=[...new Set([...(game.auction.previousUnsoldIds??[]),...unsold.map(p=>p.id)])];
    game.auction.lotIds=unsold.map(p=>p.id);game.auction.currentIndex=0;game.auction.currentBid=0;game.auction.leadingTeamId=undefined;game.auction.bidHistory=[];game.auction.unsoldIds=[];game.auction.status='not-started';game.auction.skipped=false;game.auction.reAuctionMode=true;game.phase='auction';setGame({...game});setScreen('auction');
  };
  return <div className="auction-complete">
    <div className="complete-banner"><div><span>MARKET CLOSED</span><h2>Auction results & squad audit</h2><p>Review the final rosters, unsold lots and remaining purse. Unsold players remain in the career database and are not silently assigned to a team.</p></div><Trophy size={52}/></div>
    <div className="auction-result-kpis"><Stat label="Players sold" value={soldCount}/><Stat label="Unsold players" value={unsold.length}/><Stat label="Franchises" value={game.teams.length}/><Stat label="Squad target" value={game.rules.maxSquad}/></div>
    <div className="completion-grid">{game.teams.map(t=><Panel key={t.id}><div className="franchise-top"><Crest team={t} size={48}/><div><h3>{t.name}</h3><p>{t.code} · {t.playerIds.length}/{game.rules.maxSquad} players</p></div></div><div className="team-metrics"><Stat label="Purse" value={money(t.purse)}/><Stat label="Overseas" value={t.playerIds.filter(id=>game.players.find(p=>p.id===id)?.overseas).length}/><Stat label="Pitch" value={t.pitch}/></div></Panel>)}</div>
    <Panel className="unsold-player-panel"><div className="panel-head"><div><Kicker>UNSOLD REGISTER</Kicker><h3>{unsold.length} player{unsold.length===1?'':'s'} without a winning bid</h3><p>Every player below had no sale recorded in this auction round. Use the filters to review the market.</p></div><span className="unsold-count-badge">{unsold.length} UNSOLD</span></div>
      {unsold.length>0?<><div className="unsold-toolbar"><Field label="Search unsold players" placeholder="Player name or country" value={search} onChange={e=>{setSearch(e.target.value);setCataloguePage(0)}}/><Select label="Role" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option>All roles</option>{(['Opener','Top-order','Middle-order','Finisher','Wicketkeeper-Batter','Pace Bowler','Spin Bowler','Batting All-rounder','Bowling All-rounder'] as Role[]).map(r=><option key={r}>{r}</option>)}</Select><Select label="Tier" value={tierFilter} onChange={e=>{setTierFilter(e.target.value);setCataloguePage(0)}}><option>All tiers</option>{(['Uncapped','C','B','A','Marquee'] as const).map(t=><option key={t}>{t}</option>)}</Select></div>
      <div className="unsold-list"><div className="unsold-list-head"><span>PLAYER</span><span>ROLE / COUNTRY</span><span>OVR</span><span>FORM</span><span>BASE</span><span>STATUS</span></div>{filtered.map(p=><div className="unsold-row" key={p.id}><div className="unsold-player-name"><div className="player-avatar tiny">{p.avatar}</div><div><b>{p.name}</b><small>{p.basePriceTier} · {p.source?.includes('Academy')?'Academy':'Player pool'}</small></div></div><PlayerProfileTrigger playerId={p.id}/><span>{p.role}<small>{p.nationality}</small></span><b>{p.overall}</b><span>{p.form}</span><strong>{money(basePrice(p))}</strong><span className="unsold-status">NO SALE</span></div>)}{!filtered.length&&<div className="empty-state">No unsold players match these filters.</div>}</div></>:<div className="empty-state unsold-empty"><Check size={18}/> Every nominated player was sold or the remaining lots were withdrawn when all squads were full.</div>}
      <div className="unsold-actions"><div><b>Unsold players are preserved.</b><small>They remain searchable in the player database and can return in a future auction. A re-auction requires an available squad slot.</small></div><Button ghost disabled={!unsold.length||!canReauction} onClick={beginReauction}><RefreshCw size={15}/> Re-auction with open slots</Button></div>
    </Panel>
    <div className="auction-complete-actions"><Button primary onClick={()=>{game.phase='squads';setGame({...game});setScreen('squads')}}>Open Squad & XI <ArrowRight size={16}/></Button><Button ghost onClick={()=>setScreen('tournament')}>Open Tournament Hub <Trophy size={16}/></Button></div>
  </div>;
}

function Squads({game}:{game:GameState}){
  const [teamId,setTeamId]=useState(game.activeTeamId);
  const team=game.teams.find(t=>t.id===teamId)??game.teams[0];
  const [xi,setXi]=useState<string[]>(team.playingXI??[]);
  const [captain,setCaptain]=useState(team.captainId??'');
  const [viceCaptain,setViceCaptain]=useState(team.viceCaptainId??'');
  const [wicketkeeper,setWicketkeeper]=useState(team.wicketkeeperId??team.playingXI?.find(id=>game.players.find(p=>p.id===id)?.role==='Wicketkeeper-Batter')??'');
  const [bowlingPlan,setBowlingPlan]=useState<Record<string,'Powerplay'|'Middle overs'|'Death'|'Flexible'>>(team.bowlingPlan??{});
  const [tacticalRoles,setTacticalRoles]=useState<Record<string,string>>(team.tacticalRoles??{});
  const [filter,setFilter]=useState<'All'|'Available'|'Injured'|'In XI'>('All');
  const [roleFilter,setRoleFilter]=useState('All roles');
  const [notice,setNotice]=useState('');
  const [draggingId,setDraggingId]=useState<string|null>(null);
  const squad=team.playerIds.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>Boolean(p));
  const activeInjury=(p:Player)=>Boolean(p.injury&&p.injury.daysRemaining>0);
  const healthy=squad.filter(p=>!activeInjury(p));
  const oversea=squad.filter(p=>p.overseas).length;
  const bowlOptions=squad.filter(p=>p.role.includes('Bowler')||p.role.includes('All-rounder')).length;
  const average=(values:number[])=>values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):0;
  const xiPlayers=xi.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>Boolean(p));
  const selectedKeepers=xiPlayers.filter(p=>p.role==='Wicketkeeper-Batter');
  const selectable=squad.filter(p=>(filter==='All'||(filter==='Available'&&!activeInjury(p))||(filter==='Injured'&&activeInjury(p))||(filter==='In XI'&&xi.includes(p.id)))&&(roleFilter==='All roles'||p.role===roleFilter));
  const bowlingCandidates=xiPlayers.filter(p=>p.role.includes('Bowler')||p.role.includes('All-rounder'));
  const selectTeam=(id:string)=>{
    setTeamId(id);const t=game.teams.find(x=>x.id===id)!;
    const nextXI=t.playingXI??[];setXi(nextXI);setCaptain(t.captainId??'');setViceCaptain(t.viceCaptainId??'');
    setWicketkeeper(t.wicketkeeperId??nextXI.find(pid=>game.players.find(p=>p.id===pid)?.role==='Wicketkeeper-Batter')??'');
    setBowlingPlan(t.bowlingPlan??{});setTacticalRoles(t.tacticalRoles??{});setNotice('');
  };
  const toggle=(id:string)=>{
    const current=xi;
    if(current.includes(id)){
      setXi(current.filter(v=>v!==id));
      if(captain===id)setCaptain('');
      if(viceCaptain===id)setViceCaptain('');
      if(wicketkeeper===id)setWicketkeeper('');
      setNotice('');
      return;
    }
    if(current.length>=11){setNotice('Playing XI is full. Remove a player before adding another.');return;}
    setXi([...current,id]);setNotice('');
  };
  const moveXI=(id:string,delta:number)=>setXi(prev=>{const from=prev.indexOf(id),to=from+delta;if(from<0||to<0||to>=prev.length)return prev;const next=[...prev];[next[from],next[to]]=[next[to],next[from]];return next});
  const roleDutyOptions=(p:Player)=>p.role.includes('Bowler')||p.role.includes('All-rounder')?['Powerplay aggressor','Middle-overs controller','Death specialist','Wicket-taking option','Containment option']:p.role==='Wicketkeeper-Batter'?['Keeper-batter','Powerplay aggressor','Anchor','Finisher']:p.role==='Finisher'?['Finisher','Powerplay aggressor','Middle-overs stabiliser','Impact hitter']:['Anchor','Powerplay aggressor','Middle-overs stabiliser','Finisher'];
  const defaultPlans=(players:Player[])=>{
    const bowls=players.filter(p=>p.role.includes('Bowler')||p.role.includes('All-rounder'));
    const bestDeath=[...bowls].sort((a,b)=>b.attrs.deathBowling-a.attrs.deathBowling)[0]?.id;
    const bestPower=[...bowls].sort((a,b)=>b.attrs.powerplayBowling-a.attrs.powerplayBowling)[0]?.id;
    const plan:Record<string,'Powerplay'|'Middle overs'|'Death'|'Flexible'>={};
    bowls.forEach(p=>{plan[p.id]=p.id===bestDeath?'Death':p.id===bestPower?'Powerplay':p.role==='Spin Bowler'?'Middle overs':'Flexible'});
    return plan;
  };
  const autoSelect=()=>{
    const chosen=chooseBestXI(team,game);const ids=chosen.map(p=>p.id);const captainPlayer=captainForXI(chosen);
    const keeper=[...chosen].filter(p=>p.role==='Wicketkeeper-Batter').sort((a,b)=>b.attrs.wicketkeeping-a.attrs.wicketkeeping)[0];
    const bowlPlan=defaultPlans(chosen);const duties:Record<string,string>={};
    chosen.forEach(p=>{duties[p.id]=p.role.includes('Bowler')||p.role.includes('All-rounder')?(bowlPlan[p.id]==='Death'?'Death specialist':bowlPlan[p.id]==='Powerplay'?'Powerplay specialist':bowlPlan[p.id]==='Middle overs'?'Middle-overs controller':'Flexible all-round option'):p.role==='Finisher'?'Finisher':p.role==='Opener'?'Powerplay aggressor':p.role==='Wicketkeeper-Batter'?'Keeper-batter':'Anchor'});
    setXi(ids);setCaptain(captainPlayer?.id??ids[0]??'');setViceCaptain(chosen.filter(p=>p.id!==captainPlayer?.id).sort((a,b)=>b.attrs.leadership-a.attrs.leadership)[0]?.id??'');setWicketkeeper(keeper?.id??'');setBowlingPlan(bowlPlan);setTacticalRoles(duties);
    team.playingXI=ids;team.captainId=captainPlayer?.id??ids[0];team.viceCaptainId=chosen.filter(p=>p.id!==team.captainId).sort((a,b)=>b.attrs.leadership-a.attrs.leadership)[0]?.id;team.wicketkeeperId=keeper?.id;team.bowlingPlan=bowlPlan;team.tacticalRoles=duties;
    setGame({...game});setNotice(`Auto-selection complete: ${ids.length} players ordered using skill, form, fitness, fatigue, morale, injuries, pitch fit and role balance. Captain, vice-captain, keeper and bowling plan were assigned.`);
  };
  const saveXI=()=>{
    if(xi.length!==11){setNotice('Select exactly 11 players before saving.');return;}
    if(!xi.includes(captain)){setNotice('Choose a captain from the selected XI.');return;}
    if(viceCaptain&&viceCaptain===captain){setNotice('Captain and vice-captain must be different players.');return;}
    if(squad.some(p=>p.role==='Wicketkeeper-Batter')&&(!xi.includes(wicketkeeper)||game.players.find(p=>p.id===wicketkeeper)?.role!=='Wicketkeeper-Batter')){setNotice('Choose a wicketkeeper from the available wicketkeeper-batters in the XI.');return;}
    if(xiPlayers.filter(p=>p.overseas).length>game.rules.maxOverseasXI){setNotice(`Too many overseas players: the XI limit is ${game.rules.maxOverseasXI}.`);return;}
    team.playingXI=xi;team.captainId=captain;team.viceCaptainId=viceCaptain||xi.find(id=>id!==captain);team.wicketkeeperId=wicketkeeper;team.bowlingPlan=bowlingPlan;team.tacticalRoles=tacticalRoles;
    setGame({...game});setNotice(`Saved XI, batting order, leadership, wicketkeeper and bowling plan for ${team.name}.`);
  };
  const recoverySession=()=>{
    let healed=0,rested=0;
    for(const id of team.playerIds){const p=game.players.find(x=>x.id===id);if(!p)continue;
      if(p.injury&&p.injury.daysRemaining>0){p.injury.daysRemaining=Math.max(0,p.injury.daysRemaining-1);if(p.injury.daysRemaining===0){delete p.injury;healed++;}}
      const before=p.fatigue;p.fatigue=clamp(p.fatigue-12,0,100);p.sharpness=clamp(p.sharpness+5,0,100);p.morale=clamp(p.morale+1,0,100);if(before>p.fatigue)rested++;
    }
    setGame({...game});setNotice(`Recovery day complete for ${team.name}: ${healed} injury${healed===1?'':'ies'} cleared, ${rested} players reduced fatigue, and squad sharpness improved.`);
  };
  const strengthXI=xiPlayers.filter(p=>!activeInjury(p));
  const batStrength=average(strengthXI.map(p=>p.battingRating));
  const bowlStrength=average(strengthXI.filter(p=>p.role.includes('Bowler')||p.role.includes('All-rounder')).map(p=>p.bowlingRating));
  const fieldStrength=average(strengthXI.map(p=>p.fieldingRating));
  const strengthWarnings:string[]=[];
  if(xi.length<11)strengthWarnings.push(`Select ${11-xi.length} more player${11-xi.length===1?'':'s'} to complete the XI.`);
  if(!selectedKeepers.length)strengthWarnings.push('No specialist wicketkeeper is selected.');
  if(bowlingCandidates.length<5)strengthWarnings.push('Fewer than five bowling options: consider another all-rounder or specialist.');
  if(xiPlayers.filter(p=>p.overseas).length>game.rules.maxOverseasXI)strengthWarnings.push('Overseas limit is exceeded.');
  if(xiPlayers.some(activeInjury))strengthWarnings.push('One or more selected players are injured.');
  if(!viceCaptain)strengthWarnings.push('Vice-captain is not assigned.');
  const trendBars=(p:Player)=>(p.formHistory?.length?p.formHistory:[p.form-4,p.form-2,p.form-1,p.form,p.form]).slice(-5);
  const teamSignals:[string,string,string][]=[

    ['Squad size',`${squad.length}/${game.rules.maxSquad}`,squad.length>=11?'Ready':'Needs players'],['Available players',String(healthy.length),healthy.length>=11?'XI available':'Short on fit players'],['Average overall',String(average(squad.map(p=>p.overall))),'Squad quality'],['Average form',String(average(squad.map(p=>p.form))),'Recent performance'],['Average fitness',String(average(squad.map(p=>p.attrs.fitness))),'Physical readiness'],['Average sharpness',String(average(squad.map(p=>p.sharpness))),'Match readiness'],['Average morale',String(average(squad.map(p=>p.morale))),'Dressing-room state'],['Average fatigue',String(average(squad.map(p=>p.fatigue))),'Lower is better'],['Injury list',String(squad.filter(activeInjury).length),'Players unavailable / at risk'],['Overseas quota',`${oversea}/${game.rules.maxOverseasSquad}`,'Squad limit'],['Playing XI overseas',`${xi.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>Boolean(p?.overseas)).length}/${game.rules.maxOverseasXI}`,'Match-day limit'],['Wicketkeepers',String(squad.filter(p=>p.role==='Wicketkeeper-Batter').length),'Specialist cover'],['Openers',String(squad.filter(p=>p.role==='Opener').length),'Powerplay options'],['Top-order batters',String(squad.filter(p=>p.role==='Top-order').length),'Top-order depth'],['Middle-order batters',String(squad.filter(p=>p.role==='Middle-order').length),'Middle-order depth'],['Finishers',String(squad.filter(p=>p.role==='Finisher').length),'Death-over hitting'],['Pace bowlers',String(squad.filter(p=>p.role==='Pace Bowler').length),'Fast-bowling depth'],['Spin bowlers',String(squad.filter(p=>p.role==='Spin Bowler').length),'Spin depth'],['All-rounders',String(squad.filter(p=>p.role.includes('All-rounder')).length),'Flexible combinations'],['Bowling options',String(bowlOptions),'Specialists + all-rounders'],['Average batting',String(average(squad.map(p=>p.battingRating))),'Batting strength'],['Average bowling',String(average(squad.map(p=>p.bowlingRating))),'Bowling strength'],['Average fielding',String(average(squad.map(p=>p.fieldingRating))),'Fielding strength'],['Strong form',String(squad.filter(p=>p.form>=80).length),'Form ≥ 80'],['Poor form',String(squad.filter(p=>p.form<60).length),'Form < 60'],['High fatigue',String(squad.filter(p=>p.fatigue>=70).length),'Fatigue ≥ 70'],['Low fitness',String(squad.filter(p=>p.attrs.fitness<60).length),'Fitness < 60'],['Low sharpness',String(squad.filter(p=>p.sharpness<60).length),'Sharpness < 60'],['Low morale',String(squad.filter(p=>p.morale<55).length),'Morale < 55'],['Batting 80+',String(squad.filter(p=>p.battingRating>=80).length),'High quality bats'],['Bowling 80+',String(squad.filter(p=>p.bowlingRating>=80).length),'High quality bowlers'],['Fielding 80+',String(squad.filter(p=>p.fieldingRating>=80).length),'Elite fielders'],['High potential',String(squad.filter(p=>p.attrs.potential>=85).length),'Development assets'],['Leadership options',String(squad.filter(p=>p.attrs.leadership>=75).length),'Captaincy candidates'],['Young players',String(squad.filter(p=>p.age<=23).length),'Under 24'],['Veterans',String(squad.filter(p=>p.age>=32).length),'Age 32+'],['Left-hand batters',String(squad.filter(p=>p.battingHand==='LHB').length),'Handedness balance'],['Right-hand batters',String(squad.filter(p=>p.battingHand==='RHB').length),'Handedness balance'],['Indian players',String(squad.filter(p=>p.nationality==='India').length),'Domestic core'],['Overseas players',String(oversea),'International slots'],['Pace-suited players',String(squad.filter(p=>p.role==='Pace Bowler'||p.bowlingType.toLowerCase().includes('pace')).length),'Seam conditions'],['Spin-suited players',String(squad.filter(p=>p.role==='Spin Bowler'||p.bowlingType.toLowerCase().includes('spin')).length),'Spin conditions'],['Death skill avg',String(average(squad.map(p=>p.attrs.deathBowling))),'Late overs'],['Powerplay skill avg',String(average(squad.map(p=>p.attrs.powerplayBowling))),'New ball'],['Accuracy avg',String(average(squad.map(p=>p.attrs.accuracy))),'Control'],['Variation avg',String(average(squad.map(p=>p.attrs.variation))),'Change-ups'],['Temperament avg',String(average(squad.map(p=>p.attrs.temperament))),'Pressure response'],['Consistency avg',String(average(squad.map(p=>p.attrs.consistency))),'Reliability'],['Potential avg',String(average(squad.map(p=>p.attrs.potential))),'Long-term ceiling'],['Captain selected',game.players.find(p=>p.id===captain)?.name??'Not set','Leadership']
  ];
  return <div className="page squad-page">
    <PageHead kicker="SQUAD ROOM" title="Build a match plan, not just a list of players." sub="Arrange batting order, define leadership, nominate the wicketkeeper, assign bowling phases and manage player recovery." action={<Select label="Active franchise" value={teamId} onChange={e=>selectTeam(e.target.value)}>{game.teams.filter(t=>t.kind==='human').map(t=><option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</Select>}/>
    <div className="squad-overview-grid">
      <div className="squad-overview-card"><span>FIT / AVAILABLE</span><b>{healthy.length}<small> / {squad.length}</small></b><i style={{width:`${squad.length?healthy.length/squad.length*100:0}%`}}/></div>
      <div className="squad-overview-card"><span>TEAM FORM</span><b>{average(squad.map(p=>p.form))}<small> / 100</small></b><i style={{width:`${average(squad.map(p=>p.form))}%`}}/></div>
      <div className="squad-overview-card"><span>FITNESS</span><b>{average(squad.map(p=>p.attrs.fitness))}<small> / 100</small></b><i style={{width:`${average(squad.map(p=>p.attrs.fitness))}%`}}/></div>
      <div className="squad-overview-card"><span>BOWLING OPTIONS</span><b>{bowlOptions}<small> players</small></b><i style={{width:`${Math.min(100,bowlOptions/6*100)}%`}}/></div>
      <div className="squad-overview-card"><span>INJURED</span><b>{squad.filter(activeInjury).length}<small> players</small></b><i className="injury-meter" style={{width:`${squad.length?squad.filter(activeInjury).length/squad.length*100:0}%`}}/></div>
    </div>
    <div className="squad-action-strip"><div><HeartPulse size={19}/><div><b>Recovery & workload</b><small>Advance one recovery day for this franchise. Injury days tick down; fatigue eases and sharpness recovers.</small></div></div><Button ghost onClick={recoverySession}><RefreshCw size={15}/> Run recovery day</Button></div>
    <div className="squad-layout">
      <Panel className="squad-roster-panel">
        <div className="panel-head"><div><Kicker>{team.code} · SQUAD</Kicker><h3>{team.name}</h3><p>{squad.length} signed · {oversea} overseas · purse {money(team.purse)}</p></div><div className="squad-roster-actions"><Button primary onClick={autoSelect}><Sparkles size={16}/> Auto-select best XI</Button><Button ghost onClick={()=>{setXi([]);setCaptain('');setViceCaptain('');setWicketkeeper('');setNotice('Playing XI cleared. Select 11 players or use Auto-select.')}}>Clear XI</Button></div></div>
        <div className="squad-filter-row"><div className="squad-filter-buttons">{(['All','Available','Injured','In XI'] as const).map(f=><button key={f} className={filter===f?'active':''} onClick={()=>setFilter(f)}>{f}</button>)}</div><Select label="Role" value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}><option>All roles</option>{(['Opener','Top-order','Middle-order','Finisher','Wicketkeeper-Batter','Pace Bowler','Spin Bowler','Batting All-rounder','Bowling All-rounder'] as Role[]).map(r=><option key={r}>{r}</option>)}</Select></div>
        <div className="squad-list">{selectable.map(p=><button key={p.id} onClick={()=>toggle(p.id)} className={`squad-player squad-player-expanded ${xi.includes(p.id)?'selected':''} ${activeInjury(p)?'injured':''}`}><div className="player-avatar small">{p.avatar}</div><div className="player-info"><b>{p.name}</b><small>{p.nationality} · {p.role} · Age {p.age}</small><div className="player-condition-chips"><span className={p.form>=80?'good':p.form<60?'low':''}>FORM {p.form}</span><span className={p.attrs.fitness>=70?'good':p.attrs.fitness<55?'low':''}>FIT {p.attrs.fitness}</span><span className={p.fatigue>=70?'low':''}>FAT {p.fatigue}</span><span className={p.sharpness>=75?'good':p.sharpness<55?'low':''}>SHARP {p.sharpness}</span><span className={p.morale<55?'low':'good'}>MORALE {p.morale}</span>{activeInjury(p)&&<span className="low">INJURED · {p.injury?.daysRemaining}d</span>}</div><div className="player-form-trend" aria-label={`Form trend for ${p.name}`}>{trendBars(p).map((v,i)=><i key={i} title={`Form ${v}`} className={i===trendBars(p).length-1?'current':''} style={{height:`${Math.max(12,Math.min(100,v))}%`}}/>)}<small>LAST 5 FORM</small></div></div><PlayerProfileTrigger playerId={p.id}/><div className="player-ratings"><span>{p.overall}</span><small>OVR</small></div><div className="player-ratings"><span>{p.battingRating}</span><small>BAT</small></div><div className="player-ratings"><span>{p.bowlingRating}</span><small>BOWL</small></div><div className="xi-mark">{xi.includes(p.id)?<Check size={16}/>:''}</div></button>)}</div>
        {notice&&<div className="squad-notice"><Check size={16}/>{notice}</div>}
      </Panel>
      <div className="xi-management-stack">
        <Panel className="xi-panel"><div className="panel-head"><div><Kicker>PLAYING XI · BATTING ORDER</Kicker><h3>{xi.length}/11 selected</h3><p>Drag a player or use the arrow controls to move them up or down the batting order.</p></div><Button primary disabled={xi.length!==11} onClick={saveXI}><Check size={16}/> Save match plan</Button></div>
          <div className="xi-slots">{Array.from({length:11},(_,i)=>{const p=game.players.find(x=>x.id===xi[i]);return <div className={`xi-slot xi-slot-draggable ${p&&activeInjury(p)?'xi-slot-injured':''}`} key={xi[i]??`empty-${i}`} draggable={Boolean(p)} onDragStart={()=>p&&setDraggingId(p.id)} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();if(!p||!draggingId||draggingId===p.id)return;setXi(prev=>{const from=prev.indexOf(draggingId),to=prev.indexOf(p.id);if(from<0||to<0)return prev;const next=[...prev];next.splice(from,1);next.splice(to,0,draggingId);return next});setDraggingId(null)}}><span className="xi-order-number">{String(i+1).padStart(2,'0')}</span>{p?<><div className="player-avatar tiny">{p.avatar}</div><div className="xi-player-content"><div className="xi-player-heading"><b>{p.name}</b><small>{p.role}{activeInjury(p)?` · INJURED ${p.injury?.daysRemaining}d`:''}</small></div><div className="xi-control-row"><div className="xi-slot-move"><button disabled={i===0} onClick={()=>moveXI(p.id,-1)} title="Move up batting order" aria-label={`Move ${p.name} up`}><ArrowUp size={12}/></button><button disabled={i===xi.length-1} onClick={()=>moveXI(p.id,1)} title="Move down batting order" aria-label={`Move ${p.name} down`}><ArrowDown size={12}/></button></div><Select label="Tactical duty" value={tacticalRoles[p.id]??roleDutyOptions(p)[0]} onChange={e=>setTacticalRoles(prev=>({...prev,[p.id]:e.target.value}))}>{roleDutyOptions(p).map(x=><option key={x}>{x}</option>)}</Select><button type="button" className={`keeper-toggle ${wicketkeeper===p.id?'active':''}`} disabled={p.role!=='Wicketkeeper-Batter'} onClick={()=>setWicketkeeper(p.id)} title={p.role==='Wicketkeeper-Batter'?'Designate wicketkeeper':'Player is not a specialist wicketkeeper'}>{wicketkeeper===p.id?'WK':'Set WK'}</button></div></div><button className="remove-xi-player" onClick={()=>toggle(p.id)} aria-label={`Remove ${p.name}`}>×</button></>:<div className="empty-xi">Select from squad</div>}</div>})}</div>
          <div className="leadership-grid"><div className="captain-box"><div><Kicker>LEADERSHIP</Kicker><h3>Captain</h3><small>Based on leadership, morale and recent form.</small></div><Select label="Captain" value={captain} onChange={e=>setCaptain(e.target.value)}><option value="">Select captain</option>{xi.map(id=>{const p=game.players.find(x=>x.id===id);return p?<option key={id} value={id}>{p.name}</option>:null})}</Select></div><div className="captain-box"><div><Kicker>LEADERSHIP</Kicker><h3>Vice-captain</h3><small>Must be different from the captain.</small></div><Select label="Vice-captain" value={viceCaptain} onChange={e=>setViceCaptain(e.target.value)}><option value="">Select vice-captain</option>{xi.filter(id=>id!==captain).map(id=>{const p=game.players.find(x=>x.id===id);return p?<option key={id} value={id}>{p.name}</option>:null})}</Select></div><div className="captain-box keeper-select-box"><div><Kicker>GLOVE DUTY</Kicker><h3>Wicketkeeper</h3><small>{selectedKeepers.length} specialist keeper(s) in XI.</small></div><Select label="Wicketkeeper" value={wicketkeeper} onChange={e=>setWicketkeeper(e.target.value)}><option value="">Select keeper</option>{selectedKeepers.map(p=><option key={p.id} value={p.id}>{p.name} · WK {p.attrs.wicketkeeping}</option>)}</Select></div></div>
          <div className="bowling-plan"><div className="panel-head"><div><Kicker>TACTICAL BOWLING PLAN</Kicker><h3>Assign over phases</h3><p>Phase assignments influence the bowler selected between overs.</p></div><Target size={18}/></div>{bowlingCandidates.map(p=><div className="bowling-plan-row" key={p.id}><div className="player-avatar tiny">{p.avatar}</div><div><b>{p.name}</b><small>{p.role} · death {p.attrs.deathBowling} · powerplay {p.attrs.powerplayBowling}</small></div><Select label={`Bowling phase for ${p.name}`} value={bowlingPlan[p.id]??'Flexible'} onChange={e=>setBowlingPlan(prev=>({...prev,[p.id]:e.target.value as 'Powerplay'|'Middle overs'|'Death'|'Flexible'}))}><option>Powerplay</option><option>Middle overs</option><option>Death</option><option>Flexible</option></Select></div>)}</div>
          <div className="xi-balance-summary"><b>XI BALANCE CHECK</b><span>{xiPlayers.filter(p=>['Opener','Top-order','Middle-order','Finisher','Wicketkeeper-Batter'].includes(p.role)).length} batting roles</span><span>{bowlingCandidates.length} bowling options</span><span>{xiPlayers.filter(p=>p.overseas).length}/{game.rules.maxOverseasXI} overseas</span><span>{xiPlayers.filter(activeInjury).length} injured selected</span></div>
        </Panel>
        <Panel className="xi-strength-panel"><div className="panel-head"><div><Kicker>TEAM STRENGTH ANALYSIS</Kicker><h3>How competitive is this XI?</h3><p>Strength is calculated from selected available players, not the full squad.</p></div><TrendingUp size={19}/></div><div className="xi-strength-grid"><div><span>BATTING</span><b>{batStrength}</b><i style={{width:`${batStrength}%`}}/></div><div><span>BOWLING</span><b>{bowlStrength}</b><i style={{width:`${bowlStrength}%`}}/></div><div><span>FIELDING</span><b>{fieldStrength}</b><i style={{width:`${fieldStrength}%`}}/></div><div><span>FIT XI</span><b>{xi.length?Math.round(strengthXI.length/xi.length*100):0}%</b><i style={{width:`${xi.length?strengthXI.length/xi.length*100:0}%`}}/></div></div><div className="strength-notes">{strengthWarnings.length?strengthWarnings.map(w=><div key={w} className="strength-warning"><span>!</span>{w}</div>):<div className="strength-good"><Check size={15}/> XI passes the current availability, keeper, bowling depth, overseas and leadership checks.</div>}</div></Panel>
      </div>
    </div>
    <Panel className="squad-intelligence-panel"><div className="panel-head"><div><Kicker>SQUAD INTELLIGENCE</Kicker><h3>52-point squad report</h3><p>Live roster diagnostics covering availability, role balance, skill depth, leadership, form and workload.</p></div><span className="squad-signal-count">{teamSignals.length} METRICS</span></div><div className="squad-signal-grid">{teamSignals.map(([label,value,hint])=><div className="squad-signal" key={label}><span>{label}</span><b>{value}</b><small>{hint}</small></div>)}</div></Panel>
  </div>;
}

function Fixtures({game,setScreen}:{game:GameState;setScreen:(s:any)=>void}){
  ensureFixtureCalendar(game);
  const [statusFilter,setStatusFilter]=useState('All matches');
  const [roundFilter,setRoundFilter]=useState('All rounds');
  const [teamFilter,setTeamFilter]=useState('All teams');
  const [resultId,setResultId]=useState('');
  const played=game.fixtures.filter(f=>f.status==='completed').length;
  const live=game.fixtures.filter(f=>f.status==='live').length;
  const rounds=[...new Set(game.fixtures.map(f=>f.round))].sort((a,b)=>a-b);
  const filtered=game.fixtures.filter(f=>{
    const statusOk=statusFilter==='All matches'||f.status===statusFilter.toLowerCase();
    const roundOk=roundFilter==='All rounds'||String(f.round)===roundFilter;
    const teamOk=teamFilter==='All teams'||f.homeTeamId===teamFilter||f.awayTeamId===teamFilter;
    return statusOk&&roundOk&&teamOk;
  });
  const open=(f:GameState['fixtures'][number])=>{
    if(f.status==='completed'){setResultId(f.id);return;}
    if(game.liveMatch&&game.liveMatch.status!=='completed'&&game.liveMatch.fixtureId!==f.id){return;}
    const nextPlayable=game.fixtures.filter(x=>x.status==='scheduled').sort((a,b)=>a.round-b.round)[0];
    if(f.status==='scheduled'&&nextPlayable&&nextPlayable.id!==f.id){window.alert(`Play the next scheduled fixture first: ${nextPlayable.label??`Round ${nextPlayable.round}`}. Future matches can be viewed, but not started out of order.`);return;}
    const home=game.teams.find(t=>t.id===f.homeTeamId)!;const away=game.teams.find(t=>t.id===f.awayTeamId)!;
    const unconfirmed=[home,away].find(t=>t.kind==='human'&&(t.playingXI?.length??0)!==11);
    if(unconfirmed){window.alert(`${unconfirmed.name}: confirm 11 players in Squad & XI before starting this match.`);setScreen('squads');return;}
    const injured=[home,away].find(t=>t.kind==='human'&&t.playingXI.some(id=>{const p=game.players.find(x=>x.id===id);return !!p?.injury&&p.injury.daysRemaining>0;}));
    if(injured){window.alert(`${injured.name}: an injured player is still selected in the Playing XI. Please update the team.`);setScreen('squads');return;}
    if(!game.liveMatch||game.liveMatch.fixtureId!==f.id)prepareMatch(game,f);
    setGame({...game});setScreen('season');
  };
  const selectedResult=game.fixtures.find(f=>f.id===resultId);
  return <div className="page fixtures-page">
    <PageHead kicker="FIXTURE DESK" title="A season built round by round." sub="A double round-robin calendar: every opponent twice, home and away. Open any scheduled game to enter the match centre; completed games are preserved as results." action={<Button ghost onClick={()=>setScreen('tournament')}><Trophy size={16}/> Tournament hub</Button>}/>
    <div className="stats-grid four fixture-summary"><Stat label="Matches played" value={`${played}/${game.fixtures.length}`} sub="season progress"/><Stat label="Live now" value={live} sub="in progress"/><Stat label="Rounds" value={rounds.length} sub="scheduled matchdays"/><Stat label="Remaining" value={game.fixtures.length-played-live} sub="still to play"/></div>
    {game.liveMatch&&game.liveMatch.status!=='completed'&&<Panel className="fixture-live-banner"><div><Kicker>LIVE MATCH</Kicker><h3>{game.teams.find(t=>t.id===game.liveMatch?.homeTeamId)?.name} vs {game.teams.find(t=>t.id===game.liveMatch?.awayTeamId)?.name}</h3><p>A match is already open. Resume it before starting another fixture.</p></div><Button primary onClick={()=>setScreen('season')}>Resume match <ArrowRight size={16}/></Button></Panel>}
    <Panel><div className="panel-head"><div><Kicker>SEASON CALENDAR</Kicker><h3>Fixtures & results</h3><p>Rounds are grouped as real matchdays; each franchise appears no more than once per round.</p></div><Button ghost disabled={game.fixtures.some(f=>f.status!=='scheduled')} onClick={()=>{game.fixtures=makeFixtures(game.teams);setGame({...game});}}>Reset schedule</Button></div>
      <div className="fixture-filter-bar"><Select label="Match status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>{['All matches','Scheduled','Live','Completed'].map(v=><option key={v}>{v}</option>)}</Select><Select label="Round" value={roundFilter} onChange={e=>setRoundFilter(e.target.value)}><option>All rounds</option>{rounds.map(r=><option key={r} value={String(r)}>Round {r}</option>)}</Select><Select label="Franchise" value={teamFilter} onChange={e=>setTeamFilter(e.target.value)}><option>All teams</option>{game.teams.map(t=><option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</Select></div>
      <div className="fixture-table fixture-table-pro"><div className="fixture-head"><span>ROUND</span><span>HOME</span><span>AWAY</span><span>VENUE</span><span>RESULT / STATUS</span><span>ACTION</span></div>
      {filtered.map(f=>{const h=game.teams.find(t=>t.id===f.homeTeamId)!,a=game.teams.find(t=>t.id===f.awayTeamId)!;const active=game.liveMatch?.fixtureId===f.id&&game.liveMatch.status!=='completed';const nextPlayable=game.fixtures.filter(x=>x.status==='scheduled').sort((a,b)=>a.round-b.round)[0];const locked=f.status==='scheduled'&&!!nextPlayable&&nextPlayable.id!==f.id;const score=f.status==='completed'?`${h.code} ${f.homeRuns??0}/${f.homeWickets??'—'} · ${a.code} ${f.awayRuns??0}/${f.awayWickets??'—'}`:f.status==='live'?'LIVE':'Scheduled';return <div className={`fixture-row fixture-row-pro ${f.status==='live'?'is-live':''} ${f.status==='completed'?'is-complete':''}`} key={f.id}><span className="round-cell">{f.label??`R${String(f.round).padStart(2,'0')}`}</span><div className="fixture-team-cell"><Crest team={h} size={28}/><b>{h.code}</b><small>{h.name}</small></div><span className="fixture-vs">vs</span><div className="fixture-team-cell"><Crest team={a} size={28}/><b>{a.code}</b><small>{a.name}</small></div><div className="fixture-result-cell"><b>{score}</b><small>{f.status==='completed'?(f.resultText??(f.winnerTeamId?`${game.teams.find(t=>t.id===f.winnerTeamId)?.name} won`:'Match complete')):f.venue??h.ground}</small></div><div>{f.status==='completed'?<Button ghost onClick={()=>setResultId(f.id)}>View result</Button>:<Button primary disabled={locked||(!!game.liveMatch&&game.liveMatch.status!=='completed'&&!active)} onClick={()=>open(f)}>{active?'Resume live':f.status==='live'?'Open live':locked?'Play earlier match first':'Watch match'} <ArrowRight size={14}/></Button>}</div></div>})}
      {!filtered.length&&<div className="empty-state">No fixtures match these filters.</div>}</div>
    </Panel>
    {selectedResult&&<Panel className="fixture-result-detail"><div className="panel-head"><div><Kicker>FINAL RESULT · ROUND {selectedResult.round}</Kicker><h3>{game.teams.find(t=>t.id===selectedResult.homeTeamId)?.name} vs {game.teams.find(t=>t.id===selectedResult.awayTeamId)?.name}</h3><p>{selectedResult.resultText??(selectedResult.winnerTeamId?`${game.teams.find(t=>t.id===selectedResult.winnerTeamId)?.name} won`:'Completed match')}</p></div><button className="text-button" onClick={()=>setResultId('')}>Close</button></div><div className="fixture-result-score"><div><span>{game.teams.find(t=>t.id===selectedResult.homeTeamId)?.name}</span><b>{selectedResult.homeRuns??0}/{selectedResult.homeWickets??'—'}</b><small>{selectedResult.homeBalls!==undefined?`${Math.floor(selectedResult.homeBalls/6)}.${selectedResult.homeBalls%6} overs`:''}</small></div><strong>FINAL</strong><div><span>{game.teams.find(t=>t.id===selectedResult.awayTeamId)?.name}</span><b>{selectedResult.awayRuns??0}/{selectedResult.awayWickets??'—'}</b><small>{selectedResult.awayBalls!==undefined?`${Math.floor(selectedResult.awayBalls/6)}.${selectedResult.awayBalls%6} overs`:''}</small></div></div></Panel>}
  </div>;
}

function makeFixtures(teams:Team[]){
  const fixtures:GameState['fixtures']=[];
  if(teams.length<2)return fixtures;
  const rotation:(Team|null)[]=[...teams];
  if(rotation.length%2===1)rotation.push(null);
  const n=rotation.length;const legRounds=n-1;const perRound=n/2;
  const fixed=rotation[0];let ring=rotation.slice(1);
  for(let leg=0;leg<2;leg++){
    let current=[fixed,...ring];
    for(let round=0;round<legRounds;round++){
      for(let pair=0;pair<perRound;pair++){
        const left=current[pair],right=current[n-1-pair];
        if(!left||!right)continue;
        let home:Team,away:Team;
        if((round+pair)%2===0){home=left;away=right;}else{home=right;away=left;}
        if(leg===1){const oldHome=home;home=away;away=oldHome;}
        const matchRound=leg*legRounds+round+1;fixtures.push({id:`fx-${leg}-${round}-${pair}`,round:matchRound,homeTeamId:home.id,awayTeamId:away.id,status:'scheduled',venue:home.ground,stage:'league',label:`League · Matchday ${matchRound}`});
      }
      const last=current.pop()!;current=[current[0],last,...current.slice(1)];
    }
  }
  return fixtures.sort((a,b)=>a.round-b.round||a.id.localeCompare(b.id));
}
function ensureFixtureCalendar(game:GameState){
  const expected=game.teams.length*(game.teams.length-1);
  const expectedRounds=(game.teams.length%2===0?game.teams.length-1:game.teams.length)*2;
  const roundCount=new Set(game.fixtures.map(f=>f.round)).size;
  const untouched=game.fixtures.every(f=>f.status==='scheduled');
  if(!game.fixtures.length||(untouched&&game.fixtures.length===expected&&roundCount!==expectedRounds)){game.fixtures=makeFixtures(game.teams);}
}

function teamXI(game:GameState,t:Team){if(t.playingXI.length>=11)return t.playingXI.map(id=>game.players.find(p=>p.id===id)!).filter(Boolean);const ps=t.playerIds.map(id=>game.players.find(p=>p.id===id)!).filter(Boolean).sort((a,b)=>(b.overall+b.form*.18)-(a.overall+a.form*.18));return ps.slice(0,11)}
function pitchEffect(pitch:PitchType,player:Player,batting:boolean){if(pitch==='flat')return batting?1.06:0.96;if(pitch==='spin-friendly')return player.role==='Spin Bowler'&&!batting?1.18:batting?0.96:1;if(pitch==='seam-friendly')return player.role==='Pace Bowler'&&!batting?1.18:batting?0.94:1;return batting?0.94:1.06}
function eligibleBowlers(game:GameState,team:Team){
  // Keep every member of the confirmed XI visible. If specialist bowlers are exhausted,
  // the manager can use an emergency part-timer instead of being stranded at an over change.
  return getBowlingOptions(game,team);
}
function bowlerUnavailableReason(game:GameState,team:Team,inn:LiveInnings,p:Player):string{
  return engineBowlerUnavailableReason(game,team,inn,p,teamXI(game,team));
}
function bowlerRotationRisk(game:GameState,team:Team,inn:LiveInnings,p:Player):boolean{
  return wouldLeaveBowlingDeadEnd(game,team,inn,p.id,teamXI(game,team));
}
function chooseAIBowler(game:GameState,team:Team,inn:LiveInnings){
  const xi=teamXI(game,team);
  const recommended=recommendSafeBowler(game,team,inn,xi);
  if(recommended)return recommended.id;
  // Last-resort legal fallback: preserve the rules but never leave a UI waiting on an empty selector.
  return eligibleBowlers(game,team).find(p=>!bowlerUnavailableReason(game,team,inn,p))?.id??'';
}
function prepareMatch(game:GameState,f:GameState['fixtures'][number]){
  if(f.status==='completed')return;
  if(game.liveMatch&&game.liveMatch.status!=='completed'&&game.liveMatch.fixtureId!==f.id)return;
  const home=game.teams.find(t=>t.id===f.homeTeamId)!,away=game.teams.find(t=>t.id===f.awayTeamId)!;
  if(home.kind==='bot'){home.playingXI=teamXI(game,home).slice(0,11).map(p=>p.id);if(!home.captainId)home.captainId=home.playingXI.map(id=>game.players.find(p=>p.id===id)!).filter(Boolean).sort((a,b)=>b.attrs.leadership-a.attrs.leadership)[0]?.id;}
  if(away.kind==='bot'){away.playingXI=teamXI(game,away).slice(0,11).map(p=>p.id);if(!away.captainId)away.captainId=away.playingXI.map(id=>game.players.find(p=>p.id===id)!).filter(Boolean).sort((a,b)=>b.attrs.leadership-a.attrs.leadership)[0]?.id;}
  const balls=game.league.format==='T20'?120:game.league.format==='ODI'?300:120;
  game.liveMatch={fixtureId:f.id,homeTeamId:home.id,awayTeamId:away.id,timeOfDay:Math.random()<0.58?'night':'day',tossCallerId:home.id,tossCall:undefined,tossRevealed:false,status:'toss',innings:1,ballsPerInnings:balls,inningsData:[],speed:1,startedAt:new Date().toISOString(),playerRuns:{},playerBalls:{},playerWickets:{},reviewsRemaining:{[home.id]:2,[away.id]:2},lastCommentary:`${home.name} is the home side and will call the toss. The toss winner chooses to bat or bowl.`};
  f.status='live';f.liveMatchId=f.id;
}
function revealToss(game:GameState,call:'heads'|'tails'){
  const m=game.liveMatch;if(!m||m.status!=='toss'||m.tossRevealed)return;
  const home=game.teams.find(t=>t.id===m.homeTeamId)!;const away=game.teams.find(t=>t.id===m.awayTeamId)!;
  const result=Math.random()<.5?'heads':'tails';
  m.tossCall=call;m.tossResult=result;m.tossRevealed=true;m.tossWinnerId=result===call?home.id:away.id;
  m.lastCommentary=`${home.name} called ${call.toUpperCase()}. The coin lands ${result.toUpperCase()}. ${game.teams.find(t=>t.id===m.tossWinnerId)?.name} win the toss.`;
}
function autoTossDecision(game:GameState,team:Team):'bat'|'bowl'{
  const pitch=game.teams.find(t=>t.id===game.liveMatch?.homeTeamId)?.pitch??team.pitch;
  const xi=teamXI(game,team);const batting=xi.reduce((s,p)=>s+p.battingRating*.65+p.form*.2+p.morale*.15,0)/Math.max(1,xi.length);
  const bowling=xi.reduce((s,p)=>s+(p.bowlingRating*.7+p.sharpness*.2+p.form*.1),0)/Math.max(1,xi.length);
  const pitchBat=pitch==='flat'?5:pitch==='slow'?-3:pitch==='spin-friendly'?-1:0;
  return batting+pitchBat>=bowling-2?'bat':'bowl';
}
function initializeInnings(game:GameState,batting:Team,bowling:Team,target?:number){
  const batXI=teamXI(game,batting).filter(p=>!p.injury||p.injury.daysRemaining<=0);
  const bowlXI=eligibleBowlers(game,bowling).filter(p=>!p.injury||p.injury.daysRemaining<=0);
  const m=game.liveMatch!;
  const inn:LiveInnings={battingTeamId:batting.id,bowlingTeamId:bowling.id,runs:0,wickets:0,balls:0,target,strikerId:batXI[0]?.id??'',nonStrikerId:batXI[1]?.id??'',bowlerId:bowlXI[0]?.id??'',events:[],outPlayerIds:[],needsBowler:false,bowlingSelectionMode:bowling.kind==='bot'?'auto':'manual',freeHit:false,phase:'powerplay',partnershipCurrent:{batter1Id:batXI[0]?.id??'',batter2Id:batXI[1]?.id??'',runs:0,balls:0},partnerships:[]};
  m.inningsData.push(inn);m.innings=m.inningsData.length;
  if(bowling.kind==='human'){inn.needsBowler=true;inn.bowlerId='';m.status='awaiting-bowler';m.lastCommentary=`${batting.name} are ready. ${bowling.name}, select your opening bowler.`;}
  else{inn.bowlerId=chooseAIBowler(game,bowling,inn);m.status='live';m.lastCommentary=`${batting.name} will bat first. ${game.players.find(p=>p.id===inn.bowlerId)?.name??'The opening bowler'} takes the new ball.`;}
}
function startAfterToss(game:GameState,decision:'bat'|'bowl'){
  const m=game.liveMatch;if(!m||!m.tossWinnerId)return;
  const winner=game.teams.find(t=>t.id===m.tossWinnerId)!;
  const other=game.teams.find(t=>t.id===(winner.id===m.homeTeamId?m.awayTeamId:m.homeTeamId))!;
  const batting=decision==='bat'?winner:other;const bowling=batting.id===winner.id?other:winner;
  m.decision=decision;m.decisionTeamId=winner.id;m.inningsData=[];m.innings=1;
  initializeInnings(game,batting,bowling);
}
function partnershipPairMatches(a:{batter1Id:string;batter2Id:string},s:string,n:string){return (a.batter1Id===s&&a.batter2Id===n)||(a.batter1Id===n&&a.batter2Id===s);}
function ensurePartnership(inn:LiveInnings){
  if(!inn.strikerId||!inn.nonStrikerId)return;
  if(!inn.partnershipCurrent||!partnershipPairMatches(inn.partnershipCurrent,inn.strikerId,inn.nonStrikerId)){
    inn.partnershipCurrent={batter1Id:inn.strikerId,batter2Id:inn.nonStrikerId,runs:0,balls:0};
  }
}
function chooseMatchBowler(game:GameState,playerId:string,mode:'auto'|'manual'='manual') {
  const m=game.liveMatch;if(!m||m.status!=='awaiting-bowler')return;
  const inn=m.inningsData[m.innings-1];if(!inn)return;
  const team=game.teams.find(t=>t.id===inn.bowlingTeamId);if(!team)return;
  const candidate=eligibleBowlers(game,team).find(p=>p.id===playerId);if(!candidate)return;
  if(bowlerUnavailableReason(game,team,inn,candidate))return;
  const legal=eligibleBowlers(game,team).filter(p=>!bowlerUnavailableReason(game,team,inn,p));
  const safe=legal.filter(p=>!bowlerRotationRisk(game,team,inn,p));
  if(safe.length>0&&bowlerRotationRisk(game,team,inn,candidate))return;
  inn.bowlerId=playerId;inn.needsBowler=false;inn.bowlingSelectionMode=mode;
  m.status=inn.strikerId&&inn.nonStrikerId?'live':'awaiting-batter';
  m.lastCommentary=`${game.players.find(p=>p.id===playerId)?.name} will bowl the next over.${mode==='auto'?' Auto-pick will protect bowling rotation for the remaining overs.':''}`;
}
function chooseNextBatter(game:GameState,playerId:string):boolean{
  const m=game.liveMatch;
  if(!m||m.status!=='awaiting-batter'||!playerId)return false;
  const inn=m.inningsData[m.innings-1];
  if(!inn)return false;
  const team=game.teams.find(t=>t.id===inn.battingTeamId);
  if(!team)return false;

  // Only a player from the confirmed XI who has not already batted can enter.
  const candidate=teamXI(game,team).find(p=>p.id===playerId);
  if(!candidate||(inn.outPlayerIds??[]).includes(playerId))return false;
  if(playerId===inn.strikerId||playerId===inn.nonStrikerId)return false;

  // A wicket normally leaves one slot empty. Recover the correct slot from the
  // latest dismissal as well, so an older save with stale batter IDs cannot lock
  // the match on the "Who comes in next?" screen.
  let vacant:'striker'|'non-striker'|undefined;
  if(!inn.strikerId)vacant='striker';
  else if(!inn.nonStrikerId)vacant='non-striker';
  else {
    const lastWicket=[...(inn.events??[])].reverse().find(e=>e.wicket);
    const dismissedId=lastWicket?.dismissedPlayerId;
    if(dismissedId&&dismissedId===inn.strikerId){inn.strikerId='';vacant='striker';}
    else if(dismissedId&&dismissedId===inn.nonStrikerId){inn.nonStrikerId='';vacant='non-striker';}
  }
  if(!vacant)return false;

  if(vacant==='striker')inn.strikerId=playerId;
  else inn.nonStrikerId=playerId;

  ensurePartnership(inn);
  const bowling=game.teams.find(t=>t.id===inn.bowlingTeamId);
  if(inn.needsBowler&&bowling?.kind==='bot'){
    const aiBowler=chooseAIBowler(game,bowling,inn);
    if(aiBowler){inn.bowlerId=aiBowler;inn.needsBowler=false;}
  }

  m.status=inn.needsBowler?'awaiting-bowler':
    inn.strikerId&&inn.nonStrikerId&&inn.bowlerId?'live':'awaiting-batter';
  m.lastCommentary=`${candidate.name} walks in. ${m.status==='awaiting-bowler'?'The bowling manager must choose the next over.':m.status==='live'?'The next delivery is ready.':'Select the missing batter to continue.'}`;
  return m.status!=='awaiting-batter';
}
function chooseAIBatter(game:GameState,inn:LiveInnings){
  const team=game.teams.find(t=>t.id===inn.battingTeamId)!;
  const available=teamXI(game,team).filter(p=>!inn.outPlayerIds?.includes(p.id)&&p.id!==inn.strikerId&&p.id!==inn.nonStrikerId&&(!p.injury||p.injury.daysRemaining<=0));
  available.sort((a,b)=>{
    const dutyA=team.tacticalRoles?.[a.id]??'';const dutyB=team.tacticalRoles?.[b.id]??'';
    const score=(p:Player,duty:string)=>p.battingRating*.50+p.form*.18+p.morale*.09+p.attrs.temperament*.12+p.attrs.technique*.06+(duty==='Finisher'&&inn.balls>(game.liveMatch?.ballsPerInnings ?? 120)*.65?7:0)+(duty==='Anchor'&&inn.wickets>=3?5:0)-p.fatigue*.04-(p.injury&&p.injury.daysRemaining>0?12:0);
    return score(b,dutyB)-score(a,dutyA);
  });
  const next=available[0];if(!next)return;
  if(!inn.strikerId)inn.strikerId=next.id;else if(!inn.nonStrikerId)inn.nonStrikerId=next.id;
  ensurePartnership(inn);
}
function switchEnds(inn:LiveInnings){const s=inn.strikerId;inn.strikerId=inn.nonStrikerId;inn.nonStrikerId=s;}
function afterDeliveryState(game:GameState,inn:LiveInnings){
  const m=game.liveMatch!;
  const bowling=game.teams.find(t=>t.id===inn.bowlingTeamId)!;
  const batting=game.teams.find(t=>t.id===inn.battingTeamId)!;
  if(inn.wickets>=10||inn.balls>=m.ballsPerInnings||(inn.target!==undefined&&inn.runs>=inn.target)){
    inn.phase='complete';
    if(m.innings===1){m.status='innings-break';m.lastCommentary=matchCommentary('inningsBreak',batting.name,bowling.name,{seq:inn.runs+inn.wickets});}
    else completeLiveMatch(game);
    return;
  }
  // Batter and bowler decisions are sequenced, but never leave a bot manager waiting for a human.
  if(!inn.strikerId||!inn.nonStrikerId){
    if(batting.kind==='human'){m.status='awaiting-batter';return;}
    chooseAIBatter(game,inn);
    if(!inn.strikerId||!inn.nonStrikerId){m.status='innings-break';return;}
  }
  if(inn.needsBowler){
    if(bowling.kind==='human'&&inn.bowlingSelectionMode!=='auto'){m.status='awaiting-bowler';return;}
    const picked=chooseAIBowler(game,bowling,inn);
    if(!picked){m.status='paused';m.lastCommentary='Bowling safety stop: no legal bowler can cover the next over. Review the Playing XI and over allocation.';return;}
    inn.bowlerId=picked;inn.needsBowler=false;
  }
  ensurePartnership(inn);
  m.status='live';
}
function commitDelivery(game:GameState,event:BallEvent){
  const m=game.liveMatch;if(!m)return;const inn=m.inningsData[m.innings-1];if(!inn)return;
  const strikerAtDelivery=event.strikerId;
  const batRuns=event.batRuns??(['0','1','2','3','4','6'].includes(event.outcome)?Number(event.outcome):0);
  const extraRuns=event.extras??Math.max(0,event.runs-batRuns);
  const previousBatterRuns=m.playerRuns[strikerAtDelivery]||0;
  if(inn.strikerId&&inn.nonStrikerId)ensurePartnership(inn);
  const stand=inn.partnershipCurrent;
  inn.runs+=event.runs;
  if(batRuns>0)m.playerRuns[strikerAtDelivery]=(m.playerRuns[strikerAtDelivery]||0)+batRuns;
  const legal=event.legal!==false&&event.outcome!=='WD'&&event.outcome!=='NB';
  event.legal=legal;event.batRuns=batRuns;event.extras=extraRuns;
  if(stand){stand.runs+=event.runs;if(legal)stand.balls++;}
  if(legal){inn.balls++;m.playerBalls[strikerAtDelivery]=(m.playerBalls[strikerAtDelivery]||0)+1;}
  if(event.outcome==='NB')inn.freeHit=true;else if(legal&&inn.freeHit)inn.freeHit=false;
  if(event.wicket){
    inn.wickets++;
    const outId=event.dismissedPlayerId||strikerAtDelivery;
    inn.outPlayerIds=[...(inn.outPlayerIds??[]),outId];
    if(event.dismissalType!=='run out')m.playerWickets[event.bowlerId]=(m.playerWickets[event.bowlerId]||0)+1;
    if(inn.strikerId===outId)inn.strikerId='';else if(inn.nonStrikerId===outId)inn.nonStrikerId='';
    if(stand){inn.partnerships=[...(inn.partnerships??[]),{...stand,wicket:inn.wickets,endedBy:outId}];}
    inn.partnershipCurrent=undefined;
  }else if((event.completedRuns??batRuns)%2===1){switchEnds(inn);}
  inn.events.push(event);m.lastCommentary=event.commentary;
  const relevant=inn.events.filter(e=>e.legal!==false&&e.outcome!=='WD'&&e.outcome!=='NB');
  if(event.wicket&&event.dismissalType!=='run out'){
    const sameBowler=relevant.filter(e=>e.bowlerId===event.bowlerId).slice(-3);
    if(sameBowler.length===3&&sameBowler.every(e=>e.wicket&&e.dismissalType!=='run out')){event.commentary+=` ${matchCommentary('hatTrick',game.players.find(p=>p.id===event.dismissedPlayerId)?.name??'The batter',game.players.find(p=>p.id===event.bowlerId)?.name??'The bowler')}`;m.lastCommentary=event.commentary;}
    const recentWickets=inn.events.slice(-18).filter(e=>e.wicket).length;
    if(recentWickets>=3){event.commentary+=` ${matchCommentary('collapse',game.players.find(p=>p.id===event.dismissedPlayerId)?.name??'The batter',game.players.find(p=>p.id===event.bowlerId)?.name??'The bowler',{seq:inn.wickets})}`;m.lastCommentary=event.commentary;}
  }
  if(event.outcome==='6'){
    const lastSix=inn.events.filter(e=>e.over===event.over&&e.legal!==false);
    if(lastSix.length>=6&&lastSix.slice(-6).every(e=>e.outcome==='6'&&e.strikerId===event.strikerId&&e.bowlerId===event.bowlerId)){event.commentary+=` ${matchCommentary('boundaryStreak',game.players.find(p=>p.id===event.strikerId)?.name??'The batter',game.players.find(p=>p.id===event.bowlerId)?.name??'The bowler')} Six sixes in one over is a record-level rarity.`;m.lastCommentary=event.commentary;}
  }
  // Milestones are driven by actual score changes and the current partnership, never a scripted trigger.
  if(!event.wicket&&stand){
    for(const threshold of [50,100,150,200]){
      if(stand.runs>=threshold&&stand.runs-event.runs<threshold){
        const a=game.players.find(p=>p.id===stand.batter1Id)?.name??'The batter';
        const b=game.players.find(p=>p.id===stand.batter2Id)?.name??'the partner';
        event.commentary+=` PARTNERSHIP ${threshold}! ${a} and ${b} have put on ${stand.runs} together from ${stand.balls} balls.`;
        if(threshold===200)event.commentary+=' A 200-run stand is exceptionally rare in T20 cricket.';
        m.lastCommentary=event.commentary;
      }
    }
  }
  if(batRuns>0){
    const currentRuns=m.playerRuns[strikerAtDelivery]||0;
    if((previousBatterRuns<50&&currentRuns>=50)||(previousBatterRuns<100&&currentRuns>=100)){
      const milestone=currentRuns>=100&&previousBatterRuns<100?'century':'fifty';
      event.commentary+=` ${matchCommentary(milestone,game.players.find(p=>p.id===strikerAtDelivery)?.name??'The batter',game.players.find(p=>p.id===event.bowlerId)?.name??'The bowler',{seq:currentRuns})}`;
      m.lastCommentary=event.commentary;
    }
  }
  if(legal&&inn.balls>0&&inn.balls%6===0){
    const overEvents=inn.events.filter(e=>e.over===event.over);
    const overRuns=overEvents.reduce((sum,e)=>sum+e.runs,0);
    const legalCount=overEvents.filter(e=>e.legal!==false&&e.outcome!=='WD'&&e.outcome!=='NB').length;
    const overWickets=overEvents.filter(e=>e.wicket).length;
    if(legalCount===6&&overRuns===0){event.commentary+=` ${matchCommentary('maiden',game.players.find(p=>p.id===event.strikerId)?.name??'The batter',game.players.find(p=>p.id===event.bowlerId)?.name??'The bowler')}`;m.lastCommentary=event.commentary;}
    else{event.commentary+=` Over complete: ${overRuns} run${overRuns===1?'':'s'}${overWickets?`, ${overWickets} wicket${overWickets===1?'':'s'}`:''}. ${matchCommentary('overSummary',game.players.find(p=>p.id===event.strikerId)?.name??'The batter',game.players.find(p=>p.id===event.bowlerId)?.name??'The bowler',{seq:inn.balls})}`;m.lastCommentary=event.commentary;}
    switchEnds(inn);inn.needsBowler=true;
  }
  afterDeliveryState(game,inn);
}
function finishWicketDecision(game:GameState,doReview:boolean){
  const m=game.liveMatch;if(!m||!m.pendingDelivery||!m.review)return;
  if(!doReview){const event=m.pendingDelivery;event.commentary=`${event.commentary} The batting captain accepts the on-field decision.`;m.pendingDelivery=undefined;m.review=undefined;m.status='live';commitDelivery(game,event);return;}
  const teamId=m.review.reviewingTeamId;if(!teamId)return;const left=m.reviewsRemaining?.[teamId]??0;if(left<=0){finishWicketDecision(game,false);return;}
  m.review.stage='checking';m.review.commentary=matchCommentary('review',game.players.find(p=>p.id===m.pendingDelivery!.strikerId)?.name??'The batter',game.players.find(p=>p.id===m.pendingDelivery!.bowlerId)?.name??'The bowler',{seq:m.pendingDelivery.runs});m.lastCommentary=m.review.commentary;m.status='review';
}
function resolvePendingReview(game:GameState){
  const m=game.liveMatch;if(!m||!m.review||!m.pendingDelivery)return;const review=m.review;let event=m.pendingDelivery;
  if(review.willOverturn){
    if(review.appealType==='Run out'){
      const completed=Math.max(0,event.completedRuns??event.runs);
      const outcome:BallEvent['outcome']=completed===1?'1':completed===2?'2':completed===3?'3':'0';
      event={...event,outcome,runs:completed,batRuns:completed,extras:0,extraType:undefined,completedRuns:completed,wicket:false,dismissalType:undefined,dismissedPlayerId:undefined,fielderId:undefined,reviewed:true,reviewResult:'overturned',commentary:matchCommentary('reviewOverturned',game.players.find(p=>p.id===event.strikerId)?.name??'The batter',game.players.find(p=>p.id===event.bowlerId)?.name??'The bowler')};
    }
    else event={...event,outcome:'0',runs:0,batRuns:0,extras:0,completedRuns:0,wicket:false,dismissalType:undefined,dismissedPlayerId:undefined,fielderId:undefined,reviewed:true,reviewResult:'overturned',commentary:matchCommentary('reviewOverturned',game.players.find(p=>p.id===event.strikerId)?.name??'The batter',game.players.find(p=>p.id===event.bowlerId)?.name??'The bowler')};
  }else{
    event={...event,reviewed:true,reviewResult:'upheld',commentary:`${event.commentary} ${matchCommentary('reviewUpheld',game.players.find(p=>p.id===event.strikerId)?.name??'The batter',game.players.find(p=>p.id===event.bowlerId)?.name??'The bowler')}`};
    if(review.mode==='captain-review'&&review.reviewingTeamId){m.reviewsRemaining=m.reviewsRemaining??{};m.reviewsRemaining[review.reviewingTeamId]=Math.max(0,(m.reviewsRemaining[review.reviewingTeamId]??0)-1);}
  }
  m.pendingDelivery=undefined;m.review=undefined;m.status='live';m.lastCommentary=event.commentary;commitDelivery(game,event);
}
function advanceMatchBall(game:GameState){
  const m=game.liveMatch;if(!m)return;
  if(m.review||m.pendingDelivery){if(m.status==='live'||m.status==='paused')m.status='review';return;}
  if(m.status!=='live')return;
  const f=game.fixtures.find(x=>x.id===m.fixtureId);if(!f)return;
  const inn=m.inningsData[m.innings-1];if(!inn||!inn.strikerId||!inn.nonStrikerId||!inn.bowlerId)return;
  const event=simulateDelivery(game,inn);
  if(event.wicket){
    const battingTeam=game.teams.find(t=>t.id===inn.battingTeamId)!;
    const reviewable=['lbw','caught','caught-behind','stumped'].includes(event.dismissalType||'');
    const thirdUmpire=event.dismissalType==='run out';
    if(reviewable||thirdUmpire){
      const overTurnChance=event.dismissalType==='lbw'?0.23:event.dismissalType==='caught'||event.dismissalType==='caught-behind'?0.12:event.dismissalType==='stumped'?0.10:0.08;
      m.pendingDelivery=event;
      m.review={mode:thirdUmpire?'third-umpire':'captain-review',stage:thirdUmpire?'checking':'decision',appealType:event.dismissalType==='lbw'?'LBW':event.dismissalType==='stumped'?'Stumping':thirdUmpire?'Run out':'Caught',reviewingTeamId:thirdUmpire?undefined:battingTeam.id,umpireDecision:'out',willOverturn:Math.random()<overTurnChance,startedAt:thirdUmpire?new Date().toISOString():undefined,commentary:event.commentary};
      m.status='review';m.lastCommentary=event.commentary;return;
    }
  }
  commitDelivery(game,event);
  if(!event.wicket&&event.batRuns){
    const latest=inn.events[inn.events.length-1];
    if(latest) m.lastCommentary=latest.commentary;
  }
  if(event.wicket&&inn.wickets<10&&inn.balls%6!==0&&game.teams.find(t=>t.id===inn.battingTeamId)?.kind==='bot')chooseAIBatter(game,inn);
}
function startSecondInnings(game:GameState){const m=game.liveMatch;if(!m||m.status!=='innings-break'||!m.inningsData[0])return;const first=m.inningsData[0];const batting=game.teams.find(t=>t.id===first.bowlingTeamId)!;const bowling=game.teams.find(t=>t.id===first.battingTeamId)!;initializeInnings(game,batting,bowling,first.runs+1);m.lastCommentary=`${batting.name} need ${first.runs+1} to win.`;}
function emptySeasonStats():SeasonPlayerStats{return{matches:0,innings:0,notOuts:0,runs:0,balls:0,fours:0,sixes:0,fifties:0,hundreds:0,ducks:0,highest:0,wickets:0,ballsBowled:0,runsConceded:0,dotBalls:0,maidens:0,catches:0,stumpings:0,runOuts:0,threeWicketHauls:0,fiveWicketHauls:0,bestWickets:0,bestBowlingRuns:0}}
function getSeasonStats(game:GameState):Record<string,SeasonPlayerStats>{if(!game.records.seasonStats)game.records.seasonStats={};for(const p of game.players)if(!game.records.seasonStats[p.id])game.records.seasonStats[p.id]=emptySeasonStats();return game.records.seasonStats;}
function recordMatchPlayerStats(game:GameState,m:NonNullable<GameState['liveMatch']>){
  const all=getSeasonStats(game);for(const p of game.players)if(!all[p.id])all[p.id]=emptySeasonStats();
  type BatLine={runs:number;balls:number;fours:number;sixes:number;out:boolean;innings:number};
  type BowlLine={balls:number;runs:number;wickets:number;dots:number;maidens:number;wides:number;noBalls:number};
  type FieldLine={catches:number;stumpings:number;runOuts:number};
  const batLines:Record<string,BatLine>={},bowlLines:Record<string,BowlLine>={},fieldLines:Record<string,FieldLine>={};
  const involved=new Set<string>();
  const getBat=(id:string)=>batLines[id]??(batLines[id]={runs:0,balls:0,fours:0,sixes:0,out:false,innings:0});
  const getBowl=(id:string)=>bowlLines[id]??(bowlLines[id]={balls:0,runs:0,wickets:0,dots:0,maidens:0,wides:0,noBalls:0});
  const getField=(id:string)=>fieldLines[id]??(fieldLines[id]={catches:0,stumpings:0,runOuts:0});
  const perMatchBat:Record<string,{runs:number;balls:number;fours:number;sixes:number;out:boolean}>={};
  const perMatchBowl:Record<string,{balls:number;runs:number;wickets:number;dots:number;maidens:number;wides:number;noBalls:number}>={};
  const perMatchField:Record<string,{catches:number;stumpings:number;runOuts:number}>={};
  const overLedger:Record<string,{bowlerId:string;runs:number;legal:number}>={};
  for(const teamId of [m.homeTeamId,m.awayTeamId]){const team=game.teams.find(t=>t.id===teamId);for(const id of (team?.playingXI??[]).slice(0,11))involved.add(id);}
  for(const inn of m.inningsData){
    // Record every batter who actually occupied a partnership, including a not-out batter who faced zero balls.
    const battingParticipants=new Set<string>();
    for(const stand of inn.partnerships??[]){battingParticipants.add(stand.batter1Id);battingParticipants.add(stand.batter2Id);}
    if(inn.partnershipCurrent){battingParticipants.add(inn.partnershipCurrent.batter1Id);battingParticipants.add(inn.partnershipCurrent.batter2Id);}
    for(const e of inn.events){battingParticipants.add(e.strikerId);if(e.dismissedPlayerId)battingParticipants.add(e.dismissedPlayerId);}
    for(const id of inn.outPlayerIds??[])battingParticipants.add(id);
    for(const id of battingParticipants){
      involved.add(id);getBat(id);
      perMatchBat[id]??={runs:0,balls:0,fours:0,sixes:0,out:(inn.outPlayerIds??[]).includes(id)};
    }
    for(const e of inn.events){
      involved.add(e.strikerId);involved.add(e.bowlerId);
      const bat=getBat(e.strikerId);bat.runs+=e.batRuns??(['0','1','2','3','4','6'].includes(e.outcome)?Number(e.outcome):0);if(e.legal!==false&&e.outcome!=='WD'&&e.outcome!=='NB')bat.balls++;if((e.batRuns??Number(e.outcome))===4||e.outcome==='4')bat.fours++;if((e.batRuns??Number(e.outcome))===6||e.outcome==='6')bat.sixes++;
      const pm=perMatchBat[e.strikerId]??(perMatchBat[e.strikerId]={runs:0,balls:0,fours:0,sixes:0,out:false});pm.runs+=e.batRuns??(['0','1','2','3','4','6'].includes(e.outcome)?Number(e.outcome):0);if(e.legal!==false&&e.outcome!=='WD'&&e.outcome!=='NB')pm.balls++;if((e.batRuns??Number(e.outcome))===4||e.outcome==='4')pm.fours++;if((e.batRuns??Number(e.outcome))===6||e.outcome==='6')pm.sixes++;
      const bow=getBowl(e.bowlerId);const legal=e.legal!==false&&e.outcome!=='WD'&&e.outcome!=='NB';if(legal)bow.balls++;const chargeable=e.extraType==='bye'||e.extraType==='leg-bye'?0:e.runs;bow.runs+=chargeable;if(e.outcome==='WD')bow.wides+=e.runs;if(e.outcome==='NB')bow.noBalls+=e.runs;if(e.wicket&&e.dismissalType!=='run out')bow.wickets++;
      const pb=perMatchBowl[e.bowlerId]??(perMatchBowl[e.bowlerId]={balls:0,runs:0,wickets:0,dots:0,maidens:0,wides:0,noBalls:0});if(legal)pb.balls++;pb.runs+=chargeable;if(legal&&e.runs===0){bow.dots++;pb.dots++;}if(e.outcome==='WD'){pb.wides+=e.runs;}if(e.outcome==='NB'){pb.noBalls+=e.runs;}if(e.wicket&&e.dismissalType!=='run out')pb.wickets++;
      const overKey=`${inn.battingTeamId}-${e.over}-${e.bowlerId}`;const over=overLedger[overKey]??(overLedger[overKey]={bowlerId:e.bowlerId,runs:0,legal:0});over.runs+=chargeable;if(legal)over.legal++;
      if(e.wicket){const outId=e.dismissedPlayerId??e.strikerId;getBat(outId).out=true;const dismissedLine=perMatchBat[outId]??(perMatchBat[outId]={runs:0,balls:0,fours:0,sixes:0,out:true});dismissedLine.out=true;}
      if(e.fielderId){involved.add(e.fielderId);const field=getField(e.fielderId);const pmf=perMatchField[e.fielderId]??(perMatchField[e.fielderId]={catches:0,stumpings:0,runOuts:0});if(e.dismissalType==='caught'||e.dismissalType==='caught-behind'){field.catches++;pmf.catches++;}else if(e.dismissalType==='stumped'){field.stumpings++;pmf.stumpings++;}else if(e.dismissalType==='run out'){field.runOuts++;pmf.runOuts++;}}
    }
  }
  for(const over of Object.values(overLedger)){if(over.legal>=6&&over.runs===0){getBowl(over.bowlerId).maidens++;const pb=perMatchBowl[over.bowlerId];if(pb)pb.maidens++;}}
  for(const id of involved){const st=all[id]??(all[id]=emptySeasonStats());st.matches++;}
  for(const [id,b] of Object.entries(batLines)){const st=all[id];st.innings++;st.runs+=b.runs;st.balls+=b.balls;st.fours+=b.fours;st.sixes+=b.sixes;st.highest=Math.max(st.highest,b.runs);if(b.runs>=100)st.hundreds++;else if(b.runs>=50)st.fifties++;if(b.runs===0&&b.out)st.ducks++;if(!b.out)st.notOuts++;}
  for(const [id,b] of Object.entries(bowlLines)){const st=all[id];st.ballsBowled+=b.balls;st.runsConceded+=b.runs;st.wickets+=b.wickets;st.dotBalls+=b.dots;st.maidens+=b.maidens;if(b.wickets>=3)st.threeWicketHauls++;if(b.wickets>=5)st.fiveWicketHauls++;if(b.wickets>st.bestWickets||(b.wickets===st.bestWickets&&b.runs<st.bestBowlingRuns)){st.bestWickets=b.wickets;st.bestBowlingRuns=b.runs;}}
  for(const [id,b] of Object.entries(fieldLines)){all[id].catches+=b.catches;all[id].stumpings+=b.stumpings;all[id].runOuts+=b.runOuts;}
  const home=game.teams.find(t=>t.id===m.homeTeamId)!,away=game.teams.find(t=>t.id===m.awayTeamId)!;
  for(const id of involved){
    const p=game.players.find(x=>x.id===id);if(!p)continue;const bat=perMatchBat[id]??{runs:0,balls:0,fours:0,sixes:0,out:false};const bowl=perMatchBowl[id]??{balls:0,runs:0,wickets:0};const field=perMatchField[id]??{catches:0,stumpings:0,runOuts:0};const team=home.playingXI.includes(id)?home:away;const opp=team.id===home.id?away:home;const result=m.winnerTeamId?(m.winnerTeamId===team.id?'win':'loss'):('tie' as const);
    p.career.matches++;if(id in perMatchBat){p.career.innings++;p.career.runs+=bat.runs;p.career.balls+=bat.balls;p.career.fours+=bat.fours;p.career.sixes+=bat.sixes;p.career.highest=Math.max(p.career.highest,bat.runs);if(bat.runs>=100)p.career.hundreds++;else if(bat.runs>=50)p.career.fifties++;if(bat.runs===0&&bat.out)p.career.ducks++;if(bat.out)p.career.dismissals++;else p.career.notOuts++;}
    p.career.avg=p.career.dismissals?p.career.runs/p.career.dismissals:p.career.runs;p.career.sr=p.career.balls?p.career.runs*100/p.career.balls:0;
    p.career.wickets+=bowl.wickets;p.career.ballsBowled+=bowl.balls;p.career.runsConceded+=bowl.runs;p.career.economy=p.career.ballsBowled?p.career.runsConceded*6/p.career.ballsBowled:0;p.career.dotBalls+=bowl.dots;p.career.maidens+=bowl.maidens;p.career.catches+=field.catches;p.career.stumpings+=field.stumpings;p.career.runOuts+=field.runOuts;p.career.wides+=bowl.wides;p.career.noBalls+=bowl.noBalls;
    if(bowl.wickets>0){const figures=`${bowl.wickets}/${bowl.runs}`;const prev=p.career.bestFigures.split('/').map(Number);if(p.career.bestFigures==='—'||bowl.wickets>(prev[0]||0)||(bowl.wickets===(prev[0]||0)&&bowl.runs<(prev[1]||999)))p.career.bestFigures=figures;if(bowl.wickets>=3)p.career.threeWickets++;if(bowl.wickets>=4)p.career.fourWickets++;if(bowl.wickets>=5)p.career.fiveWickets++;}
    const batStrikeRate=bat.balls?bat.runs*100/bat.balls:0;
    const batImpact=bat.balls?Math.round(bat.runs/18)+clamp(Math.round((batStrikeRate-115)/35),-3,4)-(bat.runs===0&&bat.balls>=6?2:0):0;
    const bowlEconomy=bowl.balls?bowl.runs*6/bowl.balls:0;
    const bowlingImpact=bowl.balls?bowl.wickets*4+clamp(Math.round((8.5-bowlEconomy)*.6),-3,4):0;
    const performance=clamp(batImpact+bowlingImpact+field.catches*2+field.runOuts*2+field.stumpings*2+(result==='win'?2:-1),-6,10);
    p.form=clamp(Math.round(p.form*.78+(58+performance*2.6)*.22),35,99);p.formHistory=[...(p.formHistory??[p.form]),p.form].slice(-5);p.fatigue=clamp(p.fatigue+7,0,100);p.sharpness=clamp(p.sharpness+2,0,100);p.morale=clamp(p.morale+(result==='win'?3:-2),0,100);
    p.history=[...(p.history??[]),{season:game.league.year,team:team.name,runs:bat.runs,wickets:bowl.wickets}];p.matchHistory=[...(p.matchHistory??[]),{fixtureId:m.fixtureId,season:game.league.year,date:new Date().toISOString(),teamId:team.id,opponentId:opp.id,format:game.league.format,batting:{runs:bat.runs,balls:bat.balls,fours:bat.fours,sixes:bat.sixes,out:bat.out},bowling:{balls:bowl.balls,runsConceded:bowl.runs,wickets:bowl.wickets},fielding:field,result}];
  }
  game.records.seasonRuns=Object.fromEntries(Object.entries(all).map(([id,st])=>[id,st.runs]));game.records.seasonWickets=Object.fromEntries(Object.entries(all).map(([id,st])=>[id,st.wickets]));game.records.orangeCap=Object.entries(all).sort((a,b)=>b[1].runs-a[1].runs)[0]?.[0];game.records.purpleCap=Object.entries(all).sort((a,b)=>b[1].wickets-a[1].wickets)[0]?.[0];
}
function recalculateStandings(game:GameState){
  const summaries:Record<string,{played:number;won:number;lost:number;nr:number;points:number;runsFor:number;runsAgainst:number;ballsFaced:number;ballsBowled:number;results:{round:number;outcome:'W'|'L'|'N'}[]}>={};
  for(const t of game.teams)summaries[t.id]={played:0,won:0,lost:0,nr:0,points:0,runsFor:0,runsAgainst:0,ballsFaced:0,ballsBowled:0,results:[]};
  for(const f of game.fixtures.filter(x=>x.status==='completed'&&(!x.stage||x.stage==='league'))){
    const h=summaries[f.homeTeamId],a=summaries[f.awayTeamId];if(!h||!a)continue;
    h.played++;a.played++;h.runsFor+=f.homeRuns??0;h.runsAgainst+=f.awayRuns??0;a.runsFor+=f.awayRuns??0;a.runsAgainst+=f.homeRuns??0;
    const fullBalls=Math.max(1,(game.league.overs||20)*6);
    const hb=f.homeWickets===10?fullBalls:(f.homeBalls??fullBalls);const ab=f.awayWickets===10?fullBalls:(f.awayBalls??fullBalls);
    h.ballsFaced+=Math.max(1,hb);h.ballsBowled+=Math.max(1,ab);a.ballsFaced+=Math.max(1,ab);a.ballsBowled+=Math.max(1,hb);
    if(f.homeRuns===f.awayRuns){h.nr++;a.nr++;h.points++;a.points++;h.results.push({round:f.round,outcome:'N'});a.results.push({round:f.round,outcome:'N'});}
    else if(f.winnerTeamId===f.homeTeamId){h.won++;h.points+=2;a.lost++;h.results.push({round:f.round,outcome:'W'});a.results.push({round:f.round,outcome:'L'});}
    else{a.won++;a.points+=2;h.lost++;a.results.push({round:f.round,outcome:'W'});h.results.push({round:f.round,outcome:'L'});}
  }
  for(const t of game.teams){const r=summaries[t.id];t.record.played=r.played;t.record.won=r.won;t.record.lost=r.lost;t.record.nr=r.nr;t.record.points=r.points;t.record.runsFor=r.runsFor;t.record.runsAgainst=r.runsAgainst;const forRate=r.ballsFaced?r.runsFor*6/r.ballsFaced:0;const againstRate=r.ballsBowled?r.runsAgainst*6/r.ballsBowled:0;t.record.netRunRate=+(forRate-againstRate).toFixed(3);t.record.lastFive=r.results.sort((a,b)=>a.round-b.round).slice(-5).map(x=>x.outcome);}
  game.standings=game.teams.map(t=>({...t.record,teamId:t.id})).sort((a,b)=>b.points-a.points||b.netRunRate-a.netRunRate||b.won-a.won);
}
function completeLiveMatch(game:GameState){
  const m=game.liveMatch;if(!m)return;const f=game.fixtures.find(x=>x.id===m.fixtureId);if(!f)return;
  const first=m.inningsData[0],second=m.inningsData[1];if(!first||!second)return;
  const home=game.teams.find(t=>t.id===m.homeTeamId)!;const away=game.teams.find(t=>t.id===m.awayTeamId)!;
  const homeInn=first.battingTeamId===home.id?first:second;const awayInn=first.battingTeamId===away.id?first:second;
  const homeRuns=homeInn.runs,awayRuns=awayInn.runs;const scoresTied=homeRuns===awayRuns;let winner=scoresTied?undefined:(homeRuns>awayRuns?home:away);let tieBreakText='';
  if(scoresTied&&f.stage&&f.stage!=='league'){
    const decider=simulateSuperOver(game,home,away);winner=decider.winner;tieBreakText=` in the Super Over decider ${decider.homeScore}-${decider.awayScore}`;
  }
  const tied=scoresTied&&!winner;const secondInnings=m.inningsData[1];const chased=!!winner&&winner.id===secondInnings.battingTeamId;const wicketsLeft=chased?Math.max(0,10-secondInnings.wickets):0;const runMargin=chased?0:Math.abs(homeRuns-awayRuns);
  f.status='completed';f.homeRuns=homeRuns;f.awayRuns=awayRuns;f.homeWickets=homeInn.wickets;f.awayWickets=awayInn.wickets;f.homeBalls=homeInn.balls;f.awayBalls=awayInn.balls;f.winnerTeamId=winner?.id;f.resultText=tied?'Match tied':`${winner!.name} won${tieBreakText||` ${chased?`${wicketsLeft} wickets`:`${runMargin} runs`}`}`;
  m.winnerTeamId=winner?.id;m.status='completed';m.completedAt=new Date().toISOString();m.lastCommentary=`${tied?'Match tied. Points shared.':`Match complete. ${f.resultText}.`} ${matchCommentary('result',winner?.name??'Both teams',away.name,{seq:homeRuns+awayRuns})}`;
  if(!f.statsRecorded){recordMatchPlayerStats(game,m);f.statsRecorded=true;}
  recalculateStandings(game);game.phase='season';advanceTournamentStages(game);void saveGame(game).catch(()=>undefined);
}

function formatOvers(balls:number){return `${Math.floor(balls/6)}.${balls%6}`;}
function playerBowlingFigures(inn:LiveInnings,playerId:string){const events=inn.events.filter(e=>e.bowlerId===playerId);const legalEvents=events.filter(e=>e.legal!==false&&e.outcome!=='WD'&&e.outcome!=='NB');const legal=legalEvents.length;const conceded=events.reduce((s,e)=>s+((e.extraType==='bye'||e.extraType==='leg-bye')?0:e.runs),0);const wickets=events.filter(e=>e.wicket&&e.dismissalType!=='run out').length;const overLedger=new Map<number,{legal:number;runs:number}>();for(const e of events){const row=overLedger.get(e.over)??{legal:0,runs:0};if(e.legal!==false&&e.outcome!=='WD'&&e.outcome!=='NB')row.legal++;row.runs+=((e.extraType==='bye'||e.extraType==='leg-bye')?0:e.runs);overLedger.set(e.over,row);}const maidens=[...overLedger.values()].filter(o=>o.legal>=6&&o.runs===0).length;return{legal,maidens,conceded,wickets,economy:legal?conceded*6/legal:0};}
function inningsScorecard(game:GameState,inn:LiveInnings){
  const ids=new Set<string>();
  for(const e of inn.events){ids.add(e.strikerId);if(e.dismissedPlayerId)ids.add(e.dismissedPlayerId);}
  for(const id of inn.outPlayerIds??[])ids.add(id);
  for(const stand of inn.partnerships??[]){ids.add(stand.batter1Id);ids.add(stand.batter2Id);}
  if(inn.partnershipCurrent){ids.add(inn.partnershipCurrent.batter1Id);ids.add(inn.partnershipCurrent.batter2Id);}
  if(inn.strikerId)ids.add(inn.strikerId);if(inn.nonStrikerId)ids.add(inn.nonStrikerId);
  const batting=[...ids].filter(Boolean).map(id=>{
    const ev=inn.events.filter(e=>e.strikerId===id);
    const dismissal=inn.events.find(e=>e.wicket&&(e.dismissedPlayerId??e.strikerId)===id);
    return {id,name:game.players.find(p=>p.id===id)?.name??'Unknown',runs:ev.reduce((s,e)=>s+(e.batRuns??(['0','1','2','3','4','6'].includes(e.outcome)?Number(e.outcome):0)),0),balls:ev.filter(e=>e.legal!==false&&e.outcome!=='WD'&&e.outcome!=='NB').length,fours:ev.filter(e=>(e.batRuns??Number(e.outcome))===4||e.outcome==='4').length,sixes:ev.filter(e=>(e.batRuns??Number(e.outcome))===6||e.outcome==='6').length,out:!!dismissal,dismissal};
  });
  const bowlers=[...new Set(inn.events.map(e=>e.bowlerId))].map(id=>({id,name:game.players.find(p=>p.id===id)?.name??'Unknown',...playerBowlingFigures(inn,id)}));
  const extras=inn.events.reduce((s,e)=>s+(e.extras??0),0);
  return{batting,bowlers,extras};
}
function MatchCentre({game,setScreen}:{game:GameState;setScreen:(s:any)=>void}){
  const m=game.liveMatch;
  const [speed,setSpeed]=useState(m?.speed||1);
  const [tossCall,setTossCall]=useState<'heads'|'tails'>('heads');
  const [selectedBatter,setSelectedBatter]=useState('');
  const [selectedBowler,setSelectedBowler]=useState('');
  const [reviewCountdown,setReviewCountdown]=useState(3);
  // Shared floating decision window: drag from its title bar and resize from its corner.
  const [decisionWindowStyle,setDecisionWindowStyle]=useState<React.CSSProperties>({
    position:'fixed',zIndex:2000,left:'50%',top:'50%',transform:'translate(-50%,-50%)',
    width:'min(900px, calc(100vw - 32px))',height:'min(78vh, 760px)',
    minWidth:'min(340px, calc(100vw - 24px))',minHeight:'280px',
    maxWidth:'calc(100vw - 24px)',maxHeight:'calc(100vh - 24px)',
    overflow:'auto',resize:'both',boxSizing:'border-box'
  });
  const decisionDrag=useRef<{pointerId:number;startX:number;startY:number;left:number;top:number}|null>(null);
  const startDecisionDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
    if((event.target as HTMLElement).closest('button'))return;
    const panel=event.currentTarget.parentElement as HTMLElement|null;
    if(!panel)return;
    const rect=panel.getBoundingClientRect();
    decisionDrag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,left:rect.left,top:rect.top};
    event.currentTarget.setPointerCapture(event.pointerId);
    setDecisionWindowStyle(prev=>({...prev,left:rect.left,top:rect.top,transform:'none'}));
  };
  const moveDecisionDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
    const drag=decisionDrag.current;
    if(!drag||drag.pointerId!==event.pointerId)return;
    const panel=event.currentTarget.parentElement as HTMLElement|null;
    const rect=panel?.getBoundingClientRect();
    const width=rect?.width??900;
    const height=rect?.height??560;
    const left=Math.max(8,Math.min(window.innerWidth-width-8,drag.left+event.clientX-drag.startX));
    const top=Math.max(8,Math.min(window.innerHeight-Math.min(height,120)-8,drag.top+event.clientY-drag.startY));
    setDecisionWindowStyle(prev=>({...prev,left,top}));
  };
  const endDecisionDrag=(event:React.PointerEvent<HTMLDivElement>)=>{
    if(decisionDrag.current?.pointerId===event.pointerId)decisionDrag.current=null;
  };
  useEffect(()=>{if(!m||m.status!=='live')return;const inn=m.inningsData[m.innings-1];const last=inn?.events[inn.events.length-1];const delay=(last?.wicket?1850:1000)/speed;const timer=window.setTimeout(()=>{advanceMatchBall(game);setGame({...game});},delay);return()=>window.clearTimeout(timer);},[m?.status,m?.innings,m?.inningsData?.[m?.innings-1]?.events.length,speed]);
  useEffect(()=>{if(!m||m.status!=='toss')return;const home=game.teams.find(t=>t.id===m.homeTeamId)!;if(!m.tossRevealed&&home.kind==='bot'){const timer=window.setTimeout(()=>{revealToss(game,Math.random()<.5?'heads':'tails');setGame({...game});},850);return()=>window.clearTimeout(timer);}if(m.tossRevealed&&m.tossWinnerId){const winner=game.teams.find(t=>t.id===m.tossWinnerId)!;if(winner.kind==='bot'){const timer=window.setTimeout(()=>{const choice=autoTossDecision(game,winner);startAfterToss(game,choice);setGame({...game});},900+Math.floor(Math.random()*800));return()=>window.clearTimeout(timer);}}},[m?.status,m?.tossRevealed,m?.tossWinnerId]);
  useEffect(()=>{if(!m||m.status!=='review'||!m.review)return;const review=m.review;if(review.stage==='decision'&&review.mode==='captain-review'&&review.reviewingTeamId){const reviewing=game.teams.find(t=>t.id===review.reviewingTeamId);if(reviewing?.kind==='bot'){const timer=window.setTimeout(()=>{const chooseReview=review.willOverturn||Math.random()<.18;if(chooseReview)finishWicketDecision(game,true);else finishWicketDecision(game,false);setGame({...game});},700+Math.floor(Math.random()*900));return()=>window.clearTimeout(timer);}}if(review.stage==='checking'){setReviewCountdown(review.mode==='third-umpire'?2:3);const total=(review.mode==='third-umpire'?2200:3000)/speed;const started=Date.now();const tick=window.setInterval(()=>setReviewCountdown(Math.max(0,Math.ceil((total-(Date.now()-started))/1000))),100);const timer=window.setTimeout(()=>{window.clearInterval(tick);resolvePendingReview(game);setGame({...game});},total);return()=>{window.clearInterval(tick);window.clearTimeout(timer);};}},[m?.status,m?.review?.stage,m?.review?.mode,speed]);
  useEffect(()=>{if(!m||m.status!=='awaiting-batter')return;const inn=m.inningsData[m.innings-1];const team=game.teams.find(t=>t.id===inn?.battingTeamId);if(!inn||team?.kind!=='bot')return;const timer=window.setTimeout(()=>{chooseAIBatter(game,inn);if(inn.needsBowler){const bowling=game.teams.find(t=>t.id===inn.bowlingTeamId)!;inn.bowlerId=chooseAIBowler(game,bowling,inn);inn.needsBowler=false;}inn.strikerId=inn.strikerId||'';inn.nonStrikerId=inn.nonStrikerId||'';inn.outPlayerIds=inn.outPlayerIds??[];m.status=inn.strikerId&&inn.nonStrikerId?'live':'innings-break';setGame({...game});},450);return()=>window.clearTimeout(timer);},[m?.status,m?.innings,m?.inningsData?.[m?.innings-1]?.outPlayerIds?.length]);
  if(!m)return <div className="page"><PageHead kicker="MATCH CENTRE" title="Select a fixture to watch." sub="Open a match from the fixture desk to begin team confirmation, toss and live play."/><Button primary onClick={()=>setScreen('fixtures')}>Open fixtures <ArrowRight size={16}/></Button></div>;
  const home=game.teams.find(t=>t.id===m.homeTeamId)!;const away=game.teams.find(t=>t.id===m.awayTeamId)!;
  if(m.status==='toss'){
    const winner=m.tossWinnerId?game.teams.find(t=>t.id===m.tossWinnerId):undefined;const homeCaptain=home.captainId?game.players.find(p=>p.id===home.captainId):undefined;
    return <div className="page match-page"><PageHead kicker="PRE-MATCH CENTRE" title={`${home.name} vs ${away.name}`} sub={`${game.league.format} · ${game.league.overs} overs · ${m.timeOfDay==='night'?'Night match · dew may develop':'Day match · no night dew'} · ${game.teams.find(t=>t.id===m.homeTeamId)?.ground} · Home side calls the toss.`}/><div className="toss-screen"><Panel className="toss-card"><div className="toss-matchup"><div><Crest team={home} size={58}/><b>{home.name}</b><small>HOME · {home.ground}</small></div><strong>VS</strong><div><Crest team={away} size={58}/><b>{away.name}</b><small>AWAY</small></div></div><div className="form-grid"><Select label="Match conditions" value={m.timeOfDay??'night'} onChange={e=>{m.timeOfDay=e.target.value as 'day'|'night';setGame({...game});}}><option value="day">Day match · lower dew probability</option><option value="night">Night match · dew can develop</option></Select><div className="muted">{m.timeOfDay==='night'?'Night conditions: dew may reduce spin grip and increase skidding in the second innings.':'Day conditions: no night dew; pitch wear and surface type remain active.'}</div></div><div className="toss-coin" key={m.tossRevealed?'revealed':'ready'}>{m.tossRevealed?(m.tossResult?.toUpperCase()??'T'):'T'}</div>{!m.tossRevealed?<><h2>Coin Toss</h2><p>{home.kind==='human'?`${homeCaptain?.name??home.manager??'Home captain'}: call Heads or Tails.`:`${home.name} captain is choosing the call…`}</p>{home.kind==='human'&&<><div className="toss-actions"><button className={`choice ${tossCall==='heads'?'selected':''}`} onClick={()=>setTossCall('heads')}>Heads</button><button className={`choice ${tossCall==='tails'?'selected':''}`} onClick={()=>setTossCall('tails')}>Tails</button></div><Button primary onClick={()=>{revealToss(game,tossCall);setGame({...game});}}>Flip coin <ArrowRight size={16}/></Button></> }{home.kind==='bot'&&<small>AI calls and flips the coin automatically.</small>}</>:<><h2>{winner?.name} won the toss</h2><p>{m.lastCommentary}</p>{winner?.kind==='human'?<><p className="toss-decision-label">{winner.name}, what is your call?</p><div className="toss-actions"><Button primary onClick={()=>{startAfterToss(game,'bat');setGame({...game});}}>Bat first</Button><Button ghost onClick={()=>{startAfterToss(game,'bowl');setGame({...game});}}>Bowl first</Button></div></>:<div className="ai-thinking-card"><Activity size={18}/> AI manager is reviewing pitch, lineup and opposition…</div>}</>}</Panel></div></div>;
  }
  if(m.status==='innings-break'){
    const first=m.inningsData[0];const firstBat=game.teams.find(t=>t.id===first.battingTeamId)!;const firstBowl=game.teams.find(t=>t.id===first.bowlingTeamId)!;const top=inningsScorecard(game,first).batting.sort((a,b)=>b.runs-a.runs).slice(0,3);const bowlTop=inningsScorecard(game,first).bowlers.sort((a,b)=>b.wickets-a.wickets||a.conceded-b.conceded).slice(0,3);
    return <div className="page match-page"><PageHead kicker="MATCH CENTRE" title="Innings Break" sub={`${firstBat.name} have completed their innings. Match state and scorecard are saved.`}/><div className="innings-break-grid"><Panel className="innings-total"><span>{firstBat.name}</span><strong>{first.runs}/{first.wickets}</strong><small>{formatOvers(first.balls)} overs · RR {(first.runs/(Math.max(1,first.balls)/6)).toFixed(2)}</small></Panel><Panel className="target-panel"><span>TARGET</span><strong>{first.runs+1}</strong><small>{firstBowl.name} need {first.runs+1} to win</small></Panel></div><div className="match-grid"><Panel><div className="panel-head"><div><Kicker>TOP BATTERS</Kicker><h3>First innings</h3></div></div>{top.map(p=><div className="scorecard-summary-row" key={p.id}><b>{p.name}</b><strong>{p.runs} ({p.balls})</strong><small>{p.fours} fours · {p.sixes} sixes</small></div>)}</Panel><Panel><div className="panel-head"><div><Kicker>BOWLING FIGURES</Kicker><h3>Key spells</h3></div></div>{bowlTop.map(p=><div className="scorecard-summary-row" key={p.id}><b>{p.name}</b><strong>{p.wickets}/{p.conceded}</strong><small>{formatOvers(p.legal)} overs · Econ {p.economy.toFixed(2)}</small></div>)}</Panel></div><Panel className="innings-continue"><div><Kicker>SECOND INNINGS</Kicker><h2>Chase setup is ready</h2><p>Target {first.runs+1}. Batting and bowling managers will be prompted for any required decisions.</p></div><Button primary onClick={()=>{startSecondInnings(game);setGame({...game});}}>Start 2nd innings <ArrowRight size={16}/></Button></Panel></div>;
  }
  if(m.status==='completed'){
    const first=m.inningsData[0];const second=m.inningsData[1];const winner=m.winnerTeamId?game.teams.find(t=>t.id===m.winnerTeamId):undefined;const pomId=Object.keys(m.playerRuns).sort((a,b)=>((m.playerRuns[b]||0)+(m.playerWickets[b]||0)*22)-(m.playerRuns[a]||0)-(m.playerWickets[a]||0)*22)[0];const pom=game.players.find(p=>p.id===pomId);
    return <div className="page match-page"><PageHead kicker="MATCH RESULT" title={winner?`${winner.name} won`:'Match tied'} sub={m.lastCommentary}/><Panel className="match-result"><Trophy size={32}/><div><Kicker>FULL TIME</Kicker><h2>{m.lastCommentary}</h2><p>{home.name} {first.battingTeamId===home.id?first.runs:second?.runs}/{first.battingTeamId===home.id?first.wickets:second?.wickets} · {away.name} {first.battingTeamId===away.id?first.runs:second?.runs}/{first.battingTeamId===away.id?first.wickets:second?.wickets}</p></div><Button primary onClick={()=>setScreen('fixtures')}>Back to fixtures</Button></Panel>{pom&&<Panel className="pom-card"><span>PLAYER OF THE MATCH</span><h3>{pom.name}</h3><p>{m.playerRuns[pom.id]??0} runs · {m.playerWickets[pom.id]??0} wickets</p></Panel>}{m.inningsData.map((inn,i)=>{const t=game.teams.find(x=>x.id===inn.battingTeamId)!;const sc=inningsScorecard(game,inn);return <Panel key={t.id}><div className="panel-head"><div><Kicker>FULL SCORECARD · INNINGS {i+1}</Kicker><h3>{t.name} {inn.runs}/{inn.wickets}</h3><p>{formatOvers(inn.balls)} overs · Extras {sc.extras}</p></div></div><div className="leader-table"><div className="leader-head"><span>BATTER</span><span>R</span><span>B</span><span>4s / 6s</span></div>{sc.batting.map(b=><div className="leader-row" key={b.id}><div className="leader-player"><b>{b.name}</b><small>{b.out?(b.dismissal?.dismissalType==='run out'?'run out':b.dismissal?.dismissalType??'out'):'not out'}</small></div><strong>{b.runs}</strong><span>{b.balls}</span><span>{b.fours} / {b.sixes}</span></div>)}</div><div className="leader-table"><div className="leader-head"><span>BOWLER</span><span>O</span><span>R</span><span>W / ECON</span></div>{sc.bowlers.map(b=><div className="leader-row" key={b.id}><div className="leader-player"><b>{b.name}</b></div><span>{formatOvers(b.legal)}</span><span>{b.conceded}</span><strong>{b.wickets} / {b.economy.toFixed(2)}</strong></div>)}</div></Panel>})}<Button ghost onClick={()=>setScreen('fixtures')}>Return to fixture desk</Button></div>;
  }
  const inn=m.inningsData[m.innings-1];const batting=game.teams.find(t=>t.id===inn?.battingTeamId)!;const bowling=game.teams.find(t=>t.id===inn?.bowlingTeamId)!;const striker=game.players.find(p=>p.id===inn?.strikerId);const non=game.players.find(p=>p.id===inn?.nonStrikerId);const bowler=game.players.find(p=>p.id===inn?.bowlerId);const events=[...(inn?.events??[])].slice(-24).reverse();const rr=inn&&inn.balls?inn.runs*6/inn.balls:0;const need=inn?.target!==undefined?Math.max(0,inn.target-inn.runs):0;const remaining=inn?Math.max(0,m.ballsPerInnings-inn.balls):m.ballsPerInnings;const rrr=inn?.target!==undefined&&remaining?need*6/remaining:0;const chase=inn?currentRunChase(inn,m.ballsPerInnings):undefined;const partnership=inn?getCurrentPartnership(inn):undefined;const displayOverIndex=inn?(inn.balls>0&&inn.balls%6===0?Math.floor(inn.balls/6)-1:Math.floor(inn.balls/6)):0;const overEvents=inn?inn.events.filter(e=>e.over===displayOverIndex):[];const overRuns=overEvents.reduce((sum,e)=>sum+e.runs,0);const overWickets=overEvents.filter(e=>e.wicket).length;const overBowler=overEvents.length?game.players.find(p=>p.id===overEvents[overEvents.length-1].bowlerId):undefined;const isOverComplete=!!inn&&inn.balls>0&&inn.balls%6===0;
  const nextBatters=inn?teamXI(game,batting).filter(p=>!inn.outPlayerIds?.includes(p.id)&&p.id!==inn.strikerId&&p.id!==inn.nonStrikerId):[];const bowlingRoster=inn?eligibleBowlers(game,bowling):[];const lawfulBowlers=inn?bowlingRoster.filter(p=>!bowlerUnavailableReason(game,bowling,inn,p)):[];const safeBowlers=inn?lawfulBowlers.filter(p=>!bowlerRotationRisk(game,bowling,inn,p)):[];const availableBowlers=safeBowlers.length?safeBowlers:lawfulBowlers;const recommendedBowlerId=inn?chooseAIBowler(game,bowling,inn):'';const effectiveSelectedBowler=availableBowlers.some(p=>p.id===selectedBowler)?selectedBowler:(availableBowlers.find(p=>p.id===recommendedBowlerId)?.id??availableBowlers[0]?.id??'');const bowlSafety=inn?bowlingSafetySummary(game,bowling,inn,teamXI(game,bowling)):undefined;const drsTeam=m.review?.reviewingTeamId?game.teams.find(t=>t.id===m.review?.reviewingTeamId):undefined;
  return <div className={`page match-page live-match-page ${['review','awaiting-bowler','awaiting-batter'].includes(m.status)?'manager-interruption':''}`}><div className="match-topbar"><div><Kicker>{m.status==='review'?'MATCH CENTRE · REVIEW':m.status==='paused'?'MATCH CENTRE · PAUSED':'MATCH CENTRE · LIVE'}</Kicker><h1>{batting?.name} <span>{inn?.runs}/{inn?.wickets}</span></h1><p>{formatOvers(inn?.balls??0)} overs · RR {rr.toFixed(2)}{inn?.target!==undefined?` · Target ${inn.target} · RRR ${rrr.toFixed(2)}`:''}</p></div><div className="speed-controls"><span>SPEED</span>{[1,2,4].map(x=><button key={x} className={speed===x?'active':''} onClick={()=>{setSpeed(x);m.speed=x;setGame({...game});}}>{x}×</button>)}<Button ghost onClick={()=>setScreen('fixtures')}>Fixtures</Button></div></div>
    <div className="match-score-strip"><div><span>{home.code} · {home.name}</span><b>{m.inningsData.find(x=>x.battingTeamId===home.id)?.runs??'—'}/{m.inningsData.find(x=>x.battingTeamId===home.id)?.wickets??'—'}</b></div><strong>VS</strong><div><span>{away.code} · {away.name}</span><b>{m.inningsData.find(x=>x.battingTeamId===away.id)?.runs??'—'}/{m.inningsData.find(x=>x.battingTeamId===away.id)?.wickets??'—'}</b></div></div>
    {chase&&<div className={`chase-requirement ${chase.requiredRate>10?'urgent':chase.requiredRate<6?'controlled':''}`}><div><span>CHASE EQUATION</span><strong>Need {chase.runsNeeded} runs from {chase.ballsRemaining} balls</strong><small>Target {chase.target} · {chase.neededOvers} overs remaining</small></div><div className="chase-rates"><b>RRR {chase.requiredRate.toFixed(2)}</b><small>Current RR {chase.currentRate.toFixed(2)} · {chase.requiredRate>chase.currentRate?`Need +${(chase.requiredRate-chase.currentRate).toFixed(2)} RPO`:'Current rate is ahead'}</small></div></div>}
    <div className={`over-summary ${isOverComplete?'complete':''}`}><div className="over-summary-head"><span>{isOverComplete?'LAST OVER':'CURRENT OVER'} · {displayOverIndex+1}</span><strong>{overRuns} RUNS{overWickets?` · ${overWickets} WICKET${overWickets===1?'':'S'}`:''}</strong></div><div className="over-bubbles">{overEvents.length?overEvents.map(e=><span key={e.id} className={`over-delivery ${e.wicket?'wicket':e.outcome==='6'?'six':e.outcome==='4'?'four':e.outcome==='WD'||e.outcome==='NB'?'extra':''}`}><b>{e.outcome==='NB'&&(e.batRuns??0)>0?`NB+${e.batRuns}`:e.outcome==='W'&&e.runs>0?`W+${e.runs}`:e.outcome==='LB'?'LB':e.outcome==='B'?'B':e.outcome}</b>{e.extras? <small>+{e.extras}</small>:null}</span>):<small className="over-empty">First over is ready to begin.</small>}</div><div className="over-summary-foot"><span>{isOverComplete?'Over complete':'Over in progress'}</span><span>{overBowler?`Bowled by ${overBowler.name}`:'Awaiting opening delivery'}{bowler&&isOverComplete?` · Next bowler required`:''}</span></div></div>
    {m.status==='awaiting-bowler'&&<Panel className="decision-panel bowler-decision-panel" style={decisionWindowStyle}><div className="decision-window-titlebar" onPointerDown={startDecisionDrag} onPointerMove={moveDecisionDrag} onPointerUp={endDecisionDrag} onPointerCancel={endDecisionDrag} style={{cursor:'move',touchAction:'none',userSelect:'none',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16}}><div><Kicker>TACTICAL DECISION · BOWLING</Kicker><h2>Choose the bowler for this over</h2></div><small style={{whiteSpace:'nowrap',opacity:.65,fontSize:10,letterSpacing:'.08em'}}>DRAG TO MOVE · RESIZE CORNER</small></div><div className="bowler-decision-heading"><div><p>{bowling.name}, the full confirmed XI is listed. Figures are O–M–R–W (overs, maidens, runs conceded, wickets). Part-time batters are available as emergency options so you cannot get stuck without a bowler.</p></div><div className="bowler-available-count"><strong>{safeBowlers.length||lawfulBowlers.length}</strong><span>{safeBowlers.length?'safe options':'legal options'}</span></div></div><div className="bowler-safety-banner"><Shield size={16}/><div><b>Bowling rotation safety guard</b><small>{bowlSafety?.message??'The game checks over limits and future bowling capacity before confirming a bowler.'}</small></div></div><div className="bowler-mode-actions"><Button primary onClick={()=>{const id=chooseAIBowler(game,bowling,inn);if(id){chooseMatchBowler(game,id,'auto');setSelectedBowler('');setGame({...game});}}} disabled={!lawfulBowlers.length}><Sparkles size={16}/> Auto-pick safely · all remaining overs</Button><Button ghost onClick={()=>{inn.bowlingSelectionMode='manual';setSelectedBowler(recommendedBowlerId||effectiveSelectedBowler);setGame({...game});}}><SlidersHorizontal size={16}/> Choose manually</Button></div><Select label="Select bowler" value={effectiveSelectedBowler} onChange={e=>setSelectedBowler(e.target.value)}><option value="" disabled>{availableBowlers.length?'Choose a safe bowler':'No legal bowler available'}</option>{bowlingRoster.map(p=>{const fig=playerBowlingFigures(inn,p.id);const reason=bowlerUnavailableReason(game,bowling,inn,p);const unsafe=!reason&&safeBowlers.length>0&&bowlerRotationRisk(game,bowling,inn,p);const partTime=!(p.role.includes('Bowler')||p.role.includes('All-rounder'));return <option key={p.id} value={p.id} disabled={!!reason||unsafe}>{`${p.name} · ${formatOvers(fig.legal)}–${fig.maidens}–${fig.conceded}–${fig.wickets} · Econ ${fig.economy.toFixed(2)} · ${reason||(unsafe?'Unsafe future rotation':partTime?'Emergency part-time option':'Available')}`}</option>})}</Select><div className="bowler-roster-table"><div className="bowler-roster-head"><span>BOWLER</span><span>ROLE / FORM</span><span>O–M–R–W</span><span>ECON</span><span>STATUS</span></div>{bowlingRoster.map(p=>{const fig=playerBowlingFigures(inn,p.id);const reason=bowlerUnavailableReason(game,bowling,inn,p);const unsafe=!reason&&safeBowlers.length>0&&bowlerRotationRisk(game,bowling,inn,p);const selected=effectiveSelectedBowler===p.id;const recommended=p.id===recommendedBowlerId;const partTime=!(p.role.includes('Bowler')||p.role.includes('All-rounder'));const disabled=!!reason||unsafe;const status=reason|| (unsafe?'Unsafe rotation · choose a safer option':recommended?'Recommended safe pick':partTime?'Emergency / part-time option':'Available');return <button type="button" key={p.id} className={`bowler-roster-row ${selected?'selected':''} ${disabled?'unavailable':''} ${recommended?'recommended':''}`} disabled={disabled} onClick={()=>setSelectedBowler(p.id)}><span className="bowler-roster-name"><b>{p.name}</b><small>{p.bowlingRating} BOWL · FORM {p.form}{partTime?' · PART-TIME / EMERGENCY':''}</small></span><span>{p.role}</span><strong>{formatOvers(fig.legal)}–{fig.maidens}–{fig.conceded}–{fig.wickets}</strong><span>{fig.economy.toFixed(2)}</span><span className={disabled?'bowler-status-off':recommended?'bowler-status-recommended':'bowler-status-on'}>{status}</span></button>})}{!bowlingRoster.length&&<div className="empty-state">No players were found in the confirmed XI. Return to Squad & XI and confirm a team.</div>}</div><div className="bowler-selection-footer"><span>{effectiveSelectedBowler?`Selected: ${game.players.find(p=>p.id===effectiveSelectedBowler)?.name}`:'No eligible bowler selected'} · Max {game.league.format==='T20'?4:game.league.format==='ODI'?10:Math.ceil(game.league.overs/5)} overs per bowler · Current auto mode: {inn.bowlingSelectionMode==='auto'?'ON':'OFF'}</span><Button primary disabled={!effectiveSelectedBowler} onClick={()=>{chooseMatchBowler(game,effectiveSelectedBowler,'manual');setSelectedBowler('');setGame({...game});}}>Confirm bowler <ArrowRight size={16}/></Button></div></Panel>}
    {m.status==='awaiting-batter'&&<Panel className="decision-panel batter-decision-panel" style={decisionWindowStyle}><div className="decision-window-titlebar" onPointerDown={startDecisionDrag} onPointerMove={moveDecisionDrag} onPointerUp={endDecisionDrag} onPointerCancel={endDecisionDrag} style={{cursor:'move',touchAction:'none',userSelect:'none',display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:16}}><div><Kicker>WICKET · BATTING DECISION</Kicker><h2>Who comes in next?</h2></div><small style={{whiteSpace:'nowrap',opacity:.65,fontSize:10,letterSpacing:'.08em'}}>DRAG TO MOVE · RESIZE CORNER</small></div><p>{batting.name}, select the incoming batter. The existing non-striker stays at the other end.</p><div className="decision-player-grid" style={{maxHeight:'48vh',overflowY:'auto',position:'relative',zIndex:1,pointerEvents:'auto'}}>{nextBatters.map(p=><button type="button" key={p.id} aria-pressed={selectedBatter===p.id} className={`decision-player-card ${selectedBatter===p.id?'selected':''}`} style={{position:'relative',zIndex:2,pointerEvents:'auto',cursor:'pointer'}} onClick={(event)=>{event.preventDefault();event.stopPropagation();setSelectedBatter(p.id);}}><div className="player-avatar small">{p.avatar}</div><b>{p.name}</b><PlayerProfileTrigger playerId={p.id}/><small>{p.role}</small><span>{p.battingRating} BAT · FORM {p.form}</span><small>Morale {p.morale} · Fitness {p.attrs.fitness}</small></button>)}</div><Button primary disabled={!selectedBatter} onClick={()=>{const chosen=selectedBatter;const accepted=chooseNextBatter(game,chosen);setGame({...game});if(accepted)setSelectedBatter('');}}>Send batter in <ArrowRight size={16}/></Button></Panel>}
    {m.status==='review'&&m.review&&<Panel className={`drs-panel ${m.review.stage==='checking'?'checking':''}`}><div className="drs-header"><div><Kicker>{m.review.mode==='third-umpire'?'THIRD UMPIRE CHECK':'DECISION REVIEW SYSTEM'}</Kicker><h2>{m.review.stage==='decision'?'The captain has a decision to make':'Review in progress'}</h2></div><div className="drs-badge">DRS</div></div><div className="drs-timeline"><span className="drs-ball-icon">●</span><p>{m.review.commentary}</p></div>{m.review.stage==='decision'?<><p>{drsTeam?.name} have {m.reviewsRemaining?.[drsTeam?.id??'']??0} review(s) remaining. The evidence is hidden until the review is completed.</p><div className="drs-actions"><Button primary disabled={(m.reviewsRemaining?.[drsTeam?.id??'']??0)<=0} onClick={()=>{finishWicketDecision(game,true);setGame({...game});}}>Take DRS</Button><Button ghost onClick={()=>{finishWicketDecision(game,false);setGame({...game});}}>Accept umpire's decision</Button></div></>:<><div className="review-steps"><span>Ball tracking</span><span>Impact check</span><span>Wicket check</span></div><div className="review-countdown">{reviewCountdown>0?reviewCountdown:'VERDICT'}</div><p>The third umpire is checking the relevant evidence. The match resumes automatically at the selected speed.</p></>}</Panel>}
    <div className="match-grid"><Panel className="score-panel"><div className="live-card"><div><span>BATTERS</span><b>{striker?.name??'Awaiting batter'} <em>{m.playerRuns[striker?.id||'']||0} ({m.playerBalls[striker?.id||'']||0})</em></b><small>SR {striker&&m.playerBalls[striker.id]?((m.playerRuns[striker.id]||0)*100/m.playerBalls[striker.id]).toFixed(1):'—'}</small><b>{non?.name??'—'} <em>{m.playerRuns[non?.id||'']||0} ({m.playerBalls[non?.id||'']||0})</em></b><small>SR {non&&m.playerBalls[non.id]?((m.playerRuns[non.id]||0)*100/m.playerBalls[non.id]).toFixed(1):'—'}</small></div><div><span>BOWLER</span><b>{bowler?.name??(m.status==='awaiting-bowler'?'Select bowler':'—')}</b>{bowler&&<><small>{formatOvers(playerBowlingFigures(inn,bowler.id).legal)} overs · {playerBowlingFigures(inn,bowler.id).wickets}/{playerBowlingFigures(inn,bowler.id).conceded}</small><small>Econ {playerBowlingFigures(inn,bowler.id).economy.toFixed(2)}</small></>}</div></div><div className="toss-strip"><span>COIN TOSS</span><b>{game.teams.find(t=>t.id===m.tossWinnerId)?.name??'—'} won</b><small>{game.teams.find(t=>t.id===m.decisionTeamId)?.name??'—'} chose to {m.decision??'—'} · Caller {home.name}</small></div><div className="match-phase-meter"><span className={inn.phase==='powerplay'?'active':''}>POWERPLAY</span><i/><span className={inn.phase==='middle'?'active':''}>MIDDLE</span><i/><span className={inn.phase==='death'?'active':''}>DEATH</span></div><div className="match-key-stats"><div><span>PARTNERSHIP</span><b>{partnership?.runs??0} runs · {partnership?.balls??0} balls</b></div><div><span>WICKETS FALLEN</span><b>{inn.wickets}/10</b></div><div><span>MATCH PRESSURE</span><b>{inn.wickets>=7?'Collapse danger':inn.target!==undefined&&rrr>12?'Extreme chase pressure':inn.wickets>=4?'Under pressure':inn.wickets>=2?'Building':'Competitive'}</b></div></div></Panel>
      <Panel className="commentary-panel"><div className="panel-head"><div><Kicker>BALL-BY-BALL</Kicker><h3>Live commentary</h3><p>{MATCH_SCRIPT_COUNT}+ contextual commentary combinations · match state drives event selection</p></div><span className="live-dot">● LIVE</span></div><div className="commentary-feed">{events.map(e=><div className={`commentary-line ${e.wicket?'wicket':e.outcome==='6'?'six':e.outcome==='4'?'four':e.outcome==='WD'||e.outcome==='NB'?'extra':''}`} key={e.id}><span>{e.over+1}.{e.ball}</span><b>{e.outcome==='LB'?'LB':e.outcome==='B'?'B':e.outcome}</b><p>{e.commentary}</p></div>)}</div><div className="latest-commentary">{m.lastCommentary}</div></Panel></div>
    <div className="match-controls"><Button ghost disabled={!['live','paused'].includes(m.status)} onClick={()=>{if(m.review||m.pendingDelivery){m.status='review';setGame({...game});return;}if(m.status==='live')m.status='paused';else if(m.status==='paused')m.status='live';setGame({...game});}}>{m.status==='paused'?<Play size={16}/>:<Activity size={16}/>}{m.status==='paused'?'Resume':['review','awaiting-bowler','awaiting-batter'].includes(m.status)?'Decision pending':'Pause'}</Button><span className="speed-caption">{m.status==='paused'?'SIMULATION PAUSED':m.status==='review'?'REVIEW IN PROGRESS':m.status==='awaiting-bowler'?'MANAGER SELECTING BOWLER':m.status==='awaiting-batter'?'MANAGER SELECTING BATTER':`${speed}× PLAYBACK`}</span>{bowling.kind==='human'&&inn.bowlingSelectionMode==='auto'&&m.status==='live'&&<Button ghost onClick={()=>{inn.bowlingSelectionMode='manual';setGame({...game});}}>Manual next over</Button>}<Button primary onClick={()=>{setSpeed(2);m.speed=2;if(m.status==='paused'&&!m.review&&!m.pendingDelivery)m.status='live';setGame({...game});}}>2× Fast</Button><Button primary onClick={()=>{setSpeed(4);m.speed=4;if(m.status==='paused'&&!m.review&&!m.pendingDelivery)m.status='live';setGame({...game});}}>4× Fast</Button><Button ghost onClick={()=>setScreen('fixtures')}>Fixture desk</Button></div>
  </div>;
}
function iconPlaceholder(){return <Play size={16}/>}
function Season({game,setScreen}:{game:GameState;setScreen:(s:any)=>void}){ensureFixtureCalendar(game);if(game.liveMatch)return <MatchCentre game={game} setScreen={(s:any)=>{if(s==='fixtures'){game.liveMatch=undefined;setGame({...game})}else setGame({...game})}}/>;const completed=game.fixtures.filter(f=>f.status==='completed').length;return <div className="page"><PageHead kicker="MATCH CENTRE" title="Watch the season live." sub="Every fixture can be opened into a live Cricket Captain-style match room. One delivery advances every 1.5 seconds at 1×, with 2× and 4× controls."/><div className="stats-grid four"><Stat label="Played" value={completed}/><Stat label="Remaining" value={game.fixtures.length-completed}/><Stat label="Leader" value={game.teams.find(t=>t.id===game.standings[0]?.teamId)?.code??'—'}/><Stat label="Live speed" value="1s / ball"/></div><Panel><div className="panel-head"><div><Kicker>FIXTURE BOARD</Kicker><h3>Select a match</h3></div><Button ghost onClick={()=>setGame({...game,fixtures:game.fixtures.length?game.fixtures:makeFixtures(game.teams)})}>Refresh</Button></div><div className="fixture-table">{game.fixtures.map(f=>{const h=game.teams.find(t=>t.id===f.homeTeamId)!,a=game.teams.find(t=>t.id===f.awayTeamId)!;return <div className="fixture-row" key={f.id}><span>R{String(f.round).padStart(2,'0')}</span><b>{h.code}</b><span>vs</span><b>{a.code}</b><span>{f.status}</span><Button disabled={f.status==='scheduled'&&game.fixtures.filter(x=>x.status==='scheduled').sort((a,b)=>a.round-b.round)[0]?.id!==f.id} onClick={()=>{const next=game.fixtures.filter(x=>x.status==='scheduled').sort((a,b)=>a.round-b.round)[0];if(f.status==='scheduled'&&next&&f.id!==next.id){window.alert(`Play ${next.label??`Round ${next.round}`} first.`);return;}if(f.status!=='completed'&&!game.liveMatch){prepareMatch(game,f);setGame({...game});}else setScreen('fixtures');}}>{f.status==='completed'?'View result':f.status==='live'?'Resume live':'Start live match'}</Button></div>})}</div></Panel></div>}

function tournamentSorted(game:GameState){return [...game.teams].sort((a,b)=>b.record.points-a.record.points||b.record.netRunRate-a.record.netRunRate||b.record.won-a.record.won);}

type DynastyNewsItem={id:string;category:string;tag:string;headline:string;summary:string;priority:'FEATURED'|'NORMAL'};
function buildDynastyNews(game:GameState):DynastyNewsItem[]{
  const out:DynastyNewsItem[]=[];const teams=game.teams??[];const players=game.players??[];const fixtures=game.fixtures??[];const stats=game.records?.seasonStats??{};
  const add=(category:string,tag:string,headline:string,summary:string,priority:DynastyNewsItem['priority']='NORMAL')=>out.push({id:`news-${out.length}`,category,tag,headline,summary,priority});
  const upcoming=[...fixtures].filter(f=>f.status==='scheduled').sort((a,b)=>a.round-b.round);
  const completed=[...fixtures].filter(f=>f.status==='completed').sort((a,b)=>b.round-a.round);
  completed.slice(0,12).forEach(f=>{const h=teams.find(t=>t.id===f.homeTeamId),a=teams.find(t=>t.id===f.awayTeamId),w=teams.find(t=>t.id===f.winnerTeamId);if(!h||!a)return;
    add('Matches','RESULT',`${w?.name??'The match'} ${w?'take the result':'is complete'}`,`${h.name} ${f.homeRuns??0}/${f.homeWickets??0} vs ${a.name} ${f.awayRuns??0}/${f.awayWickets??0}. ${f.resultText??'Completed fixture recorded in the season.'}`,'FEATURED');
    add('Rivalries','HEAD-TO-HEAD',`${h.name} vs ${a.name}: another chapter completed`,`Their latest meeting is now reflected in the tournament record.`);});
  upcoming.slice(0,8).forEach(f=>{const h=teams.find(t=>t.id===f.homeTeamId),a=teams.find(t=>t.id===f.awayTeamId);if(!h||!a)return;
    add('Match Preview','NEXT FIXTURE',`${h.name} vs ${a.name}: the next test awaits`,`${f.label??`Round ${f.round}`} · ${f.venue??h.ground}. Preview generated from the current fixture schedule.`,'FEATURED');
    const hp=(h.playingXI??[]).map(id=>players.find(p=>p.id===id)).filter(Boolean) as Player[],ap=(a.playingXI??[]).map(id=>players.find(p=>p.id===id)).filter(Boolean) as Player[];
    const batter=hp.find(p=>p.role.toLowerCase().includes('bat'))??hp[0],bowler=ap.find(p=>p.role.toLowerCase().includes('bowl'))??ap[0];
    if(batter&&bowler)add('Player Matchups','KEY BATTLE',`${batter.name} vs ${bowler.name}: a matchup to watch`,`${batter.name} is in ${h.name}'s selected XI and ${bowler.name} is in ${a.name}'s selected XI. This is a preview, not a predicted result.`,'FEATURED');});
  players.map(p=>({p,s:stats[p.id]})).filter(x=>x.s&&(x.s.runs>0||x.s.wickets>0)).sort((a,b)=>(b.s.runs??0)-(a.s.runs??0)).slice(0,30).forEach(({p,s})=>{
    if(s.runs>0)add('Players','RUNS WATCH',`${p.name} enters the run-scoring conversation`,`${p.name} has ${s.runs} runs in the recorded season statistics.`);
    if(s.wickets>0)add('Players','WICKET WATCH',`${p.name} features in the wicket race`,`${p.name} has ${s.wickets} wickets in the recorded season statistics.`);});
  const editorial=[
    ['Fans','FAN CHATTER','Fans debate the franchise combination','In-game fan discussion: supporters weigh squad balance, player roles and selection choices.'],
    ['Press Room','MEDIA WATCH','The press room turns its attention to selection','Fictional in-game media coverage: reporters discuss team balance and tactical choices.'],
    ['Bench Watch','SELECTION DEBATE','The bench conversation becomes part of the season story','In-game fan question: which reserve player could make the biggest impact if selected?'],
    ['Experts','PUNDIT VIEW','Analysts assess the tactical options','Fictional in-game pundit discussion about batting depth, bowling resources and match-ups.'],
    ['Captaincy','LEADERSHIP WATCH','Captaincy decisions are under the spotlight','In-game discussion around field settings, bowling changes and batting-order decisions.'],
    ['Dressing Room','TEAM SPIRIT','The dressing-room story continues','In-game feature on preparation, role clarity and support between senior and emerging players.'],
    ['Power Rankings','FORM GUIDE','The power rankings will move with results','Editorial ranking note: consult the official points table for confirmed standings.'],
    ['Auction Desk','FRANCHISE BUILD','Squad construction remains a talking point','In-game franchise coverage: player roles, overseas balance and auction value.'],
    ['Championship Race','TROPHY WATCH','The championship race is taking shape','The standings and remaining fixtures determine the teams in contention.'],
    ['Rivalries','RIVALRY WATCH','A franchise rivalry remains on the radar','In-game rivalry coverage ahead of the next meeting between these franchises.']
  ];
  teams.forEach(team=>{
    editorial.forEach(([c,tag,title,summary],i)=>add(c,tag,`${team.name}: ${title}`,`${summary} Coverage focus: ${team.name}.`,i===0?'FEATURED':'NORMAL'));
    const squad=team.playerIds.map(id=>players.find(p=>p.id===id)).filter(Boolean) as Player[];
    const bench=squad.filter(p=>!(team.playingXI??[]).includes(p.id));
    if(bench[0])add('Bench Watch','FAN QUESTION',`Why is ${bench[0].name} waiting for an opportunity?`,`In-game fan debate: ${bench[0].name} is in ${team.name}'s squad but not the currently selected Playing XI. This is fictional fan chatter, not a real-world controversy.`,'FEATURED');
    const captain=players.find(p=>p.id===team.captainId);
    if(captain)add('Press Room','CAPTAIN INTERVIEW',`${team.name} captain ${captain.name}: questions ahead`,`Fictional in-game press conference prompt about team balance, preparation and the next tactical challenge.`);
  });
  const angles=[['Fans','FAN REACTION','supporters discuss the squad balance'],['Press Room','PRESS QUESTION','reporters prepare questions on strategy'],['Experts','PUNDIT VIEW','analysts assess tactical options'],['Dressing Room','TEAM WATCH','preparation and player roles are in focus'],['Rivalries','RIVALRY FILE','supporters revisit the franchise rivalry'],['Captaincy','LEADERSHIP WATCH','leadership decisions are under discussion'],['Championship Race','TROPHY WATCH','the route to the playoffs is being discussed'],['Bench Watch','SELECTION WATCH','reserve options are part of the selection debate'],['Power Rankings','FORM WATCH','upcoming results could reshape the rankings']];
  teams.forEach((team,ti)=>players.slice(0,180).forEach((player,pi)=>[0,1,2].forEach(variant=>{const a=angles[(ti*7+pi+variant*3)%angles.length];add(a[0],`${a[1]} ${variant+1}`,`${team.name} and ${player.name}: ${a[2]}`,`In-game editorial story linking ${player.name} with ${team.name}. Discussion prompt only; verified performance claims come from the season record.`);})));
  return out;
}
function DynastyNews({game}:{game:GameState}){
  const [page,setPage]=useState(0);
  const [paused,setPaused]=useState(false);
  const [selected,setSelected]=useState<DynastyNewsItem|null>(null);
  const news=buildDynastyNews(game);
  // Select three featured stories from three different categories; show exactly one per slide.
  const featured:DynastyNewsItem[]=[];
  const usedCategories=new Set<string>();
  for(const item of news){
    if(usedCategories.has(item.category))continue;
    featured.push(item);usedCategories.add(item.category);
    if(featured.length===3)break;
  }
  useEffect(()=>{
    if(paused||selected||featured.length<2)return;
    const timer=window.setInterval(()=>setPage(current=>(current+1)%featured.length),5000);
    return ()=>window.clearInterval(timer);
  },[paused,selected,featured.length]);
  useEffect(()=>{setPage(0);},[game.fixtures?.filter(f=>f.status==='completed').length]);
  const active=featured[page]??featured[0];
  return <Panel className="dynasty-news-panel" style={{marginTop:18,padding:0,overflow:'hidden'}}>
    <div className="panel-head" style={{padding:'16px 20px 8px',margin:0}}>
      <div><Kicker>DYNASTY MEDIA NETWORK</Kicker><h3>Latest News</h3></div>
      <small style={{fontSize:9,color:'var(--muted)',letterSpacing:'.1em'}}>TOP STORIES</small>
    </div>
    <div onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} style={{padding:'8px 18px 0'}}>
      <div style={{overflow:'hidden',width:'100%',border:'1px solid var(--line)',borderRadius:13,background:'var(--surface-2)',minHeight:160}}>
        <div key={active?.id??page} style={{padding:'20px 22px',minHeight:160,boxSizing:'border-box',display:'flex',flexDirection:'column',justifyContent:'space-between',gap:12,animation:'dynastyNewsSlideIn 550ms ease both'}}>
          {active&&<>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
              <span style={{fontSize:9,letterSpacing:'.13em',fontWeight:900,color:'var(--accent)'}}>{active.tag}</span>
              <span style={{fontSize:9,letterSpacing:'.1em',color:'var(--muted)'}}>{active.priority}</span>
            </div>
            <div><h4 style={{fontSize:19,lineHeight:1.3,margin:'0 0 8px'}}>{active.headline}</h4><p style={{fontSize:12,lineHeight:1.6,color:'var(--muted)',margin:0,maxWidth:900}}>{active.summary}</p></div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
              <small style={{fontSize:9,color:'var(--muted)'}}>Season {game.league.year} · In-game generated</small>
              <button onClick={()=>setSelected(active)} style={{border:0,background:'none',color:'var(--accent)',fontWeight:800,cursor:'pointer',fontSize:10}}>Read story →</button>
            </div>
          </>}
        </div>
      </div>
    </div>
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',gap:9,padding:'13px 0 15px'}}>
      {[0,1,2].map(dot=><button key={dot} aria-label={`Show news ${dot+1}`} onClick={()=>setPage(dot%Math.max(1,featured.length))} style={{width:page===dot?19:7,height:7,border:0,borderRadius:99,padding:0,background:page===dot?'var(--accent)':'var(--muted)',opacity:page===dot?1:.5,cursor:'pointer',transition:'all 200ms'}}/>)}
    </div>
    {selected&&<div onClick={()=>setSelected(null)} style={{position:'fixed',inset:0,zIndex:3000,background:'#000b',display:'grid',placeItems:'center',padding:18}}><section onClick={e=>e.stopPropagation()} style={{width:'min(620px,100%)',maxHeight:'80vh',overflow:'auto',background:'var(--surface)',border:'1px solid var(--line)',borderRadius:18,padding:22}}><div className="panel-head"><div><Kicker>{selected.tag} · {selected.priority}</Kicker><h3>{selected.headline}</h3></div><button className="text-button" onClick={()=>setSelected(null)}>Close ×</button></div><p style={{lineHeight:1.7,color:'var(--muted)'}}>{selected.summary}</p><small style={{color:'var(--muted)'}}>Fictional in-game editorial coverage. Verified match facts come from the season record.</small></section></div>}
    <style>{`@keyframes dynastyNewsSlideIn{from{opacity:0;transform:translateX(28px)}to{opacity:1;transform:translateX(0)}}`}</style>
  </Panel>;
}

function TournamentDashboard({game,setScreen}:{game:GameState;setScreen:(s:any)=>void}){
  ensureFixtureCalendar(game);
  const completed=game.fixtures.filter(f=>f.status==='completed');const upcoming=game.fixtures.filter(f=>f.status==='scheduled').sort((a,b)=>a.round-b.round).slice(0,4);const live=game.fixtures.filter(f=>f.status==='live');const teams=tournamentSorted(game);const stats=game.records.seasonStats??{};const statsFor=(p:Player)=>stats[p.id]??emptySeasonStats();
  const byRuns=[...game.players].map(p=>({p,s:statsFor(p)})).filter(x=>x.s.runs>0).sort((a,b)=>b.s.runs-a.s.runs||b.s.fours-a.s.fours);const byWickets=[...game.players].map(p=>({p,s:statsFor(p)})).filter(x=>x.s.wickets>0).sort((a,b)=>b.s.wickets-a.s.wickets||a.s.runsConceded-b.s.runsConceded);const bySR=[...game.players].map(p=>({p,s:statsFor(p)})).filter(x=>x.s.balls>=10).sort((a,b)=>(b.s.runs/b.s.balls)-(a.s.runs/a.s.balls));const byEcon=[...game.players].map(p=>({p,s:statsFor(p)})).filter(x=>x.s.ballsBowled>=6).sort((a,b)=>(a.s.runsConceded*6/a.s.ballsBowled)-(b.s.runsConceded*6/b.s.ballsBowled));const byCatches=[...game.players].map(p=>({p,s:statsFor(p)})).filter(x=>x.s.catches>0).sort((a,b)=>b.s.catches-a.s.catches);
  const leader=(items:{p:Player;s:SeasonPlayerStats}[])=>(items[0]?.p.name??'—');
  const playoffCount=Math.min(4,teams.length);const nextRound=upcoming[0]?.round??Math.max(1,...game.fixtures.map(f=>f.round));
  const nextMatch=upcoming[0];
  const nextHome=nextMatch?game.teams.find(t=>t.id===nextMatch.homeTeamId):undefined;
  const nextAway=nextMatch?game.teams.find(t=>t.id===nextMatch.awayTeamId):undefined;
  const headToHead=nextMatch&&nextHome&&nextAway?(()=>{
    // Use the save's actual fixture ledger, not only the pre-filtered dashboard list.
    // Some imported saves retain the result fields even when their status label differs.
    const history=game.fixtures.filter(f=>f.status==='completed'||Boolean(f.winnerTeamId)||(
      f.status!=='scheduled'&&typeof f.homeRuns==='number'&&typeof f.awayRuns==='number'&&
      (f.homeRuns??0)>0||(f.awayRuns??0)>0||(f.homeWickets??0)>0||(f.awayWickets??0)>0
    ));
    const meetings=history.filter(f=>(f.homeTeamId===nextHome.id&&f.awayTeamId===nextAway.id)||(f.homeTeamId===nextAway.id&&f.awayTeamId===nextHome.id));
    let homeWins=0,awayWins=0,close=0,ties=0;
    for(const f of meetings){
      if(f.winnerTeamId===nextHome.id)homeWins++;
      else if(f.winnerTeamId===nextAway.id)awayWins++;
      else ties++;
      const result=(f.resultText??'').toLowerCase();
      const runMargin=Number(result.match(/(\d+)\s*runs?/)?.[1]??Infinity);
      const wicketMargin=Number(result.match(/(\d+)\s*wickets?/)?.[1]??Infinity);
      const scoreMargin=typeof f.homeRuns==='number'&&typeof f.awayRuns==='number'?Math.abs(f.homeRuns-f.awayRuns):Infinity;
      if(!f.winnerTeamId||runMargin<=10||wicketMargin<=2||scoreMargin<=10)close++;
    }
    const played=meetings.length,closeRate=played?close/played:0,winGap=Math.abs(homeWins-awayWins);
    let title='NO PREVIOUS MEETINGS',tone='new';
    if(played===1)title='FIRST CHAPTER';
    else if(played>=2&&played<4)title='EMERGING RIVALRY';
    if(played>=3&&close>=1)title='COMPETITIVE RIVALRY';
    if(played>=4&&closeRate>=.4)title='FIERCE RIVALRY';
    if(played>=5&&close>=2)title='ARCH-RIVALRY';
    if(played>=6&&close>=3&&winGap<=2)title='BITTER RIVALRY';
    if(played>=4&&closeRate>=.6){tone='hot';if(title==='COMPETITIVE RIVALRY')title='FIERCE RIVALRY';}
    if(title==='BITTER RIVALRY'||title==='ARCH-RIVALRY')tone='hot';
    return {played,homeWins,awayWins,close,ties,title,tone};
  })():undefined;
  const launchNextMatch=()=>{
    if(!nextMatch)return;
    if(game.liveMatch&&game.liveMatch.status!=='completed'&&game.liveMatch.fixtureId!==nextMatch.id){setScreen('season');return;}
    const home=game.teams.find(t=>t.id===nextMatch.homeTeamId)!;const away=game.teams.find(t=>t.id===nextMatch.awayTeamId)!;
    const unconfirmed=[home,away].find(t=>t.kind==='human'&&(t.playingXI?.length??0)!==11);
    if(unconfirmed){window.alert(`${unconfirmed.name}: confirm 11 players in Squad & XI before starting this fixture.`);setScreen('squads');return;}
    if(!game.liveMatch||game.liveMatch.fixtureId!==nextMatch.id)prepareMatch(game,nextMatch);setGame({...game});setScreen('season');
  };
  return <div className="page tournament-page"><PageHead kicker="LEAGUE OPERATIONS" title={game.league.name} sub={`${game.league.year} · ${game.league.format} · Fixtures, standings, qualification pressure and season leaders in one command view.`} action={<Button primary onClick={()=>setScreen('fixtures')}><CalendarDays size={16}/> Full fixture list</Button>}/>
    {nextMatch&&nextHome&&nextAway&&headToHead&&<Panel className={`next-match-hero rivalry-hero ${headToHead.tone==='hot'?'rivalry-hot':''}`}><div className="next-match-meta"><Kicker>NEXT PLAYABLE FIXTURE</Kicker><span>{nextMatch.label??`Round ${nextMatch.round}`} · {game.league.format}</span></div><div className="next-match-teams rivalry-teams"><div className="next-match-team rivalry-team rivalry-home"><Crest team={nextHome} size={62}/><div><b>{nextHome.name}</b><small>HOME · {nextHome.ground}</small></div></div><div className="rivalry-center"><span className="rivalry-kicker">HEAD TO HEAD</span><div className="rivalry-score"><b>{headToHead.homeWins}</b><span>–</span><b>{headToHead.awayWins}</b></div><small>{headToHead.played} MATCHES PLAYED</small></div><div className="next-match-team away rivalry-team rivalry-away"><Crest team={nextAway} size={62}/><div><b>{nextAway.name}</b><small>AWAY · {nextAway.manager}</small></div></div></div><div className="rivalry-footer"><div className="rivalry-tagline">{headToHead.tone==='hot'&&<Flame size={15} fill="currentColor"/>}<strong>{headToHead.title}</strong>{headToHead.tone==='hot'&&<Flame size={15} fill="currentColor"/>}</div><div className="rivalry-facts"><span><b>{headToHead.close}</b> close matches</span><span><b>{headToHead.ties}</b> tied / no-result</span></div></div><div className="next-match-actions"><Button ghost onClick={()=>setScreen('squads')}><Users size={15}/> View / Confirm XI</Button><Button primary onClick={launchNextMatch}><Play size={15}/> Start Match <ArrowRight size={15}/></Button></div><style>{`@keyframes rivalryHomeIn{from{opacity:0;transform:translateX(-42px)}to{opacity:1;transform:translateX(0)}}@keyframes rivalryAwayIn{from{opacity:0;transform:translateX(42px)}to{opacity:1;transform:translateX(0)}}@keyframes rivalryCenterIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}.rivalry-home{animation:rivalryHomeIn 650ms cubic-bezier(.2,.75,.25,1) both}.rivalry-away{animation:rivalryAwayIn 650ms cubic-bezier(.2,.75,.25,1) both}.rivalry-center{animation:rivalryCenterIn 700ms 120ms ease both}.rivalry-teams{display:grid!important;grid-template-columns:minmax(0,1fr) 170px minmax(0,1fr);align-items:center;gap:18px}.rivalry-home{justify-content:flex-start}.rivalry-away{justify-content:flex-end;text-align:right}.rivalry-center{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px;min-width:0;width:100%;padding:0 8px;position:relative;z-index:1}.rivalry-kicker{font-size:9px;letter-spacing:.16em;color:var(--muted);font-weight:900}.rivalry-score{display:flex;align-items:center;gap:12px;font-size:31px;line-height:1;font-weight:950}.rivalry-score span{font-size:19px;color:var(--muted)}.rivalry-center>small{font-size:8px;letter-spacing:.12em;color:var(--muted)}.rivalry-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:4px 0 14px;padding:11px 13px;border:1px solid var(--line);border-radius:11px;background:var(--surface-2)}.rivalry-tagline,.rivalry-facts{display:flex;align-items:center;gap:8px}.rivalry-tagline{font-size:10px;letter-spacing:.1em;font-weight:950}.rivalry-hot .rivalry-tagline{color:#ff754d}.rivalry-facts{font-size:10px;color:var(--muted)}.rivalry-facts b{color:var(--text);font-size:12px}.rivalry-hot{border-color:#ff754d66;box-shadow:0 0 26px #ff754d12}@media(max-width:650px){.rivalry-teams{grid-template-columns:minmax(0,1fr) 88px minmax(0,1fr);gap:6px}.rivalry-center{min-width:0;padding:0 2px}.rivalry-score{font-size:23px;gap:6px}.rivalry-team{min-width:0}.rivalry-team b{font-size:11px}.rivalry-footer{align-items:flex-start;flex-direction:column}}@media(prefers-reduced-motion:reduce){.rivalry-home,.rivalry-away,.rivalry-center{animation:none}}`}</style></Panel>}
    <DynastyNews game={game}/>
    {game.phase==='completed'&&<Panel className="season-finished-banner"><div><Kicker>SEASON COMPLETE</Kicker><h3>The final is complete. Your career can move into the offseason.</h3><p>Review the champion, archive the season and manage retention, release and RTM cards for the next auction.</p></div><Button primary onClick={()=>setScreen('offseason')}>Season transition <ArrowRight size={16}/></Button></Panel>}
    <div className="tournament-hero"><div><span className="eyebrow">SEASON STATUS</span><h2>{completed.length===game.fixtures.length?'League phase complete':live.length?'Matchday live':`Round ${Math.min(nextRound,Math.max(1,...game.fixtures.map(f=>f.round)))} in focus`}</h2><p>{completed.length} completed · {game.fixtures.length-completed.length} remaining · {game.teams.length} franchises</p><div className="tournament-progress"><i style={{width:`${game.fixtures.length?completed.length/game.fixtures.length*100:0}%`}}/></div></div><div className="tournament-season-mark"><Trophy size={31}/><b>{Math.min(playoffCount,4)} playoff places</b><small>Top {playoffCount} qualify provisionally</small></div></div>
    <div className="stats-grid four tournament-kpis"><Stat label="Played" value={`${completed.length}/${game.fixtures.length}`} sub="completed fixtures"/><Stat label="Live matches" value={live.length} sub="currently active"/><Stat label="Top of table" value={teams[0]?.code??'—'} sub={teams[0]?.name??'No leader yet'}/><Stat label="Points to chase" value={teams[0]?.record.points??0} sub="current league leader"/></div>
    <div className="tournament-main-grid"><Panel className="tournament-table-panel"><div className="panel-head"><div><Kicker>OFFICIAL STANDINGS</Kicker><h3>Points table</h3><p>Points → net run rate → wins are the tie-break order.</p></div><Button ghost onClick={()=>setScreen('fixtures')}>Fixtures <ArrowRight size={14}/></Button></div><div className="tournament-standings-wrap"><div className="tournament-standings"><div className="tournament-standing-head"><span>#</span><span>FRANCHISE</span><span>P</span><span>W</span><span>L</span><span>NR</span><span>PTS</span><span>NRR</span><span>FORM</span></div>{teams.map((t,i)=><div className={`tournament-standing-row ${i<playoffCount?'qualifying':''} ${i===playoffCount-1?'cut-line':''}`} key={t.id}><span>{i+1}</span><div className="tournament-standing-team"><Crest team={t} size={30}/><div><b>{t.code}</b><small>{t.name}</small></div></div><span>{t.record.played}</span><span>{t.record.won}</span><span>{t.record.lost}</span><span>{t.record.nr}</span><strong>{t.record.points}</strong><span className={t.record.netRunRate>=0?'nrr-positive':'nrr-negative'}>{t.record.netRunRate.toFixed(3)}</span><div className="form-badges">{[...t.record.lastFive].slice(-5).map((v,j)=><b key={j} className={v==='W'?'win':v==='L'?'loss':'neutral'}>{v}</b>)}</div></div>)}</div></div><div className="qualification-foot"><span><i className="qual-dot"/> Provisional playoff zone</span><span>Positions update after every completed match.</span></div></Panel>
      <div className="tournament-side-stack"><Panel><div className="panel-head"><div><Kicker>NEXT UP</Kicker><h3>Upcoming fixtures</h3></div><CalendarDays size={18}/></div>{upcoming.length?upcoming.map(f=><div className="hub-fixture" key={f.id}><span>{f.label??`R${String(f.round).padStart(2,'0')}`}</span><div><b>{game.teams.find(t=>t.id===f.homeTeamId)?.code} <small>vs</small> {game.teams.find(t=>t.id===f.awayTeamId)?.code}</b><small>{f.venue??game.teams.find(t=>t.id===f.homeTeamId)?.ground}</small></div><button onClick={()=>setScreen('fixtures')}>View</button></div>):<div className="empty-state">No scheduled matches remain.</div>}<Button primary onClick={()=>setScreen('fixtures')}>Open fixture desk <ArrowRight size={15}/></Button></Panel>
      <Panel><div className="panel-head"><div><Kicker>SEASON CAPS</Kicker><h3>Current leaders</h3></div><Trophy size={18}/></div><div className="cap-mini-row"><span className="cap-chip orange">ORANGE CAP</span><div><b>{leader(byRuns)}</b><small>{byRuns[0]?.s.runs??0} runs</small></div></div><div className="cap-mini-row"><span className="cap-chip purple">PURPLE CAP</span><div><b>{leader(byWickets)}</b><small>{byWickets[0]?.s.wickets??0} wickets</small></div></div><div className="cap-mini-row"><span className="cap-chip blue">STRIKE RATE</span><div><b>{leader(bySR)}</b><small>{bySR[0]?((bySR[0].s.runs/bySR[0].s.balls)*100).toFixed(1):'—'}</small></div></div><div className="cap-mini-row"><span className="cap-chip green">ECONOMY</span><div><b>{leader(byEcon)}</b><small>{byEcon[0]?(byEcon[0].s.runsConceded*6/byEcon[0].s.ballsBowled).toFixed(2):'—'}</small></div></div><Button ghost onClick={()=>setScreen('records')}>All leaderboards <ArrowRight size={14}/></Button></Panel></div>
    </div>
    <Panel><div className="panel-head"><div><Kicker>RECENT RESULTS</Kicker><h3>Completed matches</h3></div><Button ghost onClick={()=>setScreen('fixtures')}>All results <ArrowRight size={14}/></Button></div>{completed.length?<div className="recent-result-grid">{[...completed].sort((a,b)=>b.round-a.round).slice(0,4).map(f=><div className="recent-result-card" key={f.id}><span>ROUND {String(f.round).padStart(2,'0')}</span><div><b>{game.teams.find(t=>t.id===f.homeTeamId)?.code}</b><strong>{f.homeRuns??0}/{f.homeWickets??'—'}</strong></div><div><b>{game.teams.find(t=>t.id===f.awayTeamId)?.code}</b><strong>{f.awayRuns??0}/{f.awayWickets??'—'}</strong></div><small>{f.resultText??(f.winnerTeamId?`${game.teams.find(t=>t.id===f.winnerTeamId)?.name} won`:'Match complete')}</small></div>)}</div>:<div className="empty-state">Results and standings populate when live matches finish.</div>}</Panel>
  </div>;
}

function Records({game}:{game:GameState}){
  const [teamId,setTeamId]=useState(game.activeTeamId);const [category,setCategory]=useState<'batting'|'bowling'|'fielding'>('batting');const [profilePlayerId,setProfilePlayerId]=useState(game.players[0]?.id??'');
  const [allTimeMetric,setAllTimeMetric]=useState<'runs'|'wickets'|'sixes'|'fours'|'hundreds'|'fifties'|'average'|'strikeRate'|'catches'|'stumpings'|'runOuts'>('runs');
  const [allTimeSearch,setAllTimeSearch]=useState('');
  const profilePlayer=game.players.find(p=>p.id===profilePlayerId)??game.players[0];const profileHistory=[...(profilePlayer?.matchHistory??[])].sort((a,b)=>new Date(b.date).getTime()-new Date(a.date).getTime());
  const team=game.teams.find(t=>t.id===teamId)??game.teams[0];const squad=team.playerIds.map(id=>game.players.find(p=>p.id===id)).filter(Boolean) as Player[];const stats=game.records.seasonStats??{};const row=(p:Player)=>stats[p.id]??emptySeasonStats();
  const playerList=game.players.map(p=>({p,s:row(p)}));
  const runLeaders=[...playerList].filter(x=>x.s.runs>0).sort((a,b)=>b.s.runs-a.s.runs||b.s.fours-a.s.fours).slice(0,10);
  const wicketLeaders=[...playerList].filter(x=>x.s.wickets>0).sort((a,b)=>b.s.wickets-a.s.wickets||a.s.runsConceded-b.s.runsConceded).slice(0,10);
  const srLeaders=playerList.filter(x=>x.s.balls>=10).sort((a,b)=>(b.s.runs/b.s.balls)-(a.s.runs/a.s.balls)).slice(0,10);
  const economyLeaders=playerList.filter(x=>x.s.ballsBowled>=6).sort((a,b)=>(a.s.runsConceded*6/a.s.ballsBowled)-(b.s.runsConceded*6/b.s.ballsBowled)).slice(0,10);
  const averageLeaders=playerList.filter(x=>x.s.runs>0&&x.s.innings-x.s.notOuts>0&&x.s.innings>=1).sort((a,b)=>(b.s.runs/(b.s.innings-b.s.notOuts))-(a.s.runs/(a.s.innings-a.s.notOuts))).slice(0,10);
  const sixLeaders=[...playerList].filter(x=>x.s.sixes>0).sort((a,b)=>b.s.sixes-a.s.sixes).slice(0,10);const fourLeaders=[...playerList].filter(x=>x.s.fours>0).sort((a,b)=>b.s.fours-a.s.fours).slice(0,10);const catchLeaders=[...playerList].filter(x=>x.s.catches>0).sort((a,b)=>b.s.catches-a.s.catches).slice(0,10);const stumpingLeaders=[...playerList].filter(x=>x.s.stumpings>0).sort((a,b)=>b.s.stumpings-a.s.stumpings).slice(0,10);const runoutLeaders=[...playerList].filter(x=>x.s.runOuts>0).sort((a,b)=>b.s.runOuts-a.s.runOuts).slice(0,10);const dotLeaders=[...playerList].filter(x=>x.s.ballsBowled>0).sort((a,b)=>b.s.dotBalls-a.s.dotBalls).slice(0,10);const maidenLeaders=[...playerList].filter(x=>x.s.maidens>0).sort((a,b)=>b.s.maidens-a.s.maidens).slice(0,10);const threeHaulLeaders=[...playerList].filter(x=>x.s.threeWicketHauls>0).sort((a,b)=>b.s.threeWicketHauls-a.s.threeWicketHauls).slice(0,10);const fiveHaulLeaders=[...playerList].filter(x=>x.s.fiveWicketHauls>0).sort((a,b)=>b.s.fiveWicketHauls-a.s.fiveWicketHauls).slice(0,10);const bestFiguresLeaders=[...playerList].filter(x=>x.s.bestWickets>0).sort((a,b)=>b.s.bestWickets-a.s.bestWickets||a.s.bestBowlingRuns-b.s.bestBowlingRuns).slice(0,10);const highScoreLeaders=[...playerList].filter(x=>x.s.highest>0).sort((a,b)=>b.s.highest-a.s.highest).slice(0,10);
  const archivedSeasons=game.seasonArchives??[];
  const historicalFixtures=[...archivedSeasons.flatMap(x=>x.fixtures??[]),...game.fixtures];
  const historicalTeamRows=game.teams.map(t=>({team:t,seasons:archivedSeasons.filter(x=>x.standings.some(s=>s.teamId===t.id)),titles:archivedSeasons.filter(x=>x.championId===t.id).length,playoffs:archivedSeasons.filter(season=>(season.fixtures??[]).some(f=>f.stage&&f.stage!=='league'&&(f.homeTeamId===t.id||f.awayTeamId===t.id))).length,wins:archivedSeasons.reduce((n,x)=>n+(x.standings.find(s=>s.teamId===t.id)?.won??0),0),losses:archivedSeasons.reduce((n,x)=>n+(x.standings.find(s=>s.teamId===t.id)?.lost??0),0)})).sort((a,b)=>b.titles-a.titles||b.wins-a.wins);
  const venueRows=Object.entries(historicalFixtures.filter(f=>f.status==='completed'&&f.venue).reduce((acc,f)=>{const key=f.venue||'Unknown venue';const row=acc[key]??{venue:key,matches:0,homeWins:0,awayWins:0,highestScore:0,highestMatch:''};row.matches++;if(f.winnerTeamId===f.homeTeamId)row.homeWins++;if(f.winnerTeamId===f.awayTeamId)row.awayWins++;const high=Math.max(f.homeRuns??0,f.awayRuns??0);if(high>row.highestScore){row.highestScore=high;row.highestMatch=`${f.homeRuns??0}–${f.awayRuns??0}
.player-profile-trigger{width:32px;height:32px;min-width:32px;border:1px solid rgba(150,170,195,.28);border-radius:9px;background:rgba(255,255,255,.045);color:#dce6f2;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;font-size:17px;line-height:1;transition:.18s ease;flex-shrink:0}.player-profile-trigger:hover{background:rgba(80,150,255,.16);border-color:#69a8ff;color:#fff;transform:translateY(-1px)}.player-profile-backdrop{position:fixed;inset:0;z-index:9999;background:rgba(3,8,16,.78);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:22px}.player-profile-modal{width:min(980px,100%);max-height:min(90vh,900px);overflow:hidden;background:#101722;border:1px solid rgba(150,175,205,.22);border-radius:20px;box-shadow:0 28px 90px rgba(0,0,0,.55);color:#edf3fb;display:flex;flex-direction:column}.player-profile-modal-head{padding:22px 26px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(150,175,205,.16);background:linear-gradient(120deg,rgba(45,91,150,.22),transparent 65%)}.player-profile-identity{display:flex;align-items:center;gap:16px}.player-profile-avatar{width:58px;height:58px;border-radius:16px;background:linear-gradient(145deg,#263b57,#172334);display:grid;place-items:center;font-size:26px;font-weight:800;border:1px solid rgba(150,175,205,.24)}.player-profile-modal-head h2{font-size:25px;margin:3px 0}.player-profile-modal-head p,.player-profile-modal-head small{margin:2px 0;color:#aab8ca;font-size:12px}.player-profile-close{width:36px;height:36px;border:1px solid rgba(150,175,205,.24);border-radius:10px;background:rgba(255,255,255,.06);color:#fff;font-size:25px;cursor:pointer}.player-profile-body{overflow:auto;padding:22px 26px 28px}.player-profile-section-title{font-size:10px;font-weight:800;letter-spacing:.15em;color:#8fa8c8;margin:20px 0 10px}.player-profile-section-title:first-child{margin-top:0}.player-profile-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}.player-profile-metrics>div{min-width:0;padding:12px 13px;border:1px solid rgba(150,175,205,.14);border-radius:12px;background:rgba(255,255,255,.035)}.player-profile-metrics small{display:block;color:#8fa0b5;font-size:9px;letter-spacing:.09em;font-weight:700}.player-profile-metrics b{display:block;margin-top:5px;font-size:19px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.player-profile-table-wrap{overflow-x:auto;border:1px solid rgba(150,175,205,.16);border-radius:12px}.player-profile-table{width:100%;border-collapse:collapse;white-space:nowrap;font-size:12px}.player-profile-table th,.player-profile-table td{padding:12px 13px;text-align:right;border-bottom:1px solid rgba(150,175,205,.12)}.player-profile-table th:first-child,.player-profile-table td:first-child{text-align:left}.player-profile-table th{color:#9db0c8;font-size:9px;letter-spacing:.08em;background:rgba(255,255,255,.035)}.player-profile-empty{padding:15px;border:1px dashed rgba(150,175,205,.24);border-radius:12px;color:#aab8ca;font-size:12px}.player-profile-attributes{display:flex;gap:9px;flex-wrap:wrap}.player-profile-attributes span{padding:9px 12px;border-radius:9px;background:rgba(255,255,255,.045);border:1px solid rgba(150,175,205,.13);font-size:11px;color:#aebed1}.player-profile-attributes b{color:#fff;margin-left:5px}@media(max-width:650px){.player-profile-backdrop{padding:8px}.player-profile-modal{max-height:94vh;border-radius:14px}.player-profile-modal-head{padding:16px}.player-profile-body{padding:16px}.player-profile-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.player-profile-modal-head h2{font-size:20px}.player-profile-avatar{width:48px;height:48px}}
`;}acc[key]=row;return acc;},{} as Record<string,{venue:string;matches:number;homeWins:number;awayWins:number;highestScore:number;highestMatch:string}>)).map(([,v])=>v).sort((x,y)=>y.matches-x.matches||y.highestScore-x.highestScore);
  const playerSeasonRows=(profilePlayer?.matchHistory??[]).reduce((acc,h)=>{const y=String(h.season);const v=acc[y]??{season:h.season,matches:0,runs:0,balls:0,fours:0,sixes:0,wickets:0,conceded:0,ballsBowled:0,catches:0};v.matches++;v.runs+=h.batting.runs;v.balls+=h.batting.balls;v.fours+=h.batting.fours;v.sixes+=h.batting.sixes;v.wickets+=h.bowling.wickets;v.conceded+=h.bowling.runsConceded;v.ballsBowled+=h.bowling.balls;v.catches+=h.fielding.catches;acc[y]=v;return acc;},{} as Record<string,{season:number;matches:number;runs:number;balls:number;fours:number;sixes:number;wickets:number;conceded:number;ballsBowled:number;catches:number}>);
  const playerSeasonList=Object.values(playerSeasonRows).sort((x,y)=>y.season-x.season);
  // Career rankings use the player's persisted career totals, not the current-season cap table.
  const careerMetric=(p:Player)=>{const c=p.career;switch(allTimeMetric){case 'runs':return c.runs??0;case 'wickets':return c.wickets??0;case 'sixes':return c.sixes??0;case 'fours':return c.fours??0;case 'hundreds':return c.hundreds??0;case 'fifties':return c.fifties??0;case 'average':return c.avg??0;case 'strikeRate':return c.sr??0;case 'catches':return c.catches??0;case 'stumpings':return c.stumpings??0;case 'runOuts':return c.runOuts??0;}return 0;};
  const careerSorted=[...game.players].filter(p=>careerMetric(p)>0).sort((a,b)=>careerMetric(b)-careerMetric(a)||b.career.matches-a.career.matches||a.name.localeCompare(b.name));
  const careerTop50=careerSorted.slice(0,50);
  const careerSearchRows=[...game.players].filter(p=>!allTimeSearch.trim()||p.name.toLowerCase().includes(allTimeSearch.toLowerCase())||p.nationality.toLowerCase().includes(allTimeSearch.toLowerCase())).sort((a,b)=>careerMetric(b)-careerMetric(a)||a.name.localeCompare(b.name));
  const titleOverrides=(t:Team)=>{const n=`${t.name} ${t.code}`.toLowerCase();if(n.includes('comet')||n.includes('com'))return 3;if(n.includes('titan')||n.includes('tit'))return 1;if(n.includes('gladiator')||n.includes('gld'))return 1;if(n.includes('scorpion')||n.includes('scp'))return 1;if(n.includes('leopard')||n.includes('lep'))return 1;return archivedSeasons.filter(a=>a.championId===t.id).length;};
  const matchById=new Map<string,NonNullable<Player['matchHistory']>[number]>();for(const p of game.players)for(const h of p.matchHistory??[])if(h.fixtureId&&!matchById.has(h.fixtureId))matchById.set(h.fixtureId,h);
  const h2hRows=game.teams.flatMap((a,i)=>game.teams.slice(i+1).map(b=>{const matches=[...matchById.values()].filter(h=>(h.teamId===a.id&&h.opponentId===b.id)||(h.teamId===b.id&&h.opponentId===a.id));const aWins=matches.filter(h=>h.teamId===a.id&&h.result==='win'||h.teamId===b.id&&h.opponentId===a.id&&h.result==='loss').length;const bWins=matches.filter(h=>h.teamId===b.id&&h.result==='win'||h.teamId===a.id&&h.opponentId===b.id&&h.result==='loss').length;const ties=matches.filter(h=>h.result==='tie').length;return {a,b,played:matches.length,aWins,bWins,ties};}));
  const careerMetricLabel:Record<typeof allTimeMetric,string>={runs:'Runs',wickets:'Wickets',sixes:'Sixes',fours:'Fours',hundreds:'100s',fifties:'50s',average:'Average',strikeRate:'Strike rate',catches:'Catches',stumpings:'Stumpings',runOuts:'Run-outs'};
  const teamScoreRows=game.teams.map(t=>{const fixtures=historicalFixtures.filter(f=>f.status==='completed'&&(f.homeTeamId===t.id||f.awayTeamId===t.id));const scores=fixtures.map(f=>f.homeTeamId===t.id?(f.homeRuns??0):(f.awayRuns??0));const high=scores.length?Math.max(...scores):0;const over200=scores.filter(v=>v>=200).length;const chase200=fixtures.filter(f=>{const winner=f.winnerTeamId===t.id;const own=f.homeTeamId===t.id?(f.homeRuns??0):(f.awayRuns??0);const other=f.homeTeamId===t.id?(f.awayRuns??0):(f.homeRuns??0);return winner&&own>=200&&other>=199&&/wicket/i.test(f.resultText??'')}).length;const defendUnder200=fixtures.filter(f=>{const winner=f.winnerTeamId===t.id;const own=f.homeTeamId===t.id?(f.homeRuns??0):(f.awayRuns??0);return winner&&own<200&&/run/i.test(f.resultText??'')}).length;return {team:t,fixtures:fixtures.length,over200,high,chase200,defendUnder200};});
  const formatCareerMetric=(p:Player)=>{const v=careerMetric(p);return allTimeMetric==='average'||allTimeMetric==='strikeRate'?v.toFixed(2):v.toLocaleString()};

  const LeaderTable=({title,subtitle,rows,metric}:{title:string;subtitle:string;rows:{p:Player;s:SeasonPlayerStats}[];metric:(s:SeasonPlayerStats)=>string|number})=><Panel><div className="panel-head"><div><Kicker>SEASON LEADERBOARD</Kicker><h3>{title}</h3><p>{subtitle}</p></div></div><div className="leader-table"><div className="leader-head"><span>#</span><span>PLAYER</span><span>TEAM</span><span>VALUE</span></div>{rows.length?rows.map((x,i)=><div className="leader-row" key={x.p.id}><span>{i+1}</span><div className="leader-player"><b>{x.p.name}</b><small>{x.p.nationality} · {x.p.role}</small></div><span>{game.teams.find(t=>t.playerIds.includes(x.p.id))?.code??'—'}</span><strong>{metric(x.s)}</strong></div>):<div className="empty-state">No qualifying performances yet. Complete matches to populate the leaderboard.</div>}</div></Panel>;
  return <div className="page records-page"><PageHead kicker="RECORD BOOK" title="Every performance counts." sub="Career rankings use saved player career totals across all recorded seasons. Season leaderboards remain separate below." action={<Select label="Franchise record" value={teamId} onChange={e=>setTeamId(e.target.value)}>{game.teams.map(t=><option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</Select>}/>
    <Panel className="career-records-panel"><div className="panel-head"><div><Kicker>ALL-TIME CAREER RECORDS</Kicker><h3>Career leaderboard · Top 50</h3><p>Ranked from each player's saved career totals, across all recorded seasons. Current-season statistics are not substituted for career totals.</p></div><Select label="Career category" value={allTimeMetric} onChange={e=>setAllTimeMetric(e.target.value as typeof allTimeMetric)}>{Object.entries(careerMetricLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</Select></div><div className="leader-table"><div className="leader-head"><span>RANK</span><span>PLAYER</span><span>CAREER MATCHES</span><span>{careerMetricLabel[allTimeMetric].toUpperCase()}</span></div>{careerTop50.length?careerTop50.map((p,i)=><div className="leader-row" key={p.id}><span>{i+1}</span><div className="leader-player"><b>{p.name}</b><small>{p.nationality} · {p.role} · {p.overall} OVR</small></div><span>{p.career.matches}</span><strong>{formatCareerMetric(p)}</strong></div>):<div className="empty-state">Career rankings will populate as player career records are saved.</div>}</div><div className="unsold-toolbar"><Field label="Search complete player database" placeholder="Search player or country" value={allTimeSearch} onChange={e=>setAllTimeSearch(e.target.value)}/><span className="muted">{careerSearchRows.length} players · sorted by {careerMetricLabel[allTimeMetric].toLowerCase()}</span></div><div className="leader-table"><div className="leader-head"><span>RANK</span><span>PLAYER</span><span>MATCHES</span><span>{careerMetricLabel[allTimeMetric].toUpperCase()}</span></div>{careerSearchRows.map((p,i)=><div className="leader-row" key={p.id}><span>{i+1}</span><div className="leader-player"><b>{p.name}</b><small>{p.nationality} · {p.role}</small></div><span>{p.career.matches}</span><strong>{formatCareerMetric(p)}</strong></div>)}</div></Panel>
    <Panel><div className="panel-head"><div><Kicker>FRANCHISE HEAD-TO-HEAD</Kicker><h3>Every team versus every team</h3><p>Win-loss totals reconstructed from saved player match histories. Matches without a saved player result are not counted.</p></div></div><div className="leader-table"><div className="leader-head"><span>TEAM A</span><span>TEAM B</span><span>MATCHES</span><span>A W-L-T B</span></div>{h2hRows.map((r,i)=><div className="leader-row" key={`${r.a.id}-${r.b.id}`}><b>{r.a.name}</b><b>{r.b.name}</b><span>{r.played}</span><strong>{r.aWins}-{r.bWins}-{r.ties}</strong></div>)}</div></Panel>
    <Panel><div className="panel-head"><div><Kicker>TEAM SCORE RECORDS</Kicker><h3>200+ totals, big chases and defences</h3><p>Calculated only from saved completed fixtures. Chase and defence counts require a saved result description identifying wickets or runs.</p></div></div><div className="leader-table"><div className="leader-head"><span>FRANCHISE</span><span>200+ TOTALS</span><span>200+ CHASE WINS</span><span>UNDER-200 DEFENCES</span></div>{teamScoreRows.map(r=><div className="leader-row" key={r.team.id}><b>{r.team.name}</b><span>{r.over200} · highest {r.high||'—'}</span><strong>{r.chase200}</strong><strong>{r.defendUnder200}</strong></div>)}</div></Panel>
    <Panel><div className="panel-head"><div><Kicker>CONFIRMED CHAMPIONSHIP HISTORY</Kicker><h3>Franchise trophy cabinet</h3><p>Title totals include the championship counts you confirmed. Season-by-season champion labels remain based on the saved archive.</p></div></div><div className="leader-table"><div className="leader-head"><span>#</span><span>FRANCHISE</span><span>ARCHIVED CHAMPION SEASONS</span><span>TROPHIES</span></div>{[...game.teams].sort((a,b)=>titleOverrides(b)-titleOverrides(a)||a.name.localeCompare(b.name)).map((t,i)=><div className="leader-row" key={t.id}><span>{i+1}</span><div className="leader-player"><b>{t.name}</b><small>{t.code}</small></div><span>{archivedSeasons.filter(a=>a.championId===t.id).length}</span><strong>{titleOverrides(t)}</strong></div>)}</div></Panel>
    <div className="record-hero"><Crest team={team} size={64}/><div><span className="eyebrow">FRANCHISE RECORD</span><h2>{team.name}</h2><p>{team.code} · {team.manager}</p></div><div className="record-big"><b>{team.record.won}-{team.record.lost}</b><small>{team.record.points} points · NRR {team.record.netRunRate.toFixed(3)}</small></div></div>
    <Panel><div className="panel-head"><div><Kicker>ALL-SEASON FRANCHISE HISTORY</Kicker><h3>Titles, playoff appearances and league record</h3><p>Compiled from completed season archives. Older seasons without archived fixtures can still contribute standings and titles.</p></div></div><div className="leader-table"><div className="leader-head"><span>#</span><span>FRANCHISE</span><span>TITLES / PLAYOFFS</span><span>ARCHIVED W-L</span></div>{historicalTeamRows.map((x,i)=><div className="leader-row" key={x.team.id}><span>{i+1}</span><div className="leader-player"><b>{x.team.name}</b><small>{x.team.code} · {x.seasons.length} archived seasons</small></div><span>{x.titles} titles · {x.playoffs} playoff entries</span><strong>{x.wins}-{x.losses}</strong></div>)}</div></Panel>
    <Panel><div className="panel-head"><div><Kicker>VENUE RECORDS</Kicker><h3>Ground performance index</h3><p>Based only on completed fixtures whose venue was saved in the career.</p></div></div><div className="leader-table"><div className="leader-head"><span>#</span><span>VENUE</span><span>MATCHES · HOME/AWAY WINS</span><span>HIGHEST TEAM SCORE</span></div>{venueRows.length?venueRows.map((v,i)=><div className="leader-row" key={v.venue}><span>{i+1}</span><div className="leader-player"><b>{v.venue}</b><small>Home wins {v.homeWins} · Away wins {v.awayWins}</small></div><span>{v.matches} matches</span><strong>{v.highestScore}</strong></div>):<div className="empty-state">Venue history will populate as completed fixtures are archived. Older seasons without fixture snapshots cannot be reconstructed.</div>}</div></Panel>
    <div className="record-stats-grid"><div className="record-cap-card orange"><span>ORANGE CAP · MOST RUNS</span><b>{runLeaders[0]?.p.name??'—'}</b><strong>{runLeaders[0]?.s.runs??0}</strong></div><div className="record-cap-card purple"><span>PURPLE CAP · MOST WICKETS</span><b>{wicketLeaders[0]?.p.name??'—'}</b><strong>{wicketLeaders[0]?.s.wickets??0}</strong></div><div className="record-cap-card blue"><span>BEST QUALIFIED STRIKE RATE</span><b>{srLeaders[0]?.p.name??'—'}</b><strong>{srLeaders[0]?((srLeaders[0].s.runs/srLeaders[0].s.balls)*100).toFixed(1):'—'}</strong><small>Minimum 10 balls faced</small></div><div className="record-cap-card green"><span>BEST QUALIFIED ECONOMY</span><b>{economyLeaders[0]?.p.name??'—'}</b><strong>{economyLeaders[0]?(economyLeaders[0].s.runsConceded*6/economyLeaders[0].s.ballsBowled).toFixed(2):'—'}</strong><small>Minimum 6 legal balls</small></div></div>
    <div className="record-category-tabs">{(['batting','bowling','fielding'] as const).map(v=><button key={v} className={category===v?'active':''} onClick={()=>setCategory(v)}>{v==='batting'?'Batting leaders':v==='bowling'?'Bowling leaders':'Fielding leaders'}</button>)}</div>
    {category==='batting'&&<div className="record-leader-grid"><LeaderTable title="Orange Cap · Runs" subtitle="Total runs scored this season." rows={runLeaders} metric={s=>s.runs}/><LeaderTable title="Highest strike rate" subtitle="Minimum 10 balls faced." rows={srLeaders} metric={s=>s.balls?(s.runs/s.balls*100).toFixed(1):'—'}/><LeaderTable title="Best batting average" subtitle="Runs per dismissal; not-outs excluded." rows={averageLeaders} metric={s=>(s.runs/Math.max(1,s.innings-s.notOuts)).toFixed(2)}/><LeaderTable title="Most sixes" subtitle="Boundary power leaderboard." rows={sixLeaders} metric={s=>s.sixes}/><LeaderTable title="Most fours" subtitle="Total four-boundaries." rows={fourLeaders} metric={s=>s.fours}/><LeaderTable title="Highest individual score" subtitle="Best single innings." rows={highScoreLeaders} metric={s=>s.highest}/><LeaderTable title="Most half-centuries" subtitle="50+ scores." rows={[...playerList].filter(x=>x.s.fifties>0).sort((a,b)=>b.s.fifties-a.s.fifties).slice(0,10)} metric={s=>s.fifties}/><LeaderTable title="Most centuries" subtitle="100+ scores." rows={[...playerList].filter(x=>x.s.hundreds>0).sort((a,b)=>b.s.hundreds-a.s.hundreds).slice(0,10)} metric={s=>s.hundreds}/></div>}
    {category==='bowling'&&<div className="record-leader-grid"><LeaderTable title="Purple Cap · Wickets" subtitle="Most wickets credited to bowlers." rows={wicketLeaders} metric={s=>s.wickets}/><LeaderTable title="Best economy" subtitle="Minimum 6 legal balls; lower is better." rows={economyLeaders} metric={s=>(s.runsConceded*6/Math.max(1,s.ballsBowled)).toFixed(2)}/><LeaderTable title="Most dot balls" subtitle="Pressure built through scoreless deliveries." rows={dotLeaders} metric={s=>s.dotBalls}/><LeaderTable title="Bowling workload" subtitle="Legal balls bowled in the season." rows={[...playerList].filter(x=>x.s.ballsBowled>0).sort((a,b)=>b.s.ballsBowled-a.s.ballsBowled).slice(0,10)} metric={s=>`${Math.floor(s.ballsBowled/6)}.${s.ballsBowled%6}`}/><LeaderTable title="Best bowling figures" subtitle="Most wickets in one match, then fewest runs." rows={bestFiguresLeaders} metric={s=>`${s.bestWickets}/${s.bestBowlingRuns}`}/><LeaderTable title="Most maiden overs" subtitle="Completed six-ball overs with no runs." rows={maidenLeaders} metric={s=>s.maidens}/><LeaderTable title="Three-wicket hauls" subtitle="Matches with three or more wickets." rows={threeHaulLeaders} metric={s=>s.threeWicketHauls}/><LeaderTable title="Five-wicket hauls" subtitle="Matches with five or more wickets." rows={fiveHaulLeaders} metric={s=>s.fiveWicketHauls}/></div>}
    {category==='fielding'&&<div className="record-leader-grid"><LeaderTable title="Most catches" subtitle="Caught dismissals credited to the fielder." rows={catchLeaders} metric={s=>s.catches}/><LeaderTable title="Most stumpings" subtitle="Wicketkeeper dismissals." rows={stumpingLeaders} metric={s=>s.stumpings}/><LeaderTable title="Most run-outs" subtitle="Direct or assisted run-out credit." rows={runoutLeaders} metric={s=>s.runOuts}/></div>}
    <Panel><div className="panel-head"><div><Kicker>FRANCHISE PLAYER SNAPSHOT</Kicker><h3>{team.name} · season squad stats</h3></div></div><div className="leader-table"><div className="leader-head"><span>#</span><span>PLAYER</span><span>RUNS / WICKETS</span><span>CONDITION</span></div>{squad.length?squad.map((p,i)=>{const st=row(p);return <div className="leader-row" key={p.id}><span>{i+1}</span><div className="leader-player"><b>{p.name}</b><small>{p.role} · {st.matches} matches</small></div><span>{st.runs} R · {st.wickets} W</span><strong>{p.form} form</strong></div>}):<div className="empty-state">This franchise has no players assigned yet.</div>}</div></Panel>
    <Panel className="player-career-panel"><div className="panel-head"><div><Kicker>PLAYER PROFILE & MATCH LOG</Kicker><h3>Career record that follows every player</h3><p>Individual match entries are retained in the career save.</p></div><Select label="Player" value={profilePlayer?.id??''} onChange={e=>setProfilePlayerId(e.target.value)}>{game.players.map(p=><option key={p.id} value={p.id}>{p.name} · {p.nationality}</option>)}</Select></div>{profilePlayer&&<><div className="player-profile-summary"><Crest team={game.teams.find(t=>t.playerIds.includes(profilePlayer.id))??team} size={50}/><div className="player-profile-name"><b>{profilePlayer.name}</b><small>{profilePlayer.nationality} · {profilePlayer.role} · Age {profilePlayer.age}</small><small>Form {profilePlayer.form} · Morale {profilePlayer.morale} · Sharpness {profilePlayer.sharpness}</small></div><div><span>CAREER RUNS</span><strong>{profilePlayer.career.runs}</strong></div><div><span>CAREER WICKETS</span><strong>{profilePlayer.career.wickets}</strong></div><div><span>CAREER SR</span><strong>{profilePlayer.career.sr.toFixed(1)}</strong></div><div><span>CAREER ECON</span><strong>{profilePlayer.career.economy.toFixed(2)}</strong></div></div><h4>Season-by-season career breakdown</h4><div className="leader-table"><div className="leader-head"><span>SEASON</span><span>MATCHES</span><span>RUNS / BOUNDARIES</span><span>WICKETS / ECONOMY</span></div>{playerSeasonList.length?playerSeasonList.map(s=><div className="leader-row" key={s.season}><span>Season {s.season}</span><span>{s.matches}</span><span>{s.runs} runs · {s.fours}×4 · {s.sixes}×6</span><strong>{s.wickets} wkts · {s.ballsBowled?(s.conceded*6/s.ballsBowled).toFixed(2):'—'} econ</strong></div>):<div className="empty-state">No season-by-season match history is available for this player yet.</div>}</div><div className="leader-table player-history-table"><div className="leader-head"><span>DATE / SEASON</span><span>TEAM / OPPONENT</span><span>BATTING</span><span>BOWLING / FIELDING</span></div>{profileHistory.length?profileHistory.map((h,i)=><div className="leader-row" key={`${h.fixtureId}-${i}`}><span>{new Date(h.date).toLocaleDateString()}<small>Season {h.season} · {h.format}</small></span><div className="leader-player"><b>{game.teams.find(t=>t.id===h.teamId)?.code??h.teamId} vs {game.teams.find(t=>t.id===h.opponentId)?.code??h.opponentId}</b><small>{h.result.toUpperCase()}</small></div><span>{h.batting.runs}{h.batting.out?' out':'*'} ({h.batting.balls}) · {h.batting.fours}×4 · {h.batting.sixes}×6</span><span>{h.bowling.wickets}/{h.bowling.runsConceded} · {formatOvers(h.bowling.balls)} ov · {h.fielding.catches} catches · {h.fielding.runOuts} run-outs</span></div>):<div className="empty-state">No completed-match entries yet. Every player's profile begins filling as matches are completed.</div>}</div></>}</Panel>
  </div>;
}

function teamMatchStrength(game:GameState,team:Team):number{
  const xi=team.playingXI?.length?team.playingXI:team.playerIds;
  const players=xi.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>Boolean(p));
  if(!players.length)return 50;
  const batting=players.reduce((v,p)=>v+p.battingRating,0)/players.length;
  const bowling=players.reduce((v,p)=>v+p.bowlingRating,0)/players.length;
  const form=players.reduce((v,p)=>v+p.form,0)/players.length;
  const fitness=players.reduce((v,p)=>v+p.attrs.fitness,0)/players.length;
  return batting*.36+bowling*.36+form*.18+fitness*.10;
}
function simulateSuperOver(game:GameState,home:Team,away:Team){
  const scoreSide=(bat:Team,bowl:Team)=>{
    const batting=teamMatchStrength(game,bat),bowling=teamMatchStrength(game,bowl);
    let runs=0,wickets=0;
    for(let i=0;i<6&&wickets<2;i++){
      const wicketChance=clamp(.075+(bowling-batting)*.0018,.035,.17);
      const r=Math.random();
      if(r<wicketChance){wickets++;continue;}
      const adjusted=r-wicketChance;
      const boundary=Math.random()+Math.max(0,batting-bowling)*.0015;
      if(boundary>.88)runs+=6;else if(boundary>.63)runs+=4;else if(boundary>.36)runs+=2;else if(boundary>.12)runs+=1;
    }
    return runs;
  };
  let homeScore=scoreSide(home,away),awayScore=scoreSide(away,home),extra=0;
  while(homeScore===awayScore&&extra<5){homeScore+=scoreSide(home,away);awayScore+=scoreSide(away,home);extra++;}
  const winner=homeScore===awayScore?(teamMatchStrength(game,home)>=teamMatchStrength(game,away)?home:away):(homeScore>awayScore?home:away);
  return{winner,homeScore,awayScore};
}
function advanceTournamentStages(game:GameState){
  const league=game.fixtures.filter(f=>!f.stage||f.stage==='league');
  if(!league.length||league.some(f=>f.status!=='completed'))return;
  const playoffs=game.fixtures.filter(f=>f.stage&&f.stage!=='league');
  const find=(stage:NonNullable<GameState['fixtures'][number]['stage']>)=>playoffs.find(f=>f.stage===stage);
  const nextRound=Math.max(0,...game.fixtures.map(f=>f.round))+1;
  const ordered=tournamentSorted(game);
  const push=(id:string,stage:NonNullable<GameState['fixtures'][number]['stage']>,label:string,home:Team,away:Team,round:number)=>game.fixtures.push({id,stage,label,round,homeTeamId:home.id,awayTeamId:away.id,status:'scheduled',venue:home.ground});
  const q1=find('qualifier-1'),elim=find('eliminator'),q2=find('qualifier-2'),final=find('final');
  if(!q1&&!elim){if(ordered.length<4)return;push(`playoff-q1-${game.league.year}`,'qualifier-1','Qualifier 1 · 1st vs 2nd',ordered[0],ordered[1],nextRound);push(`playoff-elim-${game.league.year}`,'eliminator','Eliminator · 3rd vs 4th',ordered[2],ordered[3],nextRound+1);game.phase='season';return;}
  if(q1?.status==='completed'&&elim?.status==='completed'&&!q2){const q1Winner=game.teams.find(t=>t.id===q1.winnerTeamId);const elimWinner=game.teams.find(t=>t.id===elim.winnerTeamId);const q1Loser=game.teams.find(t=>t.id===(q1Winner?.id===q1.homeTeamId?q1.awayTeamId:q1.homeTeamId));if(q1Loser&&elimWinner)push(`playoff-q2-${game.league.year}`,'qualifier-2','Qualifier 2 · Qualifier loser vs Eliminator winner',q1Loser,elimWinner,nextRound);game.phase='season';return;}
  if(q1?.status==='completed'&&q2?.status==='completed'&&!final){const winner1=game.teams.find(t=>t.id===q1.winnerTeamId);const winner2=game.teams.find(t=>t.id===q2.winnerTeamId);if(winner1&&winner2)push(`playoff-final-${game.league.year}`,'final','FINAL · Championship Match',winner1,winner2,nextRound);game.phase='season';return;}
  if(final?.status==='completed'&&final.winnerTeamId){
    const archived=(game.seasonArchives??[]).some(a=>a.year===game.league.year);
    const champion=game.teams.find(t=>t.id===final.winnerTeamId)!;
    const runner=game.teams.find(t=>t.id===(champion.id===final.homeTeamId?final.awayTeamId:final.homeTeamId));
    if(!archived){champion.record.titles++;game.seasonArchives=[...(game.seasonArchives??[]),{year:game.league.year,championId:champion.id,runnerUpId:runner?.id,finalFixtureId:final.id,standings:game.teams.map(t=>({...t.record,teamId:t.id})).sort((a,b)=>b.points-a.points||b.netRunRate-a.netRunRate),seasonStats:JSON.parse(JSON.stringify(game.records.seasonStats??{})),fixtures:JSON.parse(JSON.stringify(game.fixtures)),completedAt:new Date().toISOString()}];}
    const previousOwnerByPlayerId:Record<string,string>={};
    for(const team of game.teams)for(const id of team.playerIds)previousOwnerByPlayerId[id]=team.id;
    game.offseason={stage:'review',retainedByTeam:{},rtmRemaining:Object.fromEntries(game.teams.map(t=>[t.id,2])),previousOwnerByPlayerId,releasedPlayerIds:[],archivedYear:game.league.year};game.phase='completed';
  }
}
function retentionCost(p:Player){return +(basePrice(p)*(0.78+p.overall/320)).toFixed(2);}
function Offseason({game,setScreen}:{game:GameState;setScreen:(s:any)=>void}){
  const eligibleHumans=game.teams.filter(t=>t.kind==='human');
  const [teamId,setTeamId]=useState(eligibleHumans[0]?.id??game.teams[0]?.id??'');
  const currentTeam=game.teams.find(t=>t.id===teamId)??game.teams[0];
  const off=game.offseason;
  if(game.phase!=='completed'||!off){return <div className="page"><PageHead kicker="SEASON TRANSITION" title="Offseason is locked until the final." sub="Finish the league and playoff fixtures to archive the champion, open retention, release players and prepare the next auction." action={<Button ghost onClick={()=>setScreen('tournament')}><Trophy size={16}/> Tournament Hub</Button>}/><Panel><div className="empty-state">The season is still in progress. Continue with the next playable fixture.</div><Button primary onClick={()=>setScreen('tournament')}>Return to Tournament Hub</Button></Panel></div>;}
  const humanRetained=off.retainedByTeam[teamId]??[];
  const roster=currentTeam.playerIds.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>Boolean(p));
  const toggleRetain=(id:string)=>{
    const selected=off.retainedByTeam[teamId]??[];
    if(selected.includes(id))off.retainedByTeam[teamId]=selected.filter(x=>x!==id);
    else if(selected.length<5)off.retainedByTeam[teamId]=[...selected,id];
    else{window.alert('You can retain up to five players per franchise in this test build.');return;}
    game.offseason=off;setGame({...game});
  };
  const beginRetention=()=>{
    off.stage='retention';off.retainedByTeam={};
    for(const t of game.teams){const ranked=t.playerIds.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>Boolean(p)).sort((a,b)=>(b.overall*.45+b.form*.25+b.attrs.leadership*.08+b.attrs.potential*.22)-(a.overall*.45+a.form*.25+a.attrs.leadership*.08+a.attrs.potential*.22));off.retainedByTeam[t.id]=ranked.slice(0,5).map(p=>p.id);}
    setGame({...game});
  };
  const finaliseRetention=()=>{
    const starting=game.rules.startingPurse||100;const ownerMap:Record<string,string>={};const released:string[]=[];const costs:Record<string,number>={};
    for(const t of game.teams){const original=[...t.playerIds];let chosen=off.retainedByTeam[t.id]??[];if(t.kind==='bot'&&!chosen.length){chosen=original.map(id=>game.players.find(p=>p.id===id)).filter((p):p is Player=>Boolean(p)).sort((a,b)=>b.overall-a.overall).slice(0,5).map(p=>p.id);}chosen=[...new Set(chosen)].filter(id=>original.includes(id)).slice(0,5);for(const id of original){if(!chosen.includes(id)){ownerMap[id]=t.id;released.push(id);}}
      const fee=chosen.reduce((sum,id)=>sum+retentionCost(game.players.find(p=>p.id===id)!),0);costs[t.id]=+fee.toFixed(2);t.playerIds=chosen;t.purse=Math.max(0,+(starting-fee).toFixed(2));t.auctionBudget=starting;t.playingXI=[];t.captainId=undefined;t.viceCaptainId=undefined;t.wicketkeeperId=undefined;t.bowlingPlan={};t.tacticalRoles={};t.squadNeeds={bat:5,pace:4,spin:2,all:2,wk:2};t.record={...t.record,played:0,won:0,lost:0,points:0,nr:0,runsFor:0,runsAgainst:0,netRunRate:0,lastFive:[]};}
    off.stage='next-auction';off.previousOwnerByPlayerId=ownerMap;off.releasedPlayerIds=[...new Set(released)];off.retentionCosts=costs;off.rtmRemaining=Object.fromEntries(game.teams.map(t=>[t.id,2]));off.archivedYear=game.league.year;
    game.league.year+=1;game.fixtures=[];game.liveMatch=undefined;game.standings=game.teams.map(t=>({...t.record,teamId:t.id}));
    game.records={seasonRuns:{},seasonWickets:{},seasonStats:{}};game.players=game.players.map(p=>({...p,age:p.age+1,contract:{...p.contract,yearsLeft:Math.max(0,p.contract.yearsLeft-1)}}));
    game.auction={status:'not-started',lotIds:game.players.filter(p=>p.auctionEligible!==false&&!game.teams.some(t=>t.playerIds.includes(p.id))).map(p=>p.id),currentIndex:0,currentBid:0,bidHistory:[],soldIds:[],unsoldIds:[]};game.phase='auction';game.updatedAt=new Date().toISOString();setGame({...game});setScreen('auction');
  };
  const archive=game.seasonArchives?.find(a=>a.year===off.archivedYear);const champion=game.teams.find(t=>t.id===archive?.championId);
  const archivedLeaders=Object.entries(archive?.seasonStats??{}).map(([id,stats])=>({p:game.players.find(player=>player.id===id),s:stats})).filter((x):x is {p:Player;s:SeasonPlayerStats}=>Boolean(x.p));
  const archiveLeader=(metric:(s:SeasonPlayerStats)=>number,qualify:(s:SeasonPlayerStats)=>boolean=()=>true)=>[...archivedLeaders].filter(x=>qualify(x.s)).sort((a,b)=>metric(b.s)-metric(a.s)||a.p.name.localeCompare(b.p.name))[0];
  const seasonAwards=[
    {label:'ORANGE CAP',name:archiveLeader(s=>s.runs,s=>s.runs>0)?.p.name??'—',value:`${archiveLeader(s=>s.runs,s=>s.runs>0)?.s.runs??0} runs`,tone:'orange'},
    {label:'PURPLE CAP',name:archiveLeader(s=>s.wickets,s=>s.wickets>0)?.p.name??'—',value:`${archiveLeader(s=>s.wickets,s=>s.wickets>0)?.s.wickets??0} wickets`,tone:'purple'},
    {label:'BEST QUALIFIED STRIKE RATE',name:archiveLeader(s=>s.runs/Math.max(1,s.balls),s=>s.balls>=10)?.p.name??'—',value:(()=>{const x=archiveLeader(s=>s.runs/Math.max(1,s.balls),s=>s.balls>=10);return x?(x.s.runs/Math.max(1,x.s.balls)*100).toFixed(1):'—';})(),tone:'blue'},
    {label:'BEST QUALIFIED ECONOMY',name:archiveLeader(s=>-(s.runsConceded*6/Math.max(1,s.ballsBowled)),s=>s.ballsBowled>=6)?.p.name??'—',value:(()=>{const x=archiveLeader(s=>-(s.runsConceded*6/Math.max(1,s.ballsBowled)),s=>s.ballsBowled>=6);return x?(x.s.runsConceded*6/Math.max(1,x.s.ballsBowled)).toFixed(2):'—';})(),tone:'green'},
    {label:'MOST SIXES',name:archiveLeader(s=>s.sixes,s=>s.sixes>0)?.p.name??'—',value:`${archiveLeader(s=>s.sixes,s=>s.sixes>0)?.s.sixes??0} sixes`,tone:'gold'},
    {label:'MOST CATCHES',name:archiveLeader(s=>s.catches,s=>s.catches>0)?.p.name??'—',value:`${archiveLeader(s=>s.catches,s=>s.catches>0)?.s.catches??0} catches`,tone:'silver'}
  ];
  return <div className="page offseason-page"><PageHead kicker="SEASON TRANSITION" title={off.stage==='review'?'Champions crowned. Review the season.':off.stage==='retention'?'Build next season around your core.':'Retention complete. Prepare the next auction.'} sub={`Season ${off.archivedYear??game.league.year} is archived. Career records remain intact; tournament-only statistics will reset for the next campaign.`} action={<Button ghost onClick={()=>setScreen('tournament')}><Trophy size={16}/> Tournament Hub</Button>}/>
    {off.stage==='review'&&<><Panel className="season-champion-panel"><Crest team={champion??game.teams[0]} size={74}/><div><Kicker>SEASON CHAMPION</Kicker><h2>{champion?.name??'Season champion'}</h2><p>{game.teams.find(t=>t.id===archive?.runnerUpId)?.name??'Runner-up'} · Season {off.archivedYear}</p></div><div className="season-champion-mark"><Trophy size={34}/><b>{archive?.year??off.archivedYear} CHAMPIONS</b></div></Panel><div className="stats-grid four"><Stat label="Franchises" value={game.teams.length}/><Stat label="Completed fixtures" value={game.fixtures.filter(f=>f.status==='completed').length}/><Stat label="Archived players" value={Object.keys(archive?.seasonStats??{}).length}/><Stat label="RTM cards next season" value="2 per franchise"/></div><Panel><Kicker>SEASON ARCHIVE</Kicker><h3>Final standings</h3><div className="tournament-standings-wrap"><div className="tournament-standings"><div className="tournament-standing-head"><span>#</span><span>FRANCHISE</span><span>P</span><span>W</span><span>L</span><span>NR</span><span>PTS</span><span>NRR</span><span>FORM</span></div>{[...(archive?.standings??[])].map((r,i)=>{const t=game.teams.find(x=>x.id===r.teamId);return t?<div className="tournament-standing-row" key={t.id}><span>{i+1}</span><div className="tournament-standing-team"><Crest team={t} size={27}/><div><b>{t.code}</b><small>{t.name}</small></div></div><span>{r.played}</span><span>{r.won}</span><span>{r.lost}</span><span>{r.nr}</span><strong>{r.points}</strong><span>{r.netRunRate.toFixed(3)}</span><span>{r.lastFive.join(' ')}</span></div>:null;})}</div></div></Panel><Panel className="season-awards-panel"><div className="panel-head"><div><Kicker>SEASON AWARDS</Kicker><h3>The season's statistical leaders</h3><p>Awards are calculated from the archived scorecard statistics. Rate-based awards use qualification minimums.</p></div><Trophy size={19}/></div><div className="season-award-grid">{seasonAwards.map(award=><div className={`season-award-card ${award.tone}`} key={award.label}><span>{award.label}</span><b>{award.name}</b><strong>{award.value}</strong></div>)}</div></Panel><Button primary onClick={beginRetention}>Open Retention Window <ArrowRight size={16}/></Button></>}
    {off.stage==='retention'&&<><Panel><div className="panel-head"><div><Kicker>RETENTION WINDOW · MAX 5 PLAYERS</Kicker><h3>Select a franchise to manage</h3><p>AI franchises automatically retain their five best long-term assets. For each human-managed team, select up to five players to keep.</p></div><Select label="Your franchise" value={teamId} onChange={e=>setTeamId(e.target.value)}>{eligibleHumans.map(t=><option key={t.id} value={t.id}>{t.code} · {t.name}</option>)}</Select></div><div className="retention-selection-summary"><b>{humanRetained.length}/5 retained</b><span>Retained cost estimate: {money(humanRetained.reduce((sum,id)=>sum+retentionCost(game.players.find(p=>p.id===id)!),0))}</span><small>Retention charges are deducted from next season's purse. Released players remain in the auction pool.</small></div><div className="retention-player-list">{roster.map(p=><label className={`retention-player ${humanRetained.includes(p.id)?'selected':''}`} key={p.id}><input type="checkbox" checked={humanRetained.includes(p.id)} onChange={()=>toggleRetain(p.id)}/><div className="player-avatar tiny">{p.avatar}</div><div><b>{p.name}</b><small>{p.nationality} · {p.role} · OVR {p.overall}</small></div><span>FORM {p.form}</span><strong>{money(retentionCost(p))}</strong></label>)}</div></Panel><Panel className="retention-rules"><div><Kicker>RTM CARD RULE</Kicker><h3>2 Right-to-Match cards per franchise</h3><p>If another franchise wins a released player in the next auction, the former owner gets a chance to match that winning bid. The player moves to the former owner's squad at that price, and one RTM card is consumed.</p></div></Panel><Button primary onClick={finaliseRetention}>Finalise Retentions & Prepare Next Auction <ArrowRight size={16}/></Button></>}
    {off.stage==='next-auction'&&<Panel><Kicker>NEXT SEASON AUCTION</Kicker><h3>Retention and released-player pool</h3><p>{off.releasedPlayerIds.length} player(s) released. Every franchise has two RTM cards for eligible former players.</p><div className="retention-cost-table">{game.teams.map(t=><div key={t.id}><Crest team={t} size={34}/><b>{t.name}</b><span>{(off.retainedByTeam[t.id]??[]).length} retained</span><strong>{money(off.retentionCosts?.[t.id]??0)} retained cost</strong><strong>{money(t.purse)} auction purse</strong><span>{off.rtmRemaining[t.id]??0} RTM</span></div>)}</div><Button primary onClick={()=>setScreen('auction')}>Open Player Auction <Gavel size={16}/></Button></Panel>}
  </div>;
}

function SaveManager({onBack}:{onBack:()=>void}){
  const game=useGame();
  const [saves,setSaves]=useState<GameState[]>([]);
  const [saveStatus,setSaveStatus]=useState('Autosave is active');
  const refresh=async()=>{
    const found=await loadGames();
    setSaves(found);
    if(found.length)setSaveStatus(`Latest local save: ${new Date(found[0].updatedAt).toLocaleString()}`);
    else setSaveStatus('No saved careers found yet');
  };
  useEffect(()=>{void refresh();},[]);
  const handleSave=async()=>{
    if(!game)return;
    try{await saveGame(game);setSaveStatus(`Saved successfully · ${new Date().toLocaleTimeString()}`);await refresh();}
    catch{setSaveStatus('Save failed. Export a JSON backup before leaving this page.');}
  };
  const handleImport=async(e:ChangeEvent<HTMLInputElement>)=>{
    const file=e.target.files?.[0];if(!file)return;
    try{
      const imported=await readJSONFile<GameState>(file);
      if(!imported||!imported.league||!Array.isArray(imported.teams)||!Array.isArray(imported.players)||!Array.isArray(imported.fixtures))throw new Error('Invalid career file');

      // Identify Pakistani players using the source save's nationality fields.
      const isPakistan=(p:Player)=>{
        const values=[(p as any).nationality,(p as any).country,(p as any).nation,(p as any).countryCode,(p as any).nationalityCode];
        return values.some(value=>{
          if(typeof value!=='string')return false;
          const normalized=value.trim().toLowerCase().replace(/[^a-z]/g,'');
          return ['pakistan','pakistani','pak','pk'].includes(normalized);
        });
      };
      const removedIds=new Set(imported.players.filter(isPakistan).map(p=>p.id));
      const oldCurrentLotId=imported.auction?.lotIds?.[imported.auction.currentIndex];
      const cleaned=removePakistaniPlayersFromGame(imported);
      const additions=generatePlayers().filter(p=>!isPakistan(p)&&!cleaned.players.some(existing=>existing.id===p.id));
      cleaned.players=[...cleaned.players,...additions];

      // Add new eligible international players to an active auction before scrubbing.
      cleaned.auction=cleaned.auction??{status:'not-started',lotIds:[],currentIndex:0,currentBid:0,bidHistory:[],soldIds:[],unsoldIds:[]};
      const activeAuction=cleaned.phase==='auction'||['not-started','paused','live'].includes(cleaned.auction.status);
      if(activeAuction){
        const lots=new Set(cleaned.auction.lotIds??[]);
        for(const player of cleaned.players){
          const alreadyOwned=cleaned.teams.some(team=>(team.playerIds??[]).includes(player.id));
          if(player.auctionEligible!==false&&!alreadyOwned&&!lots.has(player.id)){
            cleaned.auction.lotIds.push(player.id);lots.add(player.id);
          }
        }
      }

      // This is the single authoritative cleanup for squads, XIs, retention,
      // RTM, auction lots, player-keyed stats, season archives and all ID maps.
      // Cleanup was applied above before the banned IDs were lost.
      if(oldCurrentLotId&&removedIds.has(oldCurrentLotId)){
        cleaned.auction.currentBid=0;
        delete cleaned.auction.leadingTeamId;
        cleaned.auction.bidHistory=[];
      }
      if(oldCurrentLotId&&!removedIds.has(oldCurrentLotId)){
        const nextIndex=cleaned.auction.lotIds.indexOf(oldCurrentLotId);
        if(nextIndex>=0)cleaned.auction.currentIndex=nextIndex;
      }
      const remainingPakistani=cleaned.players.filter(isPakistan).length;
      const pakSquadRefs=cleaned.teams.reduce((count,team)=>count+team.playerIds.filter(id=>removedIds.has(id)).length,0);
      if(remainingPakistani||pakSquadRefs)throw new Error('Pakistan player cleanup verification failed');

      const rohitPresent=cleaned.players.some(p=>p.name.trim().toLowerCase()==='rohit sharma');
      setGame(cleaned);await saveGame(cleaned);await refresh();
      setSaveStatus(`Import complete · ${removedIds.size} Pakistani players removed from squads, retention and tournament · ${additions.length} international players added${rohitPresent?' · Rohit Sharma verified':' · Note: Rohit Sharma is not in this imported player pool and must be added separately'}`);
    }catch(error){
      console.error('Career import failed:',error);
      setSaveStatus(error instanceof Error?`Import failed: ${error.message}`:'Import failed: the selected file is not a valid Dynasty T20 career JSON.');
    }
    e.target.value='';
  };
  return <div className="save-page">
    <PageHead kicker="CAREER STORAGE" title="Save Manager" sub="Dynasty autosaves in the background, keeps a recovery snapshot, and lets you export a portable career backup."/>
    <Panel className="autosave-status-panel"><div className="autosave-status-mark"><Save size={18}/></div><div><b>Automatic career protection</b><p>Autosave runs after game state changes. A recovery snapshot is also maintained in this browser, and the latest career can be continued from the entrance screen.</p><small>{saveStatus}</small></div><span className="autosave-on-badge">AUTOSAVE ON</span></Panel>
    <div className="save-actions">
      <button onClick={()=>void handleSave()} disabled={!game}><Save/><b>Save current career</b><small>Write immediately to IndexedDB + recovery copy</small></button>
      <button onClick={()=>game&&downloadJSON(`${game.saveName}.json`,game)} disabled={!game}><Download/><b>Export career backup</b><small>Portable JSON for another browser or PC</small></button>
      <label><Upload/><b>Import career</b><small>Validate and restore a JSON save</small><input type="file" accept="application/json" onChange={handleImport}/></label>
    </div>
    <Panel><div className="panel-head"><div><Kicker>SAVED CAREERS</Kicker><h3>Local career library</h3><p>Newest saves appear first. Loading a saved career restores its current match, auction state, fixtures and records.</p></div><button className="icon-button" onClick={()=>void refresh()}><RefreshCw size={16}/></button></div>
      {saves.length?saves.map(saved=><div className="save-row" key={saved.saveName}><div><b>{saved.league.name}</b><small>{saved.league.format} · {saved.league.teamCount} teams · Updated {new Date(saved.updatedAt).toLocaleString()}</small></div><Button onClick={()=>{setGame(saved);setSaveStatus(`Loaded ${saved.league.name}`);onBack();}}>Load</Button><button className="danger-link" onClick={()=>void deleteGame(saved.saveName).then(refresh)}>Delete</button></div>):<div className="empty-state">No saved careers yet. Start a game and the autosave system will create the first one.</div>}
    </Panel>
    <div className="save-page-actions"><Button ghost onClick={onBack}><ArrowLeft size={16}/> Back to game</Button>{game&&<Button onClick={()=>downloadJSON(`${game.saveName}-recovery.json`,game)}><Download size={15}/> Download recovery copy</Button>}</div>
  </div>;
}

export default App;
