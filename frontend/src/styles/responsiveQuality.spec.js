import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (...parts) => readFileSync(join(process.cwd(), 'frontend', 'src', ...parts), 'utf8');

describe('responsive quality safeguards', () => {
  it('preserves keyboard and reduced-motion accessibility', () => {
    const base = source('styles', 'foundations', '_base.scss');
    const motion = source('styles', 'foundations', '_motion.scss');
    expect(base).toContain(':focus-visible');
    expect(base).toContain('@media (pointer: coarse)');
    expect(motion).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('defers off-screen collections and provides responsive cast images', () => {
    expect(source('components', 'ui', 'MediaGrid.vue')).toContain('content-visibility: auto');
    expect(source('components', 'ui', 'HorizontalRail.vue')).toContain('contain-intrinsic-size');
    expect(source('components', 'media', 'MediaCast.vue')).toContain('sizes="(max-width: 767px) 118px, 145px"');
  });
});
