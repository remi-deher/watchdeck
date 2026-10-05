<template>
    <section class="storage-grid">
      <div class="overview-stats wide"><PanelCard><small>En cours</small><strong>{{ activeJobs.length }} tâche(s)</strong><p>{{ pausedJobs.length }} en pause ou arrêtée(s)</p></PanelCard><PanelCard><small>À traiter</small><strong class="warning">{{ issues.length }} titre(s)</strong><p>{{ issues.length?'Attentes et erreurs à consulter':'Aucun point bloquant' }}</p></PanelCard><PanelCard><small>Espace libéré</small><strong class="healthy">{{ gb(releasedBytes) }}</strong><p>{{ completedItems.length }} titre(s) terminés · originaux supprimés</p></PanelCard></div>
      <article class="storage-card wide"><h2>Transfert actif</h2><p v-if="!activeJobs.length">Aucun transfert actif.</p><div v-for="job in activeJobs" :key="job.id" class="active-transfer"><StorageTransferSummary :job="job" :instance="instances?.find(i=>i.id===job.params?.arr_instance_id)?.name || 'Sonarr / Radarr'" :source="locationName(job.source_id)" :destination="locationName(job.destination_id)" :status="status" :gb="gb" :date="date"><template #actions><UiButton @click="$emit('navigate','transfers')">Voir la tâche</UiButton></template></StorageTransferSummary></div></article>
      <article class="storage-card wide"><div class="overview-section-heading"><h2>Capacité des stockages</h2><UiButton variant="ghost" @click="$emit('navigate','settings')">Stockages et correspondances</UiButton></div><p v-if="!locations.length">L’espace libre des racines Arr sera mesuré lors de la préparation du déplacement.</p><UiDataTable v-if="locations.length" density="compact" class="capacity-table" label="Capacité des stockages" :rows="locations" :columns="CAPACITY_COLUMNS" :row-key="row=>row.id">
        <template #cell-name="{row}"><strong>{{ row.name }}</strong><small>{{ row.mount_path || row.mappings?.[0]?.arr_root }}</small></template>
        <template #cell-free="{row}">{{ gb(row.free_bytes) }} libres<small>{{ row.total_bytes == null ? 'Total non mesuré' : gb(row.total_bytes)+' au total' }}</small></template>
        <template #cell-usage="{row}"><template v-if="row.total_bytes>0 && row.free_bytes!=null">{{ usedPercent(row) }} %<UiProgress :value="usedPercent(row)" :label="`Utilisation de ${row.name}`" /></template><span v-else>Non mesurée</span></template>
        <template #cell-projected="{row}">{{ gb(projectedFree(row)) }}</template>
        <template #cell-health="{row}">{{ !row.enabled ? 'Désactivé' : ['arr_verified','ok'].includes(row.health) ? 'Accessible' : 'À contrôler' }}<small>{{ date(row.checked_at) }}</small></template>
      </UiDataTable><small v-if="locations.length">L’espace projeté inclut les tâches en pause et les titres à traiter ; d’autres écritures peuvent le modifier.</small></article>

      <div class="overview-bottom wide">      <article class="storage-card">
        <div class="overview-section-heading"><h2>Points à traiter</h2><UiButton variant="ghost" @click="$emit('navigate','transfers')">Voir les détails</UiButton></div>
        <p>Une copie ne libère de place qu’après validation et suppression de l’original. Les attentes et erreurs ne bloquent pas les autres titres.</p>
        <p v-if="!issues.length">Aucun titre à traiter.</p>
        <details v-for="item in issues" :key="item.id"><summary>{{ item.title }} · {{ status(item.status) }}</summary><p>{{ item.reason }}</p><p>Original : {{ item.snapshot.source_arr }}</p><p>Destination : {{ item.snapshot.destination_arr }}</p></details>
      </article>
      <article class="storage-card"><div class="overview-section-heading"><h2>Activité récente</h2><UiButton variant="ghost" @click="$emit('navigate','history')">Historique</UiButton></div><p v-if="!recentRows.length">Aucun lot terminé ou interrompu.</p><UiDataTable v-else density="compact" label="Historique récent des lots" :rows="recentRows" :columns="RECENT_COLUMNS" :row-key="row => row.id"><template #cell-route="{row}"><strong>{{ row.route }}</strong><small>{{ row.titles }} · {{ row.duration }}</small><small>{{ row.dates }}</small></template><template #cell-volume="{row}">{{ gb(row.volume) }}</template></UiDataTable></article>
</div><footer class="overview-footer wide"><span>{{ mappingCount }} association(s) enregistrée(s) · {{ rootCount }} racine(s) détectée(s)</span><span>Actualisation en arrière-plan</span></footer>
    </section>
</template>
<script setup lang="ts">
import {ref,toRef} from 'vue';
import StorageTransferSummary from './StorageTransferSummary.vue';
import PanelCard from '@/components/ui/PanelCard.vue';
import UiProgress from '@/components/ui/UiProgress.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDataTable, {type UiColumn} from '@/components/ui/UiDataTable.vue';
import {useStorageTelemetry} from './useStorageTelemetry';
const props=defineProps<{jobs:any[],locations:any[],busy:boolean,mappingCount:number,rootCount:number,instances?:any[]}>();
const tab=ref('overview');
const RECENT_COLUMNS:UiColumn[]=[{key:'route',label:'Trajet',card:'title'},{key:'volume',label:'Volume libéré'},{key:'state',label:'État'}];
const CAPACITY_COLUMNS:UiColumn[]=[{key:'name',label:'Stockage',card:'title'},{key:'free',label:'Libre / total'},{key:'usage',label:'Utilisation'},{key:'projected',label:'Libre projeté'},{key:'health',label:'État'}];
const {remainingItems,completedItems,remainingBytes,releasedBytes,activeJobs,pausedJobs,remainingFor,REMAINING_COLUMNS,remainingRows,usedPercent,reservePercent,projectedFree,activeItem,copyPercent,rateLabel,copyEta,HISTORY_COLUMNS,jobStart,jobEnd,elapsed,recentRows,issues,visibleJobs,gb,date,locationName,status}=useStorageTelemetry(toRef(props,'locations'),toRef(props,'jobs'),tab,ref(null),ref<string[]>([]));
defineEmits<{navigate:[section:string],command:[id:number,action:string]}>();
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.overview-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.overview-stats small{color:var(--muted);font-size:var(--fs-sm)}.overview-stats strong{display:block;font-size:26px;margin:6px 0}.overview-stats p{font-size:var(--fs-sm);color:var(--muted);margin:0}.overview-section-heading{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px}.overview-section-heading h2{margin:0}.overview-bottom{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px}.overview-bottom .storage-card{margin-bottom:0}.overview-footer{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;color:var(--muted);font-size:var(--fs-sm)}.capacity-table :deep(.ui-progress){margin-top:5px;min-width:65px}.overview-bottom :deep(td small){display:block;color:var(--muted);margin-top:4px;overflow-wrap:anywhere}@include bp.until(tablet){.overview-bottom{grid-template-columns:1fr}}@include bp.until(phablet){.overview-stats{gap:8px}.overview-stats :deep(.panel-card){padding:12px 10px}.overview-stats strong{font-size:20px}.overview-stats p,.overview-stats small{font-size:11px}}
</style>
