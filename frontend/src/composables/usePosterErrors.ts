import { ref } from 'vue';

/** Affiches qui ont echoue a charger : on bascule sur l'icone au lieu de reessayer. */
export function usePosterErrors() {
  const failed = ref<Set<string>>(new Set());

  function posterKey(row: any): string {
    return [
      row.arr_type || row.source || row.media_type || 'media',
      row.instance_id || row.client_id || '',
      row.id || row.arr_id || row.queue_id || row.hash || row.poster_url || row.title,
    ].join(':');
  }

  return {
    hasPosterError: (row: any): boolean => failed.value.has(posterKey(row)),
    onPosterError: (row: any): void => { failed.value = new Set([...failed.value, posterKey(row)]); },
  };
}
