'use strict';

const session = document.querySelector('meta[name="nextcourse-session"]').content;
const state = {
    workspace: null, library: [], view: 'courses', query: '', course: null, draft: null,
    selectedItemId: null, selectedGroupId: null, selectedLibraryId: null,
    inspector: 'preview', selectedPage: null, drag: null,
};

const $ = selector => document.querySelector(selector);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
})[character]);

async function api(pathname, options = {}) {
    const response = await fetch(pathname, {
        method: options.method || 'GET',
        headers: { 'X-NextCourse-Session': session, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(value.error || `HTTP ${response.status}`);
        error.status = response.status;
        error.value = value;
        throw error;
    }
    return value;
}

function setWorkspaceStatus(message, bad = false) {
    const node = $('#workspace-state');
    node.textContent = message;
    node.className = bad ? 'workspace-state status-bad' : 'workspace-state';
}

const recipe = () => state.draft?.recipe || state.course?.recipe || null;
const savedItem = id => state.course?.recipe.groups.flatMap(group => group.items).find(item => item.id === id) || null;
const libraryItem = ref => state.library.find(item => item.id === ref) || state.library.find(item => item.resolvedId === ref) || null;

function decorateItem(item) {
    if (!state.draft) return item;
    const saved = savedItem(item.id);
    const metadata = libraryItem(item.ref);
    const sameSavedSource = saved && saved.ref === item.ref;
    const rawPages = sameSavedSource ? saved.pages : [];
    const byPageId = new Map(rawPages.map(page => [page.entityId, page]));
    const pages = Array.isArray(item.pagePlan)
        ? item.pagePlan.map(id => byPageId.get(id)).filter(Boolean)
        : rawPages;
    return {
        ...item,
        title: metadata?.title || item.ref || item.local?.id || item.id,
        selectedPages: item.pages || null,
        operationCount: (item.operations || []).length,
        outcomeMap: item.outcomeMap || {},
        caseOverrides: item.caseOverrides || [],
        pages,
        availablePages: saved?.availablePages?.length ? saved.availablePages : rawPages,
        source: sameSavedSource ? saved.source : null,
        diagnostics: sameSavedSource ? saved.diagnostics : [],
    };
}

function groups() {
    return (recipe()?.groups || []).map((group, index) => ({
        ...group,
        moduleNumber: group.moduleNumber === undefined ? index + 1 : group.moduleNumber,
        plannedMinutes: group.plannedMinutes ?? null,
        items: (group.items || []).map(decorateItem),
    }));
}

const itemById = id => groups().flatMap(group => group.items).find(item => item.id === id) || null;
const groupById = id => groups().find(group => group.id === id) || null;
const selectedItem = () => itemById(state.selectedItemId);
const selectedLibrary = () => state.library.find(item => item.id === state.selectedLibraryId) || null;

function availableId(seed, existing = new Set(groups().flatMap(group => group.items.map(item => item.id)))) {
    const clean = String(seed || 'item').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
    if (!existing.has(clean)) return clean;
    let index = 2;
    while (existing.has(`${clean}-${index}`)) index++;
    return `${clean}-${index}`;
}

function renderCatalog() {
    const list = $('#catalog-list');
    const query = state.query.trim().toLocaleLowerCase();
    if (state.view === 'courses') {
        const courses = (state.workspace?.courses || []).filter(course =>
            [course.name, course.title, course.courseId].some(value => String(value || '').toLocaleLowerCase().includes(query))
        );
        list.innerHTML = courses.map(course => `
          <button class="catalog-item ${state.course?.name === course.name ? 'is-selected' : ''}" data-course="${escapeHtml(course.name)}" type="button">
            <span class="catalog-item-title"><span>${escapeHtml(course.title)}</span><span class="kind-mark">${course.kind === 'composed' ? `${course.recipes.length} 配方` : '独立课'}</span></span>
            <span class="catalog-item-meta">${escapeHtml(course.courseId || course.name)} · ${course.kind === 'independent' ? `${course.slideCount} 页` : course.valid ? '校验通过' : `${course.diagnostics.errors} 个错误`}</span>
          </button>`).join('') || '<div class="empty-state compact"><p>没有匹配的课程。</p></div>';
        list.querySelectorAll('[data-course]').forEach(button => button.addEventListener('click', () => selectCourse(button.dataset.course)));
        return;
    }
    const items = state.library.filter(item =>
        [item.id, item.title, item.owner, item.kind].some(value => String(value || '').toLocaleLowerCase().includes(query))
    );
    list.innerHTML = items.map(item => {
        const selected = state.selectedLibraryId === item.id;
        const insertable = state.draft && ['sequence', 'unit', 'page'].includes(item.kind);
        const replaceable = state.draft && ['unit', 'page'].includes(item.kind) && selectedItem();
        return `<article class="library-card ${selected ? 'is-selected' : ''}">
          <button class="library-select" data-library="${escapeHtml(item.id)}" type="button">
            <span class="catalog-item-title"><span>${escapeHtml(item.title)}</span><span class="kind-mark">${escapeHtml(item.kind)}</span></span>
            <span class="catalog-item-meta">${escapeHtml(item.owner)} · ${escapeHtml(item.version)}${item.reexported ? ' · 再导出' : ''}</span>
          </button>
          ${insertable ? `<div class="library-actions"><button class="mini-button" data-insert-library="${escapeHtml(item.id)}" type="button">${item.kind === 'sequence' ? '加入为模块' : '加入本课'}</button>${replaceable ? `<button class="mini-button" data-replace-library="${escapeHtml(item.id)}" type="button">替换选中</button>` : ''}</div>` : ''}
        </article>`;
    }).join('') || '<div class="empty-state compact"><p>没有匹配的公开内容。</p></div>';
    list.querySelectorAll('[data-library]').forEach(button => button.addEventListener('click', () => {
        state.selectedLibraryId = button.dataset.library;
        renderCatalog();
        renderInspector();
    }));
    list.querySelectorAll('[data-insert-library]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        insertLibrary(button.dataset.insertLibrary);
    }));
    list.querySelectorAll('[data-replace-library]').forEach(button => button.addEventListener('click', event => {
        event.stopPropagation();
        replaceWithLibrary(button.dataset.replaceLibrary);
    }));
}

