import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as sass from 'sass';

const foundationsPath = join(process.cwd(), 'frontend', 'src', 'styles', 'foundations');

describe('responsive foundations', () => {
  it('expose the canonical mobile-first breakpoint contract', () => {
    const source = readFileSync(join(foundationsPath, '_breakpoints.scss'), 'utf8');

    expect(source).toContain('mobile-wide: 420px');
    expect(source).toContain('phablet: 640px');
    expect(source).toContain('tablet: 768px');
    expect(source).toContain('desktop: 1025px');
    expect(source).toContain('wide: 1200px');
  });

  it('compiles the shared primitives and their tablet adaptation', () => {
    const result = sass.compile(join(foundationsPath, '_responsive.scss'));

    expect(result.css).toContain('.responsive-grid');
    expect(result.css).toContain('.media-frame');
    expect(result.css).toContain('@media (min-width: 768px)');
    expect(result.css).toContain('.desktop-only-foundation');
    expect(result.css).toContain('.safe-area');
    expect(result.css).toContain('var(--safe-top)');
  });

  it('exposes logical aliases for all four browser safe areas', () => {
    const source = readFileSync(join(foundationsPath, '_tokens.scss'), 'utf8');
    expect(source).toContain('--safe-inline-start: var(--safe-left)');
    expect(source).toContain('--safe-inline-end: var(--safe-right)');
    expect(source).toContain('--safe-block-start: var(--safe-top)');
    expect(source).toContain('--safe-block-end: var(--safe-bottom)');
  });
});
