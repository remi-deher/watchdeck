import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const result=[];
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
  const login=await context.request.post('http://127.0.0.1:8765/api/auth/login',{data:{username:'benchmark',password:'benchmark-local-only'}});if(!login.ok())throw Error(`Login ${login.status()}`);
  await context.addInitScript(()=>{window.__longTasks=[];new PerformanceObserver(l=>window.__longTasks.push(...l.getEntries().map(e=>e.duration))).observe({type:'longtask',buffered:true});});
  const page=await context.newPage();const cdp=await context.newCDPSession(page);
  if(mobile){await cdp.send('Network.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});}
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const start=performance.now();await page.goto('http://127.0.0.1:8765/users',{waitUntil:'domcontentloaded'});
  await page.locator('.ui-data-table tbody tr').filter({hasText:'Compte laboratoire'}).first().waitFor({timeout:60000});
  const usefulMs=performance.now()-start;
  const sample=async()=>({...await page.evaluate(()=>({domNodes:document.querySelectorAll('*').length,rows:document.querySelectorAll('.ui-data-table tbody tr').length,longTasks:window.__longTasks})),heap:await cdp.send('Runtime.getHeapUsage')});
  const initial=await sample();
  for(let i=0;i<12;i++){await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(mobile?700:300);}
  result.push({mobile,usefulMs,initial,afterScroll:await sample(),errors});await context.close();
 }
}finally{await browser.close();await writeFile('docs/performance-results/lot0/history-tables.json',JSON.stringify(result,null,2)+'\n');}