function metricsMarkup(course) {
    const active = recipe();
    const validation = course.validation;
    const planned = groups().flatMap(group => group.items).reduce((sum, item) => sum + (Number.isInteger(item.plannedMinutes) ? item.plannedMinutes : 0), 0);
    const values = [
        [active.durationMinutes == null ? '—' : `${active.durationMinutes} min`, '配方时长'],
        [state.draft ? `${planned} min` : validation.estimatedMinutes == null ? '—' : `${validation.estimatedMinutes} min`, state.draft ? '草稿排期' : '内容估时'],
        [course.preview.available ? `${course.preview.pageCount} 页` : '未构建', '当前预览'],
        [state.draft ? state.draft.dirty ? '未保存' : '已保存' : course.kind === 'independent' ? '独立模式' : validation.valid ? '通过' : `${validation.summary.errors} 错误`, '当前状态'],
    ];
    return values.map(([value, label]) => `<div class="metric"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`).join('');
}

function renderEditActions() {
    const editable = Boolean(state.course);
    const composed = state.course?.kind === 'composed';
    $('#edit-course').hidden = !editable || Boolean(state.draft);
    $('#edit-course').textContent = composed ? '编辑组合' : '转换为组合课';
    $('#restore-edit').hidden = !composed || Boolean(state.draft) || !state.course?.history?.length;
    $('#undo-edit').hidden = !state.draft;
    $('#discard-edit').hidden = !state.draft;
    $('#save-edit').hidden = !state.draft;
    $('#undo-edit').disabled = !state.draft?.canUndo;
    $('#save-edit').disabled = !state.draft?.dirty;
    $('#draft-panel').hidden = !state.draft;
    $('#recipe-select').disabled = Boolean(state.draft?.dirty);
    if (state.draft) {
        $('#draft-copy').textContent = state.draft.dirty ? `第 ${state.draft.revision} 步 · 尚未写入文件` : '当前草稿与磁盘一致。';
        $('#recipe-title').value = recipe().title || '';
        $('#recipe-duration').value = recipe().durationMinutes ?? '';
        $('#recipe-profile').value = recipe().deliveryProfile || 'slides';
    }
}

function itemControls(item, group, itemIndex) {
    if (!state.draft) return '';
    return `<span class="occurrence-actions" aria-label="调整 ${escapeHtml(item.id)}">
      <button class="icon-button" data-item-action="up" data-item-id="${escapeHtml(item.id)}" ${itemIndex === 0 ? 'disabled' : ''} type="button" aria-label="上移">↑</button>
      <button class="icon-button" data-item-action="down" data-item-id="${escapeHtml(item.id)}" ${itemIndex === group.items.length - 1 ? 'disabled' : ''} type="button" aria-label="下移">↓</button>
      <button class="icon-button" data-item-action="copy" data-item-id="${escapeHtml(item.id)}" type="button" aria-label="复制">⧉</button>
      <button class="icon-button" data-item-action="remove" data-item-id="${escapeHtml(item.id)}" type="button" aria-label="删除">×</button>
      ${groups().length > 1 ? `<label class="move-picker"><span class="visually-hidden">移至分组</span><select data-move-item="${escapeHtml(item.id)}"><option value="">移至…</option>${groups().filter(candidate => candidate.id !== group.id).map(candidate => `<option value="${escapeHtml(candidate.id)}">${escapeHtml(candidate.title)}</option>`).join('')}</select></label>` : ''}
    </span>`;
}

function pageControls(item, page, pageIndex) {
    if (!state.draft) return '';
    return `<span class="page-actions" aria-label="调整 ${escapeHtml(page.entityId)}">
      <button class="icon-button" data-page-action="up" data-page-id="${escapeHtml(page.entityId)}" data-page-item="${escapeHtml(item.id)}" ${pageIndex === 0 ? 'disabled' : ''} type="button" aria-label="页面上移">↑</button>
      <button class="icon-button" data-page-action="down" data-page-id="${escapeHtml(page.entityId)}" data-page-item="${escapeHtml(item.id)}" ${pageIndex === item.pages.length - 1 ? 'disabled' : ''} type="button" aria-label="页面下移">↓</button>
      <button class="icon-button" data-page-action="remove" data-page-id="${escapeHtml(page.entityId)}" data-page-item="${escapeHtml(item.id)}" type="button" aria-label="排除页面">×</button>
    </span>`;
}

function groupControls(group, index) {
    if (!state.draft) return '';
    return `<span class="group-actions">
      <button class="icon-button" data-group-action="up" data-group-id="${escapeHtml(group.id)}" ${index === 0 ? 'disabled' : ''} type="button" aria-label="分组上移">↑</button>
      <button class="icon-button" data-group-action="down" data-group-id="${escapeHtml(group.id)}" ${index === groups().length - 1 ? 'disabled' : ''} type="button" aria-label="分组下移">↓</button>
      <button class="mini-button" data-group-action="merge" data-group-id="${escapeHtml(group.id)}" ${index === 0 ? 'disabled' : ''} type="button">并入上组</button>
      <button class="icon-button" data-group-action="remove" data-group-id="${escapeHtml(group.id)}" type="button" aria-label="删除分组">×</button>
    </span>`;
}

