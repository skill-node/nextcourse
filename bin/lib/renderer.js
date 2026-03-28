/**
 * CourseFlow — 核心渲染模块
 *
 * 将解析后的 script.md 数据渲染为 Reveal.js HTML 课件。
 * 核心流程：读取模板 → 匹配组件 → 注入数据 → 输出 index.html
 *
 * 零外部依赖。
 */

const fs = require('fs');
const path = require('path');
const { parseScript } = require('./parser');

// ───── 路径常量 ─────
const ROOT_DIR = path.resolve(__dirname, '../..');
const TEMPLATE_PATH = path.join(ROOT_DIR, '.agent/skills/slide-renderer/resources/master_template.html');
const COLOR_SCHEMES_DIR = path.join(ROOT_DIR, 'shared_styles/color-schemes');

// ───── 动画预设映射 ─────
const ANIMATION_PRESETS = {
  'bold-signal':      { card: 'animate-fade-up', grid: 'animate-fade-up', vs: 'animate-fade-left', img: 'animate-fade-right', timing: 'smooth' },
  'electric-studio':  { card: 'animate-fade-up', grid: 'animate-fade-up', vs: 'animate-fade-left', img: 'animate-zoom-in',    timing: 'smooth' },
  'creative-voltage': { card: 'animate-zoom-in',  grid: 'animate-zoom-in', vs: 'animate-fade-left', img: 'animate-fade-right', timing: '' },
  'notebook-tabs':    { card: 'animate-fade-up', grid: 'animate-fade-up', vs: 'animate-fade-up',   img: 'animate-fade-up',    timing: 'smooth' },
  'swiss-modern':     { card: 'animate-fade-up', grid: 'animate-fade-up', vs: 'animate-fade-left', img: 'animate-fade-right', timing: '' },
  'dark-botanical':   { card: 'animate-fade-up', grid: 'animate-fade-up', vs: 'animate-fade-left', img: 'animate-fade-right', timing: 'smooth' },
  'default':          { card: 'animate-fade-up', grid: 'animate-fade-up', vs: 'animate-fade-left', img: 'animate-fade-right', timing: '' },
};

/**
 * 渲染课程
 * @param {string} coursePath — 课程目录路径（包含 script.md）
 * @param {object} options — { preset?: string, open?: boolean }
 * @returns {{ outputPath: string, slideCount: number, preset: string, warnings: string[] }}
 */
function render(coursePath, options = {}) {
  const scriptPath = path.join(coursePath, 'script.md');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`找不到 script.md: ${scriptPath}`);
  }

  // ───── 1. 解析 ─────
  const { frontmatter, slides } = parseScript(scriptPath);
  const warnings = [];

  // 处理预设覆盖
  const preset = options.preset || frontmatter.stylePreset;
  const colorScheme = preset || frontmatter.colorScheme;
  const template = frontmatter.template;

  console.log(`\n  📋 课程：${frontmatter.title}`);
  console.log(`  🎨 模板：${template} | 配色：${colorScheme}${preset ? ' (预设)' : ''}`);
  console.log(`  📄 共 ${slides.length} 页\n`);

  // ───── 2. 读取 master 模板 ─────
  const masterTemplate = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  // ───── 3. 生成所有 slide HTML ─────
  const animPreset = ANIMATION_PRESETS[preset] || ANIMATION_PRESETS['default'];
  const slidesHtml = slides.map(slide => {
    const result = renderSlide(slide, animPreset, warnings);
    return result;
  }).join('\n\n');

  // ───── 4. 读取预设 CSS（如有） ─────
  let presetCss = '';
  if (preset) {
    const presetPath = path.join(COLOR_SCHEMES_DIR, `${preset}.css`);
    if (fs.existsSync(presetPath)) {
      // 预设作为额外的 <link> 引入，不内联
      // 这样 master_template 中 {{COLOR_SCHEME}} 会指向预设文件
    } else {
      warnings.push(`⚠️  预设 CSS 不存在: ${preset}.css，回退到 ${frontmatter.colorScheme}`);
    }
  }

  // ───── 5. 组装 HTML ─────
  let html = masterTemplate;
  html = html.replaceAll('{{COURSE_TITLE}}', escapeHtml(frontmatter.title));
  html = html.replaceAll('{{COLOR_SCHEME}}', colorScheme);
  html = html.replaceAll('{{TEMPLATE}}', template);
  html = html.replaceAll('{{SLIDES_CONTENT}}', slidesHtml);
  html = html.replaceAll('{{STYLE_PRESET_CSS}}', presetCss);

  // ───── 6. 写入 ─────
  const outputPath = path.join(coursePath, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf-8');

  // ───── 7. 内容密度检测 ─────
  slides.forEach(slide => {
    if (slide.content.length > 6) {
      warnings.push(`⚠️  Slide ${slide.number}「${slide.title}」内容要点 ${slide.content.length} 项，建议拆分（≤6）`);
    }
  });

  // ───── 8. 资源校验 ─────
  const assetsDir = path.join(coursePath, 'assets');
  slides.forEach(slide => {
    if (slide.componentData && typeof slide.componentData === 'object') {
      checkAssets(slide.componentData, assetsDir, slide.number, warnings);
    }
  });

  return {
    outputPath,
    slideCount: slides.length,
    preset: colorScheme,
    warnings,
  };
}

