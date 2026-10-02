import { nextTick } from 'vue';
import UiSelect from '@/components/ui/UiSelect.vue';

/*
 * Pilotage de UiSelect dans les tests. Sa liste est un Select Reka teleporte, que jsdom
 * ouvre mal (pas de mise en page, pas d'evenements de pointeur fideles) : on passe par
 * l'interface du composant, comme le ferait le choix d'une option a l'ecran.
 */

/** Tous les UiSelect du rendu, ou ceux sous `selector`. */
export function uiSelects(wrapper, selector) {
  const root = selector ? wrapper.find(selector) : wrapper;
  return root.findAllComponents(UiSelect);
}

/** Valeur affichee, sous forme de texte comme `select.value`. */
export function selectedValue(select) {
  const value = select.props('modelValue');
  return value == null ? '' : String(value);
}

/** Choisit l'option dont la valeur, en texte, vaut `value`. */
export async function chooseOption(select, value) {
  const option = select.props('options').find((o) => String(o.value) === String(value));
  if (!option) throw new Error(`Option absente : ${value}`);
  select.vm.$emit('update:modelValue', option.value);
  await nextTick();
}
