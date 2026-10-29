/**
 * Store Page — Renders approved products from API
 */
document.addEventListener('DOMContentLoaded', () => {
    const grid = document.getElementById('productGrid');
    const searchInput = document.getElementById('searchInput');
    const filterContainer = document.getElementById('categoryFilters');
    const resultsCount = document.getElementById('resultsCount');

    const PAGE_SIZE = 12;
    let currentCategory = 'all';
    let searchQuery = '';
    let currentPage = 0;
    let allItems = [];

    // ── Skeleton Loading ──────────────────────────
    function renderSkeletons() {
        grid.innerHTML = Array.from({ length: PAGE_SIZE }, () => `
            <div class="glass-card-static rounded-2xl overflow-hidden">
                <div class="skeleton h-52 w-full"></div>
                <div class="p-5 space-y-3">
                    <div class="skeleton h-5 w-3/4 rounded-lg"></div>
                    <div class="skeleton h-4 w-full rounded-lg"></div>
                    <div class="skeleton h-4 w-2/3 rounded-lg"></div>
                    <div class="flex justify-between items-center mt-4">
                        <div class="skeleton h-7 w-1/3 rounded-lg"></div>
                        <div class="skeleton h-4 w-1/4 rounded-lg"></div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // ── Render One Page ───────────────────────────
    function renderPage(items, page) {
        const start = page * PAGE_SIZE;
        const pageItems = items.slice(start, start + PAGE_SIZE);

        grid.innerHTML = pageItems.map((item, idx) => {
            const badge = Utils.conditionBadge(item.condition);
            const hasImage = item.images && item.images.length > 0;
            const placeholder = Utils.getPlaceholderImage(item.category);

            return `
                <a href="product.html?id=${item.id}" class="glass-card rounded-2xl overflow-hidden fade-in stagger-${(idx % 5) + 1} block no-underline group cursor-pointer" style="opacity: 0;">
                    <div class="product-img-placeholder bg-gradient-to-br from-slate-800 to-slate-900 relative overflow-hidden">
                        ${hasImage
                            ? `<img src="${item.images[0]}" alt="${Utils.escapeHtml(item.title)}" class="w-full h-52 object-cover group-hover:scale-105 transition-transform duration-500">`
                            : `<div class="flex flex-col items-center gap-2">
                                <span class="text-5xl group-hover:scale-110 transition-transform duration-300">${placeholder.icon}</span>
                                <span class="text-xs text-slate-500 font-medium uppercase tracking-wider">${Utils.categoryLabel(item.category).replace(/^.+?\s/, '')}</span>
                              </div>`
                        }
                        <div class="absolute top-3 right-3">
                            <span class="px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.class}">${badge.text}</span>
                        </div>
                        <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-4">
                            <span class="px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-sm text-white text-xs font-semibold border border-white/20">View Details →</span>
                        </div>
                    </div>
                    <div class="p-5">
                        <h3 class="text-lg font-bold text-white leading-tight line-clamp-2 group-hover:text-indigo-300 transition-colors mb-2">${Utils.escapeHtml(item.title)}</h3>
                        <p class="text-slate-400 text-sm mb-4 line-clamp-2">${Utils.escapeHtml(item.description)}</p>
                        <div class="flex items-center justify-between">
                            <span class="text-2xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                                ${Utils.formatPrice(item.price)}
                            </span>
                            <span class="text-xs text-slate-500">${Utils.timeAgo(item.created_at)}</span>
                        </div>
                        <div class="mt-3 pt-3 border-t border-slate-700/50 flex items-center justify-between">
                            <div class="flex items-center gap-2">
                                <div class="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs text-white font-bold">
                                    ${(item.seller_name || 'A').charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <span class="text-xs text-slate-300 font-medium">${Utils.escapeHtml(item.seller_name)}</span>
                                    ${item.location ? `<span class="text-[10px] text-slate-500 block">📍 ${Utils.escapeHtml(item.location)}</span>` : ''}
                                </div>
                            </div>
                            ${item.seller_phone ? `<span class="w-7 h-7 rounded-full bg-emerald-500/15 flex items-center justify-center text-xs" title="WhatsApp available">💬</span>` : ''}
                        </div>
                    </div>
                </a>
            `;
        }).join('');

        renderPagination(items.length, page);
    }

    // ── Pagination Controls ───────────────────────
    function renderPagination(total, page) {
        let pager = document.getElementById('pagination');
        if (!pager) {
            pager = document.createElement('div');
            pager.id = 'pagination';
            pager.className = 'flex items-center justify-center gap-3 mt-10';
            grid.parentElement.appendChild(pager);
        }

        const totalPages = Math.ceil(total / PAGE_SIZE);
        if (totalPages <= 1) { pager.innerHTML = ''; return; }

        const prevDisabled = page === 0;
        const nextDisabled = page >= totalPages - 1;

        pager.innerHTML = `
            <button class="pagination-btn" ${prevDisabled ? 'disabled' : ''} id="pgPrev">← Prev</button>
            <span class="text-slate-400 text-sm px-2">Page <strong class="text-white">${page + 1}</strong> of <strong class="text-white">${totalPages}</strong></span>
            <button class="pagination-btn" ${nextDisabled ? 'disabled' : ''} id="pgNext">Next →</button>
        `;

        document.getElementById('pgPrev').addEventListener('click', () => goToPage(page - 1));
        document.getElementById('pgNext').addEventListener('click', () => goToPage(page + 1));
    }

    function goToPage(page) {
        currentPage = page;
        renderPage(allItems, currentPage);
        document.getElementById('products')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ── Fetch + Render ────────────────────────────
    async function renderProducts() {
        renderSkeletons();
        if (resultsCount) resultsCount.textContent = 'Loading...';

        try {
            allItems = await FrontyAPI.getProducts({
                status: 'approved',
                category: currentCategory !== 'all' ? currentCategory : null,
                search: searchQuery || null
            });

            currentPage = 0;

            if (resultsCount) {
                resultsCount.textContent = `${allItems.length} item${allItems.length !== 1 ? 's' : ''} found`;
            }

            if (allItems.length === 0) {
                grid.innerHTML = `
                    <div class="col-span-full empty-state fade-in">
                        <div class="empty-state-icon">🔍</div>
                        <h3 class="text-xl font-semibold text-slate-400 mb-2">No items found</h3>
                        <p class="text-slate-500">Try adjusting your search or filters</p>
                    </div>
                `;
                const pager = document.getElementById('pagination');
                if (pager) pager.innerHTML = '';
                return;
            }

            renderPage(allItems, currentPage);
        } catch (err) {
            grid.innerHTML = `<div class="col-span-full empty-state"><div class="empty-state-icon">⚠️</div><h3 class="text-xl text-red-400">Failed to load products</h3><p class="text-slate-500 mt-2">${err.message}</p></div>`;
        }
    }

    // ── Category Filters ─────────────────────────
    if (filterContainer) {
        filterContainer.addEventListener('click', (e) => {
            const pill = e.target.closest('.filter-pill');
            if (!pill) return;
            filterContainer.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            currentCategory = pill.dataset.category;
            renderProducts();
        });
    }

    // ── Search ───────────────────────────────────
    if (searchInput) {
        let debounce;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                searchQuery = e.target.value.trim();
                renderProducts();
            }, 300);
        });
    }

    Utils.initNavbar();
    renderProducts();
});