/**
 * 渲染单个 Slide 为 HTML
 */
function renderSlide(slide, animPreset, warnings) {
  const component = slide.component.trim();

  // ───── 封面页 ─────
  if (component.includes('.cover-slide')) {
    return renderCover(slide);
  }

  // ───── 模块封面 ─────
  if (component.includes('.module-cover')) {
    return renderModuleCover(slide);
  }

  // ───── 结语页 ─────
  if (component.includes('.ending-slide')) {
    return renderEnding(slide);
  }

  // ───── grid-2（含 vs 对比） ─────
  if (component.includes('.grid-2')) {
    return renderGrid2(slide, animPreset);
  }

  // ───── grid-3 ─────
  if (component.includes('.grid-3')) {
    return renderGrid3(slide, animPreset);
  }

  // ───── 图文布局 ─────
  if (component.includes('.layout-img-left')) {
    return renderImgLayout(slide, 'left', animPreset);
  }
  if (component.includes('.layout-img-right')) {
    return renderImgLayout(slide, 'right', animPreset);
  }
  if (component.includes('.layout-img-top')) {
    return renderImgLayout(slide, 'top', animPreset);
  }

  // ───── 工作流 ─────
  if (component.includes('.workflow')) {
    return renderWorkflow(slide, animPreset);
  }

  // ───── 图标卡片 ─────
  if (component.includes('.icon-card-grid')) {
    return renderIconCardGrid(slide, animPreset);
  }

  // ───── 代码块 ─────
  if (component.includes('.code-block')) {
    return renderCodeBlock(slide);
  }

  // ───── 通用内容页（兜底） ─────
  return renderContentPage(slide, animPreset);
}

// ──────────────────────────────────────────────
//  组件渲染函数
// ──────────────────────────────────────────────

function renderCover(slide) {
  const divider = '<div class="divider"></div>';
  return `
            <!-- Slide ${slide.number}: 封面页 -->
            <section class="cover-slide">
                <h1>${escapeHtml(slide.title)}</h1>
                ${divider}
                ${slide.subtitle ? `<h2>${escapeHtml(slide.subtitle)}</h2>` : ''}
                ${slide.content.map(c => `<p>${escapeHtml(c)}</p>`).join('\n                ')}
                ${renderNotes(slide.notes)}
            </section>`;
}

function renderModuleCover(slide) {
  // 从 component 字符串中提取 module-N
  const moduleMatch = slide.component.match(/\.module-(\d+)/);
  const moduleClass = moduleMatch ? `module-${moduleMatch[1]}` : 'module-1';
  return `
            <!-- Slide ${slide.number}: 模块封面 -->
            <section class="module-cover ${moduleClass}">
                <h1>${escapeHtml(slide.title)}</h1>
                ${slide.moduleDesc ? `<p>${escapeHtml(slide.moduleDesc)}</p>` : ''}
                ${renderNotes(slide.notes)}
            </section>`;
}

function renderEnding(slide) {
  return `
            <!-- Slide ${slide.number}: 结语页 -->
            <section class="ending-slide">
                <h1>${escapeHtml(slide.title)}</h1>
                ${slide.content.map(c => `<p>${escapeHtml(c)}</p>`).join('\n                ')}
                ${renderNotes(slide.notes)}
            </section>`;
}

