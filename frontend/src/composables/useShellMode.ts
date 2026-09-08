import { computed, type Ref } from 'vue';
import { useMediaQuery } from './useMediaQuery';
import { SHELL_EXPANDED_QUERY, SHELL_MEDIUM_QUERY, type ShellMode } from '@/styles/breakpoints';

/**
 * Mode courant du shell.
 *
 * Le CSS ne suffit pas ici : les trois modes ne sont pas trois habillages d'un même
 * arbre, ils montent des composants différents (dock bas contre rail latéral). En
 * rendre deux et en masquer un dupliquerait l'état, les repères ARIA et les cibles
 * de tabulation — c'est exactement ce que le shell précédent évitait déjà.
 */
export function useShellMode(): Ref<ShellMode> {
  const atLeastMedium = useMediaQuery(SHELL_MEDIUM_QUERY);
  const atLeastExpanded = useMediaQuery(SHELL_EXPANDED_QUERY);
  return computed<ShellMode>(() => {
    if (atLeastExpanded.value) return 'expanded';
    if (atLeastMedium.value) return 'medium';
    return 'compact';
  });
}
