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
import { computed, inject, onMounted, onUnmounted } from 'vue';
import { ToggleGroupItem, ToggleGroupRoot } from 'reka-ui';
import { FILTER_CHIP_REGISTRY, type FilterChip } from '@/composables/useFiltersDrawer';

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
  /** Valeur « neutre » du filtre, quand ce n'est pas la premiere option (« Tous »).
   *  Sert a savoir si le filtre est actif, et a le retirer depuis sa puce. */
  defaultValue?: V;
}>(), { multiple: false, exclusion: false, itemClass: 'filter-badge' });

const emit = defineEmits<{ (e: 'update:modelValue', value: any): void }>();

/* Dans un panneau de filtres, le groupe annonce ce qu'il retient : le panneau en fait des
   puces retirables. Hors panneau (periodes d'un graphique...), rien n'est declare.
   L'enregistrement attend le montage : fait pendant `setup`, il modifiait le registre
   en plein rendu du panneau, qui se relancait alors en boucle. */
const registry = inject(FILTER_CHIP_REGISTRY, null);
if (registry) {
  const id = Symbol(props.label);
  onMounted(() => registry.register(id, activeChips));
  onUnmounted(() => registry.unregister(id));
}

function activeChips(): FilterChip[] {
  const labelOf = (value: unknown) => props.options.find((option) => option.value === value)?.label ?? String(value);
  if (props.multiple || props.exclusion) {
    const values = ((props.modelValue as V[]) || []) as unknown[];
    return values.map((value) => {
      const excluded = typeof value === 'string' && value.startsWith('!');
      const label = excluded ? `Sauf ${labelOf((value as string).slice(1))}` : labelOf(value);
      return {
        key: `${props.label}:${String(value)}`,
        label,
        onRemove: () => emit('update:modelValue', values.filter((v) => v !== value)),
      };
    });
  }
  const neutral = props.defaultValue !== undefined ? props.defaultValue : props.options[0]?.value;
  if (props.modelValue === neutral || props.modelValue === undefined || props.modelValue === null) return [];
  if (indexDe(props.modelValue as V) < 0) return [];
  return [{
    key: props.label,
    label: labelOf(props.modelValue),
    onRemove: () => emit('update:modelValue', neutral),
  }];
}

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
