<template>
  <section v-show="visible" ref="root" class="settings-card" :class="[status, { collapsed: collapsible && !open }]">
    <header class="settings-card-head">
      <div class="settings-card-title">
        <span class="settings-card-icon" v-if="icon"><component :is="icon"/></span>
        <div class="settings-card-heading">
          <div class="settings-card-name-row">
            <h3>{{ title }}</h3>
            <span class="settings-card-status" :class="status">{{ statusLabel }}</span>
          </div>
          <p v-if="subtitle" class="settings-card-subtitle">{{ subtitle }}</p>
        </div>
      </div>
      <div class="settings-card-head-actions">
        <slot name="actions"/>
        <button v-if="collapsible" class="chevron" :class="{ open }" type="button" :aria-expanded="open" @click="toggle">
          <span class="chevron-label">{{ open ? 'Replier' : 'Deplier' }}</span>
          <ChevronDown/>
        </button>
      </div>
    </header>

    <div v-if="feedback" class="settings-card-feedback" :class="feedback.success === false ? 'error' : 'ok'">
      <component :is="feedback.success === false ? XCircle : CheckCircle2"/>
      <span>{{ feedback.message }}</span>
    </div>

    <div v-show="!collapsible || open" class="settings-card-body">
      <slot/>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Component } from 'vue';
import { matchesQuery, useSettingsSearch } from '@/composables/useSettingsSearch';
import { CheckCircle2, ChevronDown, XCircle } from '@lucide/vue';

export interface SettingsFeedback {
  success: boolean;
  message: string;
}

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    icon?: Component | null;
    status?: string; // active | inactive | error | neutral
    statusText?: string;
    collapsible?: boolean;
    defaultOpen?: boolean;
    feedback?: SettingsFeedback | null;
  }>(),
  {
    subtitle: '',
    icon: null,
    status: 'neutral',
    statusText: '',
    collapsible: true,
    defaultOpen: false,
    feedback: null,
  }
);

const open = ref(props.defaultOpen);

/* La carte decide elle-meme si elle correspond a la recherche : son contenu vit dans un
   slot, et seul son rendu sait ce qu'elle porte vraiment. On lit donc son texte, titre
   et champs compris, plutot que ses seules proprietes. */
const search = useSettingsSearch();
const root = ref<HTMLElement | null>(null);
const visible = ref(true);
const id = Symbol('settings-card');

function textOfCard(): string {
  return `${props.title} ${props.subtitle} ${root.value?.textContent || ''}`;
}
function evaluate(): boolean {
  const found = matchesQuery(textOfCard(), search?.query.value || '');
  visible.value = found;
  return found;
}

if (search) {
  onMounted(async () => {
    search.register(id, evaluate);
    // Le texte n'existe qu'apres le rendu du slot.
    await nextTick();
    evaluate();
    search.refresh();
  });
  onBeforeUnmount(() => search.unregister(id));
  watch(
    () => search.query.value,
    () => {
      evaluate();
      search.refresh();
    }
  );
}
function toggle(): void { open.value = !open.value; }

const defaultLabels: Record<string, string> = { active: 'Actif', inactive: 'Inactif', error: 'Erreur', neutral: '' };
const statusLabel = computed(() => props.statusText || defaultLabels[props.status || ''] || '');

defineExpose({ toggle, open });
</script>
