<template>
  <!-- Le verdict de la zone, en tête de chaque section : on sait d'abord si quelque chose
       est cassé, avant de chercher quoi. « Tout tester » revérifie tout côté serveur. -->
  <section class="connections-verdict" :class="`is-${tone}`" aria-labelledby="connections-verdict-title" aria-live="polite">
    <div class="connections-verdict__text">
      <h2 id="connections-verdict-title">{{ title }}</h2>
      <p>{{ subtitle }}</p>
    </div>
    <UiButton v-if="firstError && firstError.to" variant="primary" size="sm" :to="firstError.to">Corriger {{ firstError.name }}</UiButton>
    <UiButton size="sm" :loading="refreshing" @click="refresh"><template #icon><RefreshCw /></template>Tout tester</UiButton>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RefreshCw } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import { useToast } from '@/composables/useToast';
import { checkedLabel, useConnectionsStatus, verdictOf, type ConnectionLine } from './connectionsStatus';

/* L'écran où se corrige chaque connexion. */
function screenOf(line: ConnectionLine): string {
  if (line.kind === 'plex' || line.kind === 'tracearr' || line.kind === 'tautulli') return '/settings/services';
  if (line.instance_id) return '/settings/services/media';
  return '/settings/services/integrations';
}

const status = useConnectionsStatus();
const { addToast } = useToast();
const verdict = computed(() => verdictOf(status.items.value));
const refreshing = ref(false);

const tone = computed(() => (status.loading.value || refreshing.value ? 'idle' : verdict.value.errors.length ? 'error' : 'good'));
const title = computed(() => {
  if (refreshing.value) return 'Vérification des connexions…';
  if (status.loading.value) return 'Vérification des connexions…';
  if (status.failed.value) return 'État des connexions indisponible';
  const count = verdict.value.errors.length;
  if (count) return `${count} connexion${count > 1 ? 's' : ''} en erreur`;
  return verdict.value.activeCount ? 'Toutes les connexions répondent' : 'Aucune connexion active';
});
const subtitle = computed(() => {
  if (status.loading.value || refreshing.value) return 'Plex, Sonarr, Radarr, TMDB et les services facultatifs.';
  if (status.failed.value) return 'Relancez la vérification.';
  const { errors, okCount, activeCount } = verdict.value;
  const names = errors.length ? `${errors.map((line) => line.name).join(', ')} · ` : '';
  return `${names}${okCount} sur ${activeCount} opérationnelle${activeCount > 1 ? 's' : ''} · ${checkedLabel(status.checkedAt.value)}`;
});
const firstError = computed(() => {
  const line = verdict.value.errors[0];
  return line ? { name: line.name, to: screenOf(line) } : null;
});

async function refresh(): Promise<void> {
  refreshing.value = true;
  try {
    await status.refreshAll();
    const count = verdictOf(status.items.value).errors.length;
    addToast({ type: count ? 'warning' : 'success', title: count ? `${count} connexion${count > 1 ? 's' : ''} en erreur` : 'Toutes les connexions répondent' });
  } catch (error: any) {
    addToast({ type: 'error', title: 'Vérification impossible', message: error?.message || '' });
  } finally {
    refreshing.value = false;
  }
}
</script>

<style scoped lang="scss">
.connections-verdict {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
}
.connections-verdict.is-good { border-color: color-mix(in srgb, var(--green) 45%, var(--border)); background: color-mix(in srgb, var(--green) 7%, var(--surface)); }
.connections-verdict.is-error { border-color: color-mix(in srgb, var(--red) 45%, var(--border)); background: color-mix(in srgb, var(--red) 7%, var(--surface)); }
.connections-verdict__text { flex: 1 1 14rem; min-width: 0; }
.connections-verdict__text h2 { margin: 0 0 2px; font-size: var(--fs-md); }
.connections-verdict__text p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
</style>
