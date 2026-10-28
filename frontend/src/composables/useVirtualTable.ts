import { computed, nextTick, ref, watch, type Ref } from 'vue';
import { useEventListener, useResizeObserver } from '@vueuse/core';
import { useVirtualizer, defaultRangeExtractor, observeElementOffset, observeElementRect, observeWindowOffset, observeWindowRect, elementScroll, windowScroll } from '@tanstack/vue-virtual';

/** Measured row groups: window or nearest scrolling sheet, dynamic mobile cards. */
export function useVirtualTable<T extends {id:string}>(
  container: Ref<HTMLElement | null>, table: Ref<HTMLTableElement | null>,
  rows: Ref<T[]>, enabled: Ref<boolean>, estimate: Ref<number>,
) {
  const parent = ref<HTMLElement | Window | null>(null);
  const margin = ref(0);
  const focused = ref<string | null>(null);
  function updateParent() {
    let node=container.value?.parentElement;
    while(node && node!==document.body && node!==document.documentElement){
      if (/(auto|scroll)/.test(getComputedStyle(node).overflowY)) { parent.value=node; updateMargin(); return; }
      node=node.parentElement;
    }
    parent.value=window; updateMargin();
  }
  function updateMargin() {
    if(!enabled.value || !table.value || !parent.value)return;
    const rect=table.value.getBoundingClientRect();
    const header=table.value.tHead?.getBoundingClientRect().height || 0;
    margin.value=parent.value===window ? rect.top+window.scrollY+header : rect.top-(parent.value as HTMLElement).getBoundingClientRect().top+(parent.value as HTMLElement).scrollTop+header;
  }
  const virtualizer=useVirtualizer<any, HTMLElement>(computed(()=>{
    const focusIndex=focused.value===null?-1:rows.value.findIndex(row=>row.id===focused.value);
    return {
      count:rows.value.length,enabled:enabled.value,overscan:6,scrollMargin:margin.value,
      getScrollElement:()=>parent.value,
      estimateSize:()=>estimate.value,
      getItemKey:(index:number)=>rows.value[index]?.id ?? index,
      initialRect:{width:typeof window==='undefined'?0:window.innerWidth,height:typeof window==='undefined'?0:window.innerHeight},
      measureElement:(element:HTMLElement)=>element.getBoundingClientRect().height || estimate.value,
      rangeExtractor:(range:any)=>[...new Set([...defaultRangeExtractor(range),...(focusIndex>=0?[focusIndex]:[])])].sort((a,b)=>a-b),
      observeElementRect:(instance:any,callback:any)=>instance.scrollElement===window?observeWindowRect(instance,callback):observeElementRect(instance,callback),
      observeElementOffset:(instance:any,callback:any)=>instance.scrollElement===window?observeWindowOffset(instance,callback):observeElementOffset(instance,callback),
      scrollToFn:(offset:number,options:any,instance:any)=>instance.scrollElement===window?windowScroll(offset,options,instance):elementScroll(offset,options,instance),
    };
  }));
  const blocks=computed(()=>{
    if(!enabled.value)return rows.value.map((row,index)=>({row,index,gap:0}));
    const items=virtualizer.value.getVirtualItems();
    if(!items.length)return rows.value.slice(0,30).map((row,index)=>({row,index,gap:0}));
    let end=0;
    return items.map(item=>{
      const start=item.start-margin.value;
      const block={row:rows.value[item.index],index:item.index,gap:Math.max(0,start-end)};
      end=item.end-margin.value;
      return block;
    });
  });
  const bottom=computed(()=>{
    if(!enabled.value)return 0;
    const items=virtualizer.value.getVirtualItems();
    const end=items.length?items[items.length-1].end-margin.value:Math.min(rows.value.length,30)*estimate.value;
    return Math.max(0,virtualizer.value.getTotalSize()-end);
  });
  let cleanupQueued = false;
  function measure(element: unknown) {
    if(!element && !cleanupQueued){
      cleanupQueued=true;
      void nextTick(()=>{cleanupQueued=false;virtualizer.value.measureElement(null);});
    } else if(enabled.value && element instanceof HTMLElement) virtualizer.value.measureElement(element);
  }
  function rememberFocus(event:FocusEvent){
    const group=[...(table.value?.querySelectorAll<HTMLElement>(':scope > tbody[data-row-key]') || [])].find(group=>group.contains(event.target as Node));
    if(group)focused.value=group.dataset.rowKey || null;
  }
  function forgetFocus(event:FocusEvent){
    if(event.relatedTarget && !container.value?.contains(event.relatedTarget as Node))focused.value=null;
  }
  async function focusRow(index:number,last=false){
    if(index<0||index>=rows.value.length)return;
    focused.value=rows.value[index].id;
    virtualizer.value.scrollToIndex(index,{align:'auto'});
    await nextTick();
    const group=table.value?.querySelector<HTMLElement>(`tbody[data-index="${index}"]`);
    const targets=group?[...group.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(el=>getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden'):[];
    const destination = (last?targets[targets.length-1]:targets[0]) || group?.querySelector<HTMLElement>('tr');
    if(destination){ if(!targets.length)destination.tabIndex=-1; destination.focus({preventScroll:true}); }
  }
  function keyboard(event:KeyboardEvent){
    if(!enabled.value)return;
    const target=event.target as HTMLElement;
    if(target===container.value && event.key==='ArrowDown'){event.preventDefault();void focusRow(0);return;}
    const group=target.closest<HTMLElement>('tbody[data-index]');if(!group || target.closest('table')!==table.value)return;
    const index=Number(group.dataset.index);
    if(target.matches('tr') && ['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();void focusRow(event.key==='Home'?0:event.key==='End'?rows.value.length-1:index+(event.key==='ArrowDown'?1:-1));
    } else if(event.key==='Tab'){
      const controls=[...group.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]')].filter(el=>getComputedStyle(el).display!=='none'&&getComputedStyle(el).visibility!=='hidden');
      const atEdge=event.shiftKey?target===controls[0]:target===controls[controls.length-1];
      const next=index+(event.shiftKey?-1:1);
      if(atEdge&&next>=0&&next<rows.value.length){event.preventDefault();void focusRow(next,event.shiftKey);}
    }
  }
  useEventListener(container,'focusin',rememberFocus);useEventListener(container,'focusout',forgetFocus);
  useEventListener(container,'keydown',keyboard);
  useEventListener(typeof window==='undefined'?null:window,'scroll',updateMargin,{passive:true});
  let previousWidth = 0;
  useResizeObserver(container,()=>{
    updateMargin();
    if(!container.value)return;
    const width=container.value.getBoundingClientRect().width;
    estimate.value=parseFloat(getComputedStyle(container.value).getPropertyValue('--virtual-row-estimate')) || 64;
    if(width!==previousWidth){previousWidth=width;virtualizer.value.measure();}
  });
  // Seed measured rows already present when progressive loading crosses the threshold.
  watch(enabled,(active)=>{updateMargin();if(active)table.value?.querySelectorAll<HTMLElement>('tbody[data-index]').forEach(element=>virtualizer.value.measureElement(element));});
  watch([container,table],()=>{if(typeof window!=='undefined')void nextTick(updateParent);},{flush:'post',immediate:true});
  watch(()=>rows.value.length,()=>{void nextTick(updateMargin);});
  watch(estimate,()=>virtualizer.value.measure());
  return {blocks,bottom,measure,refresh:()=>virtualizer.value.measure()};
}
