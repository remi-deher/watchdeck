import {mount} from '@vue/test-utils';import {describe,it,expect} from 'vitest';import Field from './StorageReserveField.vue';
describe('Storage reserve',()=>{
 it('starts disabled, converts percent and does not require a scan',async()=>{
  const w=mount(Field,{props:{modelValue:{reserve_gb:0,reserve_percent:null},totalBytes:4000e9}});
  expect(w.find('input[type=number]').exists()).toBe(false);await w.find('input[type=checkbox]').setValue(true);await w.find('select').setValue('percent');await w.find('input[type=number]').setValue(5);expect(w.text()).toContain('5 % ≈ 200 Go');expect(w.emitted('update:modelValue')?.at(-1)?.[0]).toMatchObject({reserve_percent:5,reserve_gb:0});w.unmount();
 });
 it('preserves existing absolute reserves',()=>{const w=mount(Field,{props:{modelValue:{reserve_gb:100},totalBytes:4000e9}});expect((w.find('input[type=checkbox]').element as HTMLInputElement).checked).toBe(true);expect(w.text()).toContain('100 Go ≈ 2,5 %');w.unmount();});
});
