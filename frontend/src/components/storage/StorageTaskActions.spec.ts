import {mount} from '@vue/test-utils';
import {describe,expect,it} from 'vitest';
import StorageTaskActions from './StorageTaskActions.vue';

const UiMenu={template:'<div><slot name="trigger"/><slot/></div>'};
const UiMenuItem={emits:['select'],template:'<button @click="$emit(\'select\')"><slot/></button>'};
const UiButton={props:['iconOnly'],template:'<button><slot/></button>'};

describe('storage task relaunch',()=>{
  it('offers the completed task parameters for a fresh plan',async()=>{
    const job={id:12,status:'completed',params:{goal_gb:20}};
    const wrapper=mount(StorageTaskActions,{props:{job,busy:false},global:{stubs:{UiButton,UiMenu,UiMenuItem}}});
    const action=wrapper.findAll('button').find(button=>button.text().includes('Préparer une nouvelle tâche'));
    expect(action).toBeDefined();
    await action!.trigger('click');
    expect(wrapper.emitted('relaunch')?.[0]).toEqual([job]);
  });
});
