import { onUnmounted, ref, watch, type Ref } from 'vue';

const current = ref('');
/* Vue monte la page suivante avant de demonter la precedente. Sans savoir qui a
   ecrit la valeur courante, le demontage de l'ancienne page effacait ce que la
   nouvelle venait tout juste de fournir. */
let owner: symbol | null = null;

/**
 * Titre de la page courante, tel que la page elle-meme le formule.
 *
 * Depuis que le bandeau de titre a quitte la page, la barre de contexte est le seul
 * endroit ou ce titre s'affiche. Elle ne peut plus se contenter de `route.meta.title` :
 * plusieurs vues affinent leur titre selon la sous-section ouverte (« Films » plutot
 * qu'« Explorer », « File d'attente » plutot qu'« Acquisition »), et d'autres
 * divergeaient franchement de leur route — la page annoncait « Tableau de bord » quand
 * la navigation disait « Accueil ». Une seule source, portee par la page.
 */
export function providePageTitle(title: Ref<string>): void {
  const token = Symbol('page-title');
  watch(
    title,
    (value) => {
      owner = token;
      current.value = value;
    },
    { immediate: true }
  );
  // Les vues sans patron de page (fiches media, personne) n'en fournissent pas : on
  // rend la main pour que la barre retombe sur le titre de la route. Uniquement si
  // personne n'a pris le relais entre-temps.
  onUnmounted(() => {
    if (owner !== token) return;
    owner = null;
    current.value = '';
  });
}

/** Titre fourni par la page, vide si elle n'en declare pas. */
export function usePageTitle(): Ref<string> {
  return current;
}
