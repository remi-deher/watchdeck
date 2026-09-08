import { computed, type ComputedRef } from 'vue';
import { useRoute } from 'vue-router';
import type { SubnavItem } from '@/components/ui/AppSubnav.vue';
import { activeSectionKey, destinationForPath, sectionsFor } from '@/navigation';
import { useSession } from './useSession';

/**
 * Sections de second niveau de la destination courante.
 *
 * Derivation pure a partir de la route et des droits, donc appelable des deux cotes
 * sans rien se transmettre : la barre de contexte les affiche sur grand ecran, la page
 * les affiche en dessous. Sans cette source commune, les deux surfaces auraient chacune
 * leur copie de la logique, et l'une aurait fini par diverger de `navigation.ts`.
 */
export function usePageSections(): {
  sections: ComputedRef<SubnavItem[]>;
  activeKey: ComputedRef<string>;
  destinationLabel: ComputedRef<string>;
} {
  const route = useRoute();
  const { isAdmin, canModerate } = useSession();

  const destination = computed(() =>
    route ? destinationForPath(route.path, isAdmin.value, canModerate.value) : null
  );

  const sections = computed<SubnavItem[]>(() => {
    if (!destination.value) return [];
    return sectionsFor(destination.value.key, {
      isAdmin: isAdmin.value,
      canModerate: canModerate.value,
      arrInstances: [],
      downloadClients: [],
    }) as SubnavItem[];
  });

  return {
    sections,
    activeKey: computed(() => (route ? activeSectionKey(sections.value as any, route as any) : '')),
    destinationLabel: computed(() => destination.value?.label || ''),
  };
}