function renderCourse() {
    const course = state.course;
    $('#course-empty').hidden = Boolean(course);
    $('#course-view').hidden = !course;
    renderEditActions();
    if (!course) return;
    $('#course-id').textContent = course.kind === 'independent' ? '独立课程 · 未启用组合' : `${course.courseId} / ${course.recipeId}`;
    $('#course-title').textContent = course.title;
    $('#recipe-select').innerHTML = course.recipes.map(option => `<option value="${escapeHtml(option.id)}" ${option.id === course.recipeId ? 'selected' : ''}>${escapeHtml(option.title || option.id)}</option>`).join('');
    $('#course-metrics').innerHTML = metricsMarkup(course);
    $('#outline-list').innerHTML = groups().map((group, groupIndex) => `
      <section class="group ${state.selectedGroupId === group.id && !state.selectedItemId ? 'is-selected' : ''}" data-drop-group="${escapeHtml(group.id)}">
        <div class="group-heading" data-select-group="${escapeHtml(group.id)}" tabindex="0" role="button">
          ${state.draft ? `<span class="drag-handle" draggable="true" data-drag-group="${escapeHtml(group.id)}" title="拖动模块；键盘可使用右侧上下移动按钮" aria-label="拖动模块">⋮⋮</span>` : ''}<div><p class="group-index">${group.moduleNumber == null ? '过渡' : `模块 ${group.moduleNumber}`}</p><h3>${escapeHtml(group.title)}</h3></div>
          <span class="group-meta">${group.plannedMinutes == null ? `${group.items.length} 个实例` : `${group.plannedMinutes} min`}</span>${groupControls(group, groupIndex)}
        </div>
        ${group.items.map((item, itemIndex) => `
          <div class="occurrence-row ${state.selectedItemId === item.id ? 'is-selected' : ''}" data-drop-item="${escapeHtml(item.id)}">
            ${state.draft ? `<span class="drag-handle item-drag" draggable="true" data-drag-item="${escapeHtml(item.id)}" title="拖动教学单元；键盘可使用右侧上下移动按钮" aria-label="拖动教学单元">⋮⋮</span>` : ''}
            <button class="occurrence" data-item="${escapeHtml(item.id)}" type="button">
              <span class="occurrence-title">${escapeHtml(item.title)}</span><span class="badge ${escapeHtml(item.contentMode)}">${item.contentMode === 'reference' ? '引用' : item.contentMode === 'variant' ? '本课变体' : '本地'}</span>
              <span class="occurrence-meta">${escapeHtml(item.id)}${item.plannedMinutes == null ? '' : ` · ${item.plannedMinutes} min`} · ${item.pages.length || '—'} 页</span>
            </button>${itemControls(item, group, itemIndex)}
          </div>
          <div class="page-tree" aria-label="${escapeHtml(item.title)} 的页面">
            ${item.pages.map((page, pageIndex) => `<div class="page-row ${state.selectedItemId === item.id && state.selectedPage === page.index ? 'is-selected' : ''}" data-drop-page="${escapeHtml(page.entityId)}" data-page-item="${escapeHtml(item.id)}">
              ${state.draft ? `<span class="drag-handle page-drag" draggable="true" data-drag-page="${escapeHtml(page.entityId)}" data-page-item="${escapeHtml(item.id)}" title="拖动页面；键盘可使用右侧上下移动按钮" aria-label="拖动页面">⋮⋮</span>` : ''}<button class="page-select" data-tree-page="${page.index}" data-page-item="${escapeHtml(item.id)}" type="button"><span class="page-order">${pageIndex + 1}</span><span>${escapeHtml(page.entityId.split(':').at(-1))}</span></button>${pageControls(item, page, pageIndex)}
            </div>`).join('') || (state.draft ? '<p class="empty-pages">没有纳入本配方的页面。</p>' : '')}
          </div>`).join('') || '<p class="empty-group">这个分组还没有教学单元。</p>'}
      </section>`).join('');
    $('#outline-list').querySelectorAll('[data-item]').forEach(button => button.addEventListener('click', () => selectItem(button.dataset.item)));
    $('#outline-list').querySelectorAll('[data-select-group]').forEach(node => {
        const choose = event => {
            if (event.target.closest('button,select')) return;
            state.selectedGroupId = node.dataset.selectGroup;
            state.selectedItemId = null;
            state.inspector = state.draft ? 'settings' : 'preview';
            selectInspectorTab(); renderCourse(); renderInspector();
        };
        node.addEventListener('click', choose);
        node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') choose(event); });
    });
    $('#outline-list').querySelectorAll('[data-item-action]').forEach(button => button.addEventListener('click', () => itemAction(button.dataset.itemId, button.dataset.itemAction)));
    $('#outline-list').querySelectorAll('[data-tree-page]').forEach(button => button.addEventListener('click', () => {
        state.selectedItemId = button.dataset.pageItem;
        state.selectedGroupId = groups().find(group => group.items.some(item => item.id === state.selectedItemId))?.id || null;
        state.selectedPage = Number(button.dataset.treePage);
        state.inspector = 'preview'; selectInspectorTab(); renderCourse(); renderInspector();
    }));
    $('#outline-list').querySelectorAll('[data-page-action]').forEach(button => button.addEventListener('click', () => pageAction(button.dataset.pageItem, button.dataset.pageId, button.dataset.pageAction)));
    $('#outline-list').querySelectorAll('[data-group-action]').forEach(button => button.addEventListener('click', () => groupAction(button.dataset.groupId, button.dataset.groupAction)));
    $('#outline-list').querySelectorAll('[data-move-item]').forEach(select => select.addEventListener('change', () => {
        if (select.value) performOperation({ type: 'move_item', itemId: select.dataset.moveItem, groupId: select.value });
    }));
    bindOutlineDrag();
}

