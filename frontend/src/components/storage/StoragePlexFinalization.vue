<template>
 <div v-if="pending.length" class="plex-finalization" role="status" aria-live="polite">
  <strong>{{ copyDone ? 'Copie terminée · ' : '' }}Finalisation Plex {{ job.desired_state==='run'?'en arrière-plan':'en pause' }}</strong>
  <p>{{ pending.length }} titre(s) à confirmer<template v-if="job.params?.transfer_mode!=='arr'"> · {{ gb(retained) }} conservés à la source</template>.</p>
  <small>Scans ciblés et contrôles automatiques. La fiche Plex existante doit reconnaître la destination avant la finalisation.<template v-if="checked"> Dernier contrôle : {{ formatTimeSeconds(checked*1000) }}.</template></small>
 </div>
</template>
<script setup lang="ts">
import { formatTimeSeconds } from '@/utils/format';
import {computed} from 'vue';
const props=defineProps<{job:any,gb:(value:any)=>string}>();
const pending=computed(()=>props.job.items.filter((i:any)=>['plex_pending','cleaning'].includes(i.status)));
const retained=computed(()=>pending.value.reduce((sum:number,i:any)=>sum+i.size_bytes,0));
const checked=computed(()=>Math.max(0,...pending.value.map((i:any)=>i.progress?.plex_checked_at||0)));
const copyDone=computed(()=>props.job.items.every((i:any)=>['completed','plex_pending','cleaning'].includes(i.status)));
</script>
<style scoped lang="scss">
.plex-finalization{margin-top:16px;padding:12px 14px;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-md);overflow-wrap:anywhere}.plex-finalization p{margin:5px 0;font-size:var(--fs-sm)}.plex-finalization small{color:var(--muted);font-size:var(--fs-sm)}
</style>
