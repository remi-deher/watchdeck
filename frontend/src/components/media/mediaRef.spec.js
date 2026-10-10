import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaPosterCard from './MediaPosterCard.vue';
import MediaHeroBanner from './MediaHeroBanner.vue';
import MediaPoster from './MediaPoster.vue';
import UiHeroBackdrop from '@/components/ui/UiHeroBackdrop.vue';
import HandleRow from '@/components/templates/handle/HandleRow.vue';
const media = { id: 1, title: 'Dune', media_type: 'movie', poster_url: '/poster.jpg', backdrop_url: '/backdrop.jpg' };
const global = { stubs: { RouterLink: { template: '<a><slot /></a>' }, MediaStatusBadge: true } };
describe('MediaRef dans les composants communs', () => {
  it('la carte reçoit toutes les images du média', () => {
    const w = mount(MediaPosterCard, { props: { media }, global });
    expect(w.getComponent(MediaPoster).props()).toMatchObject({ posterUrl: media.poster_url, backdropUrl: media.backdrop_url });
    expect(w.get('img').attributes('src')).toContain('/poster.jpg');
    expect(w.get('.poster-shell').attributes('style')).toContain('/backdrop.jpg');
    w.unmount();
  });
  it('les images explicites priment', () => {
    const w = mount(MediaPosterCard, { props: { media, poster: '/override.jpg', backdrop: '/override-bg.jpg' }, global });
    expect(w.getComponent(MediaPoster).props()).toMatchObject({ posterUrl: '/override.jpg', backdropUrl: '/override-bg.jpg' });
    w.unmount();
  });
  it('la bannière lit le fond canonique, sans deviner art_url', () => {
    const w = mount(MediaHeroBanner, { props: { media: { ...media, art_url: '/wrong.jpg' } }, global });
    expect(w.getComponent(UiHeroBackdrop).props('imageUrl')).toContain('/backdrop.jpg');
    w.unmount();
  });
  it('Traiter déduit son affiche et réessaie après un changement de média', async () => {
    const item = { key: '1', issue: 'vf', urgency: 'high', title: 'Dune', problem: 'VF absente', media };
    const w = mount(HandleRow, { props: { item, selectable: false }, global });
    expect(w.get('img').attributes('src')).toContain('/poster.jpg');
    await w.get('img').trigger('error');
    await w.setProps({ item: { ...item, media: { ...media, poster_url: '/new.jpg' } } });
    expect(w.get('img').attributes('src')).toContain('/new.jpg');
  });
});
