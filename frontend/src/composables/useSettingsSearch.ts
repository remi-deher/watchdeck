/* Recherche dans les réglages.
 *
 * Depuis que les groupes de réglages sont devenus sept destinations du rail, la question
 * n'est plus « comment régler ceci » mais « où vit ce réglage ». La barre répond aux
 * deux : elle retranche les cartes de la page affichée, et signale ce qui correspond
 * ailleurs dans l'application.
 *
 * Les cartes se déclarent elles-mêmes plutôt que d'être parcourues depuis la page : leur
 * contenu vit dans des slots, et seule la carte sait ce qu'elle porte vraiment.
 */
import { computed, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, watch, type ComputedRef, type InjectionKey, type Ref } from 'vue';

export interface SettingsSearchContext {
  query: Ref<string>;
  /** Nombre de cartes affichées et nombre total, pour le compteur du champ. */
  matched: ComputedRef<number>;
  total: ComputedRef<number>;
  register: (id: symbol, matches: () => boolean) => void;
  unregister: (id: symbol) => void;
  /** Recompte après un rendu : le texte d'une carte n'existe qu'une fois montée. */
  refresh: () => void;
}

const KEY: InjectionKey<SettingsSearchContext> = Symbol('settings-search');

export function normalizeSearchText(value: string): string {
  // Sans repli des accents, « Bibliotheque » ne trouverait pas « Bibliothèque » — et
  // personne ne tape les accents dans un champ de recherche.
  return (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function matchesQuery(haystack: string, query: string): boolean {
  const needle = normalizeSearchText(query);
  if (!needle) return true;
  const text = normalizeSearchText(haystack);
  // Tous les mots doivent apparaître, dans n'importe quel ordre : « plex token » trouve
  // aussi bien « Token Plex » que « Plex : jeton d'accès ».
  return needle.split(/\s+/).every((word) => text.includes(word));
}

export function provideSettingsSearch(query: Ref<string>): SettingsSearchContext {
  const cards = ref(new Map<symbol, () => boolean>());
  const revision = ref(0);

  const results = computed(() => {
    // `revision` et `query` sont lus pour que le calcul se rejoue : le reste dépend du
    // DOM, que Vue ne surveille pas.
    revision.value;
    query.value;
    let matched = 0;
    for (const test of cards.value.values()) if (test()) matched += 1;
    return { matched, total: cards.value.size };
  });

  const context: SettingsSearchContext = {
    query,
    matched: computed(() => results.value.matched),
    total: computed(() => results.value.total),
    register: (id, matches) => {
      cards.value.set(id, matches);
      cards.value = new Map(cards.value);
    },
    unregister: (id) => {
      cards.value.delete(id);
      cards.value = new Map(cards.value);
    },
    refresh: () => {
      revision.value += 1;
    },
  };
  provide(KEY, context);
  return context;
}

/** Contexte de recherche, ou `null` hors des réglages — une carte reste utilisable seule. */
export function useSettingsSearch(): SettingsSearchContext | null {
  return inject(KEY, null);
}

/* Contexte d'un groupe (section de réglages, liste d'objets) pour ses lignes : quand la
   recherche correspond au titre du groupe, toutes ses lignes restent affichées -- chercher
   « seed » doit montrer la section « Seed et nettoyage » entière, pas une section vide. */
export interface SettingsGroupContext {
  titleMatches: ComputedRef<boolean>;
}
export const SETTINGS_GROUP_KEY: InjectionKey<SettingsGroupContext> = Symbol('settings-group');

/**
 * Bloc filtrable par la barre de recherche des réglages : section, ligne ou objet.
 *
 * Le bloc lit son propre texte rendu (titre, aide, contenu des slots) plutôt que ses
 * seules propriétés, comme le faisait la carte. `count` décide s'il compte dans le
 * « n sur m » du champ : on compte les groupes et les objets, pas chaque ligne.
 */
export function useSearchableBlock(
  element: () => HTMLElement | null | undefined,
  extraText: () => string = () => '',
  options: { count?: boolean; alsoMatches?: () => boolean } = {}
): { visible: Ref<boolean>; query: ComputedRef<string> } {
  const search = useSettingsSearch();
  const visible = ref(true);
  const id = Symbol('settings-block');
  const counted = options.count !== false;

  function evaluate(): boolean {
    const query = search?.query.value || '';
    const found = Boolean(options.alsoMatches?.()) || matchesQuery(`${extraText()} ${element()?.textContent || ''}`, query);
    visible.value = found;
    return found;
  }

  if (search) {
    onMounted(async () => {
      if (counted) search.register(id, evaluate);
      // Le texte n'existe qu'après le rendu des slots.
      await nextTick();
      evaluate();
      search.refresh();
    });
    onBeforeUnmount(() => {
      if (counted) search.unregister(id);
    });
    watch(
      () => search.query.value,
      () => {
        evaluate();
        search.refresh();
      }
    );
  }
  return { visible, query: computed(() => search?.query.value || '') };
}
