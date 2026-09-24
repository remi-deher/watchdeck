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
  <CollapsibleRoot class="ui-disclosure" :open="isOpen" @update:open="onToggle">
    <CollapsibleTrigger class="ui-disclosure-trigger">
      <div>
        <span v-if="eyebrow" class="eyebrow">{{ eyebrow }}</span>
        <strong>{{ title }}</strong>
        <p v-if="description">{{ description }}</p>
      </div>
      <ChevronDown aria-hidden="true" />
    </CollapsibleTrigger>
    <CollapsibleContent class="ui-disclosure-reveal">
      <div v-if="loaded" class="ui-disclosure-content" :class="contentClass"><slot /></div>
    </CollapsibleContent>
  </CollapsibleRoot>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { CollapsibleContent, CollapsibleRoot, CollapsibleTrigger } from 'reka-ui';
import { ChevronDown } from '@lucide/vue';
import { readPreference, writePreference } from '@/composables/usePreference';

const props = withDefaults(
  defineProps<{
    title: string;
    eyebrow?: string;
    description?: string;
    /** Clé de préférence mémorisant l'état. Omise, l'état n'est pas persisté. */
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
const booleanSerializer = { read: (value: string) => value === '1' || value === 'true', write: (value: boolean) => String(value) };

function readStored(): boolean {
  if (!props.storageKey) return props.defaultOpen;
  return readPreference(props.storageKey, props.defaultOpen, { serializer: booleanSerializer });
}

const isOpen = ref(readStored());
const loaded = ref(isOpen.value);
if (isOpen.value) emit('open');

function onToggle(open: boolean): void {
  if (open === isOpen.value) return;
  isOpen.value = open;
  if (props.storageKey) {
    writePreference(props.storageKey, open, { serializer: booleanSerializer });
  }
  if (open && !loaded.value) {
    loaded.value = true;
    emit('open');
  }
}
</script>

<style scoped lang="scss">
.ui-disclosure { overflow: hidden; border: 1px solid var(--border); border-radius: var(--radius-md); background: var(--surface-sunken); }
.ui-disclosure-trigger { display: flex; align-items: center; justify-content: space-between; gap: var(--space-4); width: 100%; min-height: 58px; padding: 12px 16px; border: 0; background: none; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.ui-disclosure-trigger:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.ui-disclosure-trigger > div { display: grid; gap: var(--space-1); }
.ui-disclosure-trigger .eyebrow { color: var(--muted); font-size: var(--fs-xs); font-weight: 650; }
.ui-disclosure-trigger strong { font-size: var(--fs-md); }
.ui-disclosure-trigger p { margin: 0; color: var(--muted); font-size: var(--fs-sm); }
.ui-disclosure-trigger > svg { flex-shrink: 0; width: 18px; color: var(--muted); transition: transform var(--motion-duration-fast) var(--motion-ease-standard); }
.ui-disclosure[data-state="open"] .ui-disclosure-trigger > svg { transform: rotate(180deg); }
.ui-disclosure-reveal { overflow: hidden; }
.ui-disclosure-reveal[data-state="open"] { animation: ui-disclosure-open var(--motion-duration-medium, var(--motion-duration-fast)) var(--motion-ease-standard); }
.ui-disclosure-reveal[data-state="closed"] { animation: ui-disclosure-close var(--motion-duration-fast) var(--motion-ease-standard); }
@keyframes ui-disclosure-open { from { height: 0; } to { height: var(--reka-collapsible-content-height); } }
@keyframes ui-disclosure-close { from { height: var(--reka-collapsible-content-height); } to { height: 0; } }
@media (prefers-reduced-motion: reduce) { .ui-disclosure-reveal[data-state] { animation: none; } }
.ui-disclosure-content { display: grid; gap: var(--space-4); padding: 0 14px 14px; }
</style>
