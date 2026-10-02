import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConversionPanel from './ConversionPanel.vue';

const session = {
  playback_method: 'transcode',
  transcode_details: {
    container: { from: 'mkv', to: 'mp4' },
    protocol: 'dash',
    video: { decision: 'copy', from: 'hevc', to: 'hevc' },
    audio: { decision: 'transcode', from: 'dca', to: 'aac', channels: 6 },
  },
  transcode_reason: {
    source: 'plex',
    code: 3000,
    text: 'App cannot direct play this item. Direct play is disabled.',
    client: { directPlay: '0', directStream: '1', location: 'wan' },
    mde: ['Direct Play is disabled', 'Some unknown Plex step'],
  },
};

describe('ConversionPanel', () => {
  it('montre le verdict, la source et les flux', () => {
    const wrapper = mount(ConversionPanel, { props: { session } });
    expect(wrapper.get('.verdict-title').text()).toBe('Transcodage audio : le lecteur a refusé la lecture directe');
    expect(wrapper.get('.pill.plex').text()).toBe('Décision de Plex · code 3000');
    expect(wrapper.findAll('.conversion-flow').map((flow) => flow.get('.flow-label').text())).toEqual(['Conteneur', 'Vidéo', 'Audio']);
  });

  it('montre ce que le lecteur accepte, un refus en rouge', () => {
    const pills = mount(ConversionPanel, { props: { session } }).findAll('.conversion-request .pill');
    expect(pills.map((pill) => pill.text())).toEqual(['lecture directe : non', 'conversion légère : oui', 'réseau distant']);
    expect(pills[0].classes()).toContain('refused');
  });

  it('traduit le raisonnement de Plex et garde l’original', () => {
    const steps = mount(ConversionPanel, { props: { session } }).findAll('.conversion-steps li');
    expect(steps[0].text()).toBe('Lecture directe désactivée par le lecteur · Direct Play is disabled');
    expect(steps[1].text()).toBe('Some unknown Plex step');
  });

  it('marque une cause déduite quand Plex n’a rien dit', () => {
    const deduced = { ...session, transcode_reason: { source: 'deduced', text: 'Audio DTS → AAC' } };
    const wrapper = mount(ConversionPanel, { props: { session: deduced } });
    expect(wrapper.find('.pill.deduced').exists()).toBe(true);
    expect(wrapper.find('.conversion-steps').exists()).toBe(false);
  });
});
