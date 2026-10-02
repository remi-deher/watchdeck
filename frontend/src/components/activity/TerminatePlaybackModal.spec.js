import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/* Pas de vi.fn pour les échecs : l'espion garde une promesse dérivée de son résultat,
   non gérée, et fait échouer le test quand l'appel rejette alors que le composant l'a
   bien interceptée. Une simple fonction enregistre les appels sans cet effet. */
const calls = [];
let reply = async () => ({});
const api = {
  mockReset() { calls.length = 0; reply = async () => ({}); },
  mockResolvedValue(value) { reply = async () => value; },
  mockImplementation(fn) { reply = fn; },
};
vi.mock('@/api', () => ({ api: (...args) => { calls.push(args); return reply(...args); } }));

import TerminatePlaybackModal from './TerminatePlaybackModal.vue';

const ModalStub = { props: ['open', 'error'], template: '<div><slot /><slot name="actions" /><p class="err">{{ error }}</p></div>' };

function factory() {
  return mount(TerminatePlaybackModal, { props: { open: true, sessionId: 12 }, global: { stubs: { ModalShell: ModalStub } } });
}

describe('TerminatePlaybackModal', () => {
  beforeEach(() => api.mockReset());

  it('envoie le message saisi et signale l’arrêt', async () => {
    api.mockResolvedValue({ status: 'terminated' });
    const wrapper = factory();
    await wrapper.get('textarea').setValue('Maintenance du serveur');
    await wrapper.findAll('button').at(-1).trigger('click');
    await flushPromises();
    expect(calls).toEqual([['/api/playback/sessions/12/terminate', { method: 'POST', body: JSON.stringify({ reason: 'Maintenance du serveur' }) }]]);
    expect(wrapper.emitted('terminated')).toBeTruthy();
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('affiche le refus de Plex sans fermer', async () => {
    api.mockImplementation(async () => { throw new Error('il faut un compte administrateur avec Plex Pass'); });
    const wrapper = factory();
    await wrapper.findAll('button').at(-1).trigger('click');
    await flushPromises();
    expect(wrapper.get('.err').text()).toContain('Plex Pass');
    expect(wrapper.emitted('close')).toBeFalsy();
  });
});
