<template>
  <!-- Les ressources branchees (instances, bibliotheques, clients, flows…) : chacune dit son
       etat, et selon ce qu'elle permet s'active, se teste, se modifie, porte ses propres
       actions (« Scanner »), ou se deplie pour montrer son detail (emplacement `detail`).
       Le meme bloc partout ; une ressource en lecture seule n'a ni interrupteur ni
       « Modifier ». -->
  <div class="resource-list">
    <ul v-if="resources.length" class="resource-list__items">
      <li v-for="resource in resources" :key="resource.key" class="resource" :class="{ 'is-off': resource.enabled === false }">
        <div class="resource__row">
          <ToggleSwitch v-if="resource.enabled !== undefined" :model-value="resource.enabled" :aria-label="`Activer ${resource.label}`" @update:model-value="emit('toggle', resource, $event)" />
          <div class="resource__text">
            <strong>{{ resource.label }}</strong>
            <small v-if="resource.subtitle">{{ resource.subtitle }}</small>
          </div>
          <span v-if="resource.enabled === false" class="resource__state is-off">Désactivée</span>
          <span v-else-if="resource.state" class="resource__state" :class="`is-${resource.state.tone}`">{{ resource.state.text }}</span>
          <UiButton v-if="resource.testable" size="sm" variant="ghost" @click="emit('test', resource)">Tester</UiButton>
          <UiButton v-for="action in resource.actions || []" :key="action.key" size="sm" variant="ghost" :loading="action.loading" @click="emit('action', resource, action.key)">
            <template v-if="action.icon" #icon><component :is="action.icon" /></template>{{ action.label }}
          </UiButton>
          <UiButton v-if="$slots.detail && resource.expandable" size="sm" variant="ghost" :aria-expanded="expanded.has(resource.key)" @click="toggleDetail(resource.key)">
            {{ expanded.has(resource.key) ? 'Masquer' : 'Détails' }}
          </UiButton>
          <UiButton v-if="resource.editable !== false" size="sm" variant="ghost" @click="emit('edit', resource)">Modifier</UiButton>
        </div>
        <div v-if="$slots.detail && expanded.has(resource.key)" class="resource__detail"><slot name="detail" :resource="resource" /></div>
      </li>
    </ul>
    <p v-else class="resource-list__empty">{{ emptyText }}</p>
    <UiButton v-if="addLabel" size="sm" class="resource-list__add" @click="emit('add')"><template #icon><Plus /></template>{{ addLabel }}</UiButton>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
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
  action: [resource: ConfigureResource, key: string];
  add: [];
}>();

const expanded = reactive(new Set<string>());
function toggleDetail(key: string): void {
  if (expanded.has(key)) expanded.delete(key);
  else expanded.add(key);
}
</script>

<style scoped lang="scss">
.resource-list { display: grid; gap: var(--space-2); }
.resource-list__items { display: grid; margin: 0; padding: 0; border: 1px solid var(--border); border-radius: var(--panel-radius); list-style: none; }
.resource-list__items > li + li { border-top: 1px solid var(--border); }
.resource { display: grid; gap: var(--space-2); padding: var(--space-2) var(--space-3); min-width: 0; }
.resource__row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2) var(--space-3); min-width: 0; }
.resource__text { display: grid; flex: 1 1 10rem; gap: 1px; min-width: 0; }
.resource.is-off .resource__text strong { color: var(--muted); }
.resource__text small { color: var(--muted); font-size: var(--fs-xs); overflow-wrap: anywhere; }
.resource__state { font-size: var(--fs-xs); font-weight: 600; color: var(--muted); }
.resource__state.is-ok { color: var(--green-text, var(--green)); }
.resource__state.is-warn { color: var(--amber-text); }
.resource__state.is-error { color: var(--red-text); }
.resource__detail { padding: var(--space-2) 0 var(--space-1); font-size: var(--fs-sm); }
.resource-list__empty { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.resource-list__add { justify-self: start; }
</style>
