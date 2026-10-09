<template>
  <!-- La carte des zones : celle de la barre latérale, avec l'état de chacune. Sur
       téléphone il n'y a plus de dock ni de barre latérale : c'est le menu. -->
  <nav class="zone-map" :aria-label="label">
    <section v-for="group in groups" :key="group.label" class="zone-map__group">
      <h2 v-if="group.label" class="zone-map__label">{{ group.label }}</h2>
      <ul class="zone-map__grid">
        <li v-for="zone in group.items" :key="zone.key">
          <RouterLink class="zone" :class="zone.severity ? `is-${zone.severity}` : ''" :to="zone.to">
            <span class="zone__icon"><component :is="zone.icon" aria-hidden="true" /></span>
            <span class="zone__text">
              <strong>{{ zone.label }}</strong>
              <small>{{ zone.line || ' ' }}</small>
            </span>
            <span v-if="zone.severity" class="zone__dot" :class="`is-${zone.severity}`" aria-hidden="true"></span>
            <span v-if="zone.severity" class="sr-only">{{ SEVERITY_LABELS[zone.severity] }}</span>
            <ChevronRight class="zone__chevron" aria-hidden="true" />
          </RouterLink>
        </li>
      </ul>
    </section>
  </nav>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { ChevronRight } from '@lucide/vue';
import type { MonitorSeverity as AttentionSeverity, MonitorZoneGroup } from './types';


withDefaults(defineProps<{ groups: MonitorZoneGroup[]; label?: string }>(), { label: 'Zones de l’administration' });

const SEVERITY_LABELS: Record<AttentionSeverity, string> = { error: 'Erreur', warn: 'À surveiller', info: 'Information' };
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.zone-map { display: grid; gap: var(--space-4); min-width: 0; }
.zone-map__group { display: grid; gap: var(--space-2); }
.zone-map__label { margin: 0 var(--space-1); color: var(--muted); font-family: var(--font-sans); font-size: var(--fs-xs); font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.zone-map__grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-3); margin: 0; padding: 0; list-style: none; }

.zone {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 64px;
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--border);
  border-radius: var(--panel-radius);
  background: var(--surface);
  color: var(--text);
  text-decoration: none;
  min-width: 0;
}
.zone:hover { border-color: var(--border-hover); }
.zone:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.zone.is-error { border-color: color-mix(in srgb, var(--red) 50%, var(--border)); }
.zone.is-warn { border-color: color-mix(in srgb, var(--amber) 50%, var(--border)); }
.zone__icon { display: grid; flex: none; place-items: center; width: 34px; height: 34px; border-radius: var(--radius-sm); background: var(--surface-2); color: var(--muted); }
.zone__icon svg { width: 17px; height: 17px; }
.zone__text { display: grid; flex: 1; min-width: 0; gap: 2px; }
.zone__text strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.zone__text small { color: var(--muted); font-size: var(--fs-xs); line-height: 1.35; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
.zone__dot { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--muted); }
.zone__dot.is-error { background: var(--red); }
.zone__dot.is-warn { background: var(--amber); }
.zone__dot.is-info { background: var(--accent); }
.zone__chevron { display: none; flex: none; width: 18px; height: 18px; color: var(--muted); }

@include bp.until(desktop) {
  .zone-map__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
/* Téléphone : une liste groupée, comme l'écran Réglages d'un téléphone. */
@include bp.until(shell-medium) {
  .zone-map__grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
    border: 1px solid var(--border);
    border-radius: var(--panel-radius);
    background: var(--surface);
    overflow: hidden;
  }
  .zone-map__grid li + li { border-top: 1px solid var(--divider); }
  .zone, .zone.is-error, .zone.is-warn { min-height: 56px; padding: var(--space-2) var(--space-3); border: 0; border-radius: 0; background: transparent; }
  .zone__chevron { display: block; }
}
</style>
