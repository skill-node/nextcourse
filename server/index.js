/**
 * CourseFlow Web Server
 *
 * Express API 服务器，包裹 CLI 核心模块，提供 RESTful API + 静态前端。
 * 启动：npm start → http://localhost:3000
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ───── 加载 .env ─────
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  });
}

// 复用 CLI 核心模块
const { parseScript } = require('../bin/lib/parser');
const { render } = require('../bin/lib/renderer');

const app = express();
const PORT = process.env.PORT || 3000;

// ───── 路径常量 ─────
const ROOT_DIR = path.resolve(__dirname, '..');
const COURSES_DIR = path.join(ROOT_DIR, 'courses');
const COLOR_SCHEMES_DIR = path.join(ROOT_DIR, 'shared_styles/color-schemes');

// ───── 中间件 ─────
app.use(express.json());
app.use(express.text({ type: 'text/plain' }));

// 静态文件
app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/courses', express.static(COURSES_DIR));
app.use('/shared_styles', express.static(path.join(ROOT_DIR, 'shared_styles')));
app.use('/lib', express.static(path.join(ROOT_DIR, 'lib')));

// ──────────────────────────────────────────────
//  辅助函数
// ──────────────────────────────────────────────

/**
 * 计算课程阶段状态
 * @param {number} slideCount - 幻灯片数量
 * @param {boolean} hasHtml - 是否已渲染
 * @returns {string} - 'draft' | 'structured' | 'rendered'
 */
function computePhase(slideCount, hasHtml) {
  if (hasHtml) return 'rendered';
  if (slideCount > 1) return 'structured';
  return 'draft';
}

/**
 * 获取课程的 AI session 文件路径
 */
function getAiSessionPath(courseName) {
  return path.join(COURSES_DIR, courseName, '.ai_session.json');
}

/**
 * 获取课程的 AI context 文件路径
 */
function getAiContextPath(courseName) {
  return path.join(COURSES_DIR, courseName, '.ai_context.json');
}

/**
 * 读取 AI session（如果存在）
 */
