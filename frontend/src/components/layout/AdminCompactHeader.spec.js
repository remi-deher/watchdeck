import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { describe, expect, it } from 'vitest';
import AdminCompactHeader from './AdminCompactHeader.vue';

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:p(.*)*', component: { render: () => null } }],
});

const mountHeader = (props) => mount(AdminCompactHeader, { props, global: { plugins: [router] } });

describe('AdminCompactHeader', () => {
  it('quitte l’espace depuis l’aperçu, vers la dernière page de l’application', () => {
    const wrapper = mountHeader({ title: 'Administration', overview: true, appPath: '/library?type=movie' });
    const back = wrapper.get('a');
    expect(back.attributes('href')).toBe('/library?type=movie');
    expect(back.attributes('aria-label')).toBe('Retour à Watchdeck');
    expect(back.text()).toBe('Watchdeck');
    expect(wrapper.get('.admin-header__title').text()).toBe('Administration');
  });

  it('remonte d’un niveau, vers l’aperçu, depuis une zone', () => {
    const wrapper = mountHeader({ title: 'Sécurité & API', appPath: '/library' });
    const back = wrapper.get('a');
    expect(back.attributes('href')).toBe('/settings');
    expect(back.attributes('aria-label')).toBe('Retour à l’aperçu de l’administration');
    // Dans une zone la flèche suffit : le titre garde toute la largeur.
    expect(back.text()).toBe('');
    expect(wrapper.get('.admin-header__title').text()).toBe('Sécurité & API');
  });

  it('retombe sur la racine sans dernière page connue', () => {
    expect(mountHeader({ title: 'Administration', overview: true }).get('a').attributes('href')).toBe('/');
  });

  it('ne double pas le titre de la page pour les lecteurs d’écran', () => {
    // Le h1 est porté par AppPage : l'en-tête n'en est que l'écho visuel.
    const wrapper = mountHeader({ title: 'Notifications' });
    expect(wrapper.find('h1').exists()).toBe(false);
    expect(wrapper.get('.admin-header__title').attributes('aria-hidden')).toBe('true');
  });
});
