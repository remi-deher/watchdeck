<template>
  <!-- Une liste d'actions de contrôle : un bouton, ou un menu quand l'action porte des
       entrées (`items`). Sert la barre groupée et les actions sur toute la liste. -->
  <template v-for="action in actions" :key="action.key">
    <UiMenu v-if="action.items?.length" align="start">
      <template #trigger>
        <UiButton size="sm" :variant="variantOf(action)" :disabled="action.disabled">
          <template v-if="action.icon" #icon><component :is="action.icon" /></template>{{ action.label }}<template #trailing><ChevronDown /></template>
        </UiButton>
      </template>
      <template v-for="item in action.items" :key="item.key">
        <UiMenuSeparator v-if="item.separated" />
        <UiMenuItem :variant="item.tone === 'danger' ? 'danger' : 'default'" :disabled="item.disabled" @select="emit('run', item)">
          <component :is="item.icon" v-if="item.icon" /> {{ item.label }}
        </UiMenuItem>
      </template>
    </UiMenu>
    <UiButton v-else size="sm" :variant="variantOf(action)" :disabled="action.disabled" :title="action.title" @click="emit('run', action)">
      <template v-if="action.icon" #icon><component :is="action.icon" /></template>{{ action.label }}
    </UiButton>
  </template>
</template>

<script setup lang="ts" generic="T">
import { ChevronDown } from '@lucide/vue';
import type { ControlAction } from './ControlTable.vue';
import UiButton from './UiButton.vue';
import UiMenu from './UiMenu.vue';
import UiMenuItem from './UiMenuItem.vue';
import UiMenuSeparator from './UiMenuSeparator.vue';

defineProps<{ actions: ControlAction<T>[] }>();
const emit = defineEmits<{ run: [action: ControlAction<T>] }>();

const variantOf = (action: ControlAction<T>) => (action.tone === 'danger' ? 'danger' : action.tone === 'primary' ? 'primary' : 'secondary');
</script>
