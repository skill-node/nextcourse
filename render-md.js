#!/usr/bin/env node
/**
 * render-md.js — 交付包专用的受控子集 markdown 渲染器（零依赖）
 *
 * 本项目零 npm 依赖是刻意的护城河，不为渲染 markdown 引 marked / markdown-it。
 * 前提是**交付包的 md 是我们自己生成的**，格式完全可控，不需要通吃 CommonMark。
 *
 * 支持:
 *   标题 h1–h4 / 段落 / --- / 有序无序列表(两层缩进) / 表格 / > 引用
 *   代码块与行内代码 / **粗体** / *斜体* / [链接](url) / <br>
 *   - [ ] 复选项 (静态方框, 打印用)
 *   <!-- pagebreak -->  → 强制分页
 *   <!-- fill:3 -->     → 3 行手写填写区 (学员手册用)
 *
 * 不支持: 嵌套引用、脚注、任意内联 HTML、单元格合并、LaTeX、语法高亮。
 * 遇到不认识的行**原样输出，不崩** —— 用户手改 md 用了别的语法也不会炸掉交付物。
 *
 * 用法:
 *   node render-md.js <input.md> [output.html]     # 单文件渲染 (调试用)
 *   const { mdToHtml, wrapDocument } = require('./render-md');
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─── 行内 ────────────────────────────────────────────────────────────────────

function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inline(src) {
    // 先把行内代码抽出来占位, 否则里面的 * _ 会被当成强调语法
    const codes = [];
    let s = String(src).replace(/`([^`]+)`/g, (_, c) => {
        codes.push(c);
        return `\u0001${codes.length - 1}\u0001`;
    });
    s = esc(s);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    // _斜体_ 只认词边界处的下划线, 否则 class_size / snake_case 会被吃掉
    s = s.replace(/(^|[\s(（【「])_([^_\n]+)_(?=$|[\s)）】」,，.。;；:：!！?？])/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
    // 唯一放行的内联 HTML: <br> —— 表格单元格换行离不开它
    s = s.replace(/&lt;br\s*\/?&gt;/gi, '<br>');
    return s.replace(/\u0001(\d+)\u0001/g, (_, i) => `<code>${esc(codes[Number(i)])}</code>`);
}

function slugify(text, used) {
    const base = text.replace(/<[^>]*>/g, '').trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w一-龥-]/g, '')
        .toLowerCase() || 'sec';
    let slug = base, n = 2;
    while (used.has(slug)) slug = `${base}-${n++}`;
    used.add(slug);
    return slug;
}

// ─── 块 ──────────────────────────────────────────────────────────────────────

const RE = {
    heading:  /^(#{1,4})\s+(.*)$/,
    hr:       /^\s*(?:---|\*\*\*|___)\s*$/,
    quote:    /^>\s?(.*)$/,
    fence:    /^\s*```(\w*)\s*$/,
    li:       /^(\s*)(?:([-*+])|(\d+)[.)])\s+(.*)$/,
    tableRow: /^\s*\|/,
    tableSep: /^\s*\|[\s:|-]+\|\s*$/,
    pagebreak:/^\s*<!--\s*pagebreak\s*-->\s*$/i,
    fill:     /^\s*<!--\s*fill:\s*(\d+)\s*-->\s*$/i,
    comment:  /^\s*<!--/,
};

// 列表: 按缩进递归。只认两层（4 空格 / 2 空格都当一层）
function buildList(items, start, indent, out) {
    const ordered = items[start].ordered;
    out.push(ordered ? '<ol>' : '<ul>');
    let i = start;
    while (i < items.length && items[i].indent >= indent) {
        if (items[i].indent > indent) {
            const sub = [];
            i = buildList(items, i, items[i].indent, sub);
            // 子列表挂进上一个 <li> 里, 而不是并排, 否则打印时缩进会塌
            out[out.length - 1] = out[out.length - 1].replace(/<\/li>$/, sub.join('') + '</li>');
            continue;
        }
        if (items[i].ordered !== ordered) break;
        const it = items[i];
        const box = it.text.match(/^\[([ xX])\]\s*(.*)$/);
        out.push(box
            ? `<li class="task"><span class="box">${box[1].trim() ? '☑' : '☐'}</span> ${inline(box[2])}</li>`
            : `<li>${inline(it.text)}</li>`);
        i++;
    }
    out.push(ordered ? '</ol>' : '</ul>');
    return i;
}

function renderTable(lines) {
    const cells = row => row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
    const header = cells(lines[0]);
    const align = cells(lines[1]).map(c =>
        /^:.*:$/.test(c) ? ' style="text-align:center"'
            : /:$/.test(c) ? ' style="text-align:right"' : '');
    const out = ['<div class="table-wrap"><table>', '<thead><tr>'];
    header.forEach((h, i) => out.push(`<th${align[i] || ''}>${inline(h)}</th>`));
    out.push('</tr></thead><tbody>');
    for (const line of lines.slice(2)) {
        out.push('<tr>');
        cells(line).forEach((c, i) => out.push(`<td${align[i] || ''}>${inline(c)}</td>`));
        out.push('</tr>');
    }
    out.push('</tbody></table></div>');
    return out.join('');
}

/**
 * @returns {{ html: string, toc: Array<{level:number, text:string, id:string}> }}
 */
