import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/vue-query';
const mocked=vi.hoisted(()=>({ values:new Map<string,any>(), read:vi.fn(), write:vi.fn(), session:vi.fn() }));
vi.mock('idb-keyval',()=>({
  createStore:()=>({}),get:(key:string)=>mocked.read(key),
  set:(key:string,value:any)=>mocked.write(key,value),
  del:async(key:string)=>{mocked.values.delete(key);},
  keys:async()=>[...mocked.values.keys()],delMany:async(keys:string[])=>keys.forEach(k=>mocked.values.delete(k)),
}));
vi.mock('@/composables/useSession',()=>({loadSession:()=>mocked.session()}));
const snapshot=(owner:string)=>({timestamp:Date.now(),buster:'1',clientState:{mutations:[],queries:[{
  queryKey:['library','grid'],queryHash:'["library","grid"]',state:{status:'success',fetchStatus:'idle',dataUpdatedAt:Date.now(),data:[owner]},
}]}});
beforeEach(()=>{vi.resetModules();vi.stubGlobal('indexedDB',{});localStorage.clear();mocked.values.clear();mocked.write.mockReset().mockImplementation(async (key,value)=>{mocked.values.set(key,value);});mocked.read.mockReset().mockImplementation(async key=>mocked.values.get(key));});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});

describe('owner-safe persistence',()=>{
  it('does not hydrate a delayed old-owner read after the account changes',async()=>{
    const {synchroniserProprietaire}=await import('./stockage');
    let release:(v:any)=>void=()=>{};
    mocked.read.mockImplementation((key:string)=>key.endsWith(':alice')?new Promise(resolve=>{release=resolve;}):Promise.resolve(undefined));
    const client=new QueryClient();
    const old=synchroniserProprietaire(client,{id:'alice'});
    await vi.waitFor(()=>expect(mocked.read).toHaveBeenCalledWith('watchdeck-requetes:alice'));
    await synchroniserProprietaire(client,{id:'bob'});
    release(JSON.stringify(snapshot('alice')));await old;
    expect(client.getQueryData(['library','grid'])).toBeUndefined();
    expect(localStorage.getItem('watchdeck:stockage-proprietaire')).toBe('bob');
    client.clear();
  });
  it('verifies the current session before restoring a previous owner',async()=>{
    localStorage.setItem('watchdeck:stockage-proprietaire','alice');
    mocked.values.set('watchdeck-requetes:alice',JSON.stringify(snapshot('alice')));
    mocked.session.mockResolvedValue({id:'bob'});
    const {brancherStockage}=await import('./stockage');
    const client=new QueryClient();const[stop,ready]=brancherStockage(client);await ready;
    expect(mocked.read).not.toHaveBeenCalledWith('watchdeck-requetes:alice');
    expect(client.getQueryData(['library','grid'])).toBeUndefined();stop();client.clear();
  });
  it('bounds persisted pages, variants and bytes and excludes mutations and private roots',async()=>{
    const {boundedSnapshot}=await import('./stockage');
    const data=snapshot('alice');
    data.clientState.queries=Array.from({length:200},(_,i)=>({...data.clientState.queries[0],queryKey:['library',i],state:{...data.clientState.queries[0].state,data:{pages:Array(10).fill('x'.repeat(50000)),pageParams:Array(10).fill(0)}}})) as any;
    data.clientState.queries.push({...data.clientState.queries[0],queryKey:['settings','secrets']} as any);
    data.clientState.mutations=[{secret:true}] as any;
    const result=boundedSnapshot(data);
    expect(result.clientState.queries.length).toBeLessThanOrEqual(12);
    expect(result.clientState.queries.every((q:any)=>q.state.data.pages.length===3&&q.queryKey[0]==='library')).toBe(true);
    expect(result.clientState.mutations).toEqual([]);
    expect(new TextEncoder().encode(JSON.stringify(result)).length).toBeLessThan(8*1024*1024);
  });
  it('waits for in-flight writes before logout purges every owner key', async () => {
    vi.useFakeTimers();
    const {synchroniserProprietaire,effacerStockage}=await import('./stockage');
    const client=new QueryClient();
    await synchroniserProprietaire(client,{id:'alice'});
    let release:()=>void=()=>{};
    mocked.write.mockImplementation((key,value)=>new Promise<void>(resolve=>{release=()=>{mocked.values.set(key,value);resolve();};}));
    client.setQueryData(['library','grid'],['private']);
    await vi.advanceTimersByTimeAsync(1600);
    expect(mocked.write).toHaveBeenCalled();
    let cleared=false;
    const done=effacerStockage(client).then(()=>{cleared=true;});
    await Promise.resolve();expect(cleared).toBe(false);
    release();await done;
    await vi.advanceTimersByTimeAsync(1600);
    expect([...mocked.values.keys()]).toEqual([]);
    expect(localStorage.getItem('watchdeck:stockage-proprietaire')).toBeNull();
    expect(client.getQueryData(['library','grid'])).toBeUndefined();
  });

  it('keeps last successful data after revalidation fails, without persisting its error',async()=>{
    const {boundedSnapshot}=await import('./stockage');
    const value=snapshot('alice');
    Object.assign(value.clientState.queries[0].state,{status:'error',error:{message:'server unavailable'}});
    const result=boundedSnapshot(value);
    expect(result.clientState.queries[0].state).toMatchObject({status:'success',data:['alice'],error:null,isInvalidated:true});
  });

});
