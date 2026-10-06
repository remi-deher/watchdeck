<template>
  <ModalShell :open="Boolean(item)" :title="item?.title || 'Détails du titre'" @close="$emit('close')">
    <UiFeedback v-if="item?.reason" type="warning" :message="item.reason" />
    <dl v-if="item" class="item-details">
      <dt>État</dt><dd>{{ status(item.status) }}</dd>
      <dt>Volume</dt><dd>{{ gb(item.size_bytes) }}</dd>
      <dt>Dernière activité</dt><dd>{{ date(item.updated_at) }}</dd>
      <dt>Original</dt><dd><code>{{ item.snapshot?.source_arr }}</code></dd>
      <dt>Destination</dt><dd><code>{{ item.snapshot?.destination_arr }}</code></dd>
      <dt v-if="item.progress?.file">Fichier actuel</dt><dd v-if="item.progress?.file"><code>{{ item.progress.file }}</code></dd>
    </dl>
    <template #actions><UiButton @click="$emit('close')">Fermer</UiButton></template>
  </ModalShell>
</template>
<script setup lang="ts">
import ModalShell from '@/components/ui/ModalShell.vue';
import UiFeedback from '@/components/ui/UiFeedback.vue';
import UiButton from '@/components/ui/UiButton.vue';
defineProps<{item:any,status:(value:string)=>string,gb:(value:any)=>string,date:(value:any)=>string}>();
defineEmits<{close:[]}>();
</script>
<style scoped lang="scss">
.item-details{display:grid;gap:6px;min-width:0}.item-details dt{color:var(--muted);font-size:var(--fs-sm);margin-top:10px}.item-details dd{margin:0;min-width:0;overflow-wrap:anywhere}.item-details code{white-space:normal;overflow-wrap:anywhere}
</style>
