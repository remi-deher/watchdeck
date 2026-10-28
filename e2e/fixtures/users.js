/** Paginated account fixture matching the list endpoint, including server filters. */
export function usersPage(users, url) {
  const params = url.searchParams;
  const situations = {
    pending: user => (user.stats?.pending_approval || 0) > 0,
    missing_email: user => !user.notification_email && !user.plex_email && !user.notify_admin,
    notification_error: user => Boolean(user.has_notification_error),
  };
  const name = user => user.custom_name || user.display_name || user.plex_user_id || String(user.id);
  const needle = (params.get('query') || '').toLowerCase();
  const attention = params.get('attention');
  const rows = users.filter(user =>
    (!needle || `${name(user)} ${user.plex_user_id || ''} ${user.notification_email || ''}`.toLowerCase().includes(needle)) &&
    (!attention || !situations[attention] || situations[attention](user)) &&
    (!params.get('status') || Boolean(user.enabled) === (params.get('status') === 'enabled')) &&
    (!params.get('role') || user.role === params.get('role')) &&
    (!params.get('source') || user.source === params.get('source')),
  ).sort((a,b) => name(a).localeCompare(name(b), 'fr') * (params.get('direction') === 'desc' ? -1 : 1));
  const offset=Number(params.get('offset') || 0), limit=Number(params.get('limit') || 100);
  return {
    items:rows.slice(offset,offset+limit),offset,total:rows.length,all_total:users.length,has_more:offset+limit<rows.length,
    situations:Object.fromEntries(Object.entries(situations).map(([key,matches]) => [key,users.filter(matches).length])),
    sources:[...new Set(users.map(user => user.source).filter(Boolean))],
  };
}
