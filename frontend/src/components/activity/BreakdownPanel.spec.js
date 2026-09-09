/** Les trois lectures d'une répartition : barres, camembert, tableau triable. */
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import BreakdownPanel from './BreakdownPanel.vue';

const items = [
  { label: 'Warner', value: 30 },
  { label: 'Ghibli', value: 50 },
  { label: 'Pixar', value: 20 },
];

const mountPanel = (props = {}) =>
  mount(BreakdownPanel, { props: { title: 'Studios', items, interactive: true, ...props } });

const showTable = async (wrapper) => {
  await wrapper.find('button[aria-label="Afficher le tableau"]').trigger('click');
  return wrapper;
};
const labels = (wrapper) =>
  wrapper.findAll('.breakdown-table > button').map((row) => row.findAll('span')[0].text());

describe('BreakdownPanel', () => {
  it('affiche un camembert à la demande', async () => {
    const wrapper = mountPanel();
    expect(wrapper.findComponent({ name: 'PieChart' }).exists()).toBe(false);

    await wrapper.find('button[aria-label="Afficher le camembert"]').trigger('click');

    const pie = wrapper.findComponent({ name: 'PieChart' });
    expect(pie.exists()).toBe(true);
    // Une part par catégorie, plus le fond de l'anneau.
    expect(pie.findAll('circle.pie-slice')).toHaveLength(3);
  });

  it('remonte la catégorie choisie dans le camembert', async () => {
    const wrapper = mountPanel();
    await wrapper.find('button[aria-label="Afficher le camembert"]').trigger('click');

    await wrapper.findAll('.pie-legend button')[1].trigger('click');

    expect(wrapper.emitted('select')?.[0]).toEqual(['Ghibli']);
  });

  it('ne laisse pas cliquer une répartition qui ne filtre rien', async () => {
    const wrapper = mountPanel({ interactive: false });
    await wrapper.find('button[aria-label="Afficher le camembert"]').trigger('click');

    await wrapper.findAll('.pie-legend button')[0].trigger('click');

    expect(wrapper.emitted('select')).toBeUndefined();
  });

  it('trie le tableau par libellé puis inverse le sens', async () => {
    // La répartition arrive ordonnée par valeur ; retrouver une catégorie précise
    // demande l'ordre alphabétique.
    const wrapper = await showTable(mountPanel());
    expect(labels(wrapper)).toEqual(['Warner', 'Ghibli', 'Pixar']);

    await wrapper.find('.table-head button:first-child').trigger('click');
    expect(labels(wrapper)).toEqual(['Ghibli', 'Pixar', 'Warner']);

    await wrapper.find('.table-head button:first-child').trigger('click');
    expect(labels(wrapper)).toEqual(['Warner', 'Pixar', 'Ghibli']);
  });

  it('trie par valeur, de la plus grande à la plus petite', async () => {
    const wrapper = await showTable(mountPanel());

    await wrapper.findAll('.table-head button')[1].trigger('click');

    expect(labels(wrapper)).toEqual(['Ghibli', 'Warner', 'Pixar']);
    expect(wrapper.findAll('.table-head button')[1].attributes('aria-sort')).toBe('descending');
  });

  it('laisse « Autres » en queue quel que soit le tri', async () => {
    // « Autres » est un reste, pas une catégorie : le trier avec les autres le ferait
    // remonter en tête dès qu'il pèse plus lourd qu'elles.
    const many = Array.from({ length: 40 }, (_, i) => ({ label: `Studio ${i}`, value: i + 1 }));
    const wrapper = await showTable(mountPanel({ items: many }));

    await wrapper.findAll('.table-head button')[1].trigger('click');

    expect(labels(wrapper).at(-1)).toBe('Autres');
  });
});
