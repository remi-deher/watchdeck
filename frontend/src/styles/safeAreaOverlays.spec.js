import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (...parts) => readFileSync(join(process.cwd(), 'frontend', 'src', ...parts), 'utf8');

describe('safe area overlays', () => {
  it('protects fixed drawers on every edge and in landscape', () => {
    const layout = source('styles', 'layout', '_layout.scss');
    expect(layout).toContain('padding-left: max(var(--drawer-pad), var(--safe-left))');
    expect(layout).toContain('padding-right: max(var(--drawer-pad), var(--safe-right))');
    expect(layout).toContain('max-height: calc(100dvh - var(--safe-top))');
  });

  it('offsets sticky and floating controls from unsafe areas', () => {
    const components = source('styles', 'components', '_components.scss');
    expect(components).toContain('left: max(22px,var(--safe-left))');
    expect(components).toContain('top: calc(8px + var(--safe-top))');
    expect(source('components', 'ui', 'StickyHeader.vue')).toContain('top: calc(6px + var(--safe-top))');
  });
});
