import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { VueQueryPlugin } from '@tanstack/vue-query';

import { api } from '@/api';
import { createQueryClient } from '@/queryClient';
import { form } from '@/settingsForm';

import VfSettingsPanel from './VfSettingsPanel.vue';

vi.mock('@/api', () => ({ api: vi.fn() }));

/* La modale doit rester synchronisée avec la page Réglages. Ce n'est pas une recopie de
   champs : elle monte le composant de cet onglet sur le même store et enregistre par le
   même endpoint. Ces tests verrouillent les trois propriétés qui font la synchro. */
// Le premier montage du formulaire VF complet est lourd : sous la charge de la suite
// entiere, il depassait les 5 s par defaut. La marge ne masque rien -- chaque test verifie
// un comportement, pas une duree.
vi.setConfig({ testTimeout: 20_000 });

describe('VfSettingsPanel', () => {
  // save() importe le schéma Zod à la demande : sa première compilation peut dépasser
  // le délai du test quand les workers sont chargés. On la paie une fois, ici.
  beforeAll(async () => { await import('@/settingsSchema'); }, 30_000);

  beforeEach(() => {
    api.mockReset();
    form.vf_upgrade_min_confidence = 65;
    form.vf_upgrade_protect_resolution = true;
  });

  function button(wrapper, label) {
    const found = wrapper.findAll('button').find((b) => b.text().includes(label));
    if (!found) throw new Error(`Bouton « ${label} » absent : ${JSON.stringify(wrapper.findAll('button').map((b) => b.text()))}`);
    return found;
  }

  async function openModal(serverState = {}) {
    api.mockResolvedValueOnce({ vf_upgrade_min_confidence: 65, vf_upgrade_protect_resolution: true, ...serverState });
    const wrapper = mount(VfSettingsPanel, {
      global: {
        plugins: [[VueQueryPlugin, { queryClient: createQueryClient() }]],

      },
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    return wrapper;
  }

  it('reloads the server state on open rather than trusting the shared store', async () => {
    /* Le store est un singleton partagé avec la page Réglages : la valeur en base a pu
       changer depuis (autre onglet, autre administrateur). */
    form.vf_upgrade_min_confidence = 10;
    await openModal({ vf_upgrade_min_confidence: 90 });

    expect(api).toHaveBeenCalledWith('/api/settings');
    expect(form.vf_upgrade_min_confidence).toBe(90);
  });

  it('sends only the fields it changed, so other settings sections are not clobbered', async () => {
    const wrapper = await openModal();
    form.vf_upgrade_min_confidence = 80;
    // Le bouton est `:disabled="!isDirty"` : il faut laisser Vue propager la
    // modification du store avant de cliquer, sinon le clic est simplement ignoré.
    await wrapper.vm.$nextTick();
    api.mockResolvedValueOnce({});

    await button(wrapper, 'Enregistrer').trigger('click');
    // save() charge le schéma Zod à la demande avant le PUT : un seul tick ne suffit pas.
    const call = await vi.waitFor(() => {
      const found = api.mock.calls.find(([, init]) => init?.method === 'PUT');
      if (!found) throw new Error('PUT non envoyé');
      return found;
    });
    expect(JSON.parse(call[1].body)).toEqual({ vf_upgrade_min_confidence: 80 });
  });

  it('discards unsaved edits on close, leaving no residue in the shared store', async () => {
    /* Sans cela, une valeur saisie puis abandonnée survivrait dans le store et
       repartirait au prochain enregistrement d'une autre section. */
    const wrapper = await openModal();
    form.vf_upgrade_protect_resolution = false;
    await wrapper.vm.$nextTick();

    // Le libellé passe de « Fermer » à « Annuler » dès qu'il y a du non-enregistré.
    await button(wrapper, 'Annuler').trigger('click');

    expect(form.vf_upgrade_protect_resolution).toBe(true);
    expect(wrapper.emitted('close')).toHaveLength(1);
    expect(api.mock.calls.filter(([, init]) => init?.method === 'PUT')).toHaveLength(0);
  });
});
