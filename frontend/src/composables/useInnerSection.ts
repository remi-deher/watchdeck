import { computed, ref, type WritableComputedRef } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/**
 * Section interne d'une page de réglages, gardée dans l'adresse (`?section=`) : un lien ou
 * la touche Retour ramène au même bloc. Une valeur inconnue retombe sur la première.
 *
 * `inUrl: false` garde la section en mémoire seulement : pour un écran réutilisé dans une
 * fenêtre d'une autre page, dont l'adresse n'a pas à changer.
 */
export function useInnerSection(
  keys: readonly string[],
  fallback?: () => string,
  { inUrl = true }: { inUrl?: boolean } = {},
): WritableComputedRef<string> {
  const route = useRoute();
  const router = useRouter();
  const local = ref('');
  const first = () => fallback?.() || keys[0];
  return computed({
    get: () => {
      // Sans routeur (écran monté seul, tests), la section reste locale.
      const wanted = inUrl && route ? String(route.query.section ?? '') : local.value;
      return keys.includes(wanted) ? wanted : first();
    },
    set: (section: string) => {
      if (!inUrl || !route || !router) local.value = section;
      else void router.replace({ query: { ...route.query, section } });
    },
  });
}
