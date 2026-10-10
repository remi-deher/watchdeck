import {mount,flushPromises} from '@vue/test-utils';
import {defineComponent,ref} from 'vue';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {useStorageLiveTelemetry} from './useStorageLiveTelemetry';
const {request}=vi.hoisted(()=>({request:vi.fn()}));
vi.mock('@/api',()=>({api:request}));

const job=()=>({id:4,status:'running',desired_state:'run',params:{transfer_mode:'rsync_ssh',name:'Keep name'},items:[{id:15,title:'Keep title',status:'copying',snapshot:{source_arr:'/data/Series'},progress:{bytes_per_second:1e6}}]});
let wrapper:any;
function setup(){
 const jobs=ref<any[]>([job()]),loading=ref(false);
 wrapper=mount(defineComponent({setup(){useStorageLiveTelemetry(jobs,loading);return ()=>null;}}));
 return {jobs,loading};
}
beforeEach(()=>{vi.useFakeTimers();request.mockReset();vi.spyOn(document,'hidden','get').mockReturnValue(false);});
afterEach(()=>{wrapper?.unmount();wrapper=null;vi.useRealTimers();vi.restoreAllMocks();});

describe('one-second live telemetry',()=>{
 it('reads only telemetry each second and preserves names and snapshots',async()=>{
  const {jobs}=setup();
  const work={key:'transfer:4',state:'running',stage:'Copie',progress:{percent:25,scope:'copy'}};
  jobs.value[0].items[0].media={id:1,poster_url:'/poster.jpg',backdrop_url:'/backdrop.jpg'};
  request.mockResolvedValue([{id:4,status:'running',work,items:[{id:15,status:'copying',progress:{bytes_per_second:25e6}}]}]);
  await vi.advanceTimersByTimeAsync(1000);await flushPromises();
  expect(request).toHaveBeenCalledExactlyOnceWith('/api/storage/transfers/telemetry?ids=4');
  expect(jobs.value[0].items[0]).toMatchObject({title:'Keep title',snapshot:{source_arr:'/data/Series'},progress:{bytes_per_second:25e6}});
  expect(jobs.value[0].params.name).toBe('Keep name');
  expect(jobs.value[0].work).toEqual(work);
  expect(jobs.value[0].items[0].media).toEqual({id:1,poster_url:'/poster.jpg',backdrop_url:'/backdrop.jpg'});
  await vi.advanceTimersByTimeAsync(1000);expect(request).toHaveBeenCalledTimes(2);
  wrapper.unmount();await vi.advanceTimersByTimeAsync(2000);expect(request).toHaveBeenCalledTimes(2);
 });
 it('does not overlap requests or poll hidden, loading or completed tasks',async()=>{
  const {jobs,loading}=setup();let resolve:any;
  request.mockImplementation(()=>new Promise(done=>{resolve=done;}));
  await vi.advanceTimersByTimeAsync(3000);expect(request).toHaveBeenCalledTimes(1);
  resolve([]);await flushPromises();
  loading.value=true;await vi.advanceTimersByTimeAsync(1000);expect(request).toHaveBeenCalledTimes(1);
  loading.value=false;vi.spyOn(document,'hidden','get').mockReturnValue(true);
  await vi.advanceTimersByTimeAsync(1000);expect(request).toHaveBeenCalledTimes(1);
  vi.spyOn(document,'hidden','get').mockReturnValue(false);jobs.value[0].status='completed';
  await vi.advanceTimersByTimeAsync(1000);expect(request).toHaveBeenCalledTimes(1);
 });
 it('discards delayed responses after a full refresh and retains measurements after errors',async()=>{
  const {jobs}=setup();let resolve:any;
  request.mockImplementationOnce(()=>new Promise(done=>{resolve=done;}));
  await vi.advanceTimersByTimeAsync(1000);
  jobs.value=[{...job(),params:{name:'New configuration',transfer_mode:'rsync_ssh'}}];
  resolve([{id:4,status:'blocked',items:[{id:15,status:'blocked',progress:{bytes_per_second:99}}]}]);await flushPromises();
  expect(jobs.value[0].status).toBe('running');expect(jobs.value[0].params.name).toBe('New configuration');
  request.mockRejectedValue(new Error('offline'));await vi.advanceTimersByTimeAsync(1000);
  expect(jobs.value[0].items[0].progress.bytes_per_second).toBe(1e6);
 });
 it('leaves structural item changes to the full refresh',async()=>{
  const {jobs}=setup();
  request.mockResolvedValue([{id:4,status:'running',items:[{id:16,status:'copying'}]}]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(jobs.value[0].items[0].id).toBe(15);
 });
});
