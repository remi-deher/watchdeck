<template>
  <div class="password-input">
    <input
      v-bind="$attrs"
      v-model="model"
      :type="visible ? 'text' : 'password'"
      placeholder="••••••••"
    >
    <button
      type="button"
      class="password-input__toggle"
      :aria-label="visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'"
      :aria-pressed="visible"
      @click="visible = !visible"
    >
      <EyeOff v-if="visible" aria-hidden="true" />
      <Eye v-else aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { Eye, EyeOff } from '@lucide/vue';

defineOptions({ inheritAttrs: false });

const model = defineModel<string>({ default: '' });
const visible = ref(false);
</script>

<style scoped lang="scss">
.password-input { position: relative; }
.password-input input { width: 100%; padding-right: calc(var(--touch-target) + var(--space-1)); }
.password-input__toggle {
  position: absolute;
  inset-block: 0;
  right: 0;
  display: grid;
  place-items: center;
  width: var(--touch-target);
  border: 0;
  background: none;
  color: var(--muted);
  cursor: pointer;
  svg { width: 18px; height: 18px; }
}
.password-input__toggle:hover { color: var(--text); }
</style>
