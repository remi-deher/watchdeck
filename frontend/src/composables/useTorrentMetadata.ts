import { computed, reactive } from 'vue';
import { api } from '@/api';

export interface ClientMetadata { categories: string[]; tags: string[]; mutable: boolean }
const EMPTY: ClientMetadata = { categories: [], tags: [], mutable: false };
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('fr') === b.trim().toLocaleLowerCase('fr');

/** Nom tel qu'il existe déjà (casse comprise) ; à défaut, la saisie nettoyée. */
export function canonicalName(value: string, known: string[]): string {
  return known.find((item) => sameName(item, value)) || value.trim();
}
/** « a, B ,a » -> « a, B » : une seule fois chaque tag, avec la casse des tags connus. */
export function normalizeTags(value: string, known: string[]): string {
  const seen = new Set<string>();
  return value.split(',').map((item) => canonicalName(item, known)).filter((item) => {
    const key = item.toLocaleLowerCase('fr');
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).join(', ');
}

/**
 * Catégories et tags des clients torrent : ce que chaque client connaît (pour proposer),
 * et ce qu'on lui fait (créer, renommer, supprimer). Partagé par l'ajout d'un torrent, la
 * modification de la sélection et la gestion des catégories et tags.
 */
export function useTorrentMetadata() {
  const byClient = reactive<Record<string, ClientMetadata>>({});
  const of = (clientId: string | number | null | undefined): ClientMetadata => byClient[String(clientId)] || EMPTY;

  async function load(clientId: string | number): Promise<ClientMetadata> {
    const payload = await api<any>(`/api/downloads/clients/${clientId}/metadata`);
    byClient[String(clientId)] = {
      categories: (payload.categories || []).map((item: { name: string }) => item.name),
      tags: payload.tags || [],
      mutable: Boolean(payload.mutable),
    };
    return byClient[String(clientId)];
  }
  /** Lit tous les clients : une lecture qui échoue laisse le client sans proposition. */
  async function loadAll(clientIds: Array<string | number>): Promise<void> {
    await Promise.allSettled(clientIds.map(load));
  }

  async function mutate(clientId: string | number, kind: 'category' | 'tag', action: 'create' | 'rename' | 'delete', name: string, newName?: string): Promise<void> {
    await api(`/api/downloads/clients/${clientId}/metadata`, { method: 'POST', body: JSON.stringify({ kind, action, name, new_name: newName || undefined }) });
    await load(clientId);
  }

  /** Crée ce que le client ne connaît pas encore, avant d'y ranger un torrent. */
  async function ensure(clientId: string | number, category: string, tags: string): Promise<void> {
    if (!of(clientId).mutable) return;
    if (category.trim() && !of(clientId).categories.some((item) => sameName(item, category))) await mutate(clientId, 'category', 'create', category.trim());
    for (const tag of tags.split(',').map((item) => item.trim()).filter(Boolean)) {
      if (!of(clientId).tags.some((item) => sameName(item, tag))) await mutate(clientId, 'tag', 'create', tag);
    }
  }

  const count = computed(() => Object.keys(byClient).length);
  return { byClient, of, load, loadAll, mutate, ensure, count };
}
