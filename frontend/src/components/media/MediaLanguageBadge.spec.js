import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaLanguageBadge from './MediaLanguageBadge.vue';

describe('MediaLanguageBadge', () => {
  it.each([
    [{ has_vf: true, fr_is_default: true }, 'language', 'VF', 'is-success'],
    [{ has_vf: true, fr_is_default: false }, 'language', 'VF (sec.)', 'is-warning'],
    [{ has_vf: false, vf_granularity: 'season_partial' }, 'language', 'Mixte', 'is-warning'],
    [{}, 'language', '?', 'is-neutral'],
    [{ sub_fr_status: 'not_default' }, 'subtitles', 'Présents (inactifs)', 'is-warning'],
    [{ sub_fr_status: 'absent' }, 'subtitles', 'Absents', 'is-danger'],
    [{ forced_fr_status: 'ok' }, 'forced', 'Activés par défaut', 'is-success'],
  ])('interprète %j (%s)', (state, kind, label, tone) => {
    const w = mount(MediaLanguageBadge, { props: { state, kind } });
    expect(w.text()).toBe(label);
    expect(w.classes()).toContain(tone);
  });
});

it('utilise la projection serveur même si un ancien champ contredit son état', () => {
  const wrapper = mount(MediaLanguageBadge, { props: { state: { has_vf: true, availability: { languages: { has_vf: false, vf_granularity: null, fr_is_default: null, sub_fr_status: null, forced_fr_status: null } } } } });
  expect(wrapper.text()).toBe('VO');
});
