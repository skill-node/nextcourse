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
      // 先获取课程信息，根据 phase 决定显示哪个视图
      renderCourseView(name);
    } else {
      renderDashboard();
    }
  },
};

window.addEventListener('popstate', () => router.render());

/**
 * 根据课程阶段决定显示哪个视图
 */
async function renderCourseView(name) {
  // 检查 URL 参数是否强制进入工作台
  const params = new URLSearchParams(window.location.search);
  const forceWorkbench = params.get('force') === 'workbench';

  try {
    const course = await api(`/courses/${name}`);

    if (course.phase === 'draft' && !forceWorkbench) {
      // 草稿态：进入设计工作室
      renderDesignStudio(name, course);
    } else {
      // 结构化/渲染态 或 强制工作台：进入工作台
      renderWorkbench(name, course);
    }
  } catch (err) {
    toast(err.message, 'error');
    router.go('/');
  }
}

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
        <button class="card-delete-btn" onclick="event.stopPropagation(); confirmDeleteCourse('${c.name}', '${escapeHtml(c.title)}')" title="删除课程">🗑️</button>
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

/**
 * 确认删除课程
 */
function confirmDeleteCourse(courseName, courseTitle) {
  showModal(`
    <div class="modal-title">🗑️ 删除课程</div>
    <div style="padding:16px 0;font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">
      <p>确定要删除课程 <strong>「${escapeHtml(courseTitle)}」</strong> 吗？</p>
      <p style="color:var(--danger);margin-top:8px;">此操作不可恢复，课程文件将被永久删除。</p>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">取消</button>
      <button class="btn btn-primary" style="background:var(--danger);" id="btn-confirm-delete">确认删除</button>
    </div>
  `);

  $('#btn-confirm-delete').onclick = async () => {
    try {
      await api(`/courses/${courseName}`, { method: 'DELETE' });
      hideModal();
      toast(`课程「${courseTitle}」已删除`, 'success');
      renderDashboard();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
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

  const durationOptions = [
    { value: '30min', label: '30 分钟' },
    { value: '1h', label: '1 小时' },
    { value: '2h', label: '2 小时' },
    { value: 'half-day', label: '半天（3-4小时）' },
    { value: '1day', label: '1 天' },
  ].map(o => `<option value="${o.value}">${o.label}</option>`).join('');

  showModal(`
    <div class="modal-title">✨ 新建课程</div>
    <div class="modal-subtitle">填写基础信息，AI 将引导你完成课程设计</div>

    <div class="form-grid">
      <div class="field-group">
        <div class="field-label">课程主题 <span class="required">*</span></div>
        <input class="field-input" id="new-course-title" placeholder="例如：AI 驱动的领导力培训" autofocus autocomplete="off">
      </div>
      <div class="field-group">
        <div class="field-label">培训对象 <span class="required">*</span></div>
        <input class="field-input" id="new-course-audience" placeholder="例如：企业高管、HRVP、新员工" autocomplete="off">
      </div>
    </div>

    <div class="field-group">
      <div class="field-label">培训目标 <span class="required">*</span></div>
      <textarea class="field-textarea" id="new-course-goal" rows="2" placeholder="学完能解决什么具体问题？获得什么能力？"></textarea>
    </div>

    <div class="form-grid">
      <div class="field-group">
        <div class="field-label">预计时长</div>
        <select class="field-select" id="new-course-duration">
          <option value="">请选择</option>
          ${durationOptions}
        </select>
      </div>
      <div class="field-group">
        <div class="field-label">模板风格</div>
        <select class="field-select" id="new-course-template">
          <option value="standard">Standard — 企业培训</option>
          <option value="modern">Modern — 现代风格</option>
        </select>
      </div>
    </div>

    <div class="field-group">
      <div class="field-label">配色方案</div>
      <select class="field-select" id="new-course-preset">${presetOptions}</select>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">取消</button>
      <button class="btn btn-primary" id="btn-create-course">创建并开始设计</button>
    </div>
  `);

  // 添加样式
  const style = document.createElement('style');
  style.id = 'modal-extra-style';
  style.textContent = `
    .modal-subtitle { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 20px; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .required { color: var(--danger); }
  `;
  if (!document.getElementById('modal-extra-style')) {
    document.head.appendChild(style);
  }

  $('#btn-create-course').onclick = async () => {
    const title = $('#new-course-title').value.trim();
    const targetAudience = $('#new-course-audience').value.trim();
    const learningGoal = $('#new-course-goal').value.trim();
    const duration = $('#new-course-duration').value;
    const template = $('#new-course-template').value;
    const preset = $('#new-course-preset').value;

    if (!title) { toast('请输入课程主题', 'warning'); return; }
    if (!targetAudience) { toast('请输入培训对象', 'warning'); return; }
    if (!learningGoal) { toast('请输入培训目标', 'warning'); return; }

    try {
      const result = await api('/courses', {
        method: 'POST',
        body: { title, targetAudience, learningGoal, duration, template, colorScheme: preset, stylePreset: preset },
      });
      hideModal();
      toast(`课程「${title}」已创建`, 'success');

      // 标记：跳转后自动打开设计工作室
      openAIAfterNav = true;
      router.go(`/course/${result.name}`);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

// ═══════════════════════════════════════════
//  设计工作室视图（草稿态课程）
// ═══════════════════════════════════════════

let currentCourse = null;
let currentAIPhase = 'analysis'; // 当前 AI 设计阶段
let autoScrollEnabled = true; // 智能滚动：是否启用自动滚动

/**
 * 渲染设计工作室 - 为草稿态课程提供 AI 引导界面
 * @param {string} name - 课程名称
 * @param {object} course - 课程数据
 */
async function renderDesignStudio(name, course) {
  currentCourse = course;
  const app = $('#app');
  const context = course.aiContext || {};

  app.innerHTML = `
    <div class="design-studio">
      <div class="ds-toolbar">
        <button class="back-btn" onclick="router.go('/')">← 返回</button>
        <div class="ds-title">${escapeHtml(context.title || course.frontmatter.title)}</div>
        <div class="ds-phase-badge" id="ds-phase-badge">设计阶段</div>
      </div>

      <div class="ds-main">
        <!-- 左侧栏：课程信息 + 阶段指示器 -->
        <div class="ds-left-sidebar">
          <div class="ds-info-card">
            <div class="info-title">📋 课程信息</div>
            <div class="info-item">
              <div class="info-label">培训对象</div>
              <div class="info-value">${escapeHtml(context.targetAudience || '未填写')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">培训目标</div>
              <div class="info-value">${escapeHtml(context.learningGoal || '未填写')}</div>
            </div>
            <div class="info-item">
              <div class="info-label">预计时长</div>
              <div class="info-value">${formatDuration(context.duration)}</div>
            </div>
            <button class="btn btn-sm btn-ghost btn-edit" id="btn-edit-context">✏️ 编辑</button>
          </div>

          <div class="ds-phase-indicator">
            <div class="phase-step" data-phase="analysis">
              <div class="phase-dot"></div>
              <div class="phase-label">需求分析</div>
            </div>
            <div class="phase-line"></div>
            <div class="phase-step" data-phase="design">
              <div class="phase-dot"></div>
              <div class="phase-label">结构设计</div>
            </div>
            <div class="phase-line"></div>
            <div class="phase-step" data-phase="content">
              <div class="phase-dot"></div>
              <div class="phase-label">内容细化</div>
            </div>
            <div class="phase-line"></div>
            <div class="phase-step" data-phase="mapping">
              <div class="phase-dot"></div>
              <div class="phase-label">幻灯片映射</div>
            </div>
          </div>

          <!-- 重新开始按钮（左侧底部） -->
          <div class="ds-sidebar-footer">
            <button class="btn btn-sm btn-danger btn-restart" id="btn-restart-chat">🔄 重新开始</button>
          </div>
        </div>

        <!-- 右侧：AI 对话面板（占满剩余空间） -->
        <div class="ds-ai-panel" id="ds-ai-panel"></div>
      </div>

      <!-- 底部操作栏 -->
      <div class="ds-footer">
        <button class="btn btn-primary" id="btn-complete-design">✅ 完成课程内容设计</button>
      </div>
    </div>
  `;

  // 初始化 AI 聊天面板
  initDesignStudioAI(name, context);

  // 绑定事件
  $('#btn-edit-context').onclick = () => showEditContextModal(name, context);
  $('#btn-restart-chat').onclick = () => confirmRestartChat(name, context);
  $('#btn-complete-design').onclick = () => completeCourseDesign(name);
}

/**
 * 完成课程设计 - 基于对话生成脚本并进入渲染
 */
async function completeCourseDesign(courseName) {
  // 显示确认弹窗
  showModal(`
    <div class="modal-title">✅ 确认完成课程内容设计</div>
    <div style="padding:16px 0;font-size:0.85rem;color:var(--text-secondary);line-height:1.6;">
      <p>确认后，系统将根据讨论内容自动生成课程脚本，并进入幻灯片渲染环节。</p>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">继续完善</button>
      <button class="btn btn-primary" id="btn-confirm-complete">确认，生成脚本</button>
    </div>
  `);

  $('#btn-confirm-complete').onclick = async () => {
    // 先更新按钮状态，显示加载
    const btn = $('#btn-confirm-complete');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> 正在生成...';

    try {
      // 调用 API 基于对话生成脚本
      const result = await api(`/courses/${courseName}/generate-script`, {
        method: 'POST',
      });

      // 更新弹窗显示成功状态
      $('#modal-content').innerHTML = `
        <div class="modal-title" style="text-align:center;">✅ 脚本生成完成</div>
        <div style="padding:24px;text-align:center;">
          <div style="font-size:2.5rem;margin-bottom:16px;">🎉</div>
          <p style="color:var(--text-secondary);font-size:0.85rem;">正在进入渲染页面...</p>
        </div>
      `;

      // 等待一下让用户看到成功提示，然后跳转
      await new Promise(resolve => setTimeout(resolve, 800));

      hideModal();
      toast('课程脚本已生成，正在渲染...', 'success');

      // 进入工作台并自动渲染
      router.go(`/course/${courseName}?force=workbench&action=render`);
    } catch (err) {
      // 显示错误状态
      $('#modal-content').innerHTML = `
        <div class="modal-title">❌ 生成失败</div>
        <div style="padding:16px 0;font-size:0.85rem;color:var(--danger);line-height:1.6;">
          <p>${escapeHtml(err.message)}</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-secondary" onclick="hideModal()">关闭</button>
          <button class="btn btn-primary" id="btn-retry-complete">重新尝试</button>
        </div>
      `;
      $('#btn-retry-complete').onclick = () => completeCourseDesign(courseName);
    }
  };
}

/**
 * 初始化设计工作室的 AI 聊天面板
 */
async function initDesignStudioAI(courseName, context) {
  const panel = $('#ds-ai-panel');
  if (!panel) return;

  // 从服务端加载对话历史
  let session = null;
  try {
    session = await api(`/courses/${courseName}/ai-session`);
  } catch (e) {
    session = { messages: [], phase: 'analysis' };
  }

  // 渲染 AI 面板
  panel.innerHTML = `
    <div class="ai-header">
      <span class="ai-title">🤖 AI 内容设计助手</span>
    </div>
    <div class="ai-status" id="ai-status">
      <span class="ai-status-dot"></span>
      <span>就绪 — AI 将引导你完成四阶段设计</span>
    </div>
    <div class="ai-messages" id="ai-messages"></div>
    <div class="ai-input-area">
      <textarea class="ai-input" id="ai-input" placeholder="输入你的想法或回答 AI 的问题…" rows="3"></textarea>
      <div class="ai-input-actions">
        <span class="ai-hint">按 Enter 发送，Shift+Enter 换行</span>
        <button class="btn btn-sm btn-primary" id="btn-ai-send">发送 ↑</button>
      </div>
    </div>
  `;

  // 渲染历史消息
  const messagesContainer = $('#ai-messages');
  if (session.messages && session.messages.length > 0) {
    session.messages.forEach(msg => {
      appendAIMessage(msg.role, msg.content, messagesContainer);
    });
    updatePhaseIndicator(session.phase);
    currentAIPhase = session.phase;
  } else {
    // 新对话：显示欢迎消息并自动开始引导
    const welcomeMsg = generateWelcomeMessage(context);
    appendAIMessage('assistant', welcomeMsg, messagesContainer);
    // 保存初始消息到 session
    await saveAISession(courseName, [{ role: 'assistant', content: welcomeMsg }], 'analysis');
  }

  // 更新顶部阶段徽章
  updatePhaseBadge(currentAIPhase);

  // 设置智能滚动监听
  setupSmartScroll(messagesContainer);

  // 绑定事件
  $('#btn-ai-send').onclick = () => sendAIMessage(courseName);
  $('#ai-input').addEventListener('keydown', (e) => {
    // 只有在单独按下 Enter（没有 Shift/Ctrl/Meta）时才发送
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      sendAIMessage(courseName);
    }
  });
}

/**
 * 更新顶部阶段徽章
 */
function updatePhaseBadge(phase) {
  const badge = $('#ds-phase-badge');
  if (!badge) return;

  const phaseLabels = {
    'analysis': '需求分析阶段',
    'design': '结构设计阶段',
    'content': '内容细化阶段',
    'mapping': '幻灯片映射阶段',
  };

  badge.textContent = phaseLabels[phase] || '设计阶段';
}

/**
 * 生成欢迎消息（基于课程基础信息）- 紧凑格式
 */
function generateWelcomeMessage(context) {
  const title = context.title || '您的课程';
  const audience = context.targetAudience || '学员';
  const goal = context.learningGoal || '掌握相关技能';

  return `你好！我是 CourseFlow AI 内容设计助手。

已了解你的课程信息：**${title}** | 对象：${audience} | 目标：${goal.slice(0, 40)}${goal.length > 40 ? '...' : ''}

我将按 **ADDIE 模型** 引导你完成四阶段设计：
• **需求分析** → 学员痛点、教学目标、课程定位
• **结构设计** → Module → Lesson 提纲
• **内容细化** → 每个模块的知识点、案例、练习
• **幻灯片映射** → 将内容拆分到每一页幻灯片

准备好开始了吗？回复"开始"或直接告诉我你想先讨论什么。

[PHASE:analysis]`;
}

/**
 * 追加 AI 消息到消息容器
 * @returns {HTMLElement} 创建的消息元素
 */
function appendAIMessage(role, content, container) {
  const div = document.createElement('div');
  div.className = `ai-msg ai-msg-${role === 'user' ? 'user' : 'bot'}`;

  if (role === 'assistant' && content === '') {
    // AI 消息初始为空时，显示"思考中..."
    div.innerHTML = `<div class="ai-msg-content thinking"><span class="thinking-dots">思考中</span></div>`;
  } else {
    // AI 消息：移除阶段标记后再渲染
    const displayContent = role === 'assistant' ? removePhaseMarker(content) : content;
    div.innerHTML = `<div class="ai-msg-content">${role === 'user' ? escapeHtml(content) : markdownToHtml(displayContent)}</div>`;
  }

  container.appendChild(div);

  // 只有在"磁力"开启时才自动滚动
  if (autoScrollEnabled) {
    container.scrollTop = container.scrollHeight;
  }

  return div;
}

/**
 * 移除阶段标记（不在用户界面显示）
 */
function removePhaseMarker(content) {
  return content.replace(/\[PHASE:(analysis|design|content|mapping)\]/gi, '').trim();
}

/**
 * 设置消息容器的智能滚动监听
 */
function setupSmartScroll(container) {
  if (!container) return;

  // 滚动事件：检测用户是否在底部
  container.addEventListener('scroll', () => {
    const { scrollTop, scrollHeight, clientHeight } = container;
    // 距离底部 50px 以内视为"在底部"，触发磁力
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
    autoScrollEnabled = isNearBottom;
  });
}

/**
 * 更新阶段指示器
 */
function updatePhaseIndicator(phase) {
  // 阶段顺序映射
  const phaseOrder = ['analysis', 'design', 'content', 'mapping'];
  const currentIndex = phaseOrder.indexOf(phase);

  $$('.phase-step').forEach(step => {
    const stepPhase = step.dataset.phase;
    const stepIndex = phaseOrder.indexOf(stepPhase);
    step.classList.remove('active', 'completed');

    if (stepPhase === phase) {
      step.classList.add('active');
    } else if (stepIndex < currentIndex) {
      // 当前阶段之前的阶段标记为已完成
      step.classList.add('completed');
    }
  });
}

/**
 * 发送 AI 消息
 */
async function sendAIMessage(courseName) {
  const input = $('#ai-input');
  const message = input.value.trim();
  if (!message) return;

  // 用户发送消息时，重置自动滚动为开启
  autoScrollEnabled = true;

  const messagesContainer = $('#ai-messages');
  appendAIMessage('user', message, messagesContainer);
  input.value = '';

  // 获取当前对话历史
  let session;
  try {
    session = await api(`/courses/${courseName}/ai-session`);
  } catch (e) {
    session = { messages: [], phase: 'analysis' };
  }

  // 添加用户消息
  session.messages.push({ role: 'user', content: message });

  // 调用 AI API
  const botMsgEl = appendAIMessage('assistant', '', messagesContainer);
  const contentEl = botMsgEl.querySelector('.ai-msg-content');

  try {
    await streamAIResponse(session.messages, contentEl, async (fullContent) => {
      session.messages.push({ role: 'assistant', content: fullContent });

      // 检测阶段变化（传入当前阶段）
      const newPhase = detectPhase(fullContent, currentAIPhase);
      currentAIPhase = newPhase;

      // 保存 AI Session
      await saveAISession(courseName, session.messages, newPhase);
      updatePhaseIndicator(newPhase);
      updatePhaseBadge(newPhase);
    });
  } catch (err) {
    contentEl.innerHTML = `<span style="color:#ef4444;">❌ ${escapeHtml(err.message)}</span>`;
  }
}

/**
 * 流式获取 AI 响应
 */
async function streamAIResponse(messages, contentEl, onComplete) {
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: getSystemPrompt() },
        ...messages,
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `API 错误: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = '';

  // 获取消息容器（用于智能滚动）
  const messagesContainer = contentEl?.closest('.ai-messages');

  // 移除"思考中..."，添加流式光标类
  if (contentEl) {
    contentEl.classList.remove('thinking');
    contentEl.classList.add('streaming');
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split('\n');

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          if (contentEl) {
            // 流式输出时也移除阶段标记
            const displayContent = removePhaseMarker(fullContent);
            contentEl.innerHTML = markdownToHtml(displayContent);
          }
          // 智能滚动：只有在磁力开启时才滚动
          if (autoScrollEnabled && messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }
      } catch (e) { }
    }
  }

  // 移除流式光标
  if (contentEl) {
    contentEl.classList.remove('streaming');
  }

  if (onComplete) onComplete(fullContent);
}

/**
 * 保存 AI Session
 */
async function saveAISession(courseName, messages, phase) {
  try {
    await api(`/courses/${courseName}/ai-session`, {
      method: 'PUT',
      body: { messages, phase },
    });
  } catch (e) {
    console.error('保存 AI Session 失败:', e);
  }
}

/**
 * 检测当前对话阶段
 */
/**
 * 检测阶段变化（基于AI输出的结构化标记）
 * AI 会在回复末尾输出 [PHASE:xxx] 标记，我们只检测这个标记
 * @param {string} content - AI的最新回复内容
 * @param {string} currentPhase - 当前阶段
 * @returns {string} - 新阶段（如果未找到标记则返回原阶段）
 */
function detectPhase(content, currentPhase = 'analysis') {
  // 检测 AI 输出的阶段标记：[PHASE:analysis/design/content/mapping]
  const phaseMatch = content.match(/\[PHASE:(analysis|design|content|mapping)\]/i);

  if (phaseMatch) {
    const detectedPhase = phaseMatch[1].toLowerCase();
    // 验证阶段顺序是否合理（只能向前或保持）
    const phases = ['analysis', 'design', 'content', 'mapping'];
    const currentIndex = phases.indexOf(currentPhase);
    const newIndex = phases.indexOf(detectedPhase);

    // 允许保持当前阶段或前进到下一阶段，不允许回退
    if (newIndex >= currentIndex) {
      return detectedPhase;
    }
  }

  // 如果没有找到标记，保持当前阶段
  return currentPhase;
}

/**
 * 重新开始 AI 对话
 */
/**
 * 确认重新开始对话（带弹窗）
 */
async function confirmRestartChat(courseName, context) {
  showModal(`
    <div class="modal-title">⚠️ 重新开始</div>
    <div style="padding: 16px 0; font-size: 0.85rem; color: var(--text-secondary); line-height: 1.6;">
      <p style="margin-bottom: 12px;">此操作将<strong style="color: var(--danger);">清空所有对话历史</strong>，包括：</p>
      <ul style="padding-left: 20px; margin-bottom: 16px;">
        <li>AI 与你的所有讨论内容</li>
        <li>当前的设计阶段进度</li>
      </ul>
      <p>确定要重新开始吗？</p>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">取消</button>
      <button class="btn btn-danger" id="btn-confirm-restart">确认重新开始</button>
    </div>
  `);

  $('#btn-confirm-restart').onclick = async () => {
    hideModal();
    try {
      await api(`/courses/${courseName}/ai-session`, { method: 'DELETE' });
      toast('对话已重置', 'success');
      currentAIPhase = 'analysis';
      initDesignStudioAI(courseName, context);
    } catch (err) {
      toast('重置失败: ' + err.message, 'error');
    }
  };
}

/**
 * 格式化时长
 */
function formatDuration(duration) {
  const map = {
    '30min': '30 分钟',
    '1h': '1 小时',
    '2h': '2 小时',
    'half-day': '半天（3-4小时）',
    '1day': '1 天',
  };
  return map[duration] || duration || '未设置';
}

/**
 * 编辑基础信息弹窗
 */
async function showEditContextModal(courseName, context) {
  showModal(`
    <div class="modal-title">✏️ 编辑课程基础信息</div>
    <div class="field-group">
      <div class="field-label">课程主题</div>
      <input class="field-input" id="edit-title" value="${escapeHtml(context.title || '')}">
    </div>
    <div class="field-group">
      <div class="field-label">培训对象</div>
      <input class="field-input" id="edit-audience" value="${escapeHtml(context.targetAudience || '')}">
    </div>
    <div class="field-group">
      <div class="field-label">培训目标</div>
      <textarea class="field-textarea" id="edit-goal" rows="2">${escapeHtml(context.learningGoal || '')}</textarea>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" onclick="hideModal()">取消</button>
      <button class="btn btn-primary" id="btn-save-context">保存</button>
    </div>
  `);

  $('#btn-save-context').onclick = async () => {
    const newContext = {
      ...context,
      title: $('#edit-title').value.trim(),
      targetAudience: $('#edit-audience').value.trim(),
      learningGoal: $('#edit-goal').value.trim(),
    };

    try {
      await api(`/courses/${courseName}/ai-context`, {
        method: 'PUT',
        body: newContext,
      });
      hideModal();
      toast('已保存', 'success');
      // 刷新视图
      const course = await api(`/courses/${courseName}`);
      renderDesignStudio(courseName, course);
    } catch (err) {
      toast(err.message, 'error');
    }
  };
}

/**
 * 获取系统提示词
 */
function getSystemPrompt() {
  return `你是一位世界级的资深教学设计师与课件架构专家，名叫 CourseFlow AI。你擅长运用 ADDIE、ARCS 等模型构建实战课程体系。

## 你的角色

你是用户的课程设计顾问，专注于帮助用户设计高质量的课程内容。你的职责是与用户讨论、优化课程结构和内容，而不是输出技术文件。

## 工作流程（四阶段）

### 第一阶段：需求分析
帮助用户理清：
1. 学员画像（痛点、现有水平、期望收获）
2. 教学目标（学完能解决什么具体问题）
3. 课程定位（一句话概括核心价值）

### 第二阶段：结构设计
运用金字塔原理，帮助用户规划：
- 课程模块划分及逻辑关系
- 每个模块的学习目标和预计时长
- 模块内的具体课程/章节

输出格式示例：
**Module 1: 模块名称** (预计时长：30分钟)
- 学习目标：...
- 包含内容：
  - Lesson 1.1: ...
  - Lesson 1.2: ...

### 第三阶段：内容细化
与用户讨论每节课的具体内容：
- 核心知识点（每个知识点配1-2句话解释）
- 案例和示例
- 练习和互动环节
- 讲师备注和教学建议

输出格式示例：
**Lesson 1.1: 课程标题**

核心知识点：
1. 知识点一：简要说明
2. 知识点二：简要说明

案例示例：
- ...

互动设计：
- ...

### 第四阶段：幻灯片映射
将细化后的内容映射到每一页幻灯片：
- 每页幻灯片聚焦一个核心观点
- 标题简洁有力
- 内容要点控制在4-6条
- 标注幻灯片类型（封面/内容/对比/总结等）

输出格式示例：
**幻灯片 1：封面页**
- 类型：封面
- 标题：课程名称
- 副标题：一句话定位

**幻灯片 2：模块封面**
- 类型：模块封面
- 模块：Module 1
- 标题：模块名称
- 说明：本模块学习目标

**幻灯片 3：内容页**
- 类型：内容
- 标题：核心概念
- 要点：
  1. 要点一
  2. 要点二
  3. 要点三

**幻灯片 4：对比页**
- 类型：对比
- 标题：方法对比
- 左侧：方法A的特点
- 右侧：方法B的特点

### 第四阶段完成提示
当用户确认第四阶段（幻灯片映射）完成后，你必须输出以下提示：

---
✅ **课程设计已完成全部四个阶段！**

以上就是我们共同设计的完整课程蓝图，涵盖了：
- 需求分析（学员画像、教学目标、课程定位）
- 结构设计（模块与课程的层次结构）
- 内容细化（每节课的知识点、案例、互动）
- 幻灯片映射（每一页的具体内容）

如果你对以上内容没有其他修改意见，可以点击右下角的 **"完成课程内容设计"** 按钮，系统将自动生成课程脚本并进入幻灯片渲染环节，预览你的课件效果。

如需调整任何内容，请随时告诉我。
---

## 输出规范

### 标题层级（必须使用 Markdown 标题语法）
使用 \`#\` 系列标记标题，形成清晰的视觉层级：

| 语法 | 用途 | 示例 |
|------|------|------|
| \`## 标题\` | 模块标题、主要章节 | \`## Module 1: 认识AI\` |
| \`### 标题\` | 子章节、小节标题 | \`### 学习目标\` \`### 核心概念\` |
| \`#### 标题\` | 更细的分类 | \`#### 案例1\` \`#### 练习\` |

**错误示例** ❌：
\`\`\`
**Module 1: 认识AI**  ← 不要用加粗代替标题
学习目标：...          ← 普通文本，无层级
\`\`\`

**正确示例** ✅：
\`\`\`
## Module 1: 认识AI
### 学习目标
- 目标1
- 目标2
\`\`\`

### 其他格式规范
1. 使用**加粗**标注关键词、强调内容（不要用来代替标题）
2. 使用列表 \`-\` 展示结构化信息
3. 适当使用分割线 \`---\` 区分不同部分
4. 内容要具体、可执行，避免空泛表述

## ⚠️ 阶段标记（必须遵守）

**每次回复的最后，必须单独一行输出当前阶段标记，格式如下：**

\`\`\`
[PHASE:analysis]   ← 第一阶段：需求分析
[PHASE:design]     ← 第二阶段：结构设计
[PHASE:content]    ← 第三阶段：内容细化
[PHASE:mapping]    ← 第四阶段：幻灯片映射
\`\`\`

**标记规则：**
- 对话开始时，标记 \`[PHASE:analysis]\`
- 只有当用户明确确认当前阶段内容（如"好的"、"确认"、"没问题"、"继续"等），才切换到下一阶段
- 如果用户还在讨论或修改当前阶段内容，保持当前阶段标记不变
- **不要**因为提到其他阶段就切换标记
- 标记必须放在回复的最末尾，单独一行

## 行为准则

- 用中文交流
- 简洁直接，聚焦问题本身
- 给出专业建议，不要只是附和
- 每个阶段结束询问用户是否满意，是否需要调整
- **不要提及**：script.md、CSS类名、技术实现细节
- 专注于课程内容和教学设计本身`;
}

// ═══════════════════════════════════════════
//  工作台视图
// ═══════════════════════════════════════════

async function renderWorkbench(name, preloadedCourse = null) {
  const app = $('#app');
  app.innerHTML = `
    <div class="workbench">
      <div class="wb-toolbar">
        <button class="back-btn" onclick="router.go('/')">← 返回</button>
        <div class="course-title" id="wb-title">加载中…</div>
        <select class="field-select" id="wb-preset-select" style="width:180px;"></select>
        <button class="btn btn-primary" id="btn-render">🚀 渲染</button>
        <button class="btn btn-secondary" id="btn-edit-mode">✏️ 编辑</button>
        <button class="btn btn-secondary" id="btn-present">📺 演示</button>
        <button class="btn btn-secondary" id="btn-ai" style="background:rgba(99,102,241,0.15);color:var(--accent-light);border-color:rgba(99,102,241,0.3);">🤖 AI 助手</button>
      </div>
      <div class="wb-main" id="wb-main">
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
        <div class="wb-ai-panel" id="wb-ai-panel" style="display:none;">
          <div class="ai-header">
            <span class="ai-title">🤖 AI 助手</span>
            <button class="btn btn-sm btn-ghost" id="btn-close-ai">✕</button>
          </div>
          <div class="ai-messages" id="wb-ai-messages"></div>
          <div class="ai-input-area">
            <textarea class="ai-input" id="wb-ai-input" placeholder="输入问题或指令…" rows="2"></textarea>
            <div class="ai-input-actions">
              <button class="btn btn-sm btn-ghost" id="btn-wb-ai-extract">📥 提取</button>
              <button class="btn btn-sm btn-primary" id="btn-wb-ai-send">发送</button>
            </div>
          </div>
        </div>
      </div>
      <div class="wb-thumbnails" id="wb-thumbnails"></div>
    </div>
  `;

  // 加载数据
  try {
    // 使用预加载的数据或重新获取
    currentCourse = preloadedCourse || await api(`/courses/${name}`);
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

    // 加载预览（仅当已渲染时）
    if (currentCourse.hasHtml) {
      loadPreview(name);
    } else {
      showPreviewPlaceholder();
    }

    // 绑定事件
    setupWorkbenchEvents(name);

    // 检查 URL 参数，是否需要自动渲染
    const params = new URLSearchParams(window.location.search);
    if (params.get('action') === 'render') {
      // 清除 URL 参数
      window.history.replaceState(null, '', `/course/${name}`);
      // 自动触发渲染
      setTimeout(() => {
        const renderBtn = $('#btn-render');
        if (renderBtn) {
          toast('正在自动渲染课程...', 'info');
          renderBtn.click();
        }
      }, 500);
    }

  } catch (err) {
    toast(err.message, 'error');
    router.go('/');
  }
}

/**
 * 显示预览占位符（未渲染时）
 */
function showPreviewPlaceholder() {
  const frame = $('#preview-frame');
  if (!frame) return;

  const placeholderHtml = `
    <html>
    <head>
      <style>
        body {
          margin: 0;
          height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          background: #0a0a0f;
          color: #60606f;
          font-family: 'Inter', sans-serif;
        }
        .icon { font-size: 3rem; margin-bottom: 16px; }
        .text { font-size: 0.9rem; margin-bottom: 24px; }
        .hint { font-size: 0.75rem; color: #40404f; }
      </style>
    </head>
    <body>
      <div class="icon">🖼️</div>
      <div class="text">点击「渲染」按钮生成预览</div>
      <div class="hint">渲染后可在此处预览幻灯片效果</div>
    </body>
    </html>
  `;

  frame.srcdoc = placeholderHtml;
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
    // 检查 iframe 是否有有效内容（已渲染的课程页面）
    if (!frame || frame.src === 'about:blank' || !frame.src.includes('/courses/')) {
      toast('请先点击「渲染」按钮生成课件', 'warning');
      return;
    }
    try {
      frame.contentWindow.postMessage({ type: 'toggle-edit-mode' }, '*');
    } catch (e) {
      toast('编辑模式启动失败，请刷新后重试', 'error');
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

// ───── AI 面板切换（工作台内嵌） ─────

let wbAiPanelOpen = false;
let wbAiMessages = [];

function toggleAIPanel(courseName) {
  const wbMain = $('#wb-main');
  const aiPanel = $('#wb-ai-panel');
  const aiBtn = $('#btn-ai');

  if (!aiPanel) return;

  wbAiPanelOpen = !wbAiPanelOpen;

  if (wbAiPanelOpen) {
    aiPanel.style.display = 'flex';
    wbMain.classList.add('ai-open');
    aiBtn.style.background = 'var(--accent)';
    aiBtn.style.color = '#fff';
    initWorkbenchAI(courseName);
  } else {
    aiPanel.style.display = 'none';
    wbMain.classList.remove('ai-open');
    aiBtn.style.background = '';
    aiBtn.style.color = '';
  }

  // 关闭按钮
  const closeBtn = $('#btn-close-ai');
  if (closeBtn) {
    closeBtn.onclick = () => {
      wbAiPanelOpen = true; // 让下面的 toggle 关闭它
      toggleAIPanel(courseName);
    };
  }
}

async function initWorkbenchAI(courseName) {
  const messagesContainer = $('#wb-ai-messages');
  if (!messagesContainer) return;

  // 加载历史对话
  try {
    const session = await api(`/courses/${courseName}/ai-session`);
    wbAiMessages = session.messages || [];
  } catch (e) {
    wbAiMessages = [];
  }

  // 渲染历史消息
  messagesContainer.innerHTML = '';
  wbAiMessages.forEach(msg => {
    appendWbAiMessage(msg.role, msg.content, messagesContainer);
  });

  // 如果没有历史，显示欢迎消息
  if (wbAiMessages.length === 0) {
    const welcomeMsg = '你好！我是 AI 助手。我可以帮你优化课程内容、生成幻灯片或回答问题。有什么需要帮助的吗？';
    appendWbAiMessage('assistant', welcomeMsg, messagesContainer);
    wbAiMessages.push({ role: 'assistant', content: welcomeMsg });
  }

  // 绑定发送按钮
  const sendBtn = $('#btn-wb-ai-send');
  const input = $('#wb-ai-input');
  const extractBtn = $('#btn-wb-ai-extract');

  if (sendBtn) {
    sendBtn.onclick = () => sendWbAiMessage(courseName);
  }
  if (input) {
    input.onkeydown = (e) => {
      // 只有在单独按下 Enter（没有 Shift/Ctrl/Meta）时才发送
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        sendWbAiMessage(courseName);
      }
    };
  }
  if (extractBtn) {
    extractBtn.onclick = () => extractWbAiScript(courseName);
  }
}

function appendWbAiMessage(role, content, container) {
  const div = document.createElement('div');
  div.className = `ai-msg ai-msg-${role === 'user' ? 'user' : 'bot'}`;
  div.innerHTML = `<div class="ai-msg-content">${role === 'user' ? escapeHtml(content) : markdownToHtml(content)}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

async function sendWbAiMessage(courseName) {
  const input = $('#wb-ai-input');
  const message = input.value.trim();
  if (!message) return;

  const messagesContainer = $('#wb-ai-messages');
  appendWbAiMessage('user', message, messagesContainer);
  input.value = '';

  wbAiMessages.push({ role: 'user', content: message });

  // 调用 AI
  const botMsgEl = appendWbAiMessage('assistant', '', messagesContainer);
  const contentEl = botMsgEl.querySelector('.ai-msg-content');

  try {
    await streamAIResponse(wbAiMessages, contentEl, async (fullContent) => {
      wbAiMessages.push({ role: 'assistant', content: fullContent });
      // 保存到服务端
      try {
        await api(`/courses/${courseName}/ai-session`, {
          method: 'PUT',
          body: { messages: wbAiMessages, phase: 'development' },
        });
      } catch (e) { }
    });
  } catch (err) {
    contentEl.innerHTML = `<span style="color:#ef4444;">❌ ${escapeHtml(err.message)}</span>`;
  }
}

async function extractWbAiScript(courseName) {
  const lastBotMsg = wbAiMessages.filter(m => m.role === 'assistant').pop();
  if (!lastBotMsg) {
    toast('没有可提取的内容', 'warning');
    return;
  }

  const mdMatch = lastBotMsg.content.match(/```(?:markdown)?\s*\n(---[\s\S]*?)```/);
  if (!mdMatch) {
    toast('未找到 script.md 代码块', 'warning');
    return;
  }

  const scriptContent = mdMatch[1].trim();

  try {
    await api(`/courses/${courseName}/script`, {
      method: 'PUT',
      body: { content: scriptContent },
    });
    toast('✅ script.md 已更新，点击渲染查看效果', 'success');

    // 刷新工作台
    window.refreshWorkbench && window.refreshWorkbench();
  } catch (err) {
    toast('保存失败: ' + err.message, 'error');
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

  // 清除 srcdoc 属性（如果存在），否则 src 可能不生效
  frame.removeAttribute('srcdoc');
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

/**
 * Markdown → HTML 转换（增强版）
 */
function markdownToHtml(md) {
  if (!md) return '';

  // 0. 预处理：压缩连续空行（超过2个换行压缩为2个）
  // 这样AI输出的格式化文本不会产生过多空行
  let html = md.replace(/\n{3,}/g, '\n\n');

  // 1. 保护代码块内容
  const codeBlocks = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    codeBlocks.push({
      placeholder: `__CODE_BLOCK_${codeBlocks.length}__`,
      html: `<pre class="md-code-block"><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`
    });
    return codeBlocks[codeBlocks.length - 1].placeholder;
  });

  // 2. 处理 markdown 语法（不转义整个内容）
  // 分割线
  html = html.replace(/^---$/gm, '<hr class="md-hr">');

  // 标题
  html = html.replace(/^#### (.+)$/gm, '<h5 class="md-h5">$1</h5>');
  html = html.replace(/^### (.+)$/gm, '<h4 class="md-h4">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="md-h3">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>');

  // 加粗 **text**
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // 斜体 *text*（排除已处理的加粗）
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

  // 行内代码 `code`
  html = html.replace(/`([^`]+)`/g, '<code class="md-inline-code">$1</code>');

  // 引用块 > text
  html = html.replace(/^> (.+)$/gm, '<blockquote class="md-quote">$1</blockquote>');

  // 3. 处理列表（需要更仔细的逻辑）
  // 分行处理
  const lines = html.split('\n');
  const result = [];
  let inUl = false;
  let inOl = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      // 空行：关闭当前列表
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (inOl) { result.push('</ol>'); inOl = false; }
      continue; // 跳过空行
    }

    const ulMatch = line.match(/^- (.+)$/);
    const olMatch = line.match(/^\d+\. (.+)$/);

    if (ulMatch) {
      if (!inUl) {
        if (inOl) { result.push('</ol>'); inOl = false; }
        result.push('<ul class="md-list">');
        inUl = true;
      }
      result.push(`<li>${ulMatch[1]}</li>`);
    } else if (olMatch) {
      if (!inOl) {
        if (inUl) { result.push('</ul>'); inUl = false; }
        result.push('<ol class="md-list-ol">');
        inOl = true;
      }
      result.push(`<li>${olMatch[1]}</li>`);
    } else {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (inOl) { result.push('</ol>'); inOl = false; }
      result.push(line);
    }
  }

  // 关闭未闭合的列表
  if (inUl) result.push('</ul>');
  if (inOl) result.push('</ol>');

  html = result.join('\n');

  // 4. 段落处理：双换行分隔段落，单换行忽略
  // 先按双换行分割成段落
  const paragraphs = html.split(/\n\n+/);
  html = paragraphs.map(p => {
    p = p.trim();
    if (!p) return '';
    // 如果已经是HTML块级元素，不再包装
    if (p.startsWith('<h') || p.startsWith('<ul') || p.startsWith('<ol') ||
        p.startsWith('<pre') || p.startsWith('<blockquote') || p.startsWith('<hr')) {
      return p;
    }
    // 将段落内的单换行转为空格（同行内容）
    p = p.replace(/\n/g, ' ');
    return `<p class="md-p">${p}</p>`;
  }).filter(p => p).join('\n');

  // 6. 恢复代码块
  codeBlocks.forEach(block => {
    html = html.replace(block.placeholder, block.html);
  });

  return html;
}

// ───── 全局暴露（onclick 使用） ─────
window.router = router;
window.showNewCourseModal = showNewCourseModal;
window.toggleSlide = toggleSlide;
window.jumpToSlide = jumpToSlide;
window.addSlide = addSlide;
window.hideModal = hideModal;
window.showModal = showModal;
window.toggleAIPanel = toggleAIPanel;
window.confirmDeleteCourse = confirmDeleteCourse;
window.$$ = $$;

// ───── 启动 ─────
document.addEventListener('DOMContentLoaded', () => router.render());
