import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import UiAvatar from './UiAvatar.vue';

describe('UiAvatar', () => {
  it('tire les initiales du nom sans image', () => {
    const w = mount(UiAvatar, { props: { name: 'Jean-Luc Picard' } });
    expect(w.text()).toBe('JL');
    expect(w.attributes('aria-hidden')).toBe('true');
    expect(w.classes()).toEqual(expect.arrayContaining(['ui-avatar', 'ui-avatar--md', 'ui-avatar--neutral']));
  });

  it('prefere des initiales fournies, et grise un compte desactive', () => {
    const w = mount(UiAvatar, { props: { name: 'Alice', initials: 'AZ', off: true, size: 'lg', tone: 'accent' } });
    expect(w.text()).toBe('AZ');
    expect(w.classes()).toEqual(expect.arrayContaining(['is-off', 'ui-avatar--lg', 'ui-avatar--accent']));
  });

  it('garde la classe du parent sur sa racine', () => {
    const w = mount(UiAvatar, { props: { name: 'bob' }, attrs: { class: 'live-avatar' } });
    expect(w.classes()).toContain('live-avatar');
    expect(w.text()).toBe('BO');
  });
});
