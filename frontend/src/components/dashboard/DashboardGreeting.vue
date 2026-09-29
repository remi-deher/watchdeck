<template>
  <!-- En-tete de l'accueil : la barre du haut porte deja le titre de la page, celui-ci
       dit en une phrase s'il faut intervenir, avant tout detail. -->
  <header class="dashboard-greeting">
    <div class="greeting-text">
      <span class="greeting-date">{{ today }}</span>
      <p class="greeting-title">{{ salutation }}<template v-if="name">, {{ name }}</template></p>
      <p class="greeting-summary">
        <template v-if="attentionCount"><strong>{{ attentionCount }} élément{{ attentionCount > 1 ? 's' : '' }}</strong> demande{{ attentionCount > 1 ? 'nt' : '' }} votre attention.</template>
        <template v-else>Aucune intervention nécessaire pour le moment.</template>
      </p>
    </div>
    <div class="greeting-actions">
      <UiButton :loading="syncing" @click="$emit('sync-all')"><template #icon><RefreshCw :size="16" /></template>Tout synchroniser</UiButton>
      <UiButton variant="primary" to="/discover"><template #icon><Plus :size="16" /></template>Nouvelle demande</UiButton>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Plus, RefreshCw } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';

const props = withDefaults(
  defineProps<{
    name?: string;
    attentionCount?: number;
    syncing?: boolean;
    /** Heure de reference, injectable pour les tests. */
    now?: number;
  }>(),
  { name: '', attentionCount: 0, syncing: false, now: undefined }
);
defineEmits<{ (e: 'sync-all'): void }>();

const date = computed(() => new Date(props.now ?? Date.now()));
const salutation = computed(() => {
  const hour = date.value.getHours();
  return hour >= 5 && hour < 18 ? 'Bonjour' : 'Bonsoir';
});
const today = computed(() => {
  const label = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date.value);
  return label.charAt(0).toUpperCase() + label.slice(1);
});
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.dashboard-greeting { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--space-4); flex-wrap: wrap; }
.greeting-text { display: grid; gap: var(--space-1); min-width: 0; }
.greeting-date { color: var(--muted); font-size: var(--fs-xs); font-weight: 650; letter-spacing: .08em; text-transform: uppercase; }
.greeting-title { margin: 0; font-family: var(--font-display); font-size: var(--fs-3xl); font-weight: 700; letter-spacing: -.01em; line-height: 1.15; }
.greeting-summary { margin: 0; color: var(--muted); font-size: var(--fs-md); }
.greeting-summary strong { color: var(--accent); }
.greeting-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; }

@include bp.until(tablet) {
  .greeting-title { font-size: var(--fs-2xl); }
  .greeting-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; }
  .greeting-actions > * { min-height: var(--touch-target); }
}
</style>
