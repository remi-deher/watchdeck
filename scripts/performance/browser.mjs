// Production build, real local API and PostgreSQL. No API response interception.
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
const browser = await chromium.launch({executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless:true, args:['--no-sandbox']});
const results=[];const profile=process.argv[2]||'small';
try {
 for (const mobile of [false,true]) {
  for(let run=0;run<3;run++) {
   const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900},isMobile:mobile,hasTouch:mobile});
   const auth=await context.request.post('http://127.0.0.1:8765/api/auth/login',{data:{username:'benchmark',password:'benchmark-local-only'}});
   if(!auth.ok()) throw new Error(`Login ${auth.status()}`);
   await context.addInitScript(()=>{
    window.__perf={lcp:0,events:[],longTasks:[]};
    for(const [type,fn] of [['largest-contentful-paint',e=>window.__perf.lcp=e.startTime],['event',e=>{if(e.interactionId)window.__perf.events.push({name:e.name,duration:e.duration});}],['longtask',e=>window.__perf.longTasks.push(e.duration)]]){
     try{new PerformanceObserver(list=>list.getEntries().forEach(fn)).observe({type,buffered:true,durationThreshold:16});}catch{}
    }
   });
   const page=await context.newPage();const cdp=await context.newCDPSession(page);
   await cdp.send('Network.enable');await cdp.send('Performance.enable');
   if(mobile){await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:150,downloadThroughput:200000,uploadThroughput:93750});}
   let bytes=0,requests=0;const failures=[],errors=[],offsets=[];
   cdp.on('Network.loadingFinished',e=>bytes+=e.encodedDataLength);
   page.on('request',()=>requests++);page.on('pageerror',e=>errors.push(e.message));
   page.on('response',r=>{if(r.status()>=400)failures.push({url:new URL(r.url()).pathname,status:r.status()});if(new URL(r.url()).pathname==='/api/library')offsets.push(Number(new URL(r.url()).searchParams.get('offset')||0));});
   const sample=async(label)=>{
    await page.waitForTimeout(500);
    const metrics=await page.evaluate(()=>({...window.__perf,domNodes:document.querySelectorAll('*').length,renderedCards:document.querySelectorAll('.poster-card').length,storageBytes:Object.values(sessionStorage).reduce((s,v)=>s+v.length*2,0)}));
    const heap=await cdp.send('Runtime.getHeapUsage');
    return {label,...metrics,heapUsedBytes:heap.usedSize,networkBytes:bytes,requests,offsets:[...offsets]};
   };
   const url='http://127.0.0.1:8765/library?type=movie&query=Film';
   const start=performance.now();await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.locator('.poster-card').first().waitFor({state:'visible',timeout:60000});
   const usefulMs=performance.now()-start;
   const cold=await sample('cold');
   for(let i=0;i<12;i++){await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(mobile?700:250);}
   const scroll=await sample('scroll');
   await page.goto('http://127.0.0.1:8765/analytics',{waitUntil:'domcontentloaded'});await page.waitForTimeout(mobile?2000:1000);
   const back=performance.now();await page.goto(url,{waitUntil:'domcontentloaded'});
   await page.locator('.poster-card').first().waitFor({state:'attached',timeout:60000});
   const warmUsefulMs=performance.now()-back;const warm=await sample('warm');
   results.push({mobile,run,profile:mobile?'390x844 CPUx4 1.6Mbps RTT150ms':'1440x900 unthrottled',usefulMs,warmUsefulMs,cold,scroll,warm,failures,errors});
   await context.close();
  }
 }
} finally {await browser.close();await mkdir('docs/performance-results/lot0',{recursive:true});await writeFile(`docs/performance-results/lot0/${profile}-browser.json`,JSON.stringify(results,null,2)+'\n');}
