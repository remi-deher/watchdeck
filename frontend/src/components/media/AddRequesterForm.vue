<template>
  <div class="add-requester">
    <UserPlus class="add-requester-icon" aria-hidden="true" />
    <UiSelect
      class="add-requester-select"
      :model-value="modelValue"
      :disabled="!users.length"
      :aria-label="label"
      :options="options"
      @update:model-value="$emit('update:modelValue', $event)"
    />
    <UiButton variant="primary" size="sm" :disabled="busy || !modelValue" @click="$emit('add')">Ajouter</UiButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { UserPlus } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSelect from '@/components/ui/UiSelect.vue';

const props = withDefaults(
  defineProps<{
    users?: any[];
    modelValue?: string;
    busy?: boolean;
    label?: string;
  }>(),
  { users: () => [], modelValue: '', busy: false, label: 'Ajouter un demandeur' }
);
defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'add'): void;
}>();

const options = computed(() => [
  { value: '', label: props.users.length ? props.label : 'Tous les utilisateurs sont déjà demandeurs' },
  ...props.users.map((u) => ({ value: u.plex_user_id, label: String(u.custom_name || u.display_name || u.plex_user_id) })),
]);
</script>

<style scoped lang="scss">
.add-requester {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 6px 6px 10px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-sm);
}
.add-requester-icon {
  width: 16px;
  height: 16px;
  flex: none;
  color: var(--muted);
}
.add-requester-select {
  flex: 1;
  min-width: 0;
}
</style>
