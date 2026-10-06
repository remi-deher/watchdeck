import {readFileSync} from 'node:fs';
import { expect, test } from '@playwright/test';
test.use({serviceWorkers:'block'});

test('background Plex finalization is readable and pausable', async ({page})=>{
 test.setTimeout(120_000);
 const job={id:9,status:'finalizing',desired_state:'run',params:{name:'Finalisation des films',transfer_mode:'rsync_ssh'},planned_bytes:4e9,released_bytes:1e9,items:[{id:1,title:'Film terminé',status:'completed',size_bytes:1e9,snapshot:{}},{id:2,title:'Film à confirmer',status:'plex_pending',size_bytes:3e9,progress:{plex_checked_at:1700000000},snapshot:{}}]};
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  await route.fulfill({json:path==='/api/session'?{role:'admin',is_owner:true}:path==='/api/storage/transfers'?[job]:path==='/api/users'||path.startsWith('/api/storage/')?[]:{}});
 });
 if(process.env.WATCHDECK_E2E_BUILT){
  await page.route('**/storage',route=>route.fulfill({contentType:'text/html',body:readFileSync('app/static/vue/index.html','utf8')}));
  await page.route('**/vue/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'application/octet-stream',body:readFileSync('app/static'+path)});});
 }
 await page.goto('/storage',{waitUntil:'domcontentloaded',timeout:120_000});
 await page.getByRole('tab',{name:'Transferts',exact:true}).click();
 await expect(page.getByText('Copie terminée · Finalisation Plex en arrière-plan',{exact:true})).toBeVisible();
 await expect(page.getByText('1 titre(s) à confirmer · 3 Go conservés à la source.')).toBeVisible();
 const pause=page.getByRole('button',{name:'Mettre en pause',exact:true});
 await expect(pause).toBeVisible();
 const box=await pause.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize().width+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
 await page.screenshot({path:`.codex/plex-finalization-${test.info().project.name}.png`,fullPage:true});
});

test('transfer actions and title details remain accessible at every screen size', async ({ page }) => {
  test.setTimeout(120_000);
  const job = {id:9,status:'paused',desired_state:'pause',params:{name:'Séries à transférer',transfer_mode:'rsync_ssh'},planned_bytes:930e9,released_bytes:0,items:[
    {id:1,title:'The Simpsons',status:'prepared',size_bytes:430e9,snapshot:{source_arr:'/data/SERIES/The Simpsons',destination_arr:'/usb/SERIES/The Simpsons'}},
    {id:2,title:'One Piece',status:'pending',size_bytes:500e9,snapshot:{}}
  ]};
  let commands=0;
  await page.route('**/api/**', async route => {
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/command')){commands++;await route.fulfill({json:{}});return;}
    await route.fulfill({json:path==='/api/session'?{role:'admin',is_owner:true}:path==='/api/storage/transfers'?[job]:path==='/api/users'||path.startsWith('/api/storage/')?[]:{}});
  });
  if(process.env.WATCHDECK_E2E_BUILT){
    await page.route('**/storage',route=>route.fulfill({contentType:'text/html',body:readFileSync('app/static/vue/index.html','utf8')}));
    await page.route('**/vue/**',route=>{const path=new URL(route.request().url()).pathname;return route.fulfill({contentType:path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'application/octet-stream',body:readFileSync('app/static'+path)});});
  }
  await page.goto('/storage',{waitUntil:'domcontentloaded',timeout:120_000});
  await page.getByRole('tab',{name:'Vue d’ensemble',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Transfert actif',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Préparer un déplacement',exact:true})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.screenshot({path:`.codex/overview-live-${test.info().project.name}.png`,fullPage:true});
  await page.getByRole('tab',{name:'Transferts',exact:true}).click();
  const openActions=()=>page.getByRole('button',{name:'Actions de la tâche 9'}).click();
  await openActions();
  const cancel=page.getByRole('menuitem',{name:'Annuler la tâche',exact:true});
  await expect(cancel).toBeVisible();
  expect((await page.getByRole('button',{name:'Reprendre le lot'}).boundingBox()).height).toBeGreaterThanOrEqual(43.5);
  await page.keyboard.press('Escape');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  await page.getByText('Voir les 2 titres et leurs détails',{exact:true}).click();
  const details=page.getByRole('button',{name:'Détails de The Simpsons',exact:true});
  await page.screenshot({path:`.codex/transfers-${test.info().project.name}.png`,fullPage:true});
  const bounds=await details.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x+bounds.width).toBeLessThanOrEqual(page.viewportSize().width+1);
  await details.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('/data/SERIES/The Simpsons');
  await page.getByRole('dialog').getByRole('button',{name:'Fermer',exact:true}).last().click();
  await openActions();await cancel.click();
  await expect(page.getByRole('dialog')).toContainText('Avec rsync');
  expect(commands).toBe(0);
  await page.getByRole('button',{name:'Garder la tâche',exact:true}).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button',{name:'Actions de la tâche 9'}).click();
  await expect(page.getByRole('menuitem',{name:'Relancer avec de nouveaux paramètres'})).toBeVisible();
  await page.keyboard.press('Escape');
  await openActions();await cancel.click();
  await page.getByRole('button',{name:'Annuler et nettoyer',exact:true}).click();
  await expect.poll(()=>commands).toBe(1);
});
