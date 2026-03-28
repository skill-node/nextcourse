/**
 * CourseFlow Web UI — 核心前端逻辑
 *
 * 单文件 SPA：路由、仪表盘、课程工作台、实时预览。
 * 零框架依赖，原生 DOM 操作。
 */

// ═══════════════════════════════════════════
//  工具函数
// ═══════════════════════════════════════════

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

async function api(endpoint, options = {}) {
  const res = await fetch(`/api${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `请求失败: ${res.status}`);
  }
  return res.json();
}

function toast(message, type = 'info') {
  const container = $('#toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3500);
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function showModal(html) {
  const overlay = $('#modal-overlay');
  const content = $('#modal-content');
  content.innerHTML = html;
  overlay.classList.remove('hidden');
  overlay.onclick = (e) => { if (e.target === overlay) hideModal(); };
}
function hideModal() { $('#modal-overlay').classList.add('hidden'); }

// ═══════════════════════════════════════════
//  路由
// ═══════════════════════════════════════════

const router = {
  go(path) {
    history.pushState(null, '', path);
    this.render();
  },
  render() {
    const path = location.pathname;
    if (path.startsWith('/course/')) {
      const name = path.split('/course/')[1];
      renderWorkbench(name);
    } else {
      renderDashboard();
    }
  },
};

window.addEventListener('popstate', () => router.render());

// ═══════════════════════════════════════════
//  仪表盘视图
// ═══════════════════════════════════════════

async function renderDashboard() {
  const app = $('#app');
  app.innerHTML = `
    <div class="dashboard-header">
      <h2>📚 课程列表</h2>
      <button class="btn btn-primary" id="btn-new-course">＋ 新建课程</button>
    </div>
    <div class="course-grid" id="course-grid">
      <div class="empty-state">
        <div class="empty-state-icon">⏳</div>
        <div class="empty-state-text">加载中…</div>
      </div>
    </div>
  `;

  $('#btn-new-course').onclick = showNewCourseModal;

  try {
    const courses = await api('/courses');
    const grid = $('#course-grid');

    if (courses.length === 0) {
      grid.innerHTML = `
        <div class="course-card new-card" onclick="showNewCourseModal()">
          <div class="new-card-icon">＋</div>
          <div class="new-card-text">创建第一个课程</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = courses.map(c => `
      <div class="course-card" onclick="router.go('/course/${c.name}')">
        <div class="card-title">${escapeHtml(c.title)}</div>
        <div class="card-meta">
          <span class="card-tag tag-preset">${c.stylePreset || c.colorScheme}</span>
          <span class="card-tag tag-slides">${c.slideCount} 页</span>
          ${c.hasHtml ? '<span class="card-tag tag-rendered">已渲染</span>' : '<span class="card-tag tag-status">未渲染</span>'}
        </div>
        <div class="card-date">${formatDate(c.lastModified)}</div>
      </div>
    `).join('') + `
      <div class="course-card new-card" onclick="showNewCourseModal()">
        <div class="new-card-icon">＋</div>
        <div class="new-card-text">新建课程</div>
      </div>
    `;
  } catch (err) {
    toast(err.message, 'error');
  }
}

// ───── 新建课程弹窗 ─────

let cachedPresets = null;
let openAIAfterNav = false; // 跳转到工作台后是否自动打开 AI 面板

