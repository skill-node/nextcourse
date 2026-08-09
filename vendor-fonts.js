#!/usr/bin/env node
/**
 * vendor-fonts.js — 把配色方案的 Display 字体从 Google Fonts 拉到 lib/fonts/display/
 *
 *   node vendor-fonts.js        # 需要联网; 会先清空 lib/fonts/display/ 再重建
 *
 * 只在「新增配色方案」或「换掉某套配色的 Display 字体」时跑。日常构建不需要。
 *
 * 为什么必须本地化: 课件要在无外网的教室里放。CSS 里的 CDN @import 是渲染阻塞资源,
 * 遇到"连了 wifi 但出不去"的网络会等到超时才出画面(实测 34s vs 3s)。
 *
 * 三条取舍:
 *   - 只取 latin 子集: 正文是中文, 拉丁字形只出现在标题里的数字/英文
 *   - 优先可变字体(wght@min..max): 一个文件覆盖全字重, 不必判断"到底用了哪几个字重",
 *     而且比多个静态字重更小(Cormorant 4 字重 137KB → 可变 34KB)
 *   - 原样保留 Google 返回的 @font-face 描述符, 只把 src 换成本地相对路径
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const OUT = path.join(__dirname, 'lib/fonts/display');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 拉丁 Display 字体: 一个 latin 分片就够
const FAMILIES = [
    { slug: 'archivo-black', family: 'Archivo Black', spec: 'Archivo+Black' },                     // 单一字重, 无可变版
    { slug: 'syne',          family: 'Syne',          spec: 'Syne:wght@400..800' },
    { slug: 'cormorant',     family: 'Cormorant',     spec: 'Cormorant:wght@300..700' },
    { slug: 'bodoni-moda',   family: 'Bodoni Moda',   spec: 'Bodoni+Moda:opsz,wght@6..96,400..900' },
    { slug: 'archivo',       family: 'Archivo',       spec: 'Archivo:wght@100..900' },

    // 中文字体: Google 按 unicode-range 切成 ~101 片, 浏览器只下载页面用得上的那几片。
    // 离线要求全部分片在本地, 但运行时开销仍只有实际用到的部分(一门课通常 10~20 片)。
    // 两者都是可变字体(单文件覆盖全字重), SIL OFL 授权, 可自由分发。
    { slug: 'noto-sans-sc',  family: 'Noto Sans SC',  spec: 'Noto+Sans+SC:wght@100..900',  sliced: true },
    { slug: 'noto-serif-sc', family: 'Noto Serif SC', spec: 'Noto+Serif+SC:wght@200..900', sliced: true },
];

function get(url, binary = false) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': UA } }, res => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return get(res.headers.location, binary).then(resolve, reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`${res.statusCode} ${url}`));
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => resolve(binary ? Buffer.concat(chunks) : Buffer.concat(chunks).toString('utf8')));
        }).on('error', reject);
    });
}

(async () => {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    const rows = [];

    for (const { slug, family, spec, sliced } of FAMILIES) {
        const css = await get(`https://fonts.googleapis.com/css2?family=${spec}&display=swap`);

        // 直接抓 @font-face 块, 并记下紧邻其前的 /* label */(如果有)。
        // 不能按注释切块: Google 只给拉丁分片加了 /* latin */ 这类标签,
        // 中文的近百个分片是**没有任何注释**的裸 @font-face, 按注释切会漏掉全部中文片。
        const blocks = [];
        const re = /(?:\/\*\s*([^*]+?)\s*\*\/\s*)?(@font-face\s*\{[^}]*\})/g;
        let m;
        while ((m = re.exec(css)) !== null) {
            const label = m[1] || '';           // 中文分片无标签
            if (sliced || label === 'latin') blocks.push(m[2]);
        }
        if (!blocks.length) throw new Error(`no usable subset for ${family}`);

        let outCss = `/* ${family} — 从 Google Fonts vendor 到本地${sliced ? ' (全 unicode-range 分片)' : ' (latin 子集)'}。\n` +
                     `   离线课件必须自带字体: 走 CDN 会在无外网的教室里把整页渲染阻塞几十秒。\n` +
                     `   重新生成见 DESIGN-SYSTEM.md「字体本地化」。 */\n`;
        let bytes = 0, files = 0;

        // 分片多时并发下载, 否则 200 个串行请求要等很久
        const jobs = blocks.map((block, idx) => ({ block, idx }));
        const CONCURRENCY = sliced ? 8 : 1;
        const results = new Array(jobs.length);
        for (let i = 0; i < jobs.length; i += CONCURRENCY) {
            await Promise.all(jobs.slice(i, i + CONCURRENCY).map(async ({ block, idx }) => {
                const m = block.match(/src:\s*url\((https:[^)]+\.woff2)\)([^;]*);/);
                if (!m) return;
                const buf = await get(m[1], true);
                const file = `${slug}${blocks.length > 1 ? `-${String(idx).padStart(3, '0')}` : ''}.woff2`;
                fs.writeFileSync(path.join(OUT, file), buf);
                // 块本身就是完整的 @font-face{...}; 原样保留全部描述符
                // (font-weight 范围 / font-stretch / unicode-range 等), 只把 src 换成本地路径
                results[idx] = {
                    size: buf.length,
                    css: '\n' + block.replace(/src:\s*url\(https:[^)]+\.woff2\)[^;]*;/,
                                              `src: url('./${file}') format('woff2');`) + '\n',
                };
            }));
        }
        for (const r of results) {
            if (!r) continue;
            outCss += r.css;
            bytes += r.size;
            files++;
        }

        fs.writeFileSync(path.join(OUT, `${slug}.css`), outCss);
        rows.push(`  ${family.padEnd(14)} ${String(files).padStart(3)} 文件  ${(bytes / 1024).toFixed(1).padStart(8)} KB`);
    }

    console.log(rows.join('\n'));
    const total = fs.readdirSync(OUT).filter(f => f.endsWith('.woff2'))
        .reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
    console.log(`  ${'合计'.padEnd(15)}         ${(total / 1024).toFixed(1)} KB`);
})().catch(e => { console.error('FAILED:', e.message); process.exit(1); });
