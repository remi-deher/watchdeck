<template>
  <div class="settings-grid">
    <div class="settings-cards span-two">
      <SettingsCard :title="`Conflits de deduplication`" :subtitle="`Doublons TMDB, entrees orphelines ou demandes bloquees depuis longtemps a nettoyer — ${conflicts.length} element(s) a examiner`" :icon="WandSparkles" :status="conflicts.length ? 'error' : 'active'" :collapsible="false">
        <template #actions>
          <UiButton @click.stop="autoResolve"><WandSparkles/>Resolution automatique</UiButton>
        </template>
        <p class="hint">"Fusionner" regroupe les entrees dupliquees en une seule (garde celle recommandee, supprime les autres). "Supprimer" retire une entree orpheline. "Ignorer" (coche) masque l'element sans le modifier.</p>
        <article v-for="group in conflicts" :key="group.key||group.tmdb_id" class="detail-row">
          <div><strong>{{ group.title||group.key||`TMDB ${group.tmdb_id}` }}</strong><span>{{ (group.entries||[]).length || 1 }} entree(s) · {{ group.type||'' }}</span></div>
          <div class="actions">
            <UiButton v-if="group.entries?.length" @click="resolve(group)">Fusionner</UiButton>
            <UiButton variant="danger" v-if="group.type==='orphan'" @click="removeOrphan(group)"><Trash2/>Supprimer</UiButton>
            <UiButton icon-only title="Ignorer" aria-label="Ignorer" @click="ignore(group)"><Check/></UiButton>
          </div>
        </article>
        <p v-if="!conflicts.length" class="empty">Aucun conflit detecte.</p>
      </SettingsCard>
    </div>
  </div>
  <ConfirmModal v-bind="confirmDialog" @cancel="resolveConfirm(false)" @confirm="resolveConfirm(true)" />
</template>
<script setup lang="ts">
import UiButton from '@/components/ui/UiButton.vue';
import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { Check, Trash2, WandSparkles } from '@lucide/vue';
import { api } from '@/api';
import { useRealtime } from '@/events';
import SettingsCard from './SettingsCard.vue';
import ConfirmModal from '../ConfirmModal.vue';
import { useConfirm } from '@/composables/useConfirm';

const queryClient = useQueryClient();
const conflictsQuery = useQuery({
  queryKey: ['settings', 'conflicts'],
  queryFn: () => api<any>('/api/conflicts'),
});
const conflicts = computed(() => {
  const data = conflictsQuery.data.value || {};
  return [...(data.tmdb_conflicts || []), ...(data.orphaned || []).map((x: any) => ({ ...x, type: 'orphan' })), ...(data.long_pending || []).map((x: any) => ({ ...x, type: 'pending' }))];
});
const { dialog: confirmDialog, askConfirm, resolveConfirm } = useConfirm();
const conflictMutation = useMutation({
  mutationFn: ({ path, method = 'POST', body }: { path: string; method?: string; body?: any }) => api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) }),
  retry: 0,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings', 'conflicts'] }),
});
async function autoResolve(): Promise<void> { await conflictMutation.mutateAsync({ path: '/api/conflicts/auto-resolve' }); }
async function resolve(group: any): Promise<void> { const entries=group.entries||[]; if(entries.length<2)return; const keep=group.recommended_id||entries[0].id; await conflictMutation.mutateAsync({ path:'/api/conflicts/resolve',body:{keep_id:keep,delete_ids:entries.filter((x:any)=>x.id!==keep).map((x:any)=>x.id)} }); }
async function ignore(group: any): Promise<void> { await conflictMutation.mutateAsync({ path:'/api/conflicts/ignore',body:{key:group.key} }); }
async function removeOrphan(group: any): Promise<void> { if(!await askConfirm({title:'Supprimer ce conflit ?',message:`${group.title} sera supprimé définitivement.`,confirmLabel:'Supprimer',danger:true}))return; await conflictMutation.mutateAsync({path:`/api/conflicts/orphan/${group.id}`,method:'DELETE'}); }

useRealtime(['request.updated', 'job.updated'], () => queryClient.invalidateQueries({ queryKey: ['settings', 'conflicts'] }));
</script>
