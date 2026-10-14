/* Creer : un stockage (un disque ou un emplacement) et les dossiers Arr / Plex qui y vivent.
   Trois etapes : le stockage et sa reserve, les dossiers (a quel dossier Plex repond chaque
   dossier Arr), l'acces aux fichiers de chaque dossier (SSH ou volume monte). La meme
   definition modifie un stockage. Les acces se decrivent par `accessFields`, partages avec
   la modification d'un seul dossier (page Correspondances). */
import type { CreateDefinition, CreateField, CreateValues } from '@/components/templates/create/types';
import { api } from '@/api';

export interface LocationContext {
  /** Le stockage modifie ; null pour un nouveau. */
  location: any | null;
  /** Les dossiers decouverts, par instance Arr (avec les dossiers Plex possibles). */
  roots: () => any[];
  /** Relit les dossiers decouverts avant l'etape qui les montre. */
  loadRoots: () => Promise<void>;
  connections: () => any[];
  accesses: () => any[];
  /** Choisir un dossier sur la connexion (fenetre de l'explorateur) ; rien si abandonne. */
  browse: (connection: any, current: string) => Promise<string | null | undefined>;
  done: (message: string) => void;
}

export const rootKeyOf = (instanceId: number, root: string) => `${instanceId}:${root}`;
const plexChoiceOf = (mapping: { plex_section_id: string | number; plex_root: string }) => (mapping.plex_root ? JSON.stringify([String(mapping.plex_section_id), mapping.plex_root]) : '');

/** Les acces deja configures d'un dossier : une connexion par methode, avec son chemin. */
export function accessValues(accesses: any[], connections: any[], instanceId: number, root: string): CreateValues {
  const key = rootKeyOf(instanceId, root);
  const values: CreateValues = {};
  for (const access of accesses) {
    const found = access.roots?.find((r: any) => r.arr_instance_id === instanceId && r.arr_root === root);
    if (!found || !access.connection_id) continue;
    const method = connections.find((c: any) => c.id === access.connection_id)?.method;
    if (method !== 'ssh' && method !== 'local') continue;
    values[`${method}:${key}`] = String(access.connection_id);
    values[`${method}path:${key}`] = found.path;
  }
  return values;
}

/** Les acces choisis pour un dossier, au format attendu par le serveur. */
export function bindingsOf(values: CreateValues, key: string): Array<{ connection_id: number; path: string }> {
  return (['ssh', 'local'] as const)
    .filter((method) => values[`${method}:${key}`])
    .map((method) => ({ connection_id: Number(values[`${method}:${key}`]), path: String(values[`${method}path:${key}`] || '') }));
}

/** Les champs d'acces d'un dossier : par methode, la connexion puis le chemin qu'elle voit. */
export function accessFields(ctx: Pick<LocationContext, 'connections' | 'browse'>, key: string, label: string): CreateField[] {
  const fields: CreateField[] = [];
  for (const [method, title] of [['ssh', 'SSH'], ['local', 'Montage local']] as const) {
    const choices = (): any[] => ctx.connections().filter((connection: any) => connection.method === method);
    fields.push({
      key: `${method}:${key}`, type: 'select', label: `${title} · ${label}`, summary: 'hide',
      options: () => [{ value: '', label: 'Non configuré' }, ...choices().map((connection: any) => ({ value: String(connection.id), label: connection.name }))],
      when: () => choices().length > 0,
    }, {
      key: `${method}path:${key}`, type: 'text', label: `Chemin vu par la connexion ${title} · ${label}`, placeholder: 'Chemin accessible', required: true,
      when: (values) => Boolean(values[`${method}:${key}`]),
      browse: (current, values) => ctx.browse(ctx.connections().find((connection: any) => String(connection.id) === String(values[`${method}:${key}`])), current),
    });
  }
  return fields;
}

const reserveEquivalent = (values: CreateValues, totalBytes: number | null | undefined): string => {
  if (!totalBytes) return 'Équivalent indisponible : capacité inconnue.';
  const amount = Number(values.reserve_value);
  if (!amount) return '';
  const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
  return values.reserve_unit === 'percent' ? `${fmt(amount)} % ≈ ${fmt(totalBytes * amount / 100 / 1e9)} Go` : `${fmt(amount)} Go ≈ ${fmt(amount * 1e9 / totalBytes * 100)} %`;
};

export function freshLocationValues(): CreateValues {
  return { name: '', enabled: true, reserve_on: false, reserve_unit: 'go', reserve_value: null };
}

