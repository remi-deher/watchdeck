<template>
  <!-- Trois menus deroulants Reka UI : ouverture au clavier comme a la souris, fleches pour
       parcourir, Echap et clic a cote pour fermer, placement qui ne deborde pas de l'ecran.
       Les cases restent ouvertes pendant qu'on coche : on choisit souvent plusieurs types. -->
  <div class="filter-pills-scroll">
    <span class="filter-label">Etat:</span>
    <DropdownMenuRoot :modal="false">
      <DropdownMenuTrigger class="filter-pill dropdown-toggle">
        {{ state === 'success' ? 'Envoyees' : state === 'error' ? 'Erreurs' : 'Tous les etats' }}
        <ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="multi-select-menu" align="start" :side-offset="6">
          <DropdownMenuRadioGroup :model-value="state" @update:model-value="(v) => $emit('update:state', String(v))">
            <DropdownMenuRadioItem v-for="option in STATE_OPTIONS" :key="option.value" class="check" :value="option.value">
              <DropdownMenuItemIndicator class="check-mark"><Check :size="14" /></DropdownMenuItemIndicator>
              {{ option.label }}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <div class="divider"></div>
    <span class="filter-label">Types:</span>
    <DropdownMenuRoot :modal="false">
      <DropdownMenuTrigger class="filter-pill dropdown-toggle">
        {{ selectedTypes.length ? selectedTypes.map(v=>typeOptions.find(o=>o.value===v)?.label||v).join(', ') : 'Tous les types' }}
        <ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="multi-select-menu" align="start" :side-offset="6">
          <DropdownMenuCheckboxItem
            v-for="typeOpt in typeOptions"
            :key="typeOpt.value"
            class="check"
            :model-value="selectedTypes.includes(typeOpt.value)"
            @select.prevent
            @update:model-value="toggleValue('update:selectedTypes', selectedTypes, typeOpt.value)"
          >
            <DropdownMenuItemIndicator class="check-mark"><Check :size="14" /></DropdownMenuItemIndicator>
            {{ typeOpt.label }}
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem v-if="selectedTypes.length" class="clear-selection" @select="$emit('update:selectedTypes', [])">Effacer</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>

    <div class="divider"></div>
    <span class="filter-label">Utilisateurs:</span>
    <DropdownMenuRoot :modal="false">
      <DropdownMenuTrigger class="filter-pill dropdown-toggle">
        {{ selectedUsers.length ? `${selectedUsers.length} selectionne(s)` : 'Tous les utilisateurs' }}
        <ChevronDown aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuPortal>
        <DropdownMenuContent class="multi-select-menu" align="start" :side-offset="6">
          <DropdownMenuCheckboxItem
            v-for="user in users"
            :key="user.id"
            class="check"
            :model-value="selectedUsers.includes(user.id)"
            @select.prevent
            @update:model-value="toggleValue('update:selectedUsers', selectedUsers, user.id)"
          >
            <DropdownMenuItemIndicator class="check-mark"><Check :size="14" /></DropdownMenuItemIndicator>
            {{ user.custom_name || user.display_name || user.plex_user_id }}
          </DropdownMenuCheckboxItem>
          <p v-if="!users.length" class="empty">Aucun utilisateur.</p>
          <DropdownMenuItem v-if="selectedUsers.length" class="clear-selection" @select="$emit('update:selectedUsers', [])">Effacer</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuPortal>
    </DropdownMenuRoot>
  </div>
</template>

<script setup lang="ts">
import { Check, ChevronDown } from '@lucide/vue';
import {
  DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuItemIndicator, DropdownMenuPortal,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuRoot, DropdownMenuTrigger,
} from 'reka-ui';

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

withDefaults(
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

const STATE_OPTIONS = [
  { value: '', label: 'Tous les etats' },
  { value: 'success', label: 'Envoyees' },
  { value: 'error', label: 'Erreurs' },
];

function toggleValue(event: string, list: (string | number)[], value: string | number): void {
  const next = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  emit(event as any, next);
}
</script>
