import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiHeroBackdrop from './UiHeroBackdrop.vue';

describe('UiHeroBackdrop', () => {
  it('rend le fond et les deux zones de contenu', () => {
    const wrapper = mount(UiHeroBackdrop, {
      props: { imageUrl: '/hero.jpg', position: 'center top', minHeight: '20rem' },
      slots: { default: '<p>Contenu</p>', overlay: '<button>Retour</button>' },
    });

    expect(wrapper.classes()).toContain('theme-dark-scope');
    expect(wrapper.classes()).toContain('is-card');
    expect(wrapper.attributes('style')).toContain('min-height: 20rem');
    expect(wrapper.get('.ui-hero-backdrop__image').attributes('style')).toContain('background-image: url("/hero.jpg")');
    expect(wrapper.get('.ui-hero-backdrop__image').attributes('style')).toContain('background-position: center top');
    expect(wrapper.get('.ui-hero-backdrop__content').text()).toBe('Contenu');
    expect(wrapper.get('.ui-hero-backdrop__overlay').text()).toBe('Retour');
  });

  it('expose les variantes sheet et zoom', () => {
    const wrapper = mount(UiHeroBackdrop, { props: { variant: 'sheet', zoomOnHover: true } });

    expect(wrapper.classes()).toContain('is-sheet');
    expect(wrapper.classes()).toContain('is-zoomable');
    expect(wrapper.classes()).not.toContain('is-card');
  });
});
