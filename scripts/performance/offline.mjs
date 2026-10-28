import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
const output=process.env.WATCHDECK_PERF_RESULTS||'docs/performance-results/lot0';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const context=await browser.newContext();const result={profile:'history',scope:'one desktop context, real service worker and IndexedDB'};
try{
 const login=await context.request.post('http://127.0.0.1:8765/api/auth/login',{data:{username:'benchmark',password:'benchmark-local-only'}});if(!login.ok())throw Error(`login ${login.status()}`);
 const page=await context.newPage();await page.goto('http://127.0.0.1:8765/library?type=movie&query=Film');
 await page.locator('.poster-card').first().waitFor({timeout:30000});
 await page.evaluate(()=>navigator.serviceWorker.ready);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await page.waitForTimeout(2000);
 result.storage=await page.evaluate(async()=>{
  const start=performance.now();
  const raw=await new Promise((resolve,reject)=>{
   const open=indexedDB.open('watchdeck');open.onerror=()=>reject(open.error);
   open.onsuccess=()=>{const db=open.result;const transaction=db.transaction('cache');const read=transaction.objectStore('cache').getAll();read.onsuccess=()=>resolve(read.result);read.onerror=()=>reject(read.error);transaction.oncomplete=()=>db.close();};
  });
  const readMs=performance.now()-start;const parseStart=performance.now();
  const parsed=raw.filter(v=>typeof v==='string').map(v=>JSON.parse(v));
  return {readMs,parseMs:performance.now()-parseStart,bytes:raw.reduce((n,v)=>n+(typeof v==='string'?new TextEncoder().encode(v).length:0),0),queries:parsed.reduce((n,v)=>n+(v.clientState?.queries?.length||0),0)};
 });
 await context.setOffline(true);const start=performance.now();
 try{await page.reload({waitUntil:'domcontentloaded',timeout:15000});await page.locator('.poster-card').first().waitFor({state:'visible',timeout:15000});result.offlineCardsVisible=true;}
 catch(error){result.offlineCardsVisible=false;result.error=error.message.split('\n')[0];}
 result.reloadMs=performance.now()-start;result.finalPath=new URL(page.url()).pathname;result.cards=await page.locator('.poster-card').count();
 // Repeat after an online document navigation controlled by the installed service worker.
 await context.setOffline(false);
 await page.goto('http://127.0.0.1:8765/library?type=movie&query=Film');
 await page.locator('.poster-card').first().waitFor({timeout:30000});await page.waitForTimeout(2000);
 await context.setOffline(true);const warmStart=performance.now();result.warmOffline={};
 try{await page.reload({waitUntil:'domcontentloaded',timeout:15000});await page.locator('.poster-card').first().waitFor({state:'visible',timeout:15000});await page.waitForTimeout(1000);result.warmOffline.cardsVisible=await page.locator('.poster-card').first().isVisible();}
 catch(error){result.warmOffline.cardsVisible=false;result.warmOffline.error=error.message.split('\n')[0];}
 result.warmOffline.reloadMs=performance.now()-warmStart;result.warmOffline.finalPath=new URL(page.url()).pathname;result.warmOffline.cards=await page.locator('.poster-card').count();

}finally{await context.close();await browser.close();await mkdir(output,{recursive:true});await writeFile(`${output}/history-offline.json`,JSON.stringify(result,null,2)+'\n');}
