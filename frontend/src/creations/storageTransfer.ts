/* Creer : un transfert (liberer de l'espace, atteindre un espace libre, deplacer des titres).
   Quatre etapes : objectif, trajet, methode, apercu. L'apercu est calcule en arrivant sur
   la derniere etape ; on y choisit les titres, puis on lance ou on enregistre la tache.
   La meme definition sert a reprendre une tache (valeurs de la tache, ouverte a l'apercu)
   et a la modifier sans calculer d'apercu. */
import { reactive } from 'vue';
import type { CreateDefinition, CreateField, CreateOption, CreateValues } from '@/components/templates/create/types';
import { rootChoices, selectedRootAccess, sshCovered } from '@/components/storage/transferAccess';

export interface TransferContext {
  /** Instances Arr avec leurs dossiers et capacites connues (lecture a chaque affichage). */
  roots: () => any[];
  accesses: () => any[];
  locations: () => any[];
  protectedTitles: () => any[];
  /** Tache modifiee ou reprise ; 0 pour un nouveau transfert. */
  taskId: number;
  /** Calcule l'apercu ; `progress` rend compte de l'attente. */
  calculate: (values: CreateValues, progress: (text: string) => void) => Promise<any>;
  /** Cree (ou met a jour) la tache pour chaque lot de l'apercu. */
  launch: (plan: any, selection: string[], start: boolean) => Promise<void>;
  /** Enregistre les reglages dans la tache existante, sans apercu. */
  saveSettings: (values: CreateValues) => Promise<void>;
  protect: (item: any) => Promise<void>;
  unprotect: (key: string) => Promise<void>;
}

const OBJECTIVES = [
  { value: 'release_space', label: 'Libérer une quantité d’espace', description: 'Récupérer une quantité de Go sur l’ensemble des sources.' },
  { value: 'minimum_free', label: 'Atteindre un espace libre minimum', description: 'Obtenir le seuil souhaité sur chaque source.' },
  { value: 'selection', label: 'Choisir moi-même les titres', description: 'Partir d’une sélection, sans objectif chiffré.' },
];
const METHODS = [
  { value: 'rsync_ssh', label: 'Rsync par SSH', description: 'Copie et vérification sur le serveur SSH ; les originaux sont supprimés après vérification. Entre deux serveurs, les données transitent par le moteur.' },
  { value: 'arr', label: 'API Sonarr / Radarr', description: 'Arr déplace les fichiers, sans débit ni progression de fichier. Une pause suspend les prochains titres ; la commande déjà lancée peut continuer.' },
  { value: 'rsync_local', label: 'Rsync local', description: 'Copie et vérification dans le moteur, avec les volumes montés dans Docker.' },
];
const METHOD_LABELS: Record<string, string> = { arr: 'API Sonarr / Radarr', rsync_ssh: 'Rsync par SSH', rsync_local: 'Rsync local' };