function renderGrid2(slide, anim) {
  const data = slide.componentData;
  let leftHtml = '', rightHtml = '';

  if (data && data.left && data.right) {
    leftHtml = data.left.map(item => renderInnerComponent(item, anim)).join('\n');
    rightHtml = data.right.map(item => renderInnerComponent(item, anim)).join('\n');
  } else {
    leftHtml = '<div>左侧内容</div>';
    rightHtml = '<div>右侧内容</div>';
  }

  return `
            <!-- Slide ${slide.number}: 两栏布局 -->
            <section>
                <h2>${escapeHtml(slide.title)}</h2>
                <div class="grid-2">
                    ${leftHtml}
                    ${rightHtml}
                </div>
                ${renderNotes(slide.notes)}
            </section>`;
}

function renderGrid3(slide, anim) {
  const data = slide.componentData;
  let cardsHtml = '';

  if (Array.isArray(data)) {
    cardsHtml = data.map((item, i) => {
      const cls = (item.class || '.card').replace('.', '');
      const animClass = `${anim.card} stagger-${i + 1}`;
      return `                    <div class="${cls} ${animClass}">
                        <h3>${escapeHtml(item.title || '')}</h3>
                        <p>${escapeHtml(item.content || '')}</p>
                    </div>`;
    }).join('\n');
  }

  return `
            <!-- Slide ${slide.number}: 三栏布局 -->
            <section>
                <h2>${escapeHtml(slide.title)}</h2>
                <div class="grid-3">
${cardsHtml}
                </div>
                ${renderNotes(slide.notes)}
            </section>`;
}

function renderImgLayout(slide, position, anim) {
  const data = slide.componentData;
  const layoutClass = `layout-img-${position}`;
  const imgSrc = (data && data.img) || './assets/placeholder.png';
  const textContent = (data && data.text) || '';

  // 将 markdown 风格的文本转换为 HTML
  const textHtml = markdownToHtml(textContent);

  const imgBlock = `<div class="img-container ${anim.img}">
                        <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(slide.title)}">
                    </div>`;
  const textBlock = `<div class="${anim.vs}">
                        ${textHtml}
                    </div>`;

  let innerHtml;
  if (position === 'right') {
    innerHtml = textBlock + '\n                    ' + imgBlock;
  } else if (position === 'top') {
    innerHtml = imgBlock + '\n                    ' + textBlock;
  } else {
    // left
    innerHtml = imgBlock + '\n                    ' + textBlock;
  }

  return `
            <!-- Slide ${slide.number}: 图文布局 (${position}) -->
            <section>
                <h2>${escapeHtml(slide.title)}</h2>
                <div class="${layoutClass}">
                    ${innerHtml}
                </div>
                ${renderNotes(slide.notes)}
            </section>`;
}

function renderWorkflow(slide, anim) {
  const data = slide.componentData;
  let nodesHtml = '';

  if (Array.isArray(data)) {
    nodesHtml = data.map((item, i) => {
      const icon = item.icon || 'cog';
      const node = `                    <div class="workflow-node ${anim.card} stagger-${i + 1}">
                        <i class="fas fa-${escapeHtml(icon)}"></i>
                        <h4>${escapeHtml(item.title || '')}</h4>
                        <p>${escapeHtml(item.content || item.description || '')}</p>
                    </div>`;
      if (i < data.length - 1) {
        return node + '\n                    <div class="workflow-line"></div>';
      }
      return node;
    }).join('\n');
  }

  return `
            <!-- Slide ${slide.number}: 工作流 -->
            <section>
                <h2>${escapeHtml(slide.title)}</h2>
                <div class="workflow">
${nodesHtml}
                </div>
                ${renderNotes(slide.notes)}
            </section>`;
}

