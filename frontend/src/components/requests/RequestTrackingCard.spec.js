import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import RequestTrackingCard from './RequestTrackingCard.vue';

const ilYA = (jours) => new Date(Date.now() - jours * 86_400_000).toISOString();

function carte(item, props = {}) {
  return mount(RequestTrackingCard, {
    props: { item: { id: 1, title: 'Rebuilding', media_type: 'show', year: 2025, requested_by: 'Illan', ...item }, ...props },
    global: {
      stubs: {
        MediaPoster: true,
        // Le menu Reka se teleporte a l'ouverture : rendu a plat, ses entrees se lisent.
        UiMenu: { template: '<div class="menu-stub"><slot name="trigger" /><slot /></div>' },
        UiMenuItem: { emits: ['select'], template: '<button type="button" class="menu-item" @click="$emit(\'select\')"><slot /></button>' },
      },
    },
  });
}

describe('RequestTrackingCard', () => {
  it('dit pourquoi la demande attend, et signale un blocage de plus de 7 jours', () => {
    const wrapper = carte({ tracking: { kind: 'not_found', label: 'Sortie, mais aucune version trouvée', since: ilYA(90) } });
    // Pastille courte sur l'affiche, libelle complet en infobulle.
    expect(wrapper.find('.rt-motif').text()).toBe('Introuvable');
    expect(wrapper.find('.rt-motif').attributes('title')).toBe('Sortie, mais aucune version trouvée');
    expect(wrapper.find('.rt-age').text()).toBe('3 mois');
    expect(wrapper.find('article').classes()).toContain('is-late');
    expect(wrapper.find('.rt-meta').text()).toBe('Série · 2025 · demandé par Illan');
  });

  it('montre la progression du telechargement', () => {
    const wrapper = carte({ tracking: { kind: 'downloading', label: 'Téléchargement en cours', since: ilYA(1), download: { progress: 64, timeleft: '00:12:00' } } });
    expect(wrapper.find('[role="progressbar"]').attributes('aria-valuenow')).toBe('64');
    expect(wrapper.find('.rt-foot-text').text()).toBe('64 % · encore 12:00');
    expect(wrapper.find('article').classes()).not.toContain('is-late');
  });

  it('decompte les episodes d\'une serie en cours', () => {
    const wrapper = carte({
      tracking: { kind: 'unreleased', label: 'Pas encore sorti', since: ilYA(35) },
      episodes_total_count: 12, episodes_available_count: 6, episodes_aired_count: 6,
    });
    expect(wrapper.findAll('.rt-episodes i')).toHaveLength(12);
    expect(wrapper.findAll('.rt-episodes i.ok')).toHaveLength(6);
    expect(wrapper.find('.rt-foot-text').text()).toBe('6/12 épisodes');
  });

  it("n'offre les actions qu'aux moderateurs, selon le motif", async () => {
    const bloquee = { tracking: { kind: 'not_found', label: 'x', since: ilYA(10) } };
    expect(carte(bloquee).findAll('.rt-actions button')).toHaveLength(0);

    const wrapper = carte(bloquee, { canModerate: true });
    // Une action principale visible, les autres dans le menu « Autres actions ».
    expect(wrapper.find('.rt-main-action .rt-label-long').text()).toBe('Recherche interactive');
    // Libelle court pour les cartes etroites, nom complet garde pour les lecteurs d'ecran.
    expect(wrapper.find('.rt-main-action .rt-label-short').text()).toBe('Rechercher');
    expect(wrapper.find('.rt-main-action').attributes('aria-label')).toBe('Recherche interactive');
    expect(wrapper.findAll('.menu-item').map((b) => b.text())).toEqual(['Relancer la recherche', 'Annuler…']);
    await wrapper.find('.rt-main-action').trigger('click');
    expect(wrapper.emitted('act')[0][1]).toBe('interactive');
    await wrapper.findAll('.menu-item')[1].trigger('click');
    expect(wrapper.emitted('act')[1][1]).toBe('withdraw');

    const approbation = carte({ tracking: { kind: 'approval', label: 'x', since: ilYA(0.1) } }, { canModerate: true });
    expect(approbation.find('.rt-main-action').text()).toBe('Approuver');
    expect(approbation.findAll('.menu-item').map((b) => b.text())).toEqual(['Refuser…']);

    const vf = carte({
      tracking: null, vf_missing: true, episodes_total_count: 12, episodes_available_count: 12,
      lifecycle: [{ key: 'requested', label: 'Demandée', done: true }],
    }, { canModerate: true });
    // Deja disponible : ni barre d'episodes ni fil de vie, tout y serait coche.
    expect(vf.find('.rt-episodes').exists()).toBe(false);
    expect(vf.find('.rt-life').exists()).toBe(false);
    expect(vf.find('.rt-motif').text()).toBe('VF manquante');
    expect(vf.find('.rt-motif').attributes('title')).toBe('Disponible en VO · VF recherchée');
    expect(vf.find('.rt-main-action').text()).toBe('Chercher une VF');
    // Une seule action : pas de menu.
    expect(vf.find('.menu-stub').exists()).toBe(false);
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
    expect(wrapper.find('.rt-life').attributes('aria-label')).toBe('Étape 3 sur 4 : Téléchargée');
  });

  it("donne la raison d'un echec et la date d'une sortie a venir", () => {
    const echec = carte({ tracking: { kind: 'failed', label: 'Échec du traitement', since: ilYA(2) }, fulfillment_error: 'Profil de qualité introuvable' });
    expect(echec.find('.rt-note').text()).toBe('Profil de qualité introuvable');

    const film = { media_type: 'movie' };
    const sortie = carte({ ...film, tracking: { kind: 'unreleased', label: 'Pas encore sorti · sortie le 14 oct.', since: ilYA(5) } });
    expect(sortie.find('.rt-foot-text').text()).toBe('sortie le 14 oct.');
    expect(sortie.find('.rt-note').exists()).toBe(false);
  });
});

it('lit le motif et les étapes du parcours entier plutôt que les fragments historiques', () => {
  const wrapper = carte({ tracking: null, lifecycle: [{ key: 'plex', done: true }],
    journey: { tracking: { kind: 'importing', label: 'Présence Plex à confirmer' },
      steps: [{ key: 'submitted', label: 'Transmis', state: 'completed' }, { key: 'plex', label: 'Plex', state: 'current' }] } });
  expect(wrapper.find('.rt-motif').attributes('title')).toBe('Présence Plex à confirmer');
  expect(wrapper.findAll('.rt-life li')).toHaveLength(2);
  expect(wrapper.findAll('.rt-life .done')).toHaveLength(1);
});
