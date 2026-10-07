<template>
  <section class="overview-actions" aria-labelledby="overview-actions-title">
    <header class="overview-head"><h2 id="overview-actions-title">Actions rapides</h2></header>
    <ul class="overview-actions__list">
      <li v-for="action in ACTIONS" :key="action.key" class="overview-actions__item">
        <div class="overview-actions__text">
          <strong>{{ action.label }}</strong>
          <small>{{ lastRunLabel(action.key) }}</small>
        </div>
        <UiButton size="sm" :loading="running === action.key" :disabled="Boolean(running)" @click="run(action.key, action.label)">
          <template #icon><Play /></template>Lancer
        </UiButton>
      </li>
    </ul>
    <RouterLink class="overview-actions__more" to="/settings/maintenance">Toutes les opérations de maintenance</RouterLink>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RouterLink, useRouter } from 'vue-router';
import { Play } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import { api } from '@/api';
import { useToast } from '@/composables/useToast';
import { humanizeError } from '@/utils/apiError';
import { formatRelativeDate } from '@/utils/format';

const props = defineProps<{
  /** Dernier passage de chaque action, tel que l'aperçu serveur le donne. */
  maintenance: Record<string, { status: string; finished_at: string }> | null | undefined;
}>();
const emit = defineEmits<{ started: [] }>();

/* Les deux opérations qu'on relance le plus souvent. Le reste vit dans la Maintenance,
   avec sa progression en direct. */
const ACTIONS = [
  { key: 'warm-images', label: 'Précharger les images' },
  { key: 'retry-failed', label: 'Relancer les échouées' },
];

const router = useRouter();
const { addToast } = useToast();
const running = ref('');

function lastRunLabel(key: string): string {
  const last = props.maintenance?.[key];
  if (!last) return 'Aucun passage récent';
  const when = formatRelativeDate(last.finished_at).replace(/^I/, 'i').replace(/^À/, 'à');
  return `Dernier passage : ${when}${last.status === 'error' ? ' (en échec)' : ''}`;
}

async function run(key: string, label: string): Promise<void> {
  running.value = key;
  try {
    await api(`/api/maintenance/run/${key}`, { method: 'POST' });
    addToast({
      type: 'success',
      title: `${label} : lancé`,
      message: 'La progression se suit dans la Maintenance.',
      action: { label: 'Suivre', run: () => { void router.push('/settings/maintenance'); } },
    });
    emit('started');
  } catch (error) {
    addToast({ type: 'error', title: `${label} : impossible de lancer`, message: humanizeError(error) });
  } finally {
    running.value = '';
  }
}
</script>

<style scoped lang="scss">
.overview-actions { display: grid; gap: var(--space-3); min-width: 0; align-content: start; }
.overview-head { display: flex; align-items: center; gap: var(--space-3); }
.overview-head h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-lg); }
.overview-actions__list {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
  overflow: hidden;
}
.overview-actions__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
}
.overview-actions__item + .overview-actions__item { border-top: 1px solid var(--divider); }
.overview-actions__text { display: grid; gap: 2px; min-width: 0; }
.overview-actions__text small { color: var(--muted); font-size: var(--fs-xs); }
.overview-actions__more { color: var(--muted); font-size: var(--fs-sm); text-decoration: none; }
.overview-actions__more:hover { color: var(--accent); }
</style>
