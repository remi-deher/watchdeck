<!--
  Barre de filtres secondaires.

  Sur l'onglet « Upgrades », cette barre portait une rangee de puces de statut --
  « À traiter (55) », « En attente de release (413) »… -- strictement identique,
  libelles et compteurs compris, aux tuiles d'indicateurs affichees juste au-dessus, y
  compris la remise a zero (cliquer la tuile active desactive le filtre). Deux jeux
  equivalents empiles verticalement, sans rien qui dise lequel fait autorite : les
  tuiles restent seules a tenir ce role, puisqu'elles portent en plus la valeur et sa
  legende.

  L'onglet « Audit » garde ses puces : elles offrent six criteres la ou les tuiles n'en
  exposent que quatre (« ST forcé inactif », « ST VO inactif », « Séries partielles »
  n'existent nulle part ailleurs).
-->
<template>
  <nav class="quick-filter-bar" :aria-label="audit ? 'Filtres rapides' : 'Filtrer par type de média'">
    <div v-if="audit" class="chip-group">
      <button
        v-for="filter in filters"
        :key="filter.value"
        class="quick-chip"
        :class="{ active: activeStatus === filter.value }"
        :aria-pressed="activeStatus === filter.value"
        type="button"
        @click="emit('status', filter.value)"
      >
        <component :is="filter.icon" v-if="filter.icon" :size="13" />
        {{ filter.label }}
        <small v-if="filter.count">({{ filter.count }})</small>
      </button>
    </div>

    <div class="media-type-chips">
      <button
        v-for="type in mediaTypes"
        :key="type.value"
        class="type-chip"
        :class="{ active: mediaType === type.value }"
        :aria-pressed="mediaType === type.value"
        type="button"
        @click="emit('media-type', type.value)"
      >
        <component :is="type.icon" v-if="type.icon" :size="13" />
        {{ type.label }}
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue';
import { Film, Globe, MessageSquare, SlidersHorizontal, Tv, Volume2 } from '@lucide/vue';

interface FilterOption {
  value: string;
  label: string;
  count?: number;
  icon?: Component;
}

const props = withDefaults(defineProps<{
  audit?: boolean;
  activeStatus?: string;
  mediaType?: string;
  totalAuditItems?: number;
  auditCounts?: Record<string, number>;
  eligibleAuditFixCount?: number;
  pendingCount?: number;
  waitingReleaseCount?: number;
  inProgressCount?: number;
  failedCount?: number;
  historyCount?: number;
  ignoredCount?: number;
}>(), {
  audit: false,
  activeStatus: '',
  mediaType: '',
  totalAuditItems: 0,
  auditCounts: () => ({}),
  eligibleAuditFixCount: 0,
  pendingCount: 0,
  waitingReleaseCount: 0,
  inProgressCount: 0,
  failedCount: 0,
  historyCount: 0,
  ignoredCount: 0,
});

const emit = defineEmits<{
  status: [value: string];
  'media-type': [value: string];
}>();

const filters = computed<FilterOption[]>(() => props.audit ? [
  { value: '', label: 'Toutes les anomalies', count: props.totalAuditItems },
  { value: 'eligible', label: 'Prêts à aligner', count: props.eligibleAuditFixCount, icon: SlidersHorizontal },
  { value: 'audio_secondary', label: 'Audio secondaire', count: props.auditCounts.audio_secondary, icon: Volume2 },
  { value: 'forced_sub_not_default', label: 'ST forcé inactif', count: props.auditCounts.forced_sub_not_default, icon: MessageSquare },
  { value: 'sub_fr_not_default', label: 'ST VO inactif', count: props.auditCounts.sub_fr_not_default, icon: MessageSquare },
  { value: 'partial_vf', label: 'Séries partielles', count: props.auditCounts.partial_vf, icon: Globe },
] : []);

const mediaTypes: FilterOption[] = [
  { value: '', label: 'Tous types' },
  { value: 'movie', label: 'Films', icon: Film },
  { value: 'show', label: 'Séries', icon: Tv },
];
</script>

<style scoped lang="scss">
.quick-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  flex-wrap: wrap;
  padding: 10px 14px;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.chip-group,
.media-type-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.quick-chip,
.type-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-pill);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-xs);
  font-weight: 550;
  cursor: pointer;
  transition: all 0.15s ease;
}

.quick-chip small { color: var(--muted); }
.quick-chip:hover, .type-chip:hover { background: var(--surface-hover); border-color: var(--border-hover, var(--border)); }
.quick-chip.active, .type-chip.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 15%, var(--surface));
  color: var(--accent);
  font-weight: 700;
}
.quick-chip.active small { color: var(--accent); }
</style>
