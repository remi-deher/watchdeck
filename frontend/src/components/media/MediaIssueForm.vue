<template>
  <div class="panel form-section" style="margin-top: 1rem; border: 1px solid var(--border);">
    <label>Description du probleme
      <textarea v-model="localMessage" placeholder="Decrivez le probleme rencontre" rows="3" class="search"></textarea>
    </label>
    <div class="inline-row compact">
      <UiButton variant="primary" :disabled="busy || !localMessage.trim()" @click="$emit('submit', localMessage)">Envoyer</UiButton>
      <UiButton @click="$emit('cancel')">Annuler</UiButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import UiButton from '@/components/ui/UiButton.vue';

withDefaults(
  defineProps<{
    busy?: boolean;
  }>(),
  {
    busy: false,
  }
);

defineEmits<{
  (e: 'submit', message: string): void;
  (e: 'cancel'): void;
}>();

const localMessage = ref('');
</script>
