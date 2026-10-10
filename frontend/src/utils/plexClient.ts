import { Monitor, Smartphone, Tablet, Tv } from '@lucide/vue';

export interface PlexClientRef {
  player?: string | null;
  product?: string | null;
  platform?: string | null;
}
export function plexClientName(client: PlexClientRef): string {
  return client.player || client.product || client.platform || 'Appareil inconnu';
}
export function plexClientIcon(client: PlexClientRef) {
  const value = [client.platform, client.player, client.product].filter(Boolean).join(' ').toLowerCase();
  if (/ipad|tablet/.test(value)) return Tablet;
  if (/iphone|android|mobile/.test(value)) return Smartphone;
  if (/tv|roku|shield|chromecast|firestick/.test(value)) return Tv;
  return Monitor;
}
