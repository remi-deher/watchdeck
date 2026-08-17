import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const view = (name) => readFileSync(join(process.cwd(), 'frontend', 'src', 'views', name), 'utf8');

describe('responsive operational views', () => {
  it('uses the tablet boundary for calendar actions and activity controls', () => {
    expect(view('CalendarView.vue')).toContain('@media (max-width: 767.98px)');
    expect(view('CalendarView.vue')).toContain('min-height: 44px');
    expect(view('ActivityView.vue')).toContain('@media(max-width:767.98px)');
  });

  it('collapses download cards and VF audit actions on phones', () => {
    expect(view('DownloadsView.vue')).toContain('.download-card-grid,.history-grid-cards,.wanted-grid{grid-template-columns:1fr}');
    expect(view('VfUpgradesView.vue')).toContain('.audit-episode-actions :deep(button) { width: 100%; min-height: 44px; }');
  });
});
