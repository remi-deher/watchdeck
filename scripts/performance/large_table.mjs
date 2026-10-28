/** Real UsersView with a deliberately enlarged API fixture; never sends mutations. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = 'http://127.0.0.1:8765';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
try {
 for(const mobile of [false,true]) {
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
  const auth=await context.request.post(`${origin}/api/auth/login`,{data:{username:'benchmark',password:'benchmark-local-only'}});
  if(!auth.ok())throw new Error(`Login ${auth.status()}`);
  const response=await context.request.get(`${origin}/api/users/page?limit=1`);
  if(!response.ok())throw new Error(`Users ${response.status()}`);
  const sample=await response.json();
  const items=Array.from({length:2000},(_,i)=>({...sample.items[0],id:10000+i,plex_user_id:`fixture-${i}`,display_name:`Compte ${String(i).padStart(4,'0')}`,custom_name:null}));
  await context.route('**/api/users/page?**',route=>{
   const desc=new URL(route.request().url()).searchParams.get('direction')==='desc';
   return route.fulfill({json:{...sample,items:desc?[...items].reverse():items,total:2000,all_total:2000,has_more:false,offset:0}});
  });
  const page=await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const start=performance.now();
  await page.goto(`${origin}/users`);
  const groups=page.locator('tbody[data-row-key]');
  await groups.first().waitFor();await page.waitForTimeout(700);
  const readyMs=performance.now()-start;
  const first=await groups.first().getAttribute('data-row-key');
  const initial=await groups.count();
  if(mobile)await groups.first().locator('[role="checkbox"]').tap();
  else await groups.first().locator('[role="checkbox"]').click();
  await groups.first().locator('button:visible, a[href]:visible, input:visible, [tabindex="0"]:visible').last().focus();
  await page.keyboard.press('Tab');
  const tabFocus=await page.evaluate(()=>document.activeElement?.closest('tbody')?.dataset.index);
  if(tabFocus!=='1')throw new Error(`Tab focus ${tabFocus}`);
  await page.keyboard.press('Shift+Tab');
  const backTabFocus=await page.evaluate(()=>document.activeElement?.closest('tbody')?.dataset.index);
  if(backTabFocus!=='0')throw new Error(`Shift Tab focus ${backTabFocus}`);
  await groups.first().locator('tr').first().focus();
  await page.keyboard.press('End');await page.waitForTimeout(500);
  const endFocus=await page.evaluate(()=>document.activeElement?.closest('tbody')?.dataset.index);
  if(endFocus!=='1999')throw new Error(`End focus ${endFocus}`);
  await page.locator('tbody[data-index="1999"] [role="checkbox"]').click({modifiers:['Shift']});
  const selected=await page.locator('.bulk-action-count').textContent();
  if(!selected.includes('2000'))throw new Error(`Selection ${selected}`);
  // Pin focus, then scroll far away: only the focused row plus visible rows stay mounted.
  const counts=[];
  for(const fraction of [0,.1,.25,.5,.75,1,0]) {
   await page.evaluate(f=>window.scrollTo(0,(document.documentElement.scrollHeight-innerHeight)*f),fraction);
   await page.waitForTimeout(150);counts.push(await groups.count());
  }
  const pinnedFocus=await page.evaluate(()=>document.activeElement?.closest('tbody')?.dataset.index);
  if(pinnedFocus!=='1999')throw new Error(`Lost focus ${pinnedFocus}`);
  await page.locator('tbody[data-index="1999"] tr').first().focus();
  await page.keyboard.press('Home');await page.waitForTimeout(200);
  const homeFocus=await page.evaluate(()=>document.activeElement?.closest('tbody')?.dataset.index);
  if(homeFocus!=='0')throw new Error(`Home focus ${homeFocus}`);
  const layout=await page.evaluate(()=>({width:innerWidth,bodyWidth:document.body.scrollWidth,tableWidth:document.querySelector('.ui-data-table')?.getBoundingClientRect().width,cellDisplay:getComputedStyle(document.querySelector('tbody[data-row-key] td')).display,domNodes:document.querySelectorAll('*').length}));
  if(Math.max(initial,...counts)>80)throw new Error(`Unbounded rows ${counts}`);
  if(errors.length)throw new Error(errors.join('\n'));
  results.push({mobile,fixtureRows:items.length,readyMs,initialRendered:initial,renderedDuringScroll:counts,first,endFocus,homeFocus,pinnedFocus,tabFocus,backTabFocus,selected,layout,errors});
  await context.close();
 }
} finally {
 await browser.close();await mkdir('docs/performance-results/lot6',{recursive:true});
 await writeFile('docs/performance-results/lot6/large-table-browser.json',JSON.stringify(results,null,2)+'\n');
}
console.log(JSON.stringify(results,null,2));