function bindOutlineDrag() {
    const start = (kind, id, itemId = null) => event => {
        state.drag = { kind, id, itemId };
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', `${kind}:${id}`);
    };
    document.querySelectorAll('[data-drag-group]').forEach(node => node.addEventListener('dragstart', start('group', node.dataset.dragGroup)));
    document.querySelectorAll('[data-drag-item]').forEach(node => node.addEventListener('dragstart', start('item', node.dataset.dragItem)));
    document.querySelectorAll('[data-drag-page]').forEach(node => node.addEventListener('dragstart', start('page', node.dataset.dragPage, node.dataset.pageItem)));
    document.querySelectorAll('[data-drop-group]').forEach(node => {
        node.addEventListener('dragover', event => { if (state.drag?.kind === 'group') event.preventDefault(); });
        node.addEventListener('drop', event => {
            if (state.drag?.kind !== 'group') return;
            event.preventDefault();
            const allGroups = groups();
            let index = allGroups.findIndex(group => group.id === node.dataset.dropGroup);
            const sourceIndex = allGroups.findIndex(group => group.id === state.drag.id);
            if (sourceIndex < index) index--;
            if (index >= 0 && state.drag.id !== node.dataset.dropGroup) performOperation({ type: 'move_group', groupId: state.drag.id, index });
            state.drag = null;
        });
    });
    document.querySelectorAll('[data-drop-item]').forEach(node => {
        node.addEventListener('dragover', event => { if (state.drag?.kind === 'item') event.preventDefault(); });
        node.addEventListener('drop', event => {
            if (state.drag?.kind !== 'item') return;
            event.preventDefault();
            const targetGroup = groups().find(group => group.items.some(item => item.id === node.dataset.dropItem));
            const sourceGroup = groups().find(group => group.items.some(item => item.id === state.drag.id));
            let index = targetGroup?.items.findIndex(item => item.id === node.dataset.dropItem) ?? -1;
            const sourceIndex = sourceGroup?.items.findIndex(item => item.id === state.drag.id) ?? -1;
            if (targetGroup && sourceGroup && targetGroup.id === sourceGroup.id && sourceIndex < index) index--;
            if (targetGroup && index >= 0 && state.drag.id !== node.dataset.dropItem) performOperation({ type: 'move_item', itemId: state.drag.id, groupId: targetGroup.id, index });
            state.drag = null;
        });
    });
    document.querySelectorAll('[data-drop-page]').forEach(node => {
        node.addEventListener('dragover', event => { if (state.drag?.kind === 'page' && state.drag.itemId === node.dataset.pageItem) event.preventDefault(); });
        node.addEventListener('drop', event => {
            if (state.drag?.kind !== 'page' || state.drag.itemId !== node.dataset.pageItem) return;
            event.preventDefault();
            const item = itemById(node.dataset.pageItem);
            const pageIds = item?.pages.map(page => page.entityId) || [];
            let index = pageIds.indexOf(node.dataset.dropPage);
            const sourceIndex = pageIds.indexOf(state.drag.id);
            if (sourceIndex < index) index--;
            if (index >= 0 && state.drag.id !== node.dataset.dropPage) performOperation({ type: 'move_page', itemId: item.id, pageId: state.drag.id, index, availablePages: pageIds });
            state.drag = null;
        });
    });
}

function selectInspectorTab() {
    document.querySelectorAll('[data-inspector]').forEach(tab => tab.classList.toggle('is-active', tab.dataset.inspector === state.inspector));
}

function diagnosticMarkup(diagnostics) {
    return diagnostics.length ? diagnostics.map(entry => `
      <article class="diagnostic ${entry.severity === 'warning' ? 'warning' : ''}"><strong>${escapeHtml(entry.code)}</strong><p>${escapeHtml(entry.message)}</p><code>${escapeHtml(entry.path || '')}</code></article>`).join('') : '<p class="status-good">没有发现问题。</p>';
}

function libraryMarkup(item) {
    return `<section class="inspector-section"><p class="eyebrow">可复用内容</p><h3>${escapeHtml(item.title)}</h3><dl class="definition-list">
      <dt>稳定 ID</dt><dd>${escapeHtml(item.id)}</dd><dt>类型</dt><dd>${escapeHtml(item.kind)}</dd><dt>版本</dt><dd>${escapeHtml(item.version)}</dd><dt>来源文件</dt><dd>${escapeHtml(item.sourcePath || '—')}</dd>
      ${item.durationMinutes == null ? '' : `<dt>建议时长</dt><dd>${item.durationMinutes} min</dd>`}${item.pages.length ? `<dt>页面</dt><dd>${item.pages.length} 页</dd>` : ''}</dl>
      ${item.outcomes.length ? `<h4>学习成果</h4><ul class="plain-list">${item.outcomes.map(outcome => `<li><strong>${escapeHtml(outcome.id)}</strong> ${escapeHtml(outcome.do)}</li>`).join('')}</ul>` : ''}
      ${item.kind === 'sequence' && item.items.length ? `<h4>模块内容</h4><ol class="plain-list">${item.items.map(entry => `<li>${escapeHtml(entry.ref)}${entry.plannedMinutes == null ? '' : ` · ${entry.plannedMinutes} min`}</li>`).join('')}</ol>` : ''}
      ${state.draft && ['sequence', 'unit', 'page'].includes(item.kind) ? `<button class="primary-button inspector-cta" data-inspector-insert="${escapeHtml(item.id)}" type="button">${item.kind === 'sequence' ? '加入为新模块' : '加入当前分组'}</button>` : ''}</section>`;
}

