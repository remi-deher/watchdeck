import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import StorageView from './StorageView.vue';
const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/api', () => ({ api: request }));
vi.mock('@/components/storage/previewJob', () => ({calculatePreview: (body) => request('/api/storage/preview', {method:'POST',body:JSON.stringify(body)})}));
vi.mock('@/events', () => ({ useRealtime: vi.fn() }));
const roots = [
  { arr_instance_id: 1, name: 'Radarr', arr_type: 'radarr', arr_roots: ['/data/FILMS','/usb/FILMS'], plex_roots: [{ section_id:'1',library:'Films',path:'/media/FILMS' }, { section_id:'1',library:'Films',path:'/usb/MEDIA/FILMS' }] },
  { arr_instance_id: 2, name: 'Sonarr', arr_type: 'sonarr', arr_roots: ['/data/SERIES'], plex_roots: [{ section_id:'2',library:'Séries',path:'/media/SERIES' }] },
];
async function factory() {
 const wrapper = mount(StorageView, {global:{stubs:{UiMenu:{template:'<div><slot name="trigger"/><slot/></div>'},UiMenuItem:{emits:['select'],template:'<button @click="$emit(\'select\',$event)"><slot/></button>'},AppSubnav:{props:['items','active'],emits:['update:active'],template:'<nav class="app-subnav__root"><button v-for="item in items" :key="item.key" @click="$emit(\'update:active\',item.key)">{{ item.label }}<span v-if="item.count!=null"> {{ item.count }}</span></button></nav>'},AppPage:{template:'<main><slot name="tools"/><slot/></main>'}, ModalShell:{props:['open'],template:'<div v-if="open" role="dialog"><slot/></div>'}}}});
 await flushPromises();
 await wrapper.findAll('button').find(b=>b.text()==='Stockages').trigger('click');
 await flushPromises();
 return wrapper;
}
describe('Storage root correspondence table', () => {
 beforeEach(()=>{localStorage.clear();request.mockReset();request.mockImplementation(async(path)=>path==='/api/storage/roots'?roots:path==='/api/storage/roots/resolve'?{candidates:[],automatic:null,comparison:{status:'sample_matched',checked_titles:5,total_titles:12,items:[]}}:path==='/api/storage/roots/check'?{status:'sample_matched',checked_titles:5,total_titles:12,items:[]}:[]);});
 it('renders one shared-table row per Arr root without assuming a Plex match',async()=>{
  const wrapper=await factory();
  const table=wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]');
  const rows=table.findAll('tbody tr');
  expect(rows).toHaveLength(3);
  expect(rows.map(row=>row.findAll('td')[0].find('code').text())).toEqual(['/data/FILMS','/usb/FILMS','/data/SERIES']);
  expect(rows.map(row=>row.find('select').element.value)).toEqual([JSON.stringify(['1','/media/FILMS']),JSON.stringify(['1','/usb/MEDIA/FILMS']),JSON.stringify(['2','/media/SERIES'])]);
  expect(rows[0].find('select').element.value).not.toContain('/usb/');
  wrapper.unmount();
 });
 it('checks the selected pair and discards its visible result when the Plex root changes',async()=>{
  const wrapper=await factory();
  const row=wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]').findAll('tbody tr')[0];
  await row.find('select').setValue(JSON.stringify(['1','/media/FILMS']));
  await wrapper.findAll('button').find(b=>b.text().startsWith('Vérifier et enregistrer')).trigger('click');await flushPromises();
  expect(request).toHaveBeenCalledWith('/api/storage/roots/check',expect.objectContaining({method:'POST',body:JSON.stringify({arr_instance_id:1,arr_root:'/data/FILMS',plex_root:'/media/FILMS',plex_section_id:'1',subdirectory:''})}));
  expect(row.text()).toContain('Correspondance confirmée sur 5 / 12');
  await row.find('select').setValue(JSON.stringify(['1','/usb/MEDIA/FILMS']));
  expect(row.text()).toContain('Contenu non contrôlé');
  expect(row.text()).not.toContain('Correspondance confirmée');
  wrapper.unmount();
 });

 it('saves a confirmed Arr/Plex association without an engine path or modal',async()=>{
  const wrapper=await factory();
  const row=wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]').findAll('tbody tr')[0];
  await wrapper.findAll('button').find(b=>b.text().startsWith('Vérifier et enregistrer')).trigger('click');await flushPromises();
  const call=request.mock.calls.find(([path,opts])=>path==='/api/storage/locations' && opts?.method==='POST');
  expect(JSON.parse(call[1].body)).toMatchObject({mount_path:'',mappings:[{arr_root:'/data/FILMS',plex_root:'/media/FILMS'}]});
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  expect(request.mock.calls.some(([path])=>path==='/api/storage/roots/resolve')).toBe(false);
  wrapper.unmount();
 });
 it('does not save an association when the content check fails',async()=>{
  const original=request.getMockImplementation();request.mockImplementation(async(path,opts)=>path==='/api/storage/roots/check'?{status:'mismatch'}:original(path,opts));
  const wrapper=await factory();
  const row=wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]').findAll('tbody tr')[0];
  await wrapper.findAll('button').find(b=>b.text().startsWith('Vérifier et enregistrer')).trigger('click');await flushPromises();
  expect(request.mock.calls.some(([path,opts])=>path==='/api/storage/locations' && opts?.method==='POST')).toBe(false);
  expect(wrapper.text()).toContain('Correspondance Arr/Plex non confirmée');
  wrapper.unmount();
 });
 it.each(['arr_empty','plex_empty'])('saves an empty root with a warning (%s)',async(empty_reason)=>{
  const original=request.getMockImplementation();request.mockImplementation(async(path,opts)=>path==='/api/storage/roots/check'?{status:'empty',empty_reason,items:[]}:original(path,opts));
  const wrapper=await factory();const row=wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]').findAll('tbody tr')[0];
  expect(row.findAll('button').some(b=>b.text()==='Vérifier et enregistrer')).toBe(false);
  expect(wrapper.findAll('button').filter(b=>b.text().startsWith('Vérifier et enregistrer'))).toHaveLength(1);
  await wrapper.findAll('button').find(b=>b.text().startsWith('Vérifier et enregistrer')).trigger('click');await flushPromises();
  expect(request.mock.calls.some(([path,opts])=>path==='/api/storage/locations' && opts?.method==='POST')).toBe(true);
  expect(row.text()).toContain('Aucun média');expect(wrapper.text()).toContain('contenu non confirmé');
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false);wrapper.unmount();
 });
 it('checks and saves every selected root from one global button',async()=>{
  const wrapper=await factory();await wrapper.findAll('button').find(b=>b.text().startsWith('Vérifier et enregistrer')).trigger('click');await flushPromises();
  expect(request.mock.calls.filter(([path])=>path==='/api/storage/roots/check')).toHaveLength(3);
  expect(request.mock.calls.filter(([path,opts])=>path==='/api/storage/locations' && opts?.method==='POST')).toHaveLength(3);
  expect(wrapper.text()).toContain('3 correspondance(s) enregistrée(s)');wrapper.unmount();
 });
 it('reports progress and only forces explicitly selected mismatches',async()=>{
  const original=request.getMockImplementation();request.mockImplementation(async(path,opts)=>path==='/api/storage/roots/check'?{status:'mismatch'}:original(path,opts));
  const wrapper=await factory();const button=()=>wrapper.findAll('button').find(b=>b.text().startsWith('Vérifier et enregistrer'));
  await button().trigger('click');await flushPromises();
  expect(wrapper.find('progress').attributes('value')).toBe('3');
  expect(wrapper.find('progress').attributes('max')).toBe('3');
  expect(request.mock.calls.some(([path,opts])=>path==='/api/storage/locations' && opts?.method==='POST')).toBe(false);
  await wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]').find('input[type="checkbox"]').setValue(true);
  await wrapper.findAll('button').find(b=>b.text()==='Tout revérifier').trigger('click');await flushPromises();
  expect(request.mock.calls.filter(([path,opts])=>path==='/api/storage/locations' && opts?.method==='POST')).toHaveLength(1);
  expect(wrapper.text()).toContain('contenu non confirmé');wrapper.unmount();
 });
 it('uses one table and skips saved associations until explicitly rechecked',async()=>{
  const wrapper=await factory();const button=()=>wrapper.findAll('button').find(b=>b.text().startsWith('Vérifier et enregistrer'));
  expect(wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]').exists()).toBe(true);expect(wrapper.text()).not.toContain('Comment savoir si');
  await button().trigger('click');await flushPromises();expect(button().attributes('disabled')).toBeDefined();
  const before=request.mock.calls.filter(([path])=>path==='/api/storage/roots/check').length;
  await wrapper.findAll('button').find(b=>b.text()==='Tout revérifier').trigger('click');await flushPromises();
  expect(request.mock.calls.filter(([path])=>path==='/api/storage/roots/check')).toHaveLength(before+3);wrapper.unmount();
 });
 it('updates existing reactive mappings without structuredClone failures',async()=>{
  const original=request.getMockImplementation();const location={id:7,name:'DATA',mount_path:'',reserve_bytes:0,enabled:true,mappings:[{arr_instance_id:1,arr_root:'/data/FILMS',plex_root:'/media/FILMS',plex_section_id:'1',subdirectory:''}]};
  request.mockImplementation(async(path,opts)=>path==='/api/storage/locations' && !opts?[location]:original(path,opts));
  const wrapper=await factory();await wrapper.findAll('button').find(b=>b.text()==='Tout revérifier').trigger('click');await flushPromises();
  expect(request.mock.calls.some(([path,opts])=>path==='/api/storage/locations/7' && opts?.method==='PUT')).toBe(true);
  expect(wrapper.text()).not.toContain('could not be cloned');wrapper.unmount();
 });
 it('only offers Arr preparation without rsync or engine settings',async()=>{
  const wrapper=await factory();
  await wrapper.findAll('button').find(b=>b.text()==='Préparer').trigger('click');
  expect(wrapper.find('input[value="rsync"]').exists()).toBe(false);
  expect(wrapper.text()).toContain('Stockages');
  expect(wrapper.text()).not.toContain('Watchdeck ne garantit');
  expect(wrapper.text()).toContain('Instances à déplacer');
  expect(wrapper.text()).not.toContain('doivent être montés');
  wrapper.unmount();
 });
 it('prepares multiple instances with independent routes and a shared preview',async()=>{
  const original=request.getMockImplementation();request.mockImplementation(async(path,opts)=>path==='/api/storage/preview'?{source:{free_bytes:10e9},destination:{free_bytes:20e9},items:[],excluded:[],goal_covered:true}:original(path,opts));
  const wrapper=await factory();await wrapper.findAll('button').find(b=>b.text()==='Préparer').trigger('click');
  const choices=wrapper.findAll('.instance-choice input');await choices[0].setValue(true);await choices[1].setValue(true);
  const sourceChecks=wrapper.findAll('.source-choices input');await sourceChecks[0].setValue(true);await sourceChecks[2].setValue(true);
  roots[1].arr_roots.push('/usb/SERIES');await wrapper.vm.$nextTick();
  const selects=wrapper.findAll('.prepare-route select');await selects[0].setValue('/usb/FILMS');await selects[1].setValue('/usb/SERIES');
  await wrapper.find('form').trigger('submit');await wrapper.find('form').trigger('submit');await flushPromises();
  const calls=request.mock.calls.filter(([path])=>path==='/api/storage/preview');expect(calls).toHaveLength(1);expect(JSON.parse(calls[0][1].body).routes.map(r=>r.arr_instance_id)).toEqual([1,2]);
  expect(wrapper.find('[role="dialog"]').exists()).toBe(true);roots[1].arr_roots.pop();wrapper.unmount();
 });
 it('sends multiple checked sources with one shared objective',async()=>{
  const original=request.getMockImplementation();request.mockImplementation(async(path,opts)=>path==='/api/storage/preview'?{source:{free_bytes:0},destination:{free_bytes:20e9},items:[],excluded:[],goal_covered:true}:original(path,opts));
  roots[0].arr_roots.push('/data2/FILMS');
  const wrapper=await factory();await wrapper.findAll('button').find(b=>b.text()==='Préparer').trigger('click');
  await wrapper.find('.instance-choice input').setValue(true);
  const checks=wrapper.findAll('.source-choices input');await checks[0].setValue(true);await checks[2].setValue(true);
  await wrapper.find('.prepare-route select').setValue('/usb/FILMS');
  expect(wrapper.find('.source-choices input[value="/usb/FILMS"]').attributes('disabled')).toBeDefined();
  await wrapper.find('form').trigger('submit');expect(wrapper.findAll('.objective-options input')).toHaveLength(3);
  expect(wrapper.text()).toContain('Espace à libérer au total');
  await wrapper.find('input[type="number"]').setValue(600);
  await wrapper.find('form').trigger('submit');await flushPromises();
  const calls=request.mock.calls.filter(([path])=>path==='/api/storage/preview');expect(calls).toHaveLength(1);
  expect(JSON.parse(calls[0][1].body)).toMatchObject({goal_gb:600,routes:[{source_roots:['/data/FILMS','/data2/FILMS'],destination_root:'/usb/FILMS',root_goals:{}}]});
  roots[0].arr_roots.pop();wrapper.unmount();
 });
 it('does not show a create-task button in transfers',async()=>{
  const wrapper=await factory();await wrapper.findAll('button').find(b=>b.text()==='Transferts').trigger('click');
  expect(wrapper.findAll('button').some(b=>b.text()==='Créer une tâche')).toBe(false);wrapper.unmount();
 });
 it('edits a saved draft without resuming it blindly',async()=>{
  const original=request.getMockImplementation();request.mockImplementation(async(path,opts)=>path==='/api/storage/transfers' && !opts?[{id:11,status:'draft',desired_state:'pause',params:{transfer_mode:'arr',arr_instance_id:1,source_root:'/data/FILMS',destination_root:'/usb/FILMS'},items:[]}]:original(path,opts));
  const wrapper=await factory();await wrapper.findAll('button').find(b=>b.text()==='Transferts').trigger('click');
  expect(wrapper.text()).toContain('Tâche enregistrée, aucun transfert lancé');
  expect(wrapper.findAll('button').some(b=>b.text()==='Reprendre le lot')).toBe(false);
  await wrapper.findAll('button').find(b=>b.text()==='Modifier').trigger('click');
  expect(wrapper.find('.source-choices input').element.checked).toBe(true);wrapper.unmount();
 });
 it('verifies a draft without launching and confirms deletion separately',async()=>{
  const original=request.getMockImplementation();request.mockImplementation(async(path,opts)=>path==='/api/storage/transfers' && !opts?[{id:11,status:'draft',desired_state:'pause',params:{name:'Ma tâche',transfer_mode:'arr',arr_instance_id:1,source_root:'/data/FILMS',destination_root:'/usb/FILMS'},items:[]}]:path==='/api/storage/preview'?{source:{free_bytes:0},destination:{free_bytes:20e9},items:[],excluded:[],goal_covered:true}:original(path,opts));
  const wrapper=await factory();await wrapper.findAll('button').find(b=>b.text()==='Transferts').trigger('click');
  expect(wrapper.findAll('button').some(b=>b.text().replace(/\s/g,'')==='Àlancer1')).toBe(true);
  await wrapper.findAll('button').find(b=>b.text()==='Supprimer le brouillon').trigger('click');
  expect(wrapper.find('[role="dialog"]').text()).toContain('Aucun fichier média');
  await wrapper.findAll('button').find(b=>b.text()==='Annuler').trigger('click');
  expect(request.mock.calls.some(([,opts])=>opts?.method==='DELETE')).toBe(false);
  await wrapper.findAll('button').find(b=>b.text()==='Vérifier et lancer').trigger('click');await flushPromises();
  expect(request.mock.calls.some(([path])=>path==='/api/storage/preview')).toBe(true);
  expect(request.mock.calls.some(([path,opts])=>path==='/api/storage/transfers' && opts?.method==='POST')).toBe(false);
  expect(wrapper.find('[role="dialog"]').exists()).toBe(true);wrapper.unmount();
 });
 it('filters transfer titles and exposes retry for blocked items',async()=>{
  const original=request.getMockImplementation();request.mockImplementation(async(path,opts)=>path==='/api/storage/transfers' && !opts?[{id:9,source_id:1,destination_id:2,status:'paused',desired_state:'pause',params:{transfer_mode:'arr'},items:[{id:1,title:'À corriger',status:'blocked',size_bytes:100,snapshot:{}},{id:2,title:'Terminé',status:'completed',size_bytes:200,snapshot:{}}]}]:original(path,opts));
  const wrapper=await factory();await wrapper.findAll('button').find(b=>b.text()==='Transferts').trigger('click');
  await wrapper.findAll('button').find(b=>b.text().startsWith('En pause / À traiter')).trigger('click');
  const table=wrapper.find('[aria-label="Titres du lot 9"]');expect(table.text()).toContain('À corriger');expect(table.text()).not.toContain('Terminé');
  await wrapper.findAll('button').find(b=>b.text()==='Réessayer les titres en erreur').trigger('click');await flushPromises();
  expect(request).toHaveBeenCalledWith('/api/storage/transfers/9/command',expect.objectContaining({body:JSON.stringify({action:'retry'})}));wrapper.unmount();
 });
 it('separates remaining volumes from completed releases on the overview',async()=>{
  request.mockImplementation(async(path)=>path==='/api/storage/roots'?roots:path==='/api/storage/locations'?[{id:1,name:'DATA1',mount_path:'/storage/data1',mappings:[],reserve_bytes:1e9,free_bytes:null,health:'not_checked',enabled:true}]:path==='/api/storage/transfers'?[{id:1,source_id:1,status:'paused',items:[{id:1,status:'pending',media_type:'movie',size_bytes:2e9},{id:2,status:'completed',media_type:'series',size_bytes:3e9}]}]:[]);
  const wrapper=await factory();
  await wrapper.findAll('button').find(b=>b.text()==='Vue d’ensemble').trigger('click');
  const text=wrapper.text();
  expect(text).toContain('2 Go à déplacer');
  expect(text).toContain('3 Go');
  expect(text).toContain('1 en pause ou arrêtée(s)');
  expect(wrapper.find('[aria-label="Titres restants par stockage et type"]').exists()).toBe(false);
  expect(text).toContain('— libres');
  expect(wrapper.find('[aria-label="Capacité des stockages"]').exists()).toBe(true);
  expect(wrapper.find('.capacity-card').exists()).toBe(false);
  wrapper.unmount();
 });

 it('refreshes in the background without replacing rows or clearing the selected pair',async()=>{
  const interval=vi.spyOn(globalThis,'setInterval');
  const clock=vi.spyOn(Date,'now').mockReturnValue(100000);
  const wrapper=await factory();
  const row=wrapper.find('[aria-label="Correspondance des racines Arr et Plex"]').findAll('tbody tr')[0];
  const element=row.element;
  await row.find('select').setValue(JSON.stringify(['1','/media/FILMS']));
  await wrapper.findAll('button').find(b=>b.text().startsWith('Vérifier et enregistrer')).trigger('click');await flushPromises();
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
  expect(wrapper.find('[aria-label="Capacité des stockages"]').text()).toContain('5 Go libres');
  expect(wrapper.find('[aria-label="Capacité des stockages"]').text()).toContain('10 Go au total');
  expect(wrapper.find('progress').attributes('value')).toBe('50');
  expect(wrapper.text()).toContain('20 Mo/s');expect(wrapper.text()).toContain('≈ 50 s');
  expect(wrapper.text()).toContain('7 Go');
  const history=wrapper.find('[aria-label="Historique récent des lots"]');
  expect(history.text()).toContain('0 film(s) / 1 série(s)');expect(history.text()).toContain('10 min');
  wrapper.unmount();
 });

 it('saves paths for multiple rows globally and validates the shared connection once',async()=>{
  const previous=request.getMockImplementation(),bindings=[];
  request.mockImplementation(async(path,options)=>{
   if(path==='/api/storage/connections')return [{id:7,name:'NAS',method:'ssh',tested:true}];
   if(path==='/api/storage/bindings/multiple'){bindings.push(JSON.parse(options.body));return {saved:true};}
   if(path==='/api/storage/accesses')return bindings.length?[{id:8,connection_id:7,name:'NAS',revision:'new',validation:{},roots:bindings.map(b=>({...b,...b.bindings[0]}))}]:[];
   return previous(path,options);
  });
  const w=await factory();const rows=w.find('[aria-label="Correspondance des racines Arr et Plex"]').findAll('tbody tr');
  for(const [index,path] of [[0,'/mnt/data/FILMS'],[1,'/mnt/usb/FILMS']]){
   await rows[index].findAll('button').find(b=>b.text()==='Configurer').trigger('click');
   await rows[index].findAll('select')[1].setValue('7');
   await rows[index].find('input[placeholder="Chemin accessible"]').setValue(path);
   await rows[index].findAll('button').find(b=>b.text()==='Terminer').trigger('click');
  }
  await w.findAll('button').find(b=>b.text().startsWith('Vérifier et enregistrer')).trigger('click');await flushPromises();
  expect(bindings).toEqual([{arr_instance_id:1,arr_root:'/data/FILMS',bindings:[{connection_id:7,path:'/mnt/data/FILMS'}]},{arr_instance_id:1,arr_root:'/usb/FILMS',bindings:[{connection_id:7,path:'/mnt/usb/FILMS'}]}]);
  expect(request.mock.calls.filter(([p])=>p==='/api/storage/accesses/8/validate')).toHaveLength(1);
  expect(request.mock.calls.some(([p,o])=>p==='/api/storage/transfers' && o?.method==='POST')).toBe(false);
  w.unmount();
 });

});
