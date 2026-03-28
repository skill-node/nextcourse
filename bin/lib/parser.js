/**
 * CourseFlow — script.md 解析器
 *
 * 将 script.md 解析为结构化数据：
 *   { frontmatter: { title, template, colorScheme, stylePreset }, slides: [] }
 *
 * 零外部依赖，使用正则完成全部解析。
 */

const fs = require('fs');
const path = require('path');

/**
 * 解析 script.md 文件
 * @param {string} filePath — script.md 的绝对或相对路径
 * @returns {{ frontmatter: object, slides: object[] }}
 */
function parseScript(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');

  // ───── 1. 解析 YAML frontmatter ─────
  const frontmatter = parseFrontmatter(raw);

  // ───── 2. 解析 Slide 块 ─────
  const slides = parseSlides(raw);

  return { frontmatter, slides };
}

/**
 * 解析 YAML frontmatter（--- ... ---）
 * 仅支持简单 key: value 格式，不引入 yaml 库
 */
function parseFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) {
    return { title: 'Untitled', template: 'standard', colorScheme: 'standard-default', stylePreset: null };
  }

  const lines = match[1].split('\n');
  const result = {};
  for (const line of lines) {
    const kv = line.match(/^(\S+)\s*:\s*(.+)$/);
    if (kv) {
      const key = kv[1].trim();
      const value = kv[2].trim();
      // 将 kebab-case 转为 camelCase
      const camelKey = key.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      result[camelKey] = value;
    }
  }

  return {
    title: result.title || 'Untitled',
    template: result.template || 'standard',
    colorScheme: result.colorScheme || 'standard-default',
    stylePreset: result.stylePreset || null,
  };
}

/**
 * 将 raw markdown 拆分为 [Slide N] 块并解析每个块
 */
function parseSlides(raw) {
  // 移除 frontmatter
  const body = raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n?/, '');

  // 按 [Slide N] 分割
  const slideBlocks = body.split(/\[Slide\s+\d+\]\s*\n/).filter(s => s.trim());

  return slideBlocks.map((block, index) => parseSlideBlock(block, index + 1));
}

/**
 * 解析单个 Slide 块
 */
function parseSlideBlock(block, number) {
  const lines = block.split('\n');

  const slide = {
    number,
    title: '',
    subtitle: '',
    content: [],        // 普通内容要点
    component: '',      // 视觉组件类名
    componentData: null, // 组件内容（JSON）
    notes: '',          // 演讲备注
    moduleDesc: '',     // 模块说明（module-cover 专用）
  };

  for (const line of lines) {
    const trimmed = line.trim();

    // 标题 (# 开头)
    if (trimmed.startsWith('# ') && !trimmed.startsWith('## ')) {
      slide.title = trimmed.replace(/^#\s+/, '');
      continue;
    }

    // 副标题 (## 开头)
    if (trimmed.startsWith('## ')) {
      slide.subtitle = trimmed.replace(/^##\s+/, '');
      continue;
    }

    // 视觉组件
    const componentMatch = trimmed.match(/^-\s*视觉组件\s*:\s*(.+)$/);
    if (componentMatch) {
      slide.component = componentMatch[1].trim();
      continue;
    }

    // 组件内容（JSON）
    const dataMatch = trimmed.match(/^-\s*组件内容\s*:\s*(.+)$/);
    if (dataMatch) {
      let jsonStr = dataMatch[1].trim();
      try {
        slide.componentData = JSON.parse(jsonStr);
      } catch (e) {
        // 尝试修复常见 JSON 问题：中文引号 → 转义
        try {
          jsonStr = jsonStr.replace(/\u201c/g, '\\"').replace(/\u201d/g, '\\"');
          slide.componentData = JSON.parse(jsonStr);
        } catch (e2) {
          console.warn(`  ⚠️  Slide ${number}: 组件内容 JSON 解析失败，将作为文本处理`);
          slide.componentData = dataMatch[1].trim();
        }
      }
      continue;
    }

    // 演讲备注
    const notesMatch = trimmed.match(/^-\s*演讲备注\s*:\s*(.+)$/);
    if (notesMatch) {
      slide.notes = notesMatch[1].trim();
      continue;
    }

    // 模块说明
    const moduleMatch = trimmed.match(/^-\s*模块说明\s*:\s*(.+)$/);
    if (moduleMatch) {
      slide.moduleDesc = moduleMatch[1].trim();
      continue;
    }

    // 核心内容要点
    const contentMatch = trimmed.match(/^-\s*核心内容要点\s*:\s*(.+)$/);
    if (contentMatch) {
      slide.content.push(contentMatch[1].trim());
      continue;
    }

    // 通用列表项（- 开头，非特殊字段）
    if (trimmed.startsWith('- ') && !trimmed.match(/^-\s*(视觉组件|组件内容|演讲备注|模块说明|核心内容要点)\s*:/)) {
      slide.content.push(trimmed.replace(/^-\s+/, ''));
    }
  }

  return slide;
}

module.exports = { parseScript, parseFrontmatter, parseSlides };
