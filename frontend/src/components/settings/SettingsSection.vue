<template>
  <section class="settings-section">
    <header class="settings-section-head">
      <div class="settings-section-heading">
        <h3>
          {{ title }}
          <span v-if="status" class="settings-section-status" :class="status">{{ statusLabel }}</span>
        </h3>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div class="settings-section-actions">
        <slot name="actions" />
        <button
          v-if="collapsible"
          type="button"
          class="settings-section-toggle"
          :aria-expanded="open"
          @click="open = !open"
        >
          <span>{{ open ? 'Replier' : 'Déplier' }}</span>
          <ChevronDown :class="{ open }" />
        </button>
      </div>
    </header>
    <div v-show="!collapsible || open" class="settings-section-body">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * Un groupe de reglages : titre en TEXTE, pas en boite.
 *
 * Pendant de SettingsRow. La ou SettingsCard enferme chaque groupe dans un cadre
 * avec icone, bordure, ombre et badge, on se contente ici d'un titre et d'un filet :
 * la hierarchie reste lisible, sans les ~105 px de decor par bloc.
 *
 * `collapsible` est volontairement a false par defaut, a l'inverse de SettingsCard
 * (defaultOpen: false) : une page dense que l'on deroule vaut mieux qu'une page
 * courte qu'il faut fouiller en ouvrant les boites une a une. Le repli ne sert donc
 * qu'aux options avancees, rarement touchees.
 */
import { ref } from 'vue';
import { ChevronDown } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    /** active | inactive : pastille discrete a cote du titre. */
    status?: string;
    statusText?: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
  }>(),
  { subtitle: '', status: '', statusText: '', collapsible: false, defaultOpen: true }
);

const open = ref(props.defaultOpen);
const statusLabel = props.statusText || (props.status === 'active' ? 'Actif' : props.status === 'inactive' ? 'Inactif' : '');
</script>

<style scoped lang="scss">
.settings-section + .settings-section {
  margin-top: var(--space-5, 28px);
}

.settings-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-4);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border);
}

.settings-section-heading h3 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 700;
}

.settings-section-heading p {
  margin: 4px 0 0;
  max-width: 80ch;
  color: var(--muted);
  font-size: var(--fs-sm);
  line-height: 1.45;
}

/* Pastille de texte : elle informe sans peser comme un badge encadre. */
.settings-section-status {
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--muted);
}

.settings-section-status.active {
  color: var(--green-text, #4ade80);
}

.settings-section-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex: none;
}

.settings-section-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--muted);
  font-size: var(--fs-xs);
  cursor: pointer;
}

.settings-section-toggle:hover {
  color: var(--text);
}

.settings-section-toggle svg {
  width: 14px;
  height: 14px;
  transition: transform 0.2s ease;
}

.settings-section-toggle svg.open {
  transform: rotate(180deg);
}

@media (max-width: 640px) {
  .settings-section-head {
    flex-wrap: wrap;
  }
}
</style>
