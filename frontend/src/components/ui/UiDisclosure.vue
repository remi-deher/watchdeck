<!--
  Section repliable a chargement paresseux : le contenu n'est rendu qu'a la premiere
  ouverture (evenement `open`, emis une seule fois, pour que le parent ne declenche
  ses appels reseau qu'a ce moment-la) et l'etat plie/deplie est memorise par
  utilisateur via `storage-key`.

  Sert a alleger les pages denses (tableau de bord, accueil Decouvrir) sans retirer
  de fonctionnalite : le secondaire reste a un clic, mais ne pese plus sur le premier
  ecran ni sur le chargement initial.
-->
<template>
  <details class="ui-disclosure" :open="isOpen" @toggle="onToggle">
    <summary>
      <div>
        <span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span>
        <strong>{{ title }}</strong>
        <p v-if="description">{{ description }}</p>
      </div>
      <ChevronDown aria-hidden="true" />
    </summary>
    <div v-if="loaded" class="ui-disclosure-content" :class="contentClass"><slot /></div>
  </details>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDown } from '@lucide/vue';

const props = withDefaults(
  defineProps<{
    title: string;
    eyebrow?: string;
    description?: string;
    /** Cle localStorage memorisant l'etat. Omise, l'etat n'est pas persiste. */
    storageKey?: string;
    defaultOpen?: boolean;
    contentClass?: string;
  }>(),
  {
    eyebrow: '',
    description: '',
    storageKey: '',
    defaultOpen: false,
    contentClass: '',
  }
);

const emit = defineEmits<{ (e: 'open'): void }>();

function readStored(): boolean {
  if (!props.storageKey) return props.defaultOpen;
  try {
    const stored = localStorage.getItem(props.storageKey);
    if (stored === null) return props.defaultOpen;
    // 'true'/'false' : valeurs ecrites par les sections qui geraient leur propre
    // <details> avant ce composant. On les relit pour ne pas perdre la preference.
    return stored === '1' || stored === 'true';
  } catch {
    return props.defaultOpen;
  }
}

const isOpen = ref(readStored());
const loaded = ref(isOpen.value);
if (isOpen.value) emit('open');

function onToggle(event: Event): void {
  const open = (event.currentTarget as HTMLDetailsElement).open;
  if (open === isOpen.value) return;
  isOpen.value = open;
  if (props.storageKey) {
    try {
      localStorage.setItem(props.storageKey, open ? '1' : '0');
    } catch {
      /* Preference non persistable : l'etat reste valable pour la session. */
    }
  }
  if (open && !loaded.value) {
    loaded.value = true;
    emit('open');
  }
}
</script>

<style scoped lang="scss">
.ui-disclosure { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-sunken); }
.ui-disclosure summary { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); min-height: 58px; padding: 12px 16px; cursor: pointer; list-style: none; }
.ui-disclosure summary::-webkit-details-marker { display: none; }
.ui-disclosure summary > div { display: grid; gap: var(--space-1); }
.ui-disclosure summary .eyebrow { color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
.ui-disclosure summary strong { font-size: var(--fs-md); }
.ui-disclosure summary p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.ui-disclosure summary > svg { flex-shrink: 0; width: 18px; color: var(--muted); transition: transform .2s ease; }
.ui-disclosure[open] summary > svg { transform: rotate(180deg); }
.ui-disclosure-content { display: grid; gap: var(--space-4); padding: 0 14px 14px; }
</style>
