<template>
  <!-- Les ressources branchees (instances, bibliotheques, clients…) : chacune dit son
       etat, s'active, se teste et se modifie sans quitter la page. Le meme bloc partout. -->
  <div class="resource-list">
    <ul v-if="resources.length" class="resource-list__items">
      <li v-for="resource in resources" :key="resource.key" class="resource" :class="{ 'is-off': !resource.enabled }">
        <ToggleSwitch :model-value="resource.enabled" :aria-label="`Activer ${resource.label}`" @update:model-value="emit('toggle', resource, $event)" />
        <div class="resource__text">
          <strong>{{ resource.label }}</strong>
          <small v-if="resource.subtitle">{{ resource.subtitle }}</small>
        </div>
        <span v-if="resource.state" class="resource__state" :class="`is-${resource.enabled ? resource.state.tone : 'off'}`">
          {{ resource.enabled ? resource.state.text : 'Désactivée' }}
        </span>
        <span v-else-if="!resource.enabled" class="resource__state is-off">Désactivée</span>
        <UiButton v-if="resource.testable" size="sm" variant="ghost" @click="emit('test', resource)">Tester</UiButton>
        <UiButton size="sm" variant="ghost" @click="emit('edit', resource)">Modifier</UiButton>
      </li>
    </ul>
    <p v-else class="resource-list__empty">{{ emptyText }}</p>
    <UiButton v-if="addLabel" size="sm" class="resource-list__add" @click="emit('add')"><template #icon><Plus /></template>{{ addLabel }}</UiButton>
  </div>
</template>

<script setup lang="ts">
import { Plus } from '@lucide/vue';
import ToggleSwitch from '@/components/ui/ToggleSwitch.vue';
import UiButton from '@/components/ui/UiButton.vue';
import type { ConfigureResource } from './types';

withDefaults(defineProps<{ resources: ConfigureResource[]; addLabel?: string; emptyText?: string }>(), {
  addLabel: '',
  emptyText: 'Rien n’est encore branché.',
});
const emit = defineEmits<{
  toggle: [resource: ConfigureResource, enabled: boolean];
  test: [resource: ConfigureResource];
  edit: [resource: ConfigureResource];
  add: [];
}>();
</script>

<style scoped lang="scss">
.resource-list { display: grid; gap: var(--space-2); }
.resource-list__items { display: grid; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--panel-radius); list-style: none; }
.resource-list__items > li + li { border-top: 1px solid var(--border); }
.resource { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); padding: var(--space-2) var(--space-3); min-width: 0; }
.resource__text { display: grid; flex: 1 1 10rem; gap: 1px; min-width: 0; }
.resource.is-off .resource__text strong { color: var(--muted); }
.resource__text small { color: var(--muted); font-size: var(--fs-xs); }
.resource__state { font-size: var(--fs-xs); font-weight: 600; color: var(--muted); }
.resource__state.is-ok { color: var(--green-text, var(--green)); }
.resource__state.is-warn { color: var(--amber-text); }
.resource__state.is-error { color: var(--red-text); }
.resource-list__empty { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.resource-list__add { justify-self: start; }
</style>
