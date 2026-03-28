/**
 * CourseFlow — 幻灯片可视化编辑器注入脚本
 *
 * 此脚本由主应用注入到 Reveal.js 预览 iframe 中，
 * 为幻灯片内容元素添加「点击编辑」能力。
 *
 * 通信方式：postMessage ↔ 父窗口
 */

(function() {
  'use strict';

  // 编辑模式状态
  let editMode = false;
  let activeElement = null;

  // 可编辑元素选择器
  const EDITABLE_SELECTORS = 'h1, h2, h3, h4, p, li, .card-primary p, .card-primary h3, .vs-good h3, .vs-good li, .vs-bad h3, .vs-bad li';

  // ───── 初始化 ─────
  function init() {
    // 等待 Reveal 初始化完成
    if (typeof Reveal !== 'undefined' && Reveal.isReady && Reveal.isReady()) {
      setup();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(setup, 500);
      });
    }
  }

  function setup() {
    injectStyles();
    bindEvents();

    // 通知父窗口编辑器已就绪
    window.parent.postMessage({ type: 'editor-ready' }, '*');
  }

  // ───── 注入编辑器样式 ─────
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      /* 编辑模式下的高亮效果 */
      .cf-edit-mode ${EDITABLE_SELECTORS.split(',').map(s => s.trim()).join(', .cf-edit-mode ')} {
        cursor: text !important;
        transition: outline 0.15s ease, background-color 0.15s ease;
      }

      .cf-editable-hover {
        outline: 2px dashed rgba(99, 102, 241, 0.5) !important;
        outline-offset: 4px;
        background-color: rgba(99, 102, 241, 0.05) !important;
      }

      .cf-editable-active {
        outline: 2px solid rgba(99, 102, 241, 0.8) !important;
        outline-offset: 4px;
        background-color: rgba(99, 102, 241, 0.08) !important;
      }

      /* 编辑模式指示器 */
      .cf-edit-indicator {
        position: fixed;
        top: 12px;
        right: 12px;
        background: rgba(99, 102, 241, 0.9);
        color: #fff;
        padding: 6px 14px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 600;
        z-index: 9999;
        font-family: 'Inter', sans-serif;
        pointer-events: none;
        transition: opacity 0.3s ease;
      }

      /* 编辑工具条 */
      .cf-edit-toolbar {
        position: fixed;
        bottom: 50px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 15, 19, 0.95);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 8px 16px;
        display: flex;
        gap: 8px;
        z-index: 9999;
        font-family: 'Inter', sans-serif;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        backdrop-filter: blur(8px);
      }

      .cf-edit-toolbar button {
        background: rgba(255,255,255,0.08);
        border: 1px solid rgba(255,255,255,0.1);
        color: #e8e8ed;
        padding: 6px 14px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 500;
        transition: all 0.15s ease;
        font-family: inherit;
      }

      .cf-edit-toolbar button:hover {
        background: rgba(99, 102, 241, 0.3);
        border-color: rgba(99, 102, 241, 0.5);
      }

      .cf-edit-toolbar .cf-btn-save {
        background: rgba(99, 102, 241, 0.8);
        border-color: transparent;
      }

      .cf-edit-toolbar .cf-btn-save:hover {
        background: rgba(99, 102, 241, 1);
      }

      .cf-edit-toolbar .cf-btn-cancel {
        color: #9090a0;
      }
    `;
    document.head.appendChild(style);
  }

  // ───── 事件绑定 ─────
  function bindEvents() {
    // 监听父窗口的消息
    window.addEventListener('message', (e) => {
      if (e.data.type === 'toggle-edit-mode') {
        toggleEditMode();
      }
      if (e.data.type === 'exit-edit-mode') {
        exitEditMode();
      }
    });
  }

  // ───── 编辑模式切换 ─────
  function toggleEditMode() {
    editMode = !editMode;

    if (editMode) {
      enterEditMode();
    } else {
      exitEditMode();
    }
  }

  function enterEditMode() {
    editMode = true;
    document.body.classList.add('cf-edit-mode');

    // 显示指示器
    const indicator = document.createElement('div');
    indicator.className = 'cf-edit-indicator';
    indicator.id = 'cf-edit-indicator';
    indicator.textContent = '✏️ 编辑模式';
    document.body.appendChild(indicator);

    // 显示工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'cf-edit-toolbar';
    toolbar.id = 'cf-edit-toolbar';
    toolbar.innerHTML = `
      <button class="cf-btn-save" onclick="window.__cfEditor.saveChanges()">💾 保存修改</button>
      <button class="cf-btn-cancel" onclick="window.__cfEditor.exitEditMode()">✕ 退出编辑</button>
    `;
    document.body.appendChild(toolbar);

    // 为可编辑元素绑定事件
    const elements = document.querySelectorAll(EDITABLE_SELECTORS);
    elements.forEach(el => {
      el.addEventListener('mouseenter', onElementHover);
      el.addEventListener('mouseleave', onElementLeave);
      el.addEventListener('click', onElementClick);
    });

    // 禁用 Reveal.js 键盘导航（避免编辑时切页）
    if (typeof Reveal !== 'undefined') {
      Reveal.configure({ keyboard: false });
    }

    window.parent.postMessage({ type: 'edit-mode-changed', editMode: true }, '*');
  }

  function exitEditMode() {
    editMode = false;
    document.body.classList.remove('cf-edit-mode');

    // 移除指示器和工具栏
    const indicator = document.getElementById('cf-edit-indicator');
    if (indicator) indicator.remove();
    const toolbar = document.getElementById('cf-edit-toolbar');
    if (toolbar) toolbar.remove();

    // 清理元素事件
    const elements = document.querySelectorAll(EDITABLE_SELECTORS);
    elements.forEach(el => {
      el.removeAttribute('contenteditable');
      el.classList.remove('cf-editable-hover', 'cf-editable-active');
      el.removeEventListener('mouseenter', onElementHover);
      el.removeEventListener('mouseleave', onElementLeave);
      el.removeEventListener('click', onElementClick);
    });

    activeElement = null;

    // 恢复 Reveal.js 键盘导航
    if (typeof Reveal !== 'undefined') {
      Reveal.configure({ keyboard: true });
    }

    window.parent.postMessage({ type: 'edit-mode-changed', editMode: false }, '*');
  }

  // ───── 元素交互 ─────
  function onElementHover(e) {
    if (!editMode) return;
    e.target.classList.add('cf-editable-hover');
  }

  function onElementLeave(e) {
    if (!editMode) return;
    e.target.classList.remove('cf-editable-hover');
  }

  function onElementClick(e) {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();

    // 取消上一个活跃元素
    if (activeElement) {
      activeElement.classList.remove('cf-editable-active');
      activeElement.removeAttribute('contenteditable');
    }

    // 激活当前元素
    activeElement = e.target;
    activeElement.classList.add('cf-editable-active');
    activeElement.setAttribute('contenteditable', 'true');
    activeElement.focus();
  }

  // ───── 收集变更并通知父窗口 ─────
  function saveChanges() {
    const sections = document.querySelectorAll('.reveal .slides > section');
    const changes = [];

    sections.forEach((section, slideIndex) => {
      const h1 = section.querySelector('h1');
      const h2 = section.querySelector('h2');
      const listItems = section.querySelectorAll('li');
      const paragraphs = section.querySelectorAll('p');

      changes.push({
        slideIndex,
        title: h1 ? h1.textContent.trim() : '',
        subtitle: h2 ? h2.textContent.trim() : '',
        content: [...listItems].map(li => li.textContent.trim()),
        paragraphs: [...paragraphs].map(p => p.textContent.trim()),
      });
    });

    window.parent.postMessage({
      type: 'slides-edited',
      changes,
    }, '*');

    exitEditMode();
  }

  // ───── 全局暴露 ─────
  window.__cfEditor = {
    toggleEditMode,
    enterEditMode,
    exitEditMode,
    saveChanges,
  };

  // 启动
  init();
})();
