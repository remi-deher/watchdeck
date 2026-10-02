/** Ce qui protège une saisie en cours quand l'application déplace le focus. */
import { beforeEach, describe, expect, it } from 'vitest';
import { isTypingTarget } from './focus';

describe('isTypingTarget', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="main-content" tabindex="-1"></main>
      <input id="champ" type="search">
      <textarea id="zone"></textarea>
      <select id="liste"><option>a</option></select>
      <div id="note" contenteditable="true"></div>
      <a id="lien" href="#">Un lien</a>
      <button id="bouton">Envoyer</button>
    `;
  });

  const el = (id) => document.getElementById(id);

  it('reconnaît toutes les formes de saisie', () => {
    // Le défaut est apparu sur un champ de recherche, mais une note interne ou un
    // message d'annulation se saisissent ailleurs : la règle ne peut pas se limiter
    // aux `input`.
    for (const id of ['champ', 'zone', 'liste', 'note']) {
      expect(isTypingTarget(el(id)), id).toBe(true);
    }
  });

  it('laisse le focus partir depuis un élément qui n’est pas une saisie', () => {
    // C'est le cas d'une vraie navigation : le focus doit rejoindre le contenu pour
    // que les lecteurs d'écran annoncent la page atteinte.
    for (const id of ['lien', 'bouton', 'main-content']) {
      expect(isTypingTarget(el(id)), id).toBe(false);
    }
  });

  it('supporte l’absence d’élément actif', () => {
    // `document.activeElement` peut être nul entre deux rendus.
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget(undefined)).toBe(false);
  });
});
