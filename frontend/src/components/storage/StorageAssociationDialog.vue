<template>
      <ModalShell :open="open" title="Association Arr / Plex" panel-class="storage-association-modal" :error="error" :busy="busy" @close="$emit('close')">
      <p>Associez les racines Arr et Plex. Aucun chemin du moteur à renseigner.</p>
      <form class="association-form" @submit.prevent="$emit('save')">
        <h3>{{ editId ? 'Modifier le stockage' : 'Ajouter un stockage' }}</h3>
        <div class="form-grid"><label>Nom<input v-model="locationForm.name" required maxlength="100" /></label><label class="check"><input v-model="locationForm.enabled" type="checkbox" /> Actif</label></div>
        <fieldset v-for="(mapping, index) in locationForm.mappings" :key="index"><legend>Correspondance {{ index + 1 }}</legend><div class="form-grid"><label>Instance<select v-model.number="mapping.arr_instance_id" required @change="resetMappingRoots(mapping)"><option v-for="i in instances" :key="i.id" :value="i.id">{{ i.name }} · {{ i.arr_type }}</option></select></label><label>Dossier racine déclaré dans Arr<select v-model="mapping.arr_root" required><option value="" disabled>Choisir un dossier vérifié</option><option v-for="root in rootsFor(mapping).arr_roots" :key="root" :value="root">{{ root }}</option></select></label><label>Dossier déclaré dans Plex<select :value="plexChoice(mapping)" required @change="selectPlexRoot(mapping, ($event.target as HTMLSelectElement).value)"><option value="" disabled>Choisir la bibliothèque et son dossier</option><option v-for="root in rootsFor(mapping).plex_roots" :key="JSON.stringify([root.section_id, root.path])" :value="JSON.stringify([root.section_id, root.path])">{{ root.library }} · {{ root.path }}</option></select></label><p v-if="rootsFor(mapping).error" class="warning">{{ rootsFor(mapping).error }}</p></div><div class="mapping-check"><p v-if="mapping.arr_root && mapping.plex_root"><strong>À comparer :</strong> {{ mapping.arr_root }} ↔ {{ mapping.plex_root }}</p><div v-if="draftComparisons[draftKey(mapping)]" aria-live="polite"><p :class="draftComparisons[draftKey(mapping)].status === 'sample_matched' ? 'healthy' : 'warning'">{{ comparisonLabel(draftComparisons[draftKey(mapping)]) }}</p><small v-if="draftComparisons[draftKey(mapping)].checked_at">Contrôlé le {{ date(draftComparisons[draftKey(mapping)].checked_at) }} · aucun fichier déplacé</small><details v-if="draftComparisons[draftKey(mapping)].items?.length"><summary>Voir les titres et fichiers contrôlés</summary><p v-for="item in draftComparisons[draftKey(mapping)].items" :key="item.title">{{ item.title }} : {{ item.reason || `${item.files} fichier(s) et identité concordants` }}</p></details><p>Le contrôle porte sur cet échantillon ; tous les titres seront revérifiés avant leur déplacement.</p></div></div><UiButton v-if="locationForm.mappings.length > 1" @click="locationForm.mappings.splice(index, 1)">Retirer cette correspondance</UiButton></fieldset>
        <div class="actions"><UiButton @click="locationForm.mappings.push(newMapping())">Ajouter une correspondance</UiButton><UiButton type="submit" variant="primary" :loading="busy">Vérifier et enregistrer</UiButton><UiButton v-if="editId" @click="$emit('close')">Annuler</UiButton></div>
      </form>
      </ModalShell>
</template>
<script setup lang="ts">
import {draftKey,comparisonLabel,plexChoice,selectPlexRoot,resetMappingRoots,newAssociationMapping} from './storageAssociations';
import UiButton from '@/components/ui/UiButton.vue';
import ModalShell from '@/components/ui/ModalShell.vue';
const props=defineProps<{open:boolean,busy:boolean,error?:string,editId:number|null,instances:any[],roots:any[],checking:string,draftComparisons:Record<string,any>,date:(value:any)=>string}>();
const rootsFor=(mapping:any)=>props.roots.find(r=>r.arr_instance_id===mapping.arr_instance_id)||{arr_roots:[],plex_roots:[]};
const newMapping=()=>newAssociationMapping(props.instances[0]?.id||0);
const locationForm=defineModel<{name:string,mount_path:string,reserve_gb:number,enabled:boolean,mappings:any[]}>({required:true});
defineEmits<{save:[],close:[],check:[mapping:any]}>();
</script>

<style scoped lang="scss">
@use './storage' as storage;
@include storage.styles;
</style>

<style lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.storage-association-modal {
  color: var(--text);
  .association-form { min-width: 0; }
  p, label, legend, h3 { color: var(--text); line-height: 1.6; overflow-wrap: anywhere; }
  small { color: var(--muted); opacity: 1; }
  input, select { width: 100%; color: var(--text); background: var(--surface-2); font-size: 16px; line-height: 1.5; }
  option { color: var(--text); background: var(--surface-2); }
  .check input { width: auto; flex-shrink: 0; }
  fieldset { min-width: 0; }
  .warning { color: var(--accent); }
  .healthy { color: var(--green-text); }
  @include bp.until(tablet) { .form-grid { grid-template-columns: minmax(0, 1fr); } }
}
</style>
