import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const output=[];
try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
  const auth=await context.request.post('http://127.0.0.1:8765/api/auth/login',{data:{username:'benchmark',password:'benchmark-local-only'}});if(!auth.ok())throw Error(`login ${auth.status()}`);
  await context.addInitScript(()=>{window.__events=[];new PerformanceObserver(l=>{for(const e of l.getEntries())if(e.interactionId)window.__events.push({id:e.interactionId,duration:e.duration,name:e.name});}).observe({type:'event',buffered:true,durationThreshold:16});});
  const page=await context.newPage();const cdp=await context.newCDPSession(page);
  if(mobile){await cdp.send('Network.enable');await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});}
  await page.goto('http://127.0.0.1:8765/library?type=movie&query=Film');await page.locator('.poster-card').first().waitFor({timeout:60000});
  const input=page.locator('input[type="search"]:visible').first();
  await input.click();await input.press('ControlOrMeta+A');await input.pressSequentially('Film 0042',{delay:100});await page.waitForTimeout(1500);
  await input.click();await input.press('ControlOrMeta+A');await input.pressSequentially('Film',{delay:100});await page.waitForTimeout(1500);
  const events=await page.evaluate(()=>window.__events);
  const byId=new Map();for(const e of events)byId.set(e.id,Math.max(byId.get(e.id)||0,e.duration));
  output.push({mobile,observedInteractions:byId.size,labInpCandidateMs:Math.max(0,...byId.values()),events,errors:[]});
  await context.close();
 }
}finally{await browser.close();await writeFile('docs/performance-results/lot0/large-interactions.json',JSON.stringify(output,null,2)+'\n');}
