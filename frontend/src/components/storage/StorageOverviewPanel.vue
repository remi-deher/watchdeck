<template>
    <section class="storage-grid">
      <article class="storage-card summary-card"><h2>Titres restants</h2><strong class="metric">{{ remainingItems.length }}</strong><p>{{ gb(remainingBytes) }} à déplacer dans les tâches enregistrées</p><small>{{ activeJobs.length }} tâche(s) en cours ou en attente · {{ pausedJobs.length }} en pause ou arrêtée(s)</small><div class="card-footer"><UiButton @click="$emit('navigate','transfers')">Voir les transferts</UiButton></div></article>
      <article class="storage-card summary-card"><h2>Espace libéré</h2><strong class="metric">{{ gb(releasedBytes) }}</strong><p>{{ completedItems.length }} titre(s) terminés</p><small>Seuls les originaux supprimés après validation sont comptabilisés.</small><div class="card-footer"><UiButton @click="$emit('navigate','history')">Voir l’historique</UiButton></div></article>
      <article class="storage-card summary-card"><h2>Configuration</h2><strong class="metric">{{ locations.length }} stockage(s)</strong><p>{{ mappingCount }} correspondance(s) enregistrée(s) sur {{ rootCount }} racine(s) détectée(s)</p><small>{{ locations.filter(l => l.enabled && l.health === 'arr_verified').length }} racine(s) contrôlée(s) par Arr. Les accès et les associations Plex seront revérifiés avant chaque déplacement.</small><div class="card-footer"><UiButton @click="$emit('navigate','settings')">Configurer les stockages</UiButton></div></article>
      <article v-if="!locations.length" class="storage-card wide"><h2>Préparer un déplacement avec Sonarr / Radarr</h2><p>Choisissez une instance et ses racines source et destination. Leurs accès et la correspondance Plex seront vérifiés ; aucun chemin moteur à renseigner.</p><UiButton @click="$emit('navigate','prepare')">Préparer un déplacement</UiButton></article>
      <article class="storage-card wide"><h2>Capacité des stockages</h2><p v-if="!locations.length">L’espace libre des racines Arr sera mesuré lors de la préparation du déplacement.</p><UiDataTable v-if="locations.length" class="capacity-table" label="Capacité des stockages" :rows="locations" :columns="CAPACITY_COLUMNS" :row-key="row=>row.id">
        <template #cell-name="{row}"><strong>{{ row.name }}</strong><small>{{ row.mount_path || row.mappings?.[0]?.arr_root }}</small></template>
        <template #cell-free="{row}">{{ gb(row.free_bytes) }} libres<small>{{ row.total_bytes == null ? 'Total non mesuré' : gb(row.total_bytes)+' au total' }}</small></template>
        <template #cell-reserve="{row}">{{ gb(row.reserve_bytes) }}</template>
        <template #cell-projected="{row}">{{ gb(projectedFree(row)) }}</template>
        <template #cell-health="{row}">{{ !row.enabled ? 'Désactivé' : ['arr_verified','ok'].includes(row.health) ? 'Accessible' : 'À contrôler' }}<small>{{ date(row.checked_at) }}</small></template>
      </UiDataTable><small v-if="locations.length">L’espace projeté inclut les tâches en pause et les titres à traiter ; d’autres écritures peuvent le modifier.</small></article>
      <article class="storage-card wide"><h2>Transfert actif</h2><p v-if="!activeJobs.length">Aucun transfert actif.</p><div v-for="job in activeJobs" :key="job.id" class="active-transfer"><StorageTransferSummary :job="job" :instance="instances?.find(i=>i.id===job.params?.arr_instance_id)?.name || 'Sonarr / Radarr'" :source="locationName(job.source_id)" :destination="locationName(job.destination_id)" :status="status" :gb="gb" :date="date"><template #actions><UiButton @click="$emit('navigate','transfers')">Voir la tâche</UiButton></template></StorageTransferSummary></div></article>
      <article class="storage-card wide">
        <h2>À traiter · {{ issues.length }}</h2>
        <p>Une copie ne libère de place qu’après validation et suppression de l’original. Les attentes et erreurs ne bloquent pas les autres titres.</p>
        <p v-if="!issues.length">Aucun titre à traiter.</p>
        <details v-for="item in issues" :key="item.id"><summary>{{ item.title }} · {{ status(item.status) }}</summary><p>{{ item.reason }}</p><p>Original : {{ item.snapshot.source_arr }}</p><p>Destination : {{ item.snapshot.destination_arr }}</p></details>
      </article>
      <article class="storage-card wide"><h2>Historique récent</h2><p v-if="!recentRows.length">Aucun lot terminé ou interrompu.</p><UiDataTable v-else label="Historique récent des lots" :rows="recentRows" :columns="HISTORY_COLUMNS" :row-key="row => row.id"><template #cell-volume="{row}">{{ gb(row.volume) }}</template></UiDataTable><UiButton @click="$emit('navigate','history')">Voir tout l’historique</UiButton></article>
    </section>
</template>
<script setup lang="ts">
import {ref,toRef} from 'vue';
import StorageTransferSummary from './StorageTransferSummary.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiDataTable, {type UiColumn} from '@/components/ui/UiDataTable.vue';
import {useStorageTelemetry} from './useStorageTelemetry';
const props=defineProps<{jobs:any[],locations:any[],busy:boolean,mappingCount:number,rootCount:number,instances?:any[]}>();
const tab=ref('overview');
const CAPACITY_COLUMNS:UiColumn[]=[{key:'name',label:'Stockage',card:'title'},{key:'free',label:'Libre / total'},{key:'reserve',label:'Réserve'},{key:'projected',label:'Libre projeté'},{key:'health',label:'État'}];
const {remainingItems,completedItems,remainingBytes,releasedBytes,activeJobs,pausedJobs,remainingFor,REMAINING_COLUMNS,remainingRows,usedPercent,reservePercent,projectedFree,activeItem,copyPercent,rateLabel,copyEta,HISTORY_COLUMNS,jobStart,jobEnd,elapsed,recentRows,issues,visibleJobs,gb,date,locationName,status}=useStorageTelemetry(toRef(props,'locations'),toRef(props,'jobs'),tab,ref(null),ref<string[]>([]));
defineEmits<{navigate:[section:string],command:[id:number,action:string]}>();
</script>
