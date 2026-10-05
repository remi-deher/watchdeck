import {mount} from '@vue/test-utils';
import {reactive} from 'vue';
import {describe,it,expect} from 'vitest';
import StorageTransferMethod from './StorageTransferMethod.vue';
import StoragePreparePanel from './StoragePreparePanel.vue';

const endpoint={id:1,name:'NAS',method:'ssh',revision:'rev',validation:{revision:'rev'},roots:[{arr_instance_id:1,arr_root:'/data/FILMS'},{arr_instance_id:1,arr_root:'/usb/FILMS'}]};
describe('Explicit transfer methods',()=>{
 it('keeps Arr available and disables rsync without a validated access',()=>{
  const wrapper=mount(StorageTransferMethod,{props:{modelValue:{transfer_mode:'arr'},accesses:[{...endpoint,validation:{}}],busy:false}});
  const choices=wrapper.findAll('input[type=checkbox]');
  expect(choices[0].element.disabled).toBe(false);
  expect(choices[1].element.disabled).toBe(true);
  expect(choices[2].element.disabled).toBe(true);
  expect(wrapper.text()).toContain('commande déjà lancée peut continuer');
  expect(wrapper.text()).toContain('doivent être testés et validés');
  expect(wrapper.text()).toContain('aucun accès aux volumes montés configuré');
  expect(wrapper.findAll('.transfer-method.unavailable')).toHaveLength(2);
  expect(choices[1].attributes('aria-describedby')).toBe('unavailable-rsync_ssh');
 });
 it('offers only validated accesses and pins the mode once copying starts',()=>{
  const wrapper=mount(StorageTransferMethod,{props:{modelValue:{transfer_mode:'rsync_ssh',access_id:1,verification:'standard'},accesses:[endpoint],busy:false}});
  expect(wrapper.findAll('input[type=checkbox]')[0].element.disabled).toBe(false);
  expect(wrapper.findAll('input[type=checkbox]')[2].element.disabled).toBe(true);
  expect(wrapper.text()).toContain('Aucun changement de mode après le début');
  expect(wrapper.find('select').exists()).toBe(false);
  expect(wrapper.find('input[type=radio][value=standard]').element.checked).toBe(true);
  expect(wrapper.text()).toContain('partage NFS / SMB');
 });
 it.each([true,false])('requires every route root to be covered (%s)',covered=>{
  const model={transfer_mode:'rsync_ssh',access_id:1,max_titles:250,routes:[{arr_instance_id:1,source_roots:['/data/FILMS'],destination_root:'/usb/FILMS'}]};
  const access={...endpoint,roots:covered?endpoint.roots:endpoint.roots.slice(0,1)};
  const wrapper=mount(StoragePreparePanel,{props:{modelValue:model,roots:[{arr_instance_id:1,name:'Radarr',arr_roots:['/data/FILMS','/usb/FILMS']}],accesses:[access],busy:false}});
  expect(wrapper.find('button[type=submit]').element.disabled).toBe(!covered);
 });
 it('allows multiple modes and stores their chosen priority order',async()=>{
  const model=reactive({transfer_mode:'arr',transfer_methods:['arr'],access_ids:{},routes:[],verification:'standard'});
  const wrapper=mount(StorageTransferMethod,{props:{modelValue:model,accesses:[endpoint],busy:false}});
  await wrapper.findAll('input[type=checkbox]')[1].setValue(true);
  expect(model.transfer_methods).toEqual(['arr','rsync_ssh']);
  expect(model.access_ids.rsync_ssh).toBe(1);
  await wrapper.find('button[aria-label="Monter la priorité de Rsync par SSH"]').trigger('click');
  expect(model.transfer_methods).toEqual(['rsync_ssh','arr']);
  expect(wrapper.findAll('input[type=checkbox]')[0].element.checked).toBe(true);
  wrapper.unmount();
 });
 it('requires at least one enabled method',()=>{
  const wrapper=mount(StoragePreparePanel,{props:{modelValue:{transfer_methods:[],max_titles:250,routes:[{arr_instance_id:1,source_roots:['/data/FILMS'],destination_root:'/usb/FILMS'}]},roots:[{arr_instance_id:1,name:'Radarr',arr_roots:['/data/FILMS','/usb/FILMS']}],accesses:[],busy:false}});
  expect(wrapper.find('button[type=submit]').element.disabled).toBe(true);
  wrapper.unmount();
 });
 it('uses the configured SSH access for each root without extra selectors',()=>{
  const model={transfer_methods:['rsync_ssh'],max_titles:250,routes:[{arr_instance_id:1,source_roots:['/data/FILMS'],destination_root:'/usb/FILMS'}]};
  const accesses=[{...endpoint,roots:[endpoint.roots[0]]},{...endpoint,id:2,name:'ARTEMIS',roots:[endpoint.roots[1]]}];
  const wrapper=mount(StoragePreparePanel,{props:{modelValue:model,roots:[{arr_instance_id:1,name:'Radarr',arr_roots:['/data/FILMS','/usb/FILMS'],capacities:{'/data/FILMS':{free_bytes:500e9},'/usb/FILMS':{free_bytes:100e9}}}],accesses,busy:false}});
  expect(wrapper.find('button[type=submit]').element.disabled).toBe(false);
  expect(wrapper.findAll('select')).toHaveLength(1);
  expect(wrapper.text()).toContain('500 Go libres');
  expect(wrapper.text()).toContain('100 Go libres');
 });
 it('does not choose silently between ambiguous SSH accesses',()=>{
  const model={transfer_methods:['rsync_ssh'],routes:[{arr_instance_id:1,source_roots:['/data/FILMS'],destination_root:'/usb/FILMS'}]};
  const wrapper=mount(StorageTransferMethod,{props:{modelValue:model,accesses:[endpoint,{...endpoint,id:2}],busy:false}});
  expect(wrapper.text()).toContain('plusieurs accès SSH');
 });

});
