<template>
  <section class="overview-services" aria-labelledby="overview-services-title">
    <header class="overview-head">
      <h2 id="overview-services-title">Santé des services</h2>
      <span class="overview-head__spacer"></span>
      <RouterLink class="overview-head__more" to="/settings/services/integrations">Tout voir</RouterLink>
    </header>
    <ul class="overview-services__grid">
      <li v-for="row in rows" :key="row.key">
        <RouterLink class="overview-service" :class="`is-${row.tone}`" :to="row.to">
          <span class="overview-dot" :class="`is-${row.tone}`" aria-hidden="true"></span>
          <span class="overview-service__name">{{ row.label }}</span>
          <span class="overview-service__state">{{ row.state }}</span>
        </RouterLink>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';

export interface ServiceRow {
  key: string;
  label: string;
  to: string;
  tone: 'ok' | 'warn' | 'error' | 'off';
  state: string;
}

defineProps<{ rows: ServiceRow[] }>();
</script>

<style scoped lang="scss">
.overview-services { display: grid; gap: var(--space-3); min-width: 0; align-content: start; }
.overview-head { display: flex; align-items: center; gap: var(--space-3); min-width: 0; }
.overview-head h2 { margin: 0; font-family: var(--font-display); font-size: var(--fs-lg); }
.overview-head__spacer { flex: 1; }
.overview-head__more { color: var(--muted); font-size: var(--fs-sm); text-decoration: none; }
.overview-head__more:hover { color: var(--accent); }

.overview-services__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
.overview-service {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  min-width: 0;
}
.overview-service:hover { border-color: var(--border-hover); }
.overview-service__name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.overview-service__state { margin-left: auto; color: var(--muted); font-size: var(--fs-xs); white-space: nowrap; }
.overview-service.is-off .overview-service__name { color: var(--muted); font-weight: 500; }

.overview-dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.overview-dot.is-ok { background: var(--green); }
.overview-dot.is-warn { background: var(--amber); }
.overview-dot.is-error { background: var(--red); }
</style>
