import { filterClients, torrentFacets } from '../../frontend/src/downloads/clientFilters';

/** Match the paginated client API while retaining the fixture's complete facets. */
export function torrentsPage(torrents, url) {
  const p=url.searchParams;
  const rows=filterClients(torrents, {
    query:p.get('query') || '', clientId:p.get('client_id') || '', ownership:p.get('ownership') || '',
    category:p.getAll('category'),status:p.getAll('state'),tracker:p.getAll('tracker'),
  }).sort((a,b)=>a.title.localeCompare(b.title) * (p.get('direction')==='desc'?-1:1));
  const offset=Number(p.get('offset') || 0),limit=Number(p.get('limit') || 100);
  return {items:rows.slice(offset,offset+limit),offset,total:rows.length,collection_total:torrents.length,has_more:offset+limit<rows.length,facets:torrentFacets(torrents),client_errors:[]};
}
