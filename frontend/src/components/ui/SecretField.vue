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
        class="secret-input"
        :type="visible ? 'text' : 'password'"
        :value="modelValue"
        :placeholder="placeholder"
        :autocomplete="autocomplete"
        spellcheck="false"
        :aria-describedby="[field.describedBy, stateId].filter(Boolean).join(' ') || undefined"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)" />
      <!-- Le bouton n'apparait qu'une fois une valeur saisie : il n'y a rien a relire avant. -->
      <button v-if="modelValue" type="button" class="secret-toggle" :aria-pressed="visible"
        :aria-label="visible ? 'Masquer la valeur' : 'Afficher la valeur'" @click="visible = !visible">
        <component :is="visible ? EyeOff : Eye" :size="16" aria-hidden="true" />
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

const stateId = `secret-state-${useId()}`;
const visible = ref(false);

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
.secret-field{position:relative;display:flex;align-items:center;min-width:0}
.secret-input{width:100%;min-width:0;padding-right:44px}
.secret-toggle{position:absolute;right:4px;display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;border-radius:var(--radius-sm);background:transparent;color:var(--muted);cursor:pointer}
.secret-toggle:hover{color:var(--text)}
.secret-toggle:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
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
