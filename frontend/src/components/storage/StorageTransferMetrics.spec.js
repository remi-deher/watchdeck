import {mount} from '@vue/test-utils';
import {describe,it,expect,vi} from 'vitest';
import {transferMetrics,copyDuration} from './transferMetrics';
import StorageTransferMetrics from './StorageTransferMetrics.vue';

const job=()=>({id:3,status:'running',desired_state:'run',params:{transfer_mode:'rsync_ssh'},items:[{status:'completed',size_bytes:10e9},{status:'copying',size_bytes:20e9,progress:{copied_bytes:5e9,bytes_per_second:25e6,updated_at:100}},{status:'pending',size_bytes:10e9}]});
describe('Transfer copy metrics',()=>{
  it('counts partial bytes across the lot and estimates only the remaining copy',()=>{
    const m=transferMetrics(job(),105);
    expect(m).toMatchObject({total:40e9,copied:15e9,remaining:25e9,rate:25e6,seconds:1000,percent:37.5});
  });
  it('does not count Plex confirmation as bytes still needing copying',()=>{
    const j=job();j.items[1].status='plex_pending';
    expect(transferMetrics(j,105).remaining).toBe(10e9);
    expect(transferMetrics(j,105).rate).toBeNull();
  });
  it('discards stale rates and never estimates paused or API transfers',()=>{
    expect(transferMetrics(job(),116).seconds).toBeNull();
    const j=job();j.desired_state='pause';expect(transferMetrics(j,105).rate).toBeNull();
    j.desired_state='run';j.params.transfer_mode='arr';expect(transferMetrics(j,105).rate).toBeNull();
  });
  it('accepts a fresh sample ahead of the display tick but rejects large clock offsets',()=>{
    const j=job();j.items[1].progress.updated_at=105.7;
    expect(transferMetrics(j,105).rate).toBe(25e6);
    expect(transferMetrics(j,106).rate).toBe(25e6);
    expect(transferMetrics(j,121).rate).toBeNull();
    expect(transferMetrics(j,90).rate).toBeNull();
  });
  it('keeps the current-speed label when new samples arrive between clock ticks',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date(105000));
    const j=job();j.items[1].progress.last_bytes_per_second=25e6;
    const wrapper=mount(StorageTransferMetrics,{props:{job:j}});
    try {
      for(let second=105;second<109;second++){
        const next=job();next.items[1].progress={...j.items[1].progress,updated_at:second+0.7};
        await wrapper.setProps({job:next});
        expect(wrapper.text()).toContain('Débit actuel');
        expect(wrapper.text()).not.toContain('Dernier débit mesuré');
        await vi.advanceTimersByTimeAsync(1000);
        expect(wrapper.text()).toContain('Débit actuel');
      }
      await vi.advanceTimersByTimeAsync(15000);
      expect(wrapper.text()).toContain('Dernier débit mesuré');
    } finally {wrapper.unmount();vi.useRealTimers();}
  });
  it('clamps byte counters and formats rounded hour boundaries',()=>{
    const j=job();j.items[1].progress.copied_bytes=100e9;
    expect(transferMetrics(j,105).copied).toBe(30e9);
    expect(copyDuration(3599)).toBe('1 h');
    expect(copyDuration(null)).toBe('—');
  });
  it('expires displayed speed even when the server stops publishing updates',async()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date(105000));
    const wrapper=mount(StorageTransferMetrics,{props:{job:job()}});
    try {
      expect(wrapper.text()).toContain('25 Mo/s');
      await vi.advanceTimersByTimeAsync(15000);
      expect(wrapper.text()).not.toContain('25 Mo/s');
      expect(wrapper.text()).toContain('Reste à copier');
    } finally {wrapper.unmount();vi.useRealTimers();}
  });
});


describe('retained transfer measurements',()=>{
 it('retains historical speed without inventing an ETA during verification',()=>{
  const j={status:'finalizing',desired_state:'run',params:{transfer_mode:'rsync_ssh'},items:[{status:'verifying',size_bytes:100,progress:{copied_bytes:100,bytes_per_second:null,last_bytes_per_second:25e6,rate_measured_at:100}}]};
  const m=transferMetrics(j,120);
  expect(m.lastRate).toBe(25e6);expect(m.rate).toBeNull();expect(m.seconds).toBeNull();expect(m.copied).toBe(100);
 });
});


it('utilise la mesure du travail entier et conserve une progression inconnue', () => {
  const current = {...job(), work: {progress: {percent: null, scope: 'copy'}}};
  expect(transferMetrics(current, 105).percent).toBeNull();
  const wrapper = mount(StorageTransferMetrics, {props: {job: current}});
  expect(wrapper.find('.copy-heading strong').text()).toBe('—');
  expect(wrapper.find('[role="progressbar"]').exists()).toBe(false);
  wrapper.unmount();
});
