import type { QueryClient, QueryKey } from '@tanstack/vue-query';
const pending = new WeakMap<QueryClient, { keys: QueryKey[]; resolve: (() => void)[]; reject: ((e: unknown) => void)[] }>();
const covers = (parent: QueryKey, child: QueryKey) => parent.length <= child.length && parent.every((v,i) => JSON.stringify(v) === JSON.stringify(child[i]));
/** Shared observers invalidate each domain once and never cancel a shared in-flight read. */
export function invalidateRealtime(client: QueryClient, key: QueryKey): Promise<void> {
  let batch = pending.get(client);
  if (!batch) {
    batch = { keys: [], resolve: [], reject: [] }; pending.set(client, batch);
    setTimeout(() => {
      pending.delete(client);
      const current = batch!;
      void Promise.all(current.keys.map(queryKey => client.invalidateQueries({ queryKey }, { cancelRefetch: false })))
        .then(() => current.resolve.forEach(fn => fn()), error => current.reject.forEach(fn => fn(error)));
    }, 60);
  }
  if (!batch.keys.some(parent => covers(parent, key))) {
    batch.keys = batch.keys.filter(child => !covers(key, child)); batch.keys.push(key);
  }
  return new Promise((resolve, reject) => { batch!.resolve.push(resolve); batch!.reject.push(reject); });
}
