import type {GameState,Player} from './types';

const DB='dynasty-t20-db';
const STORE='saves';
const LATEST_KEY=`${DB}:latest-autosave`;
const RECOVERY_VERSION=1;

function localKey(id:string){return `${DB}:${id}`;}
function isGameState(value:any):value is GameState {
  return Boolean(value && typeof value==='object' && typeof value.saveName==='string' && value.league && Array.isArray(value.teams) && Array.isArray(value.players) && Array.isArray(value.fixtures));
}
function parseGame(raw:string|null):GameState|null {
  if(!raw)return null;
  try { const value=JSON.parse(raw); return isGameState(value)?value:null; } catch { return null; }
}
async function openSaveDb():Promise<IDBDatabase>{
  return await new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error??new Error('Could not open career database'));
    request.onblocked=()=>reject(new Error('Career database is blocked by another tab'));
  });
}

/** Save to IndexedDB and maintain a best-effort local recovery snapshot. */
export async function saveGame(state:GameState):Promise<void>{
  const timestamp=new Date().toISOString();
  state.updatedAt=timestamp;
  const snapshot={...state,updatedAt:timestamp};
  const value=JSON.stringify(snapshot);
  let persisted=false;
  try {
    const db=await openSaveDb();
    await new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction(STORE,'readwrite');
      transaction.objectStore(STORE).put({id:snapshot.saveName,value,updatedAt:timestamp});
      transaction.oncomplete=()=>resolve();
      transaction.onerror=()=>reject(transaction.error??new Error('Career save transaction failed'));
      transaction.onabort=()=>reject(transaction.error??new Error('Career save transaction was aborted'));
    });
    db.close();
    persisted=true;
  } catch { /* localStorage below is the recovery fallback */ }
  try {
    localStorage.setItem(localKey(snapshot.saveName),value);
    persisted=true;
  } catch { /* IndexedDB may still have persisted the career */ }
  try {
    localStorage.setItem(LATEST_KEY,value);
  } catch { /* best-effort emergency copy; the IndexedDB save remains primary */ }
  if(!persisted)throw new Error('Career could not be saved to IndexedDB or local storage. Export a JSON backup.');
}

/** Merge IndexedDB and localStorage entries so fallback saves are not hidden by an empty database. */
export async function loadGames():Promise<GameState[]>{
  const byName=new Map<string,GameState>();
  try {
    const db=await openSaveDb();
    const rows=await new Promise<any[]>((resolve,reject)=>{
      const transaction=db.transaction(STORE,'readonly');
      const request=transaction.objectStore(STORE).getAll();
      request.onsuccess=()=>resolve(request.result??[]);
      request.onerror=()=>reject(request.error??new Error('Could not read career saves'));
    });
    db.close();
    for(const row of rows){
      const game=parseGame(typeof row.value==='string'?row.value:JSON.stringify(row.value));
      if(game)byName.set(game.saveName,game);
    }
  } catch { /* read local fallback below */ }
  try {
    for(let i=0;i<localStorage.length;i++){
      const key=localStorage.key(i);
      if(!key||!key.startsWith(`${DB}:`)||key===LATEST_KEY)continue;
      const game=parseGame(localStorage.getItem(key));
      if(!game)continue;
      const previous=byName.get(game.saveName);
      if(!previous||Date.parse(game.updatedAt)>Date.parse(previous.updatedAt))byName.set(game.saveName,game);
    }
    const latest=parseGame(localStorage.getItem(LATEST_KEY));
    if(latest){const previous=byName.get(latest.saveName);if(!previous||Date.parse(latest.updatedAt)>Date.parse(previous.updatedAt))byName.set(latest.saveName,latest);}
  } catch { /* browser storage may be disabled */ }
  return [...byName.values()].sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt));
}

export async function loadLatestGame():Promise<GameState|null>{
  try {
    const recovery=parseGame(localStorage.getItem(LATEST_KEY));
    const saves=await loadGames();
    const newest=saves[0]??null;
    if(recovery&&(!newest||Date.parse(recovery.updatedAt)>Date.parse(newest.updatedAt)))return recovery;
    return newest;
  } catch {
    const saves=await loadGames().catch(()=>[]);
    return saves[0]??null;
  }
}

export async function deleteGame(id:string):Promise<void>{
  try {
    const db=await openSaveDb();
    await new Promise<void>((resolve,reject)=>{
      const transaction=db.transaction(STORE,'readwrite');
      transaction.objectStore(STORE).delete(id);
      transaction.oncomplete=()=>resolve();
      transaction.onerror=()=>reject(transaction.error);
    });
    db.close();
  } catch { /* remove local fallback too */ }
  try {localStorage.removeItem(localKey(id));} catch {}
  try {const latest=parseGame(localStorage.getItem(LATEST_KEY));if(latest?.saveName===id)localStorage.removeItem(LATEST_KEY);} catch {}
}

export function downloadJSON(filename:string,data:unknown){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download=filename;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function readJSONFile<T>(file:File):Promise<T>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{try{resolve(JSON.parse(String(r.result)))}catch(e){reject(e)}};r.onerror=()=>reject(r.error);r.readAsText(file)})}
export function rosterSchema(players:Player[]){return {schemaVersion:RECOVERY_VERSION,description:'DYNASTY T20 roster import schema',players:players.map(p=>({id:p.id,name:p.name,age:p.age,nationality:p.nationality,role:p.role,overall:p.overall,attrs:p.attrs}))}}
