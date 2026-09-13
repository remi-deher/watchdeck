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
      <input
        :id="field.id"
        ref="input"
        :value="modelValue"
        :type="revealed ? 'text' : 'password'"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        spellcheck="false"
        :aria-describedby="[field.describedBy, stateId].filter(Boolean).join(' ') || undefined"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      >
      <!-- Le bouton ne revele que la saisie en cours : le secret deja enregistre n'est
           jamais renvoye au navigateur, il n'y a donc rien a devoiler tant qu'on n'a
           pas tape quelque chose. -->
      <button
        type="button"
        class="secret-reveal"
        :disabled="!modelValue"
        :aria-pressed="revealed"
        :aria-label="revealed ? 'Masquer la saisie' : 'Afficher la saisie'"
        :title="revealed ? 'Masquer la saisie' : 'Afficher la saisie'"
        @click="revealed = !revealed"
      >
        <EyeOff v-if="revealed" :size="16" aria-hidden="true" />
        <Eye v-else :size="16" aria-hidden="true" />
      </button>
    </div>
    <p :id="stateId" class="secret-state" :class="{ 'is-set': configured }">
      <component :is="configured ? ShieldCheck : ShieldAlert" :size="13" aria-hidden="true" />
      <span>{{ stateLabel }}</span>
    </p>
  </UiField>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import { Eye, EyeOff, ShieldAlert, ShieldCheck } from '@lucide/vue';
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

const revealed = ref(false);
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
.secret-field {
  display: flex;
  align-items: stretch;
  gap: var(--space-2);
}
.secret-field input {
  flex: 1;
  min-width: 0;
}
.secret-reveal {
  display: grid;
  flex: none;
  place-items: center;
  width: var(--touch-target);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}
.secret-reveal:hover:not(:disabled) { color: var(--text); border-color: var(--border-strong, var(--border)); }
.secret-reveal:disabled { opacity: .45; cursor: not-allowed; }
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
