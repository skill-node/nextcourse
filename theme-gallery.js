#!/usr/bin/env node
/**
 * theme-gallery.js — 生成配色/字体主题展板
 *
 *   node theme-gallery.js
 *   → theme-gallery/index.html + theme-gallery/<theme>.html（每套配色一页）
 *
 * 展板页面只负责结构；色值和字体栈全部在浏览器里从真实加载的
 * shared_styles/*.css 读出来（见 theme-gallery/gallery.js）。
 * 所以改了配色 CSS 不用重跑本脚本，刷新页面即可；只有新增/删除配色、
 * 或改了 build.js 的字体默认映射时才需要重新生成。
 *
 * 中 / EN：页面里所有静态文案都用 L(zh, en) 输出成一对 span，
 * 靠 <html data-lang> 切换显示（见 gallery.css 顶部）。语言状态存在
 * localStorage 的 'lang' 键里 —— 和 nextskill.cc 主站同一个约定，
 * 从主站切成英文再点进展板不会打回中文。
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SCHEME_DIR = path.join(ROOT, 'shared_styles', 'color-schemes');
const FONTSET_DIR = path.join(ROOT, 'shared_styles', 'font-sets');
const OUT_DIR = path.join(ROOT, 'theme-gallery');

/* ------------------------------------------------------------------ *
 * 读取源数据
 * ------------------------------------------------------------------ */

// 配色 → 默认字体集的权威来源是 build.js，这里直接从它的源码里抠出来，
// 避免展板和实际构建结果说的不是一回事。
function readDefaultFontSets() {
    const src = fs.readFileSync(path.join(ROOT, 'build.js'), 'utf8');
    const block = src.match(/const DEFAULT_FONT_SET\s*=\s*\{([\s\S]*?)\}/);
    if (!block) {
        console.warn('WARN: 没能从 build.js 解析出 DEFAULT_FONT_SET，字体一栏将全部回退到 modern-sans');
        return {};
    }
    const map = {};
    for (const m of block[1].matchAll(/'([^']+)'\s*:\s*'([^']+)'/g)) map[m[1]] = m[2];
    return map;
}