/** Les valeurs d'un stockage existant. */
export function locationValuesFromRow(location: any, accesses: any[], connections: any[]): CreateValues {
  const values = freshLocationValues();
  const percent = location.reserve_percent != null;
  Object.assign(values, {
    name: location.name, enabled: location.enabled !== false,
    reserve_on: percent || location.reserve_bytes > 0, reserve_unit: percent ? 'percent' : 'go',
    reserve_value: percent ? location.reserve_percent : location.reserve_bytes > 0 ? location.reserve_bytes / 1e9 : null,
  });
  for (const mapping of location.mappings || []) {
    values[`plex:${rootKeyOf(mapping.arr_instance_id, mapping.arr_root)}`] = plexChoiceOf(mapping);
    Object.assign(values, accessValues(accesses, connections, mapping.arr_instance_id, mapping.arr_root));
  }
  return values;
}

export function locationCreation(ctx: LocationContext): CreateDefinition {
  const editing = Boolean(ctx.location);
  const initialBindings: Record<string, string> = {};
  for (const mapping of ctx.location?.mappings || []) {
    const key = rootKeyOf(mapping.arr_instance_id, mapping.arr_root);
    initialBindings[key] = JSON.stringify(bindingsOf(accessValues(ctx.accesses(), ctx.connections(), mapping.arr_instance_id, mapping.arr_root), key));
  }

  const chosenRoots = (values: CreateValues): Array<{ instance: any; root: string; key: string }> => ctx.roots().flatMap((instance: any) => (instance.arr_roots || [])
    .filter((root: string) => values[`plex:${rootKeyOf(instance.arr_instance_id, root)}`])
    .map((root: string) => ({ instance, root, key: rootKeyOf(instance.arr_instance_id, root) })));

  const folderFields = (): CreateField[] => {
    const fields: CreateField[] = [];
    for (const instance of ctx.roots()) {
      if (instance.error) {
        fields.push({ key: `error:${instance.arr_instance_id}`, type: 'note', label: instance.name, tone: 'warning', summary: 'hide', text: `${instance.name} : ${instance.error}` });
        continue;
      }
      for (const root of instance.arr_roots || []) {
        const key = rootKeyOf(instance.arr_instance_id, root);
        fields.push({
          key: `plex:${key}`, type: 'select', label: `${instance.name} · ${root}`, help: 'Le dossier Plex qui montre ce dossier ; « Non associé » le laisse hors de ce stockage.',
          options: () => [{ value: '', label: 'Non associé' }, ...(instance.plex_roots || []).map((plex: any) => ({ value: JSON.stringify([String(plex.section_id), plex.path]), label: `${plex.library} · ${plex.path}` }))],
        });
      }
    }
    if (!fields.some((field) => field.type === 'select')) fields.push({ key: 'no_roots', type: 'note', label: 'Dossiers', tone: 'warning', summary: 'hide', text: 'Aucun dossier Arr n’a été trouvé. Vérifiez les instances Sonarr / Radarr dans les réglages.' });
    const first = fields.find((field) => field.type === 'select');
    if (first) first.validate = (_value, values) => (chosenRoots(values).length ? null : 'Associez au moins un dossier à ce stockage.');
    return fields;
  };

  const accessStepFields = (values: CreateValues): CreateField[] => chosenRoots(values).flatMap(({ instance, root, key }) => accessFields(ctx, key, `${instance.name} ${root}`));

  return {
    noun: 'un stockage',
    another: 'un autre stockage',
    editTitle: 'Configurer le stockage',
    submitLabel: (values) => (editing ? 'Enregistrer' : `Ajouter ${values.name ? `« ${values.name} »` : 'le stockage'}`),
    initial: freshLocationValues,
    steps: [
      {
        key: 'storage', label: 'Stockage', title: 'Comment s’appelle ce stockage ?',
        fields: [
          { key: 'name', type: 'text', label: 'Nom', required: true, placeholder: 'DATA 2' },
          { key: 'enabled', type: 'toggle', label: 'Actif' },
          { key: 'reserve_on', type: 'toggle', label: 'Réserve d’espace libre', summary: 'hide' },
          {
            key: 'reserve_unit', type: 'select', label: 'Unité de la réserve', when: (values) => Boolean(values.reserve_on), summary: 'hide',
            options: [{ value: 'go', label: 'Go' }, { value: 'percent', label: '%' }],
          },
          {
            key: 'reserve_value', type: 'number', label: 'Valeur de la réserve', required: true, when: (values) => Boolean(values.reserve_on),
            help: ctx.location?.total_bytes ? undefined : 'La capacité n’est pas encore connue : l’équivalent s’affichera après un contrôle.',
            validate: (value, values) => {
              const amount = Number(value);
              if (!(amount >= 0)) return 'Indiquez une valeur positive.';
              return values.reserve_unit === 'percent' && amount > 100 ? 'Un pourcentage ne dépasse pas 100.' : null;
            },
          },
          { key: 'reserve_note', type: 'note', label: 'Équivalent', summary: 'hide', when: (values) => Boolean(values.reserve_on), text: (values) => reserveEquivalent(values, ctx.location?.total_bytes) },
        ],
      },
      {
        key: 'folders', label: 'Dossiers', title: (values) => `Quels dossiers vivent sur ${values.name || 'ce stockage'} ?`,
        description: 'Associez chaque dossier Sonarr / Radarr au dossier Plex qui le montre. Rien n’est lancé : les chemins sont contrôlés à l’aperçu d’un transfert.',
        onEnter: () => ctx.loadRoots(),
        loading: 'Lecture des dossiers Arr et Plex…',
        fields: folderFields,
      },
      {
        key: 'access', label: 'Accès', title: 'Comment lire les fichiers de ces dossiers ?',
        description: 'Facultatif : l’accès SSH ou le volume monté qui voit chaque dossier. Il pourra être complété plus tard.',
        fields: accessStepFields,
      },
    ],
    submit: async (values) => {
      const chosen = chosenRoots(values);
      const mappings = chosen.map(({ instance, root, key }) => {
        const [section, path] = JSON.parse(values[`plex:${key}`]);
        return { arr_instance_id: instance.arr_instance_id, arr_root: root, plex_root: path, plex_section_id: section, subdirectory: '' };
      });
      const percent = values.reserve_on && values.reserve_unit === 'percent';
      await api(`/api/storage/locations${ctx.location ? `/${ctx.location.id}` : ''}`, {
        method: ctx.location ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: values.name, mount_path: ctx.location?.mount_path || '', enabled: values.enabled,
          reserve_percent: percent ? Number(values.reserve_value) : null,
          reserve_gb: values.reserve_on && !percent ? Number(values.reserve_value) || 0 : 0,
          mappings,
        }),
      });
      for (const { instance, root, key } of chosen) {
        const bindings = bindingsOf(values, key);
        if (JSON.stringify(bindings) === initialBindings[key] || (!bindings.length && initialBindings[key] === undefined)) continue;
        await api('/api/storage/bindings/multiple', { method: 'POST', body: JSON.stringify({ arr_instance_id: instance.arr_instance_id, arr_root: root, bindings }) });
      }
      const message = `Stockage « ${values.name} » ${editing ? 'enregistré' : 'ajouté'}. Aucun transfert lancé.`;
      ctx.done(message);
      return { message, links: [{ label: 'Voir les stockages', to: { query: { vue: 'settings' } } }] };
    },
  };
}

