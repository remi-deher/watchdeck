import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiTimeField from './UiTimeField.vue';

const segments = (w) => w.findAll('[role="spinbutton"]');

describe('UiTimeField', () => {
  it('affiche heures et minutes sur 24 h, avec des noms francais', () => {
    const w = mount(UiTimeField, { props: { hour: 18, minute: 5, ariaLabel: 'Heure du digest' } });
    expect(w.find('[role="group"]').attributes('aria-label')).toBe('Heure du digest');
    expect(segments(w).map((s) => s.text())).toEqual(['18', '05']);
    expect(segments(w).map((s) => s.attributes('aria-label'))).toEqual(['Heures', 'Minutes']);
  });

  it('regle l heure aux fleches et emet la nouvelle heure seule', async () => {
    const w = mount(UiTimeField, { props: { hour: 23, minute: 30 } });
    await segments(w)[0].trigger('keydown', { key: 'ArrowUp' });
    expect(w.emitted('update:hour')).toEqual([[0]]);
    expect(w.emitted('update:minute')).toBeUndefined();
  });

  it('sans minutes, ne montre que l heure', () => {
    const w = mount(UiTimeField, { props: { hour: 3, withMinutes: false } });
    expect(segments(w).map((s) => s.attributes('aria-label'))).toEqual(['Heures']);
  });
});
