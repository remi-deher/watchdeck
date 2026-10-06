<template>
  <div class="transfer-metrics">
    <div class="copy-heading"><span><strong>{{ Math.round(metrics.percent) }} %</strong> du volume copié</span><span>{{ job.items.filter((i:any)=>i.status==='completed').length }} / {{ job.items.length }} titres terminés</span></div>
    <UiProgress v-if="job.params?.transfer_mode!=='arr' && metrics.total>0" :value="metrics.percent" :label="`Volume copié de la tâche ${job.id}`" />
    <dl>
      <div><dt>Total</dt><dd>{{ gb(metrics.total) }}</dd></div>
      <div><dt>Transféré</dt><dd>{{ gb(metrics.copied) }}</dd></div>
      <div><dt>{{ job.status==='cancelled'?'Non transféré':'Reste à copier' }}</dt><dd>{{ gb(metrics.remaining) }}</dd></div>
      <div><dt>{{ metrics.rate?'Débit actuel':'Dernier débit mesuré' }}</dt><dd>{{ (metrics.rate || metrics.lastRate)?`${((metrics.rate || metrics.lastRate)/1e6).toLocaleString('fr-FR',{maximumFractionDigits:1})} Mo/s`:'—' }}</dd></div>
      <div><dt>Durée écoulée</dt><dd>{{ copyDuration(metrics.elapsed) }}</dd></div>
      <div><dt>Temps de copie restant</dt><dd>{{ metrics.seconds!=null?`≈ ${copyDuration(metrics.seconds)}`:'—' }}</dd></div>
    </dl>
    <small v-if="job.params?.transfer_mode==='arr'">Sonarr / Radarr ne fournit pas le débit ni la progression des fichiers : seuls les titres copiés et confirmés sont comptés.</small>
    <small v-else-if="metrics.rate">Estimation au débit actuel, hors vérification, confirmation Plex et suppression des originaux.</small>
    <small v-else-if="metrics.lastRate">Dernière mesure conservée ; l’estimation reprendra avec une mesure de copie récente.</small>
    <small v-else-if="job.status==='running' && job.desired_state==='run'">Débit et estimation disponibles pendant la copie, après les premières mesures.</small>
  </div>
</template>
<script setup lang="ts">
import {computed,onMounted,onUnmounted,ref} from 'vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import {transferMetrics,copyDuration} from './transferMetrics';
const props=defineProps<{job:any}>();
const now=ref(Date.now()/1000);
let timer:ReturnType<typeof setInterval>|undefined;
onMounted(()=>{timer=setInterval(()=>{now.value=Date.now()/1000;},5000);});
onUnmounted(()=>clearInterval(timer));
const metrics=computed(()=>transferMetrics(props.job,now.value));
const gb=(bytes:number)=>`${(bytes/1e9).toLocaleString('fr-FR',{maximumFractionDigits:1})} Go`;
</script>
<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.transfer-metrics{min-width:0;margin:12px 0}.transfer-metrics dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,135px),1fr));gap:12px;margin:0 0 10px}.transfer-metrics dl>div{min-width:0}.transfer-metrics dt{font-size:var(--fs-sm);color:var(--muted);line-height:1.4}.transfer-metrics dd{margin:4px 0 0;font-weight:600;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.transfer-metrics small{display:block;color:var(--muted);font-size:var(--fs-sm);line-height:1.5;margin-top:8px}
.copy-heading{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:var(--fs-sm);color:var(--muted);margin-bottom:8px}.copy-heading strong{font-size:24px;color:var(--text)}.transfer-metrics :deep(.ui-progress){margin-bottom:18px;height:8px}.transfer-metrics dd{font-size:20px}.transfer-metrics dl>div:nth-last-child(-n+2) dd{color:var(--accent)}@include bp.until(phablet){.transfer-metrics dl{grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.transfer-metrics dl>div:last-child{grid-column:1/-1}}
</style>
