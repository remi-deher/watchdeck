import { describe, expect, it } from 'vitest';
import { resolveLiveItem, resolveTrackItem } from './workPresentation';

const work = {key: 'transfer:1', source: 'transfer', state: 'running', label: 'En cours', stage: 'Finalisation Plex', progress: {percent: 100, scope: 'copy', label: 'Copie uniquement'}, reason: null, stale: false};

describe('Travail entier', () => {
  it('ne déduit jamais la fin du pourcentage de copie', () => {
    const item = resolveTrackItem({key: 'old', title: 'Dune', state: 'blocked', progress: 0, work});
    expect(item.state).toBe('running');
    expect(item.key).toBe(work.key);
    expect(item.step).toBe('Finalisation Plex');
    expect(item.eta).toBe('Copie uniquement');
  });
  it('préserve zéro et masque une mesure inconnue', () => {
    expect(resolveLiveItem({title: 'Dune', work: {...work, progress: {...work.progress, percent: 0}}}).progress).toBe(0);
    expect(resolveLiveItem({title: 'Dune', progress: 80, work: {...work, state: 'unknown', label: 'État inconnu', progress: {...work.progress, percent: null}}})).toMatchObject({progress: null, status: 'État inconnu'});
  });
  it('conserve les images explicites et les objets hérités', () => {
    const legacy = {key: 'x', title: 'Client', poster: '/client.jpg'};
    expect(resolveLiveItem(legacy)).toBe(legacy);
    expect(resolveLiveItem({...legacy, work}).poster).toBe('/client.jpg');
  });
});
