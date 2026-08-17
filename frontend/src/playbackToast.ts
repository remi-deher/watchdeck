export function playbackTitle(item: { grandparent_title?: string; title?: string } = {}): string {
  return item.grandparent_title
    ? `${item.grandparent_title} · ${item.title || 'Lecture Plex'}`
    : item.title || 'Lecture Plex';
}

export function playbackStartsFromEvent(event: any): any[] {
  const started = event?.detail?.payload?.started;
  return Array.isArray(started) ? started : [];
}
