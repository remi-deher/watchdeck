<template>
  <!-- Element de UiMenu comme de UiContextMenu : les deux reposent sur le meme Menu Reka.
       Survol et clavier partagent l'apparence (`data-highlighted`). -->
  <DropdownMenuItem
    class="ui-menu-item"
    :class="{ 'ui-menu-item--danger': variant === 'danger' }"
    :disabled="disabled"
    :text-value="textValue || undefined"
    @select="emit('select', $event)"
  >
    <slot />
  </DropdownMenuItem>
</template>

<script setup lang="ts">
import { DropdownMenuItem } from 'reka-ui';

withDefaults(defineProps<{
  variant?: 'default' | 'danger';
  disabled?: boolean;
  /** Texte de la recherche a la frappe, quand le contenu n'est pas du texte simple. */
  textValue?: string;
}>(), { variant: 'default', disabled: false, textValue: '' });

const emit = defineEmits<{ select: [event: Event] }>();
</script>