function readAiSession(courseName) {
  const sessionPath = getAiSessionPath(courseName);
  if (fs.existsSync(sessionPath)) {
    try {
      return JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

/**
 * 读取 AI context（如果存在）
 */
function readAiContext(courseName) {
  const contextPath = getAiContextPath(courseName);
  if (fs.existsSync(contextPath)) {
    try {
      return JSON.parse(fs.readFileSync(contextPath, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

// ──────────────────────────────────────────────
//  API 路由
// ──────────────────────────────────────────────

/**
 * GET /api/courses — 列出所有课程
 */
app.get('/api/courses', (req, res) => {
  try {
    if (!fs.existsSync(COURSES_DIR)) {
      return res.json([]);
    }

    const dirs = fs.readdirSync(COURSES_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory());

    const courses = dirs.map(d => {
      const scriptPath = path.join(COURSES_DIR, d.name, 'script.md');
      const indexPath = path.join(COURSES_DIR, d.name, 'index.html');
      let frontmatter = { title: d.name, template: 'standard', colorScheme: 'standard-default' };
      let slideCount = 0;
      let hasHtml = fs.existsSync(indexPath);
      let lastModified = null;

      if (fs.existsSync(scriptPath)) {
        try {
          const parsed = parseScript(scriptPath);
          frontmatter = parsed.frontmatter;
          slideCount = parsed.slides.length;
          lastModified = fs.statSync(scriptPath).mtime.toISOString();
        } catch (e) {
          // 解析失败，使用默认值
        }
      }

      // 计算 phase 和 hasAiSession
      const phase = computePhase(slideCount, hasHtml);
      const hasAiSession = fs.existsSync(getAiSessionPath(d.name));

      return {
        name: d.name,
        title: frontmatter.title,
        template: frontmatter.template,
        colorScheme: frontmatter.colorScheme,
        stylePreset: frontmatter.stylePreset,
        slideCount,
        hasHtml,
        lastModified,
        phase,
        hasAiSession,
      };
    });

    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/courses/:name — 获取课程详情
 */
app.get('/api/courses/:name', (req, res) => {
  try {
    const coursePath = path.join(COURSES_DIR, req.params.name);
    const scriptPath = path.join(coursePath, 'script.md');

    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ error: '课程不存在' });
    }

    const raw = fs.readFileSync(scriptPath, 'utf-8');
    const parsed = parseScript(scriptPath);
    const indexPath = path.join(coursePath, 'index.html');
    const hasHtml = fs.existsSync(indexPath);
    const phase = computePhase(parsed.slides.length, hasHtml);
    const aiSession = readAiSession(req.params.name);
    const aiContext = readAiContext(req.params.name);

    res.json({
      name: req.params.name,
      raw,
      frontmatter: parsed.frontmatter,
      slides: parsed.slides,
      phase,
      hasHtml,
      hasAiSession: aiSession !== null,
      aiSession,
      aiContext,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/courses/:name — 删除课程
 */
app.delete('/api/courses/:name', (req, res) => {
  try {
    const coursePath = path.join(COURSES_DIR, req.params.name);

    if (!fs.existsSync(coursePath)) {
      return res.status(404).json({ error: '课程不存在' });
    }

    // 递归删除课程目录
    fs.rmSync(coursePath, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/courses — 新建课程
 */
app.post('/api/courses', (req, res) => {
  try {
    let { name, title, targetAudience, learningGoal, duration, template, colorScheme, stylePreset } = req.body;

    // 标题是必填的，目录名可自动生成
    if (!title || !title.trim()) {
      return res.status(400).json({ error: '请输入课程标题' });
    }
    title = title.trim();

    // 如果用户没有提供 name，或 name 不合法，则自动生成
    if (!name || !name.match(/^[a-z0-9_-]+$/)) {
      // 从标题提取英文/数字部分，不足则用时间戳
      name = title
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '_')  // 非字母数字中文 → 下划线
        .replace(/[\u4e00-\u9fff]+/g, '')            // 去除中文
        .replace(/^_+|_+$/g, '')                     // 去首尾下划线
        .replace(/_+/g, '_');                        // 合并多余下划线
      if (!name || name.length < 2) {
        name = 'course_' + Date.now();
      }
    }

    // 如果目录名已存在，自动添加数字后缀避免冲突
    const baseName = name;
    let suffix = 2;
    let coursePath = path.join(COURSES_DIR, name);
    while (fs.existsSync(coursePath)) {
      name = `${baseName}_${suffix}`;
      coursePath = path.join(COURSES_DIR, name);
      suffix++;
    }

    // 创建目录
    fs.mkdirSync(coursePath, { recursive: true });
    fs.mkdirSync(path.join(coursePath, 'assets'), { recursive: true });

    // 生成初始 script.md（最小骨架，等待 AI 填充）
    const scriptContent = `---
title: ${title}
template: ${template || 'standard'}
color-scheme: ${colorScheme || 'standard-default'}${stylePreset ? `\nstyle-preset: ${stylePreset}` : ''}
---

[Slide 1]
# ${title}
## 副标题
- 视觉组件: .cover-slide
- 演讲备注: 欢迎词
`;

    fs.writeFileSync(path.join(coursePath, 'script.md'), scriptContent, 'utf-8');

    // 保存 AI context（基础信息）
    const contextData = {
      title,
      targetAudience: targetAudience || '',
      learningGoal: learningGoal || '',
      duration: duration || '',
      template: template || 'standard',
      preset: stylePreset || colorScheme || 'standard-default',
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(coursePath, '.ai_context.json'), JSON.stringify(contextData, null, 2), 'utf-8');

    res.status(201).json({ name, title, path: coursePath, phase: 'draft' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/courses/:name/script — 更新 script.md
 */
app.put('/api/courses/:name/script', (req, res) => {
  try {
    const scriptPath = path.join(COURSES_DIR, req.params.name, 'script.md');

    if (!fs.existsSync(path.dirname(scriptPath))) {
      return res.status(404).json({ error: '课程不存在' });
    }

    const content = typeof req.body === 'string' ? req.body : req.body.content;
    fs.writeFileSync(scriptPath, content, 'utf-8');

    // 重新解析
    const parsed = parseScript(scriptPath);

    res.json({
      success: true,
      frontmatter: parsed.frontmatter,
      slides: parsed.slides,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/render/:name — 渲染课程
 */
app.post('/api/render/:name', (req, res) => {
  try {
    const coursePath = path.join(COURSES_DIR, req.params.name);
    const preset = req.body?.preset || null;

    const result = render(coursePath, { preset });

    res.json({
      success: true,
      slideCount: result.slideCount,
      preset: result.preset,
      warnings: result.warnings,
      previewUrl: `/courses/${req.params.name}/index.html`,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/presets — 列出所有配色方案
 */
app.get('/api/presets', (req, res) => {
  try {
    const files = fs.readdirSync(COLOR_SCHEMES_DIR)
      .filter(f => f.endsWith('.css'))
      .sort();

    const meta = {
      'standard-default': { desc: '蓝/深灰/绿/橙，企业培训通用', type: 'basic' },
      'default':          { desc: '浅色靛蓝', type: 'basic' },
      'dark-ocean':       { desc: '深蓝黑，投影仪暗场', type: 'basic' },
      'warm-sand':        { desc: '暖米色，护眼', type: 'basic' },
      'high-contrast':    { desc: '纯白高对比', type: 'basic' },
      'bold-signal':      { desc: '深色高对比 + 橙色 | Archivo Black', type: 'premium' },
      'electric-studio':  { desc: '黑白 + 蓝色强调 | Manrope', type: 'premium' },
      'creative-voltage': { desc: '电蓝 + 荧光黄 | Syne + Space Mono', type: 'premium' },
      'notebook-tabs':    { desc: '纸质 + 柔和色调 | Bodoni Moda', type: 'premium' },
      'swiss-modern':     { desc: '极简黑白 + 红色 | Archivo + Nunito', type: 'premium' },
      'dark-botanical':   { desc: '深色 + 暖色调 | Cormorant', type: 'premium' },
    };

    const presets = files.map(f => {
      const name = f.replace('.css', '');
      const info = meta[name] || { desc: '', type: 'basic' };
      return { name, ...info };
    });

    res.json(presets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/courses/:name — 删除课程
 */
app.delete('/api/courses/:name', (req, res) => {
  try {
    const coursePath = path.join(COURSES_DIR, req.params.name);
    if (!fs.existsSync(coursePath)) {
      return res.status(404).json({ error: '课程不存在' });
    }

    fs.rmSync(coursePath, { recursive: true, force: true });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
//  AI Session API
// ──────────────────────────────────────────────

/**
 * GET /api/courses/:name/ai-session — 获取 AI 对话历史
 */
app.get('/api/courses/:name/ai-session', (req, res) => {
  try {
    const session = readAiSession(req.params.name);
    if (!session) {
      return res.json({ messages: [], phase: 'analysis', createdAt: null, updatedAt: null });
    }
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/courses/:name/phase — 更新课程阶段
 */
app.put('/api/courses/:name/phase', (req, res) => {
  try {
    const coursePath = path.join(COURSES_DIR, req.params.name);
    if (!fs.existsSync(coursePath)) {
      return res.status(404).json({ error: '课程不存在' });
    }

    const { phase } = req.body;
    const validPhases = ['draft', 'structured', 'rendered'];
    if (!phase || !validPhases.includes(phase)) {
      return res.status(400).json({ error: '无效的阶段值' });
    }

    // 更新 AI Session 中的阶段
    const sessionPath = getAiSessionPath(req.params.name);
    const now = new Date().toISOString();
    const existingSession = readAiSession(req.params.name);

    const sessionData = {
      courseName: req.params.name,
      messages: existingSession?.messages || [],
      phase,
      createdAt: existingSession?.createdAt || now,
      updatedAt: now,
    };

    fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2));
    res.json({ success: true, phase });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/courses/:name/ai-session — 更新 AI 对话历史
 */
app.put('/api/courses/:name/ai-session', (req, res) => {
  try {
    const coursePath = path.join(COURSES_DIR, req.params.name);
    if (!fs.existsSync(coursePath)) {
      return res.status(404).json({ error: '课程不存在' });
    }

    const { messages, phase } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages 必须是数组' });
    }

    const sessionPath = getAiSessionPath(req.params.name);
    const now = new Date().toISOString();
    const existingSession = readAiSession(req.params.name);

    const sessionData = {
      courseName: req.params.name,
      messages,
      phase: phase || existingSession?.phase || 'analysis',
      createdAt: existingSession?.createdAt || now,
      updatedAt: now,
    };

    fs.writeFileSync(sessionPath, JSON.stringify(sessionData, null, 2), 'utf-8');
    res.json({ success: true, session: sessionData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/courses/:name/ai-session — 清除 AI 对话历史
 */
app.delete('/api/courses/:name/ai-session', (req, res) => {
  try {
    const sessionPath = getAiSessionPath(req.params.name);
    if (fs.existsSync(sessionPath)) {
      fs.unlinkSync(sessionPath);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/courses/:name/generate-script — 基于 AI 对话生成 script.md
 */
app.post('/api/courses/:name/generate-script', async (req, res) => {
  try {
    const coursePath = path.join(COURSES_DIR, req.params.name);
    if (!fs.existsSync(coursePath)) {
      return res.status(404).json({ error: '课程不存在' });
    }

    // 读取 AI 对话历史和课程信息
    const session = readAiSession(req.params.name);
    const context = readAiContext(req.params.name);

    if (!session || !session.messages || session.messages.length === 0) {
      return res.status(400).json({ error: '没有对话历史，请先与 AI 讨论课程内容' });
    }

    // 构建生成脚本的提示
    const scriptPrompt = `你是课件脚本生成器。基于以下课程讨论内容，生成完整的 script.md。

## 课程信息
- 标题：${context?.title || '未命名课程'}
- 对象：${context?.targetAudience || '未指定'}
- 目标：${context?.learningGoal || '未指定'}

## 对话历史
${session.messages.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n\n')}

## 输出格式规范（必须严格遵守）

### 基础结构
\`\`\`markdown
---
title: 课程标题
template: standard
color-scheme: bold-signal
---

[Slide 1]
# 封面标题
## 封面副标题
- 组件: .cover-slide
- 演讲备注: 开场白内容

[Slide 2]
# 模块一标题
- 组件: .module-cover .module-1
- 说明: 本模块学习目标...

[Slide 3]
# 内容页标题
## 小标题（可选）
- 要点一
- 要点二
- 要点三
- 演讲备注: 讲解要点
\`\`\`

### 重要规则
1. **组件必须用 \`- 组件: .xxx\` 格式声明**，不能混入内容中
2. **布局结构（左侧/右侧）必须用 \`组件内容:\` 字段**，不能当作普通列表项
3. **只有实际要显示的内容才作为普通列表项**
4. 每页必须有 \`[Slide N]\` 标记

### 各种组件的正确格式

#### grid-2 两栏布局
\`\`\`markdown
[Slide N]
# 标题
- 组件: .grid-2
- 组件内容: {"left":[{"class":"card-primary","title":"左侧标题","content":"左侧实际内容"}],"right":[{"class":"card-secondary","title":"右侧标题","content":"右侧实际内容"}]}
- 演讲备注: 讲解要点
\`\`\`

#### grid-3 三栏布局
\`\`\`markdown
[Slide N]
# 标题
- 组件: .grid-3
- 组件内容: [{"class":"card","title":"第一栏","content":"内容一"},{"class":"card","title":"第二栏","content":"内容二"},{"class":"card","title":"第三栏","content":"内容三"}]
\`\`\`

#### vs-good / vs-bad 对比页
\`\`\`markdown
[Slide N]
# 正确做法 vs 错误做法
- 组件: .grid-2
- 组件内容: {"left":[{"class":"vs-good","title":"正确做法","content":"具体做法一；具体做法二；具体做法三"}],"right":[{"class":"vs-bad","title":"错误做法","content":"错误做法一；错误做法二；错误做法三"}]}
\`\`\`

#### 普通内容页（无特殊组件）
\`\`\`markdown
[Slide N]
# 标题
## 副标题（可选）
- 第一个要点
- 第二个要点
- 第三个要点
- 第四个要点
- 演讲备注: 讲解内容
\`\`\`

#### card-primary 强调卡片
\`\`\`markdown
[Slide N]
# 标题
- 组件: .card-primary
- 核心观点在这里
- 要点一
- 要点二
\`\`\`

#### ending-slide 结尾页
\`\`\`markdown
[Slide N]
# 感谢聆听
- 组件: .ending-slide
- 联系方式或总结语
- 演讲备注: 结束语
\`\`\`

## 错误示例（避免）

❌ 错误：把组件写进内容
\`\`\`markdown
- **应用**：熟练使用AI工具
- 组件: .card-primary   ← 这是错的！组件不能作为内容项
\`\`\`

❌ 错误：把结构说明当作内容
\`\`\`markdown
- 组件: .grid-2
- **左侧**：它能做...   ← 这是错的！"左侧"是结构标记，不是内容
- **右侧**：它不能做...
\`\`\`

✅ 正确：用组件内容字段表达结构
\`\`\`markdown
- 组件: .grid-2
- 组件内容: {"left":[{"class":"card-primary","title":"AI 能做什么","content":"分析数据；识别模式；生成建议"}],"right":[{"class":"card-secondary","title":"AI 不能做什么","content":"情感判断；伦理决策；承担责任"}]}
\`\`\`

## 注意事项
1. 只输出 markdown 代码块，不要其他说明文字
2. 内容要点控制在 4-6 条，避免单页过长
3. 组件选择要匹配内容特征
4. 组件内容中的 content 用分号分隔多个要点`;

    // 调用 AI API
    const apiKey = process.env.LLM_API_KEY;
    const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1';
    const model = process.env.LLM_MODEL || 'deepseek-chat';

    if (!apiKey || apiKey === 'sk-your-api-key-here') {
      return res.status(400).json({ error: '请配置 LLM_API_KEY' });
    }

    const url = new URL(`${baseUrl}/chat/completions`);
    const transport = url.protocol === 'https:' ? https : http;

    const payload = JSON.stringify({
      model,
      messages: [{ role: 'user', content: scriptPrompt }],
      temperature: 0.3,
      max_tokens: 8192,
    });

    const apiReq = transport.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (apiRes) => {
      let body = '';
      apiRes.on('data', chunk => body += chunk);
      apiRes.on('end', async () => {
        try {
          if (apiRes.statusCode !== 200) {
            const err = JSON.parse(body);
            return res.status(apiRes.statusCode).json({ error: err.error?.message || body });
          }

          const data = JSON.parse(body);
          let scriptContent = data.choices?.[0]?.message?.content || '';

          // 提取 markdown 代码块中的内容
          const codeMatch = scriptContent.match(/```(?:markdown|md)?\s*\n([\s\S]*?)```/);
          if (codeMatch) {
            scriptContent = codeMatch[1].trim();
          }

          // 保存脚本
          const scriptPath = path.join(coursePath, 'script.md');
          fs.writeFileSync(scriptPath, scriptContent, 'utf-8');

          // 更新阶段
          const sessionPath = getAiSessionPath(req.params.name);
          const now = new Date().toISOString();
          const updatedSession = {
            ...session,
            phase: 'structured',
            updatedAt: now,
          };
          fs.writeFileSync(sessionPath, JSON.stringify(updatedSession, null, 2), 'utf-8');

          res.json({ success: true, scriptLength: scriptContent.length });
        } catch (err) {
          res.status(500).json({ error: `解析失败: ${err.message}` });
        }
      });
    });

    apiReq.on('error', (err) => {
      res.status(500).json({ error: `API 连接失败: ${err.message}` });
    });

    apiReq.write(payload);
    apiReq.end();

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/courses/:name/ai-context — 保存课程基础信息（新建课程时收集）
 */
app.put('/api/courses/:name/ai-context', (req, res) => {
  try {
    const coursePath = path.join(COURSES_DIR, req.params.name);
    if (!fs.existsSync(coursePath)) {
      return res.status(404).json({ error: '课程不存在' });
    }

    const contextPath = getAiContextPath(req.params.name);
    const contextData = {
      ...req.body,
      updatedAt: new Date().toISOString(),
    };

    fs.writeFileSync(contextPath, JSON.stringify(contextData, null, 2), 'utf-8');
    res.json({ success: true, context: contextData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai/chat — AI 聊天代理（流式）
 * 将请求转发到 DeepSeek/OpenAI 兼容 API
 */
app.post('/api/ai/chat', (req, res) => {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1';
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  if (!apiKey || apiKey === 'sk-your-api-key-here') {
    return res.status(400).json({ error: '请配置系统环境变量或 .env 中的 LLM_API_KEY' });
  }

  const { messages } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: '缺少 messages 参数' });
  }

  const payload = JSON.stringify({
    model,
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 4096,
  });

  const url = new URL(`${baseUrl}/chat/completions`);
  const transport = url.protocol === 'https:' ? https : http;

  const apiReq = transport.request({
    hostname: url.hostname,
    port: url.port,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Content-Length': Buffer.byteLength(payload),
    },
  }, (apiRes) => {
    if (apiRes.statusCode !== 200) {
      let body = '';
      apiRes.on('data', chunk => body += chunk);
      apiRes.on('end', () => {
        try {
          const err = JSON.parse(body);
          res.status(apiRes.statusCode).json({ error: err.error?.message || body });
        } catch {
          res.status(apiRes.statusCode).json({ error: body });
        }
      });
      return;
    }

    // 流式转发
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    apiRes.on('data', chunk => res.write(chunk));
    apiRes.on('end', () => res.end());
    apiRes.on('error', () => res.end());
  });

  apiReq.on('error', (err) => {
    res.status(500).json({ error: `API 连接失败: ${err.message}` });
  });

  apiReq.write(payload);
  apiReq.end();
});

/**
 * GET /api/ai/status — 检查 AI 配置状态
 */
app.get('/api/ai/status', (req, res) => {
  const apiKey = process.env.LLM_API_KEY;
  const configured = apiKey && apiKey !== 'sk-your-api-key-here';
  res.json({
    configured,
    model: process.env.LLM_MODEL || 'deepseek-chat',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1',
  });
});

// ───── SPA 兜底路由 ─────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ───── 启动 ─────
const server = app.listen(PORT, () => {
  const aiKey = process.env.LLM_API_KEY;
  const aiReady = aiKey && aiKey !== 'sk-your-api-key-here';
  console.log(`\n  ⚡ CourseFlow Web UI`);
  console.log(`  ──────────────────`);
  console.log(`  🌐 http://localhost:${PORT}`);
  console.log(`  📁 课程目录: ${COURSES_DIR}`);
  console.log(`  🎨 预设数量: ${fs.readdirSync(COLOR_SCHEMES_DIR).filter(f => f.endsWith('.css')).length}`);
  console.log(`  🤖 AI 助手: ${aiReady ? '✅ 已配置 (' + (process.env.LLM_MODEL || 'deepseek-chat') + ')' : '❌ 未配置 (请编辑 .env)'}\n`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  ❌ 端口 ${PORT} 已被占用！`);
    console.error(`  请先关闭占用端口的进程，或使用其他端口：`);
    console.error(`  PORT=3001 npm start\n`);
  } else {
    console.error('服务器启动失败:', err.message);
  }
  process.exit(1);
});
