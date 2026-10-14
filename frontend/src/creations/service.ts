/* Creer : un service branche (instance Sonarr, Radarr, Prowlarr, Bazarr ou FileFlows).
   Les reglages d'ajout (profil, dossier, serveur Plex) n'existent que pour Sonarr et Radarr.
   La meme definition sert a la modification (`id`) : valeurs actuelles, cle API vide = conservee. */
import { api } from '@/api';
import type { CreateDefinition } from '@/components/templates/create/types';

const SERVICES = [
  { value: 'radarr', label: 'Radarr', description: 'Films' },
  { value: 'sonarr', label: 'Sonarr', description: 'Séries' },
  { value: 'prowlarr', label: 'Prowlarr', description: 'Indexeurs' },
  { value: 'bazarr', label: 'Bazarr', description: 'Sous-titres' },
  { value: 'fileflows', label: 'FileFlows', description: 'Encodage' },
];
const labelOf = (type: string) => SERVICES.find((s) => s.value === type)?.label || 'service';
const takesMedia = (type: string) => type === 'radarr' || type === 'sonarr';

interface ServiceOption { value: string; label: string }
const keyless = (type: string) => type === 'fileflows';

/** `id` : l'instance modifiee ; absent, une nouvelle. `done` previent la liste (relecture, notification). */
export function serviceForm(id: number | string | null, done: (message: string) => void): CreateDefinition {
  // Lus a l'arrivee sur l'etape des reglages, depuis l'instance elle-meme.
  let profiles: ServiceOption[] = [];
  let folders: string[] = [];
  let plexServers: ServiceOption[] = [];

  async function loadOptions(values: Record<string, any>): Promise<void> {
    const query = id ? `?instance_id=${id}` : `?url=${encodeURIComponent(values.url)}&api_key=${encodeURIComponent(values.api_key || '')}`;
    const [profileList, folderList, plexList] = await Promise.all([
      api<any[]>(`/api/${values.arr_type}/profiles${query}`).catch(() => []),
      api<any[]>(`/api/${values.arr_type}/folders${query}`).catch(() => []),
      api<any[]>('/api/plex-servers').catch(() => []),
    ]);
    profiles = profileList.map((p) => ({ value: String(p.id), label: String(p.name) }));
    folders = folderList.map((f) => String(f.path || f));
    // Le principal vaut null cote API : c'est la valeur par defaut (`''` ici).
    plexServers = plexList
      .filter((server) => server.is_primary || server.enabled || String(server.id) === String(values.plex_server_id))
      .map((server) => ({ value: server.is_primary ? '' : String(server.id), label: String(server.name) }));
  }

  return {
    noun: 'un service',
    another: 'un autre service',
    editTitle: 'Modifier le service',
    quick: Boolean(id),
    initial: () => ({
      arr_type: 'radarr', name: '', url: '', api_key: '', minimum_availability: 'released', root_folder: '',
      quality_profile_id: '', plex_server_id: '', is_default: false, enabled: true, indexer_ids: null,
    }),
    steps: [
      {
        key: 'service',
        label: 'Service',
        title: 'Quel service voulez-vous brancher ?',
        fields: [{ key: 'arr_type', type: 'cards', label: 'Service', options: SERVICES, required: true }],
      },
      {
        key: 'connection',
        label: 'Connexion',
        title: (values) => `Où se trouve votre ${labelOf(values.arr_type)} ?`,
        fields: [
          { key: 'name', type: 'text', label: 'Nom', help: 'Pour le reconnaître dans Watchdeck.', placeholder: 'Radarr 4K', required: true },
          { key: 'url', type: 'url', label: 'Adresse', help: 'Adresse complète, avec le port.', placeholder: 'http://192.168.1.50:7878', required: true },
          {
            key: 'api_key', type: 'secret', label: 'Clé API',
            help: (id ? 'Enregistrée : laisser vide pour la garder. ' : '') + 'Paramètres → Général du service ; pour FileFlows, seulement si l’authentification est activée.',
            validate: (value, values) => (!value && !keyless(values.arr_type) && !values.has_api_key ? 'Collez la clé API.' : null),
          },
          { key: 'bazarr_note', type: 'note', label: '', when: (values) => values.arr_type === 'bazarr', text: 'Bazarr doit être relié aux mêmes instances Radarr/Sonarr que Watchdeck : il retrouve les médias par leur identifiant.' },
          { key: 'fileflows_note', type: 'note', label: '', when: (values) => values.arr_type === 'fileflows', text: 'Adresse de l’interface web FileFlows. Watchdeck y suit les traitements et peut relancer un fichier ou mettre FileFlows en pause.' },
        ],
      },
      {
        key: 'settings',
        label: 'Réglages',
        title: 'Comment ajouter les nouveaux médias ?',
        when: (values) => takesMedia(values.arr_type),
        onEnter: loadOptions,
        fields: [
          {
            key: 'quality_profile_id', type: 'select', label: 'Profil de qualité', help: 'Lu depuis le service.',
            options: () => [{ value: '', label: 'Par défaut' }, ...profiles],
          },
          { key: 'root_folder', type: 'suggest', label: 'Dossier racine', help: 'Là où le service range les médias.', placeholder: '/media/FILMS', required: true, suggestions: () => folders },
          {
            key: 'minimum_availability', type: 'select', label: 'Disponibilité minimale', help: 'Quand un film devient téléchargeable.',
            when: (values) => values.arr_type === 'radarr',
            options: [{ value: 'announced', label: 'Annoncé' }, { value: 'inCinemas', label: 'Au cinéma' }, { value: 'released', label: 'Sorti' }],
          },
          {
            key: 'plex_server_id', type: 'select', label: 'Serveur Plex', help: 'Serveur dont les bibliothèques sont rafraîchies après un import.',
            when: () => plexServers.length > 1, options: () => plexServers,
          },
          { key: 'is_default', type: 'toggle', label: 'Instance par défaut' },
          { key: 'default_note', type: 'note', label: '', text: 'Utilisée pour ce type quand plusieurs instances existent et qu’aucune n’est choisie pour une demande.' },
        ],
      },
    ],
    test: {
      step: 'connection',
      fields: ['url', 'api_key', 'arr_type'],
      run: async (values) => {
        const data = await api<{ success: boolean; message?: string }>('/api/test/arr-instance', {
          method: 'POST',
          body: JSON.stringify({ id: id ?? undefined, url: values.url, api_key: values.api_key || undefined, arr_type: values.arr_type }),
        });
        return { ok: Boolean(data.success), message: data.message || (data.success ? 'Connecté' : 'Connexion impossible') };
      },
    },
    submit: async (values) => {
      const media = takesMedia(values.arr_type);
      await api(id ? `/api/arr-instances/${id}` : '/api/arr-instances', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: values.name, arr_type: values.arr_type, url: values.url, api_key: values.api_key || null,
          root_folder: media ? values.root_folder : null,
          minimum_availability: values.arr_type === 'radarr' ? values.minimum_availability : undefined,
          quality_profile_id: media && values.quality_profile_id ? Number(values.quality_profile_id) : null,
          plex_server_id: media && values.plex_server_id ? Number(values.plex_server_id) : null,
          enabled: values.enabled, indexer_ids: values.indexer_ids,
          is_default: keyless(values.arr_type) ? false : Boolean(values.is_default),
        }),
      });
      done(id ? 'Instance mise à jour.' : 'Instance ajoutée.');
      return {
        message: `${labelOf(values.arr_type)} « ${values.name} » ${id ? 'mis à jour' : 'branché'}`,
        detail: id ? undefined : 'Il est actif et sera pris en compte à la prochaine synchronisation.',
        links: [{ label: 'Voir les connexions', to: '/settings/services/media' }],
      };
    },
  };
}

export const serviceCreation: CreateDefinition = serviceForm(null, () => {});
