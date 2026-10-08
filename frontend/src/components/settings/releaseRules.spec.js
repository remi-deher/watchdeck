import { describe, expect, it } from 'vitest';
import { joinKeywords, rulesSentence, splitKeywords } from './releaseRules';

describe('releaseRules', () => {
  it('lit une liste de mots en minuscules, sans vides', () => {
    expect(splitKeywords(' MULTI, vff,, French ')).toEqual(['multi', 'vff', 'french']);
    expect(joinKeywords(['multi', 'vff'])).toBe('multi, vff');
  });

  it('résume les règles en une phrase', () => {
    const sentence = rulesSentence({ required: 'multi, vff', forbidden: 'cam', min: 1, max: 60, ratio: 2, hours: 72, deleteFiles: true, scope: 'films et séries' });
    expect(sentence).toBe('Pour les films et séries, une release est retenue si elle contient multi, vff, aucun de cam, pèse entre 1 et 60 Go. Elle est retirée du client à un ratio de 2 ou après 72 h de partage, fichiers compris.');
  });

  it('dit quand rien ne limite la taille ni le seed', () => {
    const sentence = rulesSentence({ required: '', forbidden: '', min: null, max: 8.5, ratio: null, hours: null, deleteFiles: false, scope: 'séries' });
    expect(sentence).toContain('contient n’importe quel mot, pèse au plus 8,5 Go');
    expect(sentence).toContain('reste dans le client');
  });
});
