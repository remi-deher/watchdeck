/** Cible de redirection apres connexion, limitee a la meme origine.
 *
 * `value.startsWith('/')` seul ne suffit pas : « //evil.com » ou « /\evil.com » passent ce
 * test mais sont interpretes par le navigateur comme une adresse vers un autre hote. */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/';
  try {
    const resolved = new URL(value, window.location.origin);
    if (resolved.origin !== window.location.origin) return '/';
    const path = resolved.pathname + resolved.search + resolved.hash;
    return path.startsWith('/') && !path.startsWith('//') ? path : '/';
  } catch {
    return '/';
  }
}
