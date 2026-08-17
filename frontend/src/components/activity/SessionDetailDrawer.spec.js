import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SessionDetailDrawer from './SessionDetailDrawer.vue';

function factory(session) {
  return mount(SessionDetailDrawer, {
    props: { session },
    global: {
      stubs: {
        DrawerShell: { template: '<aside><slot/></aside>' },
        MediaArtwork: true,
        PlaybackMethodBadge: true,
        SessionLocationMap: true,
        SessionTimelineBar: true,
      },
    },
  });
}

function connectionKpi(wrapper) {
  return wrapper.get('.network-kpi');
}

describe('SessionDetailDrawer - connexion', () => {
  it('affiche Locale pour stream_location=lan', () => {
    const wrapper = factory({ title: 'Film', location: 'lan', geo_status: 'resolved' });
    expect(connectionKpi(wrapper).text()).toContain('Locale');
    expect(connectionKpi(wrapper).classes()).toContain('local');
  });

  it('affiche Locale pour geo_status=local même sans stream_location', () => {
    const wrapper = factory({ title: 'Film', geo_status: 'local', address: '192.168.1.25' });
    expect(connectionKpi(wrapper).text()).toContain('Locale');
  });

  it('affiche Distante pour stream_location=wan', () => {
    const wrapper = factory({ title: 'Film', location: 'wan', geo_status: 'resolved' });
    expect(connectionKpi(wrapper).text()).toContain('Distante');
    expect(connectionKpi(wrapper).classes()).toContain('remote');
  });

  it('affiche Distante quand stream_location est absent mais geo_status=resolved (session Hyper tension 2)', () => {
    const wrapper = factory({
      title: 'Hyper tension 2',
      address: '82.64.10.20',
      geo_status: 'resolved',
      geo_city: 'Yutz',
      geo_country: 'France',
      geo_isp: 'Orange S.A.',
      geo_organization: 'POP DIJ',
      geo_asn: 'AS3215',
    });
    expect(connectionKpi(wrapper).text()).toContain('Distante');
    expect(connectionKpi(wrapper).text()).toContain('Orange S.A.');
  });

  it('affiche Distante pour une IP publique même sans geo_status résolu', () => {
    const wrapper = factory({ title: 'Film', address: '82.64.10.20' });
    expect(connectionKpi(wrapper).text()).toContain('Distante');
  });

  it('réserve Non déterminée aux cas réellement impossibles à trancher', () => {
    const wrapper = factory({ title: 'Film' });
    expect(connectionKpi(wrapper).text()).toContain('Non déterminée');
  });

  it('affiche une formulation neutre quand aucun enrichissement réseau n’est disponible', () => {
    const wrapper = factory({ title: 'Film', address: '82.64.10.20', geo_status: 'resolved' });
    expect(connectionKpi(wrapper).text()).toContain('via une adresse publique');
  });

  it('utilise geo_organization en repli quand geo_isp est absent', () => {
    const wrapper = factory({
      title: 'Film',
      address: '82.64.10.20',
      geo_status: 'resolved',
      geo_organization: 'POP DIJ',
    });
    expect(connectionKpi(wrapper).text()).toContain('POP DIJ');
  });

  it('affiche le temps en pause quand paused_ms est présent', () => {
    const wrapper = factory({
      title: 'Film',
      duration_ms: 7200000,
      watched_ms: 3600000,
      paused_ms: 900000,
    });
    expect(wrapper.text()).toContain('Temps en pause');
    expect(wrapper.text()).toContain('15 min');
  });
});
