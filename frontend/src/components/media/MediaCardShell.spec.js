import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaCardShell from './MediaCardShell.vue';

/* Au doigt, Safari envoie pointerdown (touch), puis un survol simule (mouseenter),
   puis le clic. La carte ne doit s'ouvrir qu'au second appui : le premier la revele. */
function tap(wrap) {
  const down = new Event('pointerdown', { bubbles: true });
  Object.defineProperty(down, 'pointerType', { value: 'touch' });
  wrap.element.dispatchEvent(down);
  wrap.element.dispatchEvent(new Event('mouseenter'));
  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  wrap.element.querySelector('.cible').dispatchEvent(click);
  return click;
}

describe('MediaCardShell', () => {
  it('revele au premier appui tactile et ouvre au second, malgre le survol simule', async () => {
    const wrapper = mount(MediaCardShell, { slots: { default: '<div class="cible">affiche</div>' } });
    const wrap = wrapper.find('.poster-wrap');

    const premier = tap(wrap);
    await wrapper.vm.$nextTick();
    expect(premier.defaultPrevented, 'le premier appui ne doit pas ouvrir').toBe(true);
    expect(wrap.classes()).toContain('revealed');

    const second = tap(wrap);
    expect(second.defaultPrevented, 'le second appui ouvre la fiche').toBe(false);
  });

  it('ouvre au second appui meme si le navigateur a supprime le clic du premier', async () => {
    // Chromium (et Safari) annulent le clic quand le survol simule change la page :
    // le premier appui ne revele alors la carte que par le focus.
    const wrapper = mount(MediaCardShell, { slots: { default: '<div class="cible">affiche</div>' } });
    const wrap = wrapper.find('.poster-wrap');
    const down = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(down, 'pointerType', { value: 'touch' });
    wrap.element.dispatchEvent(down);
    wrap.element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrap.classes()).toContain('revealed');

    const second = tap(wrap);
    expect(second.defaultPrevented, 'le second appui ouvre la fiche').toBe(false);
  });

  it('laisse le clic ouvrir directement a la souris', () => {
    const wrapper = mount(MediaCardShell, { slots: { default: '<div class="cible">affiche</div>' } });
    const wrap = wrapper.find('.poster-wrap');
    const down = new Event('pointerdown', { bubbles: true });
    Object.defineProperty(down, 'pointerType', { value: 'mouse' });
    wrap.element.dispatchEvent(down);
    wrap.element.dispatchEvent(new Event('mouseenter'));
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    wrap.element.querySelector('.cible').dispatchEvent(click);
    expect(click.defaultPrevented).toBe(false);
  });
});
