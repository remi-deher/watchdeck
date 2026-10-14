import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { alignStreamsCreation } from './alignStreams';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('@/api', () => ({ api: apiMock }));

// Un épisode « à réaligner » : VF seulement en piste secondaire.
const needs = (episode, title) => ({ episode, title, status: 'vf_secondary' });
const fine = (episode, title) => ({ episode, title });

function fakeSeasons() {
  const detail = ref({ seasons: [
    { season_number: 1, counts: { vf_secondary: 1 }, episodes: [needs(1, 'Pilote'), fine(2, 'Suite')] },
    { season_number: 2, counts: {}, episodes: [] },
  ] });
  return { detail, reset: vi.fn(), loadAll: vi.fn(async () => {}), loadSeason: vi.fn(async () => {}), rescan: vi.fn(async () => {}) };
}
const show = { id: 7, title: 'Série', media_type: 'show' };
const make = (seasons, extra = {}) => alignStreamsCreation({ item: show, initialScope: 'selection', initialSeasonNumber: null, initialEpisodeNumber: null, seasons, onApplied: vi.fn(), ...extra });
const field = (definition, step, key) => definition.steps.find((entry) => entry.key === step).fields.find((entry) => entry.key === key);

beforeEach(() => apiMock.mockReset());

describe('alignStreamsCreation', () => {
  it('ne propose l’étape de portée que pour une série', () => {
    const movie = make(fakeSeasons(), { item: { id: 1, media_type: 'movie' } });
    expect(movie.steps.find((entry) => entry.key === 'scope').when()).toBe(false);
    expect(make(fakeSeasons()).steps.find((entry) => entry.key === 'scope').when()).toBe(true);
  });

  it('ouvre sur ce qui est à réaligner et range les épisodes par saison', async () => {
    const seasons = fakeSeasons();
    const definition = make(seasons);
    const values = definition.initial();
    await definition.steps[0].onEnter(values);
    expect(seasons.loadAll).toHaveBeenCalledTimes(1);
    expect(values.episodes).toEqual(['1:1']);
    const list = field(definition, 'scope', 'episodes');
    expect(list.options(values).map((option) => [option.value, option.group])).toEqual([['1:1', '1']]);
    values.showAll = true;
    expect(list.options(values).map((option) => option.value)).toEqual(['1:1', '1:2']);
    expect(list.groups(values).map((group) => [group.key, group.badge])).toEqual([['1', 2], ['2', undefined]]);
  });

  it('interroge l’analyse avec la sélection et envoie les épisodes choisis', async () => {
    const definition = make(fakeSeasons());
    const values = { ...definition.initial(), episodes: ['1:1', '1:2'] };
    apiMock.mockResolvedValueOnce({ available_users: [{ name: 'Admin' }], target_audio: { id: 2 } });
    await definition.steps[1].onEnter(values);
    expect(apiMock).toHaveBeenCalledWith('/api/vf-upgrades/audit/7/preview?episodes=1%3A1&episodes=1%3A2');
    expect(values).toMatchObject({ users: ['Admin'], audioId: '2' });
    apiMock.mockResolvedValueOnce({});
    await definition.submit(values);
    expect(JSON.parse(apiMock.mock.calls.at(-1)[1].body)).toMatchObject({ episodes: [[1, 1], [1, 2]], mode: 'auto' });
  });

  it('exige au moins un épisode en sélection ciblée', () => {
    const list = field(make(fakeSeasons()), 'scope', 'episodes');
    expect([list.validate([]), list.validate(['1:1'])]).toEqual(['Choisissez au moins un épisode.', undefined]);
  });
});
