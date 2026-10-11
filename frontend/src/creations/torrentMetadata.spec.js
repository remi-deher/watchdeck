import { describe, expect, it, vi } from 'vitest';
import { metadataAdd, metadataRename, torrentMetaEdit } from './torrentMetadata';

const known = { categories: ['Films', 'Séries'], tags: ['vff', '4k'] };

describe('torrentMetadata', () => {
  it('range la sélection avec la casse du client et sans doublon de tag', async () => {
    const save = vi.fn(async () => {});
    const definition = torrentMetaEdit(known, 3, save);
    expect(definition.editTitle).toBe('Catégorie et tags de 3 torrents');
    expect(definition.quick).toBe(true);
    expect(definition.steps[0].fields.map((field) => [field.key, field.suggestions])).toEqual([['category', ['Films', 'Séries']], ['tags', ['vff', '4k']]]);
    await definition.submit({ category: 'films', tags: 'VFF, hdr, vff, 4K' });
    expect(save).toHaveBeenCalledWith('Films', 'vff, hdr, 4k');
  });

  it('nomme une seule sélection au singulier', () => {
    expect(torrentMetaEdit(known, 1, async () => {}).editTitle).toBe('Catégorie et tags');
  });

  it('crée une catégorie ou un tag avec le nom saisi, nettoyé', async () => {
    const create = vi.fn(async () => {});
    const category = metadataAdd('category', create);
    expect(category.noun).toBe('une catégorie');
    expect(category.steps[0].fields[0]).toMatchObject({ key: 'name', required: true });
    expect((await category.submit({ name: '  Documentaires ' })).message).toBe('Catégorie créée');
    expect(create).toHaveBeenCalledWith('Documentaires');
    expect((await metadataAdd('tag', create).submit({ name: 'hdr' })).message).toBe('Tag créé');
  });

  it('renomme à partir du nom actuel', async () => {
    const rename = vi.fn(async () => {});
    const definition = metadataRename('tag', 'vff', rename);
    expect(definition.editTitle).toBe('Renommer « vff »');
    expect(definition.initial()).toEqual({ name: 'vff' });
    await definition.submit({ name: ' vf ' });
    expect(rename).toHaveBeenCalledWith('vf');
  });
});