/** Modifier l'acces d'un seul dossier (page Correspondances) : meme champs que l'etape Acces d'un stockage. */
export function rootAccessCreation(ctx: Pick<LocationContext, 'connections' | 'accesses' | 'browse' | 'done'>, row: { arr_instance_id: number; arr_root: string; instance: string }): CreateDefinition {
  const key = rootKeyOf(row.arr_instance_id, row.arr_root);
  return {
    noun: 'un accès',
    another: 'un autre accès',
    editTitle: `Accès aux fichiers · ${row.instance}`,
    subtitle: row.arr_root,
    quick: true,
    initial: () => ({}),
    steps: [{
      key: 'access', label: 'Accès', title: 'Comment lire les fichiers de ce dossier ?',
      description: 'Choisissez, par méthode, la connexion qui voit ce dossier et le chemin qu’elle y utilise.',
      fields: () => accessFields(ctx, key, 'ce dossier'),
    }],
    submit: async (values) => {
      await api('/api/storage/bindings/multiple', { method: 'POST', body: JSON.stringify({ arr_instance_id: row.arr_instance_id, arr_root: row.arr_root, bindings: bindingsOf(values, key) }) });
      ctx.done('Accès enregistré.');
      return { message: 'Accès enregistré.' };
    },
  };
}

export const rootAccessValues = (accesses: any[], connections: any[], row: { arr_instance_id: number; arr_root: string }): CreateValues => accessValues(accesses, connections, row.arr_instance_id, row.arr_root);
