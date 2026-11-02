import {useSyncExternalStore} from 'react';
import type {GameState,Team,Player} from '../engine/types';
import {saveGame} from '../engine/store';

const isPakistani = (player: Partial<Player> | Record<string, unknown>) => {
  const value = player as Record<string, unknown>;
  const fields = [value.nationality, value.country, value.nation, value.countryCode, value.nationalityCode];
  return fields.some((field) => {
    if (typeof field !== 'string') return false;
    const normalized = field.trim().toLowerCase().replace(/[^a-z]/g, '');
    return normalized === 'pakistan' || normalized === 'pakistani' || normalized === 'pak' || normalized === 'pk';
  });
};

/**
 * Removes Pakistan-qualified players and every ID reference from an imported
 * or restored career. Historical non-Pakistani career data is left untouched.
 */
export function removePakistaniPlayersFromGame(game: GameState): GameState {
  const bannedIds = new Set((game.players ?? []).filter(isPakistani).map((player) => player.id));
  if (!bannedIds.size) return game;

  const cleanReferences = (value: any): any => {
    if (Array.isArray(value)) {
      return value
        .filter((item) => !(typeof item === 'string' && bannedIds.has(item)))
        .filter((item) => {
          if (!item || typeof item !== 'object') return true;
          return !['id', 'playerId', 'batterId', 'bowlerId', 'fielderId'].some(
            (key) => typeof item[key] === 'string' && bannedIds.has(item[key])
          );
        })
        .map(cleanReferences);
    }
    if (!value || typeof value !== 'object') return value;
    const cleaned: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
      if (bannedIds.has(key)) continue;
      if (typeof child === 'string' && bannedIds.has(child)) continue;
      cleaned[key] = cleanReferences(child);
    }
    return cleaned;
  };

  const cleaned = cleanReferences(game) as GameState;
  cleaned.players = (game.players ?? []).filter((player) => !bannedIds.has(player.id));
  cleaned.teams = (game.teams ?? []).map((team) => ({
    ...team,
    playerIds: (team.playerIds ?? []).filter((id) => !bannedIds.has(id)),
    playingXI: (team.playingXI ?? []).filter((id) => !bannedIds.has(id)),
    captainId: team.captainId && !bannedIds.has(team.captainId) ? team.captainId : undefined,
    viceCaptainId: team.viceCaptainId && !bannedIds.has(team.viceCaptainId) ? team.viceCaptainId : undefined,
    wicketkeeperId: team.wicketkeeperId && !bannedIds.has(team.wicketkeeperId) ? team.wicketkeeperId : undefined,
    bowlingPlan: Object.fromEntries(Object.entries(team.bowlingPlan ?? {}).filter(([id]) => !bannedIds.has(id))),
    tacticalRoles: Object.fromEntries(Object.entries(team.tacticalRoles ?? {}).filter(([id]) => !bannedIds.has(id))),
  }));
  if (cleaned.auction) {
    cleaned.auction.lotIds = (cleaned.auction.lotIds ?? []).filter((id) => !bannedIds.has(id));
    cleaned.auction.soldIds = (cleaned.auction.soldIds ?? []).filter((id) => !bannedIds.has(id));
    cleaned.auction.unsoldIds = (cleaned.auction.unsoldIds ?? []).filter((id) => !bannedIds.has(id));
    if (cleaned.auction.pendingRTM && bannedIds.has(cleaned.auction.pendingRTM.playerId)) {
      delete cleaned.auction.pendingRTM;
    }
    cleaned.auction.currentIndex = Math.min(cleaned.auction.currentIndex ?? 0, cleaned.auction.lotIds.length);
    if (cleaned.auction.soldPrices) {
      for (const id of bannedIds) delete cleaned.auction.soldPrices[id];
    }
  }
  return cleaned;
}

const QUICK_RECOVERY_KEY='dynasty-t20-db:latest-autosave';
let state:GameState|null=null;
const listeners=new Set<()=>void>();
let autoSaveTimer:ReturnType<typeof setTimeout>|undefined;
let pendingSave:GameState|null=null;

function notify(){listeners.forEach(listener=>listener());}
function safeQuickSnapshot(game:GameState|null){
  if(!game)return;
  try {
    const copy={...game,updatedAt:new Date().toISOString()};
    localStorage.setItem(QUICK_RECOVERY_KEY,JSON.stringify(copy));
  } catch {
    // The primary IndexedDB autosave still runs; browser storage can be full or disabled.
  }
}
function queueAutosave(){
  if(autoSaveTimer||!pendingSave)return;
  autoSaveTimer=setTimeout(async()=>{
    autoSaveTimer=undefined;
    const snapshot=pendingSave;
    pendingSave=null;
    if(snapshot){
      try { await saveGame(snapshot); }
      catch (error) { console.error('Dynasty T20 autosave failed:',error); }
    }
    if(pendingSave)queueAutosave();
  },1200);
}

export const setGame=(next:GameState|null)=>{
  next=next?removePakistaniPlayersFromGame(next):null;
  state=next;
  notify();
  if(next){
    pendingSave=next;
    queueAutosave();
  }
};

export const getGame=()=>state;
export const useGame=()=>useSyncExternalStore(
  callback=>{listeners.add(callback);return()=>listeners.delete(callback);},
  ()=>state,
  ()=>state
);

export async function patchGame(fn:(game:GameState)=>GameState){
  if(!state)return;
  const next=fn(structuredClone(state));
  setGame(next);
  await saveGame(next);
}

export function assignPlayer(teamId:string,playerId:string){
  if(!state)return;
  state.teams=state.teams.map(team=>
    team.playerIds.includes(playerId)
      ?{...team,playerIds:team.playerIds.filter(id=>id!==playerId)}
      :team.id===teamId
        ?{...team,playerIds:[...team.playerIds,playerId]}
        :team
  );
  state.players=state.players.map(player=>player.id===playerId?{...player,contract:{salary:0,yearsLeft:1}}:player);
  pendingSave=state;
  queueAutosave();
  notify();
}

export function getPlayer(id:string){return state?.players.find(player=>player.id===id);}
export function getTeam(id:string){return state?.teams.find(team=>team.id===id);}

async function flushAutosave(){
  const snapshot=pendingSave??state;
  if(!snapshot)return;
  safeQuickSnapshot(snapshot);
  if(autoSaveTimer){clearTimeout(autoSaveTimer);autoSaveTimer=undefined;}
  pendingSave=null;
  try {await saveGame(snapshot);} catch(error) {console.error('Dynasty T20 final autosave failed:',error);}
}

if(typeof window!=='undefined'){
  // A synchronous recovery snapshot protects the current career from tab refresh/close.
  window.addEventListener('pagehide',()=>{safeQuickSnapshot(state);void flushAutosave();});
  window.addEventListener('beforeunload',()=>safeQuickSnapshot(state));
}
