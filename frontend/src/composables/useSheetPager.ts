import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEventListener } from '@vueuse/core';
import { etatDeSurfaceCourant, voisinsCourants } from '@/composables/useMediaOverlay';

/**
 * « Precedent / suivant » d'une fiche ouverte depuis une liste (cadre SheetPage) : il parcourt
 * la liste d'ou l'on a ouvert la fiche (voir `etatDeVoisins`), aussi avec `j` / `k`.
 * `replace` : passer d'une fiche a l'autre n'empile pas d'entrees, « retour » ramene a la liste ;
 * l'etat de l'entree -- page de fond et voisins -- est repris tel quel.
 */
export function useSheetPager(id: Ref<string> | ComputedRef<string>, pathOf: (id: string) => string) {
  const route = useRoute();
  const router = useRouter();
  const voisins = computed(() => { void route.fullPath; return voisinsCourants(); });
  const index = computed(() => voisins.value.indexOf(id.value));
  /** Absent hors liste (adresse directe) ou liste d'un seul element : le cadre n'affiche rien. */
  const courant = computed(() => (index.value >= 0 && voisins.value.length > 1 ? { index: index.value, total: voisins.value.length } : null));
  /* L'entree d'historique se met a jour un instant apres la route : sans ce relais, la barre
     disparaissait entre deux fiches, et le bouton cliqué (et son focus) avec elle -- ce que le
     dialogue prend pour un appui a l'exterieur et ferme la feuille. */
  const retenu = ref(courant.value);
  watch(courant, (valeur) => { if (valeur) retenu.value = valeur; });
  const pager = computed(() => courant.value ?? retenu.value);

  function navigate(direction: number): void {
    const suivant = voisins.value[index.value + direction];
    if (!suivant) return;
    void router.replace({ path: pathOf(suivant), state: etatDeSurfaceCourant() as any });
  }
  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
    if (event.key === 'j') navigate(1);
    else if (event.key === 'k') navigate(-1);
  });
  return { pager, navigate };
}
