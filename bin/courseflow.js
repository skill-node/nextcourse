#!/usr/bin/env node

/**
 * CourseFlow CLI
 *
 * 用法：
 *   node bin/courseflow.js render <course-path> [--open] [--preset <name>]
 *   node bin/courseflow.js list-presets
 *
 * 示例：
 *   node bin/courseflow.js render courses/gem_test --open
 *   node bin/courseflow.js render courses/gem_test --preset bold-signal --open
 */

const { render } = require('./lib/renderer');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ───── 路径常量 ─────
const ROOT_DIR = path.resolve(__dirname, '..');
const COLOR_SCHEMES_DIR = path.join(ROOT_DIR, 'shared_styles/color-schemes');

// ───── 参数解析 ─────
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === '--help' || command === '-h') {
  printHelp();
  process.exit(0);
}

switch (command) {
  case 'render':
    handleRender(args.slice(1));
    break;
  case 'list-presets':
    handleListPresets();
    break;
  default:
    console.error(`\n  ❌ 未知命令: ${command}\n`);
    printHelp();
    process.exit(1);
}

// ──────────────────────────────────────────────
//  命令处理
// ──────────────────────────────────────────────

function handleRender(args) {
  if (args.length === 0) {
    console.error('\n  ❌ 请指定课程路径\n');
    console.log('  用法: courseflow render <course-path> [--open] [--preset <name>]\n');
    process.exit(1);
  }

  // 解析参数
  const coursePath = path.resolve(ROOT_DIR, args[0]);
  const shouldOpen = args.includes('--open');
  const presetIdx = args.indexOf('--preset');
  const preset = presetIdx !== -1 ? args[presetIdx + 1] : null;

  console.log('\n  ⚡ CourseFlow CLI v1.0');
  console.log('  ─────────────────────');

  try {
    const result = render(coursePath, { preset, open: shouldOpen });

    console.log(`  ✅ 渲染完成！`);
    console.log(`  📁 输出：${result.outputPath}`);
    console.log(`  📄 页数：${result.slideCount}`);
    console.log(`  🎨 预设：${result.preset}`);

    // 输出警告
    if (result.warnings.length > 0) {
      console.log('\n  ⚠️  警告：');
      result.warnings.forEach(w => console.log(`     ${w}`));
    }

    // 打开浏览器
    if (shouldOpen) {
      console.log('\n  🌐 正在打开浏览器...');
      openBrowser(result.outputPath);
    }

    console.log('');
  } catch (err) {
    console.error(`\n  ❌ 渲染失败: ${err.message}\n`);
    process.exit(1);
  }
}

function handleListPresets() {
  console.log('\n  🎨 可用配色方案：');
  console.log('  ─────────────────────\n');

  const files = fs.readdirSync(COLOR_SCHEMES_DIR)
    .filter(f => f.endsWith('.css'))
    .sort();

  // 预设元数据
  const meta = {
    'standard-default': { desc: '蓝/深灰/绿/橙，企业培训通用', type: '基础' },
    'default':          { desc: '浅色靛蓝', type: '基础' },
    'dark-ocean':       { desc: '深蓝黑，投影仪暗场', type: '基础' },
    'warm-sand':        { desc: '暖米色，护眼', type: '基础' },
    'high-contrast':    { desc: '纯白高对比', type: '基础' },
    'bold-signal':      { desc: '深色高对比 + 橙色 | Archivo Black', type: '高级' },
    'electric-studio':  { desc: '黑白 + 蓝色强调 | Manrope', type: '高级' },
    'creative-voltage': { desc: '电蓝 + 荧光黄 | Syne + Space Mono', type: '高级' },
    'notebook-tabs':    { desc: '纸质 + 柔和色调 | Bodoni Moda', type: '高级' },
    'swiss-modern':     { desc: '极简黑白 + 红色 | Archivo + Nunito', type: '高级' },
    'dark-botanical':   { desc: '深色 + 暖色调 | Cormorant', type: '高级' },
  };

  files.forEach(f => {
    const name = f.replace('.css', '');
    const info = meta[name] || { desc: '', type: '?' };
    const badge = info.type === '高级' ? '★' : '○';
    console.log(`  ${badge}  ${name.padEnd(20)} ${info.desc}`);
  });

  console.log(`\n  共 ${files.length} 套 | ○ 基础配色 | ★ 高级预设（含 Google Fonts）\n`);
}

// ──────────────────────────────────────────────
//  工具函数
// ──────────────────────────────────────────────

function openBrowser(filePath) {
  const absolutePath = path.resolve(filePath);
  try {
    if (process.platform === 'darwin') {
      execSync(`open "${absolutePath}"`);
    } else if (process.platform === 'win32') {
      execSync(`start "" "${absolutePath}"`);
    } else {
      execSync(`xdg-open "${absolutePath}"`);
    }
  } catch (e) {
    console.log(`     无法自动打开浏览器，请手动打开: ${absolutePath}`);
  }
}

function printHelp() {
  console.log(`
  ⚡ CourseFlow CLI v1.0
  ─────────────────────

  用法：
    courseflow render <path> [--open] [--preset <name>]
    courseflow list-presets

  命令：
    render          渲染 script.md 为 Reveal.js HTML 课件
    list-presets    列出所有可用的配色方案

  选项：
    --open          渲染后自动打开浏览器
    --preset <name> 覆盖 script.md 中指定的配色方案

  示例：
    courseflow render courses/my-course --open
    courseflow render courses/my-course --preset bold-signal
  `);
}
