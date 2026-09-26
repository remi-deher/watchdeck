import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import RequestTrackingCard from './RequestTrackingCard.vue';

const ilYA = (jours) => new Date(Date.now() - jours * 86_400_000).toISOString();

function carte(item, props = {}) {
  return mount(RequestTrackingCard, {
    props: { item: { id: 1, title: 'Rebuilding', media_type: 'show', year: 2025, requested_by: 'Illan', ...item }, ...props },
    global: { stubs: { MediaPoster: true } },
  });
}

describe('RequestTrackingCard', () => {
  it('dit pourquoi la demande attend, et signale un blocage de plus de 7 jours', () => {
    const wrapper = carte({ tracking: { kind: 'not_found', label: 'Sortie, mais aucune version trouvée', since: ilYA(90) } });
    expect(wrapper.find('.rt-motif').text()).toBe('Sortie, mais aucune version trouvée');
    expect(wrapper.find('.rt-age').text()).toBe('depuis 3 mois');
    expect(wrapper.find('article').classes()).toContain('is-late');
    expect(wrapper.find('.rt-meta').text()).toBe('Série · 2025 · demandé par Illan');
  });

  it('montre la progression du telechargement', () => {
    const wrapper = carte({ tracking: { kind: 'downloading', label: 'Téléchargement en cours', since: ilYA(1), download: { progress: 64, timeleft: '00:12:00' } } });
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('64');
    expect(wrapper.find('.rt-detail').text()).toBe('64 % · encore 12:00');
    expect(wrapper.find('article').classes()).not.toContain('is-late');
  });

  it('decompte les episodes d\'une serie en cours', () => {
    const wrapper = carte({
      tracking: { kind: 'unreleased', label: 'Pas encore sorti', since: ilYA(35) },
      episodes_total_count: 12, episodes_available_count: 6, episodes_aired_count: 6,
    });
    expect(wrapper.findAll('.rt-episodes i')).toHaveLength(12);
    expect(wrapper.findAll('.rt-episodes i.ok')).toHaveLength(6);
    expect(wrapper.text()).toContain('6 / 12 épisodes disponibles');
  });

  it("n'offre les actions qu'aux moderateurs, selon le motif", async () => {
    const bloquee = { tracking: { kind: 'not_found', label: 'x', since: ilYA(10) } };
    expect(carte(bloquee).findAll('.rt-actions button')).toHaveLength(0);

    const wrapper = carte(bloquee, { canModerate: true });
    const libelles = wrapper.findAll('.rt-actions button').map((b) => b.text());
    expect(libelles).toEqual(['Recherche interactive', 'Relancer la recherche', 'Annuler…']);
    await wrapper.findAll('.rt-actions button')[0].trigger('click');
    expect(wrapper.emitted('act')[0][1]).toBe('interactive');

    const approbation = carte({ tracking: { kind: 'approval', label: 'x', since: ilYA(0.1) } }, { canModerate: true });
    expect(approbation.findAll('.rt-actions button').map((b) => b.text())).toEqual(['Approuver', 'Refuser…']);

    const vf = carte({
      tracking: null, vf_missing: true, episodes_total_count: 12, episodes_available_count: 12,
      lifecycle: [{ key: 'requested', label: 'Demandée', done: true }],
    }, { canModerate: true });
    // Deja disponible : ni barre d'episodes ni fil de vie, tout y serait coche.
    expect(vf.find('.rt-episodes').exists()).toBe(false);
    expect(vf.find('.rt-life').exists()).toBe(false);
    expect(vf.find('.rt-motif').text()).toBe('Disponible en VO · VF recherchée');
    expect(vf.findAll('.rt-actions button').map((b) => b.text())).toEqual(['Chercher une VF']);
  });

  it('affiche le fil de vie en quatre etapes', () => {
    const wrapper = carte({
      tracking: { kind: 'importing', label: 'x', since: ilYA(2) },
      lifecycle: [
        { key: 'requested', label: 'Demandée', done: true },
        { key: 'sent', label: 'Envoyée', done: true },
        { key: 'downloaded', label: 'Téléchargée', done: true },
        { key: 'available', label: 'Disponible', done: false },
      ],
    });
    expect(wrapper.findAll('.rt-life li.done')).toHaveLength(3);
  });
});
