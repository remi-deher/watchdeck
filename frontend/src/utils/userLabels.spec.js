import { describe, expect, it } from 'vitest';

import {
  accountHandle,
  accountInitials,
  accountName,
  resolveSource,
  roleLabel,
  seerActionLabel,
  seerLinkLabel,
  sourceLabel,
} from './userLabels';

/* Comptes réels observés en production, anonymisés : ce sont eux qui montraient les
   défauts que ce module corrige. */
const romainSeer = {
  custom_name: 'Romain',
  display_name: 'GachaBlock',
  plex_user_id: 'seer:6',
  notification_email: 'romain@example.net',
  source: 'seer',
  seer_user_id: 6,
  seer_active: false,
  enabled: true,
};
const frederiquePlex = {
  custom_name: 'Frederique',
  display_name: 'frdriquecottin',
  plex_user_id: '86dd231816e161be',
  source: null,
  seer_user_id: 2,
  seer_active: true,
};
const compteRss = { custom_name: null, display_name: null, plex_user_id: '49991685c2056613', source: 'rss' };

describe('origine du compte', () => {
  it('traduit les valeurs internes', () => {
    expect(sourceLabel('plex')).toBe('Compte Plex');
    expect(sourceLabel('rss')).toBe('Flux RSS');
    expect(sourceLabel('local')).toBe('Compte local');
  });

  it("n'invente pas une origine absente", () => {
    /* La table rendait `user.source || 'plex'` : six comptes dont la base ne dit rien
       étaient présentés comme des comptes Plex. */
    expect(sourceLabel(null)).toBe('Origine inconnue');
    expect(sourceLabel(undefined)).toBe('Origine inconnue');
  });

  it('laisse passer une valeur inconnue plutôt que de la masquer', () => {
    expect(sourceLabel('trakt')).toBe('trakt');
  });

  it('déduit Plex d’une preuve, pas d’un défaut aveugle', () => {
    /* Les comptes historiques n'ont pas la colonne `source`, mais portent un
       identifiant Plex sans ambiguïté (32 caractères hexadécimaux). */
    expect(resolveSource(frederiquePlex)).toBe('plex');
    expect(resolveSource({ plex_account_uuid: 'abc-def' })).toBe('plex');
  });

  it('respecte une origine explicite plutôt que de la déduire', () => {
    expect(resolveSource(romainSeer)).toBe('seer');
    expect(resolveSource(compteRss)).toBe('rss');
  });

  it('ne déduit rien quand il n’y a aucune preuve', () => {
    expect(resolveSource({ plex_user_id: 'test_admin' })).toBeNull();
    expect(sourceLabel(resolveSource({}))).toBe('Origine inconnue');
  });
});

describe('rôle', () => {
  it('traduit au lieu de rendre l’énumération brute', () => {
    expect(roleLabel('admin')).toBe('Administrateur');
    expect(roleLabel('moderator')).toBe('Modérateur');
    expect(roleLabel('user')).toBe('Utilisateur');
    expect(roleLabel(null)).toBe('Utilisateur');
  });
});

describe('identité affichée', () => {
  it('préfère le nom choisi par l’administrateur', () => {
    expect(accountName(romainSeer)).toBe('Romain');
  });

  it('montre le pseudo d’origine en second, pas le hachage', () => {
    /* La table affichait `86dd231816e161be` sous « Frederique », et jamais
       « frdriquecottin » — le seul identifiant sous lequel la personne se reconnaît. */
    expect(accountHandle(frederiquePlex)).toBe('frdriquecottin');
    expect(accountHandle(romainSeer)).toBe('GachaBlock');
  });

  it('ne répète pas le nom quand le pseudo est identique', () => {
    expect(accountHandle({ custom_name: 'Rémi', display_name: 'Rémi' })).toBe('');
  });

  it('retombe sur l’e-mail avant l’identifiant technique', () => {
    const sansNom = { display_name: null, custom_name: null, notification_email: 'a@b.c', plex_user_id: 'xyz' };
    expect(accountName(sansNom)).toBe('a@b.c');
  });

  it('ne répète pas l’e-mail déjà affiché par la colonne Notifications', () => {
    /* Nom et pseudo identiques : la ligne affichait l'adresse en second niveau, puis
       une nouvelle fois dans la colonne voisine. */
    expect(accountHandle({ custom_name: 'Rémi', display_name: 'Rémi', notification_email: 'r@x.fr' })).toBe('');
  });

  it('n’affiche le hachage qu’en dernier recours', () => {
    expect(accountName(compteRss)).toBe('49991685c2056613');
    expect(accountHandle(compteRss)).toBe('');
  });

  it('produit des initiales lisibles', () => {
    expect(accountInitials(romainSeer)).toBe('RO');
    expect(accountInitials({ custom_name: 'Jean Dupont' })).toBe('JD');
    // Aucun nom : les initiales viennent du repli « Compte sans nom ».
    expect(accountInitials({})).toBe('CS');
  });
});

describe('vocabulaire Seer', () => {
  it('ne propose aucune synchronisation quand Seer est désactivé', () => {
    expect(seerActionLabel(false, 'actor')).toBe('Seer désactivé');
  });

  it('parle de lecture en mode observateur, de synchronisation en mode acteur', () => {
    /* Les Réglages disent « Observateur — Seer n'est qu'une source d'information » :
       « Synchroniser » y contredisait le reste de l'application. */
    expect(seerActionLabel(true, 'observer')).toBe('Relire les comptes Seer');
    expect(seerActionLabel(true, 'actor')).toBe('Synchroniser Seer');
  });

  it('distingue la liaison Seer de l’activation du compte', () => {
    /* Romain est `enabled: true` mais `seer_active: false` : la ligne affichait
       « Actif » pour les deux notions. */
    expect(seerLinkLabel(romainSeer)).toBe('Lié, inactif côté Seer');
    expect(seerLinkLabel(frederiquePlex)).toBe('Lié et actif');
    expect(seerLinkLabel(compteRss)).toBe('Non lié');
  });
});
