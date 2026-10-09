/* Creer : un service branche (instance Sonarr, Radarr, Prowlarr, Bazarr ou FileFlows).
   Les reglages d'ajout (profil, dossier) n'existent que pour Sonarr et Radarr. */
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

export const serviceCreation: CreateDefinition = {
  noun: 'un service',
  another: 'un autre service',
  initial: () => ({ arr_type: 'radarr', name: '', url: '', api_key: '', minimum_availability: 'released', root_folder: '' }),
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
          key: 'api_key', type: 'secret', label: 'Clé API', help: 'Paramètres → Général du service.',
          when: (values) => values.arr_type !== 'fileflows',
          validate: (value) => (!value ? 'Collez la clé API.' : null),
        },
      ],
    },
    {
      key: 'settings',
      label: 'Réglages',
      title: 'Comment ajouter les nouveaux médias ?',
      when: (values) => takesMedia(values.arr_type),
      fields: [
        { key: 'root_folder', type: 'text', label: 'Dossier racine', help: 'Là où le service range les médias.', placeholder: '/media/FILMS', required: true },
        {
          key: 'minimum_availability', type: 'select', label: 'Disponibilité minimale', help: 'Quand un film devient téléchargeable.',
          when: (values) => values.arr_type === 'radarr',
          options: [{ value: 'announced', label: 'Annoncé' }, { value: 'inCinemas', label: 'Au cinéma' }, { value: 'released', label: 'Sorti' }],
        },
      ],
    },
  ],
  test: {
    step: 'connection',
    fields: ['url', 'api_key', 'arr_type'],
    run: async (values) => {
      const data = await api<{ success: boolean; message?: string }>('/api/test/arr-instance', {
        method: 'POST',
        body: JSON.stringify({ url: values.url, api_key: values.api_key || null, arr_type: values.arr_type }),
      });
      return { ok: Boolean(data.success), message: data.message || (data.success ? 'Connecté' : 'Connexion impossible') };
    },
  },
  submit: async (values) => {
    await api('/api/arr-instances', {
      method: 'POST',
      body: JSON.stringify({
        name: values.name, arr_type: values.arr_type, url: values.url, api_key: values.api_key || null,
        root_folder: takesMedia(values.arr_type) ? values.root_folder : null,
        minimum_availability: values.arr_type === 'radarr' ? values.minimum_availability : undefined,
      }),
    });
    return {
      message: `${labelOf(values.arr_type)} « ${values.name} » branché`,
      detail: 'Il est actif et sera pris en compte à la prochaine synchronisation.',
      links: [{ label: 'Voir les connexions', to: '/settings/services/media' }],
    };
  },
};
