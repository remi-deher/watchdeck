import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import RecentJobsPanel from './RecentJobsPanel.vue';

describe('RecentJobsPanel', () => {
  const samplePolls = [
    {
      id: 1,
      job: 'watchlist_poll',
      started_at: '2026-08-15T02:00:00Z',
      errors: 0,
      items_processed: 5,
    },
    {
      id: 2,
      job: 'arr_sync',
      started_at: '2026-08-15T01:50:00Z',
      errors: 2,
      error_detail: 'Connection refused to Sonarr instance at port 8989',
    },
  ];

  it('affiche la liste des exécutions avec noms lisibles et badges', () => {
    const wrapper = mount(RecentJobsPanel, {
      props: {
        polls: samplePolls,
        nextPoll: { next_run_seconds: 45 },
        countdown: '45s',
      },
    });

    expect(wrapper.text()).toContain('Exécutions récentes');
    expect(wrapper.text()).toContain('Watchlist Plex');
    expect(wrapper.text()).toContain('Sync Sonarr/Radarr');
    expect(wrapper.text()).toContain('5 traités');
    expect(wrapper.text()).toContain('2 erreur(s)');
    expect(wrapper.text()).toContain('45s');
    expect(wrapper.findAll('.job-main')[0].attributes('role')).toBeUndefined();
    expect(wrapper.findAll('.job-main')[1].attributes('role')).toBe('button');
  });

  it('permet de déplier le détail d’une erreur et de voir le bloc de code', async () => {
    const wrapper = mount(RecentJobsPanel, {
      props: {
        polls: samplePolls,
      },
    });

    expect(wrapper.find('code').exists()).toBe(false);

    // La ligne en erreur reste utilisable sans souris.
    const clickableRow = wrapper.findAll('.job-main.clickable')[0];
    await clickableRow.trigger('keydown', { key: 'Enter' });

    expect(wrapper.find('code').exists()).toBe(true);
    expect(wrapper.find('code').text()).toContain('Connection refused to Sonarr instance');
  });

  it('filtre les exécutions par erreurs uniquement', async () => {
    const wrapper = mount(RecentJobsPanel, {
      props: {
        polls: samplePolls,
      },
    });

    const select = wrapper.get('select');
    await select.setValue('errors');

    expect(wrapper.find('.jobs-list').text()).not.toContain('Watchlist Plex');
    expect(wrapper.find('.jobs-list').text()).toContain('Sync Sonarr/Radarr');
  });
  it('utilise le panneau commun et son etat vide', () => {
    const wrapper = mount(RecentJobsPanel);
    expect(wrapper.find('.panel-card').exists()).toBe(true);
    expect(wrapper.find('.empty').text()).toContain('Aucune');
  });
});
