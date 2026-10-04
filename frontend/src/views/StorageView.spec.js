import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StorageView from './StorageView.vue';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/api', () => ({ api: request }));
vi.mock('@/events', () => ({ useRealtime: vi.fn() }));
const roots = [
  { arr_instance_id: 1, name: 'Radarr', arr_type: 'radarr', arr_roots: ['/data/FILMS','/usb/FILMS'], plex_roots: [{ section_id:'1',library:'Films',path:'/media/FILMS' }, { section_id:'1',library:'Films',path:'/usb/MEDIA/FILMS' }] },
  { arr_instance_id: 2, name: 'Sonarr', arr_type: 'sonarr', arr_roots: ['/data/SERIES'], plex_roots: [{ section_id:'2',library:'Séries',path:'/media/SERIES' }] },
];
async function factory() {
 const wrapper = mount(StorageView, {global:{stubs:{AppPage:{template:'<main><slot name="tools"/><slot/></main>'}, ModalShell:{props:['open'],template:'<div v-if="open" role="dialog"><slot/></div>'}}}});
 await flushPromises();
 await wrapper.findAll('button').find(b=>b.text()==='Stockages').trigger('click');
 await flushPromises();
 return wrapper;
}
describe('Storage root correspondence table', () => {
 beforeEach(()=>{localStorage.clear();request.mockReset();request.mockImplementation(async(path)=>path==='/api/storage/roots'?roots:path==='/api/storage/roots/check'?{status:'sample_matched',checked_titles:5,total_titles:12,items:[]}:[]);});
 it('renders one shared-table row per Arr root without assuming a Plex match',async()=>{
  const wrapper=await factory();
  const table=wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]');
  const rows=table.findAll('tbody tr');
  expect(rows).toHaveLength(3);
  expect(rows.map(row=>row.findAll('td')[1].text())).toEqual(['/data/FILMS','/usb/FILMS','/data/SERIES']);
  expect(rows.every(row=>row.find('select').element.value==='')).toBe(true);
  expect(rows.every(row=>row.find('button').attributes('disabled')!==undefined)).toBe(true);
  wrapper.unmount();
 });
 it('checks the selected pair and discards its visible result when the Plex root changes',async()=>{
  const wrapper=await factory();
  const row=wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]').findAll('tbody tr')[0];
  await row.find('select').setValue(JSON.stringify(['1','/media/FILMS']));
  await row.find('button').trigger('click');await flushPromises();
  expect(request).toHaveBeenCalledWith('/api/storage/roots/check',expect.objectContaining({method:'POST',body:JSON.stringify({arr_instance_id:1,arr_root:'/data/FILMS',plex_root:'/media/FILMS',plex_section_id:'1',subdirectory:''})}));
  expect(row.text()).toContain('Correspondance confirmée sur 5 / 12');
  await row.find('select').setValue(JSON.stringify(['1','/usb/MEDIA/FILMS']));
  expect(row.text()).toContain('Contenu non contrôlé');
  expect(row.text()).not.toContain('Correspondance confirmée');
  wrapper.unmount();
 });
 it('prefills the selected root and saves only after the engine mount is entered',async()=>{
  const wrapper=await factory();
  const row=wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]').findAll('tbody tr')[0];
  await row.find('select').setValue(JSON.stringify(['1','/media/FILMS']));
  await row.findAll('button').find(b=>b.text()==='Enregistrer').trigger('click');
  const dialog=wrapper.find('[role="dialog"]');
  expect(dialog.exists()).toBe(true);
  expect(dialog.findAll('select').map(s=>s.element.value)).toContain('/data/FILMS');
  const mountInput=dialog.findAll('input').find(i=>i.attributes('placeholder')==='/storage/data1');
  expect(mountInput.element.value).toBe('');
  expect(request.mock.calls.some(([path,opts])=>path==='/api/storage/locations' && opts?.method==='POST')).toBe(false);
  await mountInput.setValue('/storage/data1');
  await dialog.find('form').trigger('submit');await flushPromises();
  expect(request).toHaveBeenCalledWith('/api/storage/locations',expect.objectContaining({method:'POST',body:JSON.stringify({name:'Radarr · /data/FILMS',mount_path:'/storage/data1',reserve_gb:100,enabled:true,mappings:[{arr_instance_id:1,arr_root:'/data/FILMS',plex_root:'/media/FILMS',plex_section_id:'1',subdirectory:''}]})}));
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  wrapper.unmount();
 });

 it('separates remaining volumes from completed releases on the overview',async()=>{
  request.mockImplementation(async(path)=>path==='/api/storage/roots'?roots:path==='/api/storage/locations'?[{id:1,name:'DATA1',mount_path:'/storage/data1',mappings:[],reserve_bytes:1e9,free_bytes:null,health:'not_checked',enabled:true}]:path==='/api/storage/transfers'?[{id:1,source_id:1,status:'paused',items:[{id:1,status:'pending',media_type:'movie',size_bytes:2e9},{id:2,status:'completed',media_type:'series',size_bytes:3e9}]}]:[]);
  const wrapper=await factory();
  await wrapper.findAll('button').find(b=>b.text()==='Vue d’ensemble').trigger('click');
  const text=wrapper.text();
  expect(text).toContain('2 Go à déplacer');
  expect(text).toContain('3 Go');
  expect(text).toContain('1 en pause ou arrêtée(s)');
  const table=wrapper.find('[aria-label="Titres restants par stockage et type"]');
  expect(table.findAll('tbody tr')).toHaveLength(1);
  expect(table.text()).toContain('Films');
  expect(table.text()).not.toContain('Séries');
  expect(text).toContain('— libres');
  wrapper.unmount();
 });

 it('refreshes in the background without replacing rows or clearing the selected pair',async()=>{
  const interval=vi.spyOn(globalThis,'setInterval');
  const clock=vi.spyOn(Date,'now').mockReturnValue(100000);
  const wrapper=await factory();
  const row=wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]').findAll('tbody tr')[0];
  const element=row.element;
  await row.find('select').setValue(JSON.stringify(['1','/media/FILMS']));
  await row.find('button').trigger('click');await flushPromises();
  expect(wrapper.findAll('button').some(b=>b.text().startsWith('Actualiser'))).toBe(false);
  clock.mockReturnValue(165000);
  const tick=interval.mock.calls.find(([,delay])=>delay===5000)[0];
  tick();await flushPromises();
  const refreshed=wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]').findAll('tbody tr')[0];
  expect(refreshed.element).toBe(element);
  expect(refreshed.find('select').element.value).toBe(JSON.stringify(['1','/media/FILMS']));
  expect(refreshed.text()).toContain('Correspondance confirmée');
  wrapper.unmount();interval.mockRestore();clock.mockRestore();
 });

 it('shows measured capacity, copy estimate and completed batch dates',async()=>{
  request.mockImplementation(async(path)=>path==='/api/storage/roots'?roots:path==='/api/storage/locations'?[{id:1,name:'DATA1',mount_path:'/storage/data1',mappings:[],total_bytes:10e9,free_bytes:5e9,reserve_bytes:1e9,health:'ok',enabled:true}]:path==='/api/storage/transfers'?[
   {id:1,source_id:1,destination_id:2,status:'running',desired_state:'run',released_bytes:0,items:[{id:1,title:'Film actif',status:'copying',media_type:'movie',size_bytes:2e9,progress:{copied_bytes:1e9,bytes_per_second:20e6,updated_at:Date.now()/1000}}]},
   {id:2,source_id:1,destination_id:2,status:'completed',released_bytes:3e9,items:[{id:2,status:'completed',media_type:'series',size_bytes:3e9,progress:{started_at:'2026-10-04T10:00:00',finished_at:'2026-10-04T10:10:00'}}]},
  ]:[]);
  const wrapper=await factory();await wrapper.findAll('button').find(b=>b.text()==='Vue d’ensemble').trigger('click');
  expect(wrapper.find('[role="meter"]').attributes('aria-valuenow')).toBe('50');
  expect(wrapper.find('progress').attributes('value')).toBe('50');
  expect(wrapper.text()).toContain('20 Mo/s');expect(wrapper.text()).toContain('≈ 50 s');
  expect(wrapper.text()).toContain('7 Go');
  const history=wrapper.find('[aria-label="Historique récent des lots"]');
  expect(history.text()).toContain('0 film(s) / 1 série(s)');expect(history.text()).toContain('10 min');
  wrapper.unmount();
 });

});
