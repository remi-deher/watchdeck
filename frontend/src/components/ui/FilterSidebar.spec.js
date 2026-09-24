import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, nextTick, ref } from 'vue';

import FilterSidebar from './FilterSidebar.vue';
import UiChipGroup from './UiChipGroup.vue';

// Reka rend ses surfaces par un vrai portail vers <body> : le bouchon global des
// Teleport (testSetup) les ferait disparaitre.
const reel = { global: { stubs: { teleport: false } } };

const TYPES = [{ value: 'all', label: 'Tout' }, { value: 'movie', label: 'Films' }, { value: 'show', label: 'Séries' }];
const STATUTS = [{ value: '', label: 'Tous' }, { value: 'library', label: 'Dans Plex' }, { value: 'failed', label: 'Échec' }];
const GENRES = [{ value: 'rock', label: 'Rock' }, { value: 'jazz', label: 'Jazz' }];

function monter() {
  const type = ref('all');
  const statut = ref('library');
  const genres = ref([]);
  const Hote = defineComponent({
    components: { FilterSidebar, UiChipGroup },
    setup: () => ({ type, statut, genres, TYPES, STATUTS, GENRES }),
    template: `
      <FilterSidebar open>
        <UiChipGroup label="Type" :options="TYPES" v-model="type" />
        <UiChipGroup label="Statut" :options="STATUTS" default-value="library" v-model="statut" />
        <UiChipGroup label="Genre" :options="GENRES" exclusion v-model="genres" />
      </FilterSidebar>`,
  });
  const wrapper = mount(Hote, { attachTo: document.body, ...reel });
  return { wrapper, type, statut, genres };
}

const puces = () => [...document.querySelectorAll('.filter-chip')].map((node) => node.textContent.trim());

describe('FilterSidebar — puces des filtres actifs', () => {
  it('n’affiche aucune puce tant que les filtres sont neutres', async () => {
    const { wrapper } = monter();
    await nextTick();
    expect(document.querySelector('.filter-chips')).toBeNull();
    wrapper.unmount();
  });

  it('déduit les puces des groupes, dans leur ordre, valeur neutre comprise', async () => {
    const { wrapper, type, statut, genres } = monter();
    type.value = 'movie';
    statut.value = '';
    genres.value = ['rock', '!jazz'];
    await nextTick();
    // « Tous » n'est pas le neutre du statut (c'est « Dans Plex ») : il devient une puce.
    expect(puces()).toEqual(['Films', 'Tous', 'Rock', 'Sauf Jazz']);
    wrapper.unmount();
  });

  it('retire un filtre d’un appui sur sa puce', async () => {
    const { wrapper, type, genres } = monter();
    type.value = 'show';
    genres.value = ['rock', '!jazz'];
    await nextTick();

    document.querySelector('[aria-label="Retirer le filtre Séries"]').click();
    document.querySelector('[aria-label="Retirer le filtre Sauf Jazz"]').click();
    await nextTick();

    expect(type.value).toBe('all');
    expect(genres.value).toEqual(['rock']);
    expect(puces()).toEqual(['Rock']);
    wrapper.unmount();
  });
});
