import { beforeEach, describe, expect, it, vi } from 'vitest';
import { manualImportCreation } from './manualImport';

const apiMock = vi.hoisted(() => vi.fn());
vi.mock('@/api', () => ({ api: apiMock }));

const movieRow = { arr_type: 'radarr', instance_id: 1, title: 'Film.2024.1080p', download_id: 'abc', arr_media_id: 40, year: 2024, poster_url: '/p.jpg' };
const showRow = { arr_type: 'sonarr', instance_id: 2, title: 'Bravo.S01.1080p', series_title: 'Bravo', download_id: 'def', arr_media_id: 9, season_number: 1, episode_number: 2 };
const episodes = [
  { id: 101, seasonNumber: 1, episodeNumber: 1, title: 'Un' },
  { id: 102, seasonNumber: 1, episodeNumber: 2, title: 'Deux' },
  { id: 103, seasonNumber: 1, episodeNumber: 3, title: 'Trois' },
  { id: 201, seasonNumber: 2, episodeNumber: 1, title: 'Retour' },
];
const pack = [
  { path: '/d/Bravo.S01E01.mkv', suggested_season: 1, suggested_episode: 1, size: 1e9, quality: { quality: { name: 'WEB 1080p' } } },
  { path: '/d/Bravo.S01E03.mkv', suggested_season: 1, suggested_episode: 3, size: 1e9 },
];
beforeEach(() => apiMock.mockReset());

const step = (definition, key) => definition.steps.find((entry) => entry.key === key);
const field = (definition, stepKey, key) => step(definition, stepKey).fields.find((entry) => entry.key === key);

describe('manualImportCreation', () => {
  it('retient d’emblée le média que la détection a trouvé', () => {
    const definition = manualImportCreation(movieRow);
    const values = definition.initial();
    expect(values.media).toMatchObject({ title: 'Film.2024.1080p', note: 'Détecté automatiquement', subtitle: 'Film · 2024 · Radarr' });
    expect(values.media.payload.arr_id).toBe(40);
    expect(definition.subtitle).toBe('Film.2024.1080p');
    expect(manualImportCreation({ ...movieRow, arr_media_id: null }).initial().media).toBeNull();
  });

  it('cherche dans Radarr ou Sonarr, et n’autorise pas une fiche absente de *arr', async () => {
    apiMock.mockResolvedValue([{ title: 'Dune', year: 2021, arr_id: 5, poster: '/d.jpg' }, { title: 'Dune 2', year: 2024, arr_id: null }]);
    const definition = manualImportCreation(movieRow);
    const [known, absent] = await field(definition, 'media', 'media').search('dune');
    expect(apiMock).toHaveBeenCalledWith('/api/media/lookup?query=dune&type=movie');
    expect(known).toMatchObject({ disabled: false, subtitle: '2021 · Déjà dans Radarr' });
    expect(absent).toMatchObject({ disabled: true, subtitle: '2024 · Absent de Radarr' });
    expect(absent.reason).toContain('ajoutez-la d\'abord');
  });

  it('lit les fichiers d’une série et cale saison et épisode sur ceux du téléchargement', async () => {
    apiMock.mockResolvedValue({ candidates: pack, episodes });
    const definition = manualImportCreation(showRow);
    const values = definition.initial();
    await step(definition, 'files').onEnter(values);
    expect(apiMock).toHaveBeenCalledWith('/api/downloads/sonarr-manual-import?instance_id=2&series_id=9&download_id=def');
    expect(values).toMatchObject({ season: '1', episode_id: '102', candidate: '0' });
    const seasons = field(definition, 'files', 'season').options(values);
    expect(seasons.map((option) => option.label)).toEqual(['Saison 1', 'Saison 2']);
    expect(field(definition, 'files', 'episode_id').options(values).map((option) => option.label)).toEqual(['E01 · Un', 'E02 · Deux', 'E03 · Trois']);
  });

  it('dans un pack, choisir un fichier réaligne l’épisode ; changer de saison corrige l’épisode', async () => {
    apiMock.mockResolvedValue({ candidates: pack, episodes });
    const definition = manualImportCreation(showRow);
    const values = definition.initial();
    await step(definition, 'files').onEnter(values);
    const candidates = field(definition, 'files', 'candidate');
    expect(candidates.when()).toBe(true);
    expect(candidates.options(values)[1]).toMatchObject({ label: 'Bravo.S01E03.mkv · S01E03' });
    values.candidate = '1';
    candidates.onChange('1', values);
    expect(values).toMatchObject({ season: '1', episode_id: '103' });
    values.season = '2';
    field(definition, 'files', 'season').onChange('2', values);
    expect(values.episode_id).toBe('201');
  });

  it('un seul fichier : rien à choisir, les sélecteurs s’alignent dessus', async () => {
    apiMock.mockResolvedValue({ candidates: [pack[1]], episodes });
    const definition = manualImportCreation(showRow);
    const values = definition.initial();
    await step(definition, 'files').onEnter(values);
    expect(values.episode_id).toBe('103');
    expect(field(definition, 'files', 'candidate').when()).toBe(false);
    expect(field(definition, 'files', 'one').text()).toContain('Bravo.S01E03.mkv');
  });

  it('sans fichier importable : prévient, et associe sans rien déplacer', async () => {
    apiMock.mockResolvedValue({ candidates: [] });
    const definition = manualImportCreation(movieRow);
    const values = definition.initial();
    await step(definition, 'files').onEnter(values);
    expect(field(definition, 'files', 'none').when()).toBe(true);
    expect(definition.submitLabel(values)).toBe('Associer au film');
    apiMock.mockClear();
    const result = await definition.submit(values);
    expect(apiMock).toHaveBeenCalledTimes(1);
    expect(apiMock.mock.calls[0][0]).toBe('/api/downloads/manual-import');
    expect(result.message).toBe('« Film.2024.1080p » associé.');
  });

  it('associe puis importe le fichier retenu', async () => {
    apiMock.mockResolvedValueOnce({ candidates: [{ path: '/d/film.mkv', folderName: 'film', quality: { q: 1 }, size: 1e9 }] });
    const definition = manualImportCreation(movieRow);
    const values = definition.initial();
    await step(definition, 'files').onEnter(values);
    expect(definition.submitLabel(values)).toBe('Associer et importer');
    apiMock.mockResolvedValue({});
    await definition.submit(values);
    const calls = apiMock.mock.calls.slice(1).map(([path, init]) => [path, JSON.parse(init.body)]);
    expect(calls[0][0]).toBe('/api/downloads/manual-import');
    expect(calls[1]).toEqual(['/api/downloads/radarr-manual-import', expect.objectContaining({ instance_id: 1, movie_id: 40, path: '/d/film.mkv', folder_name: 'film', download_id: 'abc' })]);
  });

  it('n’importe l’épisode choisi qu’avec son identifiant', async () => {
    apiMock.mockResolvedValueOnce({ candidates: [pack[0]], episodes });
    const definition = manualImportCreation(showRow);
    const values = definition.initial();
    await step(definition, 'files').onEnter(values);
    apiMock.mockResolvedValue({});
    await definition.submit(values);
    const body = JSON.parse(apiMock.mock.calls.at(-1)[1].body);
    expect(apiMock.mock.calls.at(-1)[0]).toBe('/api/downloads/sonarr-manual-import');
    expect(body).toMatchObject({ series_id: 9, episode_id: 101, path: '/d/Bravo.S01E01.mkv' });
  });
});
