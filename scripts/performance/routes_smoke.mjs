/** Production route/layout smoke; real lab API, no interception. */
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const origin='http://127.0.0.1:8765',results=[];
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
try {
 for(const mobile of [false,true]) {
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
  const page=await context.newPage(),errors=[],failedAssets=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().includes('/vue/assets/')&&r.status()>=400)failedAssets.push(r.url());});
  for(const route of ['/login','/dashboard','/library?type=movie&query=Film','/discover']) {
   if(route==='/dashboard'){
    const auth=await context.request.post(`${origin}/api/auth/login`,{data:{username:'benchmark',password:'benchmark-local-only'}});
    if(!auth.ok())throw new Error(`Login ${auth.status()}`);
   }
   await page.goto(origin+route,{waitUntil:'domcontentloaded'});
   await page.locator(route==='/login'?'input[type="password"]':'.app-page').first().waitFor();
   if(route.startsWith('/library'))await page.locator('.poster-card').first().waitFor();
   await page.waitForTimeout(300);
   const layout=await page.evaluate(()=>({width:innerWidth,bodyWidth:document.body.scrollWidth,cards:document.querySelectorAll('.poster-card').length}));
   if(layout.bodyWidth>layout.width+1)throw new Error(`Overflow ${route}: ${JSON.stringify(layout)}`);
   results.push({mobile,route,layout});
  }
  if(errors.length||failedAssets.length)throw new Error(JSON.stringify({errors,failedAssets}));
  await context.close();
 }
} finally {
 await browser.close();await mkdir('docs/performance-results/lot6',{recursive:true});
 await writeFile('docs/performance-results/lot6/routes-smoke.json',JSON.stringify(results,null,2)+'\n');
}
console.log(JSON.stringify(results,null,2));