function render(md) {
    const lines = String(md).replace(/\r\n/g, '\n').split('\n');
    const out = [];
    const toc = [];
    const usedIds = new Set();
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) { i++; continue; }

        // 指令注释
        if (RE.pagebreak.test(line)) { out.push('<div class="page-break-before"></div>'); i++; continue; }
        const fill = line.match(RE.fill);
        if (fill) {
            out.push(`<div class="fill-lines">${'<span class="rule"></span>'.repeat(Number(fill[1]))}</div>`);
            i++; continue;
        }
        // 其余注释是写给作者看的, 不进交付物
        if (RE.comment.test(line)) {
            while (i < lines.length && !/-->/.test(lines[i])) i++;
            i++; continue;
        }

        // 代码块
        const fence = line.match(RE.fence);
        if (fence) {
            const buf = [];
            i++;
            while (i < lines.length && !RE.fence.test(lines[i])) buf.push(lines[i++]);
            i++; // 收尾的 ```
            out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
            continue;
        }

        // 表格
        if (RE.tableRow.test(line) && RE.tableSep.test(lines[i + 1] || '')) {
            const buf = [];
            while (i < lines.length && RE.tableRow.test(lines[i])) buf.push(lines[i++]);
            out.push(renderTable(buf));
            continue;
        }

        // 标题
        const h = line.match(RE.heading);
        if (h) {
            const level = h[1].length;
            const text = inline(h[2]);
            const id = slugify(h[2], usedIds);
            if (level === 2 || level === 3) toc.push({ level, text, id });
            out.push(`<h${level} id="${id}">${text}</h${level}>`);
            i++; continue;
        }

        if (RE.hr.test(line)) { out.push('<hr>'); i++; continue; }

        // 引用
        if (RE.quote.test(line)) {
            const buf = [];
            while (i < lines.length && RE.quote.test(lines[i])) buf.push(lines[i++].match(RE.quote)[1]);
            out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
            continue;
        }

        // 列表
        if (RE.li.test(line)) {
            const items = [];
            while (i < lines.length && RE.li.test(lines[i])) {
                const m = lines[i].match(RE.li);
                items.push({ indent: m[1].length, ordered: !m[2], text: m[4] });
                i++;
            }
            buildList(items, 0, items[0].indent, out);
            continue;
        }

        // 段落: 连续非空行合成一段
        const buf = [];
        while (i < lines.length && lines[i].trim()
               && !RE.heading.test(lines[i]) && !RE.hr.test(lines[i])
               && !RE.quote.test(lines[i]) && !RE.li.test(lines[i])
               && !RE.fence.test(lines[i]) && !RE.comment.test(lines[i])
               && !RE.tableRow.test(lines[i])) {
            buf.push(lines[i++]);
        }
        // 兜底: 上面全不匹配又没吃掉任何行时原样输出该行, 防止死循环
        if (buf.length === 0) { out.push(`<p>${inline(lines[i])}</p>`); i++; continue; }
        out.push(`<p>${inline(buf.join(' '))}</p>`);
    }

    return { html: out.join('\n'), toc };
}

function mdToHtml(md) {
    return render(md).html;
}

// ─── 文档外壳 ────────────────────────────────────────────────────────────────

