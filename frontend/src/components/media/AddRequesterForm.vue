<template>
  <!-- Ajout d'une personne comme demandeur : dans la carte Demandeurs, ou seul quand
       personne n'a encore demandé le média (`standalone`). -->
  <form :class="['add-requester', { 'is-empty': standalone }]" @submit.prevent="submit">
    <label :for="fieldId" :class="standalone ? 'visually-hidden' : 'add-requester-label'">{{ label }}</label>
    <div class="add-requester-controls">
      <UiSelect
        :id="fieldId"
        :model-value="modelValue"
        :disabled="!users.length"
        :options="options"
        @update:model-value="emit('update:modelValue', $event)"
      />
      <UiButton type="submit" :variant="standalone ? 'primary' : undefined" :disabled="busy || !modelValue"><template #icon><UserPlus /></template>{{ submitLabel }}</UiButton>
    </div>
    <small v-if="help" class="add-requester-help">{{ help }}</small>
  </form>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { UserPlus } from '@lucide/vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import { requesterOptions } from './requestTabRules';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    /** Personnes qu'on peut encore ajouter. */
    users?: any[];
    busy?: boolean;
    label: string;
    submitLabel: string;
    help?: string;
    /** Formulaire seul (aucune demande) : libellé masqué, bouton principal, champs empilés sur téléphone. */
    standalone?: boolean;
  }>(),
  { modelValue: '', users: () => [], busy: false, help: '', standalone: false }
);

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'submit'): void;
}>();

const fieldId = `add-requester-${useId()}`;
const options = computed(() => requesterOptions(props.users));

function submit(): void {
  if (props.busy || !props.modelValue) return;
  emit('submit');
}
</script>

<style scoped lang="scss">
.add-requester {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2) var(--space-3);
}
.add-requester-label {
  font-size: var(--fs-md);
  font-weight: 600;
  white-space: nowrap;
}
.add-requester-controls {
  display: flex;
  flex: 1 1 260px;
  gap: var(--space-3);
  min-width: 0;
}
.add-requester,
.add-requester > * {
  min-width: 0;
}
.add-requester-controls > :deep(:first-child) {
  flex: 1 1 0;
  min-width: 0;
}
.add-requester-controls :deep(.ui-select-trigger),
.add-requester-controls :deep(.ui-button) {
  min-height: var(--touch-target);
  min-width: 0;
}
.add-requester-controls :deep(.ui-select-trigger) {
  width: 100%;
}
.add-requester-controls :deep(.ui-button) {
  flex: none;
}
.add-requester-help {
  flex-basis: 100%;
  color: var(--muted);
  font-size: var(--fs-xs);
}
.add-requester.is-empty {
  width: 100%;
  max-width: 520px;
  margin-top: 6px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* Téléphone (conteneur de l'onglet Demandes) : champs empilés. */
@container demandes (max-width: 560px) {
  .add-requester {
    flex-direction: column;
    flex-wrap: nowrap;
    align-items: stretch;
  }
  .add-requester-controls {
    flex-basis: auto;
  }
  .add-requester.is-empty .add-requester-controls {
    flex-direction: column;
  }
  .add-requester-help {
    flex-basis: auto;
  }
}
</style>
