import {readFileSync} from 'node:fs';
import {expect,test} from '@playwright/test';
test.use({serviceWorkers:'block'});
test('space goal and title distribution remain usable on every device',async({page})=>{
 test.setTimeout(90000);page.setDefaultTimeout(20000);page.setDefaultNavigationTimeout(60000);
 const instances=[{id:1,name:'Radarr',arr_type:'radarr',enabled:true}];
 const locations=[
  {id:1,name:'DATA',virtual:false,free_bytes:100e9,mappings:[{arr_instance_id:1,arr_root:'/data/FILMS',plex_root:'/media/FILMS',plex_section_id:'1'}]},
  {id:2,name:'USB',virtual:false,free_bytes:200e9,mappings:[{arr_instance_id:1,arr_root:'/usb/FILMS',plex_root:'/usb/MEDIA/FILMS',plex_section_id:'1'}]},
 ];
 const items=Array.from({length:5},(_,n)=>({key:`1:${n}`,arr_instance_id:1,arr_id:n,title:`Film ${n}`,size_bytes:4e9,snapshot:{source_arr:`/data/FILMS/Film ${n}`,destination_arr:`/usb/FILMS/Film ${n}`}}));
 let requested;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  if(path==='/api/storage/preview/start'){requested=route.request().postDataJSON();await route.fulfill({json:{id:'test'}});return;}
  if(path==='/api/storage/preview/test'){await route.fulfill({json:{status:'completed',result:{mode:'release_space',requested_bytes:20e9,requested_titles:5,goal_covered:true,count_covered:true,groups:[{name:'Radarr',body:requested.routes[0],items,excluded:[],source:{free_bytes:100e9},destination:{free_bytes:200e9}}]}}});return;}
  await route.fulfill({json:path==='/api/session'?{role:'admin',is_owner:true}:path==='/api/storage/instances'?instances:path==='/api/storage/locations'?locations:path==='/api/users'||path.startsWith('/api/storage/')?[]:{}});
 });
 if(process.env.WATCHDECK_E2E_BUILT){await page.route('**/storage',route=>route.fulfill({contentType:'text/html',body:readFileSync('app/static/vue/index.html','utf8')}));await page.route('**/vue/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'application/octet-stream',body:readFileSync('app/static'+path)});});}
 await page.goto('/storage',{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'Nouveau transfert',exact:true}).click();
 await page.getByLabel(/^Répartition/).selectOption('count');await page.getByLabel(/^Nombre de titres/).fill('5');
 await page.getByRole('button',{name:'Choisir les médias et le trajet'}).click();
 await page.locator('.instance-choice input').check();await page.locator('.source-choices input[value="/data/FILMS"]').check();await page.locator('.prepare-route select').selectOption('/usb/FILMS');
 await page.getByRole('button',{name:'Préparer l’aperçu'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.objective-result')).toContainText('5 / 5 titres');expect(requested.goal_gb).toBe(20);expect(requested.target_titles).toBe(5);
 const save=page.getByRole('button',{name:'Enregistrer la tâche',exact:true});await save.scrollIntoViewIfNeeded();const box=await save.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize().width+1);
 await page.getByLabel('Sélectionner Film 0',{exact:true}).uncheck();await expect(page.locator('.objective-result')).toContainText('4 / 5 titres');await expect(page.locator('.objective-result')).toContainText('Il manque');await expect(save).toBeDisabled();await page.screenshot({path:`.codex/objective-${test.info().project.name}.png`,fullPage:true});
});
