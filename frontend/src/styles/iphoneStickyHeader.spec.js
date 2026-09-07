import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (...parts) => readFileSync(join(process.cwd(), 'frontend', 'src', ...parts), 'utf8');

describe('iPhone sticky headers', () => {
  it('keeps only search tools and explicit sticky page headers below the sensor area', () => {
    const searchHeader = source('components', 'ui', 'PageSearchHeader.vue');
    expect(searchHeader).toContain('class="psh-tools-sticky"');
    expect(searchHeader).toContain('top: max(8px, var(--safe-top))');
    expect(searchHeader).toContain('.psh-root {\n  display: contents;');
    expect(source('components', 'ui', 'PageShell.vue')).toContain('top: var(--safe-top)');
  });

  it('offsets the sticky filter bar from the same safe area', () => {
    expect(source('styles', 'components', '_components.scss')).toContain('top: calc(8px + var(--safe-top))');
  });
});
