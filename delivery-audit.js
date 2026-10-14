'use strict';
// Optional Playwright/Poppler acceptance gate. No user browser/profile or network.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const { spawnSync } = require('node:child_process');
const { findChrome } = require('./paths');
const RECEIPT = 'delivery.receipt.json';
const ORIGIN = 'https://nextcourse.invalid';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const evidenceName = file => file.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100)+'-'+hash(file).slice(0,16);
function listFiles(root, dir = root) {
    return fs.readdirSync(dir, { withFileTypes: true }).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0).flatMap(entry => {
        const file = path.join(dir,entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Delivery contains a symbolic link: ${file}`);
        return entry.isDirectory() ? listFiles(root,file) : [path.relative(root,file).split(path.sep).join('/')];
    });
}
function inventory(root) {
    return listFiles(root).filter(file=>file!==RECEIPT).map(file=>({path:file,hash:hash(fs.readFileSync(path.join(root,file)))}));
}
function contentHash(root) { return hash(JSON.stringify(inventory(root))); }
function inside(root, relative) {
    const target = path.resolve(root, relative);
    const rel = path.relative(root,target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`Delivery path escapes root: ${relative}`);
    return target;
}
function resolveRequest(root, requestedUrl) {
    const url = new URL(requestedUrl);
    if (url.origin !== ORIGIN) throw new Error(`External browser request blocked: ${url.origin}`);
    const relative = decodeURIComponent(url.pathname).replace(/^\//,'') || 'index.html';
    const target = inside(root,relative);
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new Error(`Missing browser resource: ${relative}`);
    return target;
}
function inspectStatic(root) {
    const files = listFiles(root);
    const html = files.filter(file=>file.endsWith('.html') && !file.startsWith('lib/'));
    if (!html.includes('index.html')) throw new Error('Delivery entry index.html is missing.');
    let links=0;
    for (const file of files.filter(f=>/\.(?:html|css)$/.test(f) && !f.startsWith('lib/'))) {
        const text=fs.readFileSync(path.join(root,file),'utf8');
        if(file.endsWith('.html') && /<blockquote>\s*<strong>待补<\/strong>/i.test(text)) throw new Error(`Unfinished authoring placeholder: ${file}`);
        const refs=file.endsWith('.css') ? [...text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)] : [...text.matchAll(/\b(?:href|src)=["']([^"']+)["']/g)];
        for(const [,ref] of refs) {
            if (/^(?:https?:|mailto:|data:|#|javascript:|about:|\/\/)/i.test(ref)) continue;
            if (/^(?:file:|\/)/i.test(ref)) throw new Error(`Non-portable delivery link: ${file}: ${ref}`);
            const relative = decodeURIComponent(ref.split(/[?#]/)[0]);
            if (!relative) continue;
            const target = inside(root,path.posix.join(path.posix.dirname(file),relative));
            if (!fs.existsSync(target)) throw new Error(`Broken delivery link: ${file}: ${ref}`);
            if (file.startsWith('student/') && !path.relative(root,target).split(path.sep).join('/').startsWith('student/')) throw new Error(`Student link leaves its package: ${ref}`);
            links++;
        }
    }
    for (const file of files.filter(f=>f.startsWith('student/'))) if (/(?:^|\/)(?:facilitator|generator|answer-key|test-mails)(?:\/|$)/.test(file)) throw new Error(`Student package contains restricted material: ${file}`);
    return {files:files.length, links, html};
}
function loadPlaywright() {
    if (process.env.NEXTCOURSE_PLAYWRIGHT_MODULE) return require(path.resolve(process.env.NEXTCOURSE_PLAYWRIGHT_MODULE));
    for (const base of [__filename,path.join(process.cwd(),'package.json')]) {
        try { return createRequire(base)('playwright-core'); } catch(error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
    }
    throw new Error('Playwright is required for delivery acceptance. Install playwright-core in the workspace, or set NEXTCOURSE_PLAYWRIGHT_MODULE. Draft export: --draft (not deliverable).');
}
function checkDependencies() {
    const missing=[];
    let playwright;
    try {playwright=loadPlaywright();} catch(error) {missing.push(error.message);}
    const bundled=playwright?.chromium?.executablePath();
    const chrome=findChrome() || (bundled && fs.existsSync(bundled) ? bundled : null);
    if (!chrome) missing.push('Chrome/Chromium/Edge not found; set CHROME_PATH.');
    for (const tool of ['pdfinfo','pdftotext','pdftoppm']) if (spawnSync(tool,['-v'],{encoding:'utf8',timeout:10000}).error) missing.push(`Missing Poppler tool ${tool}.`);
    return {ready:!missing.length,missing,playwright,chrome};
}
function runTool(tool,args) {
    const result=spawnSync(tool,args,{encoding:'utf8',timeout:30000,maxBuffer:32*1024*1024});
    if(result.error || result.status!==0) throw new Error(`${tool}: ${result.error?.message || result.stderr || result.status}`);
    return result.stdout;
}
function decodeXml(text) { return text.replace(/&(?:amp|lt|gt|quot|apos);/g,s=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[s])); }
function inspectPdf(pdf, headings=[]) {
    const info=runTool('pdfinfo',[pdf]);
    const count=Number((info.match(/^Pages:\s*(\d+)/m)||[])[1]);
    if (!count) throw new Error(`PDF has no pages: ${pdf}`);
    const xml=runTool('pdftotext',['-bbox-layout',pdf,'-']);
    const pages=[...xml.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)];
    if(pages.length!==count) throw new Error('PDF page count and extracted pages disagree.');
    let words=0;
    for (const [i,page] of pages.entries()) {
        const width=Number(page[1]),height=Number(page[2]);
        const matches=[...page[3].matchAll(/<word xMin="([\d.-]+)" yMin="([\d.-]+)" xMax="([\d.-]+)" yMax="([\d.-]+)">([\s\S]*?)<\/word>/g)];
        if (!matches.length) throw new Error(`Blank or unreadable PDF page ${i+1}: ${pdf}`);
        words+=matches.length;
        for(const word of matches) if(Number(word[1])<12 || Number(word[2])<12 || Number(word[3])>width-12 || Number(word[4])>height-12) throw new Error(`PDF text clipped/too near page edge on page ${i+1}: ${pdf}`);
        const lines=[...page[3].matchAll(/<line\b[^>]*yMax="([\d.]+)"[^>]*>([\s\S]*?)<\/line>/g)];
        const last=lines.at(-1);
        if(last && i<count-1 && Number(last[1])>height*.8) {
            const line=decodeXml(last[2].replace(/<[^>]+>/g,'')).replace(/\s+/g,'');
            if(headings.some(h=>h.replace(/\s+/g,'')===line)) throw new Error(`Orphaned heading on PDF page ${i+1}: ${line}`);
        }
    }
    return {pages:count,words,bytes:fs.statSync(pdf).size};
}
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.md':'text/plain; charset=utf-8'};
async function runAudit(root, evidenceDir, {onProgress=()=>{}}={}) {
    root=path.resolve(root);evidenceDir=path.resolve(evidenceDir);
    if (evidenceDir===root || !path.relative(root,evidenceDir).startsWith('..')) throw new Error('Acceptance evidence must be outside the delivery directory.');
    fs.mkdirSync(evidenceDir,{recursive:true});
    const report={schemaVersion:1,auditVersion:1,status:'failed',startedAt:new Date().toISOString(),checks:[],documents:[],errors:[],contentHash:null};
    let browser;
    try {
        const initial=contentHash(root);
        const checked=inspectStatic(root);
        report.checks.push({name:'portable-links-and-student-isolation',passed:true,files:checked.files,links:checked.links});
        const deps=checkDependencies();if(!deps.ready) throw new Error(deps.missing.join('\n'));
        browser=await deps.playwright.chromium.launch({executablePath:deps.chrome,headless:true,timeout:30000});
        report.browser=await browser.version();
        const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block',acceptDownloads:false});
        const resourceErrors=[];
        await context.route('**/*',async route=>{
            try {
                const file=resolveRequest(root,route.request().url());
                await route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
            } catch(error) { resourceErrors.push(error.message);await route.abort(); }
        });
        const toUrl=file=>ORIGIN+'/'+file.split('/').map(encodeURIComponent).join('/');
        const page=await context.newPage();page.setDefaultTimeout(15000);
        const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')pageErrors.push(message.text());});
        const documentFiles=checked.html.filter(file=>file!=='deck.html' && !fs.readFileSync(path.join(root,file),'utf8').includes('class="reveal"'));
        for (const [i,file] of documentFiles.entries()) {
            onProgress(`Browser/print ${i+1}/${documentFiles.length}: ${file}`);
            await page.setViewportSize({width:1440,height:1000});
            await page.emulateMedia({media:'screen'});
            await page.goto(toUrl(file),{waitUntil:'load',timeout:30000});
            await page.evaluate(()=>document.fonts.ready);
            const broken=await page.locator('img').evaluateAll(images=>images.filter(img=>!img.complete||!img.naturalWidth).map(img=>img.getAttribute('src')));
            if (broken.length) throw new Error(`Broken images in ${file}: ${broken.join(', ')}`);
            const catalog=await page.locator('[data-expand="true"]').count()>0;
            if(catalog) {
                await page.locator('[data-expand="false"]').click();
                if(await page.locator('details[open]').count()) throw new Error(`Collapse failed: ${file}`);
                await page.locator('summary').first().focus();await page.keyboard.press('Enter');
                if(!await page.locator('details').first().evaluate(d=>d.open)) throw new Error(`Keyboard disclosure failed: ${file}`);
                await page.locator('[data-expand="true"]').click();
                if(await page.locator('details:not([open])').count()) throw new Error(`Expand failed: ${file}`);
                // Follow an actual document link and navigate back to prove the path is usable.
                const link=page.locator('a[href$=".html"]:not([href^="http"]):not([href^="//"])').first();
                if(await link.count()) {const href=await link.getAttribute('href');await link.click();await page.waitForURL(new URL(href,toUrl(file)).href);await page.goBack();await page.locator('[data-expand="true"]').click();}
            }
            for (const width of [1440,390]) {
                await page.setViewportSize({width,height:1000});
                const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
                if (overflow) throw new Error(`Horizontal overflow at ${width}px: ${file}`);
            }
            await page.setViewportSize({width:1440,height:1000});
            const key=evidenceName(file);
            await page.screenshot({path:path.join(evidenceDir,key+'.png'),fullPage:true});
            const headings=await page.locator('h1,h2,h3,h4').allTextContents();
            const printedUrls=await page.locator('a[href^="http"]').evaluateAll(links=>links.map(link=>link.getAttribute('href')));
            const printRows=await page.locator('tr').allTextContents();
            const printContent=await page.locator('h1,h2,h3,h4,p,th,td,pre,blockquote,li').evaluateAll(elements=>elements.filter(el=>!el.closest('nav,button') && !(el.tagName==='LI' && el.querySelector('li,p,table,details'))).map(el=>el.textContent));
            // Native Chromium printing invokes beforeprint/afterprint; test restoration too.
            let states;
            if(catalog) {await page.locator('[data-expand="false"]').click();states=await page.locator('details').evaluateAll(ds=>ds.map(d=>d.open));}
            await page.emulateMedia({media:'print'});
            const pdf=path.join(evidenceDir,key+'.pdf');
            await page.pdf({path:pdf,format:'A4',printBackground:true,preferCSSPageSize:true,displayHeaderFooter:false,margin:{top:'18mm',right:'18mm',bottom:'18mm',left:'18mm'}});
            if(catalog) {
                const restored=await page.locator('details').evaluateAll(ds=>ds.map(d=>d.open));
                if(JSON.stringify(restored)!==JSON.stringify(states)) throw new Error(`Print state restoration failed: ${file}`);
                const extracted=runTool('pdftotext',[pdf,'-']);
                const normalize=s=>s.normalize('NFKC').replace(/\s+/g,'');
                const titles=await page.locator('summary').allTextContents();
                for(const title of titles) if(!normalize(extracted).includes(normalize(title))) throw new Error(`Collapsed content missing from print: ${file}: ${title}`);
            }
            const printed=inspectPdf(pdf,headings);
            const baseNormalize=s=>s.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu,'');
            // Standard print CSS appends external URL text inside paragraphs/cells.
            const normalizeContent=s=>{let text=baseNormalize(s);for(const url of printedUrls){const value=baseNormalize(url);if(value)text=text.replaceAll(value,'');}return text;};
            const pdfText=normalizeContent(runTool('pdftotext',['-raw',pdf,'-']));
            for(const text of printContent) {
                const expected=normalizeContent(text);
                if(expected && !pdfText.includes(expected)) throw new Error(`Text missing or clipped in print: ${file}: ${text.trim().slice(0,100)}`);
            }
            const printedPages=runTool('pdftotext',['-raw',pdf,'-']).split('\f').map(normalizeContent);
            for(const row of printRows) {const expected=normalizeContent(row);if(expected && !printedPages.some(p=>p.includes(expected)))throw new Error(`Table row split or clipped in print: ${file}: ${row.trim().slice(0,80)}`);}
            report.documents.push({file,screenshot:key+'.png',pdf:key+'.pdf',screen:true,narrowScreen:true,interaction:catalog,print:true,...printed});
        }
        const deck=checked.html.find(file=>file==='deck.html') || (fs.readFileSync(path.join(root,'index.html'),'utf8').includes('class="reveal"')?'index.html':null);
        if(deck) {
            onProgress('Browser: all slide overflow and navigation');
            await page.emulateMedia({media:'screen'});await page.setViewportSize({width:1600,height:900});
            await page.goto(toUrl(deck)+'?check=overflow',{waitUntil:'load'});
            const result=await page.locator('#overflow-report').textContent({timeout:30000});
            if(!/^OVERFLOW 0(?:\n|$)/.test(result.trim())) throw new Error(`Slide overflow: ${result}`);
            await page.goto(toUrl(deck),{waitUntil:'load'});
            await page.waitForFunction(()=>typeof deck!=='undefined' && deck.isReady());
            const slides=await page.evaluate(()=>deck.getTotalSlides());
            await page.keyboard.press('ArrowRight');
            if(slides>1 && await page.evaluate(()=>deck.getIndices().h)===0) throw new Error('Slide keyboard navigation failed.');
            await page.screenshot({path:path.join(evidenceDir,'deck.png')});
            report.checks.push({name:'slide-overflow-and-navigation',passed:true,slides});
        }
        if(resourceErrors.length||pageErrors.length) throw new Error([...new Set([...resourceErrors,...pageErrors])].join('\n'));
        if(contentHash(root)!==initial) throw new Error('Delivery changed during acceptance.');
        report.checks.push({name:'browser-documents-and-print',passed:true,documents:report.documents.length,pages:report.documents.reduce((n,d)=>n+d.pages,0)});
        report.status='passed';report.contentHash=initial;
    } catch(error) {report.errors.push(error.message);}
    finally {if(browser)await browser.close();report.finishedAt=new Date().toISOString();fs.writeFileSync(path.join(evidenceDir,'report.json'),JSON.stringify(report,null,2)+'\n');}
    return report;
}
function writeReceipt(root,report) {
    if(report.status!=='passed' || report.contentHash!==contentHash(root)) throw new Error('Cannot certify a failed or stale delivery.');
    const receipt={schemaVersion:1,status:'passed',auditVersion:1,verifiedAt:report.finishedAt,contentHash:report.contentHash,checks:report.checks,files:inventory(root)};
    fs.writeFileSync(path.join(root,RECEIPT),JSON.stringify(receipt,null,2)+'\n');
    return receipt;
}
function verifyReceipt(root) {
    try {const receipt=JSON.parse(fs.readFileSync(path.join(root,RECEIPT)));return receipt.status==='passed'&&receipt.auditVersion===1&&receipt.contentHash===contentHash(root);}catch{return false;}
}
module.exports={runAudit,writeReceipt,verifyReceipt,inspectStatic,inspectPdf,inventory,contentHash,resolveRequest,checkDependencies,evidenceName};