function renderIconCardGrid(slide, anim) {
  const data = slide.componentData;
  let cardsHtml = '';

  if (Array.isArray(data)) {
    cardsHtml = data.map((item, i) => {
      const icon = item.icon || 'star';
      return `                    <div class="icon-card ${anim.card} stagger-${i + 1}">
                        <i class="fas fa-${escapeHtml(icon)}"></i>
                        <h4>${escapeHtml(item.title || '')}</h4>
                        <p>${escapeHtml(item.content || item.description || '')}</p>
                    </div>`;
    }).join('\n');
  }

  return `
            <!-- Slide ${slide.number}: 图标卡片 -->
            <section>
                <h2>${escapeHtml(slide.title)}</h2>
                <div class="icon-card-grid">
${cardsHtml}
                </div>
                ${renderNotes(slide.notes)}
            </section>`;
}

function renderCodeBlock(slide) {
  const data = slide.componentData;
  const code = (data && data.code) || slide.content.join('\n');

  return `
            <!-- Slide ${slide.number}: 代码块 -->
            <section>
                <h2>${escapeHtml(slide.title)}</h2>
                <pre class="code-block"><code>${escapeHtml(code)}</code></pre>
                ${renderNotes(slide.notes)}
            </section>`;
}

function renderContentPage(slide, anim) {
  const items = slide.content.map(c =>
    `<li>${markdownInline(c)}</li>`
  ).join('\n                    ');

  return `
            <!-- Slide ${slide.number}: 内容页 -->
            <section>
                <h2>${escapeHtml(slide.title)}</h2>
                <ul>
                    ${items}
                </ul>
                ${renderNotes(slide.notes)}
            </section>`;
}

// ──────────────────────────────────────────────
//  辅助函数
// ──────────────────────────────────────────────

/**
 * 渲染内嵌组件（用于 grid-2 的 left/right 块内部）
 */
function renderInnerComponent(item, anim) {
  const cls = (item.class || '').replace('.', '');
  let animClass = '';

  if (cls.includes('vs-bad')) animClass = anim.vs;
  else if (cls.includes('vs-good')) animClass = `${anim.vs}`.replace('left', 'right');
  else animClass = anim.card;

  // 将 content 中的分号或句号分割为列表项
  const contentParts = (item.content || '').split(/[；;。]/).filter(s => s.trim());
  const contentHtml = contentParts.length > 1
    ? `<ul>${contentParts.map(p => `<li>${escapeHtml(p.trim())}</li>`).join('')}</ul>`
    : `<p>${escapeHtml(item.content || '')}</p>`;

  return `                    <div class="${cls} ${animClass}">
                        <h3>${escapeHtml(item.title || '')}</h3>
                        ${contentHtml}
                    </div>`;
}

/**
 * 渲染演讲者备注
 */
function renderNotes(notes) {
  if (!notes) return '';
  return `<aside class="notes">${escapeHtml(notes)}</aside>`;
}

/**
 * HTML 转义
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 简易 Markdown → HTML
 * 支持 ### 标题、**粗体**、- 列表
 */
function markdownToHtml(text) {
  if (!text) return '';

  return text
    .split('\\n')
    .map(line => {
      line = line.trim();
      if (line.startsWith('### ')) return `<h3>${markdownInline(line.slice(4))}</h3>`;
      if (line.startsWith('## '))  return `<h3>${markdownInline(line.slice(3))}</h3>`;
      if (line.startsWith('- '))   return `<li>${markdownInline(line.slice(2))}</li>`;
      if (line) return `<p>${markdownInline(line)}</p>`;
      return '';
    })
    .join('\n                        ');
}

/**
 * 内联 Markdown（**粗体**）
 */
function markdownInline(text) {
  if (!text) return '';
  return text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/**
 * 递归检查组件数据中引用的图片是否存在
 */
function checkAssets(data, assetsDir, slideNum, warnings) {
  if (typeof data === 'string') return;

  if (data.img && typeof data.img === 'string') {
    const imgPath = data.img.replace(/^\.\//, '');
    const fullPath = path.join(path.dirname(assetsDir), imgPath);
    if (!fs.existsSync(fullPath)) {
      warnings.push(`⚠️  Slide ${slideNum}: 图片不存在 → ${data.img}`);
    }
  }

  // 递归检查数组和对象
  if (Array.isArray(data)) {
    data.forEach(item => checkAssets(item, assetsDir, slideNum, warnings));
  } else if (typeof data === 'object') {
    Object.values(data).forEach(val => checkAssets(val, assetsDir, slideNum, warnings));
  }
}

module.exports = { render };
