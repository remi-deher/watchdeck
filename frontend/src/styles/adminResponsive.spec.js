import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (...parts) => readFileSync(join(process.cwd(), 'frontend', 'src', ...parts), 'utf8');

describe('responsive administration views', () => {
  it('keeps settings search usable above the mobile navigation', () => {
    const settings = source('views', 'SettingsView.vue');
    expect(settings).toContain('bottom:calc(var(--mobile-bottom-nav-height,72px) + 12px)');
    expect(settings).toContain('max-height:min(55dvh,420px)');
  });

  it('uses the canonical tablet boundary for dense administration controls', () => {
    expect(source('views', 'UsersView.vue')).toContain('@media(min-width:768px)');
    expect(source('views', 'NotificationsView.vue')).toContain('@media (max-width: 767.98px)');
    expect(source('components', 'settings', 'SettingsOverview.vue')).toContain('@media(max-width:767.98px)');
  });
});
