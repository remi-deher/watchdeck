import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { humanizeError } from '@/utils/apiError';

/** Ce que le formulaire utilise de `useCrudResource`. */
interface Crud {
  items: ComputedRef<any[]>;
  loaded: ComputedRef<boolean>;
  edit: (item?: any) => void;
  saveOrThrow: () => Promise<any>;
}

/**
 * Cycle d'un formulaire de reglage ouvert dans la feuille : l'element vient de son
 * identifiant (`new` pour une creation), l'enregistrement rend son erreur au formulaire
 * plutot qu'a la page de reglages, restee derriere.
 */
export function useResourceForm(crud: Crud, id: Ref<string>) {
  const creating = computed(() => id.value === 'new');
  const error = ref('');
  const saving = ref(false);
  const item = computed(() => (creating.value ? null : crud.items.value.find((row: any) => String(row.id) === id.value) || null));
  const notFound = computed(() => !creating.value && crud.loaded.value && !item.value);

  // Une seule fois par element : une relecture de la liste pendant la saisie ne doit pas
  // ecraser ce qu'on est en train de taper.
  let rempli = '';
  watch([id, item, crud.loaded], () => {
    const cle = creating.value ? 'new' : item.value ? String(item.value.id) : '';
    if (!cle || cle === rempli) return;
    rempli = cle;
    error.value = '';
    crud.edit(item.value);
  }, { immediate: true });

  /** Enregistre ; `true` si c'est fait. */
  async function submit(): Promise<boolean> {
    saving.value = true;
    error.value = '';
    try {
      await crud.saveOrThrow();
      return true;
    } catch (e) {
      error.value = humanizeError(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  return { creating, item, notFound, error, saving, submit };
}
