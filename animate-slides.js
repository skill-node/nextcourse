#!/usr/bin/env node
/**
 * animate-slides.js — 批量给 slides 打入场动画 class
 *
 * 读取 courses/<name>/slides/*.html，按组件结构规则给元素加上
 * animations.css 的 animate-* / stagger-*，实现「翻到这页，组件依次入场」。
 *
 * Usage: node animate-slides.js <course-name> [--strip] [--dry]
 *
 *   (无参数)   先剥离已有 animate-* 与 stagger-*，再按规则重新打一遍（幂等）
 *   --strip    只剥离，回到静态页面
 *   --dry      只报告会改什么，不写文件
 *
 * ── 与 fragment 的分工 ──────────────────────────────────────────────────────
 * animate-* 是「结构性」的：哪种容器配哪个方向有规律，所以能批量生成。
 * fragment  是「教学节奏性」的：哪句话该停下来卖关子只有讲师知道，只能手写。
 *
 * 本工具对 fragment 只读不写：
 *   1. 自身带 fragment 的元素不会被打上 animate-*；
 *   2. 祖先带 fragment 的元素也不会（父级被按键藏着时，子元素的 present 动画
 *      在它还不可见时就已经播完了，等于没有效果）；
 *   3. --strip 只摘 animate-* / stagger-* 两类 token，绝不碰 fragment 或其他 class。
 * 因此「手动加 fragment → animate --strip → 改内容 → animate」反复来回是安全的，
 * 手写的节奏标记会原样留存。
 *
 * ── 为什么同一元素不能既 animate-* 又 fragment ──────────────────────────────
 * animations.css 的 `.reveal .slides section.present .animate-fade-up` 特异性 (0,4,1)
 * 压过 reveal.css 的 `.reveal .fragment:not(.custom){opacity:0}` (0,2,0)：翻页瞬间
 * opacity 就被解到 1，元素只剩 reveal 的 visibility:hidden 藏着，按键出现时是硬切。
 * 所以规则 1 是必需的，不是保守。
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = __dirname;

// ─── 参数 ────────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const courseName = args.find(a => !a.startsWith('--'));
const STRIP_ONLY = args.includes('--strip');
const DRY_RUN    = args.includes('--dry');

if (!courseName) {
    console.error('Usage: node animate-slides.js <course-name> [--strip] [--dry]');
    process.exit(1);
}

const SLIDES_DIR = path.join(ROOT, 'courses', courseName, 'slides');
if (!fs.existsSync(SLIDES_DIR)) {
    console.error(`ERROR: slides/ not found at ${SLIDES_DIR}`);
    process.exit(1);
}

// ─── 动画 token 识别 ─────────────────────────────────────────────────────────
// 与 animations.css 保持一致。新增动画类时两边都要改。
const ANIM_TOKEN = /^(animate-(fade-up|fade-left|fade-right|zoom-in)|stagger-\d+)$/;
const STAGGER_MAX = 12;   // 与 animations.css 的 .stagger-* 级数上限一致

// ─── 规则 ────────────────────────────────────────────────────────────────────

// 整页跳过：封面与结束页是单块陈述，且 .cover-slide .divider 已有自己的宽度动画
const SKIP_SECTION = ['cover-slide', 'ending-slide'];

// 容器规则：命中容器后，给它的「直接子元素」分配动画
//   mode 'sides' — 两侧对进，共享同一个 stagger 编号（同时入场）
//   mode 'seq'   — 按文档顺序依次入场
//
// 覆盖范围以 DESIGN-SYSTEM.md 的组件清单为准，不是以某一门课实际用到的为准，
// 否则换一门课用了别的组件就会静默无动画。新增组件时这里要同步补一条。
const CONTAINER_RULES = [
    // ── 对比 / 左右分栏：两侧对进 ──
    { on: 'vs-box',             pick: n => hasAny(n, ['vs-bad', 'vs-neutral', 'vs-good']), mode: 'sides' },
    { on: 'layout-text-image',  pick: n => hasAny(n, ['layout-text-image__content', 'layout-text-image__media']), mode: 'sides' },
    { on: 'layout-img-left',    pick: () => true,                             mode: 'sides' },
    { on: 'layout-img-right',   pick: () => true,                             mode: 'sides' },
    { on: 'prompt-compare',     pick: n => hasAny(n, ['prompt-compare__col']), mode: 'sides' },

    // ── 横向流程 / 时间线：沿流向依次进入 ──
    { on: 'workflow',           pick: n => hasAny(n, ['workflow-node', 'workflow-line']), mode: 'seq', anim: 'animate-fade-left' },
    { on: 'timeline',           pick: n => hasAny(n, ['timeline__item']),     mode: 'seq', anim: 'animate-fade-left' },
    // 素材、加号、等号、成品按书写顺序逐个进入 —— 等式是"算给你看"，不是一次亮完
    { on: 'img-equation',       pick: n => hasAny(n, ['img-equation__item', 'img-equation__op']), mode: 'seq', anim: 'animate-fade-left' },

    // ── 网格 / 卡片墙：依次升起 ──
    { on: 'icon-card-grid',     pick: n => hasAny(n, ['icon-card']),          mode: 'seq', anim: 'animate-fade-up' },
    { on: 'stats-wall',         pick: n => hasAny(n, ['stat-item']),          mode: 'seq', anim: 'animate-fade-up' },
    { on: 'quadrant__cells',    pick: n => hasAny(n, ['quadrant__cell']),     mode: 'seq', anim: 'animate-fade-up' },
    { on: 'case-study__body',   pick: n => hasAny(n, ['case-study__panel']),  mode: 'seq', anim: 'animate-fade-up' },
    { on: 'grid-2',             pick: () => true,                             mode: 'seq', anim: 'animate-fade-up' },
    { on: 'grid-3',             pick: () => true,                             mode: 'seq', anim: 'animate-fade-up' },
    { on: 'grid-4',             pick: () => true,                             mode: 'seq', anim: 'animate-fade-up' },

    // ── 纵向布局：依次升起 ──
    { on: 'layout-img-top',     pick: () => true,                             mode: 'seq', anim: 'animate-fade-up' },
    { on: 'layout-top-bottom',  pick: () => true,                             mode: 'seq', anim: 'animate-fade-up' },

    // ── 列表：逐条升起 ──
    { on: 'key-takeaway__list', pick: n => n.tag === 'li',                    mode: 'seq', anim: 'animate-fade-up' },
    { on: 'check-list',         pick: n => n.tag === 'li',                    mode: 'seq', anim: 'animate-fade-up' },
    { on: 'pill-list',          pick: n => n.tag === 'li',                    mode: 'seq', anim: 'animate-fade-up' },
];

// 独立块规则：元素自身整块升起。容器规则先跑，已被认领的子树不会再被整块动画，
// 所以这里可以放心地把容器本身也列进来当「没有可动画子元素时」的退路
// （例如 stats-wall 里没写 stat-item，整面墙仍会升起）。
const SOLO_BLOCKS = [
    'concept-card', 'callout', 'highlight-box', 'table-compare', 'code-block',
    'module-divider', 'key-takeaway', 'key-takeaway__next', 'case-study',
    'quote-slide', 'quadrant', 'timeline', 'stats-wall', 'icon-text',
    'card', 'card-primary', 'card-secondary', 'card-accent', 'icon-card',
];

// 通用兜底：一页跑完上面所有规则后仍然一个动画都没有（用了清单外的组件、
// 或者纯手写 markup），就退而给 <section> 的直接块级子元素挨个打 fade-up。
// 这样「新组件上线但忘了加规则」的后果是节奏平庸，而不是整页死板。
const FALLBACK_TAGS   = ['div', 'ul', 'ol', 'table', 'blockquote', 'figure', 'p'];
// 标题留在原地不动（观众要先看见这页在讲什么）；aside 是演讲备注，不上屏；
// divider-h 是装饰线，单独淡入反而突兀。
const FALLBACK_EXCLUDE_CLASSES = ['divider-h'];

// ─── 极简 HTML 解析（零依赖，够用即可）──────────────────────────────────────
// slides 是人写的规整 HTML 片段，不需要完整解析器；只要能还原父子关系
// 和每个开标签在源串中的位置，就足以定位插入点。
const VOID_TAGS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function classesOf(attrs) {
    const m = attrs.match(/\bclass\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!m) return [];
    return (m[2] !== undefined ? m[2] : m[3]).split(/\s+/).filter(Boolean);
}

function parse(html) {
    // 注释里可能含尖括号，先用等长空格遮掉，保证后面的 index 仍对得上源串
    const masked = html.replace(/<!--[\s\S]*?-->/g, c => ' '.repeat(c.length));

    const root  = { tag: '#root', classes: [], children: [], parent: null };
    const stack = [root];
    const tagRe = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;

    let m;
    while ((m = tagRe.exec(masked)) !== null) {
        const [full, closing, rawTag, attrs, selfClose] = m;
        const tag = rawTag.toLowerCase();

        if (closing) {
            for (let i = stack.length - 1; i > 0; i--) {
                if (stack[i].tag === tag) { stack.length = i; break; }
            }
            continue;
        }

        const node = {
            tag,
            attrs,
            classes: classesOf(attrs),
            openStart: m.index,
            openEnd:   m.index + full.length,
            children:  [],
            parent:    stack[stack.length - 1],
        };
        node.parent.children.push(node);
        if (!selfClose && !VOID_TAGS.has(tag)) stack.push(node);
    }
    return root;
}

const hasAny = (node, list) => node.classes.some(c => list.includes(c));
const has    = (node, cls)  => node.classes.includes(cls);

function ancestors(node) {
    const out = [];
    for (let p = node.parent; p; p = p.parent) out.push(p);
    return out;
}

function walk(node, fn) {
    for (const child of node.children) { fn(child); walk(child, fn); }
}

// ─── 剥离 ────────────────────────────────────────────────────────────────────
// 只摘 animate-* / stagger-*。class 被摘空时连同 class 属性和它前面的空格一起删掉，
// 让「加了又删」能真正回到原始字节。
function strip(src) {
    return src.replace(
        /(\s+class\s*=\s*)("([^"]*)"|'([^']*)')/gi,
        (full, pre, quoted, dq, sq) => {
            const quote = quoted[0];
            const val   = dq !== undefined ? dq : sq;
            const kept  = val.split(/\s+/).filter(Boolean).filter(c => !ANIM_TOKEN.test(c));
            if (kept.length === 0) return '';
            return `${pre}${quote}${kept.join(' ')}${quote}`;
        }
    );
}

// ─── 收集目标 ────────────────────────────────────────────────────────────────
function collectTargets(root) {
    const targets = [];          // { node, anim, group }
    const claimed = new Set();   // 已被认领的 node，用于祖先/后代互斥
    let groupSeq = 0;

    // fragment 守卫：自身或任一祖先带 fragment 的元素一律不碰
    const touchedByFragment = node =>
        has(node, 'fragment') || ancestors(node).some(a => has(a, 'fragment'));

    const subtreeClaimed = node => {
        let hit = false;
        walk(node, d => { if (claimed.has(d)) hit = true; });
        return hit;
    };

    const add = (node, anim, group) => {
        if (claimed.has(node)) return false;
        if (touchedByFragment(node)) return false;
        if (ancestors(node).some(a => claimed.has(a))) return false;
        if (subtreeClaimed(node)) return false;
        claimed.add(node);
        targets.push({ node, anim, group });
        return true;
    };

    // 1) 容器规则
    for (const rule of CONTAINER_RULES) {
        const containers = [];
        walk(root, n => { if (has(n, rule.on)) containers.push(n); });

        for (const container of containers) {
            const kids = container.children.filter(rule.pick);
            if (kids.length === 0) continue;

            if (rule.mode === 'sides') {
                // 两个 → 左右对进；三个 → 左 / 升 / 右；更多则退回依次入场
                const g = ++groupSeq;
                if (kids.length === 2) {
                    add(kids[0], 'animate-fade-left',  g);
                    add(kids[1], 'animate-fade-right', g);
                } else if (kids.length === 3) {
                    add(kids[0], 'animate-fade-left',  g);
                    add(kids[1], 'animate-fade-up',    g);
                    add(kids[2], 'animate-fade-right', g);
                } else {
                    kids.forEach(k => add(k, 'animate-fade-up', ++groupSeq));
                }
            } else {
                kids.forEach(k => add(k, rule.anim, ++groupSeq));
            }
        }
    }

    // 2) 独立块
    walk(root, n => {
        if (hasAny(n, SOLO_BLOCKS)) add(n, 'animate-fade-up', ++groupSeq);
    });

    // 3) 通用兜底：整页颗粒无收时才启用
    let usedFallback = false;
    if (targets.length === 0) {
        for (const child of root.children) {
            if (!FALLBACK_TAGS.includes(child.tag)) continue;
            if (hasAny(child, FALLBACK_EXCLUDE_CLASSES)) continue;
            if (add(child, 'animate-fade-up', ++groupSeq)) usedFallback = true;
        }
    }

    return Object.assign(targets, { usedFallback });
}

// ─── 编号 stagger ────────────────────────────────────────────────────────────
// 按同一页内的文档顺序统一编号，而不是各规则各排各的。
// 这样 slide-08 的 3 条 takeaway（1,2,3）和它下面的 __next（4）才是一条连贯节奏，
// 而不是两组都从 1 开始、导致 __next 跟第一条同时冒出来。
// 同 group 的元素（左右对进）共享一个编号。
function assignStagger(targets) {
    const ordered = [...targets].sort((a, b) => a.node.openStart - b.node.openStart);
    const groupIndex = new Map();
    let next = 0;

    for (const t of ordered) {
        if (!groupIndex.has(t.group)) groupIndex.set(t.group, ++next);
        t.stagger = groupIndex.get(t.group);
    }
    // 一页只有一组时不需要延迟，直接入场更利落
    if (next <= 1) ordered.forEach(t => { t.stagger = 0; });
    return ordered;
}

// ─── 写入 class ──────────────────────────────────────────────────────────────
function applyToSection(src, sectionRoot) {
    const collected   = collectTargets(sectionRoot);
    const usedFallback = collected.usedFallback;
    const targets     = assignStagger(collected);
    if (targets.length === 0) return { html: src, added: [], usedFallback };

    const added = [];
    const edits = [];

    for (const t of targets) {
        const tokens = [t.anim];
        if (t.stagger >= 1 && t.stagger <= STAGGER_MAX) tokens.push(`stagger-${t.stagger}`);

        const node = t.node;
        const open = src.slice(node.openStart, node.openEnd);
        const cm   = open.match(/\bclass\s*=\s*("([^"]*)"|'([^']*)')/i);

        let replacement;
        if (cm) {
            const quote  = cm[1][0];
            const val    = cm[2] !== undefined ? cm[2] : cm[3];
            const merged = [...val.split(/\s+/).filter(Boolean), ...tokens].join(' ');
            replacement  = open.slice(0, cm.index)
                         + `class=${quote}${merged}${quote}`
                         + open.slice(cm.index + cm[0].length);
        } else {
            // 无 class 属性：插在标签名之后
            replacement = open.replace(/^<([a-zA-Z][\w-]*)/, `<$1 class="${tokens.join(' ')}"`);
        }

        edits.push({ start: node.openStart, end: node.openEnd, replacement });
        added.push({
            tag: node.tag,
            cls: node.classes.filter(c => !ANIM_TOKEN.test(c)).join('.') || '(无 class)',
            tokens: tokens.join(' '),
        });
    }

    // 从后往前替换，避免前面的改动挪动后面的偏移
    edits.sort((a, b) => b.start - a.start);
    let html = src;
    for (const e of edits) html = html.slice(0, e.start) + e.replacement + html.slice(e.end);

    return { html, added, usedFallback };
}

// 一个 slide 文件就是一个 <section>，但留个后路：多 section 时逐个处理
function processFile(src) {
    const cleaned = strip(src);
    if (STRIP_ONLY) return { html: cleaned, added: [], skipped: null, usedFallback: false };

    const root     = parse(cleaned);
    const sections = root.children.filter(n => n.tag === 'section');
    if (sections.length === 0) return { html: cleaned, added: [], skipped: '无 <section>', usedFallback: false };

    const skipHit = sections.find(s => hasAny(s, SKIP_SECTION));
    if (skipHit) {
        return { html: cleaned, added: [], skipped: `.${skipHit.classes.find(c => SKIP_SECTION.includes(c))}`, usedFallback: false };
    }

    let html = cleaned;
    const added = [];
    let usedFallback = false;
    // 单文件单 section 是常态；多 section 时各自独立编号，互不影响
    for (const section of sections) {
        const r = applyToSection(html, section);
        if (r.usedFallback) usedFallback = true;
        // 源串一变，之前解析出的偏移就失效了，所以多 section 需要重新解析
        if (r.added.length > 0) {
            html = r.html;
            added.push(...r.added);
            const reparsed = parse(html).children.filter(n => n.tag === 'section');
            for (let i = 0; i < sections.length; i++) if (reparsed[i]) sections[i] = reparsed[i];
        }
    }
    return { html, added, skipped: null, usedFallback };
}

// ─── 主流程 ──────────────────────────────────────────────────────────────────
const files = fs.readdirSync(SLIDES_DIR).filter(f => f.endsWith('.html')).sort();
if (files.length === 0) {
    console.error('ERROR: slides/ 目录为空');
    process.exit(1);
}

const mode = STRIP_ONLY ? '剥离动画' : '打入动画';
console.log(`\nNextCourse Animate — ${courseName}  [${mode}${DRY_RUN ? ' · dry-run' : ''}]`);
console.log('─'.repeat(62));

let changedFiles = 0, totalTokens = 0, fragmentGuarded = 0;
const fallbackFiles = [];

for (const f of files) {
    const full = path.join(SLIDES_DIR, f);
    const src  = fs.readFileSync(full, 'utf8');

    // 统计这页有多少手写 fragment 被绕过（只作报告用，不影响处理）
    const fragCount = (parse(src).children.length
        ? (() => { let n = 0; walk(parse(src), d => { if (has(d, 'fragment')) n++; }); return n; })()
        : 0);
    fragmentGuarded += fragCount;

    const { html, added, skipped, usedFallback } = processFile(src);
    if (usedFallback) fallbackFiles.push(f);
    const changed = html !== src;

    if (changed && !DRY_RUN) fs.writeFileSync(full, html, 'utf8');
    if (changed) changedFiles++;
    totalTokens += added.length;

    const fragNote = fragCount > 0 ? `  🔒 绕过 ${fragCount} 处 fragment` : '';
    if (skipped) {
        console.log(`  ·  ${f}  跳过 (${skipped})${fragNote}`);
    } else if (added.length > 0) {
        const fbNote = usedFallback ? '  ⚙ 通用兜底' : '';
        console.log(`  ✓  ${f}  ${added.length} 个元素${fbNote}${fragNote}`);
        for (const a of added) console.log(`         ${a.cls}  →  ${a.tokens}`);
    } else if (changed) {
        console.log(`  ✓  ${f}  已剥离${fragNote}`);
    } else {
        console.log(`  ·  ${f}  无变化${fragNote}`);
    }
}

console.log('─'.repeat(62));
if (STRIP_ONLY) {
    console.log(`  ${DRY_RUN ? '将剥离' : '已剥离'} ${changedFiles}/${files.length} 个文件的动画 class`);
} else {
    console.log(`  ${DRY_RUN ? '将处理' : '已处理'} ${changedFiles}/${files.length} 个文件, 共 ${totalTokens} 个元素上动画`);
}
if (fragmentGuarded > 0) {
    console.log(`  手写 fragment ${fragmentGuarded} 处, 全部原样保留`);
}
if (fallbackFiles.length > 0) {
    console.log(`  ⚙ ${fallbackFiles.length} 页走了通用兜底 (${fallbackFiles.join(', ')})`);
    console.log(`     这些页没匹配到任何组件规则, 动画节奏可能偏平。`);
    console.log(`     若用的是常见组件, 建议在 animate-slides.js 的 CONTAINER_RULES 里补一条专属规则。`);
}
console.log(`\n  下一步: node nextcourse.js render ${courseName}\n`);
