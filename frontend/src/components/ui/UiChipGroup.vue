<template>
  <!-- Une rangee de pastilles de filtre, sur le ToggleGroup de Reka UI : chaque pastille
       annonce son etat (enfoncee ou non) aux lecteurs d'ecran, et la rangee se parcourt
       aux fleches -- ce que 99 boutons copies-colles ne faisaient pas. L'apparence reste
       celle de `.filter-badge` (voir `_layout.scss`). -->
  <ToggleGroupRoot
    class="ui-chip-group"
    :type="multiple || exclusion ? 'multiple' : 'single'"
    :model-value="cleCourante"
    :aria-label="label"
    :loop="true"
    @update:model-value="choisir"
  >
    <ToggleGroupItem
      v-for="(option, index) in options"
      :key="cle(index)"
      :value="cle(index)"
      :disabled="option.disabled"
      :class="[itemClass, option.class, { active: estActive(option.value), excluded: estExclue(option.value) }]"
      :aria-label="estExclue(option.value) ? `${option.label}, exclu` : undefined"
    >
      <slot name="option" :option="option" :active="estActive(option.value)" :excluded="estExclue(option.value)">
        <component :is="option.icon" v-if="option.icon" aria-hidden="true" />
        <span>{{ option.label }}</span>
        <span v-if="option.count != null" class="count">{{ option.count }}</span>
      </slot>
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>

<script setup lang="ts" generic="V extends string | number | boolean | null">
import { computed } from 'vue';
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui';

export interface UiChipOption<Value = string> {
  value: Value;
  label: string;
  count?: number | string | null;
  icon?: unknown;
  disabled?: boolean;
  class?: string | Record<string, boolean>;
}

const props = withDefaults(defineProps<{
  /** Valeur choisie ; un tableau en choix multiple. */
  modelValue: V | V[];
  options: UiChipOption<V>[];
  /** Nom accessible de la rangee (« Statut », « Type de média »…). */
  label: string;
  multiple?: boolean;
  /** Choix multiple a trois etats : un appui inclut, le suivant exclut, le troisieme
   *  libere. Les exclusions sont rendues prefixees de `!` (« !films »). */
  exclusion?: boolean;
  /** Classe de chaque bouton : pastille de filtre par defaut, ou l'apparence d'un autre
   *  groupe de bascules (periodes d'un graphique, filtres rapides...). */
  itemClass?: string;
}>(), { multiple: false, exclusion: false, itemClass: 'filter-badge' });

const emit = defineEmits<{ (e: 'update:modelValue', value: any): void }>();

/* Reka compare les valeurs, et plusieurs filtres utilisent la chaine vide pour « Tous » :
   il la confondrait avec « rien de choisi ». Chaque option recoit donc une cle interne. */
const cle = (index: number) => `o${index}`;
const indexDe = (value: V) => props.options.findIndex((option) => option.value === value);

const plusieurs = computed(() => props.multiple || props.exclusion);
const valeurs = computed(() => (plusieurs.value ? (props.modelValue as V[]) || [] : []) as unknown[]);
const exclue = (value: V) => `!${String(value)}`;

function estActive(value: V): boolean {
  return plusieurs.value ? valeurs.value.includes(value) : props.modelValue === value;
}
function estExclue(value: V): boolean {
  return props.exclusion && valeurs.value.includes(exclue(value));
}

/* Enfoncee vaut « retenue », incluse ou exclue : l'exclusion se dit dans le nom et la
   classe, un lecteur d'ecran n'ayant pas d'etat pour elle. */
const cleCourante = computed(() => {
  if (plusieurs.value) {
    return props.options
      .map((option, index) => (estActive(option.value) || estExclue(option.value) ? cle(index) : null))
      .filter((k): k is string => k !== null);
  }
  const i = indexDe(props.modelValue as V);
  return i >= 0 ? cle(i) : undefined;
});

function choisir(next: unknown): void {
  const valeurDe = (k: unknown) => props.options[Number(String(k).slice(1))]?.value;
  if (props.exclusion) {
    // Une seule pastille change a chaque appui : on la retrouve, puis on la fait
    // tourner neutre -> incluse -> exclue -> neutre.
    const cles = new Set((next as unknown[]) || []);
    const index = props.options.findIndex((option, i) => cles.has(cle(i)) !== (estActive(option.value) || estExclue(option.value)));
    if (index < 0) return;
    const value = props.options[index].value;
    const reste = valeurs.value.filter((v) => v !== value && v !== exclue(value));
    if (estActive(value)) emit('update:modelValue', [...reste, exclue(value)]);
    else if (estExclue(value)) emit('update:modelValue', reste);
    else emit('update:modelValue', [...reste, value]);
    return;
  }
  if (props.multiple) {
    emit('update:modelValue', ((next as unknown[]) || []).map(valeurDe));
    return;
  }
  // En choix unique, retoucher la pastille active ne la « decoche » pas : un filtre a
  // toujours une valeur, fut-ce « Tous ».
  if (next === undefined || next === null || next === '') return;
  emit('update:modelValue', valeurDe(next));
}
</script>

<style scoped lang="scss">
.ui-chip-group { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.ui-chip-group > :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
</style>
