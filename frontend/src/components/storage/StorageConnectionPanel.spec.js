import {mount,flushPromises} from '@vue/test-utils';
import {describe,it,expect,vi,beforeEach} from 'vitest';
import Panel from './StorageConnectionPanel.vue';
import Root from './StorageRootAccess.vue';
import Browser from './StorageDirectoryBrowser.vue';
const {request}=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('@/api',()=>({api:request}));
const globals={stubs:{ModalShell:{props:['open'],template:'<div v-if="open" role="dialog"><slot/></div>'}}};
beforeEach(()=>request.mockReset());
it('saves offline without testing and confirms SSH identity separately',async()=>{
 const connection={id:1,name:'NAS',method:'ssh',trusted:false,connection:{host:'nas',user:'media'}};
 request.mockImplementation(async(path='')=>path.endsWith('/discover')?{fingerprint:'SHA256:detected'}:connection);
 const w=mount(Panel,{props:{connections:[]},global:globals});
 await w.findAll('button').find(b=>b.text()==='Ajouter une connexion').trigger('click');
 await w.find('form').trigger('submit');await flushPromises();
 expect(request.mock.calls.map(([p])=>p)).toEqual(['/api/storage/connections']);
 expect(w.find('[role="dialog"]').exists()).toBe(false);
 await w.setProps({connections:[connection]});
 await w.findAll('button').find(b=>b.text()==='Confirmer le serveur SSH').trigger('click');await flushPromises();
 const confirm=w.findAll('button').find(b=>b.text()==='Confirmer le serveur');
 expect(confirm.attributes('disabled')).toBeDefined();
 await w.find('input[type="checkbox"]').setValue(true);await confirm.trigger('click');await flushPromises();
 expect(request.mock.calls.map(([p])=>p)).toEqual(['/api/storage/connections','/api/storage/connections/1/discover','/api/storage/connections/1/trust']);
 expect(request.mock.calls.some(([p])=>p.endsWith('/test'))).toBe(false);
 w.unmount();
});
it('browses directories for the chosen connection and emits only its path binding',async()=>{
 request.mockResolvedValue({path:'/mnt',parent:'/',directories:[{name:'Films',path:'/mnt/Films'}]});
 const w=mount(Root,{props:{row:{instance:'Radarr',arr_root:'/data/FILMS'},binding:{connection_id:1,path:'/mnt'},connections:[{id:1,name:'NAS',method:'ssh',trusted:true,tested:false}],busy:false,validated:false,dirty:false},global:globals});
 expect(w.text()).toContain('SSH · NAS');
 expect(w.findAll('select')).toHaveLength(0);
 await w.findAll('button').find(b=>b.text()==='Configurer').trigger('click');
 await w.findAll('button').find(b=>b.text()==='…').trigger('click');await flushPromises();
 expect(w.text()).toContain('Radarr · /data/FILMS');
 expect(request).toHaveBeenCalledWith('/api/storage/connections/1/browse',expect.objectContaining({body:JSON.stringify({path:'/mnt'})}));
 await w.findAll('button').find(b=>b.text()==='Choisir ce dossier').trigger('click');
 expect(w.emitted('change')[0][0]).toEqual({bindings:[{connection_id:1,path:'/mnt'}]});
 w.unmount();
});


it('starts at a custom local mount and offers only the virtual mount list at root',async()=>{
 request.mockImplementation(async(_path,options)=>{if(!options?.body)return {};const path=JSON.parse(options.body).path;return path==='/'?{path:'/',parent:null,selectable:false,directories:[{name:'/usb1',path:'/usb1'}]}:{path:'/usb1',parent:'/',selectable:true,directories:[]};});
 const w=mount(Browser,{props:{open:false,connection:{id:4,method:'local',name:'USB',connection:{browse_root:'/usb1'}},initialPath:'',rootLabel:'Radarr · /usb/FILMS'},global:globals});
 await w.setProps({open:true});await flushPromises();
 expect(JSON.parse(request.mock.calls.find(([p])=>p==='/api/storage/connections/4/browse')[1].body)).toEqual({path:'/usb1'});
 expect(w.findAll('button').find(b=>b.text()==='Choisir ce dossier').attributes('disabled')).toBeUndefined();
 await w.findAll('button').find(b=>b.text()==='Voir les volumes montés').trigger('click');await flushPromises();
 expect(w.findAll('button').find(b=>b.text()==='Choisir ce dossier').attributes('disabled')).toBeDefined();
 expect(w.text()).toContain('/usb1');
 w.unmount();
});
