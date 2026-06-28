import puppeteer from 'puppeteer';
const browser = await puppeteer.launch({ executablePath: '', headless: 'new', args: ['--no-sandbox','--disable-setuid-sandbox','--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errs=[]; const media=[];
page.on('pageerror', e=>errs.push('PAGEERROR: '+e.message));
page.on('console', m=>{ if(m.type()==='error') errs.push('console.error: '+m.text()); });
page.on('response', r=>{ const u=r.url(); if(/\.(mp4|webm|mov|m3u8)(\?|$)/i.test(u)||/video/i.test(u)) media.push(r.status()+' '+u.slice(0,140)); });
try { await page.goto('https://flexamarket.com/videos', { waitUntil:'networkidle2', timeout:45000 }); } catch(e){ errs.push('GOTO: '+e.message); }
await new Promise(r=>setTimeout(r,6000));
const vinfo = await page.evaluate(()=>{ const vs=[...document.querySelectorAll('video')]; return vs.map(v=>({src:(v.currentSrc||v.src||'').slice(0,160), readyState:v.readyState, networkState:v.networkState, paused:v.paused, err: v.error? (v.error.code+':'+v.error.message):null, w:v.videoWidth,h:v.videoHeight})); });
console.log('VIDEOS ON PAGE:', JSON.stringify(vinfo,null,2));
console.log('MEDIA REQUESTS:', media.join('\n')||'(none)');
console.log('ERRORS:', errs.join('\n')||'(none)');
await browser.close();
