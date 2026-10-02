<template>
  <!-- Menu d'actions, sur le DropdownMenu de Reka UI : il s'ouvre depuis son declencheur,
       se place dans l'ecran, se parcourt aux fleches (et a la frappe), se ferme a Echap
       ou au clic a cote, puis rend le focus au declencheur. Le contenu se compose de
       UiMenuItem, UiMenuSeparator et UiMenuLabel. -->
  <DropdownMenuRoot v-model:open="open" :modal="modal">
    <DropdownMenuTrigger as-child :disabled="disabled">
      <slot name="trigger" :open="open" />
    </DropdownMenuTrigger>
    <DropdownMenuPortal>
      <DropdownMenuContent
        class="ui-menu"
        :class="contentClass"
        :side="side"
        :align="align"
        :side-offset="6"
        :collision-padding="8"
      >
        <DropdownMenuLabel v-if="label" class="ui-menu-label">{{ label }}</DropdownMenuLabel>
        <slot />
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { DropdownMenuContent, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger } from 'reka-ui';

withDefaults(defineProps<{
  /** Intitule affiche en tete du menu. */
  label?: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** Classe(s) supplementaires du panneau, teleporte dans <body>. */
  contentClass?: string | string[] | Record<string, boolean>;
  /* Non modal par defaut : la page reste defilable et le reste de l'ecran cliquable. */
  modal?: boolean;
  disabled?: boolean;
}>(), { label: '', side: 'bottom', align: 'end', contentClass: '', modal: false, disabled: false });

const open = ref(false);
</script>
