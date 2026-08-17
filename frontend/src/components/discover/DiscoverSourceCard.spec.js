import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import DiscoverSourceCard from './DiscoverSourceCard.vue';

const PROVIDER = { id: 8, name: 'Netflix', kind: 'provider', logo_url: '/logo/netflix.svg' };
const COMPANY  = { id: 41077, name: 'A24', kind: 'company', logo_url: '/logo/a24.svg' };
const DARK_LOGOS = [
  { id: 1, name: 'Studio Ghibli', kind: 'company', logo_url: '/logo/ghibli.svg' },
  { id: 2, name: 'AMC Networks', kind: 'network', logo_url: '/logo/amc.svg' },
  { id: 3, name: 'Columbia Pictures', kind: 'company', logo_url: '/logo/columbia.svg' },
  { id: 4, name: 'Universal Pictures', kind: 'company', logo_url: '/logo/universal.svg' },
  { id: 5, name: 'Warner Bros.', kind: 'company', logo_url: '/logo/warner.svg' },
];

function mountCard(source = PROVIDER, to = '/discover/source/provider/8') {
  return mount(DiscoverSourceCard, {
    props: { source, to },
    global: {
      stubs: {
        RouterLink: {
          props: ['to'],
          template: '<a :href="to" v-bind="$attrs"><slot /></a>',
        },
      },
    },
  });
}

describe('DiscoverSourceCard', () => {
  it('rend le nom et le lien de la source', () => {
    const wrapper = mountCard();
    expect(wrapper.get('a').attributes('aria-label')).toContain('Netflix');
    expect(wrapper.get('.source-caption').text()).toBe('Netflix');
  });

  it('affiche le logo quand logo_url est fourni', () => {
    const wrapper = mountCard();
    expect(wrapper.find('img').exists()).toBe(true);
    expect(wrapper.find('img').attributes('alt')).toBe('Netflix');
    expect(wrapper.find('.source-fallback-badge').exists()).toBe(false);
  });

  it('charge les logos TMDB via le cache local optimise', () => {
    const logoUrl = 'https://image.tmdb.org/t/p/w154/netflix.jpg';
    const wrapper = mountCard({ ...PROVIDER, logo_url: logoUrl });
    expect(wrapper.get('img').attributes('src')).toBe(
      `/api/image-proxy?url=${encodeURIComponent(logoUrl)}&width=192&quality=88&format=webp`,
    );
  });

  it('affiche le fallback avec initiales quand pas de logo', () => {
    const source = { ...PROVIDER, logo_url: null };
    const wrapper = mountCard(source);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.source-fallback-badge').exists()).toBe(true);
    expect(wrapper.get('.source-fallback-initials').text()).toBe('NE');
  });

  it('applique kind-provider sur le logo-wrapper pour les plateformes SVOD', () => {
    const wrapper = mountCard(PROVIDER);
    expect(wrapper.get('.logo-wrapper').classes()).toContain('kind-provider');
  });

  it('applique kind-company pour les studios', () => {
    const wrapper = mountCard(COMPANY);
    expect(wrapper.get('.logo-wrapper').classes()).toContain('kind-company');
  });

  it('le logo-wrapper a la classe has-image quand le logo est charge', () => {
    const wrapper = mountCard();
    expect(wrapper.get('.logo-wrapper').classes()).toContain('has-image');
  });

  it('bascule vers le fallback apres erreur de chargement du logo', async () => {
    const wrapper = mountCard();
    await wrapper.get('img').trigger('error');
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('.source-fallback-badge').exists()).toBe(true);
  });

  // Regression: focus ring must not use outline+outline-offset on .logo-wrapper
  // (child of overflow-x:auto scroll container) -- first card gets clipped by the
  // scrollport boundary. Fix: use box-shadow instead. This test guards the intent.
  it('logo-wrapper ne porte pas d outline inline au focus (regression clipping)', () => {
    const wrapper = mountCard();
    const style = wrapper.get('.logo-wrapper').attributes('style') ?? '';
    expect(style).not.toMatch(/outline/);
  });

  // Dark logos (black on transparent from TMDB) must be inverted to white.
  it.each(DARK_LOGOS)(
    'applique is-dark-logo pour $name ($kind)',
    (source) => {
      const wrapper = mountCard(source);
      const img = wrapper.find('img');
      expect(img.exists()).toBe(true);
      expect(img.classes()).toContain('is-dark-logo');
    },
  );

  it('n applique pas is-dark-logo sur un provider SVOD (logo en couleur)', () => {
    const wrapper = mountCard(PROVIDER);
    expect(wrapper.get('img').classes()).not.toContain('is-dark-logo');
  });

  // Regression: dark logo captions are hidden (logo seul suffit a identifier le studio)
  it('masque la legende pour les logos isDarkLogo', () => {
    const ghibli = { id: 1, name: 'Studio Ghibli', kind: 'company', logo_url: '/logo/ghibli.svg' };
    const wrapper = mountCard(ghibli);
    expect(wrapper.find('.source-caption').exists()).toBe(false);
  });

  it('affiche la legende pour les logos non isDarkLogo (providers SVOD)', () => {
    const wrapper = mountCard(PROVIDER);
    expect(wrapper.get('.source-caption').text()).toBe('Netflix');
  });

  it('calcule les initiales pour un nom compose (Studio Ghibli -> SG)', () => {
    const source = { id: 99, name: 'Studio Ghibli', kind: 'company', logo_url: null };
    const wrapper = mountCard(source);
    expect(wrapper.get('.source-fallback-initials').text()).toBe('SG');
  });

  it('calcule les initiales pour un nom simple (A24 -> A2)', () => {
    const source = { id: 99, name: 'A24', kind: 'company', logo_url: null };
    const wrapper = mountCard(source);
    expect(wrapper.get('.source-fallback-initials').text()).toBe('A2');
  });
});
