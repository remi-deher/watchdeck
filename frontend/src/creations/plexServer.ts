/* Creer : un serveur Plex supplementaire (le principal se regle dans la carte Plex : ici on
   peut seulement le renommer). La meme definition sert a la modification (`id`) ; jeton et
   cle API vides = conserves. */
import { api } from '@/api';
import type { CreateDefinition } from '@/components/templates/create/types';

const KINDS: Record<string, string> = { movie: 'Films', series: 'Séries', music: 'Musique' };

/** Une bibliotheque par ligne : « Films 4K | movie ». */
export function librariesToText(raw: string): string {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.map((lib: any) => `${lib.name || ''} | ${lib.kind || 'movie'}`).join('\n') : '';
  } catch {
    return '';
  }
}

export function textToLibraries(text: string): string {
  const rows = String(text || '').split('\n').map((line) => {
    const [name, kind] = line.split('|').map((part) => part.trim());
    return { name: name || '', kind: kind || 'movie' };
  }).filter((lib) => lib.name);
  return rows.length ? JSON.stringify(rows) : '';
}

export function plexServerCreation(id: number | string | null, done: (message: string) => void): CreateDefinition {
  const notPrimary = (values: Record<string, any>) => !values.is_primary;
  return {
    noun: 'un serveur Plex',
    another: 'un autre serveur',
    editTitle: 'Modifier le serveur',
    quick: Boolean(id),
    initial: () => ({
      name: '', url: '', token: '', libraries_text: '', enabled: true, is_primary: false, token_configured: false,
      tautulli_url: '', tautulli_api_key: '', tautulli_api_key_configured: false,
    }),
    steps: [
      {
        key: 'connection',
        label: 'Connexion',
        title: 'Où se trouve ce serveur Plex ?',
        fields: [
          { key: 'name', type: 'text', label: 'Nom', help: 'Pour le reconnaître dans Watchdeck.', placeholder: 'Plex 4K', required: true },
          { key: 'primary_note', type: 'note', label: '', when: (values) => Boolean(values.is_primary), text: 'Serveur principal : son adresse, son jeton et ses bibliothèques se règlent dans la carte Plex de Connexions.' },
          { key: 'url', type: 'url', label: 'Adresse', help: 'Adresse locale du serveur (pas app.plex.tv).', placeholder: 'http://192.168.1.50:32401', when: notPrimary, required: true },
          {
            key: 'token', type: 'secret', label: 'Jeton', when: notPrimary,
            help: (id ? 'Enregistré : laisser vide pour le garder. ' : '') + 'Jeton X-Plex-Token d’un compte qui a accès à ce serveur.',
            validate: (value, values) => (!value && !values.token_configured ? 'Collez le jeton.' : null),
          },
        ],
      },
      {
        key: 'libraries',
        label: 'Bibliothèques',
        title: 'Que doit suivre Watchdeck ?',
        when: notPrimary,
        fields: [
          {
            key: 'libraries_text', type: 'textarea', label: 'Bibliothèques suivies', rows: 4, placeholder: 'Films 4K | movie',
            help: 'Une par ligne : nom | movie, series ou music. Vide : Watchdeck suit les bibliothèques de mêmes noms que sur le serveur principal.',
            validate: (value) => {
              const bad = String(value || '').split('\n').find((line) => line.includes('|') && !KINDS[line.split('|')[1].trim()]);
              return bad ? `Type inconnu : « ${bad.split('|')[1].trim()} » (movie, series ou music).` : null;
            },
          },
          { key: 'tautulli_url', type: 'url', label: 'Tautulli de ce serveur (facultatif)', placeholder: 'http://tautulli-4k:8181', help: 'L’import de l’historique Tautulli parcourt aussi celui-ci.' },
          {
            key: 'tautulli_api_key', type: 'secret', label: 'Clé API Tautulli', when: (values) => Boolean(values.tautulli_url),
            help: id ? 'Enregistrée : laisser vide pour la garder.' : undefined,
          },
        ],
      },
    ],
    test: {
      step: 'connection',
      fields: ['url', 'token'],
      run: async (values) => {
        const data = await api<{ success: boolean; message?: string }>('/api/test/plex-server', {
          method: 'POST',
          body: JSON.stringify({ id: id ? Number(id) : null, url: values.is_primary ? null : values.url, token: values.token || null }),
        });
        return { ok: Boolean(data.success), message: data.message || (data.success ? 'Serveur joignable.' : 'Connexion impossible.') };
      },
    },
    submit: async (values) => {
      const { libraries_text, ...rest } = values;
      await api(id ? `/api/plex-servers/${id}` : '/api/plex-servers', {
        method: id ? 'PUT' : 'POST',
        body: JSON.stringify({ ...rest, libraries: textToLibraries(libraries_text) }),
      });
      done(id ? 'Serveur mis à jour.' : 'Serveur ajouté.');
      return {
        message: `Serveur « ${values.name} » ${id ? 'mis à jour' : 'ajouté'}`,
        links: [{ label: 'Voir les connexions', to: '/settings/services' }],
      };
    },
  };
}
