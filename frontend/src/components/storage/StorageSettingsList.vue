<template>
  <PanelCard title="Vos stockages" description="Capacité, accès et correspondances des emplacements utilisés par vos transferts.">
    <UiDataTable label="Stockages" :rows="filtered" :columns="columns" :row-key="row=>row.id">
      <template #cell-name="{row}"><strong>{{ row.name }}</strong><small>{{ row.mappings?.length || 0 }} dossier(s) associé(s)</small></template>
      <template #cell-capacity="{row}"><strong>{{ gb(row.free_bytes) }} libres</strong><small>sur {{ gb(row.total_bytes) }} · {{ row.checked_at?'dernier contrôle':'capacité à confirmer' }}</small><UiProgress v-if="row.total_bytes && row.free_bytes!=null" :value="(row.total_bytes-row.free_bytes)/row.total_bytes*100" :label="`Espace utilisé de ${row.name}`" /></template>
      <template #cell-access="{row}"><span>{{ connectionNames(row) }}</span><small>{{ row.virtual?'À configurer':'Contrôle des accès à l’aperçu' }}</small></template>
      <template #cell-actions="{row}"><UiButton @click="$emit('edit',row)">Configurer</UiButton></template>
    </UiDataTable>
    <div class="settings-tools"><UiButton @click="$emit('connections')">Gérer les connexions</UiButton><UiButton @click="$emit('inventory')">Consulter l’inventaire</UiButton></div>
  </PanelCard>
</template>
<script setup lang="ts">
import {computed} from 'vue';import PanelCard from '@/components/ui/PanelCard.vue';import UiDataTable,{type UiColumn} from '@/components/ui/UiDataTable.vue';import UiButton from '@/components/ui/UiButton.vue';import UiProgress from '@/components/ui/UiProgress.vue';
const props=defineProps<{locations:any[],accesses:any[],connections:any[],query?:string}>();defineEmits<{edit:[location:any],connections:[],inventory:[]}>();
const filtered=computed(()=>props.locations.filter(l=>(l.name||`Stockage ${l.id}`).toLowerCase().includes((props.query||'').toLowerCase())));
const gb=(n:number|null)=>n==null?'—':`${(n/1e9).toLocaleString('fr-FR',{maximumFractionDigits:1})} Go`;
function connectionNames(location:any){const names=new Set<string>();for(const m of location.mappings||[])for(const access of props.accesses)if(access.roots?.some((r:any)=>r.arr_instance_id===m.arr_instance_id&&r.arr_root===m.arr_root)){const c=props.connections.find(c=>c.id===access.connection_id);names.add(c?`${c.name} · ${c.method==='ssh'?'SSH':'Local'}`:access.name);}return [...names].join(' · ')||'Aucune connexion';}
const columns:UiColumn[]=[{key:'name',label:'Stockage',card:'title'},{key:'capacity',label:'Capacité disponible'},{key:'access',label:'Connexion / accès'},{key:'actions',label:'Actions',card:'actions'}];
</script>
<style scoped>.settings-tools{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}.ui-progress{margin-top:10px}</style>
