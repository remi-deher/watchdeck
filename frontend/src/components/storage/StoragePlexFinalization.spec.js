import {mount} from '@vue/test-utils';
import {describe,it,expect} from 'vitest';
import StoragePlexFinalization from './StoragePlexFinalization.vue';

const job=(mode='rsync_ssh',desired='run')=>({desired_state:desired,params:{transfer_mode:mode},items:[{status:'completed',size_bytes:3e9},{status:'plex_pending',size_bytes:2e9,progress:{plex_checked_at:1700000000}}]});
const gb=value=>`${value/1e9} Go`;
describe('Plex finalization feedback',()=>{
 it('separates finished copying from pending cleanup',()=>{
  const view=mount(StoragePlexFinalization,{props:{job:job(),gb}});
  expect(view.text()).toContain('Copie terminée');
  expect(view.text()).toContain('1 titre(s) à confirmer');
  expect(view.text()).toContain('2 Go conservés à la source');
  expect(view.text()).toContain('Dernier contrôle');
 });
 it('reflects pause and does not promise an original retained by the Arr API',()=>{
  const view=mount(StoragePlexFinalization,{props:{job:job('arr','pause'),gb}});
  expect(view.text()).toContain('en pause');
  expect(view.text()).not.toContain('conservés à la source');
 });
 it('disappears after finalization',()=>{
  const value=job();value.items[1].status='completed';
  const view=mount(StoragePlexFinalization,{props:{job:value,gb}});
  expect(view.find('[role="status"]').exists()).toBe(false);
 });
});
