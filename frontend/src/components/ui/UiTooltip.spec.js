import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import UiButton from './UiButton.vue';
import UiTooltip from './UiTooltip.vue';

afterEach(() => { document.body.innerHTML = ''; });

describe('UiTooltip', () => {
  it('sans texte, ne rend que l element', () => {
    const w = mount(UiTooltip, { props: { text: '' }, slots: { default: '<span class="badge">HDR</span>' } });
    expect(w.findAll('.badge')).toHaveLength(1);
    expect(w.find('.badge').attributes('tabindex')).toBeUndefined();
  });

  it('rend une pastille tabulable, sans title natif', () => {
    const w = mount(UiTooltip, { props: { text: 'Note TMDB/Plex' }, slots: { default: '<span class="badge">7,5</span>' } });
    const badge = w.find('.badge');
    expect(badge.attributes('tabindex')).toBe('0');
    expect(badge.attributes('title')).toBeUndefined();
  });

  it('laisse le parcours clavier intact quand focusable vaut false', () => {
    const w = mount(UiTooltip, { props: { text: 'Relais', focusable: false }, slots: { default: '<span class="badge">R</span>' } });
    expect(w.find('.badge').attributes('tabindex')).toBeUndefined();
  });

  it('s affiche au survol', async () => {
    const w = mount(UiTooltip, { props: { text: 'Débit limité', delay: 0 }, slots: { default: '<span class="badge">Relais</span>' }, attachTo: document.body });
    await w.find('.badge').trigger('pointermove', { pointerType: 'mouse' });
    await new Promise((r) => setTimeout(r, 0));
    const bulle = document.body.querySelector('.ui-tooltip');
    expect(bulle?.textContent).toContain('Débit limité');
    w.unmount();
  });

  it('sert d infobulle aux boutons-icones de UiButton', () => {
    const w = mount(UiButton, { props: { iconOnly: true }, attrs: { title: 'Fermer' }, slots: { default: '<svg />' } });
    const button = w.find('button');
    expect(button.attributes('aria-label')).toBe('Fermer');
    expect(button.attributes('title')).toBeUndefined();
    expect(button.attributes('tabindex')).toBeUndefined();
  });
});
