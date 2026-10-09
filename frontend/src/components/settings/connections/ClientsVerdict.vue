<template>
  <!-- En tête de l'onglet Clients : les clients répondent-ils, que font-ils, et y a-t-il
       quelque chose à traiter dans les acquisitions ou le stockage, qui ont leur page. -->
  <section class="clients-verdict" :class="`is-${tone}`" aria-labelledby="clients-verdict-title" aria-live="polite">
    <div class="clients-verdict__text">
      <h2 id="clients-verdict-title">{{ title }}</h2>
      <p>{{ subtitle }}</p>
    </div>
    <UiButton size="sm" :loading="refreshing" @click="refresh"><template #icon><RefreshCw /></template>Tout tester</UiButton>
  </section>
  <div class="clients-links">
    <RouterLink class="clients-link" to="/storage">
      <small>Stockage</small>
      <strong>{{ blocked ?? '–' }}</strong>
      <span>{{ blocked === 1 ? 'transfert bloqué' : 'transferts bloqués' }}{{ connections ? ` · ${connections} connexion${connections > 1 ? 's' : ''}` : '' }} ↗</span>
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { RefreshCw } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import { useAdminOverview } from '@/composables/useAdminOverview';
import { useSession } from '@/composables/useSession';
import { useToast } from '@/composables/useToast';
import { checkedLabel } from './connectionsStatus';
import { useClientsStatus } from './clientsStatus';

const status = useClientsStatus();
const { isAdmin } = useSession();
const { overview } = useAdminOverview(isAdmin);
const { addToast } = useToast();
const refreshing = ref(false);

const active = computed(() => status.items.value.filter((line) => line.state !== 'off'));
const errors = computed(() => active.value.filter((line) => line.state === 'error'));
const tone = computed(() => (status.loading.value || refreshing.value ? 'idle' : errors.value.length ? 'error' : 'good'));
const title = computed(() => {
  if (status.loading.value || refreshing.value) return 'Vérification des clients…';
  if (status.failed.value) return 'État des clients indisponible';
  if (errors.value.length) return `${errors.value.map((line) => line.name).join(', ')} ne répond pas`;
  return active.value.length ? 'Tous les clients répondent' : 'Aucun client actif';
});
const subtitle = computed(() => {
  if (status.loading.value || refreshing.value || status.failed.value) return 'qBittorrent, Transmission et dossiers surveillés.';
  const downloading = active.value.reduce((sum, line) => sum + (line.downloading || 0), 0);
  const seeding = active.value.reduce((sum, line) => sum + (line.seeding || 0), 0);
  return `${active.value.length} client${active.value.length > 1 ? 's' : ''} actif${active.value.length > 1 ? 's' : ''} · ${downloading} en téléchargement · ${seeding} en partage · ${checkedLabel(status.checkedAt.value)}`;
});

const data = computed(() => overview.value as any);
const blocked = computed<number | null>(() => data.value?.storage?.blocked_transfers ?? data.value?.storage?.failed_transfers ?? null);
const connections = computed<number>(() => data.value?.storage?.connections || 0);

async function refresh(): Promise<void> {
  refreshing.value = true;
  try {
    await status.refreshAll();
    addToast({ type: errors.value.length ? 'warning' : 'success', title: errors.value.length ? `${errors.value.length} client en erreur` : 'Tous les clients répondent' });
  } catch (error: any) {
    addToast({ type: 'error', title: 'Vérification impossible', message: error?.message || '' });
  } finally {
    refreshing.value = false;
  }
}
</script>

<style scoped lang="scss">
.clients-verdict { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); }
.clients-verdict.is-good { border-color: color-mix(in srgb, var(--green) 45%, var(--border)); background: color-mix(in srgb, var(--green) 7%, var(--surface)); }
.clients-verdict.is-error { border-color: color-mix(in srgb, var(--red) 45%, var(--border)); background: color-mix(in srgb, var(--red) 7%, var(--surface)); }
.clients-verdict__text { flex: 1 1 14rem; min-width: 0; }
.clients-verdict__text h2 { margin: 0 0 2px; font-size: var(--fs-md); }
.clients-verdict__text p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.clients-links { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--space-3); }
.clients-link { display: grid; gap: 2px; padding: var(--space-3) var(--space-4); border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); color: var(--text); text-decoration: none; }
.clients-link:hover { border-color: var(--accent); }
.clients-link small { color: var(--muted); }
.clients-link strong { font-size: var(--fs-xl, 1.4rem); }
</style>
