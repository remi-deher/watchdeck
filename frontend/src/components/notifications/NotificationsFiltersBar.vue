<template>
  <div class="filter-pills-scroll">
    <span class="filter-label">Etat:</span>
    <div class="multi-select" :class="{open:activeDropdown==='state'}" v-click-outside="() => { if (activeDropdown === 'state') activeDropdown = null }">
      <button class="filter-pill dropdown-toggle" @click="activeDropdown = activeDropdown === 'state' ? null : 'state'">
        {{ state === 'success' ? 'Envoyees' : state === 'error' ? 'Erreurs' : 'Tous les etats' }}
        <ChevronDown/>
      </button>
      <div v-if="activeDropdown === 'state'" class="multi-select-menu" @click.stop>
        <label class="check"><input type="radio" :checked="state===''" @change="$emit('update:state','')"> Tous les etats</label>
        <label class="check"><input type="radio" :checked="state==='success'" @change="$emit('update:state','success')"> Envoyees</label>
        <label class="check"><input type="radio" :checked="state==='error'" @change="$emit('update:state','error')"> Erreurs</label>
      </div>
    </div>

    <div class="divider"></div>
    <span class="filter-label">Types:</span>
    <div class="multi-select" :class="{open:activeDropdown==='types'}" v-click-outside="() => { if (activeDropdown === 'types') activeDropdown = null }">
      <button class="filter-pill dropdown-toggle" @click="activeDropdown = activeDropdown === 'types' ? null : 'types'">
        {{ selectedTypes.length ? selectedTypes.map(v=>typeOptions.find(o=>o.value===v)?.label||v).join(', ') : 'Tous les types' }}
        <ChevronDown/>
      </button>
      <div v-if="activeDropdown === 'types'" class="multi-select-menu" @click.stop>
        <label class="check" v-for="typeOpt in typeOptions" :key="typeOpt.value">
          <input type="checkbox" :value="typeOpt.value" :checked="selectedTypes.includes(typeOpt.value)" @change="toggleValue('update:selectedTypes',selectedTypes,typeOpt.value)"> {{ typeOpt.label }}
        </label>
        <button v-if="selectedTypes.length" class="text-button clear-selection" @click="$emit('update:selectedTypes',[])">Effacer</button>
      </div>
    </div>

    <div class="divider"></div>
    <span class="filter-label">Utilisateurs:</span>
    <div class="multi-select" :class="{open:activeDropdown==='users'}" v-click-outside="() => { if (activeDropdown === 'users') activeDropdown = null }">
      <button class="filter-pill dropdown-toggle" @click="activeDropdown = activeDropdown === 'users' ? null : 'users'">
        {{ selectedUsers.length ? `${selectedUsers.length} selectionne(s)` : 'Tous les utilisateurs' }}
        <ChevronDown/>
      </button>
      <div v-if="activeDropdown === 'users'" class="multi-select-menu" @click.stop>
        <label class="check" v-for="user in users" :key="user.id">
          <input type="checkbox" :value="user.id" :checked="selectedUsers.includes(user.id)" @change="toggleValue('update:selectedUsers',selectedUsers,user.id)"> {{ user.custom_name || user.display_name || user.plex_user_id }}
        </label>
        <p v-if="!users.length" class="empty">Aucun utilisateur.</p>
        <button v-if="selectedUsers.length" class="text-button clear-selection" @click="$emit('update:selectedUsers',[])">Effacer</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDown } from '@lucide/vue';
import type { DirectiveBinding, ObjectDirective } from 'vue';

export interface FilterUser {
  id: number | string;
  custom_name?: string;
  display_name?: string;
  plex_user_id?: string;
}

export interface FilterTypeOption {
  value: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    state?: string;
    selectedTypes?: string[];
    selectedUsers?: (string | number)[];
    users?: FilterUser[];
    typeOptions?: FilterTypeOption[];
  }>(),
  {
    state: '',
    selectedTypes: () => [],
    selectedUsers: () => [],
    users: () => [],
    typeOptions: () => [],
  }
);

const emit = defineEmits<{
  (e: 'update:state', val: string): void;
  (e: 'update:selectedTypes', val: string[]): void;
  (e: 'update:selectedUsers', val: (string | number)[]): void;
}>();

const activeDropdown = ref<string | null>(null);

function toggleValue(event: string, list: (string | number)[], value: string | number): void {
  const next = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  emit(event as any, next);
}

interface ClickOutsideHTMLElement extends HTMLElement {
  clickOutsideEvent?: (event: MouseEvent) => void;
}

const vClickOutside: ObjectDirective<ClickOutsideHTMLElement> = {
  mounted(el: ClickOutsideHTMLElement, binding: DirectiveBinding) {
    el.clickOutsideEvent = function (event: MouseEvent) {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value(event);
      }
    };
    document.addEventListener('click', el.clickOutsideEvent);
  },
  unmounted(el: ClickOutsideHTMLElement) {
    if (el.clickOutsideEvent) document.removeEventListener('click', el.clickOutsideEvent);
  },
};
</script>