function settingsMarkup(item, group) {
    if (!state.draft) return '<div class="empty-state compact"><p>点击“编辑组合”后，可调整当前实例或分组。</p></div>';
    if (group && !item) return `<section class="inspector-section"><p class="eyebrow">分组设置</p><h3>${escapeHtml(group.title)}</h3>
      <div class="field-stack"><label><span>分组名称</span><input id="group-title-field" value="${escapeHtml(group.title)}"></label>
      <label><span>计划时长（分钟）</span><input id="group-minutes-field" type="number" min="0" value="${group.plannedMinutes ?? ''}"></label>
      <label><span>模块编号</span><input id="group-module-field" type="number" min="1" value="${group.moduleNumber ?? ''}" placeholder="留空自动编号"></label></div>
      <p class="scope-note">调整分组只改变当前配方，不修改任何教学页面。</p></section>`;
    if (!item) return '<div class="empty-state compact"><p>选择一个实例或分组进行设置。</p></div>';
    const metadata = libraryItem(item.ref);
    const pageIds = item.availablePages?.length
        ? item.availablePages.map(page => ({ id: page.entityId, role: page.role || page.contentMode || 'page', estimatedMinutes: page.estimatedMinutes ?? 0 }))
        : (metadata?.pages || []);
    const included = new Set(item.pages.map(page => page.entityId));
    const sourceCases = metadata?.cases || [];
    const cases = state.library.filter(entry => entry.kind === 'case');
    return `<section class="inspector-section"><p class="eyebrow">实例设置</p><h3>${escapeHtml(item.title)}</h3>
      <div class="field-stack"><label><span>计划时长（分钟）</span><input id="item-minutes-field" type="number" min="0" value="${item.plannedMinutes ?? ''}"></label>
      <label><span>更新策略</span><select id="item-policy-field"><option value="manual" ${item.updatePolicy === 'manual' ? 'selected' : ''}>手动接受更新</option><option value="frozen" ${item.updatePolicy === 'frozen' ? 'selected' : ''}>固定当前版本</option></select></label></div>
      ${pageIds.length ? `<fieldset class="choice-field"><legend>本次使用的页面</legend>${pageIds.map(page => `<label><input type="checkbox" data-page-choice="${escapeHtml(page.id)}" ${included.has(page.id) ? 'checked' : ''}><span><strong>${escapeHtml(page.id.split(':').at(-1))}</strong><small>${escapeHtml(page.role)} · ${page.estimatedMinutes} min</small></span></label>`).join('')}<button class="text-button" id="all-pages" type="button">恢复全部页面</button></fieldset>` : '<p class="scope-note">此内容没有可选择的页面清单。</p>'}
      ${metadata?.outcomes.length ? `<fieldset class="outcome-field"><legend>成果映射</legend>${metadata.outcomes.map(outcome => `<label><span>${escapeHtml(outcome.id)} · ${escapeHtml(outcome.do)}</span><input data-outcome="${escapeHtml(outcome.id)}" value="${escapeHtml((item.outcomeMap?.[outcome.id] || []).join(', '))}" placeholder="例如 LO1, LO2"></label>`).join('')}</fieldset>` : ''}
      ${sourceCases.length ? `<fieldset class="outcome-field"><legend>案例替换</legend>${sourceCases.map(sourceCase => { const current = item.caseOverrides?.find(entry => entry.from === sourceCase)?.to || ''; return `<label><span>${escapeHtml(sourceCase)}</span><select data-case-from="${escapeHtml(sourceCase)}"><option value="">保留源案例</option>${cases.filter(candidate => candidate.resolvedId !== sourceCase).map(candidate => `<option value="${escapeHtml(candidate.id)}" ${candidate.id === current ? 'selected' : ''}>${escapeHtml(candidate.title)}</option>`).join('')}</select></label>`; }).join('')}</fieldset>` : ''}
      <div class="inspector-actions"><button class="secondary-button" id="split-after" type="button">从此处拆组</button><button class="danger-text-button" id="remove-item" type="button">删除实例</button></div>
      <p class="scope-note">这里只调整组合方式。页面文字、HTML、CSS、图片和讲师备注仍在来源文件中维护。</p></section>`;
}

function renderInspector() {
    const target = $('#inspector-content');
    const item = selectedItem();
    const group = groupById(state.selectedGroupId);
    const reusable = selectedLibrary();
    if (!state.course) return void (target.innerHTML = '<div class="empty-state compact"><p>选择一门课程查看详情。</p></div>');
    if (state.inspector === 'diagnostics') return void (target.innerHTML = `<section class="inspector-section"><h3>配方诊断</h3>${diagnosticMarkup(state.draft?.diagnostics || state.course.validation.diagnostics)}</section>`);
    if (state.inspector === 'settings') {
        target.innerHTML = settingsMarkup(item, group); bindSettings(); return;
    }
    if (!item && reusable) {
        target.innerHTML = libraryMarkup(reusable);
        target.querySelector('[data-inspector-insert]')?.addEventListener('click', event => insertLibrary(event.currentTarget.dataset.inspectorInsert));
        return;
    }
    if (!item) return void (target.innerHTML = '<div class="empty-state compact"><p>选择一个内容实例查看页面、来源或设置。</p></div>');
    if (state.inspector === 'source') {
        const source = item.source;
        const chain = source?.exportPath?.length ? source.exportPath : [item.ref || item.title];
        target.innerHTML = `<section class="inspector-section"><h3>来源链</h3><ol class="source-chain">${chain.map(part => `<li>${escapeHtml(part)}</li>`).join('')}</ol></section>
          <section class="inspector-section"><h3>当前实例</h3><dl class="definition-list"><dt>修改范围</dt><dd>${item.contentMode === 'variant' ? '只改本课变体' : item.contentMode === 'local' ? '本课拥有的内容' : '使用锁定的共享源'}</dd><dt>更新策略</dt><dd>${item.updatePolicy === 'frozen' ? '固定当前版本' : '手动接受更新'}</dd><dt>解析版本</dt><dd>${escapeHtml(source?.version || '保存并同步后确定')}</dd><dt>页面选择</dt><dd>${item.selectedPages ? '显式选择' : '保留全部页面'}</dd><dt>局部操作</dt><dd>${item.operationCount}</dd></dl></section>`;
        return;
    }
    if (!item.pages.length) return void (target.innerHTML = '<div class="empty-state compact"><p>草稿内容尚无构建预览。保存后接受新的锁定计划，预览才会更新。</p></div>');
    const activePage = item.pages.find(page => page.index === state.selectedPage) || item.pages[0];
    state.selectedPage = activePage.index;
    const previewUrl = `/preview/${encodeURIComponent(state.course.name)}/${encodeURIComponent(state.course.recipeId)}/${activePage.index}?session=${encodeURIComponent(session)}`;
    target.innerHTML = `<iframe class="preview-frame" title="第 ${activePage.index} 页预览" sandbox src="${previewUrl}"></iframe>
      <div class="page-strip" aria-label="实例页面">${item.pages.map(page => `<button class="page-button ${page.index === activePage.index ? 'is-active' : ''}" data-page="${page.index}" type="button" aria-label="预览第 ${page.index} 页">${page.index}</button>`).join('')}</div>
      <section class="inspector-section"><h3>${escapeHtml(activePage.entityId)}</h3><dl class="definition-list"><dt>实例</dt><dd>${escapeHtml(item.id)}</dd><dt>内容模式</dt><dd>${escapeHtml(item.contentMode)}</dd><dt>当前页</dt><dd>${activePage.index}</dd></dl></section>`;
    target.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => { state.selectedPage = Number(button.dataset.page); renderInspector(); }));
}

