import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';

import MediaRequestsTab from './MediaRequestsTab.vue';

const row = {
  id: 42,
  media_type: 'movie',
  status: 'failed',
  operational_status: 'failed',
  requested_by: 'Alice',
  requester_ids: ['alice'],
  requesters: ['Alice'],
};

function render(admin, props = {}) {
  return mount(MediaRequestsTab, {
    props: { admin, requests: [row], detail: {}, ...props },
    global: {
      stubs: {
        RequestStatusStepper: true,
        RequestMailHistory: true,
      },
    },
  });
}

const buttonByText = (wrapper, text) => wrapper.findAll('button').find((button) => button.text().includes(text));

describe('MediaRequestsTab', () => {
  it('ne montre aucune commande technique aux utilisateurs ordinaires', () => {
    const wrapper = render(false);

    expect(wrapper.find('.request-admin-actions').exists()).toBe(false);
    expect(buttonByText(wrapper, 'Relancer')).toBeUndefined();
    expect(wrapper.find('form.add-requester').exists()).toBe(false);
  });

  it('affiche la carte Administration toujours dépliée, avec des libellés', async () => {
    const wrapper = render(true);

    const admin = wrapper.find('.request-admin-actions');
    expect(admin.exists()).toBe(true);
    expect(admin.find('.collapsible-trigger').exists()).toBe(false);
    expect(admin.text()).toContain('Mails à tous les demandeurs');
    expect(admin.text()).toContain('Rapprochement des imports bloqués');

    await buttonByText(wrapper, 'Relancer').trigger('click');
    expect(wrapper.emitted('retry')).toEqual([[42]]);
    await buttonByText(wrapper, 'Renvoyer le mail de demande').trigger('click');
    expect(wrapper.emitted('resend-mail')).toEqual([[42, 'request']]);
    await buttonByText(wrapper, 'Annuler la demande').trigger('click');
    expect(wrapper.emitted('withdraw-request')[0][0]).toMatchObject({ id: 42 });
  });

  it("n'affiche plus l'ancien bloc « Et ensuite ? »", () => {
    expect(render(true).text()).not.toContain('Et ensuite');
  });

  it('montre le parcours en une phrase avec ses badges', () => {
    const wrapper = render(false);
    expect(wrapper.find('.journey-title').text()).toBe('Traitement en erreur');
    expect(wrapper.find('.journey-badges').text()).toContain('Demande utilisateur');
  });

  it('ajoute une personne depuis le formulaire de la carte Demandeurs', async () => {
    const wrapper = render(true, { newRequesterId: 'paul', addableUsers: [{ plex_user_id: 'paul', display_name: 'Paul' }] });
    const form = wrapper.find('form.add-requester');
    expect(form.text()).toContain('Aucun mail ne part sans confirmation');
    await form.trigger('submit');
    expect(wrapper.emitted('add-requester')).toHaveLength(1);
  });

  it('sans demande : carte « Personne n’a demandé » avec formulaire pour un admin', () => {
    const detail = { in_library: true, arr_id: 3, media_type: 'movie' };
    const admin = render(true, { requests: [], detail });
    expect(admin.find('.journey-title').text()).toBe('Ajouté directement dans Radarr');
    expect(admin.find('.nobody-card').text()).toContain("Personne n'a demandé ce film");
    expect(admin.find('.nobody-card form').exists()).toBe(true);

    const viewer = render(false, { requests: [], detail });
    expect(viewer.find('.nobody-card').exists()).toBe(true);
    expect(viewer.find('.nobody-card form').exists()).toBe(false);
  });
});
