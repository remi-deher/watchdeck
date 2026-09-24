<template>
  <label class="ui-switch" :class="{ 'is-on': modelValue, 'is-disabled': disabled }" :title="title">
    <span v-if="label" class="ui-switch-label">{{ label }}</span>
    <SwitchRoot class="ui-switch-track" :model-value="modelValue" :disabled="disabled" :aria-label="label || title || undefined"
      @update:model-value="$emit('update:modelValue', $event)">
      <SwitchThumb class="ui-switch-thumb" />
    </SwitchRoot>
  </label>
</template>

<script setup lang="ts">
import { SwitchRoot, SwitchThumb } from 'reka-ui';
withDefaults(
  defineProps<{
    modelValue?: boolean;
    label?: string;
    title?: string;
    disabled?: boolean;
  }>(),
  {
    modelValue: false,
    label: '',
    title: '',
    disabled: false,
  }
);

defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
}>();
</script>

<style scoped lang="scss">
.ui-switch { position: relative; display: inline-flex; align-items: center; gap: .5rem; cursor: pointer; }
.ui-switch.is-disabled { cursor: not-allowed; opacity: .55; }
.ui-switch-label { color: var(--text); font-size: var(--fs-xs); font-weight: 600; white-space: nowrap; }
/* Seul le pouce se deplace, par `transform` : le navigateur l'anime sans recalculer. */
.ui-switch-track {
  /* `min-height: 0` : la cible tactile de 44px imposee aux boutons vaut pour le libelle
     cliquable qui l'enveloppe, pas pour la piste, qui debordait de son conteneur. */
  position: relative; flex: none; width: 40px; height: 24px; min-height: 0; padding: 0;
  border: 1px solid var(--border); border-radius: 999px; background: var(--surface-3);
  cursor: inherit; transition: background-color var(--motion-duration-fast) var(--motion-ease-standard), border-color var(--motion-duration-fast) var(--motion-ease-standard);
}
.ui-switch-track[data-state="checked"] { border-color: var(--accent); background: var(--accent); }
.ui-switch-track:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ui-switch-thumb {
  position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%;
  background: var(--text); box-shadow: 0 1px 3px rgb(0 0 0 / 35%);
  transition: transform var(--motion-duration-fast) var(--motion-ease-emphasized);
}
.ui-switch-thumb[data-state="checked"] { transform: translateX(16px); background: var(--on-accent, #111); }
</style>