async function showNewCourseModal() {
  if (!cachedPresets) {
    try { cachedPresets = await api('/presets'); } catch (e) { cachedPresets = []; }
  }

  const presetOptions = cachedPresets.map(p =>
    `<option value="${p.name}">${p.name} — ${p.desc}</option>`
  ).join('');

  showModal(`
    <div class="modal-title">✨ 新建课程</div>
    <div class="field-group">
      <div class="field-label">课程标题</div>
      <input class="field-input" id="new-course-title" placeholder="例如: AI 驱动的领导力培训" autofocus>
    </div>
    <div class="field-group">
      <div class="field-label">模板</div>
      <select class="field-select" id="new-course-template">
        <option value="standard">Standard — 企业培训</option>
        <option value="modern">Modern — 现代风格</option>
      </select>
    </div>
    <div class="field-group">
      <div class="field-label">配色方案</div>
      <select class="field-select" id="new-course-preset">${presetOptions}</select>
    </div>
    <div style="margin-top:16px;padding:12px;background:rgba(99,102,241,0.08);border-radius:8px;font-size:0.8rem;color:var(--text-secondary);line-height:1.6;">
      💡 创建后将自动打开 <strong>AI 内容设计助手</strong>，引导你完成课程结构设计。你也可以跳过，直接编辑幻灯片。
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">取消</button>
      <button class="btn btn-primary" id="btn-create-course">创建并开始设计</button>
    </div>
  `);

  $('#btn-create-course').onclick = async () => {
    const title = $('#new-course-title').value.trim();
    const template = $('#new-course-template').value;
    const preset = $('#new-course-preset').value;

    if (!title) { toast('请输入课程标题', 'warning'); return; }

    try {
      const result = await api('/courses', {
        method: 'POST',
        body: { title, template, colorScheme: preset, stylePreset: preset },
      });
      hideModal();
      toast(`课程「${title}」已创建`, 'success');

      // 标记：跳转后自动打开 AI 面板
      openAIAfterNav = true;
      router.go(`/course/${result.name}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

// ═══════════════════════════════════════════
//  工作台视图
// ═══════════════════════════════════════════

let currentCourse = null;

async function renderWorkbench(name) {
  const app = $('#app');
  app.innerHTML = `
    <div class="workbench">
      <div class="wb-toolbar">
        <button class="back-btn" onclick="router.go('/')">← 返回</button>
        <div class="course-title" id="wb-title">加载中…</div>
        <select class="field-select" id="wb-preset-select" style="width:200px;"></select>
        <button class="btn btn-primary" id="btn-render">🚀 渲染</button>
        <button class="btn btn-secondary" id="btn-edit-mode">✏️ 编辑</button>
        <button class="btn btn-secondary" id="btn-present">📺 演示</button>
        <button class="btn btn-secondary" id="btn-ai" style="background:rgba(99,102,241,0.15);color:var(--accent-light);border-color:rgba(99,102,241,0.3);">🤖 AI 助手</button>
      </div>
      <div class="wb-main">
        <div class="wb-editor">
          <div class="editor-tabs">
            <button class="editor-tab active" data-tab="slides">幻灯片</button>
            <button class="editor-tab" data-tab="raw">源码</button>
          </div>
          <div class="editor-content" id="editor-content"></div>
        </div>
        <div class="wb-preview">
          <div class="preview-toolbar">
            <span class="preview-label">实时预览</span>
            <button class="btn btn-sm btn-ghost" id="btn-refresh-preview">🔄 刷新</button>
          </div>
          <iframe class="preview-frame" id="preview-frame" src="about:blank"></iframe>
        </div>
      </div>
      <div class="wb-thumbnails" id="wb-thumbnails"></div>
    </div>
  `;

  // 加载数据
  try {
    currentCourse = await api(`/courses/${name}`);
    $('#wb-title').textContent = currentCourse.frontmatter.title;

    // 加载预设
    if (!cachedPresets) { cachedPresets = await api('/presets'); }
    const presetSelect = $('#wb-preset-select');
    presetSelect.innerHTML = cachedPresets.map(p =>
      `<option value="${p.name}" ${p.name === (currentCourse.frontmatter.stylePreset || currentCourse.frontmatter.colorScheme) ? 'selected' : ''}>${p.name}</option>`
    ).join('');

    // 渲染 Slide 列表
    renderSlideList();
    renderThumbnails();

    // 加载预览
    loadPreview(name);

    // 绑定事件
    setupWorkbenchEvents(name);

    // 新建课程后自动打开 AI 内容设计面板
    if (openAIAfterNav) {
      openAIAfterNav = false;
      setTimeout(() => toggleAIPanel(name), 300);
    }

  } catch (err) {
    toast(err.message, 'error');
    router.go('/');
  }
}

function renderSlideList() {
  const container = $('#editor-content');
  if (!currentCourse) return;

  // 组件选项
  const componentOptions = [
    '.cover-slide', '.module-cover.module-1', '.module-cover.module-2',
    '.module-cover.module-3', '.grid-2', '.grid-3',
    '.layout-img-left', '.layout-img-right', '.layout-img-top',
    '.workflow', '.icon-card-grid', '.code-block', '.ending-slide'
  ];

  container.innerHTML = `
    <div class="slide-list" id="slide-list">
      ${currentCourse.slides.map((slide, i) => `
        <div class="slide-item" data-index="${i}" id="slide-item-${i}">
          <div class="slide-item-header" onclick="toggleSlide(${i})">
            <span class="slide-number">${slide.number}</span>
            <span class="slide-title-text">${escapeHtml(slide.title || '(无标题)')}</span>
            <span class="slide-component-tag">${escapeHtml(slide.component || '—')}</span>
            <span class="slide-expand-icon">▸</span>
          </div>
          <div class="slide-item-body">
            <div class="field-group">
              <div class="field-label">标题</div>
              <input class="field-input" data-slide="${i}" data-field="title" value="${escapeHtml(slide.title)}">
            </div>
            <div class="field-group">
              <div class="field-label">副标题</div>
              <input class="field-input" data-slide="${i}" data-field="subtitle" value="${escapeHtml(slide.subtitle || '')}">
            </div>
            <div class="field-group">
              <div class="field-label">视觉组件</div>
              <select class="field-select" data-slide="${i}" data-field="component">
                ${componentOptions.map(c => `<option value="${c}" ${c === slide.component ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
            <div class="field-group">
              <div class="field-label">内容要点（每行一项）</div>
              <textarea class="field-textarea" data-slide="${i}" data-field="content" rows="3">${(slide.content || []).join('\n')}</textarea>
            </div>
            <div class="field-group">
              <div class="field-label">演讲备注</div>
              <textarea class="field-textarea" data-slide="${i}" data-field="notes" rows="2">${escapeHtml(slide.notes || '')}</textarea>
            </div>
            <div class="field-group">
              <div class="field-label">模块说明</div>
              <input class="field-input" data-slide="${i}" data-field="moduleDesc" value="${escapeHtml(slide.moduleDesc || '')}">
            </div>
          </div>
        </div>
      `).join('')}
      <button class="btn btn-secondary" style="width:100%;margin-top:8px;" onclick="addSlide()">＋ 添加幻灯片</button>
    </div>
  `;

  // 绑定编辑事件 — 自动保存 (debounced)
  $$('[data-slide]', container).forEach(el => {
    el.addEventListener('input', debounce(() => syncSlidesToScript(), 800));
  });
}

function renderThumbnails() {
  const container = $('#wb-thumbnails');
  if (!currentCourse) return;

  container.innerHTML = currentCourse.slides.map((slide, i) => `
    <div class="thumb-item ${i === 0 ? 'active' : ''}" data-index="${i}" onclick="jumpToSlide(${i})">
      ${slide.number}. ${escapeHtml((slide.title || '').substring(0, 8))}
    </div>
  `).join('');
}

// ───── 交互绑定 ─────

function setupWorkbenchEvents(name) {
  // 渲染按钮
  $('#btn-render').onclick = async () => {
    const btn = $('#btn-render');
    btn.innerHTML = '<span class="spinner"></span> 渲染中…';
    btn.disabled = true;

    try {
      const preset = $('#wb-preset-select').value;
      const result = await api(`/render/${name}`, { method: 'POST', body: { preset } });

      toast(`✅ 渲染完成 — ${result.slideCount} 页`, 'success');
      if (result.warnings.length > 0) {
        result.warnings.forEach(w => toast(w, 'warning'));
      }

      loadPreview(name);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.innerHTML = '🚀 渲染';
      btn.disabled = false;
    }
  };

  // 演示按钮
  $('#btn-present').onclick = () => {
    window.open(`/courses/${name}/index.html`, '_blank');
  };

  // 刷新预览
  $('#btn-refresh-preview').onclick = () => loadPreview(name);

  // Tab 切换
  $$('.editor-tab').forEach(tab => {
    tab.onclick = () => {
      $$('.editor-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      if (tab.dataset.tab === 'raw') {
        renderRawEditor();
      } else {
        renderSlideList();
      }
    };
  });

  // AI 助手按钮
  $('#btn-ai').onclick = () => toggleAIPanel(name);

  // 编辑模式按钮
  $('#btn-edit-mode').onclick = () => {
    const frame = $('#preview-frame');
    try {
      frame.contentWindow.postMessage({ type: 'toggle-edit-mode' }, '*');
    } catch (e) {
      toast('请先渲染课件', 'warning');
    }
  };

  // 监听 iframe postMessage（编辑器通信）
  window.__editorMsgHandler = (e) => {
    if (e.data.type === 'slides-edited') {
      handleSlidesEdited(e.data.changes, name);
    }
    if (e.data.type === 'edit-mode-changed') {
      const btn = $('#btn-edit-mode');
      if (btn) {
        btn.style.background = e.data.editMode ? 'var(--accent)' : '';
        btn.style.color = e.data.editMode ? '#fff' : '';
      }
    }
  };
  window.removeEventListener('message', window.__editorMsgHandler);
  window.addEventListener('message', window.__editorMsgHandler);
}

// ───── Raw 源码编辑器 ─────

function renderRawEditor() {
  const container = $('#editor-content');
  container.innerHTML = `
    <div style="padding:12px;">
      <textarea class="field-textarea" id="raw-editor"
        style="width:100%;height:calc(100vh - 280px);font-family:'SF Mono','Fira Code',monospace;font-size:0.8rem;line-height:1.6;resize:none;"
      >${escapeHtml(currentCourse.raw)}</textarea>
      <button class="btn btn-primary" style="margin-top:8px;width:100%;" id="btn-save-raw">💾 保存</button>
    </div>
  `;

  $('#btn-save-raw').onclick = async () => {
    const content = $('#raw-editor').value;
    try {
      const result = await api(`/courses/${currentCourse.name}/script`, {
        method: 'PUT',
        body: { content },
      });
      currentCourse.raw = content;
      currentCourse.frontmatter = result.frontmatter;
      currentCourse.slides = result.slides;
      toast('script.md 已保存', 'success');
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

// ───── 幻灯片操作 ─────

function toggleSlide(index) {
  const item = $(`#slide-item-${index}`);
  if (!item) return;
  item.classList.toggle('expanded');

  // 高亮缩略图
  $$('.thumb-item').forEach((t, i) => t.classList.toggle('active', i === index));
}

function jumpToSlide(index) {
  // 高亮缩略图
  $$('.thumb-item').forEach((t, i) => t.classList.toggle('active', i === index));

  // 在预览 iframe 中跳转
  const frame = $('#preview-frame');
  try {
    frame.contentWindow.Reveal.slide(index);
  } catch (e) { /* iframe 可能未加载 */ }

  // 展开对应 Slide
  $$('.slide-item').forEach(s => s.classList.remove('expanded'));
  const item = $(`#slide-item-${index}`);
  if (item) { item.classList.add('expanded'); item.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}

function addSlide() {
  if (!currentCourse) return;
  const num = currentCourse.slides.length + 1;
  currentCourse.slides.push({
    number: num,
    title: `新幻灯片 ${num}`,
    subtitle: '',
    content: [],
    component: '.grid-2',
    componentData: null,
    notes: '',
    moduleDesc: '',
  });

  syncSlidesToScript();
  renderSlideList();
  renderThumbnails();
  toast(`已添加 Slide ${num}`, 'info');
}

// ───── 双向同步：表单 → script.md ─────

async function syncSlidesToScript() {
  if (!currentCourse) return;

  // 从表单中读取最新数据
  currentCourse.slides.forEach((slide, i) => {
    const getVal = (field) => {
      const el = $(`[data-slide="${i}"][data-field="${field}"]`);
      return el ? el.value : '';
    };

    slide.title = getVal('title');
    slide.subtitle = getVal('subtitle');
    slide.component = getVal('component');
    slide.notes = getVal('notes');
    slide.moduleDesc = getVal('moduleDesc');

    const contentRaw = getVal('content');
    slide.content = contentRaw ? contentRaw.split('\n').filter(l => l.trim()) : [];
  });

  // 重新生成 script.md
  const scriptContent = buildScriptMd(currentCourse.frontmatter, currentCourse.slides);

  try {
    const result = await api(`/courses/${currentCourse.name}/script`, {
      method: 'PUT',
      body: { content: scriptContent },
    });
    currentCourse.raw = scriptContent;
  } catch (err) {
    toast('保存失败: ' + err.message, 'error');
  }
}

function buildScriptMd(fm, slides) {
  let md = '---\n';
  md += `title: ${fm.title}\n`;
  md += `template: ${fm.template}\n`;
  md += `color-scheme: ${fm.colorScheme}\n`;
  if (fm.stylePreset) md += `style-preset: ${fm.stylePreset}\n`;
  md += '---\n\n';

  slides.forEach((slide, i) => {
    md += `[Slide ${i + 1}]\n`;
    md += `# ${slide.title}\n`;
    if (slide.subtitle) md += `## ${slide.subtitle}\n`;
    if (slide.component) md += `- 视觉组件: ${slide.component}\n`;
    if (slide.moduleDesc) md += `- 模块说明: ${slide.moduleDesc}\n`;
    slide.content.forEach(c => md += `- 核心内容要点: ${c}\n`);
    if (slide.componentData) {
      try {
        md += `- 组件内容: ${JSON.stringify(slide.componentData)}\n`;
      } catch (e) {}
    }
    if (slide.notes) md += `- 演讲备注: ${slide.notes}\n`;
    md += '\n';
  });

  return md;
}

// ───── AI 面板切换 ─────

function toggleAIPanel(courseName) {
  const panel = $('#ai-panel');
  const isHidden = panel.classList.contains('hidden');

  if (isHidden) {
    panel.classList.remove('hidden');
    document.body.classList.add('ai-open');
    if (typeof initAIChat === 'function') {
      initAIChat(courseName || (currentCourse && currentCourse.name));
    }
  } else {
    panel.classList.add('hidden');
    document.body.classList.remove('ai-open');
  }
}

// ───── 处理可视化编辑器变更 ─────

async function handleSlidesEdited(changes, courseName) {
  if (!currentCourse || !changes) return;

  // 将编辑器中的变更合并到 slides 数据
  changes.forEach(change => {
    const slide = currentCourse.slides[change.slideIndex];
    if (!slide) return;

    if (change.title) slide.title = change.title;
    if (change.subtitle) slide.subtitle = change.subtitle;
    if (change.content && change.content.length > 0) {
      slide.content = change.content;
    }
  });

  // 重新生成 script.md
  const scriptContent = buildScriptMd(currentCourse.frontmatter, currentCourse.slides);

  try {
    await api(`/courses/${courseName}/script`, {
      method: 'PUT',
      body: { content: scriptContent },
    });
    currentCourse.raw = scriptContent;
    renderSlideList();
    renderThumbnails();
    toast('✅ 可视化编辑已保存', 'success');
  } catch (err) {
    toast('保存失败: ' + err.message, 'error');
  }
}

// ───── 加载预览（注入编辑器脚本） ─────

function loadPreview(name) {
  const frame = $('#preview-frame');
  if (!frame) return;
  frame.src = `/courses/${name}/index.html?t=${Date.now()}`;

  // iframe 加载完成后注入编辑器脚本
  frame.onload = () => {
    try {
      const doc = frame.contentDocument || frame.contentWindow.document;
      const existingScript = doc.querySelector('script[data-cf-editor]');
      if (!existingScript) {
        const script = doc.createElement('script');
        script.src = '/js/editor-inject.js';
        script.dataset.cfEditor = 'true';
        doc.body.appendChild(script);
      }
    } catch (e) {
      // 跨域限制，忽略
    }
  };
}

// ───── refreshWorkbench（供 AI 模块调用） ─────

window.refreshWorkbench = async function () {
  if (!currentCourse) return;
  try {
    const data = await api(`/courses/${currentCourse.name}`);
    currentCourse = data;
    renderSlideList();
    renderThumbnails();
    $('#wb-title').textContent = data.frontmatter.title;
  } catch (e) {}
};

// ───── 工具函数 ─────

function escapeHtml(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function debounce(fn, delay) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// ───── 全局暴露（onclick 使用） ─────
window.router = router;
window.showNewCourseModal = showNewCourseModal;
window.toggleSlide = toggleSlide;
window.jumpToSlide = jumpToSlide;
window.addSlide = addSlide;
window.hideModal = hideModal;
window.toggleAIPanel = toggleAIPanel;

// ───── 启动 ─────
document.addEventListener('DOMContentLoaded', () => router.render());
