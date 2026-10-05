import {mount} from '@vue/test-utils';
import {describe,it,expect} from 'vitest';
import StorageObjectiveFields from './StorageObjectiveFields.vue';
import StorageObjectiveSummary from './StorageObjectiveSummary.vue';
const model=()=>({mode:'release_space',goal_gb:20,target_titles:null,max_titles:250,preference:'closest',routes:[{arr_instance_id:1,source_roots:['/data/FILMS','/data2/FILMS'],root_goals:{}}]});
describe('Storage objectives',()=>{
 it('defaults to one global space goal and enables exact title count',async()=>{
  const form=model();const wrapper=mount(StorageObjectiveFields,{props:{modelValue:form,busy:false,protectedTitles:[]}});
  expect(wrapper.text()).toContain('Espace à libérer au total');
  await wrapper.findAll('select')[0].setValue('count');expect(form.target_titles).toBe(5);
  expect(wrapper.text()).toContain('Un film ou une série entière');
 });
 it('changing the general value resets source customizations',async()=>{
  const form=model();form.routes[0].root_goals={'/data/FILMS':100};
  const wrapper=mount(StorageObjectiveFields,{props:{modelValue:form,busy:false,protectedTitles:[]}});
  await wrapper.find('input[type=number]').setValue(30);
  expect(form.routes[0].root_goals).toEqual({'/data/FILMS':30,'/data2/FILMS':30});
 });
 it('manual selection hides space and title constraints',()=>{
  const form={...model(),mode:'selection'};const wrapper=mount(StorageObjectiveFields,{props:{modelValue:form,busy:false,protectedTitles:[]}});
  expect(wrapper.find('input[type=number]').exists()).toBe(false);
 });
 it('updates both goals immediately on deselection',async()=>{
  const plan={mode:'release_space',requested_bytes:20e9,requested_titles:5,groups:[{items:[{key:'a',size_bytes:12e9},{key:'b',size_bytes:9e9}]}]};
  const wrapper=mount(StorageObjectiveSummary,{props:{plan,selected:['a','b'],gb:v=>`${v/1e9} Go`}});
  expect(wrapper.text()).toContain('2 / 5 titres');expect(wrapper.text()).toContain('Dépassement : 1 Go');
  await wrapper.setProps({selected:['a']});expect(wrapper.text()).toContain('Il manque 8 Go');
 });
});
