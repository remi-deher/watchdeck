import { describe, expect, it } from 'vitest';

import { commandScore, fold, rankCommands } from './commandScore';

const entries = [
  { id: 'nav-dashboard', label: 'Accueil', group: 'Pilotage' },
  { id: 'nav-settings', label: 'Paramètres', group: 'Administration' },
  { id: 'section-settings-plex', label: 'Services', group: 'Paramètres' },
  { id: 'setting-notifications', label: 'Canaux de notification', group: 'Paramètres' },
  { id: 'nav-notifications', label: 'Notifications', group: 'Administration' },
  { id: 'scope-radarr-1', label: 'Radarr 4K', group: 'Périmètres d’acquisition' },
];
const ids = (list) => list.map((entry) => entry.id);

describe('fold', () => {
  it('ignore la casse et les accents', () => {
    expect(fold('Périmètres ÉTÉ')).toBe('perimetres ete');
  });
});

describe('commandScore', () => {
  it('vaut la position de la saisie dans « libellé groupe »', () => {
    expect(commandScore({ label: 'Accueil', group: 'Pilotage' }, 'acc')).toBe(0);
    expect(commandScore({ label: 'Accueil', group: 'Pilotage' }, 'pilot')).toBe(8);
  });

  it('vaut -1 sans correspondance, 0 pour une saisie vide', () => {
    expect(commandScore({ label: 'Accueil', group: 'Pilotage' }, 'radarr')).toBe(-1);
    expect(commandScore({ label: 'Accueil', group: 'Pilotage' }, '   ')).toBe(0);
  });
});

describe('rankCommands', () => {
  it('rend toutes les entrées, dans leur ordre, sans saisie', () => {
    expect(ids(rankCommands(entries, ''))).toEqual(ids(entries));
  });

  it('trouve une entrée sans tenir compte des accents ni de la casse', () => {
    expect(ids(rankCommands(entries, 'PARAMETRES'))[0]).toBe('nav-settings');
  });

  it('fait passer une correspondance en début de libellé avant une correspondance plus loin', () => {
    // « notif » ouvre le libellé « Notifications », mais n'apparaît qu'au milieu de
    // « Canaux de notification », pourtant déclaré avant.
    expect(ids(rankCommands(entries, 'notif'))).toEqual(['nav-notifications', 'setting-notifications']);
  });

  it('cherche aussi dans le groupe', () => {
    expect(ids(rankCommands(entries, 'acquisition'))).toEqual(['scope-radarr-1']);
  });

  it('garde l’ordre d’origine à position égale', () => {
    // « param » ouvre « Paramètres » (page) et le groupe de deux réglages : la page,
    // déclarée d'abord, reste devant, et les deux réglages restent dans leur ordre.
    expect(ids(rankCommands(entries, 'param'))).toEqual(['nav-settings', 'section-settings-plex', 'setting-notifications']);
  });

  it('n’invente aucun résultat', () => {
    expect(rankCommands(entries, 'zzz')).toEqual([]);
  });

  it('ne modifie pas la liste reçue', () => {
    const copy = [...entries];
    rankCommands(entries, 'notif');
    expect(entries).toEqual(copy);
  });
});
