<template>
  <!-- Chaine d'acquisition : du souhait a la mediatheque, de gauche a droite. Chaque etape
       mene a la page qui la detaille ; ce qui bloque se lit sous « À importer ». -->
  <section class="pipeline" aria-labelledby="pipeline-title">
    <header class="pipeline__head">
      <h2 id="pipeline-title">Chaîne d’acquisition</h2>
      <RouterLink to="/downloads" class="pipeline__more">Ouvrir Acquisition →</RouterLink>
    </header>
    <ol class="pipeline__steps">
      <li v-for="step in steps" :key="step.key" class="pipeline__step">
        <RouterLink :to="step.to" class="pipeline__link" :class="`is-${step.tone}`">
          <span class="pipeline__track" aria-hidden="true"><span class="pipeline__dot" /><span class="pipeline__line" /></span>
          <strong class="pipeline__value">{{ step.value }}</strong>
          <span class="pipeline__label">{{ step.label }}</span>
          <small class="pipeline__note" :class="{ 'is-alert': step.alert }">{{ step.note }}</small>
        </RouterLink>
      </li>
    </ol>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

const props = withDefaults(
  defineProps<{
    pendingCount?: number;
    downloadingCount?: number;
    importPendingCount?: number;
    availableCount?: number | string;
    blockedCount?: number;
  }>(),
  { pendingCount: 0, downloadingCount: 0, importPendingCount: 0, availableCount: '-', blockedCount: 0 },
);

const steps = computed(() => [
  { key: 'pending', label: 'À approuver', value: props.pendingCount, note: props.pendingCount ? 'Demandes en attente' : 'Aucune en attente', tone: props.pendingCount ? 'warn' : 'ok', alert: false, to: '/library?status=pending_approval' },
  { key: 'downloading', label: 'En téléchargement', value: props.downloadingCount, note: 'Acquisitions actives', tone: props.downloadingCount ? 'info' : 'ok', alert: false, to: '/downloads?status=downloading' },
  {
    key: 'import', label: 'À importer', value: props.importPendingCount,
    note: props.blockedCount ? `${props.blockedCount} bloqué${props.blockedCount > 1 ? 's' : ''}` : '0 bloqué',
    tone: props.blockedCount ? 'error' : 'ok', alert: props.blockedCount > 0,
    to: props.blockedCount ? '/downloads?status=error' : '/downloads?status=unmatched',
  },
  { key: 'available', label: 'Disponibles', value: props.availableCount, note: 'Médiathèque Plex', tone: 'ok', alert: false, to: '/library?status=library&sort=added_desc' },
]);
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.pipeline {
  display: grid;
  gap: var(--space-4);
  padding: var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
  min-width: 0;
}
.pipeline__head { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: var(--space-2); }
.pipeline__head h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-lg); }
.pipeline__more { color: var(--accent); font-size: var(--fs-sm); font-weight: 600; text-decoration: none; }
.pipeline__more:hover { text-decoration: underline; }

.pipeline__steps { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin: 0; padding: 0; list-style: none; }
.pipeline__link {
  display: grid;
  gap: 4px;
  align-content: start;
  padding: 4px var(--space-3) 4px 0;
  color: var(--text);
  text-decoration: none;
  min-width: 0;
}
.pipeline__link:hover .pipeline__value { color: var(--accent); }
.pipeline__link:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-sm); }
.pipeline__track { display: flex; align-items: center; gap: var(--space-2); margin-bottom: 4px; }
.pipeline__dot { flex: none; width: 12px; height: 12px; border-radius: 50%; background: var(--muted); }
.pipeline__line { flex: 1; height: 2px; background: var(--border); }
.pipeline__step:last-child .pipeline__line { background: transparent; }
.is-ok .pipeline__dot { background: var(--green); }
.is-info .pipeline__dot { background: var(--blue-text, var(--accent)); }
.is-warn .pipeline__dot { background: var(--amber); }
.is-error .pipeline__dot { background: var(--red); }
.pipeline__value { font-family: var(--font-display); font-size: var(--fs-xl); font-variant-numeric: tabular-nums; line-height: 1.1; }
.pipeline__label { font-size: var(--fs-sm); font-weight: 600; }
.pipeline__note { color: var(--muted); font-size: var(--fs-xs); line-height: 1.3; }
.pipeline__note.is-alert { color: var(--red-text); font-weight: 650; }

@include bp.until(phablet) {
  .pipeline__steps { grid-template-columns: minmax(0, 1fr); }
  .pipeline__link { grid-template-columns: auto 1fr auto; align-items: center; column-gap: var(--space-3); min-height: 48px; padding-block: 6px; border-top: 1px solid var(--divider); }
  .pipeline__step:first-child .pipeline__link { border-top: 0; }
  .pipeline__track { margin: 0; }
  .pipeline__line { display: none; }
  .pipeline__value { grid-column: 3; grid-row: 1 / span 2; font-size: var(--fs-lg); }
  .pipeline__label { grid-column: 2; }
  .pipeline__note { grid-column: 2; }
}
</style>