function bindSettings() {
    const item = selectedItem();
    const group = groupById(state.selectedGroupId);
    $('#group-title-field')?.addEventListener('change', event => performOperation({ type: 'set_group', groupId: group.id, patch: { title: event.target.value } }));
    $('#group-minutes-field')?.addEventListener('change', event => performOperation({ type: 'set_group', groupId: group.id, patch: { plannedMinutes: numberValue(event.target.value) } }));
    $('#group-module-field')?.addEventListener('change', event => performOperation({ type: 'set_group', groupId: group.id, patch: { moduleNumber: event.target.value === '' ? '' : Number(event.target.value) } }));
    if (!item) return;
    $('#item-minutes-field')?.addEventListener('change', event => performOperation({ type: 'set_item', itemId: item.id, patch: { plannedMinutes: numberValue(event.target.value) } }));
    $('#item-policy-field')?.addEventListener('change', event => performOperation({ type: 'set_item', itemId: item.id, patch: { updatePolicy: event.target.value } }));
    document.querySelectorAll('[data-page-choice]').forEach(input => input.addEventListener('change', () => {
        const include = [...document.querySelectorAll('[data-page-choice]:checked')].map(field => field.dataset.pageChoice);
        performOperation({ type: 'set_page_plan', itemId: item.id, pagePlan: include });
    }));
    $('#all-pages')?.addEventListener('click', () => performOperation({ type: 'reset_pages', itemId: item.id }));
    document.querySelectorAll('[data-outcome]').forEach(input => input.addEventListener('change', () => {
        const mapping = {};
        document.querySelectorAll('[data-outcome]').forEach(field => {
            const values = field.value.split(',').map(value => value.trim()).filter(Boolean);
            if (values.length) mapping[field.dataset.outcome] = [...new Set(values)];
        });
        performOperation({ type: 'set_item', itemId: item.id, patch: { outcomeMap: Object.keys(mapping).length ? mapping : null } });
    }));
    document.querySelectorAll('[data-case-from]').forEach(select => select.addEventListener('change', () => performOperation(select.value
        ? { type: 'set_case_override', itemId: item.id, from: select.dataset.caseFrom, to: select.value }
        : { type: 'remove_case_override', itemId: item.id, from: select.dataset.caseFrom })));
    $('#split-after')?.addEventListener('click', () => splitAfter(item.id));
    $('#remove-item')?.addEventListener('click', () => itemAction(item.id, 'remove'));
}

const numberValue = value => value === '' ? null : Number(value);

function selectItem(id) {
    state.selectedItemId = id;
    const item = itemById(id);
    state.selectedGroupId = groups().find(group => group.items.some(candidate => candidate.id === id))?.id || null;
    state.selectedPage = item?.pages[0]?.index || null;
    renderCourse(); renderCatalog(); renderInspector();
}

async function performOperation(operation) {
    if (!state.draft) return;
    setWorkspaceStatus('正在更新草稿…');
    try {
        state.draft = await api(`/api/drafts/${encodeURIComponent(state.draft.id)}`, { method: 'PATCH', body: { operation } });
        renderCourse(); renderCatalog(); renderInspector();
        setWorkspaceStatus(`编辑中 · ${state.draft.revision} 步未保存`);
    } catch (error) {
        setWorkspaceStatus(`操作未应用：${error.value?.diagnostics?.[0]?.message || error.message}`, true);
    }
}

async function startDraft() {
    if (!state.course) return;
    if (state.course.kind === 'independent') {
        if (!window.confirm('将按现有模块和页面创建基线组合配方。原 slides HTML 不会被改写，之后可继续使用原独立课程文件。')) return;
        setWorkspaceStatus('正在建立稳定页面映射…');
        try {
            const result = await api(`/api/courses/${encodeURIComponent(state.course.name)}/composition`, { method: 'POST' });
            await refreshData(false);
            state.course = await api(`/api/courses/${encodeURIComponent(state.course.name)}?recipe=${encodeURIComponent(result.conversion.recipeId)}`);
            state.draft = result.draft;
            state.selectedGroupId = groups()[0]?.id || null;
            state.inspector = 'settings'; selectInspectorTab();
            renderCatalog(); renderCourse(); renderInspector();
            setWorkspaceStatus(`已创建基线配方 · ${result.conversion.groupCount} 个模块 · ${result.conversion.pageCount} 页`);
        } catch (error) {
            setWorkspaceStatus(`转换失败：${error.value?.diagnostics?.[0]?.message || error.message}`, true);
        }
        return;
    }
    setWorkspaceStatus('正在创建组合草稿…');
    try {
        state.draft = await api('/api/drafts', { method: 'POST', body: { courseName: state.course.name, recipeId: state.course.recipeId } });
        state.selectedGroupId = groups()[0]?.id || null;
        state.inspector = 'settings'; selectInspectorTab();
        renderCourse(); renderCatalog(); renderInspector();
        setWorkspaceStatus('编辑中 · 尚未修改');
    } catch (error) {
        setWorkspaceStatus(`无法开始编辑：${error.value?.diagnostics?.[0]?.message || error.message}`, true);
    }
}

