<template>
  <div class="task-actions">
    <UiButton v-if="terminal" variant="primary" :disabled="busy" @click="$emit('relaunch',job)">Relancer</UiButton>
    <UiButton v-if="job.status==='draft'" variant="primary" :disabled="busy" @click="$emit('verify',job)">Vérifier et lancer</UiButton>
    <UiButton v-else-if="!terminal && !cancelRequested" variant="primary" :disabled="busy" @click="$emit('command',job.id,active?'pause':['blocked','failed'].includes(job.status)?'retry':'resume')">{{ active?'Mettre en pause':['blocked','failed'].includes(job.status)?'Réessayer':'Reprendre le lot' }}</UiButton>

    <UiMenu :disabled="busy" :label="job.params?.name || `Tâche #${job.id}`">
      <template #trigger><UiButton icon-only :aria-label="`Actions de la tâche ${job.id}`"><Ellipsis :size="20" /></UiButton></template>
      <UiMenuItem v-if="!terminal" :disabled="cancelling" @select="$emit('cancel',job)">{{ job.status==='cancel_blocked'?'Réessayer l’annulation':'Annuler la tâche' }}</UiMenuItem>
      <UiMenuItem v-if="job.status==='draft'" @select="$emit('edit',job)">Modifier</UiMenuItem>
      <UiMenuItem :disabled="cancelling" variant="danger" @select="$emit('remove',job)">{{ job.status==='draft'?'Supprimer le brouillon':'Supprimer la tâche' }}</UiMenuItem>
      <UiMenuItem v-if="!terminal && !cancelRequested && job.status!=='draft'" :disabled="job.status==='running'" @select="$emit('command',job.id,'retry')">Réessayer les titres en erreur</UiMenuItem>
      <UiMenuItem @select="$emit('duplicate',job)">Relancer avec de nouveaux paramètres</UiMenuItem>
    </UiMenu>
  </div>
</template>
<script setup lang="ts">
import {computed} from 'vue';
import {Ellipsis} from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';
const props=defineProps<{job:any,busy:boolean}>();
const terminal=computed(()=>['completed','cancelled'].includes(props.job.status));
const cancelRequested=computed(()=>['cancelling','cancel_blocked'].includes(props.job.status));
const cancelling=computed(()=>props.job.status==='cancelling');
const active=computed(()=>props.job.desired_state==='run' && ['running','queued','finalizing'].includes(props.job.status));
defineEmits<{command:[id:number,action:string],verify:[job:any],edit:[job:any],remove:[job:any],duplicate:[job:any],cancel:[job:any],relaunch:[job:any]}>();
</script>
<style scoped lang="scss">
.task-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;min-width:0}.task-actions :deep(button){min-height:44px}.task-actions :deep(button[aria-label]){min-width:44px}
@container card (max-width:600px){.task-actions{width:100%}.task-actions>button:not([aria-label]){flex:1;white-space:normal}}
</style>
