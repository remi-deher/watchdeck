import { vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import ControlTable from './ControlTable.vue';

const rows = [
  { id: 1, name: 'Alice', on: true },
  { id: 2, name: 'Bruno', on: false },
  { id: 3, name: 'Chloé', on: true },
];
const columns = [{ key: 'name', label: 'Nom', sortable: true }];
const bulkActions = [
  { key: 'pause', label: 'Pause' },
  { key: 'more', label: 'Statut', items: [{ key: 'status:on', label: 'Activer' }, { key: 'status:off', label: 'Désactiver', separated: true }] },
  { key: 'delete', label: 'Supprimer', tone: 'danger', confirm: (targets) => ({ title: `Supprimer ${targets.length} ?`, confirmLabel: 'Supprimer', danger: true }) },
];
const rowActions = (row) => [
  { key: 'open', label: 'Modifier', icon: 'span' },
  { key: 'toggle', label: row.on ? 'Désactiver' : 'Activer', icon: 'span' },
  { key: 'remove', label: 'Retirer', tone: 'danger', separated: true },
];

function factory(props = {}) {
  return mount(ControlTable, {
    attachTo: document.body,
    props: { rows, columns, rowKey: (row) => row.id, rowLabel: (row) => row.name, label: 'Comptes', bulkActions, rowActions, openable: true, ...props },
    slots: { 'cell-name': '<template #cell-name="{ row }"><b class="who">{{ row.name }}</b></template>' },
  });
}
const selectAll = async (wrapper) => {
  await wrapper.find('thead [role="checkbox"]').trigger('click');
  await nextTick();
};
const ouvrir = async (trigger) => {
  await trigger.trigger('keydown', { key: 'Enter' });
  await nextTick();
};
const items = () => [...document.body.querySelectorAll('.ui-menu-item')].map((node) => node.textContent.trim());
const choisir = async (label) => {
  [...document.body.querySelectorAll('.ui-menu-item')].find((node) => node.textContent.trim() === label).dispatchEvent(new Event('click', { bubbles: true }));
  await nextTick();
  await nextTick();
};

describe('ControlTable', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('montre la barre d’actions seulement quand des lignes sont cochées', async () => {
    const wrapper = factory({ labels: { singular: 'compte coché', plural: 'comptes cochés' } });
    expect(wrapper.find('.bulk-bar').exists()).toBe(false);
    await selectAll(wrapper);
    expect(wrapper.find('.bulk-bar').text()).toContain('3 comptes cochés');
  });

  it('émet l’action avec les lignes cochées, puis vide la sélection', async () => {
    const wrapper = factory();
    await selectAll(wrapper);
    await wrapper.find('.bulk-bar button').trigger('click');
    expect(wrapper.emitted('action')[0][0]).toBe('pause');
    expect(wrapper.emitted('action')[0][1].map((row) => row.id)).toEqual([1, 2, 3]);
    await nextTick();
    expect(wrapper.find('.bulk-bar').exists()).toBe(false);
  });

  it('range les entrées d’une action à menu dans un menu', async () => {
    const wrapper = factory();
    await selectAll(wrapper);
    await ouvrir(wrapper.findAll('.bulk-bar button')[1]);
    expect(items()).toEqual(['Activer', 'Désactiver']);
    expect(document.body.querySelectorAll('.ui-menu-separator')).toHaveLength(1);
    await choisir('Désactiver');
    expect(wrapper.emitted('action')[0][0]).toBe('status:off');
  });

  it('demande confirmation avant d’émettre, et n’émet pas si on annule', async () => {
    const wrapper = factory();
    await selectAll(wrapper);
    await wrapper.findAll('.bulk-bar button')[2].trigger('click');
    await nextTick();
    expect(wrapper.emitted('action')).toBeUndefined();
    expect(document.body.textContent).toContain('Supprimer 3 ?');
    const cancel = [...document.body.querySelectorAll('.confirm-modal button')].find((node) => node.textContent.trim() === 'Annuler');
    cancel.click();
    await nextTick();
    await nextTick();
    expect(wrapper.emitted('action')).toBeUndefined();
  });

  it('émet après confirmation', async () => {
    const wrapper = factory();
    await selectAll(wrapper);
    await wrapper.findAll('.bulk-bar button')[2].trigger('click');
    await nextTick();
    const confirm = [...document.body.querySelectorAll('.confirm-modal button')].find((node) => node.textContent.trim() === 'Supprimer');
    confirm.click();
    await vi.waitFor(() => expect(wrapper.emitted('action')?.[0]?.[0]).toBe('delete'));
  });

  it('montre deux actions de ligne, le reste dans « … », nommées d’après la ligne', async () => {
    const wrapper = factory();
    const first = wrapper.find('tbody tr');
    const labels = first.findAll('.control-table__actions > button').map((node) => node.attributes('aria-label'));
    expect(labels).toEqual(['Modifier Alice', 'Désactiver Alice', 'Plus d’actions pour Alice']);
    await ouvrir(first.find('button[aria-label="Plus d’actions pour Alice"]'));
    expect(items()).toEqual(['Retirer']);
    await choisir('Retirer');
    expect(wrapper.emitted('action')[0]).toEqual(['remove', [rows[0]]]);
  });

  it('émet une action de ligne sans la sélectionner', async () => {
    const wrapper = factory();
    await wrapper.find('tbody tr button[aria-label="Activer Bruno"]').trigger('click');
    expect(wrapper.emitted('action')[0]).toEqual(['toggle', [rows[1]]]);
    expect(wrapper.emitted('open')).toBeUndefined();
    expect(wrapper.find('.bulk-bar').exists()).toBe(false);
  });

  it('ouvre la ligne au clic, sauf sur ses boutons', async () => {
    const wrapper = factory();
    await wrapper.find('tbody tr').trigger('click');
    expect(wrapper.emitted('open')[0][0]).toEqual(rows[0]);
    await wrapper.find('tbody tr button[aria-label="Modifier Alice"]').trigger('click');
    expect(wrapper.emitted('open')).toHaveLength(1);
  });

  it('transmet les cellules de la page et retire de la sélection une ligne disparue', async () => {
    const wrapper = factory();
    expect(wrapper.findAll('.who').map((node) => node.text())).toEqual(['Alice', 'Bruno', 'Chloé']);
    await selectAll(wrapper);
    await wrapper.setProps({ rows: rows.slice(0, 1) });
    expect(wrapper.find('.bulk-bar').text()).toContain('1 ');
  });
});
