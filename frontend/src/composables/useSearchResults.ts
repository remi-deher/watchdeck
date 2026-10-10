import { ref } from 'vue';

const query = ref('');
const open = ref(false);

/** La sheet reprend la saisie de la barre, sans second champ. */
export function useSearchResults() {
  return { query, open };
}
