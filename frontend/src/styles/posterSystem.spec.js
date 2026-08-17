import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path) => readFileSync(resolve(process.cwd(), 'frontend/src', path), 'utf8');
const rootSource = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('systeme commun des affiches', () => {
  it('pilote les grilles et les rails avec les memes jetons', () => {
    const tokens = source('styles/foundations/_tokens.scss');
    const grid = source('components/ui/MediaGrid.vue');
    const rail = source('components/ui/HorizontalRail.vue');

    expect(tokens).toContain('--poster-grid-min: 220px');
    expect(grid).toContain('repeat(auto-fill, var(--poster-grid-min))');
    expect(grid).not.toContain('minmax(var(--poster-grid-min), 1fr)');
    expect(rail).toContain('var(--poster-rail-min)');
    expect(rail).toContain('var(--poster-grid-gap)');
  });

  it('fait passer les cartes grille de Bibliotheque par MediaPosterCard', () => {
    const libraryCard = source('components/library/LibraryCard.vue');

    expect(libraryCard).toContain('<MediaPosterCard');
    expect(libraryCard).toContain("import MediaPosterCard from '@/components/media/MediaPosterCard.vue'");
    expect(libraryCard).not.toContain('<MediaCardShell');
  });

  it('centralise les collections de Bibliotheque et Decouvrir', () => {
    const collection = source('components/media/MediaPosterCollection.vue');
    const library = source('views/LibraryView.vue');
    const discover = source('views/DiscoverView.vue');
    const statusBadge = source('components/media/MediaStatusBadge.vue');
    const libraryRail = source('components/library/MusicHubRow.vue');

    expect(collection).toContain("mode?: 'grid' | 'rail'");
    expect(collection).toContain("size?: 'standard' | 'compact' | 'music'");
    expect(library).toContain('<MediaPosterCollection');
    expect(discover).toContain('<MediaPosterCollection');
    expect(statusBadge).toContain('var(--poster-badge-font-size)');
    expect(libraryRail).toContain(":size=\"size\"");
    expect(libraryRail).toContain("size: 'standard'");
  });
});

describe('recuperation des chunks apres deploiement', () => {
  it('force le rechargement sur tout evenement vite:preloadError', () => {
    const main = source('main.ts');
    const recovery = source('assetRecovery.ts');
    const worker = rootSource('public/sw.js');

    expect(main).toContain("window.addEventListener('vite:preloadError'");
    expect(main).toContain('recoverFromStaleAssets(event.payload, true)');
    expect(recovery).toMatch(/unable to preload.*loading \(css \)\?chunk.*chunkloaderror/i);
    expect(recovery).toContain("key.startsWith('watchdeck-cache-')");
    expect(recovery).toContain('now - readLastRecovery() < RECOVERY_COOLDOWN_MS');
    expect(recovery).not.toContain('setTimeout');
    expect(worker).toContain("if (url.pathname.startsWith('/vue/assets/')) return;");
    expect(rootSource('index.html')).not.toContain('upgrade-insecure-requests');
  });
});
