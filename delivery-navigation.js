'use strict';
// Shared, offline delivery catalog. Display names do not depend on file names.
const fs = require('fs');
const path = require('path');
const { wrapDocument } = require('./render-md');
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const url = value => String(value).split('/').map(part => encodeURIComponent(part)).join('/');
const known = {
    '1_facilitator-guide': ['讲师手册', 'teaching', '课前／课中', '备课、逐模块授课与巡场指引'],
    '2_workbook': ['学员手册', 'student', '课中', '练习任务、提交要求与填写区'],
    '3_rubric': ['考核评分量规', 'teaching', '课中／课后', '讲师评分、缺项记录与补交复核'],
    '4_action-plan': ['行动承诺与复盘', 'student', '课后', '个人行动计划与实施记录'],
    '5_assessment': ['课程评估与考核方案', 'teaching', '课中／课后', '反馈收集、作品考核与成绩记录'],
    '6_facilitation': ['教学活动与运行卡', 'teaching', '课前／课中', '时间轴、活动指令与助教配合'],
    '7_alignment': ['学习目标、教学与考核对应表', 'design', '备课参考', '了解每个目标在哪里教、如何判断达标'],
    '8_content-dev': ['内容开发与本地化说明', 'design', '课程开发参考', '案例来源、专家访谈与维护安排'],
    '9_pocket-cards': ['学员口袋卡', 'student', '课中／课后', '任务提示与验收要点'],
    '10_activity-cards': ['学员活动任务卡', 'student', '课中', '课堂活动的学员指令与记录区'],
    '14_pre-course-questionnaire': ['课前问卷与准备检查', 'student', '课前7天', '学习需求、环境与练习条件；由讲师／助教处理未完成项'],
    '15_course-feedback': ['课后反馈问卷', 'student', '结课前', '用于课程改进，不代替作品考核'],
    '13_material-sources': ['素材来源与使用范围', 'technical', '素材维护', '第三方素材归属与替换要求'],
    '12_sme-interview': ['业务专家访谈提纲', 'design', '课程开发参考', '客户本地化时收集任务、失败过程与验收口径'],
    '11_activity-key': ['活动任务卡讲评', 'teaching', '课中', '讲师讲评依据；不发给学员'],
};
function documentInfo(filename, md, audience) {
    const stem = filename.replace(/\.(md|html)$/, '');
    const defaults = known[stem];
    return { title: defaults?.[0] || (String(md).match(/^#\s+(.+)$/m) || [])[1] || stem,
        kind: defaults?.[1] || (audience === 'student' ? 'student' : 'teaching'),
        stage: defaults?.[2] || '', description: defaults?.[3] || '' };
}
function rewriteMarkdownLinks(md, outputFile, root) {
    // Rendered documents live next to retained Markdown or under html/. Only
    // switch links when the sibling HTML really exists inside this package.
    return String(md).replace(/\]\(([^\s)]+)\)/g, (whole, href) => {
        if (/^(?:[a-z]+:|\/|#)/i.test(href)) return whole;
        const [pathname, fragment] = href.split('#');
        let decoded;
        try { decoded = decodeURIComponent(pathname); } catch { return whole; }
        if (!decoded.endsWith('.md')) return whole;
        const target = path.resolve(path.dirname(outputFile), decoded.replace(/\.md$/, '.html'));
        const relative = path.relative(root, target);
        if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(target)) return whole;
        return `](${pathname.replace(/\.md$/, '.html')}${fragment ? '#'+fragment : ''})`;
    });
}
const catalogCss = `
.catalog { --c-bg:#faf8f3; --c-bg-soft:#f1eee6; --c-card:#f5f1e8; --c-fg:#211f1c; --c-muted:#6e695f; --c-line:#e2ddd0; --c-accent:#1f4e79; color:var(--c-fg); background:var(--c-bg); }
.catalog.doc { max-width:1000px; box-shadow:none; border-radius:0; padding:3rem 2.5rem; }
.catalog h1 { font-family:'Noto Serif SC','Songti SC',Georgia,serif; font-size:clamp(1.8rem,4vw,2.6rem); font-weight:600; }
.catalog .doc-head { border-bottom:1px solid var(--c-line); }
.catalog .intro { color:var(--c-muted); }
.catalog details { background:var(--c-card); border-radius:16px; margin:1rem 0; padding:1.2rem 1.4rem; }
.catalog summary { cursor:pointer; font-size:1.25rem; font-weight:600; }
.catalog summary small { display:inline-block; margin-left:.7rem; font-size:.85rem; font-weight:400; color:var(--c-muted); }
.catalog .case-group {padding:.7rem 1rem;background:var(--c-bg-soft);margin:.4rem 0;}
.catalog .case-group summary{font-size:1rem;}
.catalog h3 { color:var(--c-fg); margin:1.4rem 0 .6rem; }
.catalog ul { padding-left:1.3rem; }
.catalog li { margin:.65rem 0; overflow-wrap:anywhere; }
.catalog a { color:var(--c-accent); border-bottom:0; }
.catalog .description { display:block; font-size:.9rem; color:var(--c-muted); }
.catalog .location { display:block; font-size:.75rem; color:var(--c-muted); overflow-wrap:anywhere; }
.catalog .section-note { font-size:.9rem; }
.catalog .actions { display:flex; gap:.7rem; flex-wrap:wrap; margin:1.5rem 0; }
.catalog button { border:1px solid var(--c-line); border-radius:9px; background:var(--c-bg); padding:.5rem .9rem; color:var(--c-fg); cursor:pointer; font:inherit; }
.catalog :is(a,button,summary):focus-visible { outline:3px solid var(--c-accent); outline-offset:4px; }
@media(max-width:600px){ .catalog.doc {margin:0;padding:1.5rem 1rem;} .catalog details{padding:1rem;} .catalog summary small{display:block;margin:.2rem 0 0;} }
@media print { .catalog.doc{max-width:none;margin:0;padding:0;background:white;} .catalog details{background:white;border-radius:0;padding:.6rem 0;break-inside:auto;} .catalog details::details-content{content-visibility:visible!important;display:block!important;} .catalog .actions{display:none;} .catalog summary{list-style:none;} .catalog li{break-inside:avoid;} }
`;
function rowsHtml(rows, prefix) {
    return `<ul>${rows.map(row => {
        if (row.rows) return `<li><details class="case-group"><summary>${esc(row.title)}</summary>${row.description ? `<p class="section-note">${esc(row.description)}</p>` : ''}${rowsHtml(row.rows, prefix)}</details></li>`;
        const href = prefix + row.href;
        return `<li><a href="${esc(url(href))}">${esc(row.title)}</a>${row.description || row.stage ? `<span class="description">${esc([row.stage,row.description].filter(Boolean).join(' · '))}</span>` : ''}${row.location ? `<span class="location">文件位置：${esc(row.location)}</span>` : ''}</li>`;
    }).join('')}</ul>`;
}
function writeCatalog({ file, title, subtitle, sections, css, prefix = '', intro = '', back }) {
    const body = `<article class="doc catalog"><header class="doc-head"><h1>${esc(title)}</h1><div class="doc-course">${esc(subtitle)}</div></header>${back ? `<p><a href="${esc(url(back))}">返回交付目录</a></p>` : ''}<p class="intro">${esc(intro)}</p><div class="actions"><button type="button" data-expand="true">展开全部</button><button type="button" data-expand="false">收起全部</button></div>${sections.filter(section=>section.rows.length).map(section => `<details${section.open ? ' open' : ''}><summary>${esc(section.title)}${section.subtitle ? `<small>${esc(section.subtitle)}</small>` : ''}</summary>${section.note ? `<p class="section-note">${esc(section.note)}</p>` : ''}${rowsHtml(section.rows, prefix)}</details>`).join('')}</article>`;
    const script = `<script>document.querySelectorAll('[data-expand]').forEach(b=>b.addEventListener('click',()=>document.querySelectorAll('details').forEach(d=>d.open=b.dataset.expand==='true')));let before;addEventListener('beforeprint',()=>{before=[...document.querySelectorAll('details')].map(d=>d.open);document.querySelectorAll('details').forEach(d=>d.open=true)});addEventListener('afterprint',()=>{if(before)document.querySelectorAll('details').forEach((d,i)=>d.open=before[i])});</script>`;
    const shell = wrapDocument({title,subtitle,md:'',css:css+catalogCss,toc:false});
    fs.mkdirSync(path.dirname(file), {recursive:true});
    fs.writeFileSync(file, shell.replace(/<article class="doc">[\s\S]*?<\/article>/, body).replace('</body>', script+'</body>'));
}
module.exports = { documentInfo, rewriteMarkdownLinks, writeCatalog, url };

function createDeliveryEntry({courseDir, outputDir, packageRoot, audience, composed}) {
    const css = fs.readFileSync(path.join(packageRoot,'shared_styles/package-doc.css'),'utf8');
    const metaFile = path.join(courseDir,'course.meta.md');
    const meta = fs.existsSync(metaFile) ? fs.readFileSync(metaFile,'utf8') : '';
    const title = (meta.match(/^title:\s*["']?(.+?)["']?\s*$/m)||[])[1] || path.basename(courseDir);
    const count = (fs.readFileSync(path.join(outputDir,'deck.html'),'utf8').match(/<section\b/g)||[]).length;
    const technicalDir = path.join(outputDir,'technical');
    fs.mkdirSync(technicalDir,{recursive:true});
    const technical = `# 课件技术说明\n\n## 版本与生成时间\n\n课程：${title}。生成时间：${new Date().toISOString()}。引擎版本：${JSON.parse(fs.readFileSync(path.join(packageRoot,'package.json'),'utf8')).version}。\n\n## 阅读与演示\n\n用本地 Chrome、Chromium 或 Edge 打开交付目录 index.html。整包可以离线阅读和演示；实际课程中的在线工具、模型、技能和连接器需要课堂网络与对应账号。课件按 S 打开演讲者视图。\n\n## 文件使用\n\n${audience==='facilitator'?'讲师目录包含答案和量规。学员目录可独立阅读；存在分阶段案例时按讲师手册和发放入口操作，勿在开场发出完整包。逐页讲师备注保留 Markdown，可用文本编辑器或 Markdown 阅读器打开。':'按讲师安排领取与使用练习材料，完成后保存作品与核验记录。'}\n\n## 内容修改与重建\n\nHTML 是生成文件。修改教学内容时编辑课程的教学设计 Markdown、交付 Markdown 和页面源，再运行 check、build、notes、package --render、export --with-package。组合课程通过 --recipe 选择配方；讲师完整导出增加 --audience facilitator。学员导出默认使用 student。不要直接修改 .build 或导出的 HTML；生成物被编辑时应先保存改动再回到源文件修订。\n\n## 使用边界\n\n技术打包与离线演示不代表在线产品在每个账号上均可用；开班前按讲师手册确认安装、网络和课堂演示。案例中的虚构数据、历史报告及第三方素材说明以材料和来源说明为准。\n`;
    fs.writeFileSync(path.join(technicalDir,'index.html'),wrapDocument({title:'课件技术说明',subtitle:title,md:technical,css}));
    const technicalRows = [];
    const sections = [{title:'课件',open:true,subtitle:`${count}页`,rows:[{title:`课堂展示课件（${count}页）`,href:'deck.html',description:'上课展示；S 键打开演讲者视图',location:'deck.html'}]}];
    const prefixRows = (rows,prefix) => rows.map(row=>row.rows?{...row,rows:prefixRows(row.rows,prefix)}:{...row,href:prefix+row.href});
    if (composed) {
        const readCatalog = name => JSON.parse(fs.readFileSync(path.join(outputDir,name,'catalog.json'),'utf8'));
        const primary = audience==='facilitator'?'facilitator':'package';
        const catalog = readCatalog(primary);
        if (audience === 'facilitator') {
            const designDir = path.join(outputDir,'design/html');
            fs.mkdirSync(designDir,{recursive:true});
            const designRows = [];
            for (const [filename,label] of [['course.blueprint.md','课程设计蓝图'],['course.meta.md','课程大纲']]) {
                const source = path.join(courseDir,filename);
                if (!fs.existsSync(source)) continue;
                const output = path.join(designDir,filename.replace(/\.md$/,'.html'));
                let md = fs.readFileSync(source,'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/,'');
                if (!/^#\s/m.test(md)) md = '# '+label+'\n\n'+md;
                fs.writeFileSync(output,wrapDocument({title:label,subtitle:title,md,css}));
                designRows.push({title:label,href:`design/html/${filename.replace(/\.md$/,'.html')}`,description:filename.includes('blueprint')?'定位、学习目标、模块与教学设计逻辑':'教学顺序与页面内容',location:`design/html/${filename.replace(/\.md$/,'.html')}`});
            }
            technicalRows.push(...prefixRows(catalog.documents.filter(d=>d.kind==='technical'),'facilitator/'));
            designRows.push(...prefixRows(catalog.documents.filter(d=>d.kind==='design'),'facilitator/'));
            sections.push({title:'课程蓝图',rows:designRows,note:'供新讲师理解课程设计；课程开发参考资料用于客户本地化。'});
            sections.push({title:'授课资料',open:true,rows:[...prefixRows(catalog.documents.filter(d=>d.kind==='teaching'),'facilitator/'),...prefixRows(catalog.cases,'facilitator/')],note:'讲师版含答案与量规；学员版见下一板块。分阶段案例使用下面的阶段发放入口，勿提前发出完整材料。'});
            const student = readCatalog('student');
            sections.push({title:'学员资料',rows:[...prefixRows(student.documents,'student/'),...prefixRows(student.cases,'student/')],note:'对学员使用独立 student 目录。完整材料清单包含后续阶段文件，按讲师指定时点逐项发放。'});
            const handout = path.join(courseDir,'handout.md');
            if (fs.existsSync(handout)) {
                fs.copyFileSync(handout,path.join(outputDir,'facilitator/handout.md'));
                sections[0].rows.push({title:'逐页讲师备注',href:'facilitator/handout.md',description:'Markdown 文档；与课件页序一致',location:'facilitator/handout.md'});
            }
        } else {
            sections.push({title:'学员资料',open:true,rows:[...prefixRows(catalog.documents,'package/'),...prefixRows(catalog.cases,'package/')]});
        }
    } else {
        const dir = path.join(outputDir,'package');
        const rows = fs.readdirSync(dir).filter(f=>f.endsWith('.html')&&f!=='0_index.html').map(f=>({title:documentInfo(f,'',audience).title,href:'package/'+f}));
        sections.push({title:'课程资料',open:true,rows});
    }
    sections.push({title:'课件技术说明',rows:[{title:'版本、演示与内容修改说明',href:'technical/index.html',location:'technical/index.html'},...technicalRows]});
    writeCatalog({file:path.join(outputDir,'index.html'),title,subtitle:audience==='facilitator'?'讲师完整交付包':'学员交付包',sections,css,intro:audience==='facilitator'?'从课件开始备课，结合课程蓝图理解设计，按授课资料组织教学与分步发放。':'按讲师安排阅读课件、使用练习材料并提交作品。'});
}
module.exports.createDeliveryEntry = createDeliveryEntry;