export const gbLabel = (bytes: number | null | undefined): string => bytes == null ? '—' : `${(Number(bytes) / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;

export const freshTransferValues = (): CreateValues => ({
  mode: 'release_space', name: '', goal_gb: 20, per_source_goal: false, distribution: 'auto', target_titles: null,
  preference: 'closest', auto_resume: true, media_type: 'all', max_titles: 250, verification: 'standard',
  transfer_methods: ['arr'], access_ids: {}, root_access_ids: {}, access_local: '', instances: [],
  selection: [], approved: false, extra: {},
});

/** Les valeurs d'une tache existante : reprise, copie ou modification. */
export function transferValuesFromJob(job: any): CreateValues {
  const params = job.params || {};
  const values = freshTransferValues();
  const routes = [{
    arr_instance_id: params.arr_instance_id,
    source_roots: params.source_roots?.length ? [...params.source_roots] : [params.source_root],
    destination_root: params.destination_root,
    root_goals: { ...params.root_goals },
  }];
  const accessIds = { ...params.access_ids, ...(params.access_id ? { [params.transfer_mode]: params.access_id } : {}) };
  Object.assign(values, {
    extra: { ...params },
    mode: params.objective_mode || params.mode || values.mode,
    name: params.name || '',
    goal_gb: params.goal_gb ?? values.goal_gb,
    per_source_goal: Object.keys(params.root_goals || {}).length > 0,
    distribution: params.target_titles ? 'count' : 'auto',
    target_titles: params.target_titles ?? null,
    preference: params.preference || values.preference,
    auto_resume: params.auto_resume ?? values.auto_resume,
    media_type: params.media_type || 'all',
    max_titles: params.max_titles ?? values.max_titles,
    verification: params.verification || values.verification,
    transfer_methods: params.preferred_methods?.length ? [...params.preferred_methods] : [params.transfer_mode || 'arr'],
    access_ids: accessIds,
    root_access_ids: { ...params.root_access_ids },
    access_local: accessIds.rsync_local ? String(accessIds.rsync_local) : '',
    instances: routes.map((route) => String(route.arr_instance_id)),
  });
  for (const route of routes) {
    const id = route.arr_instance_id;
    values[`src:${id}`] = route.source_roots;
    values[`dst:${id}`] = route.destination_root || '';
    for (const [root, goal] of Object.entries(route.root_goals || {})) values[`goal:${id}:${root}`] = goal;
  }
  return values;
}

/** Les trajets choisis, un par instance. */
export function transferRoutes(values: CreateValues): any[] {
  const perSource = values.per_source_goal || values.mode === 'minimum_free';
  return (values.instances || []).map((key: string) => {
    const id = Number(key);
    const sources: string[] = [...(values[`src:${key}`] || [])];
    return {
      arr_instance_id: id,
      source_roots: sources,
      destination_root: values[`dst:${key}`] || '',
      root_goals: perSource ? Object.fromEntries(sources.map((root) => [root, Number(values[`goal:${key}:${root}`] ?? values.goal_gb)])) : {},
    };
  });
}

/** Les reglages tels que le serveur les attend (le trajet en `routes`). */
export function transferForm(values: CreateValues): Record<string, any> {
  const accessIds = { ...values.access_ids, ...(values.access_local ? { rsync_local: Number(values.access_local) } : {}) };
  return {
    ...values.extra,
    transfer_methods: [...values.transfer_methods], access_ids: accessIds, root_access_ids: { ...values.root_access_ids }, access_id: 0,
    verification: values.verification, name: values.name, per_source_goal: Boolean(values.per_source_goal),
    routes: transferRoutes(values), transfer_mode: 'arr', arr_instance_id: 0, source_root: '', destination_root: '', source_id: 0, destination_id: 0,
    mode: values.mode, goal_gb: values.goal_gb, target_titles: values.distribution === 'count' ? values.target_titles : null,
    preference: values.preference, media_type: values.media_type, max_titles: values.max_titles, auto_resume: values.auto_resume,
  };
}

const volumeOf = (plan: any, selection: string[]) => plan.groups.reduce((sum: number, group: any) => sum + group.items.filter((item: any) => selection.includes(item.key)).reduce((n: number, item: any) => n + item.size_bytes, 0), 0);
const planMode = (plan: any) => plan.mode || plan.groups[0]?.body.objective_mode || plan.groups[0]?.body.mode;
const requestedBytes = (plan: any) => planMode(plan) === 'selection' ? 0 : plan.requested_bytes ?? plan.groups.reduce((n: number, g: any) => n + (g.requested_bytes || 0), 0);
const requestedTitles = (plan: any) => plan.requested_titles ?? plan.groups.reduce((n: number, g: any) => n + (g.requested_titles || 0), 0);

/** Une selection qui ne remplit pas l'objectif demande un accord explicite. */
export function needsApproval(plan: any, selection: string[]): boolean {
  if (!plan || planMode(plan) === 'selection') return false;
  const requested = requestedBytes(plan);
  const bytes = volumeOf(plan, selection);
  const count = requestedTitles(plan);
  return Boolean((requested > 0 && (bytes > requested * 1.25 || bytes < requested)) || (count && selection.length !== count));
}

function summaryText(plan: any, selection: string[]): string {
  const bytes = volumeOf(plan, selection);
  const requested = requestedBytes(plan);
  const titles = requestedTitles(plan);
  const lines = [`${selection.length}${titles ? ` / ${titles}` : ''} titres · ${gbLabel(bytes)}${requested ? ` / ${gbLabel(requested)}` : ''}`];
  if (planMode(plan) !== 'selection') {
    lines.push(`${bytes >= requested ? 'Objectif d’espace atteint' : `Il manque ${gbLabel(requested - bytes)}`}${bytes > requested ? ` · Dépassement : ${gbLabel(bytes - requested)}` : ''}${titles && selection.length !== titles ? ` · ${titles} titres demandés` : ''}`);
  }
  if (plan.count_covered === false || plan.goal_covered === false) lines.push('La proposition ne remplit pas tous les objectifs : ajustez la sélection ou revenez aux réglages.');
  for (const group of plan.groups) {
    for (const source of group.source_objectives || []) {
      const picked = group.items.filter((item: any) => selection.includes(item.key) && item.snapshot?.source_location_id === source.source_id);
      const total = picked.reduce((n: number, item: any) => n + item.size_bytes, 0);
      lines.push(`${source.name} : ${gbLabel(total)} / ${gbLabel(source.requested_bytes)}${source.requested_titles ? ` · ${picked.length} / ${source.requested_titles} titres` : ''}${total < source.requested_bytes ? ' · objectif non atteint' : ''}`);
    }
  }
  return lines.join('\n');
}

function groupDetails(plan: any, selection: string[]): string {
  const lines: string[] = ['Les séries sont déplacées entièrement. L’espace prévu ne sera libéré qu’après suppression sûre des originaux.'];
  for (const group of plan.groups) {
    const mode = group.transfer_mode || group.body.transfer_mode;
    const sources = group.sources || [group.source];
    const picked = group.items.filter((item: any) => selection.includes(item.key));
    const volume = picked.reduce((n: number, item: any) => n + item.size_bytes, 0);
    lines.push('', `${group.name} · ${group.body.source_roots?.join(', ') || group.body.source_root} → ${group.body.destination_root}`);
    lines.push(`Mode retenu : ${METHOD_LABELS[mode] || mode} · Vérification : ${mode === 'arr' ? 'gérée par Sonarr / Radarr' : group.body.verification === 'renforce' ? 'renforcée · SHA-256' : 'standard · rsync'}`);
    if (group.note) lines.push(group.note);
    if (group.skipped_methods?.length) lines.push(`Contrôles non validés pour ${group.skipped_methods.map((m: string) => METHOD_LABELS[m] || m).join(', ')} : le mode suivant a été retenu avant toute copie.`);
    for (const source of sources.filter(Boolean)) {
      const out = picked.filter((item: any) => item.snapshot?.source_location_id === source.id || !item.snapshot?.source_location_id).reduce((n: number, item: any) => n + item.size_bytes, 0);
      lines.push(`${source.name} : ${gbLabel(source.free_bytes)} → ${gbLabel(source.free_bytes == null ? null : source.free_bytes + out)} libres après déplacement`);
    }
    if (group.destination) lines.push(`Destination : ${gbLabel(group.destination.free_bytes)} → ${gbLabel(group.destination.free_bytes == null ? null : group.destination.free_bytes - volume)} libres`);
    if (group.goal_covered === false) lines.push('Objectif d’espace partiellement couvert.');
    if (group.submitted) lines.push('Lot déjà lancé.');
  }
  return lines.join('\n');
}

export function transferCreation(ctx: TransferContext): CreateDefinition {
  /* L'apercu calcule vit ici, lisible par les champs de l'etape ; reactif pour suivre les ajouts. */
  const state = reactive<{ plan: any }>({ plan: null });
  const editing = ctx.taskId > 0;

  const rootsFor = (key: string): string[] => ctx.roots().find((entry: any) => String(entry.arr_instance_id) === key)?.arr_roots || [];
  const nameOf = (key: string): string => ctx.roots().find((entry: any) => String(entry.arr_instance_id) === key)?.name || key;

  function capacity(values: CreateValues, key: string, root: string): string {
    if (!root) return '';
    const id = Number(key);
    const form = transferForm(values);
    const endpoint = selectedRootAccess(form, ctx.accesses(), id, root);
    const proof = endpoint?.validation?.roots?.find((entry: any) => entry.arr_instance_id === id && entry.arr_root === root);
    const arr = ctx.roots().find((entry: any) => entry.arr_instance_id === id)?.capacities?.[root];
    const saved = ctx.locations().find((location: any) => location.mappings?.some((m: any) => m.arr_instance_id === id && m.arr_root === root));
    const bytes = proof?.free_bytes ?? arr?.free_bytes ?? saved?.free_bytes;
    return bytes == null ? 'Espace disponible inconnu' : `${gbLabel(bytes)} libres · dernier contrôle`;
  }

  const selectedMethods = (values: CreateValues): string[] => values.transfer_methods || [];

  /* Pourquoi un mode n'est pas propose ; vide s'il l'est. */
  function unavailableReason(values: CreateValues, mode: string): string {
    if (mode === 'arr') return '';
    const method = mode === 'rsync_ssh' ? 'ssh' : 'local';
    const accesses = ctx.accesses().filter((access: any) => access.method === method);
    if (!accesses.length) return mode === 'rsync_ssh' ? 'Aucun accès SSH configuré pour les stockages.' : 'Aucun accès aux volumes montés configuré pour les stockages.';
    const form = transferForm(values);
    const routes: any[] = form.routes;
    if (mode === 'rsync_ssh') {
      const ambiguous = routes.some((route) => [...route.source_roots, route.destination_root].filter(Boolean).some((root: string) => rootChoices(ctx.accesses(), route.arr_instance_id, root).length > 1 && !selectedRootAccess(form, ctx.accesses(), route.arr_instance_id, root)));
      if (ambiguous) return 'Plusieurs accès SSH correspondent à une racine : configurez un accès unique dans Stockages.';
      if (!sshCovered(form, ctx.accesses())) return 'Aucun accès configuré ne couvre toutes les sources et destinations choisies.';
    } else if (!availableLocal(values).length) return 'Aucun accès configuré ne couvre toutes les sources et destinations choisies.';
    return '';
  }
  function availableLocal(values: CreateValues): any[] {
    const routes = transferRoutes(values);
    return ctx.accesses().filter((access: any) => access.method === 'local' && routes.every((route) => [...route.source_roots, route.destination_root].filter(Boolean).every((root: string) => access.roots.some((r: any) => r.arr_instance_id === route.arr_instance_id && r.arr_root === root))));
  }

  function initGoals(values: CreateValues): void {
    for (const key of values.instances || []) for (const root of values[`src:${key}`] || []) {
      const goal = `goal:${key}:${root}`;
      if (values[goal] === undefined) values[goal] = values.goal_gb;
    }
  }

  const methodOptions = (values: CreateValues): CreateOption[] => {
    const chosen = selectedMethods(values);
    const ordered = [...chosen.map((value) => METHODS.find((m) => m.value === value)!).filter(Boolean), ...METHODS.filter((m) => !chosen.includes(m.value))];
    return ordered.map((method) => {
      const index = chosen.indexOf(method.value);
      const reason = index < 0 ? unavailableReason(values, method.value) : '';
      return {
        value: method.value,
        label: index >= 0 ? `${method.label} · priorité ${index + 1}` : method.label,
        description: reason ? `Indisponible : ${reason}` : method.description,
        disabled: Boolean(reason),
        action: index > 0 ? 'Monter' : undefined,
      };
    });
  };

  const routeFields = (values: CreateValues): CreateField[] => {
    const fields: CreateField[] = [{
      key: 'instances', type: 'checklist', label: 'Instances à déplacer', required: true,
      options: () => ctx.roots().map((entry: any) => ({ value: String(entry.arr_instance_id), label: `${entry.name} · ${entry.arr_type === 'radarr' ? 'Films' : 'Séries'}`, disabled: Boolean(entry.error) })),
      onChange: (value, vals) => {
        const keep = new Set<string>(value || []);
        for (const key of Object.keys(vals)) if (/^(src|dst):/.test(key) && !keep.has(key.split(':')[1])) delete vals[key];
        for (const key of keep) if (vals[`src:${key}`] === undefined) { vals[`src:${key}`] = []; vals[`dst:${key}`] = ''; }
      },
    }];
    const perSource = values.per_source_goal || values.mode === 'minimum_free';
    for (const key of values.instances || []) {
      const sources: string[] = values[`src:${key}`] || [];
      fields.push({
        key: `src:${key}`, type: 'checklist', label: `Déplacer depuis · ${nameOf(key)}`, required: true,
        options: (vals) => rootsFor(key).filter((root) => root !== vals[`dst:${key}`]).map((root) => ({ value: root, label: root, description: capacity(vals, key, root) })),
        onChange: (_value, vals) => initGoals(vals),
      }, {
        key: `dst:${key}`, type: 'select', label: `Destination · ${nameOf(key)}`, required: true,
        options: (vals) => [{ value: '', label: 'Choisir la destination' }, ...rootsFor(key).filter((root) => !(vals[`src:${key}`] || []).includes(root)).map((root) => ({ value: root, label: `${root} · ${capacity(vals, key, root)}` }))],
        validate: (value, vals) => ((vals[`src:${key}`] || []).includes(value) ? 'La destination doit différer des sources.' : null),
      });
      if (perSource) {
        for (const root of sources) fields.push({ key: `goal:${key}:${root}`, type: 'number', label: `Objectif pour ${root} (Go)`, required: true, validate: (value) => (Number(value) > 0 ? null : 'Indiquez une valeur supérieure à 0.') });
      }
    }
    return fields;
  };

  const previewFields = (): CreateField[] => {
    const items = (): any[] => (state.plan ? state.plan.groups.flatMap((group: any) => group.items.map((item: any) => ({ item, group }))) : []);
    return [
      { key: 'summary', type: 'note', label: 'Objectif', summary: 'hide', text: (values) => (state.plan ? summaryText(state.plan, values.selection || []) : '') },
      {
        key: 'alternative', type: 'cards', label: 'Autres répartitions possibles', summary: 'hide', when: () => Boolean(state.plan?.alternatives?.length),
        options: () => (state.plan?.alternatives || []).map((alt: any, index: number) => ({ value: String(index), label: `${alt.title_count} titres · ${gbLabel(alt.planned_bytes)}`, description: alt.goal_covered ? '' : 'Espace insuffisant' })),
        onChange: (value, values) => {
          const alternative = state.plan?.alternatives?.[Number(value)];
          if (!alternative) return;
          for (const group of state.plan.groups) for (const item of group.catalogue || []) if (alternative.keys.includes(item.key) && !group.items.some((i: any) => i.key === item.key)) group.items.push(item);
          values.selection = [...alternative.keys];
        },
      },
      { key: 'details', type: 'note', label: 'Détail', summary: 'hide', text: (values) => (state.plan ? groupDetails(state.plan, values.selection || []) : '') },
      {
        key: 'selection', type: 'checklist', label: 'Titres proposés', required: true, summary: 'hide',
        options: () => items().map(({ item, group }: any) => ({
          value: item.key, label: item.title,
          description: `${gbLabel(item.size_bytes)} · ${item.snapshot?.source_arr} → ${item.snapshot?.destination_arr}${item.explanation ? ` · ${item.explanation}` : ''}`,
          disabled: Boolean(group.submitted || item.protected),
          action: item.protected ? 'Protégé' : 'Conserver ici',
        })),
        onAction: async (key, values) => {
          const found = items().find(({ item }: any) => item.key === key)?.item;
          if (!found || found.protected) return;
          await ctx.protect(found);
          found.protected = true;
          values.selection = (values.selection || []).filter((entry: string) => entry !== key);
        },
        validate: (value) => ((value || []).length ? null : 'Gardez au moins un titre.'),
      },
      {
        key: 'excluded', type: 'checklist', label: 'Titres écartés', summary: 'hide', when: () => state.plan?.groups.some((group: any) => group.excluded?.length),
        help: 'Ils ne remplissent pas les critères ; chacun garde sa raison.',
        options: () => state.plan.groups.flatMap((group: any) => (group.excluded || []).map((item: any) => ({
          value: item.key, label: item.title, description: item.explanation,
          disabled: true,
          action: !item.protected && group.catalogue?.some((c: any) => c.key === item.key) ? 'Ajouter à la sélection' : undefined,
        }))),
        onAction: (key, values) => {
          for (const group of state.plan.groups) {
            const candidate = group.catalogue?.find((c: any) => c.key === key);
            if (!candidate || candidate.protected) continue;
            if (!group.items.some((i: any) => i.key === key)) group.items.push(candidate);
            group.excluded = (group.excluded || []).filter((i: any) => i.key !== key);
            values.selection = [...(values.selection || []), key];
          }
        },
      },
      {
        key: 'approved', type: 'toggle', label: 'J’accepte cette sélection même si elle ne remplit pas exactement l’objectif.', summary: 'hide',
        when: (values) => needsApproval(state.plan, values.selection || []),
        validate: (value, values) => (needsApproval(state.plan, values.selection || []) && !value ? 'Acceptez la sélection pour continuer.' : null),
      },
    ];
  };

  return {
    noun: 'un transfert',
    another: 'un autre transfert',
    editTitle: 'Modifier la tâche',
    submitLabel: 'Lancer la sélection',
    initial: freshTransferValues,
    secondaryActions: [
      { key: 'save', label: 'Enregistrer la tâche' },
      ...(editing ? [{ key: 'settings', label: 'Enregistrer les modifications', from: 'method' }] : []),
    ],
    steps: [
      {
        key: 'objective',
        label: 'Objectif',
        title: 'Que souhaitez-vous faire ?',
        fields: [
          {
            key: 'mode', type: 'cards', label: 'Objectif', options: OBJECTIVES,
            onChange: (_value, values) => {
              values.per_source_goal = false;
              for (const key of Object.keys(values)) if (key.startsWith('goal:')) delete values[key];
              if (values.mode === 'selection') { values.target_titles = null; values.distribution = 'auto'; }
            },
          },
          { key: 'name', type: 'text', label: 'Nom de la tâche', placeholder: 'Ex. Faire de la place' },
          {
            key: 'goal_gb', type: 'number', label: 'Espace à libérer au total (Go)', required: true, when: (values) => values.mode === 'release_space',
            onChange: (_value, values) => { for (const key of Object.keys(values)) if (key.startsWith('goal:')) delete values[key]; },
            validate: (value) => (Number(value) > 0 ? null : 'Indiquez une valeur supérieure à 0.'),
          },
          {
            key: 'goal_gb', type: 'number', label: 'Espace libre minimum par source (Go)', required: true, when: (values) => values.mode === 'minimum_free',
            validate: (value) => (Number(value) > 0 ? null : 'Indiquez une valeur supérieure à 0.'),
          },
          { key: 'per_source_goal', type: 'toggle', label: 'Définir un objectif par source', when: (values) => values.mode === 'release_space' },
          {
            key: 'distribution', type: 'select', label: 'Répartition', when: (values) => values.mode !== 'selection',
            options: [{ value: 'auto', label: 'Automatique' }, { value: 'count', label: 'Sur un nombre de titres' }],
            onChange: (value, values) => { values.target_titles = value === 'count' ? 5 : null; },
          },
          {
            key: 'target_titles', type: 'number', label: 'Nombre de titres', help: 'Un film ou une série entière compte pour un titre. Par source, ce nombre s’applique à chaque source.', required: true,
            when: (values) => values.mode !== 'selection' && values.distribution === 'count',
            validate: (value, values) => (Number(value) >= 1 && Number(value) <= Number(values.max_titles) ? null : `Indiquez un nombre entre 1 et ${values.max_titles}.`),
          },
          {
            key: 'preference', type: 'select', label: 'Titres à privilégier', help: 'Si les données Plex manquent, l’aperçu vous proposera un autre critère.',
            options: [{ value: 'closest', label: 'Au plus proche de l’objectif' }, { value: 'oldest_added', label: 'Les plus anciens ajouts' }, { value: 'least_recently_watched', label: 'Les moins récemment regardés sur Plex' }],
          },
          { key: 'auto_resume', type: 'toggle', label: 'Reprendre le suivi après un redémarrage' },
          {
            key: 'protected_titles', type: 'checklist', label: 'Titres protégés', summary: 'hide', when: () => ctx.protectedTitles().length > 0,
            help: 'Ils ne sont jamais déplacés.',
            options: () => ctx.protectedTitles().map((entry: any) => ({ value: entry.key, label: entry.title, disabled: true, action: 'Autoriser le déplacement' })),
            onAction: async (key) => { await ctx.unprotect(key); },
          },
        ],
      },
      {
        key: 'route',
        label: 'Trajet',
        title: 'D’où et vers où déplacer ?',
        onEnter: async (values) => { initGoals(values); },
        fields: routeFields,
      },
      {
        key: 'method',
        label: 'Méthode',
        title: 'Comment copier les fichiers ?',
        description: 'Le premier mode qui passe les contrôles est retenu. Aucun changement de mode après le début de la copie.',
        fields: [
          {
            key: 'transfer_methods', type: 'checklist', label: 'Modes de transfert, par priorité', required: true, options: methodOptions,
            onAction: (key, values) => {
              const next = [...selectedMethods(values)];
              const index = next.indexOf(key);
              if (index > 0) [next[index - 1], next[index]] = [next[index], next[index - 1]];
              values.transfer_methods = next;
            },
            onChange: (value, values) => {
              if ((value || []).includes('rsync_local') && !values.access_local) values.access_local = String(availableLocal(values)[0]?.id || '');
            },
          },
          {
            key: 'access_local', type: 'select', label: 'Accès configuré (rsync local)', required: true, when: (values) => selectedMethods(values).includes('rsync_local'),
            options: (values) => [{ value: '', label: 'Choisir un accès' }, ...availableLocal(values).map((access: any) => ({ value: String(access.id), label: access.name }))],
          },
          { key: 'playback', type: 'note', label: 'Lecture', tone: 'warning', summary: 'hide', when: (values) => selectedMethods(values).includes('arr'), text: 'Une lecture détectée avant le lancement reporte le titre. Si elle commence après, Arr poursuit le déplacement : une pause ne peut pas arrêter sa commande.' },
          {
            key: 'verification', type: 'cards', label: 'Vérification des fichiers', when: (values) => selectedMethods(values).some((m) => m !== 'arr'),
            options: [
              { value: 'standard', label: 'Standard · rsync', description: 'Vérification intégrée au transfert, sans relecture complète supplémentaire. Recommandé.' },
              { value: 'renforce', label: 'Renforcée · SHA-256', description: 'Relit entièrement les deux copies : plus sûr, nettement plus long sur un partage réseau.' },
            ],
          },
          { key: 'arr_check', type: 'note', label: 'Vérification', summary: 'hide', when: (values) => !selectedMethods(values).some((m) => m !== 'arr'), text: 'Vérification du déplacement gérée par Sonarr / Radarr.' },
          { key: 'connections', type: 'note', label: 'Connexions', summary: 'hide', text: 'Les accès aux dossiers choisis sont contrôlés au calcul de l’aperçu. Les connexions se configurent dans Stockages.' },
        ],
      },
      {
        key: 'preview',
        label: 'Aperçu',
        title: 'Ces déplacements vous conviennent-ils ?',
        loading: (values) => values.__progress || 'Préparation de l’aperçu…',
        onEnter: async (values) => {
          state.plan = null;
          values.selection = [];
          values.approved = false;
          const routes = transferRoutes(values);
          if (ctx.taskId && routes.length !== 1) throw new Error('Modifiez une seule instance pour cette tâche, ou créez une nouvelle tâche.');
          const result = await ctx.calculate(values, (text) => { values.__progress = text; });
          values.__progress = '';
          const plan = result.groups ? result : { groups: [{ ...result, body: transferForm(values), name: 'Sélection', submitted: false }] };
          state.plan = plan;
          values.selection = values.mode === 'selection' ? [] : plan.groups.flatMap((group: any) => group.items.map((item: any) => item.key));
        },
        fields: previewFields(),
      },
    ],
    submit: async (values, action) => {
      if (action === 'settings') {
        await ctx.saveSettings(values);
        return { message: 'Paramètres enregistrés dans la tâche existante. Aucun transfert lancé.', links: [{ label: 'Voir les transferts', to: { query: { vue: 'transfers' } } }] };
      }
      const start = action !== 'save';
      await ctx.launch(state.plan, values.selection || [], start);
      return {
        message: start ? 'Transfert lancé.' : 'Tâche enregistrée. Aucun transfert lancé.',
        detail: `${(values.selection || []).length} titre(s) · ${gbLabel(volumeOf(state.plan, values.selection || []))}`,
        links: [{ label: 'Voir les transferts', to: { query: { vue: 'transfers' } } }],
      };
    },
  };
}
