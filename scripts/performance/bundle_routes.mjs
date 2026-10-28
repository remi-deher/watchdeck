/** Count static dependencies for entry + the chosen lazy route, including gzip cost. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const root = 'app/static/vue';
const manifest = JSON.parse(await readFile(`${root}/.vite/manifest.json`, 'utf8'));
const result = { strategy: process.argv[2] || 'whole', routes: {} };
const entry = Object.keys(manifest).find(k => manifest[k].isEntry);
for (const [name, suffix] of Object.entries({ login:'LoginView.vue', dashboard:'DashboardView.vue', library:'LibraryView.vue', discover:'DiscoverView.vue' })) {
  const route = Object.keys(manifest).find(k => k.endsWith(suffix));
  if (!route) throw new Error(`Missing manifest route ${suffix}`);
  const visited = new Set(), files = new Set();
  function visit(key) { if (visited.has(key)) return; visited.add(key); const item=manifest[key]; if(!item)throw new Error(`Missing ${key}`); files.add(item.file); for(const css of item.css||[])files.add(css); for(const dep of item.imports||[])visit(dep); }
  visit(entry); visit(route);
  let bytes=0,gzip=0,cssBytes=0;
  for(const file of files){const body=await readFile(`${root}/${file}`);bytes+=body.length;gzip+=gzipSync(body,{level:9}).length;if(file.endsWith('.css'))cssBytes+=body.length;}
  result.routes[name]={files:files.size,bytes,gzipBytes:gzip,cssBytes,dependencies:[...files].sort()};
}
await mkdir('docs/performance-results/lot6',{recursive:true});
await writeFile(`docs/performance-results/lot6/bundle-${result.strategy}.json`,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(Object.fromEntries(Object.entries(result.routes).map(([k,v])=>[k,{files:v.files,gzipBytes:v.gzipBytes,cssBytes:v.cssBytes}]))));
