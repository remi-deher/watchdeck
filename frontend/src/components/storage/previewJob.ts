import {api} from '@/api';

export async function calculatePreview(body: unknown, onProgress: (elapsed: number) => void) {
  const started = Date.now();
  const job: any = await api('/api/storage/preview/start', {method: 'POST', body: JSON.stringify(body)});
  while (true) {
    onProgress(Math.floor((Date.now() - started) / 1000));
    const state: any = await api(`/api/storage/preview/${job.id}`);
    if (state.status === 'completed') return state.result;
    if (state.status === 'failed') throw new Error(state.error);
    if (Date.now() - started > 660000) throw new Error('L’aperçu prend trop de temps. Réessayez avec moins de racines.');
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
