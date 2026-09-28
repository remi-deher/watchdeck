<template>
  <!-- Menu contextuel, sur le ContextMenu de Reka UI : il s'ouvre au clic droit (ou a
       l'appui long au doigt) sur la zone du slot par defaut, se place au pointeur sans
       deborder de l'ecran et partage l'apparence et les elements de UiMenu. -->
  <ContextMenuRoot :modal="modal">
    <ContextMenuTrigger as-child :disabled="disabled">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuPortal>
      <ContextMenuContent class="ui-menu" :class="contentClass" :collision-padding="8">
        <ContextMenuLabel v-if="label" class="ui-menu-label">{{ label }}</ContextMenuLabel>
        <slot name="items" />
      </ContextMenuContent>
    </ContextMenuPortal>
  </ContextMenuRoot>
</template>

<script setup lang="ts">
import { ContextMenuContent, ContextMenuLabel, ContextMenuPortal, ContextMenuRoot, ContextMenuTrigger } from 'reka-ui';

withDefaults(defineProps<{
  label?: string;
  contentClass?: string | string[] | Record<string, boolean>;
  modal?: boolean;
  disabled?: boolean;
}>(), { label: '', contentClass: '', modal: false, disabled: false });
</script>
