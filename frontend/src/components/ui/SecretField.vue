<!--
  Champ unique pour tous les secrets (jetons, clés d'API, mots de passe SMTP).

  Trois conventions cohabitaient pour dire la même chose : « Laisser vide pour
  conserver » sur Plex, TMDB, Seer, SMTP et Brevo ; « Clé configurée » sur Tautulli ;
  un exemple de préfixe (« trr_pub_… ») sur Tracearr. Aucune ne permettait de vérifier
  ce qui était réellement enregistré, ni de relire une clé pour la comparer à celle du
  service d'en face.

  Ce composant dit toujours la même chose de la même façon : l'état du secret enregistré,
  un champ qui ne se remplit que si on veut le remplacer, et un bouton pour relire ce
  qu'on est en train de saisir.
-->
<template>
  <UiField :label="label" :hint="hint" v-slot="field">
    <div class="secret-field">
      <Password
        :input-id="field.id"
        :model-value="modelValue"
        :feedback="false"
        :toggle-mask="Boolean(modelValue)"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        :input-props="{ spellcheck: false, 'aria-describedby': [field.describedBy, stateId].filter(Boolean).join(' ') || undefined }"
        @update:model-value="$emit('update:modelValue', $event)" />
    </div>
    <p :id="stateId" class="secret-state" :class="{ 'is-set': configured }">
      <component :is="configured ? ShieldCheck : ShieldAlert" :size="13" aria-hidden="true" />
      <span>{{ stateLabel }}</span>
    </p>
  </UiField>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue';
import { ShieldAlert, ShieldCheck } from '@lucide/vue';
import Password from 'primevue/password';
import UiField from './UiField.vue';

const props = withDefaults(
  defineProps<{
    modelValue?: string;
    label: string;
    hint?: string;
    /** Vrai quand un secret est deja enregistre cote serveur. */
    configured?: boolean;
    /** Complement d'etat, par exemple la date d'enregistrement. */
    configuredDetail?: string;
    autocomplete?: string;
  }>(),
  { modelValue: '', hint: '', configured: false, configuredDetail: '', autocomplete: 'off' }
);

defineEmits<{ 'update:modelValue': [value: string] }>();

const stateId = `secret-state-${useId()}`;

const placeholder = computed(() =>
  props.configured ? 'Laisser vide pour conserver la valeur actuelle' : 'Aucune valeur enregistrée'
);

const stateLabel = computed(() => {
  if (!props.configured) return 'Aucun secret enregistré.';
  return props.configuredDetail
    ? `Secret enregistré ${props.configuredDetail}. Saisissez une valeur pour le remplacer.`
    : 'Secret enregistré. Saisissez une valeur pour le remplacer.';
});
</script>

<style scoped lang="scss">
.secret-field :deep(.p-password),.secret-field :deep(.p-password-input){width:100%;min-width:0}
.secret-state {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  margin: var(--space-1) 0 0;
  color: var(--muted);
  font-size: var(--fs-xs);
}
.secret-state.is-set { color: var(--green-text); }
</style>
