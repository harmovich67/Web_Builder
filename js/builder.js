/**
 * Fronty Page Builder — Parent Controller v3
 * New: Settings panel (CDN manager, Google Fonts, Custom CSS),
 *      Export HTML, extended prop fields, new section templates
 */
(function () {
    'use strict';

    // ── State ─────────────────────────────────────────────────
    const state = {
        selected: null,
        type: null,
        undoStack: [],
        redoStack: [],
        device: 'desktop',
        zoom: 1,
        grid: false,
        overlays: true,
        draggingType: null,
        sections: [],
        addSectionAfter: null,
        iframeReady: false,
        lastSnapshot: '',
        historyTimer: null,
        historyReady: false,
        restoringHistory: false,
        currentPage: 'index.html',
    };

    // ── Settings State ────────────────────────────────────────
    const settings = {
        cdns: JSON.parse(localStorage.getItem('fronty_builder_cdns') || '[]'),
        fonts: JSON.parse(localStorage.getItem('fronty_builder_fonts') || '[]'),
        customCss: localStorage.getItem('fronty_builder_custom_css') || '',
        customJs: localStorage.getItem('fronty_builder_custom_js') || '',
    };

    function saveSettings() {
        localStorage.setItem('fronty_builder_cdns', JSON.stringify(settings.cdns));
        localStorage.setItem('fronty_builder_fonts', JSON.stringify(settings.fonts));
        localStorage.setItem('fronty_builder_custom_css', settings.customCss);
        localStorage.setItem('fronty_builder_custom_js', settings.customJs);
    }

    const iframe = document.getElementById('builderIframe');
    const canvasFrame = document.getElementById('canvasFrame');
    const canvasWrapper = document.getElementById('canvasWrapper');
    const canvasArea = document.getElementById('canvasArea');

    // ── Inject script into iframe ─────────────────────────────
    iframe.addEventListener('load', () => {
        setTimeout(injectIntoIframe, 200);
    });

    function injectIntoIframe() {
        try {
            const iWin = iframe.contentWindow;
            const iDoc = iframe.contentDocument || iWin.document;

            // Remove old inject if present
            const old = iDoc.getElementById('builder-inject-script');
            if (old) old.remove();

            const script = iDoc.createElement('script');
            script.id = 'builder-inject-script';
            script.src = 'js/builder-inject.js?v=' + Date.now();
            script.onerror = () => {
                showToast('Loading Builder...', 'info');
            };
            iDoc.head.appendChild(script);
            setTimeout(fitIframeHeight, 800);
        } catch (e) {
            console.warn('Iframe injection error:', e);
            showToast('Enable server (PHP) to use builder', 'warning');
        }
    }

    function fitIframeHeight() {
        try {
            const h = iframe.contentDocument.body.scrollHeight;
            iframe.style.height = Math.max(h + 40, window.innerHeight - 60) + 'px';
        } catch {}
    }

    // ── Inject saved CDNs into iframe ─────────────────────────
    function injectSavedCdns() {
        settings.cdns.forEach(url => {
            sendToIframe('INJECT_CDNS', { urls: [url] });
        });
        settings.fonts.forEach(fontName => {
            const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@300;400;500;600;700;800&display=swap`;
            sendToIframe('INJECT_CDNS', { urls: [url] });
        });
        if (settings.customCss) {
            sendToIframe('INJECT_CUSTOM_CSS', { css: settings.customCss });
        }
        if (settings.customJs) {
            sendToIframe('INJECT_CUSTOM_JS', { js: settings.customJs });
        }
    }

    // ── postMessage from iframe ───────────────────────────────
    window.addEventListener('message', e => {
        if (!e.data || typeof e.data !== 'object') return;
        const { type, ...data } = e.data;

        switch (type) {
            case 'BUILDER_READY':
                state.iframeReady = true;
                state.sections = data.sections || [];
                renderSectionsPanel();
                fitIframeHeight();
                showToast('Builder ready ✅', 'success');
                setTimeout(() => {
                    injectSavedCdns();
                    captureInitialHistory();
                }, 300);
                sendToIframe('SET_OVERLAYS', { enabled: state.overlays });
                break;

            case 'HISTORY_RESTORED':
                state.sections = data.sections || [];
                state.restoringHistory = false;
                renderSectionsPanel();
                showNoSelection();
                hideFloatingToolbar();
                fitIframeHeight();
                setTimeout(injectSavedCdns, 100);
                break;

            case 'ELEMENT_SELECTED':
                state.selected = data;
                state.type = 'element';
                showElementProps(data);
                positionFloatingToolbar(data.rect);
                highlightSectionInPanel(data.sectionId);
                break;

            case 'SECTION_SELECTED':
                state.selected = data;
                state.type = 'section';
                showSectionProps(data);
                hideFloatingToolbar();
                highlightSectionInPanel(data.sectionId);
                break;

            case 'DESELECTED':
                state.selected = null; state.type = null;
                showNoSelection();
                hideFloatingToolbar();
                break;

            case 'INLINE_EDIT': {
                const tf = document.getElementById('prop_text');
                if (tf && tf !== document.activeElement) tf.value = data.text;
                break;
            }
            case 'INLINE_EDIT_DONE':
                scheduleHistoryCommit('INLINE_EDIT', 250);
                break;
            case 'ELEMENT_ADDED':
                pushUndo('ADD_ELEMENT');
                fitIframeHeight();
                break;

            case 'SECTION_ADDED':
            case 'SECTION_DELETED':
            case 'SECTION_MOVED':
                if (data.sections) state.sections = data.sections;
                renderSectionsPanel();
                fitIframeHeight();
                pushUndo(type);
                break;

            case 'REQUEST_ADD_SECTION':
                state.addSectionAfter = data.afterSectionId;
                openAddSectionModal();
                break;

            case 'SNAPSHOT':
                handleSnapshot(data);
                break;
        }
    });

    function sendToIframe(cmd, payload = {}) {
        if (!state.iframeReady && cmd !== 'GET_SNAPSHOT' && cmd !== 'GET_CLEAN_SNAPSHOT') return;
        iframe.contentWindow?.postMessage({ cmd, payload }, '*');
    }

    // ── Device Preview ────────────────────────────────────────
    document.querySelectorAll('.device-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.device-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.device = btn.dataset.device;
            canvasFrame.className = `canvas-frame ${state.device}`;
            setTimeout(fitIframeHeight, 450);
        });
    });

    const zoomLevels = [0.5, 0.75, 1, 1.25, 1.5];
    function setCanvasZoom(value) {
        const next = Number(value);
        state.zoom = zoomLevels.includes(next) ? next : 1;
        canvasFrame.style.setProperty('--canvas-zoom', state.zoom);
        canvasWrapper.style.setProperty('--canvas-zoom', state.zoom);
        document.getElementById('zoomSelect').value = String(state.zoom);
    }

    document.getElementById('zoomSelect')?.addEventListener('change', e => setCanvasZoom(e.target.value));
    document.getElementById('zoomOutBtn')?.addEventListener('click', () => {
        const idx = Math.max(0, zoomLevels.indexOf(state.zoom) - 1);
        setCanvasZoom(zoomLevels[idx]);
    });
    document.getElementById('zoomInBtn')?.addEventListener('click', () => {
        const idx = Math.min(zoomLevels.length - 1, zoomLevels.indexOf(state.zoom) + 1);
        setCanvasZoom(zoomLevels[idx]);
    });
    document.getElementById('gridToggleBtn')?.addEventListener('click', e => {
        state.grid = !state.grid;
        canvasArea.classList.toggle('grid-on', state.grid);
        e.currentTarget.classList.toggle('active', state.grid);
    });
    document.getElementById('outlineToggleBtn')?.addEventListener('click', e => {
        state.overlays = !state.overlays;
        e.currentTarget.classList.toggle('active', state.overlays);
        sendToIframe('SET_OVERLAYS', { enabled: state.overlays });
    });

    // ── Toolbar ───────────────────────────────────────────────
    document.getElementById('saveBtn').addEventListener('click', saveChanges);
    document.getElementById('previewBtn').addEventListener('click', () => window.open(state.currentPage || 'index.html', '_blank'));
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);
    document.getElementById('copyHtmlBtn')?.addEventListener('click', copyCleanHtml);
    document.getElementById('exportBtn').addEventListener('click', exportHtml);

    // ── Page Switching (edit existing page or start from scratch) ──
    const PAGE_LABELS = { 'index.html': 'Store Home', 'blank.html': 'Blank Page' };

    function loadPage(url) {
        const target = url || 'index.html';
        state.currentPage = target;

        // Reset builder state so the previous page's data doesn't linger
        state.selected = null;
        state.type = null;
        state.sections = [];
        state.undoStack = [];
        state.redoStack = [];
        state.iframeReady = false;
        state.lastSnapshot = '';
        state.historyReady = false;
        state.restoringHistory = false;
        state.draggingType = null;
        clearTimeout(state.historyTimer);

        updateUndoButtons();
        showNoSelection();
        hideFloatingToolbar();
        renderSectionsPanel();

        const label = document.getElementById('builderPageLabel');
        if (label) label.textContent = PAGE_LABELS[target] || target;
        const sel = document.getElementById('pageSelect');
        if (sel && sel.value !== target) sel.value = target;

        // Cache-bust so a blank page always opens fresh
        iframe.src = target + '?builder=1&t=' + Date.now();
    }

    function confirmDiscard(message) {
        // Only warn if there is something on the canvas worth keeping
        if (!state.sections.length) return true;
        return window.confirm(message);
    }

    document.getElementById('pageSelect')?.addEventListener('change', e => {
        const url = e.target.value;
        if (url === state.currentPage) return;
        if (!confirmDiscard('Switch page? Unsaved changes in the current canvas will be lost.')) {
            e.target.value = state.currentPage;
            return;
        }
        loadPage(url);
        showToast(`Loaded ${PAGE_LABELS[url] || url}`, 'info');
    });

    document.getElementById('newPageBtn')?.addEventListener('click', () => {
        if (!confirmDiscard('Start a new blank page? Unsaved changes will be lost.')) return;
        loadPage('blank.html');
        showToast('Fresh blank page ready — start adding sections ✨', 'success');
    });

    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
        if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveChanges(); }
    });

    // ── Panel Tabs ────────────────────────────────────────────
    document.querySelectorAll('.panel-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const panelName = tab.dataset.panel;
            document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.panel-content').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`panel-${panelName}`)?.classList.add('active');
            if (panelName === 'sections') renderSectionsPanel();
            if (panelName === 'history') renderHistoryPanel();
            if (panelName === 'settings') initSettingsPanel();
        });
    });

    // ── Element Library — Drag to Canvas ─────────────────────
    document.querySelectorAll('.el-card').forEach(card => {
        // Drag
        card.addEventListener('dragstart', e => {
            state.draggingType = card.dataset.type;
            e.dataTransfer.setData('builder-element-type', card.dataset.type);
            e.dataTransfer.effectAllowed = 'copy';
            card.classList.add('dragging-active');
            document.getElementById('globalDropHint').style.display = 'block';
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging-active');
            state.draggingType = null;
            document.getElementById('globalDropHint').style.display = 'none';
        });

        // Click to add to selected section (or last section)
        card.addEventListener('click', () => {
            const sectionId = state.selected?.sectionId || state.sections[state.sections.length - 1]?.id;
            if (!sectionId) {
                showToast('First add a section, then add elements', 'warning');
                return;
            }
            sendToIframe('ADD_ELEMENT', {
                type: card.dataset.type,
                sectionId,
                beforeElId: state.selected?.elId,
            });
            showToast(`Added ${card.querySelector('.el-card-name').textContent} ✅`, 'success');
        });
    });

    // Element search filter
    document.getElementById('elementSearch').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        document.querySelectorAll('.el-card').forEach(card => {
            const name = card.querySelector('.el-card-name').textContent.toLowerCase();
            card.style.display = name.includes(q) ? '' : 'none';
        });
        document.querySelectorAll('.element-group').forEach(g => {
            const visible = [...g.querySelectorAll('.el-card')].some(c => c.style.display !== 'none');
            g.style.display = visible ? '' : 'none';
        });
    });

    // ── Sections Panel ────────────────────────────────────────
    function renderSectionsPanel() {
        const list = document.getElementById('panelSectionsList');
        if (!state.sections.length) {
            list.innerHTML = '<div style="padding:1rem;text-align:center;color:#334155;font-size:0.78rem">No sections yet.<br>Add one below ↓</div>';
            return;
        }
        list.innerHTML = state.sections.map(sec => `
            <div class="panel-section-item ${state.selected?.sectionId === sec.id ? 'active' : ''}"
                 data-secid="${sec.id}" onclick="selectPanelSection('${sec.id}')">
                <span>📄</span>
                <span style="flex:1">${sec.label || sec.id}</span>
                <span style="font-size:0.65rem;color:${sec.visible===false ? '#ef4444' : '#10b981'}">${sec.visible===false ? '●' : '●'}</span>
            </div>
        `).join('');
    }

    function highlightSectionInPanel(secId) {
        document.querySelectorAll('.panel-section-item').forEach(item => {
            item.classList.toggle('active', item.dataset.secid === secId);
        });
    }

    window.selectPanelSection = function(id) {
        sendToIframe('SELECT_SECTION', { sectionId: id });
    };

    document.getElementById('addSectionFromPanel').addEventListener('click', () => {
        state.addSectionAfter = null;
        openAddSectionModal();
    });

    // ── Add Section Modal ─────────────────────────────────────
    const sectionTemplates = [
        { id: 'blank',        icon: '⬜', name: 'Blank',       desc: 'Empty — add your own elements' },
        { id: 'hero',         icon: '🦸', name: 'Hero',         desc: 'Big title + subtitle + button' },
        { id: 'features',     icon: '⭐', name: 'Features',     desc: '3-column feature cards' },
        { id: 'text',         icon: '¶',  name: 'Text',         desc: 'Heading + paragraph' },
        { id: 'cta',          icon: '📣', name: 'CTA',          desc: 'Call-to-action with button' },
        { id: 'two-col',      icon: '⬛⬛', name: '2 Columns',  desc: 'Two-column layout' },
        { id: 'image-text',   icon: '🖼️', name: 'Image + Text', desc: 'Image beside text block' },
        { id: 'faq',          icon: '❓', name: 'FAQ',          desc: 'Accordion Q&A' },
        { id: 'testimonial',  icon: '💬', name: 'Testimonials', desc: 'Customer reviews' },
        { id: 'stats',        icon: '📊', name: 'Stats',        desc: 'Big numbers row' },
        { id: 'pricing',      icon: '💳', name: 'Pricing',      desc: '3-tier pricing table' },
        { id: 'team',         icon: '👥', name: 'Team',         desc: 'Team member grid' },
        { id: 'newsletter',   icon: '📧', name: 'Newsletter',   desc: 'Email signup section' },
        { id: 'timeline',     icon: '📅', name: 'Timeline',     desc: 'Vertical timeline' },
        { id: 'gallery',      icon: '🖼️', name: 'Gallery',      desc: 'Image grid gallery' },
        { id: 'storefront',   icon: 'SF', name: 'Storefront',   desc: 'Hero, stats, product image' },
        { id: 'product-showcase', icon: 'PG', name: 'Product Grid', desc: 'Commerce product cards' },
        { id: 'trust',        icon: 'TR', name: 'Trust Strip',   desc: 'Guarantees and payment badges' },
        { id: 'logos',        icon: 'LC', name: 'Logo Cloud',    desc: 'Brand and partner logos' },
        { id: 'comparison',   icon: 'VS', name: 'Comparison',    desc: 'Feature comparison table' },
        { id: 'process',      icon: '1-3', name: 'Process',      desc: 'Step-by-step workflow' },
        { id: 'contact',      icon: 'CT', name: 'Contact',       desc: 'Contact form and details' },
        { id: 'icon-features', icon: '🎁', name: 'Icon Features', desc: 'Grid of icon feature boxes' },
        { id: 'counters',     icon: '🔢', name: 'Counters',      desc: 'Animated stat counters row' },
        { id: 'profiles',     icon: '👤', name: 'Profiles',      desc: 'Team profile cards' },
    ];

    function openAddSectionModal() {
        const grid = document.getElementById('sectionTemplatesGrid');
        grid.innerHTML = sectionTemplates.map(t => `
            <div class="section-template-card" onclick="addSection('${t.id}')">
                <div class="stc-icon">${t.icon}</div>
                <div class="stc-name">${t.name}</div>
                <div class="stc-desc">${t.desc}</div>
            </div>
        `).join('');
        document.getElementById('addSectionModal').classList.add('show');
    }

    window.closeAddSectionModal = function() {
        document.getElementById('addSectionModal').classList.remove('show');
    };

    window.addSection = function(template) {
        sendToIframe('ADD_SECTION', { template, afterSectionId: state.addSectionAfter });
        closeAddSectionModal();
        pushUndo('ADD_SECTION');
        showToast('Section added ✅', 'success');
    };

    // Backdrop close
    document.getElementById('addSectionModal').addEventListener('click', e => {
        if (e.target === document.getElementById('addSectionModal')) closeAddSectionModal();
    });

    // ── Floating Toolbar (element actions) ────────────────────
    const floatingToolbar = document.getElementById('floatingToolbar');

    function positionFloatingToolbar(rect) {
        if (!rect) return;
        const iframeRect = iframe.getBoundingClientRect();
        const canvasRect = document.getElementById('canvasArea').getBoundingClientRect();

        const top = iframeRect.top - canvasRect.top + rect.top - 46;
        const left = iframeRect.left - canvasRect.left + rect.left;

        floatingToolbar.style.display = 'flex';
        floatingToolbar.style.top = Math.max(2, top) + 'px';
        floatingToolbar.style.left = Math.max(2, left) + 'px';
    }

    function hideFloatingToolbar() { floatingToolbar.style.display = 'none'; }

    document.getElementById('ftMoveUp').addEventListener('click', () => {
        if (state.selected?.elId) { sendToIframe('MOVE_ELEMENT', { elId: state.selected.elId, direction: 'up' }); pushUndo('MOVE'); }
    });
    document.getElementById('ftMoveDown').addEventListener('click', () => {
        if (state.selected?.elId) { sendToIframe('MOVE_ELEMENT', { elId: state.selected.elId, direction: 'down' }); pushUndo('MOVE'); }
    });
    document.getElementById('ftDuplicate').addEventListener('click', () => {
        if (state.selected?.elId) { sendToIframe('DUPLICATE_ELEMENT', { elId: state.selected.elId }); pushUndo('DUPLICATE'); }
    });
    document.getElementById('ftDelete').addEventListener('click', () => {
        if (state.selected?.elId) {
            sendToIframe('DELETE_ELEMENT', { elId: state.selected.elId });
            showNoSelection(); hideFloatingToolbar(); pushUndo('DELETE');
        }
    });

    // ── Properties Panel ──────────────────────────────────────
    function showNoSelection() {
        document.getElementById('propNoSelection').style.display = 'flex';
        document.getElementById('propContent').style.display = 'none';
        document.getElementById('propSectionContent').style.display = 'none';
        document.getElementById('propPanelTitle').textContent = 'Properties';
        document.getElementById('propPanelSub').textContent = 'Click any element to edit';
    }

    function showElementProps(data) {
        document.getElementById('propNoSelection').style.display = 'none';
        document.getElementById('propSectionContent').style.display = 'none';
        document.getElementById('propContent').style.display = 'block';

        const { elType, tag, props } = data;
        document.getElementById('propPanelTitle').textContent = `${typeIcon(elType)} ${capitalize(elType)}`;
        document.getElementById('propPanelSub').textContent = `<${tag}> — click to select, double-click to type`;

        const fields = document.getElementById('propFields');
        fields.innerHTML = buildPropFields(elType, props, data.elId);
        bindPropEvents(data.elId);
    }

    function showSectionProps(data) {
        document.getElementById('propNoSelection').style.display = 'none';
        document.getElementById('propContent').style.display = 'none';
        document.getElementById('propSectionContent').style.display = 'block';

        document.getElementById('propPanelTitle').textContent = '📄 Section';
        document.getElementById('propPanelSub').textContent = data.sectionId;
        document.getElementById('propSectionName').textContent = data.sectionId;

        const p = data.props;
        document.getElementById('propSecBgText').value = p.bg || '';
        document.getElementById('propSecPadTop').value = p.paddingTop || '';
        document.getElementById('propSecPadBot').value = p.paddingBottom || '';
        document.getElementById('propSecPadLeft').value = p.paddingLeft || '';
        document.getElementById('propSecPadRight').value = p.paddingRight || '';
        document.getElementById('propSecMinH').value = p.minHeight || '';
        document.getElementById('propSecBgImg').value = p.bgImage || '';
        document.getElementById('propSecBgSize').value = p.bgSize || 'cover';
        document.getElementById('propSecBgPos').value = p.bgPos || 'center';
        document.getElementById('propSecVisible').checked = p.visible !== false;
        document.getElementById('propSecId').value = p.id || '';

        try { document.getElementById('propSecBg').value = p.bg || '#0a0e1a'; } catch {}

        ['propSecBg','propSecBgText','propSecPadTop','propSecPadBot',
         'propSecPadLeft','propSecPadRight','propSecMinH',
         'propSecBgImg','propSecBgSize','propSecBgPos'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.oninput = applySection;
        });
        document.getElementById('propSecVisible').onchange = applySection;
        document.getElementById('propSecId').oninput = applySection;
    }

    function applySection() {
        if (!state.selected?.sectionId) return;
        sendToIframe('UPDATE_SECTION', {
            sectionId: state.selected.sectionId,
            bg: document.getElementById('propSecBgText').value || document.getElementById('propSecBg').value,
            paddingTop: document.getElementById('propSecPadTop').value,
            paddingBottom: document.getElementById('propSecPadBot').value,
            paddingLeft: document.getElementById('propSecPadLeft').value,
            paddingRight: document.getElementById('propSecPadRight').value,
            minHeight: document.getElementById('propSecMinH').value,
            bgImage: document.getElementById('propSecBgImg').value,
            bgSize: document.getElementById('propSecBgSize').value,
            bgPos: document.getElementById('propSecBgPos').value,
            visible: document.getElementById('propSecVisible').checked,
            id: document.getElementById('propSecId').value,
        });
        scheduleHistoryCommit('EDIT_SECTION');
    }

    document.getElementById('propSecMoveUp').addEventListener('click', () => {
        if (state.selected?.sectionId) sendToIframe('MOVE_SECTION', { sectionId: state.selected.sectionId, direction: 'up' });
    });
    document.getElementById('propSecMoveDown').addEventListener('click', () => {
        if (state.selected?.sectionId) sendToIframe('MOVE_SECTION', { sectionId: state.selected.sectionId, direction: 'down' });
    });
    document.getElementById('propSecDelete').addEventListener('click', () => {
        if (state.selected?.sectionId) {
            sendToIframe('DELETE_SECTION', { sectionId: state.selected.sectionId });
            showNoSelection(); pushUndo('DELETE_SECTION');
        }
    });

    // ── Properties Fields ─────────────────────────────────────
    function buildPropFields(type, props, elId) {
        const textTypes = ['heading','text','button','badge','link'];
        const isText = textTypes.includes(type);
        const isBtnLink = type === 'button' || type === 'link';
        const isImage = type === 'image';
        const isVideo = type === 'video';
        const isJsCode = type === 'js-code';
        const isSlider = type === 'slider';
        const isFullBanner = type === 'full-banner';

        let html = '';

        // ── Quick-add strip ───────────────────────────────────
        html += `<div class="quick-add-strip">
            <div class="qas-label">Add below ↓</div>
            <div class="qas-btns">
                ${['heading','text','button','image','divider'].map(t => `
                    <button class="qas-btn" onclick="addElBelow('${t}','${elId}')" title="${capitalize(t)}">
                        ${typeIcon(t)} <span>${capitalize(t)}</span>
                    </button>`).join('')}
            </div>
        </div>`;

        // ── Text ──────────────────────────────────────────────
        if (isText) {
            html += propGroup('✏️ Text Content',
                `<textarea class="prop-input" id="prop_text" rows="3">${escHtml(props.text||'')}</textarea>`);
        }
        if (isBtnLink) {
            html += propGroup('🔗 Link / URL',
                `<input type="url" class="prop-input" id="prop_href" value="${escHtml(props.href||'')}" placeholder="https://">`);
        }
        if (isImage) {
            html += propGroup('🖼️ Image URL',
                `<input class="prop-input" id="prop_src" value="${escHtml(props.src||'')}" placeholder="https://...">
                <div style="display:flex;gap:0.4rem;margin-top:0.35rem">
                    <button class="prop-upload-btn" onclick="triggerImgUpload('prop_src')" style="flex:1;padding:0.45rem 0.75rem;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:0.5rem;color:#a5b4fc;font-size:0.75rem;font-weight:700;cursor:pointer">📁 Upload from device</button>
                </div>
                <div style="font-size:0.7rem;color:#475569;margin-top:0.25rem">Paste a URL or upload from your device</div>`);
            html += propGroup('Alt Text',
                `<input class="prop-input" id="prop_alt" value="${escHtml(props.alt||'')}">`);
            html += propGroup('Object Fit',
                `<select class="prop-input" id="prop_objectFit">
                    ${['cover','contain','fill','none','scale-down'].map(v =>
                        `<option value="${v}" ${(props.objectFit||'cover')===v?'selected':''}>${v}</option>`
                    ).join('')}
                </select>`);
        }
        if (isVideo) {
            html += propGroup('▶️ Video URL (YouTube/Vimeo)',
                `<input class="prop-input" id="prop_video_url" value="${escHtml(props.videoUrl||'')}" placeholder="https://youtube.com/...">`);
        }
        if (isJsCode) {
            html += propGroup('JavaScript Code',
                `<textarea class="prop-input" id="prop_customJs" rows="9" spellcheck="false" style="font-family:'Fira Code','Courier New',monospace;font-size:0.74rem;line-height:1.55;color:#fde68a">${escHtml(props.customJs||'')}</textarea>
                <div style="font-size:0.7rem;color:#475569;margin-top:0.25rem">This block is exported as a script tag in clean HTML.</div>`);
        }
        if (isSlider) {
            html += `<div class="prop-section-divider">🎞️ Slider Settings</div>`;
            html += propGroup(`Slide Height — <span id="prop_sliderHeight_val">${props.sliderHeight||320}px</span>`,
                `<input type="range" class="prop-range" id="prop_sliderHeight" min="150" max="800" value="${props.sliderHeight||320}">`);
            html += propGroup('Number of Slides',
                `<select class="prop-input" id="prop_sliderCount">
                    ${[1,2,3,4,5,6,7,8].map(n =>
                        `<option value="${n}" ${(props.sliderCount||3)==n?'selected':''}>${n} slides</option>`
                    ).join('')}
                </select>`);
            html += propGroup('Autoplay (seconds, 0 = off)',
                `<select class="prop-input" id="prop_sliderAutoplay">
                    ${[[0,'Off'],[2,'2s'],[3,'3s'],[4,'4s'],[5,'5s'],[7,'7s'],[10,'10s']].map(([v,l]) =>
                        `<option value="${v}" ${(props.sliderAutoplay||0)==v?'selected':''}>${l}</option>`
                    ).join('')}
                </select>`);
            html += `<div class="prop-section-divider">🖼️ Slide Images</div>`;
            const slideCount = props.sliderCount || 3;
            html += propGroup('Slide Background Size',
                `<select class="prop-input" id="prop_slideBgSize">
                    ${['cover', 'contain', 'auto', '100% 100%'].map(v =>
                        `<option value="${v}" ${(props.slideBgSize||'cover')===v?'selected':''}>${v}</option>`
                    ).join('')}
                </select>`);
            for (let i = 0; i < slideCount; i++) {
                html += propGroup(`Slide ${i+1} Image`,
                    `<input class="prop-input" id="prop_slide_img_${i}" value="" placeholder="https://... or upload">
                    <button class="prop-upload-btn" onclick="triggerSlideUpload(${i})" style="margin-top:0.35rem;width:100%;padding:0.45rem 0.75rem;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:0.5rem;color:#a5b4fc;font-size:0.75rem;font-weight:700;cursor:pointer">📁 Upload Slide ${i+1} Image</button>`);
            }
        }
        if (isFullBanner) {
            html += `<div class="prop-section-divider">🖼 Banner Settings</div>`;
            html += propGroup('Background Image URL',
                `<input class="prop-input" id="prop_src" value="${escHtml(props.src||'')}" placeholder="https://...">
                <div style="display:flex;gap:0.4rem;margin-top:0.35rem">
                    <button class="prop-upload-btn" onclick="triggerImgUpload('prop_src')" style="flex:1;padding:0.45rem 0.75rem;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:0.5rem;color:#a5b4fc;font-size:0.75rem;font-weight:700;cursor:pointer">📁 Upload Image</button>
                </div>`);
            html += propGroup('Overlay Color',
                `<div class="prop-color-row">
                    <input type="color" class="prop-color-input" id="prop_bannerOverlayColor" value="#000000">
                    <input class="prop-input" id="prop_bannerOverlay" value="${escHtml(props.bannerOverlay||'rgba(0,0,0,0.45)')}" placeholder="rgba(0,0,0,0.45)">
                </div>
                <div style="font-size:0.7rem;color:#475569;margin-top:0.25rem">Use rgba() for transparency</div>`);
            html += propGroup('Min Height',
                `<input class="prop-input" id="prop_minHeight" value="${escHtml(props.minHeight||'400px')}" placeholder="e.g. 400px or 60vh">`);
        }
        if (type === 'icon') {
            const emojis = ['⭐','🔥','✨','💡','🚀','🎯','💎','🔑','🌟','💪','❤️','⚡','🎉','📌','🔔','👑','🌈','🔒','✅','💰','📱','🌍','🔗','🏆','⚙️','📊','🎨','🛡️','💬','🤝','📢','🌿'];
            html += propGroup('⭐ Pick Emoji / Icon',
                `<div class="icon-picker-grid">${emojis.map(e => `<button class="icon-pick-btn" onclick="pickIcon('${e}')">${e}</button>`).join('')}</div>
                <div style="font-size:0.7rem;color:#475569;margin-top:0.35rem">Or type Font Awesome class below</div>`);
            html += propGroup('Icon Class (Font Awesome / Bootstrap)',
                `<input class="prop-input" id="prop_iconClass" value="${escHtml(props.iconClass||'')}" placeholder="fas fa-star  or  bi bi-star">
                <div style="font-size:0.7rem;color:#475569;margin-top:0.25rem">Requires FA or BI CDN loaded in Settings tab</div>`);
        }
        if (type === 'stat-counter') {
            html += `<div class="prop-section-divider">🔢 Counter Settings</div>`;
            html += propGroup('Count To (number)',
                `<input type="number" class="prop-input" id="prop_counterTo" value="${escHtml(String(props.counterTo ?? 1250))}" min="0" placeholder="e.g. 1250">`);
            html += propGroup('Prefix / Suffix',
                `<div style="display:flex;gap:0.4rem">
                    <input class="prop-input" id="prop_counterPrefix" value="${escHtml(props.counterPrefix||'')}" placeholder="$" style="flex:1">
                    <input class="prop-input" id="prop_counterSuffix" value="${escHtml(props.counterSuffix||'')}" placeholder="+ or %" style="flex:1">
                </div>
                <div style="font-size:0.7rem;color:#475569;margin-top:0.25rem">Animation replays as you type</div>`);
        }

        html += `<div class="prop-section-divider">Advanced</div>`;
        html += propGroup('HTML ID',
            `<input class="prop-input" id="prop_htmlId" value="${escHtml(props.htmlId||'')}" placeholder="e.g. hero-title">`);
        html += propGroup('CSS Classes',
            `<input class="prop-input" id="prop_cssClass" value="${escHtml(props.cssClass||'')}" placeholder="custom-class another-class">`);

        // ── Typography ────────────────────────────────────────
        if (isText) {
            html += `<div class="prop-section-divider">🔤 Typography</div>`;
            html += propGroup('Color',
                `<div class="prop-color-row">
                    <input type="color" class="prop-color-input" id="prop_color" value="${safeColor(props.color)}">
                    <input class="prop-input" id="prop_color_text" value="${escHtml(props.color||'')}" placeholder="#fff or rgba()">
                </div>`);
            html += propGroup(`Font Size — <span id="prop_fontSize_val">${props.fontSize||16}px</span>`,
                `<input type="range" class="prop-range" id="prop_fontSize" min="10" max="120" value="${props.fontSize||16}">`);
            html += propGroup('Font Weight',
                `<select class="prop-input" id="prop_fontWeight">
                    ${['300 Light','400 Normal','500 Medium','600 SemiBold','700 Bold','800 ExtraBold','900 Black'].map(w => {
                        const val = w.split(' ')[0];
                        return `<option value="${val}" ${String(props.fontWeight)===val?'selected':''}>${w}</option>`;
                    }).join('')}
                </select>`);
            html += propGroup(`Line Height — <span id="prop_lineHeight_val">${props.lineHeight||1.6}</span>`,
                `<input type="range" class="prop-range" id="prop_lineHeight" min="1" max="3" step="0.1" value="${props.lineHeight||1.6}">`);
            html += propGroup(`Letter Spacing — <span id="prop_letterSpacing_val">${props.letterSpacing||0}px</span>`,
                `<input type="range" class="prop-range" id="prop_letterSpacing" min="-2" max="10" step="0.5" value="${props.letterSpacing||0}">`);
            html += propGroup('Text Transform',
                `<div class="prop-text-transform-btns">
                    <button class="prop-tt-btn ${(props.textTransform||'none')==='uppercase'?'active':''}" data-tt="uppercase" title="Uppercase">AA</button>
                    <button class="prop-tt-btn ${(props.textTransform||'none')==='lowercase'?'active':''}" data-tt="lowercase" title="Lowercase">aa</button>
                    <button class="prop-tt-btn ${(props.textTransform||'none')==='capitalize'?'active':''}" data-tt="capitalize" title="Capitalize">Aa</button>
                    <button class="prop-tt-btn ${(props.textTransform||'none')==='none'?'active':''}" data-tt="none" title="None">—</button>
                </div>`);
            html += propGroup('Style',
                `<div style="display:flex;gap:0.4rem">
                    <button class="prop-style-toggle ${props.fontStyle==='italic'?'active':''}" id="prop_italic" title="Italic"><em>I</em></button>
                    <button class="prop-style-toggle ${props.textDecoration==='underline'?'active':''}" id="prop_underline" title="Underline"><u>U</u></button>
                </div>`);
            html += propGroup('Align',
                `<div class="prop-font-align">
                    <button class="prop-align-btn ${props.textAlign==='left'?'active':''}" data-align="left">⬅ Left</button>
                    <button class="prop-align-btn ${props.textAlign==='center'?'active':''}" data-align="center">↔ Center</button>
                    <button class="prop-align-btn ${props.textAlign==='right'?'active':''}" data-align="right">Right ➡</button>
                </div>`);
        }

        // ── Box Styles ────────────────────────────────────────
        html += `<div class="prop-section-divider">🎨 Box Styles</div>`;
        html += propGroup('Background',
            `<div class="prop-color-row">
                <input type="color" class="prop-color-input" id="prop_bg" value="${safeColor(props.background)}">
                <input class="prop-input" id="prop_bg_text" value="${escHtml(props.background||'')}" placeholder="transparent or CSS gradient">
            </div>`);
        html += propGroup(`Border Radius — <span id="prop_borderRadius_val">${parseInt(props.borderRadius)||0}px</span>`,
            `<input type="range" class="prop-range" id="prop_borderRadius" min="0" max="50" value="${parseInt(props.borderRadius)||0}">`);
        html += propGroup('Padding',
            `<input class="prop-input" id="prop_padding" value="${escHtml(props.padding||'')}" placeholder="e.g. 1rem  or  0.5rem 1.5rem">`);
        html += propGroup('Margin',
            `<input class="prop-input" id="prop_margin" value="${escHtml(props.margin||'')}" placeholder="e.g. 0.5rem 0">`);

        // ── Border ────────────────────────────────────────────
        html += `<div class="prop-section-divider">🔲 Border</div>`;
        html += propGroup('Border Style',
            `<select class="prop-input" id="prop_borderStyle">
                ${['none','solid','dashed','dotted','double'].map(v =>
                    `<option value="${v}" ${(props.borderStyle||'none')===v?'selected':''}>${v}</option>`
                ).join('')}
            </select>`);
        html += propGroup(`Border Width — <span id="prop_borderWidth_val">${parseInt(props.borderWidth)||0}px</span>`,
            `<input type="range" class="prop-range" id="prop_borderWidth" min="0" max="10" value="${parseInt(props.borderWidth)||0}">`);
        html += propGroup('Border Color',
            `<div class="prop-color-row">
                <input type="color" class="prop-color-input" id="prop_borderColor" value="${safeColor(props.borderColor||'#6366f1')}">
                <input class="prop-input" id="prop_borderColor_text" value="${escHtml(props.borderColor||'')}" placeholder="#6366f1">
            </div>`);

        // ── Shadow ────────────────────────────────────────────
        html += propGroup('Box Shadow',
            `<select class="prop-input" id="prop_boxShadow">
                <option value="" ${!props.boxShadow?'selected':''}>None</option>
                <option value="0 2px 8px rgba(0,0,0,0.12)" ${props.boxShadow==='0 2px 8px rgba(0,0,0,0.12)'?'selected':''}>Small</option>
                <option value="0 8px 24px rgba(0,0,0,0.2)" ${props.boxShadow==='0 8px 24px rgba(0,0,0,0.2)'?'selected':''}>Medium</option>
                <option value="0 20px 60px rgba(0,0,0,0.35)" ${props.boxShadow==='0 20px 60px rgba(0,0,0,0.35)'?'selected':''}>Large</option>
                <option value="0 0 0 3px rgba(99,102,241,0.4)" ${props.boxShadow==='0 0 0 3px rgba(99,102,241,0.4)'?'selected':''}>Glow Purple</option>
                <option value="0 0 0 3px rgba(16,185,129,0.4)" ${props.boxShadow==='0 0 0 3px rgba(16,185,129,0.4)'?'selected':''}>Glow Green</option>
                <option value="inset 0 2px 8px rgba(0,0,0,0.25)" ${props.boxShadow==='inset 0 2px 8px rgba(0,0,0,0.25)'?'selected':''}>Inset</option>
            </select>`);

        // ── Opacity ───────────────────────────────────────────
        html += propGroup(`Opacity — <span id="prop_opacity_val">${props.opacity!==undefined?Math.round(props.opacity*100):100}%</span>`,
            `<input type="range" class="prop-range" id="prop_opacity" min="0" max="100" value="${props.opacity!==undefined?Math.round(props.opacity*100):100}">`);

        // ── Width / Size ──────────────────────────────────────
        html += `<div class="prop-section-divider">📐 Size</div>`;
        html += propGroup(`Width — <span id="prop_width_val">${parseInt(props.width)||100}%</span>`,
            `<input type="range" class="prop-range" id="prop_width" min="10" max="100" value="${parseInt(props.width)||100}">`);
        html += propGroup('Max Width',
            `<input class="prop-input" id="prop_maxWidth" value="${escHtml(props.maxWidth||'')}" placeholder="e.g. 800px or 100%">`);
        html += propGroup('Min Height',
            `<input class="prop-input" id="prop_minHeight" value="${escHtml(props.minHeight||'')}" placeholder="e.g. 200px">`);

        html += `<div class="prop-section-divider">Layout</div>`;
        html += propGroup('Display',
            `<select class="prop-input" id="prop_display">
                ${['block','inline','inline-block','flex','inline-flex','grid'].map(v =>
                    `<option value="${v}" ${(props.display||'block')===v?'selected':''}>${v}</option>`
                ).join('')}
            </select>`);
        html += propGroup('Flex Direction',
            `<select class="prop-input" id="prop_flexDirection">
                ${['row','column','row-reverse','column-reverse'].map(v =>
                    `<option value="${v}" ${(props.flexDirection||'row')===v?'selected':''}>${v}</option>`
                ).join('')}
            </select>`);
        html += propGroup('Justify / Align',
            `<div style="display:flex;gap:0.5rem">
                <select class="prop-input" id="prop_justifyContent">
                    ${['normal','flex-start','center','flex-end','space-between','space-around','space-evenly'].map(v =>
                        `<option value="${v}" ${(props.justifyContent||'flex-start')===v?'selected':''}>${v}</option>`
                    ).join('')}
                </select>
                <select class="prop-input" id="prop_alignItems">
                    ${['normal','stretch','flex-start','center','flex-end','baseline'].map(v =>
                        `<option value="${v}" ${(props.alignItems||'stretch')===v?'selected':''}>${v}</option>`
                    ).join('')}
                </select>
            </div>`);
        html += propGroup('Gap',
            `<input class="prop-input" id="prop_gap" value="${escHtml(props.gap||'')}" placeholder="e.g. 1rem">`);

        return html;
    }

    function propGroup(label, content) {
        return `<div class="prop-group"><label class="prop-label">${label}</label>${content}</div>`;
    }

    function bindPropEvents(elId) {
        const getPayload = () => {
            const p = { elId };
            const v = id => document.getElementById(id)?.value;
            const c = id => document.getElementById(id)?.checked;

            if (v('prop_text') !== undefined) p.text = v('prop_text');
            if (v('prop_htmlId') !== undefined) p.htmlId = v('prop_htmlId');
            if (v('prop_cssClass') !== undefined) p.cssClass = v('prop_cssClass');
            if (v('prop_customJs') !== undefined) p.customJs = v('prop_customJs');
            if (v('prop_href') !== undefined) p.href = v('prop_href');
            if (v('prop_src') !== undefined) p.src = v('prop_src');
            if (v('prop_alt') !== undefined) p.alt = v('prop_alt');
            if (v('prop_objectFit') !== undefined) p.objectFit = v('prop_objectFit');
            if (v('prop_video_url') !== undefined) p.videoUrl = v('prop_video_url');
            if (v('prop_color_text') !== undefined) p.color = v('prop_color_text');
            if (v('prop_fontSize')) { p.fontSize = parseInt(v('prop_fontSize')); document.getElementById('prop_fontSize_val').textContent = p.fontSize + 'px'; }
            if (v('prop_fontWeight')) p.fontWeight = v('prop_fontWeight');
            if (v('prop_lineHeight')) { p.lineHeight = parseFloat(v('prop_lineHeight')); const el = document.getElementById('prop_lineHeight_val'); if (el) el.textContent = p.lineHeight; }
            if (v('prop_letterSpacing')) { p.letterSpacing = parseFloat(v('prop_letterSpacing')); const el = document.getElementById('prop_letterSpacing_val'); if (el) el.textContent = p.letterSpacing + 'px'; }
            if (v('prop_bg_text') !== undefined) p.background = v('prop_bg_text');
            if (v('prop_borderRadius') !== undefined) { p.borderRadius = parseInt(v('prop_borderRadius')); document.getElementById('prop_borderRadius_val').textContent = p.borderRadius + 'px'; }
            if (v('prop_padding') !== undefined) p.padding = v('prop_padding');
            if (v('prop_margin') !== undefined) p.margin = v('prop_margin');
            if (v('prop_borderStyle') !== undefined) p.borderStyle = v('prop_borderStyle');
            if (v('prop_borderWidth') !== undefined) { p.borderWidth = parseInt(v('prop_borderWidth')); const el = document.getElementById('prop_borderWidth_val'); if (el) el.textContent = p.borderWidth + 'px'; }
            if (v('prop_borderColor_text') !== undefined) p.borderColor = v('prop_borderColor_text');
            if (v('prop_boxShadow') !== undefined) p.boxShadow = v('prop_boxShadow');
            if (v('prop_opacity') !== undefined) { p.opacity = parseInt(v('prop_opacity')) / 100; const el = document.getElementById('prop_opacity_val'); if (el) el.textContent = Math.round(p.opacity * 100) + '%'; }
            if (v('prop_width')) { p.width = parseInt(v('prop_width')); document.getElementById('prop_width_val').textContent = p.width + '%'; }
            if (v('prop_maxWidth') !== undefined) p.maxWidth = v('prop_maxWidth');
            if (v('prop_minHeight') !== undefined) p.minHeight = v('prop_minHeight');
            if (v('prop_iconClass') !== undefined) p.iconClass = v('prop_iconClass');
            if (v('prop_display') !== undefined) p.display = v('prop_display');
            if (v('prop_flexDirection') !== undefined) p.flexDirection = v('prop_flexDirection');
            if (v('prop_justifyContent') !== undefined) p.justifyContent = v('prop_justifyContent');
            if (v('prop_alignItems') !== undefined) p.alignItems = v('prop_alignItems');
            if (v('prop_gap') !== undefined) p.gap = v('prop_gap');
            // Slider props
            if (v('prop_sliderHeight')) { p.sliderHeight = parseInt(v('prop_sliderHeight')); const el = document.getElementById('prop_sliderHeight_val'); if (el) el.textContent = p.sliderHeight + 'px'; }
            if (v('prop_sliderCount') !== undefined) p.sliderCount = parseInt(v('prop_sliderCount'));
            if (v('prop_sliderAutoplay') !== undefined) p.sliderAutoplay = parseInt(v('prop_sliderAutoplay'));
            if (v('prop_slideBgSize') !== undefined) p.slideBgSize = v('prop_slideBgSize');
            // Full-banner props
            if (v('prop_bannerOverlay') !== undefined) p.bannerOverlay = v('prop_bannerOverlay');
            // Stat-counter props
            if (v('prop_counterTo') !== undefined) p.counterTo = v('prop_counterTo');
            if (v('prop_counterSuffix') !== undefined) p.counterSuffix = v('prop_counterSuffix');
            if (v('prop_counterPrefix') !== undefined) p.counterPrefix = v('prop_counterPrefix');
            return p;
        };

        document.querySelectorAll('#propFields .prop-input, #propFields .prop-range').forEach(input => {
            input.addEventListener('input', () => {
                sendToIframe('UPDATE_ELEMENT', getPayload());
                scheduleHistoryCommit('EDIT_ELEMENT');
            });
        });

        // Colour picker sync
        [['prop_color','prop_color_text'], ['prop_bg','prop_bg_text'], ['prop_borderColor','prop_borderColor_text']].forEach(([picker, text]) => {
            const p = document.getElementById(picker);
            const t = document.getElementById(text);
            if (p && t) {
                p.addEventListener('input', () => { t.value = p.value; sendToIframe('UPDATE_ELEMENT', getPayload()); scheduleHistoryCommit('EDIT_ELEMENT'); });
                t.addEventListener('input', () => { try { p.value = t.value; } catch {} sendToIframe('UPDATE_ELEMENT', getPayload()); scheduleHistoryCommit('EDIT_ELEMENT'); });
            }
        });

        // Banner overlay color picker sync
        const bannerOverlayPicker = document.getElementById('prop_bannerOverlayColor');
        const bannerOverlayText = document.getElementById('prop_bannerOverlay');
        if (bannerOverlayPicker && bannerOverlayText) {
            bannerOverlayPicker.addEventListener('input', () => {
                bannerOverlayText.value = bannerOverlayPicker.value;
                if (state.selected?.elId) sendToIframe('UPDATE_ELEMENT', { elId: state.selected.elId, bannerOverlay: bannerOverlayPicker.value });
                scheduleHistoryCommit('EDIT_ELEMENT');
            });
            bannerOverlayText.addEventListener('input', () => {
                if (state.selected?.elId) sendToIframe('UPDATE_ELEMENT', { elId: state.selected.elId, bannerOverlay: bannerOverlayText.value });
                scheduleHistoryCommit('EDIT_ELEMENT');
            });
        }

        // Slide image URL inputs
        document.querySelectorAll('#propFields [id^="prop_slide_img_"]').forEach(input => {
            input.addEventListener('input', () => {
                const idx = parseInt(input.id.replace('prop_slide_img_', ''));
                if (state.selected?.elId) sendToIframe('UPDATE_ELEMENT', { elId: state.selected.elId, slideImgIdx: idx, slideImgUrl: input.value });
                scheduleHistoryCommit('EDIT_ELEMENT');
            });
        });

        // Align buttons
        document.querySelectorAll('.prop-align-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.prop-align-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (state.selected?.elId) sendToIframe('UPDATE_ELEMENT', { elId: state.selected.elId, textAlign: btn.dataset.align });
                scheduleHistoryCommit('EDIT_ELEMENT');
            });
        });

        // Text transform buttons
        document.querySelectorAll('.prop-tt-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.prop-tt-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (state.selected?.elId) sendToIframe('UPDATE_ELEMENT', { elId: state.selected.elId, textTransform: btn.dataset.tt });
                scheduleHistoryCommit('EDIT_ELEMENT');
            });
        });

        // Italic toggle
        const italicBtn = document.getElementById('prop_italic');
        if (italicBtn) {
            italicBtn.addEventListener('click', () => {
                italicBtn.classList.toggle('active');
                if (state.selected?.elId) sendToIframe('UPDATE_ELEMENT', { elId: state.selected.elId, fontStyle: italicBtn.classList.contains('active') ? 'italic' : 'normal' });
                scheduleHistoryCommit('EDIT_ELEMENT');
            });
        }

        // Underline toggle
        const underlineBtn = document.getElementById('prop_underline');
        if (underlineBtn) {
            underlineBtn.addEventListener('click', () => {
                underlineBtn.classList.toggle('active');
                if (state.selected?.elId) sendToIframe('UPDATE_ELEMENT', { elId: state.selected.elId, textDecoration: underlineBtn.classList.contains('active') ? 'underline' : 'none' });
                scheduleHistoryCommit('EDIT_ELEMENT');
            });
        }
    }

    // Icon picker
    window.pickIcon = function(emoji) {
        const textArea = document.getElementById('prop_text');
        if (textArea) { textArea.value = emoji; }
        if (state.selected?.elId) sendToIframe('UPDATE_ELEMENT', { elId: state.selected.elId, text: emoji, iconClass: '' });
        scheduleHistoryCommit('EDIT_ELEMENT');
    };

    async function uploadFileViaApi(file) {
        const formData = new FormData();
        formData.append('image', file);
        try {
            const res = await fetch('api/index.php?action=upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.success) {
                return data.data.url;
            } else {
                showToast('Upload failed: ' + data.error, 'error');
            }
        } catch (err) {
            showToast('Upload error: ' + err.message, 'error');
        }
        return null;
    }

    // Image upload helpers
    window.triggerImgUpload = function(targetInputId) {
        const fileInput = document.getElementById('builderImgUpload');
        if (!fileInput) return;
        fileInput.onchange = async function() {
            const file = fileInput.files[0];
            if (!file) return;
            showToast('Uploading...', 'info');
            const uploadedUrl = await uploadFileViaApi(file);
            if (uploadedUrl) {
                const input = document.getElementById(targetInputId);
                if (input) { input.value = uploadedUrl; input.dispatchEvent(new Event('input')); }
                showToast('Upload successful ✅', 'success');
            }
            fileInput.value = '';
        };
        fileInput.click();
    };

    window.triggerSlideUpload = function(slideIdx) {
        const fileInput = document.getElementById('builderSlideUpload');
        if (!fileInput) return;
        fileInput.onchange = async function() {
            const file = fileInput.files[0];
            if (!file) return;
            showToast('Uploading...', 'info');
            const uploadedUrl = await uploadFileViaApi(file);
            if (uploadedUrl) {
                const input = document.getElementById(`prop_slide_img_${slideIdx}`);
                if (input) { input.value = uploadedUrl; }
                if (state.selected?.elId) {
                    sendToIframe('UPDATE_ELEMENT', { elId: state.selected.elId, slideImgIdx: slideIdx, slideImgUrl: uploadedUrl });
                    scheduleHistoryCommit('EDIT_ELEMENT');
                }
                showToast('Upload successful ✅', 'success');
            }
            fileInput.value = '';
        };
        fileInput.click();
    };

    // Quick-add below selected element
    window.addElBelow = function(type, belowElId) {
        const sectionId = state.selected?.sectionId || state.sections[state.sections.length - 1]?.id;
        if (!sectionId) return showToast('Select a section first', 'warning');
        sendToIframe('ADD_ELEMENT', { type, sectionId, beforeElId: belowElId });
        showToast(`${capitalize(type)} added ✅`, 'success');
    };

    window.addAdjacentElement = function() {
        const sectionId = state.selected?.sectionId || state.sections[state.sections.length - 1]?.id;
        if (!sectionId) return showToast('Select a section first', 'warning');
        openQuickAddPanel(sectionId, state.selected?.elId);
    };

    function openQuickAddPanel(sectionId, nearElId) {
        const all = [
            ['heading','H Heading'], ['text','¶ Text'], ['button','⬜ Button'],
            ['badge','🏷️ Badge'], ['divider','— Divider'], ['spacer','↕ Spacer'],
            ['image','🖼️ Image'], ['icon','⭐ Icon'], ['card','🪟 Card'],
            ['stat-box','📊 Stat Box'], ['columns-2','⬛⬛ 2 Col'], ['columns-3','⬛⬛⬛ 3 Col'],
            ['cta-banner','📣 CTA'], ['navbar','NAV Navbar'], ['hero-block','HERO Block'],
            ['stats-row','📈 Stats Row'], ['slider','🎞️ Slider'],
            ['alert','⚠️ Alert'], ['quote','❝ Quote'], ['list','☰ List'], ['table','TBL Table'],
            ['progress-bar','▬ Progress'], ['countdown','⏱️ Countdown'],
            ['social-links','🔗 Social'], ['pricing-card','💳 Pricing Card'],
            ['product-card','PR Product'], ['product-grid','PG Grid'], ['category-strip','CH Categories'],
            ['trust-badges','TR Trust'], ['comparison-table','VS Compare'], ['logo-cloud','LC Logos'],
            ['contact-card','CT Contact'], ['steps','1-3 Steps'], ['feature-list','OK List'],
            ['tabs','TB Tabs'], ['accordion','AC Accordion'], ['testimonial-card','REV Review'], ['js-code','JS Code'],
            ['full-banner','🖼 Full Banner'],
            ['icon-box','🎁 Icon Box'], ['gradient-heading','Aa Gradient'], ['highlight-box','💡 Highlight'],
            ['rating','★ Rating'], ['avatar','🧑 Avatar'], ['flip-card','🔄 Flip Card'],
            ['breadcrumb','› Breadcrumb'], ['tag-cloud','# Tags'], ['image-overlay','🖼️ Image Overlay'],
            ['stat-counter','🔢 Counter'], ['timeline-item','┃ Timeline'], ['profile-card','👤 Profile'],
            ['download-card','📄 Download'], ['notice-banner','📢 Notice Bar'],
        ];
        // Close old
        document.querySelectorAll('.quick-add-popup').forEach(el => el.remove());

        const popup = document.createElement('div');
        popup.className = 'quick-add-popup';
        popup.innerHTML = `
            <div style="font-size:0.72rem;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:0.4rem">Add Element</div>
            <div style="display:flex;flex-wrap:wrap;gap:0.3rem">
                ${all.map(([t, label]) => `
                    <button class="qap-btn" onclick="addElFromPopup('${t}','${sectionId}','${nearElId||''}')">
                        ${label}
                    </button>`).join('')}
            </div>
            <button class="qap-close" onclick="this.parentElement.remove()">✕</button>
        `;
        document.getElementById('canvasArea').appendChild(popup);
        popup.style.right = '270px';
        popup.style.bottom = '1rem';

        setTimeout(() => {
            const rem = e => { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', rem); } };
            document.addEventListener('click', rem);
        }, 150);
    }

    window.addElFromPopup = function(type, sectionId, nearElId) {
        sendToIframe('ADD_ELEMENT', { type, sectionId, beforeElId: nearElId || undefined });
        document.querySelectorAll('.quick-add-popup').forEach(el => el.remove());
        showToast(`${capitalize(type)} added ✅`, 'success');
    };

    // ── Settings Panel ────────────────────────────────────────
    const CDN_PRESETS = [
        { name: 'Font Awesome 6', icon: 'FA', url: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css' },
        { name: 'Bootstrap Icons', icon: 'BI', url: 'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css' },
        { name: 'Animate.css', icon: 'AN', url: 'https://cdnjs.cloudflare.com/ajax/libs/animate.css/4.1.1/animate.min.css' },
        { name: 'AOS', icon: 'AO', url: 'https://unpkg.com/aos@2.3.4/dist/aos.css' },
        { name: 'Alpine.js', icon: 'AL', url: 'https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js' },
        { name: 'Swiper.js', icon: 'SW', url: 'https://cdn.jsdelivr.net/npm/swiper@11/swiper-bundle.min.css' },
        { name: 'GSAP', icon: 'GS', url: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js' },
    ];

    const FONT_PRESETS = [
        'Inter', 'Roboto', 'Poppins', 'Montserrat', 'Lato',
        'Nunito', 'Raleway', 'Oswald', 'Playfair Display', 'DM Sans',
        'Fira Code',
    ];

    let settingsInited = false;
    function initSettingsPanel() {
        if (settingsInited) { renderCdnList(); return; }
        settingsInited = true;

        // CDN presets
        const presetsGrid = document.getElementById('cdnPresetsGrid');
        presetsGrid.innerHTML = CDN_PRESETS.map(p => `
            <div class="cdn-preset" onclick="toggleCdnPreset('${escAttr(p.url)}')" data-cdn-url="${escAttr(p.url)}" title="${escAttr(p.name)}">
                <span class="cdnp-icon">${p.icon}</span>
                <span>${p.name}</span>
            </div>
        `).join('');
        updateCdnPresetHighlights();

        // Font presets
        const fontGrid = document.getElementById('fontPresetsGrid');
        fontGrid.innerHTML = FONT_PRESETS.map(f => `
            <button class="font-preset-btn ${settings.fonts.includes(f)?'active':''}" onclick="toggleFontPreset('${escAttr(f)}')">${f}</button>
        `).join('');

        // Custom CSS
        document.getElementById('settingsCssEditor').value = settings.customCss;
        document.getElementById('settingsApplyCss').addEventListener('click', () => {
            settings.customCss = document.getElementById('settingsCssEditor').value;
            saveSettings();
            sendToIframe('INJECT_CUSTOM_CSS', { css: settings.customCss });
            showToast('Custom CSS applied ✅', 'success');
        });

        // Custom JavaScript
        const jsEditor = document.getElementById('settingsJsEditor');
        const jsApply = document.getElementById('settingsApplyJs');
        if (jsEditor && jsApply) {
            jsEditor.value = settings.customJs;
            jsApply.addEventListener('click', () => {
                settings.customJs = jsEditor.value;
                saveSettings();
                sendToIframe('INJECT_CUSTOM_JS', { js: settings.customJs });
                showToast('Custom JavaScript applied ✅', 'success');
            });
        }

        // CDN add button
        document.getElementById('cdnAddBtn').addEventListener('click', () => {
            const url = document.getElementById('cdnCustomUrl').value.trim();
            if (!url) return showToast('Enter a URL', 'warning');
            if (settings.cdns.includes(url)) return showToast('Already added', 'info');
            settings.cdns.push(url);
            saveSettings();
            sendToIframe('INJECT_CDNS', { urls: [url] });
            document.getElementById('cdnCustomUrl').value = '';
            renderCdnList();
            showToast('CDN added ✅', 'success');
        });

        // Font add button
        document.getElementById('fontAddBtn').addEventListener('click', () => {
            const name = document.getElementById('fontCustomName').value.trim();
            if (!name) return showToast('Enter a font name', 'warning');
            if (settings.fonts.includes(name)) return showToast('Already added', 'info');
            settings.fonts.push(name);
            saveSettings();
            const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@300;400;500;600;700;800&display=swap`;
            sendToIframe('INJECT_CDNS', { urls: [url] });
            document.getElementById('fontCustomName').value = '';
            // Refresh presets
            document.querySelectorAll('.font-preset-btn').forEach(btn => {
                btn.classList.toggle('active', settings.fonts.includes(btn.textContent));
            });
            showToast(`Font "${name}" added ✅`, 'success');
        });

        renderCdnList();
    }

    function renderCdnList() {
        const list = document.getElementById('cdnList');
        if (!list) return;
        if (!settings.cdns.length) {
            list.innerHTML = '<div style="font-size:0.7rem;color:#475569;padding:0.25rem 0">No custom CDNs added yet.</div>';
            return;
        }
        list.innerHTML = settings.cdns.map((url, i) => `
            <div class="cdn-item">
                <span class="cdn-item-url" title="${escHtml(url)}">${escHtml(url.length > 40 ? url.slice(0,40)+'…' : url)}</span>
                <button class="cdn-item-remove" onclick="removeCdn(${i})" title="Remove">✕</button>
            </div>
        `).join('');
    }

    window.toggleCdnPreset = function(url) {
        const idx = settings.cdns.indexOf(url);
        if (idx === -1) {
            settings.cdns.push(url);
            sendToIframe('INJECT_CDNS', { urls: [url] });
            showToast('CDN added ✅', 'success');
        } else {
            settings.cdns.splice(idx, 1);
            showToast('CDN removed (reload page to fully unload)', 'info');
        }
        saveSettings();
        renderCdnList();
        updateCdnPresetHighlights();
    };

    window.removeCdn = function(i) {
        settings.cdns.splice(i, 1);
        saveSettings();
        renderCdnList();
        updateCdnPresetHighlights();
        showToast('CDN removed', 'info');
    };

    window.toggleFontPreset = function(name) {
        const btn = [...document.querySelectorAll('.font-preset-btn')].find(b => b.textContent === name);
        const idx = settings.fonts.indexOf(name);
        if (idx === -1) {
            settings.fonts.push(name);
            const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(name)}:wght@300;400;500;600;700;800&display=swap`;
            sendToIframe('INJECT_CDNS', { urls: [url] });
            if (btn) btn.classList.add('active');
            showToast(`Font "${name}" loaded ✅`, 'success');
        } else {
            settings.fonts.splice(idx, 1);
            if (btn) btn.classList.remove('active');
            showToast(`Font "${name}" removed`, 'info');
        }
        saveSettings();
    };

    function updateCdnPresetHighlights() {
        document.querySelectorAll('.cdn-preset').forEach(el => {
            el.classList.toggle('active', settings.cdns.includes(el.dataset.cdnUrl));
        });
    }

    function escAttr(s) {
        return String(s||'').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    let snapshotId = 0;
    const snapshotCallbacks = new Map();

    // ── Export HTML ───────────────────────────────────────────
    function requestSnapshot(clean, callback, timeoutMessage = 'Snapshot timeout') {
        const requestId = `snap-${++snapshotId}`;
        snapshotCallbacks.set(requestId, callback);
        sendToIframe(clean ? 'GET_CLEAN_SNAPSHOT' : 'GET_SNAPSHOT', { requestId });

        setTimeout(() => {
            if (!snapshotCallbacks.has(requestId)) return;
            snapshotCallbacks.delete(requestId);
            callback(null);
            if (timeoutMessage) showToast(timeoutMessage, 'error');
        }, 4000);
    }

    function requestCleanSnapshot(callback, timeoutMessage = 'Snapshot timeout') {
        requestSnapshot(true, callback, timeoutMessage);
    }

    function copyCleanHtml() {
        const btn = document.getElementById('copyHtmlBtn');
        if (!navigator.clipboard) {
            showToast('Clipboard is not available in this browser', 'warning');
            return;
        }
        btn.textContent = 'Copying...';
        btn.disabled = true;
        requestCleanSnapshot(async (html) => {
            btn.disabled = false;
            btn.textContent = 'Copy HTML';
            if (!html) return;
            try {
                await navigator.clipboard.writeText(html);
                showToast('Clean HTML copied', 'success');
            } catch {
                showToast('Could not copy HTML', 'error');
            }
        }, 'Copy timeout');
    }

    function exportHtml() {
        const btn = document.getElementById('exportBtn');
        btn.textContent = '⏳ Exporting...';
        btn.disabled = true;

        requestCleanSnapshot((html) => {
            btn.textContent = '⬇️ Export';
            btn.disabled = false;
            if (!html) return;

            const blob = new Blob([html], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const base = (state.currentPage || 'page').replace(/\.html?$/i, '') || 'page';
            a.download = base + '-export.html';
            a.click();
            URL.revokeObjectURL(url);
            showToast('HTML exported ✅', 'success');
        }, 'Export timeout — try again');
    }

    // ── Save ─────────────────────────────────────────────────
    function saveChanges() {
        const btn = document.getElementById('saveBtn');
        btn.textContent = '⏳ Saving...';
        btn.disabled = true;

        requestSnapshot(false, (html) => {
            btn.textContent = '💾 Save';
            btn.disabled = false;
            if (!html) {
                showToast('Server needed to save files. Changes are local.', 'warning');
                return;
            }
            localStorage.setItem('fronty_builder_html', html);
            localStorage.setItem('fronty_builder_saved_at', Date.now());
            const pageKey = (state.currentPage || 'index.html').replace(/\W+/g, '_');
            localStorage.setItem('fronty_builder_html_' + pageKey, html);
            localStorage.setItem('fronty_builder_saved_at_' + pageKey, Date.now());
            btn.textContent = '✅ Saved!';
            btn.disabled = false;
            setTimeout(() => { btn.textContent = '💾 Save'; }, 2000);
            showToast('Saved to local storage ✅', 'success');
        }, '');
    }

    function handleSnapshot(data) {
        const html = typeof data === 'string' ? data : data.html;
        const requestId = typeof data === 'object' ? data.requestId : null;
        if (requestId && snapshotCallbacks.has(requestId)) {
            const callback = snapshotCallbacks.get(requestId);
            snapshotCallbacks.delete(requestId);
            callback(html);
        }
    }

    // ── Undo / Redo ───────────────────────────────────────────
    function captureInitialHistory() {
        if (state.historyReady || state.restoringHistory) return;
        requestSnapshot(false, (html) => {
            if (!html) return;
            state.lastSnapshot = html;
            state.historyReady = true;
            updateUndoButtons();
        }, '');
    }

    function scheduleHistoryCommit(action, delay = 350) {
        clearTimeout(state.historyTimer);
        state.historyTimer = setTimeout(() => commitHistory(action), delay);
    }

    function commitHistory(action) {
        if (state.restoringHistory) return;
        requestSnapshot(false, (html) => {
            if (!html) return;
            if (!state.lastSnapshot) {
                state.lastSnapshot = html;
                state.historyReady = true;
                updateUndoButtons();
                return;
            }
            if (html === state.lastSnapshot) return;
            state.undoStack.push({ action, html: state.lastSnapshot, ts: Date.now() });
            state.lastSnapshot = html;
            state.historyReady = true;
            state.redoStack = [];
            if (state.undoStack.length > 50) state.undoStack.shift();
            updateUndoButtons();
        }, '');
    }

    function pushUndo(action) {
        scheduleHistoryCommit(action, 280);
    }

    function restoreSnapshot(html) {
        if (!html) return;
        state.restoringHistory = true;
        sendToIframe('RESTORE_SNAPSHOT', { html });
    }

    function undo() {
        if (!state.undoStack.length) return showToast('Nothing to undo', 'info');
        requestSnapshot(false, (currentHtml) => {
            const previous = state.undoStack.pop();
            if (!previous) return;
            if (currentHtml) {
                state.redoStack.push({ action: previous.action, html: currentHtml, ts: Date.now() });
            }
            state.lastSnapshot = previous.html;
            restoreSnapshot(previous.html);
            updateUndoButtons();
            showToast('Undo ↩', 'info');
        }, '');
    }

    function redo() {
        if (!state.redoStack.length) return showToast('Nothing to redo', 'info');
        requestSnapshot(false, (currentHtml) => {
            const next = state.redoStack.pop();
            if (!next) return;
            if (currentHtml) {
                state.undoStack.push({ action: next.action, html: currentHtml, ts: Date.now() });
            }
            state.lastSnapshot = next.html;
            restoreSnapshot(next.html);
            updateUndoButtons();
            showToast('Redo ↪', 'info');
        }, '');
    }

    function renderHistoryPanel() {
        const list = document.getElementById('panelHistoryList');
        if (!list) return;

        let html = '';
        
        html += `<div class="panel-section-item" style="opacity:0.7" onclick="jumpToHistory(-1, 'undo')">
            <span>🏁</span> <span style="flex:1">Initial Edit</span>
        </div>`;
        
        state.undoStack.forEach((item, idx) => {
            html += `<div class="panel-section-item" style="opacity:0.85;cursor:pointer" onclick="jumpToHistory(${idx}, 'undo')">
                <span>⏱️</span> <span style="flex:1">${capitalize(item.action || 'Edit').replace(/_/g, ' ')}</span>
            </div>`;
        });

        html += `<div class="panel-section-item active">
            <span>🎯</span> <span style="flex:1;font-weight:bold;">Current State</span>
        </div>`;

        for(let i = state.redoStack.length - 1; i >= 0; i--) {
            const item = state.redoStack[i];
            html += `<div class="panel-section-item" style="opacity:0.5;cursor:pointer" onclick="jumpToHistory(${i}, 'redo')">
                <span>⏭️</span> <span style="flex:1">${capitalize(item.action || 'Edit').replace(/_/g, ' ')}</span>
            </div>`;
        }

        list.innerHTML = html;
        const curr = list.querySelector('.active');
        if (curr) curr.scrollIntoView({ block: 'nearest' });
    }

    window.jumpToHistory = function(idx, type) {
        if (state.restoringHistory) return;
        requestSnapshot(false, (currentHtml) => {
            if (!currentHtml) return;
            if(state.lastSnapshot && state.lastSnapshot !== currentHtml) {
                state.undoStack.push({ action: 'Inline Edit', html: currentHtml, ts: Date.now() });
                state.lastSnapshot = currentHtml;
                state.redoStack = [];
            }

            if (type === 'undo') {
                const jumps = state.undoStack.length - 1 - idx;
                for(let i=0; i<jumps; i++) {
                    if(!state.undoStack.length) break;
                    const cHtml = state.lastSnapshot;
                    const prev = state.undoStack.pop();
                    state.redoStack.push({ action: prev.action, html: cHtml, ts: Date.now() });
                    state.lastSnapshot = prev.html;
                }
            } else if (type === 'redo') {
                const targetLength = idx;
                while(state.redoStack.length > targetLength) {
                    const cHtml = state.lastSnapshot;
                    const nxt = state.redoStack.pop();
                    state.undoStack.push({ action: nxt.action, html: cHtml, ts: Date.now() });
                    state.lastSnapshot = nxt.html;
                }
            }
            
            restoreSnapshot(state.lastSnapshot);
            updateUndoButtons();
            showToast('History restored 🕒', 'success');
        });
    };

    function updateUndoButtons() {
        if (state.undoStack.length > 50) state.undoStack.shift();
        document.getElementById('undoBtn').disabled = !state.undoStack.length;
        document.getElementById('redoBtn').disabled = !state.redoStack.length;
        if (document.getElementById('panel-history')?.classList.contains('active')) {
            renderHistoryPanel();
        }
    }

    // ── Toast ─────────────────────────────────────────────────
    function showToast(msg, type = 'info') {
        document.querySelectorAll('.builder-toast').forEach(t => t.remove());
        const colors = { success:'#10b981', error:'#ef4444', info:'#6366f1', warning:'#f59e0b' };
        const el = document.createElement('div');
        el.className = 'builder-toast';
        el.style.cssText = `position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%) translateY(20px);background:${colors[type]||'#6366f1'};color:#fff;padding:0.5rem 1.25rem;border-radius:2rem;font-size:0.82rem;font-weight:700;z-index:99999;font-family:Inter,sans-serif;opacity:0;transition:all 0.3s;box-shadow:0 8px 25px -5px rgba(0,0,0,0.4);pointer-events:none;white-space:nowrap`;
        el.textContent = msg;
        document.body.appendChild(el);
        requestAnimationFrame(() => { el.style.opacity='1'; el.style.transform='translateX(-50%) translateY(0)'; });
        setTimeout(() => { el.style.opacity='0'; setTimeout(() => el.remove(), 400); }, 2500);
    }

    // ── Helpers ───────────────────────────────────────────────
    function typeIcon(t) {
        return { heading:'H', text:'¶', button:'⬜', badge:'🏷️', image:'🖼️', icon:'⭐', divider:'—', spacer:'↕', card:'🪟', link:'🔗', slider:'🎞️', video:'▶️',
            'form-input':'✏️', 'form-textarea':'📄', 'form-select':'▽', 'form-container':'📮',
            alert:'⚠️', quote:'❝', list:'☰', table:'TBL', navbar:'NAV', 'hero-block':'HERO', 'testimonial-card':'REV', 'progress-bar':'▬', 'columns-4':'▪▪▪▪',
            countdown:'⏱️', 'map-embed':'🗺️', 'html-embed':'</>', 'js-code':'JS',
            'social-links':'🔗', 'pricing-card':'💳',
            'product-card':'PR', 'product-grid':'PG', 'category-strip':'CH', 'trust-badges':'TR',
            'comparison-table':'VS', 'logo-cloud':'LC', 'contact-card':'CT', steps:'1-3',
            'feature-list':'OK', tabs:'TB', accordion:'AC', 'full-banner':'🖼',
            'icon-box':'🎁', 'gradient-heading':'Aa', 'highlight-box':'💡', rating:'★', avatar:'🧑',
            'flip-card':'🔄', breadcrumb:'›', 'tag-cloud':'#', 'image-overlay':'🖼️', 'stat-counter':'🔢',
            'timeline-item':'┃', 'profile-card':'👤', 'download-card':'📄', 'notice-banner':'📢' }[t] || '✏️';
    }
    function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
    function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
    function safeColor(c) {
        if (!c) return '#ffffff';
        try {
            const d = document.createElement('div'); d.style.color = c; document.body.appendChild(d);
            const rgb = getComputedStyle(d).color; d.remove();
            const m = rgb.match(/\d+/g);
            return m ? '#'+m.slice(0,3).map(n=>parseInt(n).toString(16).padStart(2,'0')).join('') : '#ffffff';
        } catch { return '#ffffff'; }
    }

})();
