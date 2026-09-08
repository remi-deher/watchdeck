<template>
  <!-- Sur grand écran, une colonne de navigation permanente. En dessous, la même liste
       repliée derrière la section courante : treize entrées groupées ne tiennent pas
       dans une rangée horizontale sans devenir illisibles, et le défilement latéral
       cacherait justement les sections qu'on cherche. -->
  <nav class="settings-nav" :aria-label="ariaLabel">
    <button
      type="button"
      class="settings-nav__summary"
      :aria-expanded="open"
      aria-controls="settings-nav-list"
      @click="open = !open"
    >
      <span class="settings-nav__summary-label">Section</span>
      <strong>{{ activeLabel }}</strong>
      <ChevronDown aria-hidden="true" :class="{ 'is-open': open }" />
    </button>

    <div id="settings-nav-list" class="settings-nav__list" :class="{ 'is-open': open }">
      <div v-for="group in groups" :key="group.label" class="settings-nav__group">
        <p v-if="group.label" class="settings-nav__group-label">{{ group.label }}</p>
        <ul>
          <li v-for="section in group.items" :key="section.key">
            <button
              type="button"
              class="settings-nav__item"
              :aria-current="section.key === active ? 'page' : undefined"
              @click="select(section.key)"
            >
              <component :is="section.icon" v-if="section.icon" aria-hidden="true" />
              <span>{{ section.label }}</span>
            </button>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ChevronDown } from '@lucide/vue';

export interface SettingsNavItem {
  key: string;
  label: string;
  group?: string;
  icon?: any;
}

const props = withDefaults(
  defineProps<{ sections: SettingsNavItem[]; active?: string; ariaLabel?: string }>(),
  { active: '', ariaLabel: 'Sections des paramètres' }
);

const emit = defineEmits<{ (e: 'select', key: string): void }>();

const open = ref(false);

const groups = computed<Array<{ label: string; items: SettingsNavItem[] }>>(() => {
  const result: Array<{ label: string; items: SettingsNavItem[] }> = [];
  for (const section of props.sections) {
    const label = section.group || '';
    const existing = result.find((group) => group.label === label);
    if (existing) existing.items.push(section);
    else result.push({ label, items: [section] });
  }
  return result;
});

const activeLabel = computed(
  () => props.sections.find((section) => section.key === props.active)?.label || 'Vue d’ensemble'
);

function select(key: string): void {
  open.value = false;
  emit('select', key);
}

// Une section choisie ailleurs (carte de la vue d'ensemble, palette) referme la liste :
// la laisser ouverte masquerait le panneau qu'on vient justement de demander.
watch(() => props.active, () => { open.value = false; });
</script>

<style scoped lang="scss">
@use '@/styles/foundations/breakpoints' as bp;

.settings-nav { min-width: 0; }

.settings-nav__summary {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.settings-nav__summary-label {
  flex: none;
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}
.settings-nav__summary strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: var(--fs-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-nav__summary svg {
  flex: none;
  width: 17px;
  height: 17px;
  color: var(--muted);
  transition: transform .18s ease;
}
.settings-nav__summary svg.is-open { transform: rotate(180deg); }

.settings-nav__list {
  display: none;
  gap: var(--space-4);
  margin-top: var(--space-2);
  padding: var(--space-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}
.settings-nav__list.is-open { display: grid; }

.settings-nav__group ul { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; }
.settings-nav__group-label {
  margin: 0 0 var(--space-1);
  padding: 0 var(--space-2);
  color: var(--muted);
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.settings-nav__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: var(--touch-target);
  padding: 0 var(--space-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--muted);
  font-size: var(--fs-sm);
  text-align: left;
  cursor: pointer;
}
.settings-nav__item svg { flex: none; width: 17px; height: 17px; }
.settings-nav__item span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.settings-nav__item:hover { color: var(--text); background: var(--surface-2); }
.settings-nav__item[aria-current='page'] {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  font-weight: 700;
}

/* Colonne permanente : le repli n'a plus lieu d'être, la liste tient à l'écran. */
@include bp.from(shell-expanded) {
  .settings-nav__summary { display: none; }
  .settings-nav__list {
    display: grid;
    position: sticky;
    top: calc(var(--app-shell-offset-top) + var(--space-5));
    max-height: calc(100dvh - var(--app-shell-offset-top) - var(--space-6));
    margin-top: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
}
</style>
