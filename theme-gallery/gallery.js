/* ===================================================================
   Theme Gallery — 运行时取值
   所有色值/字体栈都不写死在 HTML 里, 而是从真实加载的
   shared_styles/*.css 里 getComputedStyle 出来 —— 改 CSS, 展板自动跟着变。
   =================================================================== */
(function () {
    'use strict';

    const probe = document.createElement('span');
    probe.style.display = 'none';
    document.body.appendChild(probe);

    /* ---------- 色值工具 ---------- */

    // 把任意 CSS 颜色写法(hex / rgba / color-mix)统一成 [r,g,b,a]
    function toRGBA(value) {
        if (!value) return null;
        probe.style.color = '';
        probe.style.color = value.trim();
        const computed = getComputedStyle(probe).color;
        const m = computed.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
        return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
    }

    function readVar(name) {
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    }

    function toHex(rgba) {
        if (!rgba) return '—';
        const h = rgba.slice(0, 3)
            .map((n) => Math.round(n).toString(16).padStart(2, '0'))
            .join('');
        return '#' + h.toUpperCase();
    }

    // 半透明色叠到底色上, 得到眼睛实际看到的那个色
    function flatten(rgba, backdrop) {
        if (!rgba) return null;
        const a = rgba[3];
        if (a >= 0.999) return rgba;
        const bg = backdrop || [255, 255, 255, 1];
        return [
            rgba[0] * a + bg[0] * (1 - a),
            rgba[1] * a + bg[1] * (1 - a),
            rgba[2] * a + bg[2] * (1 - a),
            1,
        ];
    }

    function luminance(rgba) {
        const c = rgba.slice(0, 3).map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    }

    function contrast(a, b) {
        if (!a || !b) return null;
        const l1 = luminance(a);
        const l2 = luminance(b);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }

    function sameColor(a, b) {
        if (!a || !b) return false;
        return Math.abs(a[0] - b[0]) < 2 && Math.abs(a[1] - b[1]) < 2 && Math.abs(a[2] - b[2]) < 2;
    }

    // HSL 只用来判"是不是红/橘红家族"(规则 R1)
    function toHSL(rgba) {
        const r = rgba[0] / 255, g = rgba[1] / 255, b = rgba[2] / 255;
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
        let s = 0, h = 0;
        if (mx !== mn) {
            const d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
            h *= 60;
        }
        return [h, s * 100, l * 100];
    }

    // CIELAB 的感知彩度 C*。HSL 的 saturation 不能用来判"刺不刺激":
    // 砖红 #CD5C5C 和沙金 #D4A574 的 HSL 饱和度都是 53, 但 C* 分别是 50 和 34,
    // 满屏铺开的观感完全是两回事。
    function chroma(rgba) {
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const [r, g, b] = rgba.slice(0, 3).map(lin);
        let X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047;
        let Y = (0.2126 * r + 0.7152 * g + 0.0722 * b);
        let Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
        const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
        [X, Y, Z] = [f(X), f(Y), f(Z)];
        return Math.hypot(500 * (X - Y), 200 * (Y - Z));
    }

    // R1 的红系判定: 色相在绕过 0° 的那一段, 且彩度够高才算"刺眼"。
    // 实测两组之间有大空档 —— 要收敛的饱和红 C* 76~100,
    // 大地色/粉彩系的暖色 C* 19~50, 阈值取 60 落在空档里。
    const CHROMA_HOT = 60;

    function isRedFamily(rgba) {
        if (!rgba) return false;
        const [h] = toHSL(rgba);
        return (h <= 35 || h >= 340) && chroma(rgba) >= CHROMA_HOT;
    }

    function flag(kind, text) {
        return '<span class="tg-flag tg-flag--' + kind + '">' + text + '</span>';
    }

    // 全屏页的标题按 R4 走 4.5:1, 比 WCAG 大字的 3:1 严一档 ——
    // 会议室投影 + 环境光下 3:1 会糊。正文同样 4.5:1。
    const MIN_PROJECT = 4.5;

    function ratioFlag(r, min) {
        if (r === null) return flag('warn', '无法测算');
        min = min || MIN_PROJECT;
        const txt = r.toFixed(2) + ':1';
        if (r >= 7) return flag('ok', txt + ' AAA');
        if (r >= min) return flag('ok', txt);
        if (r >= 3) return flag('warn', txt + ' 仅够 WCAG 大字');
        return flag('bad', txt + ' 不达标');
    }

    // 文字对比度要按「单页背景」算 —— --bg-page 是整份 deck 的底，
    // notebook-tabs 这类配色两者并不相同，用错了会得出假警报
    const pageBg = flatten(
        toRGBA(readVar('--bg-slide')) || toRGBA(readVar('--bg-page')) || toRGBA('#ffffff'),
        [255, 255, 255, 1]
    );

    /* ---------- 1. 色板 ---------- */

    document.querySelectorAll('[data-tg-var]').forEach((el) => {
        const name = el.dataset.tgVar;
        const raw = readVar(name);
        const rgba = toRGBA(raw);
        const fill = el.querySelector('.tg-swatch__fill');
        const val = el.querySelector('.tg-swatch__val');
        if (fill) fill.style.background = raw || 'transparent';
        if (!val) return;
        if (!raw) {
            val.textContent = '未定义';
            el.querySelector('.tg-swatch__var').style.opacity = '0.45';
            return;
        }
        const flat = flatten(rgba, pageBg);
        let text = toHex(rgba);
        if (rgba && rgba[3] < 0.999) {
            text += '  α' + rgba[3].toFixed(2) + ' → ' + toHex(flat);
        }
        val.textContent = text;
    });

    /* ---------- 2. 全屏页：封面 / 封底 ---------- */

    const warnings = [];

    [['cover', '封面页', '.cover-slide'], ['ending', '封底页', '.ending-slide']].forEach(([key, label]) => {
        const host = document.querySelector('[data-tg-fullpage="' + key + '"]');
        if (!host) return;
        const section = host.querySelector('section');
        const h1 = host.querySelector('h1');
        const bg = flatten(toRGBA(getComputedStyle(section).backgroundColor), pageBg);
        const fg = flatten(toRGBA(getComputedStyle(h1).color), bg);
        const r = contrast(bg, fg);
        host.querySelector('.tg-module__foot').innerHTML = [
            '<span class="tg-module__hex">' + label + ' · 底 ' + toHex(bg) + '</span>',
            '<span class="tg-module__ratio">标题 ' + toHex(fg) + '</span>',
            ratioFlag(r),
            isRedFamily(bg) ? flag('bad', '红系全屏底') : '',
        ].join(' ');
        if (r !== null && r < MIN_PROJECT) {
            warnings.push({
                kind: r < 3 ? 'bad' : 'warn',
                text: label + '标题对比度 ' + r.toFixed(2) + ':1，低于投影下限 4.5:1。',
            });
        }
    });

    /* ---------- 3. 模块封面色 ---------- */

    const semantic = ['--primary', '--primary-dark', '--secondary', '--accent', '--success', '--danger']
        .map((n) => ({ name: n, rgba: toRGBA(readVar(n)) }))
        .filter((x) => x.rgba);

    const modules = [];
    const accentHits = [];

    for (let i = 1; i <= 10; i++) {
        const host = document.querySelector('[data-tg-module="' + i + '"]');
        if (!host) continue;
        const raw = readVar('--module-' + i);
        const rgba = flatten(toRGBA(raw), pageBg);
        const section = host.querySelector('section');
        const title = host.querySelector('.module-divider__title');
        const bg = flatten(toRGBA(getComputedStyle(section).backgroundColor), pageBg);
        const fg = flatten(toRGBA(getComputedStyle(title).color), bg);
        const r = contrast(bg, fg);
        const red = isRedFamily(rgba);
        modules.push({ i, rgba, bg, fg, ratio: r, red });

        const foot = host.querySelector('.tg-module__foot');
        const bits = [
            '<span class="tg-module__hex">--module-' + i + ' · ' + toHex(rgba) + '</span>',
            '<span class="tg-module__ratio">标题 ' + toHex(fg) + '</span>',
            ratioFlag(r),
        ];
        if (red) bits.push(flag(i === 10 ? 'info' : 'bad', '红系'));

        // 与语义色撞车。分两档：
        //   primary / primary-dark / secondary —— 是品牌色，module-1/2 沿用它是各配色的惯例，
        //     只在卡片上标一下，不进体检清单。
        //   accent / success / danger —— 带明确语义，撞了就是真冲突：学员在同一份 deck 里
        //     反复看到这个色表示"警示 / 正面 / 错误"，突然拿它当章节封面会串味。
        const BRAND = ['--primary', '--primary-dark', '--secondary'];
        semantic.forEach((s) => {
            if (!sameColor(rgba, s.rgba)) return;
            if (BRAND.includes(s.name)) {
                bits.push(flag('info', '＝ ' + s.name));
                return;
            }
            // R2 允许 --accent 撞 1 处（末位的品牌色常常就是 accent），撞第 2 处才算超标
            if (s.name === '--accent') {
                accentHits.push(i);
                bits.push(flag(accentHits.length > 1 ? 'warn' : 'info', '＝ --accent'));
                return;
            }
            const kind = (s.name === '--danger') ? 'bad' : 'warn';
            bits.push(flag(kind, '＝ ' + s.name));
            warnings.push({
                kind,
                text: '<code>--module-' + i + '</code> 与 <code>' + s.name +
                    '</code> 同色 (' + toHex(rgba) + ')' +
                    (s.name === '--danger'
                        ? ' —— 模块封面和"错误 / 反面例子"共用一个色，语义冲突最强。'
                        : ' —— 和"正面结果 / vs-good"共用一个色。'),
            });
        });

        // 模块之间重复: 两个模块封面长得一样, 翻页时学员感觉不到换章
        modules.slice(0, -1).forEach((m) => {
            if (sameColor(rgba, m.rgba)) {
                bits.push(flag('warn', '＝ module-' + m.i));
                warnings.push({
                    kind: 'warn',
                    text: '<code>--module-' + i + '</code> 与 <code>--module-' + m.i +
                        '</code> 完全同色 (' + toHex(rgba) + ') —— 翻到新模块时看不出换了章。',
                });
            }
        });

        // R4: 全屏页标题 ≥4.5:1
        if (r !== null && r < MIN_PROJECT) {
            warnings.push({
                kind: r < 3 ? 'bad' : 'warn',
                text: '<code>--module-' + i + '</code> 封面标题对比度 ' + r.toFixed(2) +
                    ':1，低于投影下限 4.5:1' + (r >= 3 ? '（勉强够 WCAG 大字的 3:1）' : '') + '。',
            });
        }
        foot.innerHTML = bits.join(' ');
    }

    // R2: --accent 只允许被占用一次
    if (accentHits.length > 1) {
        warnings.push({
            kind: 'warn',
            text: 'R2：<code>--accent</code> 被 ' + accentHits.length + ' 个模块色占用（module-' +
                accentHits.join('、') + '），只允许 1 处。',
        });
    }

    // R1: 全屏模块封面里红/橘红最多 1 个, 且固定放 module-10。
    // 理由是授课时翻到整屏红色过于刺激, 但完全没有红又丢掉了配色的性格,
    // 所以留一个、放在最少被用到的末位。
    const reds = modules.filter((m) => m.red).map((m) => m.i);
    if (reds.length > 1) {
        warnings.push({
            kind: 'bad',
            text: 'R1：红/橘红模块色有 ' + reds.length + ' 个（module-' + reds.join('、') +
                '），只允许 1 个且必须是 <code>--module-10</code>。',
        });
    } else if (reds.length === 1 && reds[0] !== 10) {
        warnings.push({
            kind: 'warn',
            text: 'R1：唯一的红/橘红模块色在 <code>--module-' + reds[0] +
                '</code>，应挪到 <code>--module-10</code>（末位最少被课程用到）。',
        });
    }

    /* ---------- 4. 正文可读性 ---------- */

    ['--text-heading', '--text-body', '--text-muted'].forEach((name) => {
        const el = document.querySelector('[data-tg-textratio="' + name + '"]');
        if (!el) return;
        const fg = flatten(toRGBA(readVar(name)), pageBg);
        const r = contrast(pageBg, fg);
        el.innerHTML = ratioFlag(r);
        if (r !== null && r < MIN_PROJECT) {
            warnings.push({
                kind: r < 3 ? 'bad' : 'warn',
                text: '<code>' + name + '</code> 落在 <code>--bg-slide</code> 上只有 ' +
                    r.toFixed(2) + ':1，低于 4.5:1。',
            });
        }
    });

    /* ---------- 4b. R5：语义色当文字用时的对比度 ----------
       五个语义色在 standard.css / components.css 里全都被当文字色用:
       .vs-good h3 / .vs-bad h3 / .text-* / .stat-item__number / .icon-card__icon。
       它们落在 --bg-slide 上如果不到 4.5:1, 那些规则就等于白写 ——
       notebook-tabs 的五个粉彩语义色只有 1.6:1, 就是这么躲过去的。 */

    ['--primary', '--secondary', '--accent', '--success', '--danger'].forEach((name) => {
        const el = document.querySelector('[data-tg-semratio="' + name + '"]');
        const fg = flatten(toRGBA(readVar(name)), pageBg);
        const r = contrast(pageBg, fg);
        if (el) el.innerHTML = r === null ? '' : ratioFlag(r);
        if (r !== null && r < MIN_PROJECT) {
            warnings.push({
                kind: r < 3 ? 'bad' : 'warn',
                text: 'R5：<code>' + name + '</code> 当文字色落在 <code>--bg-slide</code> 上只有 ' +
                    r.toFixed(2) + ':1 —— 引用它的 <code>.text-*</code> / <code>.vs-* h3</code> / ' +
                    '统计数字 / 图标会看不清。',
            });
        }
    });

    /* ---------- 5. 必备令牌 ----------
       漏定义不会报错, 只是 var() 静默失效 —— dark-ocean / warm-sand 缺 --success
       就这么躲了很久, 害得 .vs-good 标题、.check-list 对勾、.text-success 三处全哑火 */

    ['--primary', '--primary-dark', '--secondary', '--accent', '--success', '--danger',
        '--text-heading', '--text-body', '--text-muted', '--text-inverse', '--text-on-module',
        '--bg-page', '--bg-slide', '--bg-card']
        .concat(Array.from({ length: 10 }, (_, i) => '--module-' + (i + 1)))
        .forEach((name) => {
            if (!readVar(name)) {
                warnings.push({ kind: 'bad', text: '<code>' + name + '</code> 未定义 —— 引用它的规则会静默失效。' });
            }
        });

    /* ---------- 6. 字体栈 ---------- */

    document.querySelectorAll('[data-tg-font]').forEach((el) => {
        const raw = readVar(el.dataset.tgFont);
        el.textContent = raw || '未定义';
    });

    /* ---------- 7. 诊断汇总 ---------- */

    const diag = document.querySelector('[data-tg-diagnostics]');
    if (diag) {
        if (!warnings.length) {
            diag.innerHTML = '<ul><li>' + flag('ok', '通过') +
                '<span>R1–R5 全部满足：红系模块色 ≤1 且在末位、语义色无撞车、' +
                '模块色互不重复、全屏页与正文对比度均 ≥4.5:1、语义色可当文字用、必备令牌齐全。</span></li></ul>';
        } else {
            const order = { bad: 0, warn: 1 };
            warnings.sort((a, b) => order[a.kind] - order[b.kind]);
            diag.innerHTML = '<ul>' + warnings.map((w) =>
                '<li>' + flag(w.kind, w.kind === 'bad' ? '需处理' : '留意') +
                '<span>' + w.text + '</span></li>'
            ).join('') + '</ul>';
        }
    }
}());
