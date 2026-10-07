<template>
  <section v-if="current" class="current-media" :class="{hero}" :style="hero && current.art_url ? {'--media-art':`url(${proxyUrl(current.art_url)})`}:{}">
    <MediaPoster class="current-poster" :poster-url="current.poster_url" :alt="`Affiche de ${current.title}`" sizes="90px" />
    <div class="current-body">
      <small>{{ job.desired_state==='run'?'Média en cours de transfert':'Dernier média traité' }} · {{ status(current.status) }}</small>
      <h3>{{ current.title }}</h3>
      <p v-if="current.progress?.file" class="current-file">{{ filename }}</p>
      <UiProgress v-if="current.status==='copying' && filePercent!==null" :value="filePercent" :label="`Fichier : ${filePercent} %`" />
      <div class="current-counts" v-if="current.media_type==='series' && job.params?.transfer_mode!=='arr'">
        <UiBadge v-if="counts?.episodes!=null">{{ counts.episodes }} épisode(s) à finir</UiBadge>
        <UiBadge v-if="counts?.seasons!=null">{{ counts.seasons }} saison(s) concernée(s)</UiBadge>
        <span v-if="eta">Cette série : ≈ {{ eta }} de copie</span>
      </div>
      <small v-if="current.media_type==='series' && counts?.episodes!=null">Le fichier en cours est inclus dans le nombre restant.</small>
    </div>
  </section>
</template>
<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref} from 'vue';
import MediaPoster from '@/components/media/MediaPoster.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import {proxyUrl} from '@/utils/mediaImage';
import {transferMetrics,copyDuration} from './transferMetrics';
const props=defineProps<{job:any,hero?:boolean,status:(value:string)=>string}>();
const current=computed(()=>props.job.items?.find((i:any)=>i.status==='copying')||props.job.items?.find((i:any)=>['prepared','verifying','switching','plex_pending','cleaning','arr_pending'].includes(i.status)));
const filename=computed(()=>current.value?.progress?.file?.replaceAll('\\','/').split('/').at(-1));
const counts=computed(()=>current.value?.presentation?.remaining_counts);
const filePercent=computed(()=>{const p=current.value?.progress;return p?.file_size_bytes>0?Math.min(100,Math.round((p.bytes||0)/p.file_size_bytes*100)):null;});
const now=ref(Date.now()/1000);let timer:ReturnType<typeof setInterval>|undefined;
onMounted(()=>timer=setInterval(()=>now.value=Date.now()/1000,1000));onUnmounted(()=>clearInterval(timer));
const eta=computed(()=>{const m=transferMetrics(props.job,now.value);return m.rate && current.value?.status==='copying'?copyDuration(Math.max(0,current.value.size_bytes-(current.value.progress?.copied_bytes||0))/m.rate):null;});
</script>
<style scoped>
.current-media{display:grid;grid-template-columns:68px minmax(0,1fr);gap:16px;border-top:1px solid var(--border);padding-top:16px;margin-top:16px;min-width:0}.current-poster{width:68px;aspect-ratio:2/3;border-radius:var(--radius-md);overflow:hidden}.current-body{min-width:0}.current-body h3{font-size:var(--fs-base);margin:4px 0 8px}.current-body small{color:var(--muted);font-size:var(--fs-xs)}.current-file{font-size:var(--fs-sm);overflow-wrap:anywhere;margin:4px 0 10px;color:var(--muted)}.current-counts{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0 6px;font-size:var(--fs-xs)}.current-counts>span{color:var(--accent)}.hero{background:linear-gradient(90deg,var(--surface),transparent),var(--media-art,none) center/cover;padding:20px;border:1px solid var(--border);border-radius:var(--panel-radius)}
</style>
