<template>
  <!-- Le verdict avant le détail : on sait en un coup d'œil si l'instance demande quelque
       chose, avant de lire la liste qui dit quoi. -->
  <section class="overview-verdict" :class="`is-${tone}`" aria-labelledby="overview-verdict-title">
    <span class="overview-verdict__mark" aria-hidden="true">
      <template v-if="loading">…</template>
      <template v-else-if="urgent">{{ urgent }}</template>
      <CheckCircle2 v-else />
    </span>
    <div class="overview-verdict__text">
      <h2 id="overview-verdict-title"><span v-if="urgent && !loading" class="sr-only">{{ spokenCount }}</span>{{ title }}</h2>
      <p>{{ subtitle }}</p>
    </div>
    <UiButton variant="ghost" size="sm" :loading="refreshing" @click="emit('refresh')">
      <template #icon><RefreshCw /></template>{{ checkedLabel }}
    </UiButton>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { CheckCircle2, RefreshCw } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';

const props = withDefaults(
  defineProps<{
    /** Points qui réclament une action (erreurs et à surveiller). */
    urgent: number;
    errors?: number;
    warnings?: number;
    loading?: boolean;
    refreshing?: boolean;
    checkedLabel?: string;
    /** Textes propres a la page ; ceux de l'administration par defaut. */
    checkingTitle?: string;
    checkingDetail?: string;
    okTitle?: string;
    okDetail?: string;
  }>(),
  {
    errors: 0, warnings: 0, loading: false, refreshing: false, checkedLabel: 'Vérifier',
    checkingTitle: 'Vérification de l’instance…',
    checkingDetail: 'Services, tâches et configuration.',
    okTitle: 'Tout fonctionne',
    okDetail: 'Les services répondent, les tâches passent et la configuration est complète.',
  }
);
const emit = defineEmits<{ refresh: [] }>();

// Le chiffre affiché est décoratif : le titre doit le dire lui-même, espace comprise.
const spokenCount = computed(() => `${props.urgent} `);
const tone = computed(() => (props.loading ? 'idle' : props.errors ? 'error' : props.urgent ? 'warn' : 'good'));
const title = computed(() => {
  if (props.loading) return props.checkingTitle;
  if (!props.urgent) return props.okTitle;
  return props.urgent > 1 ? 'points à traiter' : 'point à traiter';
});
const subtitle = computed(() => {
  if (props.loading) return props.checkingDetail;
  if (!props.urgent) return props.okDetail;
  const parts: string[] = [];
  if (props.errors) parts.push(`${props.errors} ${props.errors > 1 ? 'erreurs' : 'erreur'}`);
  if (props.warnings) parts.push(`${props.warnings} à surveiller`);
  return parts.join(', ');
});
</script>

<style scoped lang="scss">
.overview-verdict {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3) var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
  min-width: 0;
}
.overview-verdict.is-good { border-color: color-mix(in srgb, var(--green) 45%, var(--border)); background: color-mix(in srgb, var(--green) 7%, var(--surface)); }
.overview-verdict.is-warn { border-color: color-mix(in srgb, var(--amber) 45%, var(--border)); background: color-mix(in srgb, var(--amber) 7%, var(--surface)); }
.overview-verdict.is-error { border-color: color-mix(in srgb, var(--red) 45%, var(--border)); background: color-mix(in srgb, var(--red) 7%, var(--surface)); }
.overview-verdict__mark {
  display: grid;
  flex: none;
  place-items: center;
  min-width: 44px;
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
}
.overview-verdict__mark svg { width: 36px; height: 36px; color: var(--green); }
.overview-verdict.is-warn .overview-verdict__mark { color: var(--amber-text); }
.overview-verdict.is-error .overview-verdict__mark { color: var(--red-text); }
.overview-verdict__text { display: grid; flex: 1 1 9rem; min-width: 0; gap: 2px; }
.overview-verdict > :deep(.ui-button) { margin-left: auto; }
.overview-verdict__text h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-lg); }
.overview-verdict__text p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
</style>
