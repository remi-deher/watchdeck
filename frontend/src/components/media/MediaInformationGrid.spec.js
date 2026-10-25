import { mount } from '@vue/test-utils';
import { expect, it } from 'vitest';
import MediaInformationGrid from './MediaInformationGrid.vue';

it('sépare la présence Plex et la couverture de fichiers ARR, sans transformer inconnu en zéro', () => {
  const wrapper = mount(MediaInformationGrid, { props: { detail: {
    title: 'Série', media_type: 'show', available: true, in_library: true,
    operational_status: 'completed', operational_status_label: 'Disponible dans Plex',
    availability: { plex: 'unknown', episodes: { state: 'unknown', available: null, aired: null }, languages: { has_vf: null } },
  } } });
  expect(wrapper.text()).toContain('À confirmer dans Plex');
  expect(wrapper.text()).toContain('Non confirmé');
  expect(wrapper.text()).toContain('? / ? diffusés');
  expect(wrapper.text()).not.toContain('0 / 0');
  expect(wrapper.text()).not.toContain('Disponible dans Plex');
});

it('affiche la prochaine étape métier du parcours même si le média est présent dans Plex', () => {
  const wrapper = mount(MediaInformationGrid, { props: { detail: { title: 'Série', media_type: 'show', in_library: true,
    journey: { label: 'Série partielle', origin: { label: 'Demande via Seerr' }, next_step: { label: 'Compléter les épisodes diffusés' } } } } });
  expect(wrapper.text()).toContain('Série partielle');
  expect(wrapper.text()).toContain('Compléter les épisodes diffusés');
  expect(wrapper.text()).not.toContain('Aucune action requise');
});

it('masque les cartes opérationnelles pour un média non demandé du catalogue découvrir', () => {
  const wrapper = mount(MediaInformationGrid, {
    props: {
      detail: {
        title: 'Film Découvrir',
        media_type: 'movie',
        directors: ['Jordan Downey'],
        production_countries: ['United States of America'],
        vote_count: 14,
        status: 'Released',
        requests: [],
        notification_history: [],
      },
    },
  });
  expect(wrapper.text()).toContain('Repères du média');
  expect(wrapper.text()).toContain('Jordan Downey');
  expect(wrapper.text()).not.toContain('État actuel');
  expect(wrapper.text()).not.toContain('Couverture');
  expect(wrapper.text()).not.toContain('Demandes');
  expect(wrapper.text()).not.toContain('Notifications');
  expect(wrapper.text()).not.toContain('Prochaines sorties');
});
