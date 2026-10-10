import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import HandleRow from './HandleRow.vue';
import HandleTemplate from '../HandleTemplate.vue';

const handling = { key: 'report:1', source: 'report', kind: 'audio', label: 'Audio à vérifier', state: 'open', urgency: 'high',
  consequence: 'Lecture affectée', proposal: 'Vérifier les pistes', fixable: false,
  actions: [{ key: 'retry', label: 'Relancer', disabled: true, title: 'Pas de liaison ARR' }] };
const item = { key: handling.key, title: 'Dune', handling,
  media: { id: 1, title: 'Dune', media_type: 'movie', poster_url: '/poster.jpg', backdrop_url: '/fanart.jpg' } };
const global = { stubs: { RouterLink: { template: '<a><slot /></a>' } } };

describe('HandleRow — problème complet', () => {
  it('affiche le média et les conséquences, et respecte une action indisponible', () => {
    const wrapper = mount(HandleRow, { props: { item, selectable: false }, global });
    expect(wrapper.find('img').attributes('src')).toContain('poster.jpg');
    expect(wrapper.find('.handle-row__backdrop').attributes('style')).toContain('fanart.jpg');
    expect(wrapper.text()).toContain(handling.consequence);
    expect(wrapper.text()).toContain(handling.proposal);
    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    expect(wrapper.find('.handle-row').classes()).toContain('is-high');
  });
  it('garde la priorité des images explicites pendant la migration', () => {
    const wrapper = mount(HandleRow, { props: { item: { ...item, poster: '/explicit.jpg', backdrop: '/explicit-bg.jpg' } }, global });
    expect(wrapper.find('img').attributes('src')).toContain('explicit.jpg');
    expect(wrapper.find('.handle-row__backdrop').attributes('style')).toContain('explicit-bg.jpg');
  });
  it('transmet la note par le gabarit sans inventer de mutation', async () => {
    const wrapper = mount(HandleTemplate, { props: { items: [{ ...item, note: { label: 'Note interne', value: '' } }] }, global });
    await wrapper.find('textarea').setValue(' Vérifié ');
    await wrapper.find('textarea').trigger('blur');
    expect(wrapper.emitted('note')[0][1]).toBe('Vérifié');
  });
  it('trie selon l’urgence du contrat plutôt que les anciens champs', () => {
    const wrapper = mount(HandleTemplate, { props: { items: [
      { ...item, key: 'low', title: 'Second', urgency: 'high', handling: { ...handling, urgency: 'low' } },
      { ...item, title: 'Premier', urgency: 'low' },
    ] }, global });
    expect(wrapper.findAll('.handle-row__title').map(node => node.text())).toEqual(['Premier', 'Second']);
  });
});
