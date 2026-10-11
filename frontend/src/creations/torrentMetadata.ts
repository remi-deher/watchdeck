/* Categories et tags des clients torrent : modifier ceux d'une selection, creer, renommer.
   Une definition par geste ; ce que le client connait vient de la page, d'ou les fabriques. */
import type { CreateDefinition, CreateField } from '@/components/templates/create/types';
import { canonicalName, normalizeTags } from '@/composables/useTorrentMetadata';

export type MetadataKind = 'category' | 'tag';
const NOUNS: Record<MetadataKind, { noun: string; another: string; label: string; the: string }> = {
  category: { noun: 'une catégorie', another: 'une autre catégorie', label: 'Catégorie', the: 'la catégorie' },
  tag: { noun: 'un tag', another: 'un autre tag', label: 'Tag', the: 'le tag' },
};

/** Catégorie et tags des torrents sélectionnés, préremplis depuis le premier. */
export function torrentMetaEdit(known: { categories: string[]; tags: string[] }, count: number, save: (category: string, tags: string) => Promise<void>): CreateDefinition {
  const fields: CreateField[] = [
    { key: 'category', type: 'suggest', label: 'Catégorie', placeholder: 'Ex : radarr, sonarr, films', suggestions: known.categories },
    { key: 'tags', type: 'suggest', label: 'Tags', help: 'Séparés par des virgules.', placeholder: 'Ex : watchdeck, vff, 1080p', suggestions: known.tags },
  ];
  return {
    noun: 'la catégorie et les tags',
    another: '',
    editTitle: count > 1 ? `Catégorie et tags de ${count} torrents` : 'Catégorie et tags',
    submitLabel: 'Enregistrer',
    quick: true,
    initial: () => ({ category: '', tags: '' }),
    steps: [{ key: 'meta', label: 'Classement', title: 'Comment les ranger ?', description: count > 1 ? 'Le classement remplace celui de chacun des torrents sélectionnés.' : undefined, fields }],
    submit: async (values) => {
      const category = canonicalName(String(values.category || ''), known.categories);
      const tags = normalizeTags(String(values.tags || ''), known.tags);
      await save(category, tags);
      return { message: 'Classement enregistré' };
    },
  };
}

/** Une catégorie ou un tag de plus pour un client. */
export function metadataAdd(kind: MetadataKind, create: (name: string) => Promise<void>): CreateDefinition {
  const text = NOUNS[kind];
  return {
    noun: text.noun,
    another: text.another,
    submitLabel: 'Créer',
    quick: true,
    initial: () => ({ name: '' }),
    steps: [{ key: 'name', label: text.label, title: `Comment s’appelle ${text.noun} ?`, fields: [{ key: 'name', type: 'text', label: 'Nom', required: true }] }],
    submit: async (values) => {
      await create(String(values.name).trim());
      return { message: `${text.label} créé${kind === 'category' ? 'e' : ''}` };
    },
  };
}

/** Renommer une catégorie ou un tag : les torrents qui l'ont le suivent côté client. */
export function metadataRename(kind: MetadataKind, name: string, rename: (newName: string) => Promise<void>): CreateDefinition {
  const text = NOUNS[kind];
  return {
    noun: text.noun,
    another: text.another,
    editTitle: `Renommer « ${name} »`,
    submitLabel: 'Renommer',
    quick: true,
    initial: () => ({ name }),
    steps: [{ key: 'name', label: text.label, title: `Quel nouveau nom pour ${text.the} ?`, fields: [{ key: 'name', type: 'text', label: 'Nom', required: true }] }],
    submit: async (values) => {
      await rename(String(values.name).trim());
      return { message: `${text.label} renommé${kind === 'category' ? 'e' : ''}` };
    },
  };
}
