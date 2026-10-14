/* Creer : une connexion reutilisable aux fichiers d'un stockage (SSH, ou volumes montes dans
   le moteur). Cinq etapes : type, serveur, authentification, test, stockages. Le test confirme
   d'abord l'identite d'un serveur SSH inconnu (empreinte), puis eprouve l'acces ; il est exige
   avant de continuer. La meme definition modifie une connexion (valeurs actuelles, secrets
   gardes tant que leur champ reste vide). */
import { reactive } from 'vue';
import { api } from '@/api';
import type { CreateDefinition, CreateField, CreateValues } from '@/components/templates/create/types';

export interface ConnectionContext {
  locations: () => any[];
  accesses: () => any[];
  /** La connexion modifiee ; null pour une nouvelle. */
  connection: any | null;
  /** Prevenir la page : relire les connexions, afficher la notification. */
  done: (message: string) => void;
}

const MAX_KEY_BYTES = 32768;
const rootKey = (mapping: { arr_instance_id: number; arr_root: string }) => `${mapping.arr_instance_id}:${mapping.arr_root}`;

export function freshConnectionValues(): CreateValues {
  return {
    method: 'ssh', name: '', host: '', port: 22, user: '', auth: 'key', auth_fallback: false, browse_root: '/storage',
    private_key: '', key_file: null, passphrase: '', password: '', clear_private_key: false, clear_password: false,
    has_private_key: false, has_password: false, trust: false, locations: [],
  };
}

/** Les valeurs d'une connexion existante, ses stockages compris. */
export function connectionValuesFromRow(row: any, accesses: any[], locations: any[]): CreateValues {
  const connection = row.connection || {};
  const values = freshConnectionValues();
  Object.assign(values, {
    method: row.method, name: row.name,
    host: connection.host ?? '', port: connection.port ?? 22, user: connection.user ?? '', auth: connection.auth || 'key',
    auth_fallback: Boolean(connection.auth_fallback), browse_root: connection.browse_root || '/storage',
    has_private_key: Boolean(row.has_private_key), has_password: Boolean(row.has_password),
  });
  for (const access of accesses) {
    if (access.connection_id !== row.id) continue;
    for (const root of access.roots || []) values[`path:${rootKey(root)}`] = root.path;
  }
  values.locations = assignedLocationIds(values, locations);
  return values;
}

/** Les stockages dont tous les dossiers ont deja un chemin pour cette connexion. */
export function assignedLocationIds(values: CreateValues, locations: any[]): string[] {
  return locations.filter((location) => location.mappings?.length && location.mappings.every((m: any) => Object.hasOwn(values, `path:${rootKey(m)}`))).map((location) => String(location.id));
}

export const keyAvailable = (values: CreateValues): boolean => Boolean(values.private_key || (values.has_private_key && !values.clear_private_key));
export const passwordAvailable = (values: CreateValues): boolean => Boolean(values.password || (values.has_password && !values.clear_password));

/** Le corps envoye au serveur (l'ancien format de la fenetre). */
export function connectionBody(values: CreateValues, id: number): Record<string, any> {
  return {
    id, name: values.name, method: values.method,
    connection: { host: values.host, port: Number(values.port), user: values.user, auth: values.auth, auth_fallback: Boolean(values.auth_fallback), browse_root: values.browse_root },
    private_key: values.private_key, password: values.password, passphrase: values.passphrase,
    clear_private_key: Boolean(values.clear_private_key), clear_password: Boolean(values.clear_password),
    has_private_key: Boolean(values.has_private_key), has_password: Boolean(values.has_password),
  };
}

