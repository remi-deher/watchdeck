<template>
 <ModalShell :open="true" title="3 · Aperçu des déplacements" :busy="busy" :error="error" panel-class="storage-preview-modal" @close="$emit('close')">
  <p>{{ selected.length }} titre(s) sélectionné(s) · {{ gb(selectedBytes) }}</p>
  <section v-for="group in plan.groups" :key="group.body.arr_instance_id"><h3>{{ group.name }} · {{ group.body.source_roots?.join(', ') || group.body.source_root }} → {{ group.body.destination_root }}</h3>
   <p v-for="source in group.sources || [group.source]" :key="source.id">{{ source.name }} : {{ gb(source.free_bytes) }} → {{ gb(source.free_bytes==null?null:source.free_bytes+sourceVolume(group,source.id)) }} libres après déplacement</p><p>Destination : {{ gb(group.destination.free_bytes) }} → {{ gb(group.destination.free_bytes==null?null:group.destination.free_bytes-volume(group)) }} libres</p>
   <p v-if="!group.goal_covered" class="warning">Objectif partiellement couvert.</p><p v-if="group.submitted">Lot déjà lancé.</p>
   <UiDataTable :label="`Titres proposés ${group.name}`" :rows="group.items" :columns="columns" :row-key="row=>row.key"><template #cell-select="{row}"><input v-model="selected" type="checkbox" :value="row.key" :disabled="busy || group.submitted" :aria-label="`Sélectionner ${row.title}`" /></template><template #cell-size="{row}">{{ gb(row.size_bytes) }}</template><template #cell-source="{row}"><code>{{ row.snapshot.source_arr }}</code></template><template #cell-destination="{row}"><code>{{ row.snapshot.destination_arr }}</code></template></UiDataTable>
   <details v-if="group.excluded.length"><summary>{{ group.excluded.length }} titre(s) écartés</summary><p v-for="item in group.excluded" :key="item.key">{{ item.title }} : {{ item.explanation }}</p></details>
  </section><div class="actions"><UiButton :disabled="busy" @click="$emit('close')">Retour à la préparation</UiButton><UiButton :disabled="busy || !selected.length" @click="$emit('save')">Enregistrer la tâche</UiButton><UiButton variant="primary" :loading="busy" :disabled="!selected.length" @click="$emit('launch')">Lancer la sélection</UiButton></div>
 </ModalShell>
</template>
<script setup lang="ts">
import {computed} from 'vue';import ModalShell from '@/components/ui/ModalShell.vue';import UiDataTable,{type UiColumn} from '@/components/ui/UiDataTable.vue';import UiButton from '@/components/ui/UiButton.vue';
const props=defineProps<{plan:any,busy:boolean,error:string,gb:(v:any)=>string}>();const selected=defineModel<string[]>({required:true});
const volume=(group:any)=>group.items.filter((i:any)=>selected.value.includes(i.key)).reduce((s:number,i:any)=>s+i.size_bytes,0);
const sourceVolume=(group:any,id:number)=>group.items.filter((i:any)=>selected.value.includes(i.key) && (i.snapshot.source_location_id===id || !i.snapshot.source_location_id)).reduce((s:number,i:any)=>s+i.size_bytes,0);
const selectedBytes=computed(()=>props.plan.groups.reduce((s:number,g:any)=>s+volume(g),0));
const columns:UiColumn[]=[{key:'select',label:'Choix'},{key:'title',label:'Titre',card:'title'},{key:'size',label:'Volume'},{key:'source',label:'Source'},{key:'destination',label:'Destination'},{key:'explanation',label:'Sélection'}];
defineEmits<{close:[],launch:[],save:[]}>();
</script>
<style>.storage-preview-modal{width:min(1100px,calc(100vw - 32px));color:var(--text)}.storage-preview-modal .actions{display:flex;gap:12px;flex-wrap:wrap}.storage-preview-modal code{overflow-wrap:anywhere;white-space:normal}</style>
