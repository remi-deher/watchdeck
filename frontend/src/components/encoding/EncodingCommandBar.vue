<template>
  <!-- Barre de commande des sections Encodage : etat de FileFlows, automatismes actifs,
       pause generale. Une seule source pour toutes les sections. -->
  <div class="cmd" :class="{ 'is-compact': compact }" role="region" aria-label="État de FileFlows">
    <span class="cmd-state">
      <span class="cmd-dot" :class="dotClass" aria-hidden="true" />
      <strong>{{ stateLabel }}</strong>
    </span>
    <span v-if="control" class="cmd-meta">{{ control.runners }} runner{{ control.runners > 1 ? 's' : '' }}{{ control.runners_mode === 'auto' ? ' · auto' : '' }}</span>
    <span class="cmd-spacer" />
    <span v-if="control?.reorder_enabled" class="cmd-pill is-accent">Alternance</span>
    <span v-if="control && control.plex_pause !== 'off'" class="cmd-pill is-warning">Pause lecture : {{ PLEX_PAUSE_LABELS[control.plex_pause].toLowerCase() }}</span>
    <span v-if="pausedDisks.length" class="cmd-pill is-warning"><CirclePause aria-hidden="true" />{{ pausedDisks.join(', ') }} en pause</span>
    <template v-if="status?.connected">
      <UiButton v-if="status.paused" size="sm" variant="primary" :loading="pauseMutation.isPending.value" @click="pauseMutation.mutate(0)"><Play />Reprendre</UiButton>
      <UiMenu v-else label="Mettre en pause" align="end">
        <template #trigger><UiButton size="sm" :loading="pauseMutation.isPending.value"><Pause />Pause</UiButton></template>
        <UiMenuItem v-for="option in PAUSE_OPTIONS" :key="option.minutes" @select="pauseMutation.mutate(option.minutes)">{{ option.label }}</UiMenuItem>
      </UiMenu>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query';
import { CirclePause, Pause, Play } from '@lucide/vue';
import { api } from '@/api';
import { PLEX_PAUSE_LABELS, fileflowsControlQuery, useFileflowsStatus } from '@/composables/useFileflows';
import { useToast } from '@/composables/useToast';
import { queryKeys } from '@/queryKeys';
import { humanizeError } from '@/utils/apiError';
import UiButton from '@/components/ui/UiButton.vue';
import UiMenu from '@/components/ui/UiMenu.vue';
import UiMenuItem from '@/components/ui/UiMenuItem.vue';

withDefaults(defineProps<{ compact?: boolean }>(), { compact: false });

/* La pause laisse finir le fichier en cours (FileFlows ne l'interrompt pas). */
const PAUSE_OPTIONS = [
  { minutes: 60, label: 'Pendant 1 heure' },
  { minutes: 6 * 60, label: 'Pendant 6 heures' },
  { minutes: 24 * 60, label: 'Pendant 24 heures' },
  { minutes: 7 * 24 * 60, label: 'Pendant 7 jours' },
];

const queryClient = useQueryClient();
const { addToast } = useToast();
const { status } = useFileflowsStatus();
const controlQuery = useQuery({ ...fileflowsControlQuery(), enabled: computed(() => Boolean(status.value?.connected)) });
const control = computed(() => controlQuery.data.value || null);
const pausedDisks = computed<string[]>(() => (control.value?.plex_pause !== 'off' && control.value?.guard?.paused_disks) || []);

const stateLabel = computed(() => {
  if (!status.value) return 'Connexion à FileFlows…';
  if (status.value.connected === false) return 'FileFlows injoignable';
  if (status.value.paused) return 'FileFlows en pause';
  return status.value.processing ? 'FileFlows actif' : 'FileFlows en attente';
});
const dotClass = computed(() => {
  if (!status.value?.connected) return 'is-danger';
  if (status.value.paused) return 'is-warning';
  return status.value.processing ? 'is-success' : 'is-idle';
});

const pauseMutation = useMutation({
  mutationFn: (minutes: number) => api('/api/fileflows/pause', { method: 'POST', body: JSON.stringify({ minutes }) }),
  onSuccess: (_, minutes) => {
    addToast({ type: 'success', message: minutes ? 'FileFlows mis en pause' : 'FileFlows reprend les traitements' });
    void queryClient.invalidateQueries({ queryKey: queryKeys.fileflows.all });
  },
  onError: (error) => addToast({ type: 'error', message: humanizeError(error) }),
});
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;
.cmd { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); }
.cmd.is-compact { padding: var(--space-2) var(--space-3); }
.cmd-state { display: flex; align-items: center; gap: var(--space-2); }
.cmd-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.cmd-dot.is-success { background: var(--green); }
.cmd-dot.is-warning { background: var(--amber); }
.cmd-dot.is-danger { background: var(--red); }
.cmd-meta { color: var(--muted); font-size: var(--fs-sm); }
.cmd-spacer { flex: 1; }
.cmd-pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px; border-radius: var(--radius-pill); font-size: var(--fs-xs); font-weight: 650; }
.cmd-pill svg { width: 13px; height: 13px; }
.cmd-pill.is-accent { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); }
.cmd-pill.is-warning { background: color-mix(in srgb, var(--amber) 16%, transparent); color: var(--amber-text); }
/* En outil de page sur petit ecran : l'etat et la pause seulement ; les automatismes se
   lisent dans la Vue d'ensemble et les Reglages. */
@include bp.until(phablet) {
  .cmd.is-compact .cmd-pill, .cmd.is-compact .cmd-meta { display: none; }
}
</style>