export function connectionCreation(ctx: ConnectionContext): CreateDefinition {
  const editing = Boolean(ctx.connection);
  /* Ce que le test a appris : l'id de la connexion enregistree, l'empreinte a confirmer. */
  const state = reactive<{ id: number; observed: { fingerprint: string; changed?: boolean } | null; trusted: boolean }>({
    id: ctx.connection?.id || 0, observed: null, trusted: Boolean(ctx.connection?.trusted),
  });

  const ssh = (values: CreateValues) => values.method === 'ssh';
  const locationRoots = (location: any): any[] => location.mappings || [];
  const accessesFor = (values: CreateValues, mapping: any): any[] => ctx.accesses().filter((access: any) => access.method === values.method && access.roots?.some((r: any) => rootKey(r) === rootKey(mapping)));
  const connectionNames = (values: CreateValues, location: any): string => [...new Set(locationRoots(location).flatMap((m: any) => accessesFor(values, m).map((a: any) => a.name)))].join(' · ') || 'Aucune connexion de cette méthode';
  const replacement = (values: CreateValues, location: any): boolean => locationRoots(location).some((m: any) => accessesFor(values, m).some((a: any) => a.connection_id !== state.id));

  async function persist(values: CreateValues): Promise<any> {
    const next: any = await api(`/api/storage/connections${state.id ? `/${state.id}` : ''}`, { method: state.id ? 'PUT' : 'POST', body: JSON.stringify(connectionBody(values, state.id)) });
    state.id = next.id;
    state.trusted = Boolean(next.trusted);
    /* Secrets enregistres : ils ne sont plus a renvoyer, seulement a garder. */
    if (next.has_private_key !== undefined) values.has_private_key = Boolean(next.has_private_key);
    if (next.has_password !== undefined) values.has_password = Boolean(next.has_password);
    values.private_key = ''; values.password = ''; values.passphrase = '';
    values.clear_private_key = false; values.clear_password = false;
    return next;
  }

  const locationFields = (values: CreateValues): CreateField[] => {
    const fields: CreateField[] = [{
      key: 'locations', type: 'checklist', label: 'Stockages utilisant cette connexion', summary: 'hide',
      help: 'Cochez les stockages dont les fichiers se lisent par cette connexion.',
      options: (vals) => ctx.locations().map((location: any) => ({
        value: String(location.id), label: location.name,
        description: `${connectionNames(vals, location)}${replacement(vals, location) ? ' · la connexion actuelle de même méthode sera remplacée' : ''}`,
        disabled: !locationRoots(location).length,
      })),
      onChange: (value: string[], vals) => {
        const chosen = new Set<string>(value || []);
        for (const location of ctx.locations()) {
          for (const mapping of locationRoots(location)) {
            const key = `path:${rootKey(mapping)}`;
            if (chosen.has(String(location.id))) {
              if (vals[key] === undefined) vals[key] = accessesFor(vals, mapping)[0]?.roots.find((r: any) => rootKey(r) === rootKey(mapping))?.path || '';
            } else delete vals[key];
          }
        }
      },
    }];
    for (const location of ctx.locations()) {
      if (!(values.locations || []).includes(String(location.id))) continue;
      for (const mapping of locationRoots(location)) {
        fields.push({ key: `path:${rootKey(mapping)}`, type: 'text', label: `${location.name} · chemin vu par cette connexion pour ${mapping.arr_root}`, placeholder: 'Chemin vu par cette connexion', required: true });
      }
    }
    return fields;
  };

  return {
    noun: 'une connexion',
    another: 'une autre connexion',
    editTitle: 'Configurer la connexion',
    submitLabel: 'Enregistrer la connexion',
    initial: freshConnectionValues,
    test: {
      step: 'test',
      fields: ['method', 'host', 'port', 'user', 'auth', 'browse_root', 'private_key', 'password', 'passphrase'],
      run: async (values) => {
        const saved = await persist(values);
        if (saved.method === 'ssh' && !saved.trusted) {
          if (state.observed && values.trust) {
            await api(`/api/storage/connections/${state.id}/trust`, { method: 'POST', body: JSON.stringify({ fingerprint: state.observed.fingerprint }) });
            state.observed = null;
            state.trusted = true;
          } else {
            state.observed = await api(`/api/storage/connections/${state.id}/discover`, { method: 'POST' });
            values.trust = false;
            return { ok: false, message: `Empreinte du serveur : ${state.observed!.fingerprint}.${state.observed!.changed ? ' L’identité du serveur a changé : vérifiez cette modification.' : ''} Cochez « Je fais confiance à ce serveur », puis testez à nouveau.` };
          }
        }
        const result: any = await api(`/api/storage/connections/${state.id}/test`, { method: 'POST' });
        return { ok: true, message: result.method === 'local' ? 'Connexion locale configurée.' : `Connexion réussie avec ${result.auth_method === 'password' ? 'le mot de passe' : 'la clé SSH'}.` };
      },
    },
    steps: [
      {
        key: 'type', label: 'Type', title: 'Quel type de connexion ?',
        fields: [
          {
            key: 'method', type: 'cards', label: 'Méthode',
            options: [
              { value: 'ssh', label: 'SSH', description: 'Un serveur distant : Python 3 et rsync doivent y être installés.' },
              { value: 'local', label: 'Fichiers montés dans le moteur', description: 'Des volumes déclarés dans Docker Compose.' },
            ],
          },
          { key: 'name', type: 'text', label: 'Nom', required: true, placeholder: 'TrueNAS' },
        ],
      },
      {
        key: 'server', label: 'Serveur', title: (values) => (ssh(values) ? 'Où se trouve le serveur ?' : 'Où sont montés les volumes ?'),
        fields: [
          { key: 'host', type: 'text', label: 'Serveur', required: true, when: ssh, placeholder: '192.168.1.50' },
          { key: 'port', type: 'number', label: 'Port', required: true, when: ssh, validate: (value) => (Number(value) >= 1 && Number(value) <= 65535 ? null : 'Port entre 1 et 65535.') },
          { key: 'user', type: 'text', label: 'Utilisateur', required: true, when: ssh, help: 'Il doit pouvoir lire, écrire et supprimer dans les dossiers choisis.' },
          { key: 'browse_root', type: 'text', label: 'Dossier de départ de l’explorateur', required: true, when: (values) => !ssh(values), help: 'Ce réglage choisit leur chemin dans le moteur ; il ne crée pas de montage.' },
        ],
      },
      {
        key: 'auth', label: 'Authentification', title: 'Comment le moteur s’authentifie-t-il ?', description: 'Renseignez une ou deux méthodes, puis choisissez leur ordre.',
        when: ssh,
        fields: [
          {
            key: 'key_file', type: 'file', label: 'Importer une clé privée', accept: '.pem,.key,text/plain', summary: 'hide',
            onChange: async (value, values) => {
              if (!(value instanceof File)) return;
              if (value.size > MAX_KEY_BYTES) { values.private_key = ''; return; }
              values.private_key = await value.text();
            },
            validate: (value) => (value instanceof File && value.size > MAX_KEY_BYTES ? 'Clé trop volumineuse.' : null),
          },
          { key: 'private_key', type: 'textarea', label: `Clé privée${keyAvailableLabel()}`, rows: 4, placeholder: 'Coller une clé privée SSH, ou laisser vide pour garder celle qui est enregistrée', summary: 'hide',
            validate: (_value, values) => (keyAvailable(values) || passwordAvailable(values) ? null : 'Renseignez au moins une clé ou un mot de passe.') },
          { key: 'passphrase', type: 'secret', label: 'Phrase secrète (facultative)', summary: 'hide' },
          { key: 'clear_private_key', type: 'toggle', label: 'Supprimer la clé enregistrée', when: (values) => Boolean(values.has_private_key), summary: 'hide' },
          { key: 'password', type: 'secret', label: 'Mot de passe', help: editing ? 'Enregistré : laisser vide pour le garder.' : undefined, summary: 'hide' },
          { key: 'clear_password', type: 'toggle', label: 'Supprimer le mot de passe enregistré', when: (values) => Boolean(values.has_password), summary: 'hide' },
          {
            key: 'auth', type: 'select', label: 'Méthode prioritaire', when: (values) => keyAvailable(values) && passwordAvailable(values),
            options: [{ value: 'key', label: 'Clé SSH' }, { value: 'password', label: 'Mot de passe' }],
          },
          { key: 'auth_fallback', type: 'toggle', label: 'Essayer l’autre méthode si l’authentification échoue', when: (values) => keyAvailable(values) && passwordAvailable(values) },
          {
            key: 'auth_note', type: 'note', label: 'Méthode', summary: 'hide', when: (values) => keyAvailable(values) !== passwordAvailable(values),
            text: (values) => `${keyAvailable(values) ? 'Clé SSH' : 'Mot de passe'} utilisé automatiquement.`,
          },
        ],
      },
      {
        key: 'test', label: 'Test', title: 'La connexion fonctionne-t-elle ?',
        description: 'Vérifie l’accès et l’authentification. Les dossiers seront contrôlés à l’aperçu d’un transfert.',
        fields: [
          {
            key: 'fingerprint', type: 'note', label: 'Empreinte', tone: 'warning', summary: 'hide', when: () => Boolean(state.observed),
            text: () => `Empreinte détectée : ${state.observed?.fingerprint}${state.observed?.changed ? '\nL’identité du serveur a changé : vérifiez cette modification avant de continuer.' : ''}`,
          },
          { key: 'trust', type: 'toggle', label: 'Je fais confiance à ce serveur', when: () => Boolean(state.observed), summary: 'hide' },
        ],
      },
      { key: 'locations', label: 'Stockages', title: 'Quels stockages utilisent cette connexion ?', fields: locationFields },
    ],
    submit: async (values) => {
      const saved = await persist(values);
      const roots = Object.entries(values)
        .filter(([key]) => key.startsWith('path:'))
        .map(([key, path]) => {
          const raw = key.slice('path:'.length);
          const split = raw.indexOf(':');
          return { arr_instance_id: Number(raw.slice(0, split)), arr_root: raw.slice(split + 1), path: String(path) };
        });
      await api(`/api/storage/connections/${saved.id}/assignments`, { method: 'PUT', body: JSON.stringify({ roots }) });
      const message = `Connexion « ${values.name} » ${editing ? 'mise à jour' : 'enregistrée'}.`;
      ctx.done(message);
      return { message, links: [{ label: 'Voir les stockages', to: { query: { vue: 'settings' } } }] };
    },
  };

  /* Le libelle de la cle : dit si elle est deja enregistree (sans la reafficher). */
  function keyAvailableLabel(): string {
    return ctx.connection?.has_private_key ? ' (enregistrée, conservée si ce champ reste vide)' : '';
  }
}
