import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { AvatarImage } from 'reka-ui';
import UiAvatar from './UiAvatar.vue';
import UiClientIdentity from './UiClientIdentity.vue';
import LiveStrip from './LiveStrip.vue';

describe('identités complètes', () => {
  it('déduit l’avatar et les initiales de la personne', () => {
    const w = mount(UiAvatar, { props: { person: { display_name: 'Jean Picard', avatar_url: '/avatar.jpg', enabled: false } } });
    expect(w.getComponent(AvatarImage).props('src')).toBe('/avatar.jpg');
    expect(w.classes()).toContain('is-off');
    const withoutImage = mount(UiAvatar, { props: { person: { user_name: 'Jean Picard' } } });
    expect(withoutImage.text()).toBe('JP');
  });
  it('conserve les propriétés explicites prioritaires', () => {
    const w = mount(UiAvatar, { props: { person: { avatar_url: '/old.jpg', display_name: 'Jean' }, src: '/override.jpg' } });
    expect(w.getComponent(AvatarImage).props('src')).toBe('/override.jpg');
  });
  it('déduit le nom et le type du lecteur', async () => {
    const w = mount(UiClientIdentity, { props: { client: { player: 'Salon', platform: 'Apple TV' } } });
    expect(w.text()).toBe('Salon');
    expect(w.find('svg').classes().join(' ')).toContain('tv');
    await w.setProps({ client: { platform: 'iPad' }, showLabel: false });
    expect(w.attributes('aria-label')).toBe('iPad');
    expect(w.find('svg').classes().join(' ')).toContain('tablet');
  });
  it('le bandeau reçoit la personne et le client sans recopier leurs champs', () => {
    const w = mount(LiveStrip, { props: { title: 'Lecture', items: [{ key: '1', title: 'Dune', person: { user_name: 'Alice' }, client: { player: 'Salon' } }], idle: { title: 'Rien' } } });
    expect(w.text()).toContain('Alice · Salon');
  });
});
