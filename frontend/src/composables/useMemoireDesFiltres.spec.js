import { nextTick, ref, watch } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { installerMemoireDesAdresses, memoriserFiltres } from './useMemoireDesFiltres';

const surveiller = (source, rappel) => watch(source, rappel, { deep: true });

beforeEach(() => {
  sessionStorage.clear();
  window.history.replaceState({}, '', '/notifications');
});

describe('memoriserFiltres', () => {
  it('retient les filtres et les restaure a la visite suivante', async () => {
    const premiers = { state: ref(''), users: ref([]) };
    memoriserFiltres('notifs', premiers, { state: '', users: [] }, surveiller);
    premiers.state.value = 'failed';
    premiers.users.value = [2];
    await nextTick();

    const suivants = { state: ref(''), users: ref([]) };
    memoriserFiltres('notifs', suivants, { state: '', users: [] }, surveiller);
    expect(suivants.state.value).toBe('failed');
    expect(suivants.users.value).toEqual([2]);
  });

  it("laisse le dernier mot a l'adresse, y compris sous un autre nom de parametre", async () => {
    const premiers = { sortBy: ref('popularity.desc'), genre: ref('') };
    memoriserFiltres('decouvrir', premiers, { sortBy: 'popularity.desc', genre: '' }, surveiller);
    premiers.sortBy.value = 'vote_average.desc';
    premiers.genre.value = '28';
    await nextTick();

    window.history.replaceState({}, '', '/notifications?sort=release_date.desc');
    const suivants = { sortBy: ref('release_date.desc'), genre: ref('') };
    memoriserFiltres('decouvrir', suivants, { sortBy: 'popularity.desc', genre: '' }, surveiller, { sortBy: 'sort' });
    expect(suivants.sortBy.value).toBe('release_date.desc');
    expect(suivants.genre.value).toBe('28');
  });

  it("ignore une valeur retenue qui n'a pas la forme attendue", () => {
    sessionStorage.setItem('watchdeck:filtres:valeurs:x:/notifications', JSON.stringify({ users: 'pas-une-liste' }));
    const filtres = { users: ref([]) };
    memoriserFiltres('x', filtres, { users: [] }, surveiller);
    expect(filtres.users.value).toEqual([]);
  });
});

describe('installerMemoireDesAdresses', () => {
  async function routeur() {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:p(.*)*', component: { render: () => null } }] });
    installerMemoireDesAdresses(router);
    return router;
  }

  it('rend la section retenue quand on revient sans adresse depuis une autre page', async () => {
    const router = await routeur();
    await router.push('/downloads?view=clients&sub=instances');
    await router.push('/notifications');
    await router.push('/downloads');
    expect(router.currentRoute.value.fullPath).toBe('/downloads?view=clients&sub=instances');
  });

  it('ne touche ni a une adresse explicite ni a une reinitialisation sur la meme page', async () => {
    const router = await routeur();
    await router.push('/downloads?view=clients');
    await router.push('/downloads');
    expect(router.currentRoute.value.fullPath).toBe('/downloads');
    await router.push('/notifications');
    await router.push('/downloads?view=queue');
    expect(router.currentRoute.value.fullPath).toBe('/downloads?view=queue');
  });
});
