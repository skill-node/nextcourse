/**
 * CourseFlow — AI 内容设计助手
 *
 * 前端聊天组件：实现 content-design SKILL 的三阶段 ADDIE 工作流。
 * 对话通过 /api/ai/chat 代理到 DeepSeek API（OpenAI 兼容格式）。
 */

(function () {
  'use strict';

  // ───── 系统提示词 ─────
  const SYSTEM_PROMPT = `你是一位世界级的资深教学设计师与课件架构专家,名叫 CourseFlow AI。你擅长运用 ADDIE、ARCS 等模型构建实战课程体系。

你的终极目标是引导用户完成从"原始想法"到"结构化课件脚本(script.md)"的全过程。

## 工作流程

你必须按以下 3 个阶段引导用户，每阶段结束需要用户确认后再进入下一阶段。

### 第一阶段：需求分析 (Analysis)
帮用户理清:
1. 学员画像(痛点、现有水平、期望收获)
2. 教学目标(学完能解决什么具体问题)
3. 课程定位宣言(一句话概括核心价值)
4. 推荐 template(standard/modern) 和 style-preset

### 第二阶段：结构设计 (Design)
1. 运用金字塔原理输出 Module → Lesson 提纲
2. 匹配配色方案

### 第三阶段：脚本细化 (Development)
逐页拆解 Slide 内容。必须从组件白名单中选择视觉组件:

**通用组件**: .grid-2, .grid-3, .card, .code-block, .highlight-box
**Standard 专属**: .cover-slide, .ending-slide, .module-cover(.module-1/.module-2/...), .layout-img-left, .layout-img-right, .layout-img-top, .card-primary, .vs-good, .vs-bad, .check-list, .tag
**Modern 专属**: .cover-slide, .ending-slide, .card-primary, .card-secondary, .card-accent, .card-danger, .figure-fill, .icon-card-grid+.icon-card, .workflow+.workflow-node

每页内容密度:
- 内容页: 1标题 + 4~6要点
- 网格页: 最多6张卡片
- 内容超限就拆多页

## 输出格式

第三阶段完成后，输出完整的 script.md，格式如下:

\`\`\`markdown
---
title: 课程名称
template: standard
color-scheme: bold-signal
style-preset: bold-signal
---

[Slide 1]
# 标题
## 副标题
- 视觉组件: .cover-slide
- 演讲备注: xxx

[Slide 2]
# 模块标题
- 视觉组件: .module-cover .module-1
- 模块说明: xxx
\`\`\`

## 行为准则
- 用中文交流
- 简洁直接，拒绝客套
- 如果用户想法片面，直接给出专业反馈
- 每个阶段结束时，明确提示用户"是否确认进入下一阶段"
- 第三阶段结束时，输出完整 script.md 代码块`;

  // ───── 状态 ─────
  let chatHistory = [];
  let isStreaming = false;
  let currentCourseName = null;

  // ───── 初始化 ─────
  window.initAIChat = function (courseName) {
    currentCourseName = courseName;
    chatHistory = [];
    renderChatPanel();
  };

  // ───── 渲染聊天面板 ─────
  function renderChatPanel() {
    const panel = document.getElementById('ai-panel');
    if (!panel) return;

    panel.innerHTML = `
      <div class="ai-header">
        <span class="ai-title">🤖 AI 内容设计助手</span>
        <button class="btn btn-sm btn-ghost" onclick="toggleAIPanel()">✕</button>
      </div>
      <div class="ai-status" id="ai-status">
        <span class="ai-status-dot"></span>
        <span>就绪 — 描述你的课程想法，AI 将引导你完成三阶段设计</span>
      </div>
      <div class="ai-messages" id="ai-messages">
        <div class="ai-msg ai-msg-bot">
          <div class="ai-msg-content">
            👋 你好！我是 CourseFlow AI 内容设计助手。<br><br>
            请告诉我你想开发什么主题的课程，我将按照 <strong>ADDIE 模型</strong> 引导你完成：<br>
            <strong>1️⃣ 需求分析</strong> → <strong>2️⃣ 结构设计</strong> → <strong>3️⃣ 脚本细化</strong><br><br>
            最终会生成可直接渲染的 <code>script.md</code>。
          </div>
        </div>
      </div>
      <div class="ai-input-area">
        <textarea class="ai-input" id="ai-input" placeholder="描述你的课程主题、目标学员、教学目标…" rows="3"></textarea>
        <div class="ai-input-actions">
          <button class="btn btn-sm btn-ghost" id="btn-ai-extract" title="提取生成的 script.md 并应用到当前课程">📥 提取脚本</button>
          <button class="btn btn-sm btn-primary" id="btn-ai-send">发送 ↑</button>
        </div>
      </div>
    `;

    // 绑定事件
    document.getElementById('btn-ai-send').onclick = sendMessage;
    document.getElementById('btn-ai-extract').onclick = extractScript;
    document.getElementById('ai-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // ───── 发送消息 ─────
  async function sendMessage() {
    const input = document.getElementById('ai-input');
    const message = input.value.trim();
    if (!message || isStreaming) return;

    // 显示用户消息
    appendMessage('user', message);
    input.value = '';
    input.style.height = 'auto';

    // 构建消息历史
    chatHistory.push({ role: 'user', content: message });

    // 发送到 API
    isStreaming = true;
    updateStatus('thinking', '思考中…');

    const botMsgEl = appendMessage('bot', '');
    const contentEl = botMsgEl.querySelector('.ai-msg-content');

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...chatHistory,
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `API 错误: ${response.status}`);
      }

      // 流式读取
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      updateStatus('streaming', '输出中…');

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
              contentEl.innerHTML = markdownToHtml(fullContent);
              scrollToBottom();
            }
          } catch (e) {
            // 非 JSON 行忽略
          }
        }
      }

      chatHistory.push({ role: 'assistant', content: fullContent });
      updateStatus('ready', '就绪');

    } catch (err) {
      contentEl.innerHTML = `<span style="color:#ef4444;">❌ ${escapeHtml(err.message)}</span>`;
      updateStatus('error', err.message);
    } finally {
      isStreaming = false;
    }
  }

  // ───── 提取 script.md ─────
  async function extractScript() {
    // 从最后一条 AI 消息中提取代码块
    const lastBotMsg = chatHistory.filter(m => m.role === 'assistant').pop();
    if (!lastBotMsg) {
      window.toast('还没有 AI 生成的内容', 'warning');
      return;
    }

    const mdMatch = lastBotMsg.content.match(/```(?:markdown)?\s*\n(---[\s\S]*?)```/);
    if (!mdMatch) {
      window.toast('未找到 script.md 代码块。请让 AI 输出完整脚本后再提取。', 'warning');
      return;
    }

    const scriptContent = mdMatch[1].trim();

    try {
      await fetch(`/api/courses/${currentCourseName}/script`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: scriptContent }),
      });
      window.toast('✅ script.md 已更新，点击「渲染」查看效果', 'success');

      // 通知主应用刷新
      if (window.refreshWorkbench) {
        window.refreshWorkbench();
      }
    } catch (err) {
      window.toast('保存失败: ' + err.message, 'error');
    }
  }

  // ───── UI 辅助 ─────
  function appendMessage(role, content) {
    const container = document.getElementById('ai-messages');
    const div = document.createElement('div');
    div.className = `ai-msg ai-msg-${role === 'user' ? 'user' : 'bot'}`;
    div.innerHTML = `<div class="ai-msg-content">${role === 'user' ? escapeHtml(content) : (content ? markdownToHtml(content) : '<span class="ai-typing">●●●</span>')}</div>`;
    container.appendChild(div);
    scrollToBottom();
    return div;
  }

  function scrollToBottom() {
    const container = document.getElementById('ai-messages');
    if (container) container.scrollTop = container.scrollHeight;
  }

  function updateStatus(state, text) {
    const el = document.getElementById('ai-status');
    if (!el) return;
    const dot = el.querySelector('.ai-status-dot');
    const span = el.querySelector('span:last-child');
    if (dot) {
      dot.className = 'ai-status-dot';
      if (state === 'thinking') dot.classList.add('dot-thinking');
      if (state === 'streaming') dot.classList.add('dot-streaming');
      if (state === 'error') dot.classList.add('dot-error');
    }
    if (span) span.textContent = text;
  }

  // 简化 Markdown → HTML 转换
  function markdownToHtml(md) {
    let html = escapeHtml(md);
    // 代码块
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="lang-$1">$2</code></pre>');
    // 行内代码
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 加粗
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 标题
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    // 列表
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    // 表格
    html = html.replace(/\|(.+)\|/g, (match) => {
      const cells = match.split('|').filter(c => c.trim());
      if (cells.every(c => c.trim().match(/^[-:]+$/))) return '';
      return '<tr>' + cells.map(c => `<td>${c.trim()}</td>`).join('') + '</tr>';
    });
    html = html.replace(/(<tr>.*<\/tr>\n?)+/g, '<table>$&</table>');
    // 换行
    html = html.replace(/\n/g, '<br>');
    // 清理多余 br
    html = html.replace(/<br><br>/g, '</p><p>');
    return html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

})();