// 每个配色 CSS 的头注释里有一行人话描述和「适用于」，拿来当展板简介。
// 英文版走同一个头注释里的 `EN tagline:` / `EN use:` 两行 —— 配色 CSS
// 仍然是唯一事实来源，不在生成器里另立一张翻译表。
function readSchemeMeta(cssPath) {
    const src = fs.readFileSync(cssPath, 'utf8');
    const header = src.slice(0, src.indexOf('*/') + 2);
    const titleLine = header.match(/^\s*(.+?)\s*(?:—|-)\s*(.+)$/m);
    const useFor = header.match(/适用于[：:]\s*(.+)/);
    const fontHint = header.match(/默认字体集[：:]\s*([a-z-]+)/);
    const taglineEn = header.match(/EN tagline[：:]\s*(.+)/);
    const useForEn = header.match(/EN use[：:]\s*(.+)/);

    // 头注释第一行有两种写法：
    //   「Bold Signal — 高对比深色 + 亮色卡片」
    //   「深海配色方案 (Dark Ocean Color Scheme)」
    const lines = header.split('\n').map((l) => l.replace(/^[\s/*=]+|[\s*=]+$/g, '')).filter(Boolean);
    const first = lines.find((l) => l && !l.startsWith('==')) || '';
    const dash = first.split(/\s+—\s+|\s+-\s+/);

    let displayName = (dash[0] || '').trim();
    let tagline = (dash.slice(1).join(' — ') || '').trim();

    // 后一种写法把英文名塞在括号里，展板统一显示英文名，中文名降级为副标题
    const paren = displayName.match(/^(.+?)\s*[(（]\s*(.+?)\s*[)）]\s*$/);
    if (paren) {
        displayName = paren[2].replace(/\s*Color Scheme$/i, '').trim();
        tagline = paren[1].trim() + (tagline ? ' — ' + tagline : '');
    }

    // 有的配色把人话描述写在「实际观感:」那一行
    const feel = header.match(/实际观感[：:]\s*(.+)/);
    if (feel) tagline = feel[1].trim();

    return {
        displayName,
        tagline,
        taglineEn: taglineEn ? taglineEn[1].trim() : '',
        useFor: useFor ? useFor[1].trim() : '',
        useForEn: useForEn ? useForEn[1].trim() : '',
        fontHint: fontHint ? fontHint[1] : null,
        // 生成期解析出来只给 index.html 的缩略图用；详情页一律走运行时取值
        vars: Object.fromEntries(
            [...src.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim)].map((m) => [m[1], m[2].trim()])
        ),
    };
}

// 令牌完备性审计。
// 消费端(themes/ components/ base_layout)里凡是「裸用」var(--x) 且没写兜底值的令牌，
// 配色就必须定义 —— 少一个不会报错，只会让那条规则静默失效（--bg-slide 缺失时
// 每一页的 background-color 都解析不出来，靠透出 body 蒙混过关，就是这么躲过去的）。
function auditTokens(schemeIds) {
    const read = (p) => fs.readFileSync(path.join(ROOT, 'shared_styles', p), 'utf8');
    const bare = new Set();
    for (const f of ['themes/standard.css', 'components.css', 'base_layout.css']) {
        for (const m of read(f).matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,)?/g)) {
            if (!m[2]) bare.add(m[1]);
        }
    }
    // tokens.css / base_layout.css 自己定义的结构令牌不归配色管
    const structural = new Set();
    for (const f of ['tokens.css', 'base_layout.css']) {
        for (const m of read(f).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) structural.add(m[1]);
    }
    const required = [...bare].filter((t) => !structural.has(t)).sort();

    let bad = 0;
    for (const id of schemeIds) {
        const src = fs.readFileSync(path.join(SCHEME_DIR, id + '.css'), 'utf8');
        const have = new Set([...src.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
        const miss = required.filter((t) => !have.has(t));
        if (miss.length) {
            bad++;
            console.error(`  ! ${id} 缺 ${miss.length} 个必备令牌: ${miss.join(' ')}`);
        }
    }
    if (bad) console.error(`  （共 ${required.length} 个必备令牌；缺失项引用处会静默失效）\n`);
    return bad === 0;
}

function readFontStacks(fontSet) {
    const p = path.join(FONTSET_DIR, fontSet + '.css');
    if (!fs.existsSync(p)) return { display: '', body: '', faceFiles: [], displayWeight: 700 };
    const src = fs.readFileSync(p, 'utf8');
    const d = src.match(/--font-display:\s*([^;]+);/);
    const b = src.match(/--font-body:\s*([^;]+);/);
    const display = d ? d[1].trim() : '';

    // 字体集用 @import 引 lib/fonts/display/*.css（里面只有 @font-face）。
    // 索引页不加载字体集本体（会把 :root 的 --font-* 和 body 字体一起带进来，
    // 八套互相覆盖），所以把 @font-face 那一层单独挑出来给索引页 <link>。
    const faceFiles = [...src.matchAll(/@import\s+url\(['"]?\.\.\/\.\.\/lib\/fonts\/([^'")]+)['"]?\)/g)]
        .map((m) => 'lib/fonts/' + m[1]);

    return { display, body: b ? b[1].trim() : '', faceFiles, displayWeight: maxWeightOf(display, faceFiles) };
}

// 索引页卡片标题原本一律 font-weight:900。Archivo Black 只有 400、Cormorant 到 700，
// 超出的部分浏览器会自己「合成粗体」——描边糊成一团，正好把这套字体的特点抹掉。
// 所以按字面所声明的最大字重来渲染。
function maxWeightOf(stack, faceFiles) {
    const first = (stack.match(/^\s*'([^']+)'/) || [])[1];
    if (!first) return 700;
    for (const rel of faceFiles) {
        const p = path.join(ROOT, rel);
        if (!fs.existsSync(p)) continue;
        const src = fs.readFileSync(p, 'utf8');
        if (!src.includes(`font-family: '${first}'`)) continue;
        const weights = [...src.matchAll(/font-weight:\s*(\d+)(?:\s+(\d+))?/g)]
            .map((m) => Number(m[2] || m[1]));
        if (weights.length) return Math.min(900, Math.max(...weights));
    }
    return 700; // 系统字体集，没有本地 @font-face
}

/* ------------------------------------------------------------------ *
 * HTML 片段
 * ------------------------------------------------------------------ */

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// 双语文案。缺英文时原样输出中文，不留空洞。
const L = (zh, en) => (en
    ? `<span class="l-zh">${zh}</span><span class="l-en">${en}</span>`
    : String(zh));

// 运行时才填的占位符：中英通用，省得为一个瞬间就被覆盖的字做两版
const LOADING = '…';

// 语言引导脚本。放 <head> 里，在首屏绘制之前就把 data-lang 定下来，
// 否则英文用户会先看到一闪而过的中文。
//   · localStorage 'lang' 优先，其次按 navigator.language 探测
//   · 切换时广播 tg:lang，gallery.js 收到后重算并重绘那些运行时拼出来的读数
function langBoot(titleZh, titleEn) {
    return `<script>
(function () {
  var titles = { zh: ${JSON.stringify(titleZh)}, en: ${JSON.stringify(titleEn)} };
  var root = document.documentElement;
  function apply(lang, save) {
    root.dataset.lang = lang;
    root.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.title = titles[lang];
    if (save) { try { localStorage.setItem('lang', lang); } catch (e) {} }
    document.dispatchEvent(new CustomEvent('tg:lang', { detail: lang }));
  }
  var saved = null;
  try { saved = localStorage.getItem('lang'); } catch (e) {}
  var nav = (navigator.language || '').toLowerCase();
  apply(saved === 'en' || saved === 'zh' ? saved : (nav.indexOf('zh') === 0 ? 'zh' : 'en'), false);
  // 事件委托：按钮此刻还没进 DOM，绑在 document 上就不用等 DOMContentLoaded
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('[data-tg-lang]')) return;
    apply(root.dataset.lang === 'en' ? 'zh' : 'en', true);
  });
})();
</script>`;
}

const LANG_BUTTON =
    '<button class="tg-langbtn" type="button" data-tg-lang aria-label="切换语言 / Switch language">中 / EN</button>';

const SEMANTIC_SWATCHES = [
    ['--primary', '标题、强调、数字、边框', 'Headings, emphasis, numbers, borders'],
    ['--primary-dark', '封面标题、深色背景', 'Cover titles, dark backgrounds'],
    ['--secondary', '示例、tip、时间轴结束端', 'Examples, tips, timeline end'],
    ['--accent', '警示、callout、次级强调', 'Warnings, callouts, secondary emphasis'],
    ['--success', 'check-list、vs-good、正面结果', 'check-list, vs-good, positive outcomes'],
    ['--danger', 'vs-bad、错误、反面例子', 'vs-bad, errors, counter-examples'],
];

const SURFACE_SWATCHES = [
    ['--bg-page', '整份 deck 的底', 'Backdrop behind the whole deck'],
    ['--bg-slide', '单页背景', 'Single slide background'],
    ['--bg-card', '卡片背景', 'Card background'],
    ['--bg-highlight', 'highlight-box / callout 底', 'highlight-box / callout fill'],
    ['--bg-vs-good', 'vs-good 底', 'vs-good fill'],
    ['--bg-vs-bad', 'vs-bad 底', 'vs-bad fill'],
    ['--bg-code', '代码块底', 'Code block fill'],
    ['--border-card', '卡片描边', 'Card border'],
];

const TEXT_SWATCHES = [
    ['--text-heading', '标题', 'Headings'],
    ['--text-body', '正文', 'Body text'],
    ['--text-muted', '注释 / 出处', 'Captions / sources'],
    ['--text-inverse', '深色或彩色底上的文字', 'Text on dark or colored surfaces'],
];

function swatch([name, use, useEn]) {
    return `        <div class="tg-swatch" data-tg-var="${name}">
          <div class="tg-swatch__chip"><div class="tg-swatch__fill"></div></div>
          <div class="tg-swatch__body">
            <span class="tg-swatch__var">${name}</span>
            <span class="tg-swatch__val">${LOADING}</span>
            <span class="tg-swatch__use">${L(use, useEn)}</span>
          </div>
        </div>`;
}

// 十个模块封面用课程里真实会出现的措辞，方便直接判断"这个色能不能上"。
//
// 英文一栏刻意压得很短（标题 ≤15 字符、副标题 ≤40）：中文那栏 5–11 个字全是单行，
// 英文照字面译过去会撑到 2–3 行，Syne / Archivo Black 这种宽字面尤其明显。
// 卡片一高一低，展板就不是在同一个比例下比颜色了 —— 而真做英文课也不会把
// 分隔页标题写这么长。改这里的文案时先量行数再定稿。
const MODULE_SAMPLES = [
    ['认清你在用的是什么', '你天天在用的 AI，到底是哪一层？',
        'Your AI stack', 'Which layer are you actually using?'],
    ['把话说对：提示词五要素', '同一个问题，换个问法，结果差一个档次',
        'Prompt craft', 'Better phrasing, better result'],
    ['把活干完：三个真实场景', '不演示玩具任务，只做你明天就要交的活',
        'Real scenarios', 'No toy demos — real work only'],
    ['守住红线：合规与边界', '哪些字段一旦发出去就收不回来',
        'Red lines', 'Some fields you can never take back'],
    ['从个人到团队', '一个人用得好，不等于团队跑得起来',
        'Team rollout', 'One good user is not a working team'],
    ['度量与复盘', '省下来的时间，得算得出来',
        'Measure it', 'The time saved has to be countable'],
    ['工具选型', '不是越贵越好，是越贴合流程越好',
        'Picking tools', 'Fit to workflow beats price'],
    ['常见失败模式', '八成的翻车，出在同样几件事上',
        'Failure modes', 'Most failures share a few causes'],
    ['进阶：把流程串起来', '单点提效的天花板在哪',
        'Chain the flow', 'The ceiling on point fixes'],
    ['行动计划', '离开这间教室之后的第一周',
        'Action plan', 'Your first week after this room'],
];

function moduleCard(i) {
    const [title, hook, titleEn, hookEn] = MODULE_SAMPLES[i - 1];
    const num = String(i).padStart(2, '0');
    return `        <div class="tg-module" data-tg-module="${i}">
          <div class="reveal"><div class="slides">
            <section class="module-${i}">
              <div class="module-divider">
                <span class="module-divider__label">${L('模块 ' + num, 'Module ' + num)}</span>
                <h2 class="module-divider__title">${L(title, titleEn)}</h2>
                <p class="module-divider__hook">${L(hook, hookEn)}</p>
                <span class="module-divider__number" aria-hidden="true">${num}</span>
              </div>
            </section>
          </div></div>
          <div class="tg-module__foot">${LOADING}</div>
        </div>`;
}

// 封面 / 封底也是全屏大面积用色, 和模块封面放在一起看才判断得出整份 deck 的节奏。
// 它们不吃 --module-* , 走 --bg-slide, 所以单独渲染。
function fullPageCards() {
    return `        <div class="tg-module tg-fullpage" data-tg-fullpage="cover">
          <div class="reveal"><div class="slides">
            <section class="cover-slide">
              <h1>${L('从会聊天到会办事', 'From chat to action')}</h1>
              <div class="divider-h divider-h--primary"></div>
              <h2>${L('让 AI 变成替你动手的助理', 'An assistant that acts, not advises')}</h2>
            </section>
          </div></div>
          <div class="tg-module__foot">${LOADING}</div>
        </div>
        <div class="tg-module tg-fullpage" data-tg-fullpage="ending">
          <div class="reveal"><div class="slides">
            <section class="ending-slide">
              <h1>${L('谢谢', 'Thank you')}</h1>
              <div class="divider-h divider-h--primary"></div>
              <p class="text-muted">${L('问题 &amp; 讨论', 'Questions &amp; discussion')}</p>
            </section>
          </div></div>
          <div class="tg-module__foot">${LOADING}</div>
        </div>`;
}

function componentStage() {
    return `      <div class="tg-stage-wrap">
        <div class="reveal"><div class="slides"><section>

          <p class="tg-sublabel">${L('卡片四态', 'Four card variants')}</p>
          <div class="tg-grid2">
            <div class="card"><h3>${L('标准卡片', 'Standard card')}</h3><p>${L(
        '正文用 --text-body，标题用 --primary。这是 deck 里出现频率最高的容器。',
        'Body takes --text-body, heading takes --primary. The most common container in a deck.'
    )}</p></div>
            <div class="card card-primary"><h3>${L('主色卡片', 'Primary card')}</h3><p>${L(
        '底色 --primary，文字必须显式配对，不能靠继承。',
        'Filled with --primary; the text color must be paired explicitly, never inherited.'
    )}</p></div>
            <div class="card card-secondary"><h3>${L('辅助色卡片', 'Secondary card')}</h3><p>${L(
        '底色 --secondary，用于示例、tip。',
        'Filled with --secondary, for examples and tips.'
    )}</p></div>
            <div class="card card-accent"><h3>${L('强调色卡片', 'Accent card')}</h3><p>${L(
        '底色 --accent，用于警示与次级强调。',
        'Filled with --accent, for warnings and secondary emphasis.'
    )}</p></div>
          </div>

          <p class="tg-sublabel">${L('概念定义卡', 'Concept card')}</p>
          <div class="concept-card">
            <h3 class="concept-card__term">${L('办公智能体 (Agent)', 'Office agent (Agent)')}</h3>
            <p class="concept-card__def">${L(
        '能调用工具、能读写文件、能把一串动作跑完的 AI —— 区别于只能在对话框里出主意的聊天 AI。',
        'An AI that calls tools, reads and writes files, and runs a chain of actions to completion — as opposed to a chat AI that only offers advice in a text box.'
    )}</p>
            <div class="concept-card__example"><strong>${L('示例：', 'Example: ')}</strong>${L(
        '聊天 AI 告诉你发票该怎么整理；智能体直接把二十张发票整理成一张明细表。',
        'A chat AI tells you how to organize your invoices; an agent turns twenty of them into one itemized sheet.'
    )}</div>
          </div>

          <p class="tg-sublabel">${L('对比框', 'Comparison box')}</p>
          <div class="vs-box vs-box--columns">
            <div class="vs-bad"><h3>${L('❌ 含糊指令', '❌ Vague prompt')}</h3><ul><li>${L(
        '"帮我写个宣传文案"', '&quot;Write me some marketing copy&quot;'
    )}</li><li>${L('产出泛泛而谈，还得重写', 'Generic output you end up rewriting')}</li></ul></div>
            <div class="vs-neutral"><h3>${L('中性项', 'Neutral option')}</h3><ul><li>${L(
        '不好不坏的第三种选择', 'A third choice, neither good nor bad'
    )}</li><li>${L('用于三栏比较', 'For three-column comparisons')}</li></ul></div>
            <div class="vs-good"><h3>${L('✅ 五要素指令', '✅ Five-part prompt')}</h3><ul><li>${L(
        '角色 + 对象 + 目标 + 约束 + 格式', 'Role + audience + goal + constraints + format'
    )}</li><li>${L('产出可直接用', 'Output you can ship as is')}</li></ul></div>
          </div>

          <p class="tg-sublabel">${L('提示词对比', 'Prompt before / after')}</p>
          <div class="prompt-compare">
            <div class="prompt-compare__col prompt-compare__col--before">
              <div class="prompt-compare__label">${L('❌ 改前', '❌ Before')}</div>
              <p class="prompt-compare__text">${L(
        '承载提示词原文的小字段落，检查 --bg-vs-bad 底上 --text-body 是否读得清；这里刻意写长一点，让行距 1.85 的效果显出来。',
        'A small-type paragraph carrying the raw prompt, here to check whether --text-body stays legible on --bg-vs-bad. Deliberately long, so the 1.85 line height has room to show.'
    )}</p>
              <div class="prompt-compare__verdict">${L(
        '判语用 --danger，压在 --bg-vs-bad 上', 'Verdict in --danger, sitting on --bg-vs-bad'
    )}</div>
            </div>
            <div class="prompt-compare__col prompt-compare__col--after">
              <div class="prompt-compare__label">${L('✅ 改后', '✅ After')}</div>
              <p class="prompt-compare__text">${L(
        '同一段小字换到 --bg-vs-good 底上。两栏的正文色都取 --text-body，只有标签和判语走语义色。',
        'The same small type moved onto --bg-vs-good. Both columns take --text-body; only the labels and verdicts use semantic colors.'
    )}</p>
              <div class="prompt-compare__verdict">${L(
        '判语用 --success，压在 --bg-vs-good 上', 'Verdict in --success, sitting on --bg-vs-good'
    )}</div>
            </div>
          </div>

          <p class="tg-sublabel">${L('统计数字墙', 'Stat wall')}</p>
          <div class="stats-wall">
            <div class="stat-item"><span class="stat-item__number">85%</span><span class="stat-item__label">${L(
        '默认色号的数字', 'Number in the default color'
    )}</span><span class="stat-item__source">--primary</span></div>
            <div class="stat-item stat-item--accent"><span class="stat-item__number">3×</span><span class="stat-item__label">${L(
        '强调色的数字', 'Number in the accent color'
    )}</span><span class="stat-item__source">--accent</span></div>
            <div class="stat-item stat-item--secondary"><span class="stat-item__number">12</span><span class="stat-item__label">${L(
        '辅助色的数字', 'Number in the secondary color'
    )}</span><span class="stat-item__source">--secondary</span></div>
            <div class="stat-item stat-item--danger"><span class="stat-item__number">-40%</span><span class="stat-item__label">${L(
        '危险色的数字', 'Number in the danger color'
    )}</span><span class="stat-item__source">--danger</span></div>
          </div>

          <p class="tg-sublabel">${L('高亮框 / 标签 / 徽章', 'Highlight box / tags / badges')}</p>
          <div class="highlight-box">${L(
        '高亮框：底色 --bg-highlight，文字 --text-body，左侧色条 --primary。用于补充说明。',
        'Highlight box: --bg-highlight fill, --text-body text, --primary bar down the left. For side notes.'
    )}</div>
          <p style="margin-top:1rem">
            <span class="badge badge--primary">${L('主色', 'Primary')}</span>
            <span class="badge badge--secondary">${L('辅助', 'Secondary')}</span>
            <span class="badge badge--accent">${L('强调', 'Accent')}</span>
            <span class="badge badge--success">${L('成功', 'Success')}</span>
            <span class="badge badge--danger">${L('危险', 'Danger')}</span>
            <span class="tag">tag</span>
          </p>

          <p class="tg-sublabel">${L('时间轴', 'Timeline')}</p>
          <div class="timeline">
            <div class="timeline__item"><div class="timeline__dot"></div><div class="timeline__period">2017</div><div class="timeline__label">Transformer</div></div>
            <div class="timeline__item timeline__item--secondary"><div class="timeline__dot"></div><div class="timeline__period">2020</div><div class="timeline__label">GPT-3</div></div>
            <div class="timeline__item timeline__item--accent"><div class="timeline__dot"></div><div class="timeline__period">2022</div><div class="timeline__label">ChatGPT</div></div>
            <div class="timeline__item timeline__item--muted"><div class="timeline__dot"></div><div class="timeline__period">2025</div><div class="timeline__label">${L(
        '办公智能体', 'Office agents'
    )}</div></div>
          </div>

        </section></div></div>
      </div>`;
}

/* ------------------------------------------------------------------ *
 * 详情页
 * ------------------------------------------------------------------ */

function themePage(scheme, all, defaults) {
    const { id, meta, fontSet, stacks } = scheme;
    const nav = all.map((s) =>
        `<a href="${s.id}.html"${s.id === id ? ' aria-current="page"' : ''}>${esc(s.meta.displayName || s.id)}</a>`
    ).join('\n            ');

    const name = esc(meta.displayName || id);
    const fontMismatch = meta.fontHint && meta.fontHint !== fontSet
        ? `<p class="tg-section__note" style="color:var(--danger)">${L(
            `注意：CSS 头注释写的默认字体集是 <code>${meta.fontHint}</code>，
        但 build.js 实际用的是 <code>${fontSet}</code>，两处已经不一致。`,
            `Heads-up: the CSS header comment claims the default font set is <code>${meta.fontHint}</code>,
        but build.js actually uses <code>${fontSet}</code> — the two have drifted apart.`
        )}</p>`
        : '';

    const desc = L(
        esc(meta.tagline || '') + (meta.useFor ? '　适用于：' + esc(meta.useFor) : ''),
        (meta.taglineEn || meta.useForEn)
            ? esc(meta.taglineEn || '') + (meta.useForEn ? ' · Best for: ' + esc(meta.useForEn) : '')
            : ''
    );

    return `<!DOCTYPE html>
<html lang="zh-CN" data-lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name} · NextCourse 主题展板</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
${langBoot(`${meta.displayName || id} · NextCourse 主题展板`, `${meta.displayName || id} · NextCourse Theme Gallery`)}

<!-- 加载顺序与 templates/master_template.html 保持一致，
     这样展板看到的层叠结果就是 deck 里的层叠结果 -->
<link rel="stylesheet" href="../shared_styles/base_layout.css">
<link rel="stylesheet" href="../shared_styles/themes/standard.css">
<link rel="stylesheet" href="../shared_styles/tokens.css">
<link rel="stylesheet" href="../shared_styles/components.css">
<link rel="stylesheet" href="../shared_styles/color-schemes/${id}.css">
<link rel="stylesheet" href="../shared_styles/font-sets/${fontSet}.css">
<link rel="stylesheet" href="gallery.css">
</head>
<body>

<div class="tg-topbar">
  <div class="tg-topbar__inner">
    <a class="tg-topbar__home" href="index.html">${L('← 全部主题', '← All themes')}</a>
    <nav class="tg-topbar__nav">
            ${nav}
    </nav>
    ${LANG_BUTTON}
  </div>
</div>

<div class="tg-wrap">

  <header class="tg-head">
    <p class="tg-head__eyebrow">Color Scheme</p>
    <h1 class="tg-head__title">${name}</h1>
    <p class="tg-head__desc">${desc}</p>
    <div class="tg-meta">
      <div class="tg-meta__item">
        <span class="tg-meta__k">course.meta.md</span>
        <span class="tg-meta__v"><span class="tg-code">theme: ${id}</span></span>
      </div>
      <div class="tg-meta__item">
        <span class="tg-meta__k">${L('默认字体集', 'Default font set')}</span>
        <span class="tg-meta__v"><span class="tg-code">fontset: ${fontSet}</span></span>
      </div>
      <div class="tg-meta__item">
        <span class="tg-meta__k">${L('配色文件', 'Scheme file')}</span>
        <span class="tg-meta__v"><span class="tg-code">color-schemes/${id}.css</span></span>
      </div>
    </div>
  </header>

  <section class="tg-section" id="semantic">
    <div class="tg-section__head"><span class="tg-section__num">01</span><h2 class="tg-section__title">${L('语义色', 'Semantic colors')}</h2></div>
    <p class="tg-section__note">${L(
        `这六个是有语义的：学员在一份 deck 里反复看到 <code>--danger</code> 就是"别这么干"。
      同一个色不能既表示"危险"又表示"第 5 模块"。<br>
      色块下方那一档是 <strong>R5</strong>：这五个语义色在 <code>.text-*</code> /
      <code>.vs-* h3</code> / 统计数字 / 图标卡里都是当<strong>文字色</strong>用的，
      落在 <code>--bg-slide</code> 上必须 ≥4.5:1，否则那些规则等于白写。`,
        `These six carry meaning: seeing <code>--danger</code> over and over across a deck is what
      teaches the audience "don't do this". One color cannot mean both "danger" and "module 5".<br>
      The row under each chip is <strong>R5</strong>: all five semantic colors are used as
      <strong>text</strong> colors in <code>.text-*</code> / <code>.vs-* h3</code> / stat numbers /
      icon cards, so on <code>--bg-slide</code> they must reach ≥4.5:1 — otherwise those rules are dead letters.`
    )}</p>
    <div class="tg-swatches">
${SEMANTIC_SWATCHES.map((s) => swatch(s).replace(
        '<span class="tg-swatch__use">',
        `<span class="tg-swatch__use" style="margin-bottom:.4rem" data-tg-semratio="${s[0]}"></span><span class="tg-swatch__use">`
    )).join('\n')}
    </div>
  </section>

  <section class="tg-section" id="surface">
    <div class="tg-section__head"><span class="tg-section__num">02</span><h2 class="tg-section__title">${L('背景与文字', 'Surfaces and text')}</h2></div>
    <p class="tg-section__note">${L(
        `半透明色会标出 α 值和压到 <code>--bg-slide</code> 上之后的实际色。
      文字一栏的对比度按 WCAG 算，正文要 ≥4.5:1，标题这种大字 ≥3:1。`,
        `Translucent colors show their α and the real color once composited onto <code>--bg-slide</code>.
      Text contrast follows WCAG: ≥4.5:1 for body copy, ≥3:1 for large headings.`
    )}</p>
    <div class="tg-swatches">
${SURFACE_SWATCHES.map(swatch).join('\n')}
    </div>
    <p class="tg-sublabel">${L('文字（落在 --bg-slide 上）', 'Text (composited onto --bg-slide)')}</p>
    <div class="tg-swatches">
${TEXT_SWATCHES.map((s) => swatch(s).replace(
        '<span class="tg-swatch__use">',
        `<span class="tg-swatch__use" style="margin-bottom:.4rem" data-tg-textratio="${s[0]}"></span><span class="tg-swatch__use">`
    )).join('\n')}
    </div>
  </section>

  <section class="tg-section" id="modules">
    <div class="tg-section__head"><span class="tg-section__num">03</span><h2 class="tg-section__title">${L('全屏页', 'Full-bleed slides')}</h2></div>
    <p class="tg-section__note">${L(
        `全份 deck 里会整屏铺色的只有三类页：封面、十个模块封面、封底。
      下面都是真实 DOM，配色和模板的 !important 规则原样生效——投影出来就是这个样子。`,
        `Only three kinds of slide flood the screen with color: the cover, the ten module dividers and the
      closing slide. Everything below is real DOM — the scheme's and the template's !important rules apply
      unchanged, so this is what the projector shows.`
    )}</p>

    <p class="tg-sublabel">${L('封面 / 封底（走 --bg-slide，不吃 --module-*）', 'Cover / closing (they take --bg-slide, not --module-*)')}</p>
    <div class="tg-modules">
${fullPageCards()}
    </div>

    <p class="tg-sublabel">${L('十个模块封面（--module-1 … --module-10）', 'Ten module dividers (--module-1 … --module-10)')}</p>
    <p class="tg-section__note">${L(
        `多数课程只用到前 3–5 个，所以越靠前的位置越要安全。
      每张下面标出实测色值、标题实际取到的文字色、对比度，以及和语义色/其他模块的撞车情况。
      <code>module-1 = --primary</code> 这类是各配色的惯例，只标灰不报警；撞上
      <code>--danger</code> / <code>--accent</code> / <code>--success</code> 才算真冲突。`,
        `Most courses only reach modules 3–5, so the earlier the slot, the safer it has to be.
      Each card reports the measured color, the text color the title actually resolves to, the contrast
      ratio, and any collision with a semantic color or another module.
      <code>module-1 = --primary</code> is a convention across schemes — noted in grey, not flagged; only
      collisions with <code>--danger</code> / <code>--accent</code> / <code>--success</code> count as real conflicts.`
    )}</p>
    <div class="tg-modules">
${Array.from({ length: 10 }, (_, i) => moduleCard(i + 1)).join('\n')}
    </div>
  </section>

  <section class="tg-section" id="fonts">
    <div class="tg-section__head"><span class="tg-section__num">04</span><h2 class="tg-section__title">${L('字体', 'Typography')}</h2></div>
    <p class="tg-section__note">${L(
        `字体集与配色是两根正交的轴。这里显示的是本配色的「原配」<code>${fontSet}</code>，
      在 course.meta.md 里写 <code>fontset:</code> 可以单独换掉。`,
        `Font sets and color schemes are two independent axes. Shown here is this scheme's default
      <code>${fontSet}</code>; add a <code>fontset:</code> line to course.meta.md to swap it on its own.`
    )}</p>
    ${fontMismatch}
    <div class="tg-fonts">
      <div class="tg-font">
        <p class="tg-font__role">${L('Display · 标题', 'Display · Headings')}</p>
        <p class="tg-font__stack" data-tg-font="--font-display">${esc(stacks.display)}</p>
        <p class="tg-font__sample-en" style="font-family:var(--font-display)">Handoff Ag 0123</p>
        <p class="tg-font__sample-cn" style="font-family:var(--font-display)">从会聊天到会办事</p>
        <div class="tg-font__weights" style="font-family:var(--font-display)">
          <span class="tg-font__w" style="font-weight:400"><small>400</small>${L('常规 Regular', 'Regular')}</span>
          <span class="tg-font__w" style="font-weight:700"><small>700</small>${L('加粗 Bold', 'Bold')}</span>
          <span class="tg-font__w" style="font-weight:900"><small>900</small>${L('特粗 Black', 'Black')}</span>
        </div>
      </div>
      <div class="tg-font">
        <p class="tg-font__role">${L('Body · 正文', 'Body · Text')}</p>
        <p class="tg-font__stack" data-tg-font="--font-body">${esc(stacks.body)}</p>
        <p class="tg-font__sample-cn" style="font-family:var(--font-body);font-size:1.5rem">把 AI 从参谋变成助理</p>
        <!-- 中英两段样张都不跟随语言切换：八套字体集里有一半是拉丁 display 字体，
             中文全靠系统 fallback，那恰恰是选字体时必须两边都看的东西。 -->
        <p class="tg-font__para" style="font-family:var(--font-body)">
          大模型是发动机，智能体是整车。你在聊天框里问它"这份合同有什么风险"，它给你一段分析；
          你在智能体里给同样的指令，它会把二十份合同逐条读完，把风险点整理成一张表，
          然后把表存到你指定的目录里。1234567890 —— 数字与中文混排的字重表现看这一行。
        </p>
        <p class="tg-font__para" style="font-family:var(--font-body)">
          A large model is the engine; an agent is the whole vehicle. Ask a chat box "what are the risks in
          this contract" and you get a paragraph back; give an agent the same instruction and it reads all
          twenty contracts, tabulates every risk and files the table where you told it to. 1234567890.
        </p>
        <div class="tg-font__weights" style="font-family:var(--font-body)">
          <span class="tg-font__w" style="font-weight:400"><small>400</small>${L('常规正文', 'Regular')}</span>
          <span class="tg-font__w" style="font-weight:500"><small>500</small>${L('中等强调', 'Medium')}</span>
          <span class="tg-font__w" style="font-weight:700"><small>700</small>${L('加粗强调', 'Bold')}</span>
        </div>
      </div>
    </div>
  </section>

  <section class="tg-section" id="components">
    <div class="tg-section__head"><span class="tg-section__num">05</span><h2 class="tg-section__title">${L('组件实景', 'Components in context')}</h2></div>
    <p class="tg-section__note">${L(
        `同样是真实 DOM，用来检查"设了背景的组件有没有显式配对文字色"——
      这是配色最容易漏的地方。`,
        `Real DOM again, here to check whether every component that sets a background also pairs an explicit
      text color — the single most commonly missed thing in a scheme.`
    )}</p>
${componentStage()}
  </section>

  <section class="tg-section" id="diagnostics">
    <div class="tg-section__head"><span class="tg-section__num">06</span><h2 class="tg-section__title">${L('体检', 'Diagnostics')}</h2></div>
    <p class="tg-section__note">${L(
        '浏览器实测，不是人工维护的清单。',
        'Measured live in the browser — not a hand-maintained checklist.'
    )}</p>
    <div class="tg-diag" data-tg-diagnostics>${LOADING}</div>
  </section>

</div>

<script src="gallery.js"></script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ *
 * 索引页
 * ------------------------------------------------------------------ */

function indexPage(all) {
    const cards = all.map((s) => {
        const v = s.meta.vars;
        // 用 --bg-slide 而不是 --bg-page：--text-heading 是配着单页背景调的，
        // notebook-tabs 这种「深色页底 + 浅色单页」的配色用 bg-page 会糊成一团
        const bg = v['--bg-slide'] || v['--bg-page'] || '#ffffff';
        const heading = v['--text-heading'] || '#000000';
        const primary = v['--primary'] || '#000000';
        const strip = Array.from({ length: 10 }, (_, i) => v['--module-' + (i + 1)] || 'transparent');
        const desc = L(
            esc(s.meta.tagline || '') + (s.meta.useFor ? '｜' + esc(s.meta.useFor) : ''),
            (s.meta.taglineEn || s.meta.useForEn)
                ? esc(s.meta.taglineEn || '') + (s.meta.useForEn ? ' · ' + esc(s.meta.useForEn) : '')
                : ''
        );
        return `    <a class="tg-card" href="${s.id}.html">
      <div class="tg-card__hero" style="background:${bg};color:${heading};font-family:${s.stacks.display || 'sans-serif'};font-weight:${s.stacks.displayWeight}">
        ${esc(s.meta.displayName || s.id)}
      </div>
      <div class="tg-card__strip">
        ${strip.map((c) => `<span style="background:${c}"></span>`).join('')}
      </div>
      <div class="tg-card__body">
        <p class="tg-card__name" style="color:${primary}">${s.id}</p>
        <p class="tg-card__desc">${desc}</p>
        <div class="tg-card__foot"><span>${s.fontSet}</span><span>${primary.toUpperCase()}</span></div>
      </div>
    </a>`;
    }).join('\n');

    // 卡片标题要用各自主题的特色字体，但索引页不能套字体集本体（八套 :root 会互相覆盖），
    // 所以只把各字体集用到的 @font-face 文件去重后单独引进来。
    const faceLinks = [...new Set(all.flatMap((s) => s.stacks.faceFiles))]
        .sort()
        .map((f) => `<link rel="stylesheet" href="../${f}">`)
        .join('\n');

    return `<!DOCTYPE html>
<html lang="zh-CN" data-lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NextCourse 主题展板</title>
<link rel="icon" href="favicon.svg" type="image/svg+xml">
${langBoot('NextCourse 主题展板', 'NextCourse Theme Gallery')}
<link rel="stylesheet" href="../shared_styles/tokens.css">
<link rel="stylesheet" href="gallery.css">
<!-- 只引 @font-face 层：卡片标题按主题的 display 字体渲染，不引入任何 :root/body 规则 -->
${faceLinks}
<style>
  /* 索引页不套任何一套配色（套了就偏心），自己走一套中性壳 */
  html, body { background: #f6f7f9; color: #0f172a; }
  @media (prefers-color-scheme: dark) { html, body { background: #101317; color: #e7ebf0; } }
  .tg-idx-head { max-width: 1180px; margin: 0 auto; padding: 4rem 2rem 2.5rem; }
  .tg-idx-head h1 { font-size: clamp(2.2rem, 5vw, 3.4rem); margin: 0 0 .8rem; letter-spacing: -0.02em; }
  .tg-idx-head p { max-width: 62ch; line-height: 1.8; margin: 0 0 .6rem; opacity: .75; font-size: .98rem; }
  .tg-idx-head code { font-family: ui-monospace, Menlo, monospace; font-size: .86em;
    background: rgba(128,128,128,.16); padding: .1rem .38rem; border-radius: 5px; }
  .tg-idx-body { max-width: 1180px; margin: 0 auto; padding: 0 2rem 5rem; }
  .tg-idx-bar { max-width: 1180px; margin: 0 auto; padding: 1.4rem 2rem 0; display: flex; justify-content: flex-end; }
  @media (max-width: 720px) {
    .tg-idx-head, .tg-idx-body, .tg-idx-bar { padding-left: 1.2rem; padding-right: 1.2rem; }
  }
</style>
</head>
<body>

<div class="tg-idx-bar">${LANG_BUTTON}</div>

<header class="tg-idx-head">
  <h1>${L('NextCourse 主题展板', 'NextCourse Theme Gallery')}</h1>
  <p>${L(
        `${all.length} 套配色，每套一页：语义色、背景与文字、十个模块封面色、字体、组件实景、自动体检。
     色带是该配色的 <code>--module-1</code> 到 <code>--module-10</code>，按顺序排。`,
        `${all.length} color schemes, one page each: semantic colors, surfaces and text, the ten module
     cover colors, typography, components in context and an automatic audit. The stripe is that scheme's
     <code>--module-1</code> through <code>--module-10</code>, in order.`
    )}</p>
  <p>${L(
        `换主题只要改课程的 <code>course.meta.md</code> 里的 <code>theme:</code>，
     再跑 <code>node build.js &lt;课程名&gt;</code>。字体想单独换就再加一行 <code>fontset:</code>。`,
        `To switch themes, change <code>theme:</code> in the course's <code>course.meta.md</code> and run
     <code>node build.js &lt;course-name&gt;</code>. To change only the typeface, add a <code>fontset:</code> line.`
    )}</p>
</header>

<main class="tg-idx-body">
  <div class="tg-index">
${cards}
  </div>
</main>

</body>
</html>
`;
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

const defaults = readDefaultFontSets();

const all = fs.readdirSync(SCHEME_DIR)
    .filter((f) => f.endsWith('.css'))
    .map((f) => {
        const id = f.replace(/\.css$/, '');
        const meta = readSchemeMeta(path.join(SCHEME_DIR, f));
        const fontSet = defaults[id] || meta.fontHint || 'modern-sans';
        return { id, meta, fontSet, stacks: readFontStacks(fontSet) };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

let missingEn = 0;
all.forEach((s) => {
    fs.writeFileSync(path.join(OUT_DIR, s.id + '.html'), themePage(s, all, defaults));
    const hint = s.meta.fontHint && s.meta.fontHint !== s.fontSet
        ? `  ← CSS 注释说 ${s.meta.fontHint}，build.js 说 ${s.fontSet}`
        : '';
    if (!s.meta.taglineEn) missingEn++;
    console.log(`  ${s.id.padEnd(18)} ${s.fontSet}${hint}`);
});

fs.writeFileSync(path.join(OUT_DIR, 'index.html'), indexPage(all));

console.log(`\n生成 ${all.length} 套主题 + 索引页 → theme-gallery/index.html`);

if (missingEn) {
    console.warn(`  ! ${missingEn} 套配色的头注释缺 "EN tagline:" / "EN use:"，英文版会退回中文描述`);
}

if (!auditTokens(all.map((s) => s.id))) process.exitCode = 1;