async function pageAction(itemId, pageId, action) {
    const item = itemById(itemId);
    if (!state.draft || !item) return;
    const pageIds = item.pages.map(page => page.entityId);
    const index = pageIds.indexOf(pageId);
    if (index === -1) return;
    if (action === 'remove') {
        await performOperation({ type: 'set_page_plan', itemId, pagePlan: pageIds.filter(id => id !== pageId) });
    } else {
        await performOperation({ type: 'move_page', itemId, pageId, index: index + (action === 'up' ? -1 : 1), availablePages: pageIds });
    }
    const updated = itemById(itemId);
    state.selectedPage = updated?.pages[0]?.index || null;
    renderCourse(); renderInspector();
}

async function discardDraft(force = false) {
    if (!state.draft) return true;
    if (!force && state.draft.dirty && !window.confirm('放弃尚未保存的组合修改？')) return false;
    try { await api(`/api/drafts/${encodeURIComponent(state.draft.id)}`, { method: 'DELETE' }); } catch { /* Server shutdown also discards drafts. */ }
    state.draft = null; renderCourse(); renderCatalog(); renderInspector();
    return true;
}

async function saveDraft() {
    if (!state.draft?.dirty) return;
    setWorkspaceStatus('正在校验并原子保存…');
    try {
        const result = await api(`/api/drafts/${encodeURIComponent(state.draft.id)}/save`, { method: 'POST', body: { baselineHash: state.draft.baselineHash } });
        const draftId = state.draft.id;
        state.draft = null;
        await api(`/api/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' }).catch(() => null);
        await refreshData(false);
        await selectCourse(state.course.name, state.course.recipeId, true);
        setWorkspaceStatus(`已保存 · 旧版保存在 ${result.historyPath} · 待同步锁定`);
    } catch (error) {
        if (error.status === 409) setWorkspaceStatus('保存冲突：文件已被外部修改。草稿仍保留，请放弃后刷新再处理。', true);
        else setWorkspaceStatus(`保存失败：${error.value?.diagnostics?.[0]?.message || error.message}`, true);
    }
}

async function undoDraft() {
    if (!state.draft?.canUndo) return;
    try {
        state.draft = await api(`/api/drafts/${encodeURIComponent(state.draft.id)}/undo`, { method: 'POST' });
        renderCourse(); renderInspector();
        setWorkspaceStatus(state.draft.dirty ? `编辑中 · 已撤销至第 ${state.draft.revision} 步` : '编辑中 · 已回到磁盘版本');
    } catch (error) { setWorkspaceStatus(`撤销失败：${error.message}`, true); }
}

async function restorePrevious() {
    const previous = state.course?.history?.[0];
    if (!previous || state.draft) return;
    if (!window.confirm(`恢复最近保存的上一版配方？\n${previous.savedAt}\n当前版本也会先保存到历史记录。`)) return;
    setWorkspaceStatus('正在恢复上一版配方…');
    try {
        const result = await api(`/api/courses/${encodeURIComponent(state.course.name)}/history/${previous.id}/restore`, {
            method: 'POST', body: { currentHash: state.course.composeHash },
        });
        await refreshData(false);
        await selectCourse(state.course.name, state.course.recipeId, true);
        setWorkspaceStatus(`已恢复上一版 · 被替换版本保存在 ${result.recoveryPath} · 待同步锁定`);
    } catch (error) {
        if (error.status === 409) setWorkspaceStatus('恢复冲突：配方刚被外部修改，请刷新后重试。', true);
        else setWorkspaceStatus(`恢复失败：${error.value?.diagnostics?.[0]?.message || error.message}`, true);
    }
}

async function insertLibrary(id) {
    const item = state.library.find(entry => entry.id === id);
    const target = groupById(state.selectedGroupId) || groups()[0];
    if (!state.draft || !item || !['sequence', 'unit', 'page'].includes(item.kind)) return;
    if (item.kind === 'sequence') {
        const groupId = availableId(item.id.split(':').at(-1), new Set(groups().map(group => group.id)));
        await performOperation({ type: 'insert_sequence', ref: item.id, version: item.version, groupId, title: item.title });
        state.selectedGroupId = groupId; state.selectedItemId = null; state.inspector = 'settings'; selectInspectorTab();
        renderCourse(); renderInspector();
        return;
    }
    if (!target) return;
    const occurrenceId = availableId(item.id.split(':').at(-1));
    await performOperation({ type: 'insert_item', groupId: target.id, item: {
        id: occurrenceId, ref: item.id, contentMode: 'reference', updatePolicy: 'manual',
        ...(item.durationMinutes == null ? {} : { plannedMinutes: item.durationMinutes }),
    } });
    selectItem(occurrenceId);
}

async function replaceWithLibrary(id) {
    const item = selectedItem();
    const reusable = state.library.find(entry => entry.id === id);
    if (state.draft && item && reusable && ['unit', 'page'].includes(reusable.kind)) await performOperation({ type: 'replace_ref', itemId: item.id, ref: reusable.id });
}

async function itemAction(id, action) {
    const allGroups = groups();
    const group = allGroups.find(candidate => candidate.items.some(item => item.id === id));
    const index = group.items.findIndex(item => item.id === id);
    if (action === 'up' || action === 'down') await performOperation({ type: 'move_item', itemId: id, groupId: group.id, index: index + (action === 'up' ? -1 : 1) });
    else if (action === 'copy') {
        const newId = availableId(`${id}-copy`);
        await performOperation({ type: 'copy_item', itemId: id, newId, groupId: group.id, index: index + 1 }); selectItem(newId);
    } else if (action === 'remove') {
        await performOperation({ type: 'remove_item', itemId: id }); state.selectedItemId = null; renderCourse(); renderInspector();
    }
}

async function groupAction(id, action) {
    const allGroups = groups();
    const index = allGroups.findIndex(group => group.id === id);
    if (action === 'up' || action === 'down') await performOperation({ type: 'move_group', groupId: id, index: index + (action === 'up' ? -1 : 1) });
    else if (action === 'merge' && index > 0) {
        await performOperation({ type: 'merge_group', sourceGroupId: id, targetGroupId: allGroups[index - 1].id }); state.selectedGroupId = allGroups[index - 1].id;
    } else if (action === 'remove') {
        await performOperation({ type: 'remove_group', groupId: id }); state.selectedGroupId = groups()[0]?.id || null;
    }
}

async function addGroup() {
    const id = availableId('group', new Set(groups().map(group => group.id)));
    await performOperation({ type: 'add_group', group: { id, title: `新分组 ${groups().length + 1}`, items: [] } });
    state.selectedGroupId = id; state.selectedItemId = null; renderCourse(); renderInspector();
}

async function splitAfter(itemId) {
    const allGroups = groups();
    const group = allGroups.find(candidate => candidate.items.some(item => item.id === itemId));
    const itemIndex = group.items.findIndex(item => item.id === itemId);
    const id = availableId(`${group.id}-part`, new Set(allGroups.map(candidate => candidate.id)));
    await performOperation({ type: 'split_group', groupId: group.id, at: itemIndex + 1, group: { id, title: `${group.title}（续）`, items: [] } });
    state.selectedGroupId = id; state.selectedItemId = null; renderCourse(); renderInspector();
}

async function selectCourse(name, requestedRecipe, force = false) {
    if (!force && state.draft && (name !== state.course?.name || (requestedRecipe && requestedRecipe !== state.course?.recipeId))) {
        if (!await discardDraft()) return;
    }
    setWorkspaceStatus('正在读取课程…');
    try {
        state.course = await api(`/api/courses/${encodeURIComponent(name)}${requestedRecipe ? `?recipe=${encodeURIComponent(requestedRecipe)}` : ''}`);
        state.selectedItemId = null; state.selectedGroupId = state.course.recipe.groups[0]?.id || null; state.selectedPage = null;
        renderCatalog(); renderCourse(); renderInspector();
        setWorkspaceStatus(state.course.kind === 'independent' ? '独立课程 · 预览模式' : state.course.validation.valid ? '当前配方校验通过' : `${state.course.validation.summary.errors} 个错误待处理`);
    } catch (error) {
        setWorkspaceStatus(`读取失败：${error.message}`, true); state.course = null; $('#course-view').hidden = true;
        const empty = $('#course-empty'); empty.hidden = false; empty.querySelector('h2').textContent = '课程读取失败'; empty.querySelector('p').textContent = `请刷新后重试；错误信息：${error.message}`;
    }
}

async function refreshData(selectInitial = true) {
    const [workspace, library] = await Promise.all([api('/api/workspace'), api('/api/library')]);
    state.workspace = workspace; state.library = library.items; renderCatalog();
    if (selectInitial && !state.course) {
        const initial = workspace.courses.find(course => course.kind === 'composed') || workspace.courses.find(course => course.slideCount > 0) || workspace.courses[0];
        if (initial) await selectCourse(initial.name);
    }
}

async function loadWorkspace() {
    if (state.draft && !await discardDraft()) return;
    setWorkspaceStatus('正在读取工作区…');
    try {
        await refreshData(true);
        if (state.course) await selectCourse(state.course.name, state.course.recipeId, true);
        else setWorkspaceStatus(`${state.workspace.summary.courses} 门课 · ${state.workspace.summary.exports} 个公开内容`);
    } catch (error) { setWorkspaceStatus(`工作区读取失败：${error.message}`, true); }
}

$('#refresh').addEventListener('click', loadWorkspace);
$('#edit-course').addEventListener('click', startDraft);
$('#restore-edit').addEventListener('click', restorePrevious);
$('#undo-edit').addEventListener('click', undoDraft);
$('#discard-edit').addEventListener('click', () => discardDraft().then(discarded => discarded && setWorkspaceStatus('已放弃未保存修改')));
$('#save-edit').addEventListener('click', saveDraft);
$('#add-group').addEventListener('click', addGroup);
$('#recipe-title').addEventListener('change', event => performOperation({ type: 'set_recipe', patch: { title: event.target.value } }));
$('#recipe-duration').addEventListener('change', event => performOperation({ type: 'set_recipe', patch: { durationMinutes: numberValue(event.target.value) } }));
$('#recipe-profile').addEventListener('change', event => performOperation({ type: 'set_recipe', patch: { deliveryProfile: event.target.value } }));
$('#search').addEventListener('input', event => { state.query = event.target.value; renderCatalog(); });
$('#recipe-select').addEventListener('change', event => selectCourse(state.course.name, event.target.value));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
    state.view = button.dataset.view; document.querySelectorAll('[data-view]').forEach(tab => tab.classList.toggle('is-active', tab === button)); renderCatalog();
}));
document.querySelectorAll('[data-inspector]').forEach(button => button.addEventListener('click', () => {
    state.inspector = button.dataset.inspector; selectInspectorTab(); renderInspector();
}));
window.addEventListener('beforeunload', event => { if (state.draft?.dirty) { event.preventDefault(); event.returnValue = ''; } });

loadWorkspace();
