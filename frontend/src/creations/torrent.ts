/* Ajouter un torrent : un lien Magnet, une URL ou un fichier .torrent, vers un client
   configure, avec sa categorie et ses tags. La liste des clients et ce que chacun connait
   (categories, tags) viennent de la page, d'ou la fabrique. */
import { api } from '@/api';
import type { CreateDefinition } from '@/components/templates/create/types';
import { canonicalName, normalizeTags, type ClientMetadata } from '@/composables/useTorrentMetadata';

export interface TorrentCreationContext {
  clients: Array<{ id?: string | number; name: string; client_type?: string }>;
  metadata: (clientId: string | number | null | undefined) => ClientMetadata;
  /** Cree la categorie et les tags que le client ne connait pas encore. */
  ensure: (clientId: string | number, category: string, tags: string) => Promise<void>;
}

const SOURCES = [
  { value: 'url', label: 'Lien Magnet ou URL', description: 'Un lien magnet: ou l’adresse d’un fichier .torrent.' },
  { value: 'file', label: 'Fichier .torrent', description: 'Un fichier de votre ordinateur.' },
];

export function torrentCreation({ clients, metadata, ensure }: TorrentCreationContext): CreateDefinition {
  return {
    noun: 'un torrent',
    another: 'un autre torrent',
    submitLabel: 'Ajouter le torrent',
    initial: () => ({ client_id: clients[0]?.id != null ? String(clients[0].id) : '', source: 'url', url: '', file: null, category: '', tags: '' }),
    steps: [{
      key: 'torrent',
      label: 'Torrent',
      title: 'Que voulez-vous télécharger ?',
      description: 'Le torrent part vers le client choisi, rangé dans sa catégorie.',
      fields: [
        {
          key: 'client_id', type: 'select', label: 'Client torrent', required: true,
          options: clients.map((client) => ({ value: String(client.id ?? ''), label: client.client_type ? `${client.name} (${client.client_type})` : client.name })),
          when: () => clients.length > 1,
        },
        { key: 'source', type: 'cards', label: 'Source', options: SOURCES, required: true },
        { key: 'url', type: 'textarea', label: 'Lien Magnet ou URL .torrent', placeholder: 'magnet:?xt=urn:btih:… ou http://…', required: true, when: (values) => values.source === 'url' },
        { key: 'file', type: 'file', label: 'Fichier .torrent', accept: '.torrent', placeholder: 'Glissez un fichier .torrent ou cliquez pour parcourir', required: true, when: (values) => values.source === 'file' },
        {
          key: 'category', type: 'suggest', label: 'Catégorie', placeholder: 'Choisir ou créer une catégorie',
          suggestions: (values) => metadata(values.client_id).categories,
        },
        {
          key: 'tags', type: 'suggest', label: 'Tags', help: 'Séparés par des virgules.', placeholder: 'Choisir ou saisir des tags',
          suggestions: (values) => metadata(values.client_id).tags,
        },
      ],
    }],
    submit: async (values) => {
      const known = metadata(values.client_id);
      const category = canonicalName(String(values.category || ''), known.categories);
      const tags = normalizeTags(String(values.tags || ''), known.tags);
      await ensure(values.client_id, category, tags);
      /* Le select rend des chaines ; l'API attend l'identifiant du client tel qu'il est. */
      const clientId = /^\d+$/.test(String(values.client_id)) ? Number(values.client_id) : values.client_id;
      if (values.source === 'url') {
        await api('/api/downloads/add', {
          method: 'POST',
          body: JSON.stringify({ client_id: clientId, torrent_url_or_magnet: String(values.url).trim(), category: category || undefined, tags: tags || undefined }),
        });
      } else {
        const form = new FormData();
        form.append('file', values.file as File);
        if (clientId !== '') form.append('client_id', String(clientId));
        if (category) form.append('category', category);
        if (tags) form.append('tags', tags);
        const response = await fetch('/api/downloads/add-file', { method: 'POST', body: form });
        if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || 'Échec de l’envoi du fichier torrent');
      }
      return { message: 'Torrent ajouté', detail: category ? `Rangé dans « ${category} ».` : 'Il apparaît dans la liste des torrents.' };
    },
  };
}