// 交付文档是白底打印物, 深色配色的 --primary 压在白纸上读不出来。
// 按 WCAG 相对亮度往下压到对白底 4.5:1 为止 —— 只保留强调色的色相, 不跟随深色主题。
function darkenForPaper(hex) {
    const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex).trim());
    if (!m) return '#2563eb';
    let h = m[1];
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    let rgb = [0, 2, 4].map(k => parseInt(h.slice(k, k + 2), 16));
    const lum = c => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const contrast = () => 1.05 / (0.2126 * lum(rgb[0]) + 0.7152 * lum(rgb[1]) + 0.0722 * lum(rgb[2]) + 0.05);
    let guard = 0;
    while (contrast() < 4.5 && guard++ < 40) rgb = rgb.map(c => Math.max(0, Math.round(c * 0.92)));
    return '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('');
}

// 从课程配色里取 --primary 作为文档强调色（决策 6: 不跟随 theme 全套, 只继承强调色）
function accentFromTheme(root, theme) {
    const css = path.join(root, 'shared_styles', 'color-schemes', `${theme}.css`);
    if (!fs.existsSync(css)) return '#2563eb';
    const m = fs.readFileSync(css, 'utf8').match(/--primary:\s*(#[0-9a-fA-F]{3,8})/);
    return darkenForPaper(m ? m[1] : '#2563eb');
}

/**
 * 包成一份自包含 HTML：CSS 内联，不引外部字体与脚本，双击即读、随手可打印。
 *
 * 文档头的信息层级是刻意的：**h1 放功能名**（讲师手册 / 考核量规 / 教学设计…），
 * 课程名压到下一行小字。客户会一次开好几份，如果每份的大标题都以课程名开头，
 * 满屏重复信息，最该一眼认出的「这是哪一份」反而排在最后。
 * <title> 同理只写功能名 —— 标签页宽度只够显示前几个字。
 */
function wrapDocument({ title, subtitle, md, css, accent = '#2563eb', toc = true }) {
    const { html, toc: heads } = render(md);
    const nav = toc && heads.length > 2
        ? `<nav class="toc"><div class="toc-title">目录</div><ul>${
            heads.map(h => `<li class="lv${h.level}"><a href="#${h.id}">${h.text}</a></li>`).join('')
        }</ul></nav>`
        : '';
    const courseLine = subtitle ? `<div class="doc-course">${esc(subtitle)}</div>` : '';
    // h1 与课程名合成一个文档头, 分隔线画在头上而不是 h1 上, 两行才是一个整体
    let body = html.replace(
        /<h1([^>]*)>([\s\S]*?)<\/h1>/,
        (_, attrs, inner) => `<header class="doc-head"><h1${attrs}>${inner}</h1>${courseLine}</header>`
    );
    // md 没有 h1 的兜底: 课程名单独成头, 没有课程名就什么都不加
    if (!/<\/header>/.test(body) && courseLine) body = `<header class="doc-head">${courseLine}</header>\n${body}`;
    // 目录挂在文档头之后 —— 先看见这是什么文档, 再看见它有几节
    if (nav) body = body.replace('</header>', `</header>\n${nav}`);
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<style>
${css}
/* 课程强调色注入必须放在样式表**之后**: package-doc.css 里有一条同名兜底
   (--doc-accent: #2563eb)，同为 :root 同特异性，谁在后面谁生效 ——
   放前面会被兜底的蓝色盖掉，所有课程的交付包都会变成一个色。 */
:root { --doc-accent: ${accent}; }
</style>
</head>
<body>
<article class="doc">
${body}
</article>
</body>
</html>
`;
}

module.exports = { render, mdToHtml, wrapDocument, accentFromTheme, darkenForPaper, esc, inline };

// ─── 单文件渲染 (调试用) ─────────────────────────────────────────────────────
if (require.main === module) {
    const [,, input, output] = process.argv;
    if (!input) {
        console.error('Usage: node render-md.js <input.md> [output.html]');
        process.exit(1);
    }
    const cssPath = path.join(__dirname, 'shared_styles', 'package-doc.css');
    const md = fs.readFileSync(input, 'utf8');
    const title = (md.match(/^#\s+(.*)$/m) || [, path.basename(input, '.md')])[1];
    const doc = wrapDocument({
        title,
        md,
        css: fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '',
    });
    const out = output || input.replace(/\.md$/, '.html');
    fs.writeFileSync(out, doc, 'utf8');
    console.log(`  ✓  ${path.relative(process.cwd(), out)}`);
}
