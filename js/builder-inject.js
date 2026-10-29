/**
 * builder-inject.js v3 — Injected into the preview iframe
 * New: INJECT_CDNS, INJECT_CUSTOM_CSS, extended applyEl,
 *      form elements, advanced elements, new section templates
 */
(function () {
    'use strict';
    if (window.__builderInjected) return; // prevent double-inject
    window.__builderInjected = true;

    let selectedEl = null;

    // ── Init ─────────────────────────────────────────────────
    function init() {
        addBuilderAttributes();
        injectStyles();
        setupListeners();
        initCounters();
        sendToParent({ type: 'BUILDER_READY', sections: getSectionsInfo() });
    }

    function initCounters() {
        document.querySelectorAll('[data-counter-to]').forEach(box => {
            if (box.querySelector('.counter-value')) runCounter(box);
        });
    }

    // ── Tag elements ─────────────────────────────────────────
    function addBuilderAttributes() {
        document.querySelectorAll('section, .builder-section, [data-builder-section]').forEach((sec, i) => {
            if (!sec.dataset.builderSection) sec.dataset.builderSection = `sec-${i}`;
            tagEditables(sec);
            injectSectionUI(sec);
        });
    }

    function tagEditables(parent) {
        const selector = '[data-builder-type],h1,h2,h3,h4,h5,h6,p,span:not(.no-edit),a,button:not(.no-edit),img';
        const nodes = [...parent.querySelectorAll(selector)];
        if (parent.matches?.(selector)) nodes.unshift(parent);

        nodes.forEach((el, i) => {
            if (!el.dataset.builderEl) {
                const inferred = el.dataset.builderType || inferType(el);
                el.dataset.builderEl = `${inferred}-${i}-${Date.now()}`;
                el.dataset.builderType = inferred;
            }
        });
    }

    // ── Inject CSS ───────────────────────────────────────────
    function injectStyles() {
        if (document.getElementById('builder-inject-styles')) return;
        const s = document.createElement('style');
        s.id = 'builder-inject-styles';
        s.textContent = `
            [data-builder-section] { position:relative!important; }
            html:not(.builder-overlays-off) [data-builder-el]:hover { outline:2px dashed rgba(99,102,241,0.5)!important; outline-offset:2px!important; cursor:pointer!important; }
            html:not(.builder-overlays-off) [data-builder-el].builder-selected { outline:2px solid #6366f1!important; outline-offset:3px!important; }
            html:not(.builder-overlays-off) [data-builder-section].builder-section-selected { outline:2px solid rgba(99,102,241,0.7)!important; outline-offset:0!important; }
            html:not(.builder-overlays-off) [data-builder-section].drag-over { background:rgba(99,102,241,0.04)!important; outline:2px dashed #6366f1!important; }
            [contenteditable] { outline:2px solid #6366f1!important; cursor:text!important; caret-color:#6366f1; }
            .section-label { position:absolute!important; top:0; left:0; background:rgba(99,102,241,0.88); color:#fff; font-size:10px; font-weight:700; padding:2px 8px; border-bottom-right-radius:6px; z-index:9998; pointer-events:none; opacity:0; transition:opacity 0.15s; font-family:Inter,sans-serif; }
            [data-builder-section]:hover > .section-label { opacity:1; }
            .section-toolbar { position:absolute; top:4px; right:6px; display:flex; gap:3px; z-index:9999; opacity:0; transition:opacity 0.15s; }
            [data-builder-section]:hover > .section-toolbar { opacity:1; }
            .section-toolbar button { width:22px; height:22px; background:rgba(17,24,39,0.92); border:1px solid rgba(148,163,184,0.15); border-radius:4px; color:#94a3b8; cursor:pointer; font-size:9px; display:flex; align-items:center; justify-content:center; font-family:Inter,sans-serif; }
            .section-toolbar button:hover { color:#fff; background:#6366f1; }
            .section-toolbar button.del:hover { background:#ef4444; }
            .section-add-bar { position:absolute; bottom:-14px; left:50%; transform:translateX(-50%); z-index:9997; opacity:0; transition:opacity 0.2s; }
            [data-builder-section]:hover > .section-add-bar { opacity:1; }
            .section-add-bar button { background:#6366f1; color:#fff; border:none; border-radius:20px; padding:3px 14px; font-size:10px; font-weight:700; cursor:pointer; box-shadow:0 4px 12px -3px rgba(99,102,241,0.5); font-family:Inter,sans-serif; }
            .section-add-bar button:hover { background:#4f46e5; }
            .builder-drop-placeholder { height:4px; background:linear-gradient(90deg,#6366f1,#8b5cf6); border-radius:2px; margin:4px 0; }
            html.builder-overlays-off .section-label,
            html.builder-overlays-off .section-toolbar,
            html.builder-overlays-off .section-add-bar { display:none!important; }
        `;
        document.head.appendChild(s);
    }

    // ── Section UI ───────────────────────────────────────────
    function injectSectionUI(sec) {
        if (!sec.querySelector('.section-label')) {
            const lbl = document.createElement('div');
            lbl.className = 'section-label';
            lbl.textContent = sec.dataset.builderSection;
            sec.appendChild(lbl);
        }
        if (!sec.querySelector('.section-toolbar')) {
            const tb = document.createElement('div');
            tb.className = 'section-toolbar';
            tb.innerHTML = `
                <button onclick="builderSelectSection(this)" title="Select">☐</button>
                <button onclick="builderSectionMove(this,'up')" title="Up">↑</button>
                <button onclick="builderSectionMove(this,'down')" title="Down">↓</button>
                <button class="del" onclick="builderSectionDelete(this)" title="Delete">✕</button>
            `;
            sec.appendChild(tb);
        }
        if (!sec.querySelector('.section-add-bar')) {
            const bar = document.createElement('div');
            bar.className = 'section-add-bar';
            bar.innerHTML = `<button onclick="builderAddSectionAfter(this)">+ Section Below</button>`;
            sec.appendChild(bar);
        }
    }

    // ── Listeners ────────────────────────────────────────────
    function setupListeners() {
        document.addEventListener('click', e => {
            const el = e.target.closest('[data-builder-el]');
            const sec = e.target.closest('[data-builder-section]');
            if (el && !el.isContentEditable) {
                e.preventDefault(); e.stopPropagation();
                selectElement(el);
            } else if (sec && !el) {
                selectSection(sec);
            } else if (!el && !sec) {
                clearSel();
            }
        }, true);

        document.addEventListener('dblclick', e => {
            const el = e.target.closest('[data-builder-el]');
            if (el) { e.preventDefault(); startEdit(el); }
        }, true);

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                if (selectedEl?.isContentEditable) stopEdit(selectedEl);
                else clearSel();
            }
        });

        // Drop zone
        document.addEventListener('dragover', e => {
            const sec = e.target.closest('[data-builder-section]');
            if (sec) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; sec.classList.add('drag-over'); }
        });
        document.addEventListener('dragleave', e => {
            const sec = e.target.closest('[data-builder-section]');
            if (sec && !sec.contains(e.relatedTarget)) sec.classList.remove('drag-over');
        });
        document.addEventListener('drop', e => {
            e.preventDefault();
            const sec = e.target.closest('[data-builder-section]');
            if (sec) sec.classList.remove('drag-over');
            const type = e.dataTransfer.getData('builder-element-type');
            if (type && sec) {
                addElToSection(type, sec, e.target.closest('[data-builder-el]'));
            }
        });
    }

    // ── Selection ────────────────────────────────────────────
    function selectElement(el) {
        clearSel();
        selectedEl = el;
        el.classList.add('builder-selected');
        const r = el.getBoundingClientRect();
        sendToParent({ type:'ELEMENT_SELECTED', elId:el.dataset.builderEl, elType:el.dataset.builderType||inferType(el), tag:el.tagName.toLowerCase(),
            rect:{ top:r.top+window.scrollY, left:r.left+window.scrollX, width:r.width, height:r.height },
            props:extractProps(el), sectionId:el.closest('[data-builder-section]')?.dataset.builderSection });
    }

    function selectSection(sec) {
        clearSel();
        sec.classList.add('builder-section-selected');
        selectedEl = sec;
        const cs = window.getComputedStyle(sec);
        // Extract background image if set
        const bgImg = sec.style.backgroundImage ? sec.style.backgroundImage.replace(/url\(['"]?|['"]?\)/g,'') : '';
        sendToParent({ type:'SECTION_SELECTED', sectionId:sec.dataset.builderSection, tag:sec.tagName.toLowerCase(),
            props:{
                id: sec.id,
                bg: sec.style.background||sec.style.backgroundColor||'',
                paddingTop: parseInt(cs.paddingTop)||'',
                paddingBottom: parseInt(cs.paddingBottom)||'',
                paddingLeft: parseInt(cs.paddingLeft)||'',
                paddingRight: parseInt(cs.paddingRight)||'',
                minHeight: parseInt(sec.style.minHeight)||'',
                bgImage: bgImg,
                bgSize: sec.style.backgroundSize || 'cover',
                bgPos: sec.style.backgroundPosition || 'center',
                visible: sec.style.display!=='none'
            }
        });
    }

    function clearSel() {
        if (selectedEl) {
            selectedEl.classList.remove('builder-selected','builder-section-selected');
            if (selectedEl.isContentEditable) stopEdit(selectedEl);
            selectedEl = null;
        }
        sendToParent({ type:'DESELECTED' });
    }

    // ── Inline editing ────────────────────────────────────────
    function startEdit(el) {
        const ok = ['H1','H2','H3','H4','H5','H6','P','SPAN','A','BUTTON','DIV'];
        if (!ok.includes(el.tagName)) return;
        el.contentEditable = 'true';
        el.focus();
        const r = document.createRange(); r.selectNodeContents(el);
        const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
        el.addEventListener('input', () => sendToParent({ type:'INLINE_EDIT', elId:el.dataset.builderEl, text:el.innerText }));
        el.addEventListener('blur', () => stopEdit(el), { once:true });
    }

    function stopEdit(el) {
        if (!el.isContentEditable) return;
        el.contentEditable = 'false';
        sendToParent({ type:'INLINE_EDIT_DONE', elId:el.dataset.builderEl, text:el.innerText });
    }

    function extractProps(el) {
        const cs = window.getComputedStyle(el);
        const base = {
            text: el.innerText||'', href:el.href||el.getAttribute('href')||'',
            color:el.style.color||cs.color, fontSize:parseInt(cs.fontSize)||16,
            fontWeight:el.style.fontWeight||cs.fontWeight, textAlign:el.style.textAlign||cs.textAlign,
            background:el.style.background||'', borderRadius:parseInt(el.style.borderRadius)||0,
            padding:el.style.padding||'', src:el.src||'', alt:el.alt||'',
            width: parseInt(el.style.width)||100,
            lineHeight: parseFloat(el.style.lineHeight)||1.6,
            letterSpacing: parseFloat(el.style.letterSpacing)||0,
            textTransform: el.style.textTransform||'none',
            fontStyle: el.style.fontStyle||'normal',
            textDecoration: el.style.textDecoration||'none',
            opacity: parseFloat(el.style.opacity!==''?el.style.opacity:1)||1,
            borderWidth: parseInt(el.style.borderWidth)||0,
            borderColor: el.style.borderColor||'',
            borderStyle: el.style.borderStyle||'none',
            boxShadow: el.style.boxShadow||'',
            margin: el.style.margin||'',
            maxWidth: el.style.maxWidth||'',
            minHeight: el.style.minHeight||'',
            objectFit: el.style.objectFit||'cover',
            htmlId: el.id || '',
            cssClass: [...el.classList].filter(name => !name.startsWith('builder-')).join(' '),
            inlineStyle: el.getAttribute('style') || '',
            display: el.style.display || cs.display,
            flexDirection: el.style.flexDirection || cs.flexDirection,
            justifyContent: el.style.justifyContent || cs.justifyContent,
            alignItems: el.style.alignItems || cs.alignItems,
            gap: el.style.gap || cs.gap,
            customJs: el.dataset.customJs || '',
        };
        // Slider extra props
        if (el.dataset.builderType === 'slider') {
            base.sliderHeight = parseInt(el.dataset.sliderHeight) || 320;
            base.sliderAutoplay = parseInt(el.dataset.sliderAutoplay) || 0;
            base.sliderCount = el.querySelectorAll('.slider-slide').length || 3;
            base.slideBgSize = el.dataset.slideBgSize || 'cover';
        }
        // Full-banner extra props
        if (el.dataset.builderType === 'full-banner') {
            const bgImg = el.style.backgroundImage ? el.style.backgroundImage.replace(/url\(['"]?|['"]?\)/g,'') : '';
            base.src = bgImg;
            const overlay = el.querySelector('.banner-overlay');
            base.bannerOverlay = overlay ? overlay.style.background : 'rgba(0,0,0,0.45)';
        }
        // Stat-counter extra props
        if (el.dataset.builderType === 'stat-counter') {
            base.counterTo = parseInt(el.dataset.counterTo) || 0;
            base.counterSuffix = el.dataset.counterSuffix || '';
            base.counterPrefix = el.dataset.counterPrefix || '';
        }
        return base;
    }

    function inferType(el) {
        const t = el.tagName.toLowerCase();
        if (t.startsWith('h')) return 'heading';
        if (t==='p') return 'text';
        if (t==='a'||t==='button') return 'button';
        if (t==='img') return 'image';
        return 'text';
    }

    // ── Commands from parent ──────────────────────────────────
    window.addEventListener('message', e => {
        if (!e.data?.cmd) return;
        const { cmd, payload } = e.data;
        if (cmd==='UPDATE_ELEMENT') applyEl(payload);
        else if (cmd==='DELETE_ELEMENT') deleteEl(payload.elId);
        else if (cmd==='MOVE_ELEMENT') moveEl(payload);
        else if (cmd==='DUPLICATE_ELEMENT') dupEl(payload.elId);
        else if (cmd==='UPDATE_SECTION') applySection(payload);
        else if (cmd==='DELETE_SECTION') deleteSection(payload.sectionId);
        else if (cmd==='MOVE_SECTION') moveSection(payload);
        else if (cmd==='ADD_ELEMENT') addElementCmd(payload);
        else if (cmd==='ADD_SECTION') addSectionCmd(payload);
        else if (cmd==='SELECT_SECTION') {
            const sec = findSec(payload.sectionId);
            if (sec) selectSection(sec);
        }
        else if (cmd==='INJECT_CDNS') injectCdns(payload.urls);
        else if (cmd==='INJECT_CUSTOM_CSS') injectCustomCss(payload.css);
        else if (cmd==='INJECT_CUSTOM_JS') injectCustomJs(payload.js);
        else if (cmd==='RESTORE_SNAPSHOT') restoreSnapshot(payload.html);
        else if (cmd==='SET_OVERLAYS') document.documentElement.classList.toggle('builder-overlays-off', payload.enabled === false);
        else if (cmd==='GET_CLEAN_SNAPSHOT') sendToParent({ type:'SNAPSHOT', html:getCleanSnapshot(), requestId:payload?.requestId });
        else if (cmd==='GET_SNAPSHOT') sendToParent({ type:'SNAPSHOT', html:document.documentElement.outerHTML, requestId:payload?.requestId });
    });

    // ── Inject CDNs ───────────────────────────────────────────
    function injectCdns(urls) {
        if (!urls || !urls.length) return;
        urls.forEach(url => {
            // Check duplicate
            if (document.querySelector(`[data-cdn-url="${CSS.escape(url)}"]`)) return;
            const isJs = url.endsWith('.js') || url.includes('.js?');
            const el = document.createElement(isJs ? 'script' : 'link');
            el.setAttribute('data-cdn-url', url);
            if (isJs) {
                el.src = url;
                el.defer = true;
            } else {
                el.rel = 'stylesheet';
                el.href = url;
            }
            document.head.appendChild(el);
        });
    }

    // ── Inject Custom CSS ─────────────────────────────────────
    function injectCustomCss(css) {
        let styleEl = document.getElementById('builder-custom-css');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.id = 'builder-custom-css';
            document.head.appendChild(styleEl);
        }
        styleEl.textContent = css;
    }

    function injectCustomJs(js) {
        const oldScript = document.getElementById('builder-custom-js');
        if (oldScript) oldScript.remove();
        if (!js || !js.trim()) return;

        const script = document.createElement('script');
        script.id = 'builder-custom-js';
        script.textContent = `try {\n${js}\n} catch (err) { console.error('Fronty custom JS error:', err); }`;
        document.body.appendChild(script);
    }

    function restoreSnapshot(html) {
        if (!html) return;
        const parsed = new DOMParser().parseFromString(html, 'text/html');
        document.documentElement.className = parsed.documentElement.className || '';
        document.head.innerHTML = parsed.head.innerHTML;
        document.body.innerHTML = parsed.body.innerHTML;
        document.querySelectorAll('#builder-inject-script,#builder-inject-styles,.section-label,.section-toolbar,.section-add-bar,.builder-drop-placeholder').forEach(el => el.remove());
        document.querySelectorAll('script[src*="builder-inject.js"]').forEach(el => el.remove());
        document.querySelectorAll('.builder-selected,.builder-section-selected,.drag-over').forEach(el => {
            el.classList.remove('builder-selected', 'builder-section-selected', 'drag-over');
        });
        selectedEl = null;
        addBuilderAttributes();
        injectStyles();
        initCounters();
        sendToParent({ type:'HISTORY_RESTORED', sections:getSectionsInfo() });
    }

    function applyEl(p) {
        const el = findEl(p.elId); if (!el) return;
        if (p.htmlId!==undefined) el.id = p.htmlId.trim();
        if (p.cssClass!==undefined) {
            const builderClasses = [...el.classList].filter(name => name.startsWith('builder-'));
            const userClasses = p.cssClass.split(/\s+/).map(name => name.trim()).filter(Boolean);
            el.className = [...new Set([...userClasses, ...builderClasses])].join(' ');
        }
        if (p.text!==undefined && !el.isContentEditable) el.innerText = p.text;
        if (p.href!==undefined) el.setAttribute('href', p.href);
        if (p.color) el.style.color = p.color;
        if (p.fontSize) el.style.fontSize = p.fontSize+'px';
        if (p.fontWeight) el.style.fontWeight = p.fontWeight;
        if (p.textAlign) el.style.textAlign = p.textAlign;
        if (p.background!==undefined) el.style.background = p.background;
        if (p.borderRadius!==undefined) el.style.borderRadius = p.borderRadius+'px';
        if (p.padding!==undefined) el.style.padding = p.padding;
        if (p.src) { if (el.tagName==='IMG') el.src=p.src; else { const img=el.querySelector('img'); if(img) img.src=p.src; } }
        if (p.alt!==undefined) { if (el.tagName==='IMG') el.alt=p.alt; }
        if (p.objectFit!==undefined) { if (el.tagName==='IMG') el.style.objectFit=p.objectFit; else { const img=el.querySelector('img'); if(img) img.style.objectFit=p.objectFit; } }
        if (p.width!==undefined) { el.style.width = p.width+'%'; el.style.maxWidth='100%'; }
        if (p.lineHeight!==undefined) el.style.lineHeight = p.lineHeight;
        if (p.letterSpacing!==undefined) el.style.letterSpacing = p.letterSpacing+'px';
        if (p.textTransform!==undefined) el.style.textTransform = p.textTransform;
        if (p.fontStyle!==undefined) el.style.fontStyle = p.fontStyle;
        if (p.textDecoration!==undefined) el.style.textDecoration = p.textDecoration;
        if (p.opacity!==undefined) el.style.opacity = p.opacity;
        if (p.borderWidth!==undefined) el.style.borderWidth = p.borderWidth+'px';
        if (p.borderColor!==undefined) el.style.borderColor = p.borderColor;
        if (p.borderStyle!==undefined) el.style.borderStyle = p.borderStyle;
        if (p.boxShadow!==undefined) el.style.boxShadow = p.boxShadow;
        if (p.margin!==undefined) el.style.margin = p.margin;
        if (p.maxWidth!==undefined) el.style.maxWidth = p.maxWidth;
        if (p.minHeight!==undefined) el.style.minHeight = p.minHeight;
        if (p.display!==undefined && p.display!=='none') el.style.display = p.display;
        if (p.flexDirection!==undefined) el.style.flexDirection = p.flexDirection;
        if (p.justifyContent!==undefined) el.style.justifyContent = p.justifyContent;
        if (p.alignItems!==undefined) el.style.alignItems = p.alignItems;
        if (p.gap!==undefined) el.style.gap = p.gap;
        if (p.customJs!==undefined) {
            el.dataset.customJs = p.customJs;
            const code = el.querySelector('[data-js-code-preview]');
            if (code) code.textContent = p.customJs || '// Add JavaScript in the properties panel';
        }
        if (p.videoUrl) {
            const embedUrl = p.videoUrl.replace('watch?v=','embed/').replace('youtu.be/','youtube.com/embed/');
            let frame = el.querySelector('iframe');
            if (!frame) { frame=document.createElement('iframe'); frame.style.cssText='width:100%;height:100%;border:none;'; el.appendChild(frame); }
            frame.src = embedUrl; frame.allowFullscreen = true;
        }
        if (p.iconClass !== undefined) {
            if (p.iconClass) {
                el.innerHTML = `<i class="${p.iconClass}" style="font-size:inherit"></i>`;
            } else if (p.text) {
                el.textContent = p.text;
            }
        }
        // ── Slider props ──────────────────────────────────────
        if (p.sliderHeight !== undefined) {
            const h = parseInt(p.sliderHeight) || 320;
            el.dataset.sliderHeight = h;
            el.querySelectorAll('.slider-slide').forEach(s => s.style.height = h + 'px');
        }
        if (p.sliderAutoplay !== undefined) {
            el.dataset.sliderAutoplay = p.sliderAutoplay;
            if (p.sliderAutoplay > 0) {
                clearInterval(el._sliderTimer);
                el._sliderTimer = setInterval(() => {
                    const idx = parseInt(el.dataset.sliderIdx || 0);
                    const slides = el.querySelectorAll('.slider-slide');
                    const next = (idx + 1) % slides.length;
                    sliderGoTo(el, next);
                }, p.sliderAutoplay * 1000);
            } else {
                clearInterval(el._sliderTimer);
            }
        }
        if (p.slideBgSize !== undefined) {
            el.dataset.slideBgSize = p.slideBgSize;
            el.querySelectorAll('.slider-slide').forEach(s => s.style.backgroundSize = p.slideBgSize);
        }
        if (p.slideImgIdx !== undefined && p.slideImgUrl !== undefined) {
            const slides = el.querySelectorAll('.slider-slide');
            const slide = slides[p.slideImgIdx];
            if (slide) {
                if (p.slideImgUrl) {
                    slide.style.backgroundImage = `url('${p.slideImgUrl}')`;
                    slide.style.backgroundSize = el.dataset.slideBgSize || 'cover';
                    slide.style.backgroundPosition = 'center';
                    slide.style.backgroundRepeat = 'no-repeat';
                } else {
                    slide.style.backgroundImage = '';
                }
            }
        }
        if (p.sliderCount !== undefined) {
            const count = Math.max(1, Math.min(10, parseInt(p.sliderCount) || 3));
            const track = el.querySelector('.slider-track');
            const dots = el.querySelector('.slider-dots');
            if (track) {
                const h = parseInt(el.dataset.sliderHeight) || 320;
                const existing = track.querySelectorAll('.slider-slide');
                const cur = existing.length;
                if (count > cur) {
                    const bgSize = el.dataset.slideBgSize || 'cover';
                    for (let i = cur + 1; i <= count; i++) {
                        const slide = document.createElement('div');
                        slide.className = 'slider-slide';
                        slide.style.cssText = `min-width:100%;height:${h}px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:0.75rem;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2rem;position:relative;overflow:hidden;background-size:${bgSize};background-position:center;background-repeat:no-repeat`;
                        slide.innerHTML = `<h3 style="color:#fff;font-size:1.25rem;font-weight:700;margin:0 0 0.5rem;position:relative;z-index:1" data-builder-type="heading">Slide ${i} Title</h3><p style="color:#94a3b8;position:relative;z-index:1" data-builder-type="text">Slide ${i} description.</p>`;
                        slide.dataset.builderType = 'text';
                        track.appendChild(slide);
                    }
                } else if (count < cur) {
                    for (let i = cur; i > count; i--) {
                        existing[i - 1].remove();
                    }
                }
                // Rebuild dots
                if (dots) {
                    dots.innerHTML = Array.from({length: count}, (_, i) =>
                        `<button style="width:8px;height:8px;border-radius:50%;background:${i===0?'#6366f1':'rgba(99,102,241,0.3)'};border:none;cursor:pointer;padding:0;transition:background 0.2s" onclick="sliderGo(this,${i})"></button>`
                    ).join('');
                }
                el.dataset.sliderIdx = '0';
                const t = el.querySelector('.slider-track');
                if (t) t.style.transform = 'translateX(0)';
            }
        }
        // ── Full-banner props ─────────────────────────────────
        if (el.dataset.builderType === 'full-banner') {
            if (p.src !== undefined) {
                if (p.src) {
                    el.style.backgroundImage = `url('${p.src}')`;
                    el.style.backgroundSize = 'cover';
                    el.style.backgroundPosition = 'center';
                } else {
                    el.style.backgroundImage = '';
                }
            }
            if (p.bannerOverlay !== undefined) {
                const overlay = el.querySelector('.banner-overlay');
                if (overlay) overlay.style.background = p.bannerOverlay;
            }
            if (p.minHeight !== undefined && p.minHeight) {
                el.style.minHeight = p.minHeight;
            }
        }
        // ── Stat-counter props ─────────────────────────────────
        if (el.dataset.builderType === 'stat-counter') {
            let changed = false;
            if (p.counterTo !== undefined && p.counterTo !== '') { el.dataset.counterTo = parseInt(p.counterTo) || 0; changed = true; }
            if (p.counterSuffix !== undefined) { el.dataset.counterSuffix = p.counterSuffix; changed = true; }
            if (p.counterPrefix !== undefined) { el.dataset.counterPrefix = p.counterPrefix; changed = true; }
            if (changed) runCounter(el);
        }
    }

    function applySection(p) {
        const sec = findSec(p.sectionId); if (!sec) return;
        if (p.bg!==undefined) sec.style.background = p.bg;
        if (p.paddingTop!==undefined && p.paddingTop!=='') sec.style.paddingTop = p.paddingTop+'px';
        if (p.paddingBottom!==undefined && p.paddingBottom!=='') sec.style.paddingBottom = p.paddingBottom+'px';
        if (p.paddingLeft!==undefined && p.paddingLeft!=='') sec.style.paddingLeft = p.paddingLeft+'px';
        if (p.paddingRight!==undefined && p.paddingRight!=='') sec.style.paddingRight = p.paddingRight+'px';
        if (p.minHeight!==undefined && p.minHeight!=='') sec.style.minHeight = p.minHeight+'px';
        if (p.bgImage!==undefined) {
            if (p.bgImage) {
                sec.style.backgroundImage = `url('${p.bgImage}')`;
                sec.style.backgroundSize = p.bgSize || 'cover';
                sec.style.backgroundPosition = p.bgPos || 'center';
                sec.style.backgroundRepeat = 'no-repeat';
            } else {
                sec.style.backgroundImage = '';
            }
        }
        if (p.visible!==undefined) sec.style.display = p.visible ? '' : 'none';
        if (p.id!==undefined) sec.id = p.id;
    }

    function deleteEl(id) {
        const el = findEl(id); if (!el) return;
        el.animate([{opacity:1},{opacity:0,transform:'scale(0.9)'}],{duration:200}).onfinish=()=>el.remove();
    }

    function moveEl({elId,direction}) {
        const el = findEl(elId); if (!el) return;
        const p = el.parentElement;
        if (direction==='up' && el.previousElementSibling) p.insertBefore(el,el.previousElementSibling);
        else if (direction==='down' && el.nextElementSibling) p.insertBefore(el.nextElementSibling,el);
    }

    function dupEl(id) {
        const el = findEl(id); if (!el) return;
        const c = el.cloneNode(true);
        c.dataset.builderEl = id+'-dup-'+Date.now();
        el.after(c);
        c.animate([{opacity:0,transform:'translateY(-8px)'},{opacity:1,transform:'translateY(0)'}],{duration:300});
    }

    function deleteSection(id) {
        const s = findSec(id); if (!s) return;
        s.animate([{opacity:1},{opacity:0}],{duration:250}).onfinish=()=>{
            s.remove();
            sendToParent({ type:'SECTION_DELETED', sections:getSectionsInfo() });
        };
    }

    function moveSection({sectionId,direction}) {
        const s = findSec(sectionId); if (!s) return;
        const sibling = direction==='up' ? s.previousElementSibling : s.nextElementSibling;
        if (sibling?.dataset?.builderSection) {
            direction==='up' ? s.before(sibling) : s.after(sibling);
        }
        sendToParent({ type:'SECTION_MOVED', sections:getSectionsInfo() });
    }

    // ── Add Element ───────────────────────────────────────────
    function addElementCmd({type, sectionId, beforeElId}) {
        const sec = findSec(sectionId); if (!sec) return;
        const near = beforeElId ? findEl(beforeElId) : null;
        addElToSection(type, sec, near);
    }

    function addElToSection(type, sec, nearEl) {
        const el = createElement(type); if (!el) return;
        el.dataset.builderEl = `${type}-${Date.now()}`;
        el.dataset.builderType = type;
        if (nearEl) nearEl.after(el);
        else sec.appendChild(el);
        el.animate([{opacity:0,transform:'translateY(-8px)'},{opacity:1,transform:'translateY(0)'}],{duration:300});
        selectElement(el);
        sendToParent({ type:'ELEMENT_ADDED', elId:el.dataset.builderEl, elType:type, sectionId:sec.dataset.builderSection });
    }

    function createElement(type) {
        const templates = {
            // ── Existing ──────────────────────────────────────
            heading: () => { const e=document.createElement('h2'); e.textContent='New Heading'; e.style.cssText='font-size:2rem;font-weight:800;color:#fff;margin:0.5rem 0'; return e; },
            text: () => { const e=document.createElement('p'); e.textContent='Add your text here. Double-click to edit inline.'; e.style.cssText='color:#94a3b8;line-height:1.7;margin:0.5rem 0'; return e; },
            button: () => { const e=document.createElement('a'); e.textContent='✨ Click Me'; e.href='#'; e.style.cssText='display:inline-flex;align-items:center;gap:0.5rem;padding:0.75rem 1.75rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:0.75rem;font-weight:700;text-decoration:none;font-size:0.95rem;margin:0.5rem 0;'; return e; },
            badge: () => { const e=document.createElement('span'); e.textContent='⚡ New Badge'; e.style.cssText='display:inline-flex;align-items:center;padding:0.25rem 0.875rem;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);color:#a5b4fc;border-radius:9999px;font-size:0.8rem;font-weight:700;margin:0.5rem 0'; return e; },
            divider: () => { const e=document.createElement('hr'); e.style.cssText='border:none;border-top:1px solid rgba(148,163,184,0.15);margin:1.5rem 0'; return e; },
            spacer: () => { const e=document.createElement('div'); e.style.cssText='height:40px;width:100%'; e.dataset.builderType='spacer'; return e; },
            image: () => { const e=document.createElement('img'); e.src='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" style="background:%231e293b"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="%2364748b" font-size="16" font-family="Inter,sans-serif">📷 Set Image URL in properties</text></svg>'; e.style.cssText='width:100%;border-radius:0.75rem;display:block;object-fit:cover'; e.alt='Image'; return e; },
            icon: () => { const e=document.createElement('div'); e.textContent='⭐'; e.style.cssText='font-size:3rem;text-align:center;margin:0.5rem 0'; return e; },
            video: () => { const e=document.createElement('div'); e.style.cssText='position:relative;padding-bottom:56.25%;background:#0f172a;border-radius:0.75rem;overflow:hidden;margin:0.5rem 0'; e.innerHTML='<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#475569;font-size:0.875rem;font-family:Inter,sans-serif" data-builder-type="text">▶️ Set video URL in properties panel →</div>'; return e; },
            card: () => { const e=document.createElement('div'); e.style.cssText='background:rgba(15,23,42,0.6);border:1px solid rgba(148,163,184,0.1);border-radius:1rem;padding:1.5rem;margin:0.5rem 0'; e.innerHTML='<h3 style="color:#fff;font-size:1.1rem;font-weight:700;margin:0 0 0.5rem" data-builder-type="heading">Card Title</h3><p style="color:#94a3b8;font-size:0.875rem" data-builder-type="text">Card description text. Double-click to edit.</p>'; return e; },
            'stat-box': () => { const e=document.createElement('div'); e.style.cssText='background:rgba(15,23,42,0.6);border:1px solid rgba(148,163,184,0.1);border-radius:1rem;padding:1.5rem;text-align:center;margin:0.5rem 0'; e.innerHTML='<div style="font-size:2.5rem;font-weight:900;color:#fff" data-builder-type="text">100+</div><div style="font-size:0.8rem;color:#64748b;margin-top:0.25rem" data-builder-type="text">Label</div>'; return e; },
            'columns-2': () => { const e=document.createElement('div'); e.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin:0.5rem 0'; e.innerHTML='<div style="background:rgba(15,23,42,0.4);border:1px dashed rgba(148,163,184,0.12);border-radius:0.75rem;padding:1.25rem;min-height:80px;display:flex;align-items:center;justify-content:center" data-builder-type="text"><span style="color:#334155;font-size:0.8rem">Column 1 — add elements here</span></div><div style="background:rgba(15,23,42,0.4);border:1px dashed rgba(148,163,184,0.12);border-radius:0.75rem;padding:1.25rem;min-height:80px;display:flex;align-items:center;justify-content:center" data-builder-type="text"><span style="color:#334155;font-size:0.8rem">Column 2 — add elements here</span></div>'; return e; },
            'columns-3': () => { const e=document.createElement('div'); e.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr;gap:1rem;margin:0.5rem 0'; e.innerHTML=['Col 1','Col 2','Col 3'].map(c=>`<div style="background:rgba(15,23,42,0.4);border:1px dashed rgba(148,163,184,0.12);border-radius:0.75rem;padding:1rem;min-height:60px;display:flex;align-items:center;justify-content:center" data-builder-type="text"><span style="color:#334155;font-size:0.75rem">${c}</span></div>`).join(''); return e; },
            'cta-banner': () => { const e=document.createElement('div'); e.style.cssText='background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.1));border:1px solid rgba(99,102,241,0.2);border-radius:1.25rem;padding:2.5rem;text-align:center;margin:0.5rem 0'; e.innerHTML='<h2 style="color:#fff;font-size:1.75rem;font-weight:800;margin:0 0 0.75rem" data-builder-type="heading">Call To Action</h2><p style="color:#94a3b8;margin:0 0 1.5rem" data-builder-type="text">Your compelling message here.</p><a href="#" style="display:inline-flex;padding:0.75rem 2rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:0.75rem;font-weight:700;text-decoration:none" data-builder-type="button">Get Started</a>'; return e; },
            navbar: () => {
                const e=document.createElement('nav');
                e.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:0.85rem 1rem;background:rgba(15,23,42,0.82);border:1px solid rgba(148,163,184,0.12);border-radius:0.85rem;margin:0.5rem 0;font-family:Inter,sans-serif';
                e.innerHTML='<a href="#" style="color:#fff;text-decoration:none;font-weight:900;font-size:1rem" data-builder-type="button">Fronty</a><div style="display:flex;align-items:center;gap:0.85rem;flex-wrap:wrap"><a href="#products" style="color:#94a3b8;text-decoration:none;font-size:0.85rem;font-weight:700" data-builder-type="button">Products</a><a href="#features" style="color:#94a3b8;text-decoration:none;font-size:0.85rem;font-weight:700" data-builder-type="button">Features</a><a href="#contact" style="color:#94a3b8;text-decoration:none;font-size:0.85rem;font-weight:700" data-builder-type="button">Contact</a></div><a href="sell.html" style="display:inline-flex;padding:0.55rem 0.85rem;background:#2563eb;color:#fff;border-radius:0.5rem;text-decoration:none;font-size:0.8rem;font-weight:850" data-builder-type="button">Sell item</a>';
                return e;
            },
            'hero-block': () => {
                const e=document.createElement('div');
                e.style.cssText='display:grid;grid-template-columns:1.1fr 0.9fr;gap:2rem;align-items:center;padding:2.25rem;background:linear-gradient(135deg,rgba(37,99,235,0.16),rgba(20,184,166,0.1));border:1px solid rgba(148,163,184,0.12);border-radius:1.25rem;margin:0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML='<div><span style="display:inline-flex;padding:0.25rem 0.7rem;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.24);border-radius:999px;color:#86efac;font-size:0.76rem;font-weight:850;margin-bottom:0.85rem" data-builder-type="badge">New section</span><h1 style="color:#fff;font-size:2.75rem;line-height:1.05;font-weight:950;margin:0 0 0.85rem" data-builder-type="heading">Build your page faster</h1><p style="color:#94a3b8;font-size:1rem;line-height:1.7;margin:0 0 1.25rem" data-builder-type="text">Edit this hero block, tune every style, and connect it to your page action.</p><a href="#" style="display:inline-flex;padding:0.75rem 1.1rem;background:#2563eb;color:#fff;border-radius:0.55rem;text-decoration:none;font-weight:850" data-builder-type="button">Start now</a></div><div style="min-height:220px;border-radius:1rem;background:rgba(15,23,42,0.6);border:1px solid rgba(148,163,184,0.12);display:flex;align-items:center;justify-content:center;color:#64748b;font-weight:900" data-builder-type="text">Visual area</div>';
                return e;
            },
            'stats-row': () => { const e=document.createElement('div'); e.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin:0.5rem 0'; ['🛒 1K+ Products','👥 500+ Sellers','⭐ 99% Rating'].forEach(l=>{ const d=document.createElement('div'); d.style.cssText='text-align:center;background:rgba(15,23,42,0.4);border:1px solid rgba(148,163,184,0.08);border-radius:1rem;padding:1.25rem'; d.dataset.builderType='text'; d.textContent=l; e.appendChild(d); }); return e; },
            slider: () => {
                const e=document.createElement('div'); e.style.cssText='position:relative;overflow:hidden;border-radius:1rem;margin:0.5rem 0;background:rgba(15,23,42,0.6)';
                e.dataset.sliderIdx = '0';
                e.dataset.sliderHeight = '320';
                e.dataset.sliderAutoplay = '0';
                e.innerHTML=`
                    <div class="slider-track" style="display:flex;transition:transform 0.4s ease">
                        ${[1,2,3].map(i=>`<div class="slider-slide" style="min-width:100%;height:320px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:0.75rem;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2rem;position:relative;overflow:hidden;background-size:cover;background-position:center">
                            <h3 style="color:#fff;font-size:1.25rem;font-weight:700;margin:0 0 0.5rem;position:relative;z-index:1" data-builder-type="heading">Slide ${i} Title</h3>
                            <p style="color:#94a3b8;position:relative;z-index:1" data-builder-type="text">Slide ${i} description text here.</p>
                        </div>`).join('')}
                    </div>
                    <div class="slider-dots" style="display:flex;justify-content:center;gap:0.5rem;padding:0.75rem 0;background:rgba(0,0,0,0.3)">
                        ${[0,1,2].map(i => `<button style="width:8px;height:8px;border-radius:50%;background:${i===0?'#6366f1':'rgba(99,102,241,0.3)'};border:none;cursor:pointer;padding:0;transition:background 0.2s" onclick="sliderGo(this,${i})"></button>`).join('')}
                    </div>
                    <button onclick="sliderPrev(this)" style="position:absolute;left:0.5rem;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);border:1px solid rgba(148,163,184,0.2);border-radius:50%;width:36px;height:36px;color:#fff;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;z-index:10">‹</button>
                    <button onclick="sliderNext(this)" style="position:absolute;right:0.5rem;top:50%;transform:translateY(-50%);background:rgba(0,0,0,0.5);border:1px solid rgba(148,163,184,0.2);border-radius:50%;width:36px;height:36px;color:#fff;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;z-index:10">›</button>
                `;
                return e;
            },

            // ── Form Elements ──────────────────────────────────
            'form-input': () => {
                const e = document.createElement('div');
                e.style.cssText = 'margin:0.5rem 0;display:flex;flex-direction:column;gap:0.35rem';
                e.innerHTML = `
                    <label style="font-size:0.85rem;font-weight:600;color:#cbd5e1;font-family:Inter,sans-serif" data-builder-type="text">Your Label</label>
                    <input type="text" placeholder="Enter text here..." style="padding:0.65rem 0.875rem;background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.15);border-radius:0.5rem;color:#e2e8f0;font-size:0.9rem;font-family:Inter,sans-serif;outline:none;width:100%" />
                `;
                return e;
            },
            'form-textarea': () => {
                const e = document.createElement('div');
                e.style.cssText = 'margin:0.5rem 0;display:flex;flex-direction:column;gap:0.35rem';
                e.innerHTML = `
                    <label style="font-size:0.85rem;font-weight:600;color:#cbd5e1;font-family:Inter,sans-serif" data-builder-type="text">Your Message</label>
                    <textarea rows="4" placeholder="Enter your message here..." style="padding:0.65rem 0.875rem;background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.15);border-radius:0.5rem;color:#e2e8f0;font-size:0.9rem;font-family:Inter,sans-serif;outline:none;width:100%;resize:vertical"></textarea>
                `;
                return e;
            },
            'form-select': () => {
                const e = document.createElement('div');
                e.style.cssText = 'margin:0.5rem 0;display:flex;flex-direction:column;gap:0.35rem';
                e.innerHTML = `
                    <label style="font-size:0.85rem;font-weight:600;color:#cbd5e1;font-family:Inter,sans-serif" data-builder-type="text">Select an Option</label>
                    <select style="padding:0.65rem 0.875rem;background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.15);border-radius:0.5rem;color:#e2e8f0;font-size:0.9rem;font-family:Inter,sans-serif;outline:none;width:100%;cursor:pointer">
                        <option>Option 1</option>
                        <option>Option 2</option>
                        <option>Option 3</option>
                    </select>
                `;
                return e;
            },
            'form-container': () => {
                const e = document.createElement('div');
                e.style.cssText = 'background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.1);border-radius:1rem;padding:2rem;margin:0.5rem 0';
                e.innerHTML = `
                    <h3 style="color:#fff;font-size:1.25rem;font-weight:700;margin:0 0 1.25rem;font-family:Inter,sans-serif" data-builder-type="heading">Contact Us</h3>
                    <div style="display:flex;flex-direction:column;gap:1rem">
                        <div style="display:flex;flex-direction:column;gap:0.35rem">
                            <label style="font-size:0.85rem;font-weight:600;color:#cbd5e1;font-family:Inter,sans-serif" data-builder-type="text">Name</label>
                            <input type="text" placeholder="Your name" style="padding:0.65rem 0.875rem;background:rgba(10,14,26,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:0.5rem;color:#e2e8f0;font-size:0.9rem;font-family:Inter,sans-serif;outline:none;width:100%" />
                        </div>
                        <div style="display:flex;flex-direction:column;gap:0.35rem">
                            <label style="font-size:0.85rem;font-weight:600;color:#cbd5e1;font-family:Inter,sans-serif" data-builder-type="text">Email</label>
                            <input type="email" placeholder="your@email.com" style="padding:0.65rem 0.875rem;background:rgba(10,14,26,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:0.5rem;color:#e2e8f0;font-size:0.9rem;font-family:Inter,sans-serif;outline:none;width:100%" />
                        </div>
                        <div style="display:flex;flex-direction:column;gap:0.35rem">
                            <label style="font-size:0.85rem;font-weight:600;color:#cbd5e1;font-family:Inter,sans-serif" data-builder-type="text">Message</label>
                            <textarea rows="4" placeholder="Your message..." style="padding:0.65rem 0.875rem;background:rgba(10,14,26,0.6);border:1px solid rgba(148,163,184,0.15);border-radius:0.5rem;color:#e2e8f0;font-size:0.9rem;font-family:Inter,sans-serif;outline:none;width:100%;resize:vertical"></textarea>
                        </div>
                        <button style="padding:0.75rem 1.75rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:0.75rem;font-size:0.95rem;font-weight:700;cursor:pointer;font-family:Inter,sans-serif" data-builder-type="button">Send Message →</button>
                    </div>
                `;
                return e;
            },

            // ── Advanced Elements ──────────────────────────────
            alert: () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:flex;align-items:flex-start;gap:0.75rem;padding:1rem 1.25rem;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.25);border-radius:0.75rem;margin:0.5rem 0;font-family:Inter,sans-serif;position:relative';
                e.innerHTML = `
                    <span style="font-size:1.2rem;flex-shrink:0;margin-top:0.1rem">ℹ️</span>
                    <div style="flex:1">
                        <p style="color:#6ee7b7;font-weight:700;margin:0 0 0.2rem;font-size:0.9rem" data-builder-type="heading">Info Alert</p>
                        <p style="color:#a7f3d0;font-size:0.85rem;margin:0;line-height:1.5" data-builder-type="text">This is an alert message. Double-click to edit.</p>
                    </div>
                    <button onclick="this.parentElement.style.display='none'" style="background:none;border:none;color:#6ee7b7;cursor:pointer;font-size:1.1rem;flex-shrink:0;line-height:1;opacity:0.7">✕</button>
                `;
                return e;
            },
            quote: () => {
                const e = document.createElement('blockquote');
                e.style.cssText = 'margin:0.5rem 0;padding:1.25rem 1.5rem;border-left:4px solid #6366f1;background:rgba(99,102,241,0.06);border-radius:0 0.75rem 0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <p style="color:#e2e8f0;font-size:1.1rem;font-style:italic;line-height:1.7;margin:0 0 0.75rem" data-builder-type="text">"The best way to predict the future is to create it."</p>
                    <footer style="color:#64748b;font-size:0.85rem;font-weight:600" data-builder-type="text">— Author Name</footer>
                `;
                return e;
            },
            list: () => {
                const e = document.createElement('ul');
                e.style.cssText = 'list-style:none;margin:0.5rem 0;padding:0;display:flex;flex-direction:column;gap:0.5rem;font-family:Inter,sans-serif';
                e.innerHTML = ['First list item with great content', 'Second list item here', 'Third list item and more'].map(text => `
                    <li style="display:flex;align-items:center;gap:0.75rem;padding:0.625rem 0.875rem;background:rgba(15,23,42,0.4);border:1px solid rgba(148,163,184,0.08);border-radius:0.625rem">
                        <span style="width:8px;height:8px;background:#6366f1;border-radius:50%;flex-shrink:0"></span>
                        <span style="color:#cbd5e1;font-size:0.9rem" data-builder-type="text">${text}</span>
                    </li>
                `).join('');
                return e;
            },
            table: () => {
                const e = document.createElement('div');
                e.style.cssText = 'overflow:auto;border:1px solid rgba(148,163,184,0.14);border-radius:0.9rem;margin:0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <table style="width:100%;border-collapse:collapse;min-width:520px">
                        <thead style="background:rgba(15,23,42,0.92)">
                            <tr>${['Plan','Price','Status'].map(h => `<th style="padding:0.85rem;text-align:left;color:#fff;font-size:0.84rem;font-weight:850" data-builder-type="heading">${h}</th>`).join('')}</tr>
                        </thead>
                        <tbody>
                            ${[
                                ['Starter','$0','Active'],
                                ['Pro','$29','Popular'],
                                ['Enterprise','Custom','Contact'],
                            ].map((row, i) => `<tr style="background:${i % 2 ? 'rgba(15,23,42,0.45)' : 'rgba(15,23,42,0.62)'};border-top:1px solid rgba(148,163,184,0.08)">${row.map(cell => `<td style="padding:0.8rem;color:#cbd5e1;font-size:0.86rem" data-builder-type="text">${cell}</td>`).join('')}</tr>`).join('')}
                        </tbody>
                    </table>
                `;
                return e;
            },
            'progress-bar': () => {
                const e = document.createElement('div');
                e.style.cssText = 'margin:0.5rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <div style="display:flex;justify-content:space-between;margin-bottom:0.4rem">
                        <span style="font-size:0.85rem;font-weight:600;color:#cbd5e1" data-builder-type="text">Skill Name</span>
                        <span style="font-size:0.85rem;font-weight:700;color:#a5b4fc" data-builder-type="text">75%</span>
                    </div>
                    <div style="height:8px;background:rgba(148,163,184,0.1);border-radius:9999px;overflow:hidden">
                        <div style="height:100%;width:75%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:9999px;transition:width 0.6s ease"></div>
                    </div>
                `;
                return e;
            },
            'columns-4': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin:0.5rem 0';
                e.innerHTML = ['Col 1','Col 2','Col 3','Col 4'].map(c => `
                    <div style="background:rgba(15,23,42,0.4);border:1px dashed rgba(148,163,184,0.12);border-radius:0.75rem;padding:1rem;min-height:60px;display:flex;align-items:center;justify-content:center" data-builder-type="text">
                        <span style="color:#334155;font-size:0.75rem">${c}</span>
                    </div>
                `).join('');
                return e;
            },
            countdown: () => {
                const e = document.createElement('div');
                e.style.cssText = 'margin:0.5rem 0;text-align:center;font-family:Inter,sans-serif';
                const targetDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                e.dataset.countdownTarget = targetDate;
                e.innerHTML = `
                    <p style="color:#94a3b8;font-size:0.85rem;margin:0 0 1rem" data-builder-type="text">Offer ends in:</p>
                    <div style="display:flex;justify-content:center;gap:1rem">
                        ${['days','hours','mins','secs'].map(unit => `
                            <div style="text-align:center">
                                <div class="cd-${unit}" style="font-size:2.5rem;font-weight:900;color:#fff;line-height:1;min-width:60px">00</div>
                                <div style="font-size:0.7rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;margin-top:0.25rem">${unit}</div>
                            </div>
                        `).join('')}
                    </div>
                `;
                // Start countdown logic
                const updateCountdown = () => {
                    const target = new Date(e.dataset.countdownTarget).getTime();
                    const now = Date.now();
                    const diff = Math.max(0, target - now);
                    const d = Math.floor(diff / 86400000);
                    const h = Math.floor((diff % 86400000) / 3600000);
                    const m = Math.floor((diff % 3600000) / 60000);
                    const s = Math.floor((diff % 60000) / 1000);
                    const pad = n => String(n).padStart(2,'0');
                    const days = e.querySelector('.cd-days'); if(days) days.textContent = pad(d);
                    const hours = e.querySelector('.cd-hours'); if(hours) hours.textContent = pad(h);
                    const mins = e.querySelector('.cd-mins'); if(mins) mins.textContent = pad(m);
                    const secs = e.querySelector('.cd-secs'); if(secs) secs.textContent = pad(s);
                };
                updateCountdown();
                const interval = setInterval(updateCountdown, 1000);
                e._countdownInterval = interval;
                return e;
            },
            'map-embed': () => {
                const e = document.createElement('div');
                e.style.cssText = 'margin:0.5rem 0;border-radius:1rem;overflow:hidden;position:relative';
                e.innerHTML = `
                    <iframe
                        src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3022.215175758978!2d-73.9855!3d40.7484!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zNDDCsDQ0JzU0LjIiTiA3M8KwNTknMDcuOCJX!5e0!3m2!1sen!2sus!4v1"
                        width="100%" height="300" style="border:none;display:block" allowfullscreen loading="lazy"
                        referrerpolicy="no-referrer-when-downgrade"></iframe>
                    <div style="position:absolute;top:0.5rem;left:0.5rem;background:rgba(0,0,0,0.7);color:#fff;padding:0.25rem 0.625rem;border-radius:0.375rem;font-size:0.7rem;font-family:Inter,sans-serif;pointer-events:none">📍 Map Embed — update iframe src to change location</div>
                `;
                return e;
            },
            'full-banner': () => {
                const e = document.createElement('div');
                e.style.cssText = 'position:relative;width:100%;min-height:400px;border-radius:1rem;overflow:hidden;margin:0.5rem 0;display:flex;align-items:center;justify-content:center;background:#0f172a;background-size:cover;background-position:center;background-repeat:no-repeat';
                e.dataset.builderType = 'full-banner';
                e.innerHTML = `
                    <div class="banner-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,0.45);z-index:1"></div>
                    <div style="position:relative;z-index:2;text-align:center;padding:3rem 2rem;max-width:700px">
                        <span style="display:inline-flex;padding:0.25rem 0.875rem;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);border-radius:9999px;color:#a5b4fc;font-size:0.8rem;font-weight:700;margin-bottom:1rem" data-builder-type="badge">🔥 Special Offer</span>
                        <h2 style="color:#fff;font-size:2.5rem;font-weight:900;line-height:1.1;margin:0 0 1rem" data-builder-type="heading">Full Width Banner</h2>
                        <p style="color:rgba(255,255,255,0.8);font-size:1.05rem;line-height:1.7;margin:0 0 1.75rem" data-builder-type="text">Set a background image from the properties panel. Add your message and call to action here.</p>
                        <a href="#" style="display:inline-flex;padding:0.85rem 2.25rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:0.75rem;font-weight:700;text-decoration:none;font-size:1rem" data-builder-type="button">Shop Now →</a>
                    </div>
                    <div style="position:absolute;bottom:0.75rem;right:0.75rem;z-index:3;font-size:0.65rem;color:rgba(255,255,255,0.4);font-family:Inter,sans-serif;pointer-events:none">📷 Set image in properties</div>
                `;
                return e;
            },
            'html-embed': () => {
                const e = document.createElement('div');
                e.style.cssText = 'margin:0.5rem 0;background:rgba(15,23,42,0.6);border:1px solid rgba(99,102,241,0.2);border-radius:0.75rem;padding:1rem;font-family:Courier New,monospace';
                e.innerHTML = `
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem">
                        <span style="font-size:0.8rem;color:#a5b4fc;font-weight:700">&lt;/&gt; HTML Block</span>
                    </div>
                    <code style="display:block;color:#7dd3fc;font-size:0.8rem;line-height:1.7;white-space:pre-wrap" data-builder-type="text">&lt;p&gt;Edit this HTML block directly in the canvas or properties panel.&lt;/p&gt;</code>
                `;
                return e;
            },
            'js-code': () => {
                const e = document.createElement('div');
                const defaultCode = "console.log('Fronty JS block loaded');";
                e.dataset.customJs = defaultCode;
                e.style.cssText = 'margin:0.5rem 0;background:rgba(15,23,42,0.72);border:1px solid rgba(245,158,11,0.25);border-radius:0.75rem;padding:1rem;font-family:Courier New,monospace';
                e.innerHTML = `
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;margin-bottom:0.75rem">
                        <span style="font-size:0.8rem;color:#fde68a;font-weight:700">JS Code Block</span>
                        <span style="font-size:0.68rem;color:#64748b">Exports as &lt;script&gt;</span>
                    </div>
                    <code data-js-code-preview style="display:block;color:#fde68a;font-size:0.8rem;line-height:1.7;white-space:pre-wrap">${defaultCode}</code>
                `;
                return e;
            },
            'social-links': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;margin:0.5rem 0;font-family:Inter,sans-serif';
                const socials = [
                    { name: 'Twitter', icon: '𝕏', bg: '#000', href: '#' },
                    { name: 'GitHub', icon: '⌥', bg: '#24292e', href: '#' },
                    { name: 'LinkedIn', icon: 'in', bg: '#0077b5', href: '#' },
                    { name: 'Instagram', icon: '📷', bg: 'linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)', href: '#' },
                    { name: 'YouTube', icon: '▶', bg: '#ff0000', href: '#' },
                ];
                e.innerHTML = socials.map(s => `
                    <a href="${s.href}" style="width:38px;height:38px;background:${s.bg};border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;text-decoration:none;font-size:0.85rem;font-weight:700;flex-shrink:0;transition:transform 0.15s" title="${s.name}"
                       onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'"
                       data-builder-type="button">${s.icon}</a>
                `).join('');
                return e;
            },
            'pricing-card': () => {
                const e = document.createElement('div');
                e.style.cssText = 'background:rgba(15,23,42,0.8);border:1px solid rgba(99,102,241,0.25);border-radius:1.25rem;padding:2rem;text-align:center;max-width:320px;margin:0.5rem auto;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <div style="display:inline-flex;padding:0.25rem 0.875rem;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:9999px;color:#a5b4fc;font-size:0.75rem;font-weight:700;margin-bottom:1rem" data-builder-type="badge">Pro Plan</div>
                    <div style="margin-bottom:1.5rem">
                        <span style="font-size:3rem;font-weight:900;color:#fff;line-height:1" data-builder-type="text">$29</span>
                        <span style="font-size:0.9rem;color:#64748b;font-weight:500" data-builder-type="text"> / month</span>
                    </div>
                    <ul style="list-style:none;padding:0;margin:0 0 1.5rem;display:flex;flex-direction:column;gap:0.625rem;text-align:left">
                        ${['Unlimited projects','Priority support','Advanced analytics','Custom domain'].map(f => `
                            <li style="display:flex;align-items:center;gap:0.625rem;color:#cbd5e1;font-size:0.875rem">
                                <span style="color:#10b981;font-weight:700;flex-shrink:0">✓</span>
                                <span data-builder-type="text">${f}</span>
                            </li>
                        `).join('')}
                    </ul>
                    <a href="#" style="display:block;padding:0.75rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:0.75rem;font-weight:700;text-decoration:none;font-size:0.9rem" data-builder-type="button">Get Started →</a>
                `;
                return e;
            },
            'product-card': () => {
                const e = document.createElement('article');
                e.style.cssText = 'overflow:hidden;background:rgba(15,23,42,0.82);border:1px solid rgba(148,163,184,0.14);border-radius:1rem;box-shadow:0 16px 36px rgba(0,0,0,0.22);max-width:340px;margin:0.5rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <img src="uploads/img_69a3991cbc24d.jpg" alt="Product image" style="width:100%;height:210px;object-fit:cover;display:block" data-builder-type="image">
                    <div style="padding:1rem">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;margin-bottom:0.65rem">
                            <span style="display:inline-flex;padding:0.2rem 0.65rem;background:rgba(16,185,129,0.13);border:1px solid rgba(16,185,129,0.28);border-radius:999px;color:#86efac;font-size:0.74rem;font-weight:800" data-builder-type="badge">Verified</span>
                            <span style="color:#fbbf24;font-size:0.8rem;font-weight:800" data-builder-type="text">4.9 rating</span>
                        </div>
                        <h3 style="color:#fff;font-size:1.08rem;font-weight:850;margin:0 0 0.35rem;line-height:1.3" data-builder-type="heading">Premium Tech Item</h3>
                        <p style="color:#94a3b8;font-size:0.86rem;line-height:1.55;margin:0 0 1rem" data-builder-type="text">Clean product description with condition, location, and key selling point.</p>
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:1rem">
                            <strong style="color:#fff;font-size:1.3rem" data-builder-type="text">$249</strong>
                            <a href="#" style="display:inline-flex;padding:0.62rem 0.95rem;background:#2563eb;color:#fff;border-radius:0.5rem;font-size:0.82rem;font-weight:800;text-decoration:none" data-builder-type="button">View Item</a>
                        </div>
                    </div>
                `;
                return e;
            },
            'product-grid': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML = ['Phone Pro Max','Gaming Laptop','Wireless Headset'].map((name, i) => `
                    <article style="overflow:hidden;background:rgba(15,23,42,0.82);border:1px solid rgba(148,163,184,0.14);border-radius:1rem">
                        <img src="uploads/img_69a3991cbc24d.jpg" alt="${name}" style="width:100%;height:160px;object-fit:cover;display:block" data-builder-type="image">
                        <div style="padding:0.9rem">
                            <span style="color:#38bdf8;font-size:0.72rem;font-weight:800;text-transform:uppercase;letter-spacing:0.06em" data-builder-type="badge">${['Phones','Laptops','Accessories'][i]}</span>
                            <h3 style="color:#fff;font-size:0.98rem;font-weight:800;margin:0.35rem 0" data-builder-type="heading">${name}</h3>
                            <div style="display:flex;align-items:center;justify-content:space-between">
                                <strong style="color:#fff;font-size:1.08rem" data-builder-type="text">$${[449,899,129][i]}</strong>
                                <a href="#" style="color:#93c5fd;text-decoration:none;font-size:0.8rem;font-weight:800" data-builder-type="button">Details</a>
                            </div>
                        </div>
                    </article>
                `).join('');
                return e;
            },
            'category-strip': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.65rem;margin:0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML = ['Phones','Laptops','Gaming','Audio','Accessories','Cameras'].map(item => `
                    <a href="#" style="display:inline-flex;align-items:center;gap:0.45rem;padding:0.7rem 0.95rem;background:rgba(15,23,42,0.78);border:1px solid rgba(148,163,184,0.14);border-radius:0.75rem;color:#e2e8f0;text-decoration:none;font-size:0.86rem;font-weight:800" data-builder-type="button">
                        <span style="width:8px;height:8px;border-radius:50%;background:#22c55e"></span>${item}
                    </a>
                `).join('');
                return e;
            },
            'trust-badges': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0.75rem;margin:0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML = [
                    ['Secure Payment','Protected checkout'],
                    ['Verified Sellers','Reviewed listings'],
                    ['Fast Support','Help when needed'],
                    ['Easy Returns','Clear policy'],
                ].map(([title, sub]) => `
                    <div style="background:rgba(15,23,42,0.76);border:1px solid rgba(148,163,184,0.12);border-radius:0.875rem;padding:1rem;text-align:center">
                        <div style="width:34px;height:34px;border-radius:0.65rem;background:rgba(34,197,94,0.14);margin:0 auto 0.65rem;display:flex;align-items:center;justify-content:center;color:#86efac;font-weight:900">OK</div>
                        <h3 style="color:#fff;font-size:0.88rem;font-weight:850;margin:0 0 0.25rem" data-builder-type="heading">${title}</h3>
                        <p style="color:#64748b;font-size:0.75rem;margin:0" data-builder-type="text">${sub}</p>
                    </div>
                `).join('');
                return e;
            },
            'comparison-table': () => {
                const e = document.createElement('div');
                e.style.cssText = 'overflow:hidden;border:1px solid rgba(148,163,184,0.14);border-radius:1rem;margin:0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;background:rgba(15,23,42,0.92);color:#fff;font-weight:850">
                        <div style="padding:0.9rem" data-builder-type="heading">Feature</div><div style="padding:0.9rem;text-align:center" data-builder-type="heading">Basic</div><div style="padding:0.9rem;text-align:center" data-builder-type="heading">Pro</div>
                    </div>
                    ${['Verified listings','Priority placement','Analytics','Custom branding'].map((label, i) => `
                        <div style="display:grid;grid-template-columns:1.4fr 1fr 1fr;background:${i % 2 ? 'rgba(15,23,42,0.48)' : 'rgba(15,23,42,0.66)'};border-top:1px solid rgba(148,163,184,0.08)">
                            <div style="padding:0.85rem;color:#cbd5e1" data-builder-type="text">${label}</div>
                            <div style="padding:0.85rem;text-align:center;color:#94a3b8" data-builder-type="text">${i < 2 ? 'Yes' : 'No'}</div>
                            <div style="padding:0.85rem;text-align:center;color:#86efac;font-weight:850" data-builder-type="text">Yes</div>
                        </div>
                    `).join('')}
                `;
                return e;
            },
            'logo-cloud': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:0.75rem;margin:0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML = ['NOVA','ORBIT','PIXEL','APEX','VOLT'].map(name => `
                    <div style="height:70px;border:1px solid rgba(148,163,184,0.12);border-radius:0.75rem;background:rgba(15,23,42,0.58);display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.9rem;font-weight:900;letter-spacing:0.12em" data-builder-type="text">${name}</div>
                `).join('');
                return e;
            },
            'contact-card': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:grid;grid-template-columns:1fr 1.15fr;gap:1rem;background:rgba(15,23,42,0.78);border:1px solid rgba(148,163,184,0.13);border-radius:1rem;padding:1.25rem;margin:0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <div>
                        <h3 style="color:#fff;font-size:1.35rem;font-weight:850;margin:0 0 0.6rem" data-builder-type="heading">Talk to us</h3>
                        <p style="color:#94a3b8;line-height:1.65;margin:0 0 1rem" data-builder-type="text">Send a message and we will get back to you with the details.</p>
                        <p style="color:#cbd5e1;font-size:0.86rem;margin:0.35rem 0" data-builder-type="text">support@fronty.local</p>
                        <p style="color:#cbd5e1;font-size:0.86rem;margin:0.35rem 0" data-builder-type="text">Cairo, Egypt</p>
                    </div>
                    <form style="display:grid;gap:0.65rem">
                        <input placeholder="Name" style="padding:0.72rem 0.85rem;background:rgba(2,6,23,0.55);border:1px solid rgba(148,163,184,0.15);border-radius:0.55rem;color:#e2e8f0;font-family:Inter,sans-serif">
                        <input placeholder="Email" style="padding:0.72rem 0.85rem;background:rgba(2,6,23,0.55);border:1px solid rgba(148,163,184,0.15);border-radius:0.55rem;color:#e2e8f0;font-family:Inter,sans-serif">
                        <textarea placeholder="Message" rows="3" style="padding:0.72rem 0.85rem;background:rgba(2,6,23,0.55);border:1px solid rgba(148,163,184,0.15);border-radius:0.55rem;color:#e2e8f0;font-family:Inter,sans-serif;resize:vertical"></textarea>
                        <button style="padding:0.75rem 1rem;background:#2563eb;color:#fff;border:0;border-radius:0.55rem;font-weight:850;font-family:Inter,sans-serif" data-builder-type="button">Send Message</button>
                    </form>
                `;
                return e;
            },
            steps: () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML = ['Choose a template','Customize content','Publish clean HTML'].map((title, i) => `
                    <div style="position:relative;background:rgba(15,23,42,0.72);border:1px solid rgba(148,163,184,0.12);border-radius:1rem;padding:1.25rem">
                        <div style="width:34px;height:34px;border-radius:0.65rem;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;margin-bottom:0.85rem">${i + 1}</div>
                        <h3 style="color:#fff;font-size:1rem;font-weight:850;margin:0 0 0.4rem" data-builder-type="heading">${title}</h3>
                        <p style="color:#94a3b8;font-size:0.84rem;line-height:1.6;margin:0" data-builder-type="text">Short explanation for this step. Edit it to match your workflow.</p>
                    </div>
                `).join('');
                return e;
            },
            'feature-list': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:grid;gap:0.65rem;margin:0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML = ['Reusable sections','Clean export','Responsive preview','Fine style controls'].map(item => `
                    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 0.9rem;background:rgba(15,23,42,0.62);border:1px solid rgba(148,163,184,0.1);border-radius:0.7rem">
                        <span style="width:22px;height:22px;border-radius:50%;background:rgba(34,197,94,0.14);display:flex;align-items:center;justify-content:center;color:#86efac;font-size:0.72rem;font-weight:900">OK</span>
                        <span style="color:#cbd5e1;font-size:0.9rem" data-builder-type="text">${item}</span>
                    </div>
                `).join('');
                return e;
            },
            'testimonial-card': () => {
                const e = document.createElement('figure');
                e.style.cssText = 'background:rgba(15,23,42,0.78);border:1px solid rgba(148,163,184,0.13);border-radius:1rem;padding:1.35rem;margin:0.75rem 0;max-width:520px;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <div style="color:#fbbf24;font-size:0.9rem;margin-bottom:0.85rem" data-builder-type="text">★★★★★</div>
                    <blockquote style="color:#e2e8f0;font-size:1rem;line-height:1.7;margin:0 0 1rem" data-builder-type="text">"The builder made it easy to update the storefront without touching the main files."</blockquote>
                    <figcaption style="display:flex;align-items:center;gap:0.75rem">
                        <div style="width:42px;height:42px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900">FR</div>
                        <div><div style="color:#fff;font-weight:850" data-builder-type="heading">Fronty User</div><div style="color:#64748b;font-size:0.8rem" data-builder-type="text">Store owner</div></div>
                    </figcaption>
                `;
                return e;
            },
            tabs: () => {
                const e = document.createElement('div');
                e.dataset.component = 'tabs';
                e.style.cssText = 'background:rgba(15,23,42,0.72);border:1px solid rgba(148,163,184,0.12);border-radius:1rem;padding:0.75rem;margin:0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <div style="display:flex;gap:0.4rem;margin-bottom:0.75rem">
                        ${['Overview','Details','Reviews'].map((tab, i) => `<button onclick="builderTabGo(this,${i})" style="padding:0.55rem 0.8rem;background:${i===0?'#2563eb':'rgba(148,163,184,0.08)'};color:${i===0?'#fff':'#94a3b8'};border:0;border-radius:0.5rem;font-weight:800;font-family:Inter,sans-serif;cursor:pointer" data-builder-type="button">${tab}</button>`).join('')}
                    </div>
                    ${['Overview content goes here.','Detailed product information and specs.','Customer review summary.'].map((text, i) => `<div class="builder-tab-panel" style="${i===0?'display:block':'display:none'};color:#cbd5e1;line-height:1.65;padding:0.65rem" data-builder-type="text">${text}</div>`).join('')}
                `;
                return e;
            },
            accordion: () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:grid;gap:0.55rem;margin:0.75rem 0;font-family:Inter,sans-serif';
                e.innerHTML = ['Shipping details','Payment options','Return policy'].map((title, i) => `
                    <div style="background:rgba(15,23,42,0.72);border:1px solid rgba(148,163,184,0.12);border-radius:0.8rem;overflow:hidden">
                        <button onclick="builderAccordionToggle(this)" style="width:100%;display:flex;justify-content:space-between;align-items:center;padding:0.85rem 1rem;background:transparent;border:0;color:#fff;font-weight:850;text-align:left;font-family:Inter,sans-serif;cursor:pointer" data-builder-type="button">${title}<span>+</span></button>
                        <div style="${i===0?'display:block':'display:none'};padding:0 1rem 0.9rem;color:#94a3b8;line-height:1.6;font-size:0.88rem" data-builder-type="text">Write the answer here. This block can be edited inline.</div>
                    </div>
                `).join('');
                return e;
            },

            // ── Advanced+ Elements ─────────────────────────────
            'icon-box': () => {
                const e = document.createElement('div');
                e.style.cssText = 'background:rgba(15,23,42,0.72);border:1px solid rgba(148,163,184,0.12);border-radius:1rem;padding:1.6rem;text-align:center;max-width:320px;margin:0.5rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <div style="width:56px;height:56px;margin:0 auto 1rem;border-radius:0.9rem;background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.16));display:flex;align-items:center;justify-content:center;font-size:1.6rem" data-builder-type="icon">⚡</div>
                    <h3 style="color:#fff;font-size:1.05rem;font-weight:850;margin:0 0 0.5rem" data-builder-type="heading">Feature Title</h3>
                    <p style="color:#94a3b8;font-size:0.88rem;line-height:1.65;margin:0" data-builder-type="text">Short supporting description for this feature. Double-click to edit.</p>
                `;
                return e;
            },
            'gradient-heading': () => {
                const e = document.createElement('h2');
                e.textContent = 'Gradient Headline';
                e.style.cssText = 'font-size:2.75rem;font-weight:950;line-height:1.1;margin:0.5rem 0;background:linear-gradient(135deg,#6366f1,#ec4899,#f59e0b);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;font-family:Inter,sans-serif';
                return e;
            },
            'highlight-box': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:flex;align-items:flex-start;gap:0.85rem;padding:1.1rem 1.25rem;background:rgba(99,102,241,0.08);border-left:4px solid #6366f1;border-radius:0 0.85rem 0.85rem 0;margin:0.5rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <span style="font-size:1.3rem;flex-shrink:0" data-builder-type="icon">💡</span>
                    <div style="flex:1">
                        <h4 style="color:#fff;font-weight:850;margin:0 0 0.25rem;font-size:0.95rem" data-builder-type="heading">Pro Tip</h4>
                        <p style="color:#cbd5e1;font-size:0.88rem;line-height:1.6;margin:0" data-builder-type="text">Highlight an important note or callout here. Edit inline as needed.</p>
                    </div>
                `;
                return e;
            },
            rating: () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:flex;align-items:center;gap:0.6rem;margin:0.5rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <span style="color:#fbbf24;font-size:1.25rem;letter-spacing:2px" data-builder-type="text">★★★★★</span>
                    <span style="color:#fff;font-weight:850;font-size:0.95rem" data-builder-type="text">4.9</span>
                    <span style="color:#64748b;font-size:0.82rem" data-builder-type="text">(2,184 reviews)</span>
                `;
                return e;
            },
            avatar: () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:inline-flex;align-items:center;gap:0.75rem;margin:0.5rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:1rem;flex-shrink:0" data-builder-type="text">FR</div>
                    <div>
                        <div style="color:#fff;font-weight:850;font-size:0.92rem" data-builder-type="heading">Fronty User</div>
                        <div style="color:#64748b;font-size:0.78rem" data-builder-type="text">Verified Seller</div>
                    </div>
                `;
                return e;
            },
            'flip-card': () => {
                const e = document.createElement('div');
                e.style.cssText = 'perspective:1000px;width:100%;max-width:300px;height:200px;margin:0.5rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <div class="flip-inner" style="position:relative;width:100%;height:100%;transition:transform 0.6s;transform-style:preserve-3d" onmouseover="this.style.transform='rotateY(180deg)'" onmouseout="this.style.transform='rotateY(0deg)'">
                        <div style="position:absolute;inset:0;backface-visibility:hidden;background:rgba(15,23,42,0.82);border:1px solid rgba(148,163,184,0.14);border-radius:1rem;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem;text-align:center">
                            <div style="font-size:2rem;margin-bottom:0.5rem" data-builder-type="icon">🎁</div>
                            <h3 style="color:#fff;font-weight:850;margin:0" data-builder-type="heading">Hover Me</h3>
                        </div>
                        <div style="position:absolute;inset:0;backface-visibility:hidden;transform:rotateY(180deg);background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:1rem;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:1.5rem;text-align:center">
                            <p style="color:#fff;font-size:0.9rem;line-height:1.6;margin:0" data-builder-type="text">The back of the card with extra details revealed on hover.</p>
                        </div>
                    </div>
                `;
                return e;
            },
            breadcrumb: () => {
                const e = document.createElement('nav');
                e.style.cssText = 'display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;margin:0.5rem 0;font-family:Inter,sans-serif;font-size:0.85rem';
                e.innerHTML = `
                    <a href="#" style="color:#94a3b8;text-decoration:none" data-builder-type="button">Home</a>
                    <span style="color:#475569">/</span>
                    <a href="#" style="color:#94a3b8;text-decoration:none" data-builder-type="button">Category</a>
                    <span style="color:#475569">/</span>
                    <span style="color:#a5b4fc;font-weight:700" data-builder-type="text">Current Page</span>
                `;
                return e;
            },
            'tag-cloud': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:flex;flex-wrap:wrap;gap:0.5rem;margin:0.5rem 0;font-family:Inter,sans-serif';
                e.innerHTML = ['Electronics','Phones','Laptops','Gaming','Audio','Accessories'].map(tag => `
                    <span style="display:inline-flex;align-items:center;padding:0.35rem 0.85rem;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25);border-radius:9999px;color:#a5b4fc;font-size:0.8rem;font-weight:700" data-builder-type="text">${tag}</span>
                `).join('');
                return e;
            },
            'image-overlay': () => {
                const e = document.createElement('div');
                e.style.cssText = 'position:relative;width:100%;max-width:420px;height:260px;border-radius:1rem;overflow:hidden;margin:0.5rem 0;background:#0f172a;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <img src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='420' height='260' style='background:%231e293b'><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-size='16' font-family='Inter'>📷 Set image URL</text></svg>" alt="Overlay image" style="width:100%;height:100%;object-fit:cover;display:block" data-builder-type="image">
                    <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.85),transparent 60%);display:flex;flex-direction:column;justify-content:flex-end;padding:1.4rem">
                        <span style="display:inline-flex;align-self:flex-start;padding:0.2rem 0.7rem;background:rgba(99,102,241,0.35);border-radius:9999px;color:#fff;font-size:0.72rem;font-weight:800;margin-bottom:0.6rem" data-builder-type="badge">Featured</span>
                        <h3 style="color:#fff;font-size:1.25rem;font-weight:900;margin:0 0 0.3rem" data-builder-type="heading">Overlay Caption</h3>
                        <p style="color:rgba(255,255,255,0.78);font-size:0.85rem;margin:0" data-builder-type="text">Add a short description over the image.</p>
                    </div>
                `;
                return e;
            },
            'stat-counter': () => {
                const e = document.createElement('div');
                e.style.cssText = 'text-align:center;background:rgba(15,23,42,0.6);border:1px solid rgba(148,163,184,0.1);border-radius:1rem;padding:1.6rem 1rem;margin:0.5rem 0;font-family:Inter,sans-serif';
                e.dataset.counterTo = '1250';
                e.dataset.counterSuffix = '+';
                e.innerHTML = `
                    <div style="font-size:1.6rem;margin-bottom:0.4rem" data-builder-type="icon">🚀</div>
                    <div class="counter-value" style="font-size:2.75rem;font-weight:950;color:#fff;line-height:1" data-builder-type="text">0</div>
                    <div style="color:#64748b;font-size:0.84rem;margin-top:0.35rem" data-builder-type="text">Happy Customers</div>
                `;
                runCounter(e);
                return e;
            },
            'timeline-item': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:flex;gap:1rem;padding:0.5rem 0;margin:0.25rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
                        <div style="width:34px;height:34px;border-radius:50%;background:#2563eb;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:0.85rem" data-builder-type="text">01</div>
                        <div style="flex:1;width:2px;background:rgba(99,102,241,0.25);margin-top:0.35rem;min-height:24px"></div>
                    </div>
                    <div style="flex:1;padding-bottom:0.85rem">
                        <h3 style="color:#fff;font-size:1rem;font-weight:850;margin:0.3rem 0 0.35rem" data-builder-type="heading">Milestone Title</h3>
                        <p style="color:#94a3b8;font-size:0.86rem;line-height:1.6;margin:0" data-builder-type="text">Describe what happened at this step of the timeline.</p>
                    </div>
                `;
                return e;
            },
            'profile-card': () => {
                const e = document.createElement('div');
                e.style.cssText = 'background:rgba(15,23,42,0.8);border:1px solid rgba(148,163,184,0.13);border-radius:1.25rem;padding:1.75rem;text-align:center;max-width:300px;margin:0.5rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <div style="width:84px;height:84px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;font-size:1.8rem;font-weight:950;color:#fff" data-builder-type="text">AJ</div>
                    <h3 style="color:#fff;font-size:1.15rem;font-weight:900;margin:0 0 0.25rem" data-builder-type="heading">Alex Johnson</h3>
                    <p style="color:#a5b4fc;font-size:0.85rem;font-weight:700;margin:0 0 0.85rem" data-builder-type="text">Product Designer</p>
                    <p style="color:#94a3b8;font-size:0.85rem;line-height:1.6;margin:0 0 1.1rem" data-builder-type="text">Crafting delightful digital experiences for modern brands.</p>
                    <div style="display:flex;justify-content:center;gap:0.5rem">
                        ${['𝕏','in','f'].map(s=>`<a href="#" style="width:32px;height:32px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#a5b4fc;text-decoration:none;font-size:0.72rem;font-weight:800" data-builder-type="button">${s}</a>`).join('')}
                    </div>
                `;
                return e;
            },
            'download-card': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:flex;align-items:center;gap:1rem;padding:1rem 1.25rem;background:rgba(15,23,42,0.72);border:1px solid rgba(148,163,184,0.12);border-radius:0.9rem;max-width:440px;margin:0.5rem 0;font-family:Inter,sans-serif';
                e.innerHTML = `
                    <div style="width:46px;height:46px;border-radius:0.7rem;background:rgba(99,102,241,0.15);display:flex;align-items:center;justify-content:center;font-size:1.4rem;flex-shrink:0" data-builder-type="icon">📄</div>
                    <div style="flex:1;min-width:0">
                        <div style="color:#fff;font-weight:850;font-size:0.92rem" data-builder-type="heading">Brochure.pdf</div>
                        <div style="color:#64748b;font-size:0.78rem" data-builder-type="text">PDF · 2.4 MB</div>
                    </div>
                    <a href="#" style="display:inline-flex;align-items:center;gap:0.4rem;padding:0.55rem 1.1rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:0.6rem;text-decoration:none;font-weight:800;font-size:0.82rem;flex-shrink:0" data-builder-type="button">↓ Download</a>
                `;
                return e;
            },
            'notice-banner': () => {
                const e = document.createElement('div');
                e.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:0.75rem;padding:0.7rem 1.25rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:0.75rem;margin:0.5rem 0;font-family:Inter,sans-serif;position:relative;flex-wrap:wrap';
                e.innerHTML = `
                    <span style="color:#fff;font-size:0.9rem;font-weight:700" data-builder-type="text">🎉 Free shipping on all orders over $50 this week!</span>
                    <a href="#" style="color:#fff;font-weight:850;font-size:0.85rem;text-decoration:underline;white-space:nowrap" data-builder-type="button">Shop now →</a>
                    <button onclick="this.parentElement.style.display='none'" style="position:absolute;right:0.75rem;top:50%;transform:translateY(-50%);background:none;border:none;color:rgba(255,255,255,0.85);cursor:pointer;font-size:1.05rem;line-height:1">✕</button>
                `;
                return e;
            },
        };

        const result = templates[type]?.();
        if (result) {
            result.querySelectorAll('[data-builder-type]').forEach((c, i) => {
                if (!c.dataset.builderEl) { c.dataset.builderEl = `${type}-child-${i}-${Date.now()}`; }
            });
        }
        return result;
    }

    // Slider helpers (injected into iframe scope)
    window.sliderGoTo = function(slider, idx) {
        const track = slider.querySelector('.slider-track');
        if (track) { track.style.transform = `translateX(-${idx * 100}%)`; slider.dataset.sliderIdx = idx; }
        slider.querySelectorAll('button[onclick^="sliderGo"]').forEach((b,i) => b.style.background = i===idx ? '#6366f1' : 'rgba(99,102,241,0.3)');
    };
    window.sliderGo = function(btn, idx) {
        const slider = btn.closest('[data-builder-el]') || btn.closest('div[data-slider-idx]');
        window.sliderGoTo(slider, idx);
    };
    window.sliderPrev = function(btn) {
        const slider = btn.closest('[data-builder-el]') || btn.parentElement;
        let idx = parseInt(slider.dataset.sliderIdx||0) - 1;
        const slides = slider.querySelectorAll('.slider-slide').length;
        if (idx < 0) idx = slides - 1;
        window.sliderGoTo(slider, idx);
    };
    window.sliderNext = function(btn) {
        const slider = btn.closest('[data-builder-el]') || btn.parentElement;
        let idx = parseInt(slider.dataset.sliderIdx||0) + 1;
        const slides = slider.querySelectorAll('.slider-slide').length;
        if (idx >= slides) idx = 0;
        window.sliderGoTo(slider, idx);
    };

    // Count-up animation for stat-counter elements
    function runCounter(el) {
        clearInterval(el._counterTimer);
        const valEl = el.querySelector('.counter-value');
        if (!valEl) return;
        const target = parseInt(el.dataset.counterTo) || 0;
        const suffix = el.dataset.counterSuffix || '';
        const prefix = el.dataset.counterPrefix || '';
        const duration = 1400;
        const start = performance.now();
        const fmt = n => prefix + Math.round(n).toLocaleString() + suffix;
        el._counterTimer = setInterval(() => {
            const progress = Math.min(1, (performance.now() - start) / duration);
            const eased = 1 - Math.pow(1 - progress, 3);
            valEl.textContent = fmt(target * eased);
            if (progress >= 1) { clearInterval(el._counterTimer); valEl.textContent = fmt(target); }
        }, 30);
    }

    // ── Add Section ───────────────────────────────────────────
    window.builderTabGo = function(btn, idx) {
        const box = btn.closest('[data-component="tabs"]') || btn.parentElement.parentElement;
        box.querySelectorAll('[onclick^="builderTabGo"]').forEach((item, i) => {
            item.style.background = i === idx ? '#2563eb' : 'rgba(148,163,184,0.08)';
            item.style.color = i === idx ? '#fff' : '#94a3b8';
        });
        box.querySelectorAll('.builder-tab-panel').forEach((panel, i) => {
            panel.style.display = i === idx ? 'block' : 'none';
        });
    };

    window.builderAccordionToggle = function(btn) {
        const panel = btn.nextElementSibling;
        const marker = btn.querySelector('span');
        const open = panel.style.display !== 'none';
        panel.style.display = open ? 'none' : 'block';
        if (marker) marker.textContent = open ? '+' : '-';
    };

    function addSectionCmd({template, afterSectionId}) {
        const sec = document.createElement('section');
        sec.dataset.builderSection = `sec-${Date.now()}`;
        sec.style.cssText = 'position:relative;padding:4rem 0';

        const wrap = (html) => `<div style="max-width:1280px;margin:0 auto;padding:0 2rem">${html}</div>`;
        const tpls = {
            blank: wrap(`<p style="color:#334155;text-align:center;font-size:0.875rem;font-family:Inter,sans-serif" data-builder-type="text">Empty section — drag elements here or click in the left panel</p>`),
            hero: wrap(`<div style="text-align:center;padding:3rem 0">
                <h1 style="font-size:3.5rem;font-weight:900;color:#fff;margin:0 0 1rem;line-height:1.1" data-builder-type="heading">Your Hero Title</h1>
                <p style="color:#94a3b8;font-size:1.2rem;margin:0 0 2rem;max-width:600px;margin-left:auto;margin-right:auto" data-builder-type="text">A compelling subtitle that explains your value proposition clearly.</p>
                <a href="#" style="display:inline-flex;padding:0.875rem 2.5rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:0.875rem;font-weight:700;text-decoration:none;font-size:1rem" data-builder-type="button">Get Started →</a>
            </div>`),
            features: wrap(`<div>
                <h2 style="color:#fff;font-size:2rem;font-weight:800;text-align:center;margin:0 0 2rem" data-builder-type="heading">Features</h2>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem">
                    ${['⚡ Fast','🔒 Secure','📱 Responsive'].map(f=>`<div style="background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.1);border-radius:1rem;padding:1.75rem;text-align:center">
                        <div style="font-size:2rem;margin:0 0 0.75rem">${f.split(' ')[0]}</div>
                        <h3 style="color:#fff;font-weight:700;margin:0 0 0.5rem" data-builder-type="heading">${f.split(' ').slice(1).join(' ')}</h3>
                        <p style="color:#64748b;font-size:0.85rem" data-builder-type="text">Feature description here.</p>
                    </div>`).join('')}
                </div>
            </div>`),
            text: wrap(`<div style="max-width:700px;margin:0 auto;text-align:center">
                <h2 style="color:#fff;font-size:2rem;font-weight:800;margin:0 0 1rem" data-builder-type="heading">Section Title</h2>
                <p style="color:#94a3b8;line-height:1.8" data-builder-type="text">This is a text section. Double-click any text to edit it directly. Use the properties panel on the right to change colors, size, and more.</p>
            </div>`),
            cta: wrap(`<div style="background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.1));border:1px solid rgba(99,102,241,0.2);border-radius:1.5rem;padding:3rem;text-align:center">
                <h2 style="color:#fff;font-size:2.25rem;font-weight:800;margin:0 0 1rem" data-builder-type="heading">Ready to get started?</h2>
                <p style="color:#94a3b8;margin:0 0 2rem" data-builder-type="text">Join thousands of happy users today.</p>
                <a href="#" style="display:inline-flex;padding:0.875rem 2.5rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:0.875rem;font-weight:700;text-decoration:none" data-builder-type="button">Start Free →</a>
            </div>`),
            'two-col': wrap(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:3rem;align-items:center">
                <div>
                    <h2 style="color:#fff;font-size:2rem;font-weight:800;margin:0 0 1rem" data-builder-type="heading">Left Column</h2>
                    <p style="color:#94a3b8;line-height:1.8" data-builder-type="text">Add your content in the left column here. You can put text, buttons, or any element.</p>
                    <a href="#" style="display:inline-flex;margin-top:1.5rem;padding:0.75rem 1.75rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:0.75rem;font-weight:700;text-decoration:none" data-builder-type="button">Learn More →</a>
                </div>
                <div style="background:rgba(15,23,42,0.6);border:1px solid rgba(148,163,184,0.1);border-radius:1rem;padding:2rem">
                    <h3 style="color:#fff;font-weight:700;margin:0 0 0.75rem" data-builder-type="heading">Right Column</h3>
                    <p style="color:#94a3b8;font-size:0.9rem" data-builder-type="text">Add your right-column content or replace with an image.</p>
                </div>
            </div>`),
            'image-text': wrap(`<div style="display:grid;grid-template-columns:1fr 1fr;gap:3rem;align-items:center">
                <img src="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='500' height='350' style='background:%231e293b'><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' fill='%2364748b' font-size='18' font-family='Inter'>📷 Set image URL</text></svg>" style="width:100%;border-radius:1rem" alt="Section image" data-builder-type="image">
                <div>
                    <span style="display:inline-block;padding:0.25rem 0.75rem;background:rgba(99,102,241,0.12);color:#a5b4fc;border-radius:9999px;font-size:0.75rem;font-weight:700;margin-bottom:1rem" data-builder-type="badge">✨ Section Label</span>
                    <h2 style="color:#fff;font-size:2rem;font-weight:800;margin:0 0 1rem" data-builder-type="heading">Image with Text</h2>
                    <p style="color:#94a3b8;line-height:1.8;margin:0 0 1.5rem" data-builder-type="text">Add your content here beside the image. You can edit the image URL in the properties panel.</p>
                    <a href="#" style="display:inline-flex;padding:0.75rem 1.75rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:0.75rem;font-weight:700;text-decoration:none" data-builder-type="button">Learn More</a>
                </div>
            </div>`),
            faq: wrap(`<div>
                <h2 style="color:#fff;font-size:2rem;font-weight:800;text-align:center;margin:0 0 2rem" data-builder-type="heading">Frequently Asked Questions</h2>
                <div style="display:flex;flex-direction:column;gap:0.75rem;max-width:700px;margin:0 auto">
                    ${['How does it work?','Is it free to use?','Can I cancel anytime?'].map((q,i)=>`
                        <div style="background:rgba(15,23,42,0.6);border:1px solid rgba(148,163,184,0.08);border-radius:0.875rem;overflow:hidden">
                            <button onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'" style="width:100%;padding:1rem 1.25rem;background:none;border:none;color:#fff;font-size:0.95rem;font-weight:600;text-align:left;cursor:pointer;display:flex;justify-content:space-between;align-items:center;font-family:Inter,sans-serif" data-builder-type="button">${q} <span>▾</span></button>
                            <div style="${i===0?'display:block':'display:none'};padding:0 1.25rem 1rem;color:#94a3b8;font-size:0.875rem;line-height:1.7" data-builder-type="text">Click to expand this answer. Double-click to edit the text inline.</div>
                        </div>`).join('')}
                </div>
            </div>`),
            testimonial: wrap(`<div>
                <h2 style="color:#fff;font-size:2rem;font-weight:800;text-align:center;margin:0 0 2rem" data-builder-type="heading">What Our Customers Say</h2>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem">
                    ${['Great service!','Highly recommend','Amazing product'].map((t,i)=>`
                    <div style="background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.1);border-radius:1rem;padding:1.5rem">
                        <div style="color:#fbbf24;font-size:1rem;margin-bottom:0.75rem">★★★★★</div>
                        <p style="color:#cbd5e1;font-size:0.875rem;line-height:1.7;margin:0 0 1rem" data-builder-type="text">"${t} — this is the best experience I've had with an online store!"</p>
                        <div style="display:flex;align-items:center;gap:0.625rem">
                            <div style="width:36px;height:36px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">${['A','B','C'][i]}</div>
                            <div><div style="color:#fff;font-size:0.85rem;font-weight:700" data-builder-type="heading">Customer ${i+1}</div><div style="color:#64748b;font-size:0.75rem" data-builder-type="text">Verified Buyer</div></div>
                        </div>
                    </div>`).join('')}
                </div>
            </div>`),
            stats: wrap(`<div style="text-align:center">
                <h2 style="color:#fff;font-size:1.75rem;font-weight:800;margin:0 0 2rem" data-builder-type="heading">Our Numbers Speak</h2>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1.5rem">
                    ${[['1K+','Products'],['500+','Sellers'],['99%','Satisfaction'],['24/7','Support']].map(([n,l])=>`
                    <div style="text-align:center">
                        <div style="font-size:2.75rem;font-weight:900;color:#fff;line-height:1" data-builder-type="text">${n}</div>
                        <div style="color:#64748b;font-size:0.8rem;margin-top:0.4rem" data-builder-type="text">${l}</div>
                    </div>`).join('')}
                </div>
            </div>`),

            // ── New Section Templates ──────────────────────────
            pricing: wrap(`<div>
                <div style="text-align:center;margin-bottom:3rem">
                    <h2 style="color:#fff;font-size:2.25rem;font-weight:800;margin:0 0 0.75rem" data-builder-type="heading">Simple, Transparent Pricing</h2>
                    <p style="color:#94a3b8;font-size:1rem" data-builder-type="text">Choose the plan that works best for you.</p>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1.5rem;align-items:start">
                    ${[
                        { name:'Starter', price:'Free', features:['5 Projects','1GB Storage','Email Support'], highlight:false },
                        { name:'Pro', price:'$29/mo', features:['Unlimited Projects','50GB Storage','Priority Support','Custom Domain'], highlight:true },
                        { name:'Enterprise', price:'$99/mo', features:['Everything in Pro','500GB Storage','Dedicated Manager','SLA Guarantee'], highlight:false },
                    ].map(plan => `
                        <div style="background:${plan.highlight?'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(139,92,246,0.1))':'rgba(15,23,42,0.7)'};border:1px solid ${plan.highlight?'rgba(99,102,241,0.4)':'rgba(148,163,184,0.1)'};border-radius:1.25rem;padding:2rem;text-align:center${plan.highlight?';transform:scale(1.03)':''}">
                            ${plan.highlight?'<div style="display:inline-flex;padding:0.2rem 0.75rem;background:rgba(99,102,241,0.2);border:1px solid rgba(99,102,241,0.4);border-radius:9999px;color:#a5b4fc;font-size:0.72rem;font-weight:700;margin-bottom:0.75rem" data-builder-type="badge">Most Popular</div>':''}
                            <div style="color:#fff;font-size:1rem;font-weight:700;margin-bottom:0.5rem" data-builder-type="heading">${plan.name}</div>
                            <div style="font-size:2.5rem;font-weight:900;color:#fff;margin-bottom:1.5rem" data-builder-type="text">${plan.price}</div>
                            <ul style="list-style:none;padding:0;margin:0 0 1.5rem;display:flex;flex-direction:column;gap:0.5rem;text-align:left">
                                ${plan.features.map(f=>`<li style="display:flex;align-items:center;gap:0.5rem;color:#cbd5e1;font-size:0.85rem"><span style="color:#10b981;font-weight:700">✓</span><span data-builder-type="text">${f}</span></li>`).join('')}
                            </ul>
                            <a href="#" style="display:block;padding:0.7rem;background:${plan.highlight?'linear-gradient(135deg,#6366f1,#8b5cf6)':'rgba(99,102,241,0.15)'};color:${plan.highlight?'#fff':'#a5b4fc'};border:1px solid rgba(99,102,241,0.3);border-radius:0.75rem;font-weight:700;text-decoration:none;font-size:0.875rem" data-builder-type="button">Get Started</a>
                        </div>
                    `).join('')}
                </div>
            </div>`),

            team: wrap(`<div>
                <div style="text-align:center;margin-bottom:3rem">
                    <h2 style="color:#fff;font-size:2.25rem;font-weight:800;margin:0 0 0.75rem" data-builder-type="heading">Meet Our Team</h2>
                    <p style="color:#94a3b8" data-builder-type="text">The brilliant minds behind our product.</p>
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1.5rem">
                    ${[
                        { name:'Alex Johnson', role:'CEO & Founder', color:'#6366f1' },
                        { name:'Sarah Chen', role:'CTO', color:'#8b5cf6' },
                        { name:'Marcus Lee', role:'Head of Design', color:'#0ea5e9' },
                        { name:'Emily Davis', role:'Lead Engineer', color:'#10b981' },
                    ].map((m)=>`
                        <div style="background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.1);border-radius:1.25rem;padding:1.5rem;text-align:center">
                            <div style="width:70px;height:70px;background:linear-gradient(135deg,${m.color},${m.color}88);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;font-size:1.5rem;font-weight:900;color:#fff">
                                ${m.name.split(' ').map(n=>n[0]).join('')}
                            </div>
                            <div style="color:#fff;font-weight:700;font-size:0.95rem;margin-bottom:0.25rem" data-builder-type="heading">${m.name}</div>
                            <div style="color:#64748b;font-size:0.8rem;margin-bottom:0.875rem" data-builder-type="text">${m.role}</div>
                            <div style="display:flex;justify-content:center;gap:0.5rem">
                                <a href="#" style="width:30px;height:30px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#a5b4fc;text-decoration:none;font-size:0.7rem;font-weight:700">𝕏</a>
                                <a href="#" style="width:30px;height:30px;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.2);border-radius:50%;display:flex;align-items:center;justify-content:center;color:#a5b4fc;text-decoration:none;font-size:0.65rem;font-weight:700">in</a>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`),

            newsletter: wrap(`<div style="max-width:600px;margin:0 auto;text-align:center">
                <div style="display:inline-flex;padding:0.25rem 0.875rem;background:rgba(99,102,241,0.12);border:1px solid rgba(99,102,241,0.25);border-radius:9999px;color:#a5b4fc;font-size:0.8rem;font-weight:700;margin-bottom:1.25rem" data-builder-type="badge">📧 Newsletter</div>
                <h2 style="color:#fff;font-size:2.25rem;font-weight:800;margin:0 0 0.875rem;line-height:1.2" data-builder-type="heading">Stay in the Loop</h2>
                <p style="color:#94a3b8;font-size:1rem;margin:0 0 2rem;line-height:1.7" data-builder-type="text">Get the latest updates, tips, and exclusive offers delivered straight to your inbox. No spam, ever.</p>
                <div style="display:flex;gap:0.75rem;max-width:440px;margin:0 auto 1rem">
                    <input type="email" placeholder="Enter your email address..." style="flex:1;padding:0.75rem 1rem;background:rgba(15,23,42,0.8);border:1px solid rgba(148,163,184,0.15);border-radius:0.75rem;color:#e2e8f0;font-size:0.9rem;font-family:Inter,sans-serif;outline:none" />
                    <button style="padding:0.75rem 1.5rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:0.75rem;font-weight:700;cursor:pointer;white-space:nowrap;font-family:Inter,sans-serif" data-builder-type="button">Subscribe →</button>
                </div>
                <p style="color:#475569;font-size:0.78rem" data-builder-type="text">Join 10,000+ subscribers. Unsubscribe anytime.</p>
            </div>`),

            timeline: wrap(`<div>
                <h2 style="color:#fff;font-size:2.25rem;font-weight:800;text-align:center;margin:0 0 3rem" data-builder-type="heading">Our Journey</h2>
                <div style="position:relative;max-width:700px;margin:0 auto">
                    <div style="position:absolute;left:50%;transform:translateX(-50%);top:0;bottom:0;width:2px;background:rgba(99,102,241,0.2)"></div>
                    ${[
                        { year:'2020', title:'Founded', desc:'Started with a vision to revolutionize the industry.', side:'left' },
                        { year:'2021', title:'First Product', desc:'Launched our flagship product to overwhelmingly positive reception.', side:'right' },
                        { year:'2022', title:'Series A', desc:'Raised $5M in funding to accelerate our growth.', side:'left' },
                        { year:'2023', title:'Global Expansion', desc:'Expanded to 25+ countries and 100,000+ users.', side:'right' },
                    ].map((item) => `
                        <div style="display:flex;justify-content:${item.side==='left'?'flex-start':'flex-end'};margin-bottom:2rem;position:relative">
                            <div style="width:calc(50% - 1.5rem);background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.1);border-radius:1rem;padding:1.25rem;${item.side==='right'?'margin-left:3rem':'margin-right:3rem'}">
                                <div style="display:inline-flex;padding:0.2rem 0.6rem;background:rgba(99,102,241,0.15);border:1px solid rgba(99,102,241,0.3);border-radius:9999px;color:#a5b4fc;font-size:0.75rem;font-weight:700;margin-bottom:0.5rem" data-builder-type="badge">${item.year}</div>
                                <h3 style="color:#fff;font-weight:700;margin:0 0 0.4rem;font-size:1rem" data-builder-type="heading">${item.title}</h3>
                                <p style="color:#94a3b8;font-size:0.85rem;margin:0;line-height:1.6" data-builder-type="text">${item.desc}</p>
                            </div>
                            <div style="position:absolute;left:50%;transform:translateX(-50%);width:14px;height:14px;background:#6366f1;border-radius:50%;border:2px solid #8b5cf6;top:1rem;box-shadow:0 0 12px rgba(99,102,241,0.5)"></div>
                        </div>
                    `).join('')}
                </div>
            </div>`),

            gallery: wrap(`<div>
                <div style="text-align:center;margin-bottom:2.5rem">
                    <h2 style="color:#fff;font-size:2.25rem;font-weight:800;margin:0 0 0.75rem" data-builder-type="heading">Our Gallery</h2>
                    <p style="color:#94a3b8" data-builder-type="text">A showcase of our best work and moments.</p>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">
                    ${[
                        { aspect:'66.67%', label:'Photo 1' },
                        { aspect:'100%', label:'Photo 2' },
                        { aspect:'66.67%', label:'Photo 3' },
                        { aspect:'100%', label:'Photo 4' },
                        { aspect:'66.67%', label:'Photo 5' },
                        { aspect:'100%', label:'Photo 6' },
                    ].map((img) => `
                        <div style="position:relative;padding-bottom:${img.aspect};background:rgba(15,23,42,0.7);border:1px solid rgba(148,163,184,0.1);border-radius:0.875rem;overflow:hidden;cursor:pointer" onmouseover="this.querySelector('.gal-overlay').style.opacity='1'" onmouseout="this.querySelector('.gal-overlay').style.opacity='0'">
                            <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">
                                <span style="font-size:2rem;opacity:0.3">🖼️</span>
                            </div>
                            <div class="gal-overlay" style="position:absolute;inset:0;background:rgba(99,102,241,0.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity 0.25s">
                                <span style="color:#fff;font-size:1.5rem">🔍</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <p style="text-align:center;margin-top:1.5rem;color:#475569;font-size:0.85rem" data-builder-type="text">Set image URLs by selecting each gallery item and editing in properties.</p>
            </div>`),

            storefront: wrap(`<div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:3rem;align-items:center">
                <div>
                    <span style="display:inline-flex;padding:0.28rem 0.8rem;background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.24);border-radius:999px;color:#86efac;font-size:0.78rem;font-weight:800;margin-bottom:1rem" data-builder-type="badge">Verified marketplace</span>
                    <h1 style="color:#fff;font-size:3.6rem;line-height:1.02;font-weight:950;margin:0 0 1rem" data-builder-type="heading">Build a smarter storefront</h1>
                    <p style="color:#94a3b8;font-size:1.08rem;line-height:1.75;margin:0 0 1.6rem;max-width:620px" data-builder-type="text">Launch a polished commerce section with product highlights, trust signals, and clear actions.</p>
                    <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
                        <a href="#products" style="display:inline-flex;padding:0.8rem 1.35rem;background:#2563eb;color:#fff;border-radius:0.55rem;text-decoration:none;font-weight:850" data-builder-type="button">Browse items</a>
                        <a href="sell.html" style="display:inline-flex;padding:0.8rem 1.35rem;background:rgba(148,163,184,0.1);color:#e2e8f0;border:1px solid rgba(148,163,184,0.18);border-radius:0.55rem;text-decoration:none;font-weight:850" data-builder-type="button">Start selling</a>
                    </div>
                    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:2rem">
                        ${[['1K+','Listings'],['500+','Sellers'],['99%','Rating']].map(([n,l])=>`<div><div style="color:#fff;font-size:1.7rem;font-weight:950" data-builder-type="text">${n}</div><div style="color:#64748b;font-size:0.76rem" data-builder-type="text">${l}</div></div>`).join('')}
                    </div>
                </div>
                <article style="overflow:hidden;background:rgba(15,23,42,0.82);border:1px solid rgba(148,163,184,0.14);border-radius:1.25rem;box-shadow:0 24px 70px rgba(0,0,0,0.3)">
                    <img src="uploads/img_69a3991cbc24d.jpg" alt="Featured product" style="width:100%;height:320px;object-fit:cover;display:block" data-builder-type="image">
                    <div style="padding:1.15rem">
                        <h3 style="color:#fff;font-weight:850;margin:0 0 0.4rem" data-builder-type="heading">Featured device</h3>
                        <p style="color:#94a3b8;margin:0" data-builder-type="text">Clean condition, verified seller, ready to ship.</p>
                    </div>
                </article>
            </div>`),

            'product-showcase': wrap(`<div>
                <div style="display:flex;align-items:end;justify-content:space-between;gap:1rem;margin-bottom:1.5rem">
                    <div><h2 style="color:#fff;font-size:2.2rem;font-weight:900;margin:0 0 0.4rem" data-builder-type="heading">Featured listings</h2><p style="color:#94a3b8;margin:0" data-builder-type="text">Hand-picked items ready for buyers.</p></div>
                    <a href="#products" style="color:#93c5fd;text-decoration:none;font-weight:850" data-builder-type="button">View all</a>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:1rem">
                    ${['Phone Pro Max','Gaming Laptop','Wireless Headset'].map((name, i)=>`
                        <article style="overflow:hidden;background:rgba(15,23,42,0.82);border:1px solid rgba(148,163,184,0.14);border-radius:1rem">
                            <img src="uploads/img_69a3991cbc24d.jpg" alt="${name}" style="width:100%;height:190px;object-fit:cover;display:block" data-builder-type="image">
                            <div style="padding:1rem"><span style="color:#38bdf8;font-size:0.72rem;font-weight:850" data-builder-type="badge">${['Phones','Laptops','Audio'][i]}</span><h3 style="color:#fff;font-size:1rem;font-weight:850;margin:0.4rem 0" data-builder-type="heading">${name}</h3><strong style="color:#fff;font-size:1.2rem" data-builder-type="text">$${[449,899,129][i]}</strong></div>
                        </article>
                    `).join('')}
                </div>
            </div>`),

            trust: wrap(`<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem">
                ${[['Secure payment','Protected checkout'],['Verified sellers','Reviewed listings'],['Fast support','Real humans'],['Easy returns','Clear policy']].map(([title,sub])=>`
                    <div style="background:rgba(15,23,42,0.72);border:1px solid rgba(148,163,184,0.12);border-radius:1rem;padding:1.25rem;text-align:center">
                        <div style="width:38px;height:38px;border-radius:0.75rem;background:rgba(34,197,94,0.14);margin:0 auto 0.75rem;display:flex;align-items:center;justify-content:center;color:#86efac;font-weight:900">OK</div>
                        <h3 style="color:#fff;font-size:0.95rem;font-weight:850;margin:0 0 0.3rem" data-builder-type="heading">${title}</h3>
                        <p style="color:#64748b;font-size:0.78rem;margin:0" data-builder-type="text">${sub}</p>
                    </div>
                `).join('')}
            </div>`),

            logos: wrap(`<div style="text-align:center">
                <p style="color:#64748b;font-size:0.82rem;font-weight:850;text-transform:uppercase;letter-spacing:0.12em;margin:0 0 1rem" data-builder-type="text">Trusted by modern sellers</p>
                <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:0.9rem">
                    ${['NOVA','ORBIT','PIXEL','APEX','VOLT'].map(name=>`<div style="height:78px;border:1px solid rgba(148,163,184,0.12);border-radius:0.85rem;background:rgba(15,23,42,0.58);display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:0.92rem;font-weight:950;letter-spacing:0.12em" data-builder-type="text">${name}</div>`).join('')}
                </div>
            </div>`),

            comparison: wrap(`<div>
                <h2 style="color:#fff;font-size:2rem;font-weight:900;text-align:center;margin:0 0 1.5rem" data-builder-type="heading">Compare plans</h2>
                ${createElement('comparison-table').outerHTML}
            </div>`),

            process: wrap(`<div>
                <h2 style="color:#fff;font-size:2rem;font-weight:900;text-align:center;margin:0 0 1.75rem" data-builder-type="heading">How it works</h2>
                ${createElement('steps').outerHTML}
            </div>`),

            contact: wrap(`<div>
                <h2 style="color:#fff;font-size:2rem;font-weight:900;text-align:center;margin:0 0 1.5rem" data-builder-type="heading">Get in touch</h2>
                ${createElement('contact-card').outerHTML}
            </div>`),

            'icon-features': wrap(`<div>
                <div style="text-align:center;margin-bottom:2.5rem">
                    <h2 style="color:#fff;font-size:2.25rem;font-weight:900;margin:0 0 0.6rem" data-builder-type="heading">Why choose us</h2>
                    <p style="color:#94a3b8" data-builder-type="text">Everything you need, beautifully packaged.</p>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.25rem;align-items:stretch">
                    ${['⚡','🛡️','🚀'].map((ic,i)=>{ const c=createElement('icon-box'); c.style.maxWidth='none'; c.querySelector('[data-builder-type="icon"]').textContent=ic; c.querySelector('[data-builder-type="heading"]').textContent=['Lightning Fast','Secure by Default','Easy to Launch'][i]; return c.outerHTML; }).join('')}
                </div>
            </div>`),

            counters: wrap(`<div style="text-align:center">
                <h2 style="color:#fff;font-size:1.9rem;font-weight:900;margin:0 0 2rem" data-builder-type="heading">Trusted at scale</h2>
                <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem">
                    ${[['🚀','1250','+','Customers'],['⭐','98','%','Satisfaction'],['🛒','5400','+','Orders'],['🌍','30','+','Countries']].map(([ic,to,suf,label])=>{ const c=createElement('stat-counter'); c.dataset.counterTo=to; c.dataset.counterSuffix=suf; c.querySelector('[data-builder-type="icon"]').textContent=ic; c.querySelectorAll('[data-builder-type="text"]')[1].textContent=label; return c.outerHTML; }).join('')}
                </div>
            </div>`),

            profiles: wrap(`<div>
                <div style="text-align:center;margin-bottom:2.5rem">
                    <h2 style="color:#fff;font-size:2.25rem;font-weight:900;margin:0 0 0.6rem" data-builder-type="heading">Meet the team</h2>
                    <p style="color:#94a3b8" data-builder-type="text">The people behind the product.</p>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1.25rem;justify-items:center">
                    ${[['AJ','Alex Johnson','Founder & CEO'],['SC','Sarah Chen','Head of Product'],['ML','Marcus Lee','Lead Engineer']].map(([init,name,role])=>{ const c=createElement('profile-card'); c.style.maxWidth='none'; const txts=c.querySelectorAll('[data-builder-type="text"]'); txts[0].textContent=init; txts[1].textContent=role; c.querySelector('[data-builder-type="heading"]').textContent=name; return c.outerHTML; }).join('')}
                </div>
            </div>`),
        };

        sec.innerHTML = tpls[template] || tpls.blank;
        tagEditables(sec);
        injectSectionUI(sec);
        initCounters();

        const refSec = afterSectionId ? findSec(afterSectionId) : null;
        if (refSec) refSec.after(sec);
        else document.body.appendChild(sec);

        sec.animate([{opacity:0,transform:'translateY(20px)'},{opacity:1,transform:'translateY(0)'}],{duration:400});
        sendToParent({ type:'SECTION_ADDED', sectionId:sec.dataset.builderSection, sections:getSectionsInfo() });
    }

    // ── Global Helpers (called from toolbar buttons) ──────────
    window.builderSelectSection = el => { const s=el.closest('[data-builder-section]'); if(s) selectSection(s); };
    window.builderSectionMove = (el,dir) => { const s=el.closest('[data-builder-section]'); if(s) moveSection({sectionId:s.dataset.builderSection,direction:dir}); };
    window.builderSectionDelete = el => { const s=el.closest('[data-builder-section]'); if(s) deleteSection(s.dataset.builderSection); };
    window.builderAddSectionAfter = el => {
        const s=el.closest('[data-builder-section]');
        sendToParent({ type:'REQUEST_ADD_SECTION', afterSectionId:s?.dataset.builderSection });
    };

    function getCleanSnapshot() {
        const clone = document.documentElement.cloneNode(true);

        clone.querySelectorAll('#builder-inject-script,#builder-inject-styles,.section-label,.section-toolbar,.section-add-bar,.builder-drop-placeholder').forEach(el => el.remove());
        clone.querySelectorAll('script[src*="builder-inject.js"]').forEach(el => el.remove());
        clone.querySelectorAll('.builder-selected,.builder-section-selected,.drag-over').forEach(el => {
            el.classList.remove('builder-selected', 'builder-section-selected', 'drag-over');
        });
        clone.querySelectorAll('[data-builder-type="js-code"][data-custom-js]').forEach(block => {
            const code = block.getAttribute('data-custom-js') || '';
            if (!code.trim()) {
                block.remove();
                return;
            }
            const script = document.createElement('script');
            script.textContent = code;
            block.replaceWith(script);
        });
        // Set counter final values so exported page is correct even without JS
        clone.querySelectorAll('[data-counter-to] .counter-value').forEach(valEl => {
            const box = valEl.closest('[data-counter-to]');
            const to = parseInt(box.getAttribute('data-counter-to')) || 0;
            const suffix = box.getAttribute('data-counter-suffix') || '';
            const prefix = box.getAttribute('data-counter-prefix') || '';
            valEl.textContent = prefix + to.toLocaleString() + suffix;
        });
        clone.querySelectorAll('[data-builder-section],[data-builder-el],[data-builder-type],[data-builder-component]').forEach(el => {
            el.removeAttribute('data-builder-section');
            el.removeAttribute('data-builder-el');
            el.removeAttribute('data-builder-type');
            el.removeAttribute('data-builder-component');
            el.removeAttribute('contenteditable');
        });
        clone.classList.remove('builder-overlays-off');

        if (clone.querySelector('[onclick*="builderTabGo"],[onclick*="builderAccordionToggle"]')) {
            const script = document.createElement('script');
            script.textContent = `
function builderTabGo(btn, idx) {
  var box = btn.closest('[data-component="tabs"]') || btn.parentElement.parentElement;
  box.querySelectorAll('[onclick^="builderTabGo"]').forEach(function(item, i) {
    item.style.background = i === idx ? '#2563eb' : 'rgba(148,163,184,0.08)';
    item.style.color = i === idx ? '#fff' : '#94a3b8';
  });
  box.querySelectorAll('.builder-tab-panel').forEach(function(panel, i) {
    panel.style.display = i === idx ? 'block' : 'none';
  });
}
function builderAccordionToggle(btn) {
  var panel = btn.nextElementSibling;
  var marker = btn.querySelector('span');
  var open = panel.style.display !== 'none';
  panel.style.display = open ? 'none' : 'block';
  if (marker) marker.textContent = open ? '+' : '-';
}
`;
            (clone.querySelector('body') || clone).appendChild(script);
        }

        // Counter animation script for exported page
        if (clone.querySelector('[data-counter-to]')) {
            const counterScript = document.createElement('script');
            counterScript.textContent = `
(function(){
  function animate(box){
    var valEl = box.querySelector('.counter-value');
    if(!valEl) return;
    var to = parseInt(box.getAttribute('data-counter-to')) || 0;
    var suffix = box.getAttribute('data-counter-suffix') || '';
    var prefix = box.getAttribute('data-counter-prefix') || '';
    var start = performance.now(), dur = 1400;
    var timer = setInterval(function(){
      var p = Math.min(1, (performance.now()-start)/dur);
      var eased = 1 - Math.pow(1-p, 3);
      valEl.textContent = prefix + Math.round(to*eased).toLocaleString() + suffix;
      if(p>=1){ clearInterval(timer); valEl.textContent = prefix + to.toLocaleString() + suffix; }
    },30);
  }
  var boxes = document.querySelectorAll('[data-counter-to]');
  if('IntersectionObserver' in window){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(en){ if(en.isIntersecting){ animate(en.target); io.unobserve(en.target); } });
    },{threshold:0.4});
    boxes.forEach(function(b){ io.observe(b); });
  } else { boxes.forEach(animate); }
})();
`;
            (clone.querySelector('body') || clone).appendChild(counterScript);
        }

        return '<!doctype html>\n' + clone.outerHTML;
    }

    function findEl(id) { return document.querySelector(`[data-builder-el="${id}"]`); }
    function findSec(id) { return document.querySelector(`[data-builder-section="${id}"]`); }
    function getSectionsInfo() {
        return [...document.querySelectorAll('[data-builder-section]')].map(s=>({ id:s.dataset.builderSection, label:s.dataset.builderSection, visible:s.style.display!=='none' }));
    }
    function sendToParent(data) { if(window.parent&&window.parent!==window) window.parent.postMessage(data,'*'); }

    // ── Boot ─────────────────────────────────────────────────
    document.readyState==='loading' ? document.addEventListener('DOMContentLoaded',init) : init();
})();
