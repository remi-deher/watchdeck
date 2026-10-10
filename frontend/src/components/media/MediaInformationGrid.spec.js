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
