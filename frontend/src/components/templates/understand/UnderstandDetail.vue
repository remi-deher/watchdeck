<template>
  <!-- Le detail d'un evenement : la cause, l'avant / apres, les etapes, puis les liens.
       Au plus une action, qui renvoie vers Traiter ou Suivre. -->
  <aside class="understand-detail" :aria-label="`Détail : ${detail.title}`">
    <header class="understand-detail__head">
      <div>
        <h2>{{ detail.title }}</h2>
        <small v-if="detail.subtitle">{{ detail.subtitle }}</small>
      </div>
      <span class="understand-detail__badge" :class="`is-${detail.outcome}`">{{ OUTCOME_LABELS[detail.outcome] }}</span>
      <UiButton size="sm" variant="ghost" icon-only aria-label="Fermer le détail" title="Fermer" @click="emit('close')"><X /></UiButton>
    </header>

    <p v-if="detail.cause" class="understand-detail__cause" :class="`is-${detail.outcome}`">{{ detail.cause }}</p>

    <dl v-if="detail.comparison?.length" class="understand-detail__compare">
      <template v-for="row in detail.comparison" :key="row.label">
        <dt>{{ row.label }}</dt>
        <dd><span>Avant</span>{{ row.before }}</dd>
        <dd><span>Après</span>{{ row.after }}</dd>
      </template>
    </dl>

    <ol v-if="detail.steps?.length" class="understand-detail__steps">
      <li v-for="step in detail.steps" :key="step.label" :class="`is-${step.outcome}`">
        <component :is="step.outcome === 'failed' ? XCircle : CheckCircle2" aria-hidden="true" />
        <span>{{ step.label }}</span>
        <small v-if="step.duration">{{ step.duration }}</small>
      </li>
    </ol>

    <footer v-if="detail.links?.length || detail.action" class="understand-detail__links">
      <UiButton v-if="detail.action" size="sm" variant="primary" @click="emit('action', detail.action.key)">{{ detail.action.label }}</UiButton>
      <UiButton v-for="link in detail.links || []" :key="link.label" size="sm" :to="link.to">{{ link.label }}</UiButton>
    </footer>
  </aside>
</template>

<script setup lang="ts">
import { CheckCircle2, X, XCircle } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import type { UnderstandDetail, UnderstandOutcome } from './types';

defineProps<{ detail: UnderstandDetail }>();
const emit = defineEmits<{ close: []; action: [key: string] }>();

const OUTCOME_LABELS: Record<UnderstandOutcome, string> = { success: 'Réussi', failed: 'Échec', warning: 'Avertissement', info: 'Information' };
</script>

<style scoped lang="scss">
.understand-detail { display: grid; align-content: start; gap: var(--space-3); padding: var(--space-4); border: 1px solid var(--border); border-radius: var(--panel-radius); background: var(--surface); min-width: 0; }
.understand-detail__head { display: flex; align-items: flex-start; gap: var(--space-2); }
.understand-detail__head > div { display: grid; flex: 1; gap: 2px; min-width: 0; }
.understand-detail__head h2 { margin: 0; font-size: var(--fs-md); overflow-wrap: anywhere; }
.understand-detail__head small { color: var(--muted); }
.understand-detail__badge { flex: none; padding: 2px 8px; border-radius: var(--radius-pill); background: var(--surface-2); font-size: var(--fs-xs); font-weight: 600; }
.understand-detail__badge.is-success { color: var(--green-text, var(--green)); }
.understand-detail__badge.is-failed { background: color-mix(in srgb, var(--red) 14%, var(--surface)); color: var(--red-text); }
.understand-detail__badge.is-warning { color: var(--amber-text); }
.understand-detail__cause { margin: 0; padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); background: var(--surface-2); font-size: var(--fs-sm); }
.understand-detail__cause.is-failed { background: color-mix(in srgb, var(--red) 8%, var(--surface)); color: var(--red-text); }
.understand-detail__compare { display: grid; grid-template-columns: auto 1fr 1fr; gap: 4px var(--space-2); margin: 0; font-size: var(--fs-sm); }
.understand-detail__compare dt { color: var(--muted); }
.understand-detail__compare dd { margin: 0; }
.understand-detail__compare dd span { display: block; color: var(--muted); font-size: var(--fs-xs); }
.understand-detail__steps { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; font-size: var(--fs-sm); }
.understand-detail__steps li { display: flex; align-items: center; gap: var(--space-2); }
.understand-detail__steps svg { flex: none; width: 16px; height: 16px; color: var(--green); }
.understand-detail__steps li.is-failed { color: var(--red-text); }
.understand-detail__steps li.is-failed svg { color: var(--red-text); }
.understand-detail__steps small { margin-left: auto; color: var(--muted); }
.understand-detail__links { display: flex; flex-wrap: wrap; gap: var(--space-2); }
</style>
