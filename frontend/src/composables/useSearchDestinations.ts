import { computed, type Ref } from 'vue';
import { Film, Monitor, Moon, Server, Sun, Tv } from '@lucide/vue';
import { THEME_OPTIONS, useTheme, type ThemeChoice } from '@/composables/useTheme';
import { adminAreasFor, destinationsFor, EXPLORER_TABS, LIBRARY_TYPE_TABS, sectionsFor } from '@/navigation';
import { useDownloadSources } from '@/composables/useDownloadSources';
import { rankCommands } from '@/utils/commandScore';

const ADMIN_KEYWORDS = 'parametres reglages configuration administration';
export interface SearchDestination {
  id: string;
  label: string;
  group: string;
  /** Mots qu'on tape sans qu'ils figurent dans le libelle (« parametres » pour un reglage). */
  keywords?: string;
  to: string | Record<string, any>;
  icon?: any;
  /** Action sur place, sans navigation (choix du theme). */
  run?: () => void;
}


export function useSearchDestinations(query: Ref<string>, isAdmin: Ref<boolean>, canModerate: Ref<boolean>) {
  const { arrInstances, downloadClients, load } = useDownloadSources();
  const { setTheme } = useTheme();
  const THEME_ICONS: Record<ThemeChoice, any> = { system: Monitor, dark: Moon, light: Sun };
  const commands = computed<SearchDestination[]>(() => {
    const context = {
      isAdmin: isAdmin.value,
      canModerate: canModerate.value,
      arrInstances: arrInstances.value,
      downloadClients: downloadClients.value,
    };

    // Les groupes de l'Administration ne sont plus dans le rail, mais restent des
    // destinations : la recherche les propose comme les autres.
    const destinations = [...destinationsFor(isAdmin.value, canModerate.value), ...adminAreasFor(isAdmin.value)];
    const items: SearchDestination[] = destinations.map((destination) => ({
      id: `nav-${destination.key}`,
      label: destination.label,
      group: destination.space === 'admin' ? 'Administration' : destination.group,
      keywords: destination.space === 'admin' ? ADMIN_KEYWORDS : undefined,
      to: destination.to,
      icon: destination.icon,
    }));

    // Toute section est atteignable par son nom, y compris les instances *arr et les
    // clients torrent : c'est ce qui permet a la navigation visible de rester sobre.
    for (const destination of destinations) {
      for (const section of sectionsFor(destination.key, context)) {
        items.push({
          id: `section-${destination.key}-${section.key}`,
          label: section.label,
          group: destination.label,
          keywords: destination.space === 'admin' ? ADMIN_KEYWORDS : undefined,
          to: section.to,
          icon: section.icon || destination.icon,
        });
      }
    }

    // Les instances *arr sont des destinations de recherche, pas des onglets : la palette
    // garde leur acces direct sans encombrer le shell visible. Les reglages, eux, sont deja
    // atteignables par leurs sections.
    if (isAdmin.value) {
      for (const instance of arrInstances.value.filter((item) => item.id != null && item.enabled !== false)) {
        const kind = String(instance.arr_type);
        if (!['radarr', 'sonarr'].includes(kind)) continue;
        items.push({
          id: `scope-${kind}-${instance.id}`,
          label: instance.name || `Instance ${instance.id}`,
          group: 'Périmètres d’acquisition',
          to: { path: '/downloads', query: { view: kind, instance: String(instance.id) } },
          icon: kind === 'radarr' ? Film : Tv,
        });
      }
      for (const client of downloadClients.value.filter((item) => item.id != null && item.enabled !== false)) {
        items.push({
          id: `scope-client-${client.id}`,
          label: client.name || `Client ${client.id}`,
          group: 'Périmètres d’acquisition',
          to: { path: '/downloads', query: { view: 'clients', sub: 'instances', client: String(client.id) } },
          icon: Server,
        });
      }
    }

    // Les onglets d'Explorer et de la Bibliotheque ne sont plus des sections : on les
    // ajoute a part pour que « films » ou « musique » y menent toujours.
    for (const tab of EXPLORER_TABS) {
      items.push({ id: `tab-explorer-${tab.key}`, label: tab.label, group: 'Explorer', to: tab.to!, icon: tab.icon });
    }
    if (canModerate.value) {
      for (const tab of LIBRARY_TYPE_TABS) {
        items.push({ id: `tab-library-${tab.key}`, label: tab.label, group: 'Bibliothèque', to: tab.to!, icon: tab.icon });
      }
    }

    // Le theme se change d'ici sans quitter la page (« theme », « clair », « sombre »).
    for (const option of THEME_OPTIONS) {
      items.push({
        id: `theme-${option.value}`,
        label: `Thème ${option.label.toLowerCase()}`,
        group: 'Apparence',
        to: '',
        icon: THEME_ICONS[option.value],
        run: () => setTheme(option.value),
      });
    }

    // Une meme destination peut venir de la navigation et des reglages (« Plex &
    // Bibliotheque » sous Services) : on ne garde que la premiere occurrence d'un meme
    // libelle dans un meme groupe.
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = `${item.group}\u0000${item.label}`;
      return !seen.has(key) && Boolean(seen.add(key));
    });
  });

  const results = computed(() => query.value.trim() ? rankCommands(commands.value, query.value) : []);
  return { results, load };
}
