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

      return {
        name: d.name,
        title: frontmatter.title,
        template: frontmatter.template,
        colorScheme: frontmatter.colorScheme,
        stylePreset: frontmatter.stylePreset,
        slideCount,
        hasHtml,
        lastModified,
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

    res.json({
      name: req.params.name,
      raw,
      frontmatter: parsed.frontmatter,
      slides: parsed.slides,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/courses — 新建课程
 */
app.post('/api/courses', (req, res) => {
  try {
    let { name, title, template, colorScheme, stylePreset } = req.body;

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

    const coursePath = path.join(COURSES_DIR, name);
    if (fs.existsSync(coursePath)) {
      return res.status(409).json({ error: `课程目录「${name}」已存在，请使用其他标题` });
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

    res.status(201).json({ name, title, path: coursePath });
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

/**
 * POST /api/ai/chat — AI 聊天代理（流式）
 * 将请求转发到 DeepSeek/OpenAI 兼容 API
 */
app.post('/api/ai/chat', (req, res) => {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = process.env.LLM_BASE_URL || 'https://api.deepseek.com/v1';
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  if (!apiKey || apiKey === 'sk-your-api-key-here') {
    return res.status(400).json({ error: '请在 .env 文件中配置 LLM_API_KEY' });
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
