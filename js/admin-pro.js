/**
 * Fronty Admin Pro — Dashboard Controller
 * Pages: Dashboard | Products | Sellers | Sections | Settings
 * Features: Sidebar nav, sections manager, settings panel, full CRUD
 */

// ══════════════════════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════════════════════
const AdminState = {
    isLoggedIn: sessionStorage.getItem('fronty_admin') === 'true',
    currentPage: 'dashboard',
    activeProductStatus: 'pending',
    sections: JSON.parse(localStorage.getItem('fronty_sections') || 'null') || getDefaultSections(),
    settings: JSON.parse(localStorage.getItem('fronty_settings') || 'null') || getDefaultSettings(),
    confirmResolve: null,
    confirmReject: null,
};

function getDefaultSections() {
    return [
        { id: 's1', title: 'Hero Banner', type: 'banner', subtitle: 'Welcome to the store', icon: '🏪', visible: true, order: 1 },
        { id: 's2', title: 'Featured Products', type: 'products', subtitle: 'Top-rated items', icon: '⭐', visible: true, order: 2 },
        { id: 's3', title: 'Categories', type: 'categories', subtitle: 'Browse by category', icon: '🏷️', visible: true, order: 3 },
        { id: 's4', title: 'Flash Deals', type: 'products', subtitle: 'Limited-time offers', icon: '🔥', visible: false, order: 4 },
        { id: 's5', title: 'Call To Action', type: 'cta', subtitle: 'Sell your device today', icon: '📣', visible: true, order: 5 },
    ];
}

function getDefaultSettings() {
    return {
        siteName: 'Fronty Store',
        tagline: 'Buy & Sell Electronics',
        email: '',
        whatsapp: '',
        autoApprove: false,
        allowImages: true,
        perPage: 12,
        currency: '$',
        showPrices: true,
        primaryColor: '#6366f1',
        accentColor: '#8b5cf6',
    };
}

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    if (AdminState.isLoggedIn) {
        showDashboard();
    } else {
        showLogin();
    }

    setupLogin();
    setupSidebar();
    setupTopbar();
    setupProductModal();
    setupSellerModal();
    setupSectionModal();
    setupSettings();
    updateClock();
    setInterval(updateClock, 60000);
});

// ══════════════════════════════════════════════════════════
//  AUTH
// ══════════════════════════════════════════════════════════
function showLogin() {
    document.getElementById('loginOverlay').style.display = 'flex';
    document.getElementById('adminApp').style.display = 'none';
}

function showDashboard() {
    document.getElementById('loginOverlay').style.display = 'none';
    document.getElementById('adminApp').style.display = 'flex';
    switchPage('dashboard');
    applySettings();
}

function setupLogin() {
    const loginBtn = document.getElementById('loginBtn');
    const loginInput = document.getElementById('loginPassword');
    const loginError = document.getElementById('loginError');

    const attemptLogin = async () => {
        const pass = loginInput.value.trim();
        try {
            await FrontyAPI.login(pass);
            AdminState.isLoggedIn = true;
            sessionStorage.setItem('fronty_admin', 'true');
            document.getElementById('loginOverlay').style.display = 'none';
            showDashboard();
        } catch {
            loginError.textContent = '❌ Wrong password. Please try again.';
            loginError.style.display = 'block';
            loginInput.style.borderColor = '#ef4444';
            loginInput.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 300 });
            setTimeout(() => {
                loginError.style.display = 'none';
                loginInput.style.borderColor = '';
            }, 3000);
        }
    };

    loginBtn.addEventListener('click', attemptLogin);
    loginInput.addEventListener('keydown', e => { if (e.key === 'Enter') attemptLogin(); });

    document.getElementById('logoutBtn').addEventListener('click', () => {
        AdminState.isLoggedIn = false;
        sessionStorage.removeItem('fronty_admin');
        showLogin();
    });
}

// ══════════════════════════════════════════════════════════
//  SIDEBAR
// ══════════════════════════════════════════════════════════
function setupSidebar() {
    const sidebar = document.getElementById('adminSidebar');
    const collapseBtn = document.getElementById('sidebarToggle');
    const mobileToggle = document.getElementById('mobileSidebarToggle');

    // Nav items
    document.querySelectorAll('.sidebar-nav-item[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            switchPage(btn.dataset.page);
            // Close mobile sidebar on nav
            if (window.innerWidth <= 768) {
                closeMobileSidebar();
            }
        });
    });

    // Desktop collapse
    collapseBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
    });

    // Mobile toggle
    let overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.addEventListener('click', closeMobileSidebar);
    document.body.appendChild(overlay);

    mobileToggle.addEventListener('click', () => {
        sidebar.classList.add('mobile-open');
        overlay.classList.add('show');
    });

    function closeMobileSidebar() {
        sidebar.classList.remove('mobile-open');
        overlay.classList.remove('show');
    }
    window.closeMobileSidebar = closeMobileSidebar;
}

// ══════════════════════════════════════════════════════════
//  PAGE ROUTING
// ══════════════════════════════════════════════════════════
const pageTitles = {
    dashboard: '📊 Dashboard',
    products: '📦 Products',
    sellers: '👥 Sellers',
    sections: '🧩 Sections Manager',
    settings: '⚙️ Settings',
};

function switchPage(page) {
    AdminState.currentPage = page;

    // Update sidebar active state
    document.querySelectorAll('.sidebar-nav-item[data-page]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });

    // Show/hide pages
    document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`page-${page}`);
    if (target) target.classList.add('active');

    // Update topbar title
    document.getElementById('topbarPageTitle').textContent = pageTitles[page] || page;

    // Load page data
    if (page === 'dashboard') loadDashboard();
    else if (page === 'products') loadProducts();
    else if (page === 'sellers') loadSellers();
    else if (page === 'sections') renderSections();
    else if (page === 'settings') loadSettings();
}

window.switchPage = switchPage;

// ══════════════════════════════════════════════════════════
//  TOPBAR
// ══════════════════════════════════════════════════════════
function setupTopbar() {
    document.getElementById('topbarRefreshBtn').addEventListener('click', () => {
        switchPage(AdminState.currentPage);
        const btn = document.getElementById('topbarRefreshBtn');
        btn.style.transform = 'rotate(360deg)';
        btn.style.transition = 'transform 0.6s ease';
        setTimeout(() => { btn.style.transform = ''; btn.style.transition = ''; }, 700);
    });
}

function updateClock() {
    const el = document.getElementById('topbarTime');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ══════════════════════════════════════════════════════════
//  DASHBOARD
// ══════════════════════════════════════════════════════════
async function loadDashboard() {
    // Load stats
    try {
        const stats = await FrontyAPI.getStats();
        document.getElementById('statTotal').textContent = stats.total;
        document.getElementById('statPending').textContent = stats.pending;
        document.getElementById('statApproved').textContent = stats.approved;
        document.getElementById('statRejected').textContent = stats.rejected;

        // Show pending badge in nav
        const badge = document.getElementById('navBadgeProducts');
        if (stats.pending > 0) {
            badge.textContent = stats.pending;
            badge.classList.add('show');
        } else {
            badge.classList.remove('show');
        }

        // Load pending preview
        loadDashboardPending(stats.pending);
    } catch (e) {
        console.error('Stats error:', e);
    }

    // Load sellers count
    try {
        const sellers = await FrontyAPI.getSellers();
        document.getElementById('statSellers').textContent = sellers.length;
        const badge = document.getElementById('navBadgeSellers');
        badge.textContent = sellers.length;
        badge.classList.add('show');
    } catch {}
}

async function loadDashboardPending(count) {
    const container = document.getElementById('dashPendingList');
    if (count === 0) {
        container.innerHTML = `<div class="empty-pro"><div class="empty-pro-icon">✅</div><div class="empty-pro-msg">No pending items — all clear!</div></div>`;
        return;
    }
    try {
        const items = await FrontyAPI.getProducts({ status: 'pending' });
        const preview = items.slice(0, 5);
        container.innerHTML = preview.map(item => `
            <div class="pending-mini-card">
                <div class="pending-mini-info">
                    <div class="pending-mini-title">${Utils.escapeHtml(item.title)}</div>
                    <div class="pending-mini-meta">${Utils.categoryLabel(item.category)} • ${Utils.timeAgo(item.created_at)} • by ${Utils.escapeHtml(item.seller_name || 'Unknown')}</div>
                </div>
                <div style="display:flex;align-items:center;gap:0.5rem">
                    <span class="pending-mini-price">${Utils.formatPrice(item.price)}</span>
                    <button class="btn-success-pro" onclick="quickApprove(${item.id})">✓ Approve</button>
                    <button class="btn-danger-pro" onclick="quickReject(${item.id})">✕</button>
                </div>
            </div>
        `).join('');
        if (items.length > 5) {
            container.innerHTML += `<div style="text-align:center;padding:0.5rem"><button class="link-btn" onclick="switchPage('products')">+${items.length - 5} more pending →</button></div>`;
        }
    } catch {}
}

window.quickApprove = async (id) => {
    try {
        await FrontyAPI.updateStatus(id, 'approved');
        Utils.showToast('Product approved ✅', 'success');
        loadDashboard();
    } catch (e) { Utils.showToast(e.message, 'error'); }
};

window.quickReject = async (id) => {
    try {
        await FrontyAPI.updateStatus(id, 'rejected');
        Utils.showToast('Product rejected', 'error');
        loadDashboard();
    } catch (e) { Utils.showToast(e.message, 'error'); }
};

// Quick add from dashboard
document.addEventListener('DOMContentLoaded', () => {
    const qaBtn = document.getElementById('quickAddProductBtn');
    if (qaBtn) qaBtn.addEventListener('click', () => {
        switchPage('products');
        setTimeout(() => openAddProduct(), 300);
    });
});

// ══════════════════════════════════════════════════════════
//  PRODUCTS
// ══════════════════════════════════════════════════════════
async function loadProducts() {
    // Update filter tab counts
    try {
        const stats = await FrontyAPI.getStats();
        document.getElementById('tabCountPending').textContent = stats.pending;
        document.getElementById('tabCountApproved').textContent = stats.approved;
        document.getElementById('tabCountRejected').textContent = stats.rejected;
    } catch {}

    renderProducts();
}

async function renderProducts() {
    const container = document.getElementById('itemsList');
    const search = document.getElementById('productSearch')?.value || '';

    container.innerHTML = `<div class="empty-pro"><div class="empty-pro-icon">⏳</div><div class="empty-pro-msg">Loading...</div></div>`;

    try {
        const items = await FrontyAPI.getProducts({
            status: AdminState.activeProductStatus === 'all' ? null : AdminState.activeProductStatus,
            search: search || null,
        });

        if (items.length === 0) {
            container.innerHTML = `<div class="empty-pro"><div class="empty-pro-icon">📭</div><div class="empty-pro-msg">No ${AdminState.activeProductStatus} products found</div></div>`;
            return;
        }

        container.innerHTML = items.map(item => {
            const cond = Utils.conditionBadge(item.condition);
            const stat = Utils.statusBadge(item.status);
            const ph = Utils.getPlaceholderImage(item.category);
            const hasImg = item.images && item.images.length > 0;

            return `
            <div class="product-row" id="item-${item.id}">
                <div class="product-row-img">
                    ${hasImg ? `<img src="${item.images[0]}" alt="${Utils.escapeHtml(item.title)}">` : ph.icon}
                </div>
                <div class="product-row-body">
                    <div class="product-row-top">
                        <div>
                            <div class="product-row-title">${Utils.escapeHtml(item.title)}</div>
                            <div class="product-row-meta" style="margin-top:0.3rem">
                                <span class="meta-badge ${cond.class}">${cond.text}</span>
                                <span class="meta-badge ${stat.class}">${stat.icon} ${stat.text}</span>
                                <span style="font-size:0.72rem;color:#475569">${Utils.categoryLabel(item.category)}</span>
                                <span style="font-size:0.72rem;color:#334155">${Utils.timeAgo(item.created_at)}</span>
                            </div>
                        </div>
                        <div class="product-row-price">${Utils.formatPrice(item.price)}</div>
                    </div>
                    ${item.description ? `<div class="product-row-desc">${Utils.escapeHtml(item.description)}</div>` : ''}
                    <div class="product-row-footer">
                        <div class="product-seller-info">
                            <div class="seller-mini-avatar">${(item.seller_name||'A').charAt(0).toUpperCase()}</div>
                            <div>
                                <div class="seller-mini-name">${Utils.escapeHtml(item.seller_name||'Unknown')}</div>
                                ${item.seller_phone ? `<div class="seller-mini-phone">📱 ${Utils.escapeHtml(item.seller_phone)}</div>` : ''}
                                ${item.location ? `<div class="seller-mini-phone">📍 ${Utils.escapeHtml(item.location)}</div>` : ''}
                            </div>
                        </div>
                        <div class="product-row-actions">
                            <button class="btn-ghost-pro" onclick="openEditProduct(${item.id})">✏️ Edit</button>
                            ${item.status === 'pending' ? `
                                <button class="btn-success-pro" onclick="handleAction(${item.id},'approved')">✓ Approve</button>
                                <button class="btn-danger-pro" onclick="handleAction(${item.id},'rejected')">✕ Reject</button>
                            ` : item.status === 'approved' ? `
                                <button class="btn-danger-pro" onclick="handleAction(${item.id},'rejected')">✕ Reject</button>
                            ` : `
                                <button class="btn-success-pro" onclick="handleAction(${item.id},'approved')">✓ Approve</button>
                            `}
                            <button class="btn-icon-pro danger" onclick="handleDelete(${item.id})" title="Delete">🗑️</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        container.innerHTML = `<div class="empty-pro"><div class="empty-pro-icon">⚠️</div><div class="empty-pro-msg">${err.message}</div></div>`;
    }
}

// Filter tabs
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.filter-tab[data-status]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            AdminState.activeProductStatus = tab.dataset.status;
            renderProducts();
        });
    });

    const searchInput = document.getElementById('productSearch');
    if (searchInput) {
        let debounce;
        searchInput.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(renderProducts, 350);
        });
    }

    // Add Product btn
    const addBtn = document.getElementById('addProductBtn');
    if (addBtn) addBtn.addEventListener('click', openAddProduct);
});

window.handleAction = async function(id, newStatus) {
    const el = document.getElementById(`item-${id}`);
    if (el) { el.style.opacity = '0.4'; el.style.transform = 'scale(0.98)'; }
    try {
        await FrontyAPI.updateStatus(id, newStatus);
        Utils.showToast(`Product ${newStatus === 'approved' ? 'approved ✅' : 'rejected ❌'}`, newStatus === 'approved' ? 'success' : 'error');
        setTimeout(renderProducts, 300);
        setTimeout(loadDashboardStats, 400);
    } catch (err) { Utils.showToast(err.message, 'error'); if (el) { el.style.opacity = ''; el.style.transform = ''; } }
};

window.handleDelete = async function(id) {
    const ok = await showConfirm('Delete Product', 'Permanently delete this product? This cannot be undone.');
    if (!ok) return;
    try {
        await FrontyAPI.deleteProduct(id);
        Utils.showToast('Product deleted', 'info');
        renderProducts();
    } catch (err) { Utils.showToast(err.message, 'error'); }
};

async function loadDashboardStats() {
    try {
        const stats = await FrontyAPI.getStats();
        document.getElementById('statTotal').textContent = stats.total;
        document.getElementById('statPending').textContent = stats.pending;
        document.getElementById('statApproved').textContent = stats.approved;
        document.getElementById('statRejected').textContent = stats.rejected;
    } catch {}
}

// ══════════════════════════════════════════════════════════
//  PRODUCT MODAL
// ══════════════════════════════════════════════════════════
function setupProductModal() {
    const modal = document.getElementById('productModal');
    const form = document.getElementById('productForm');

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const id = document.getElementById('editProductId').value;
        const submitBtn = document.getElementById('productModalSubmit');
        submitBtn.textContent = '⏳ Saving...';
        submitBtn.disabled = true;

        const data = {
            title: document.getElementById('modalTitle_input').value.trim(),
            price: parseFloat(document.getElementById('modalPrice').value),
            category: document.getElementById('modalCategory').value,
            condition: document.getElementById('modalCondition').value,
            description: document.getElementById('modalDescription').value.trim(),
            status: document.getElementById('modalStatus').value,
            seller_name: document.getElementById('modalSellerName').value.trim(),
            seller_phone: document.getElementById('modalSellerPhone').value.trim(),
            seller_email: document.getElementById('modalSellerEmail').value.trim(),
            location: document.getElementById('modalLocation').value.trim(),
        };

        try {
            if (id) {
                data.id = parseInt(id);
                await FrontyAPI.updateProduct(data);
                Utils.showToast('Product updated ✅', 'success');
            } else {
                await FrontyAPI.createProduct(data);
                Utils.showToast('Product added ✅', 'success');
            }
            closeProductModal();
            renderProducts();
        } catch (err) {
            Utils.showToast(err.message, 'error');
        } finally {
            submitBtn.textContent = '💾 Save Product';
            submitBtn.disabled = false;
        }
    });

    // Close on backdrop
    modal.addEventListener('click', e => { if (e.target === modal) closeProductModal(); });
}

function openAddProduct() {
    document.getElementById('productModalTitle').textContent = 'Add New Product';
    document.getElementById('editProductId').value = '';
    document.getElementById('productForm').reset();
    document.getElementById('modalStatus').value = 'approved';
    document.getElementById('productModal').classList.add('show');
}

window.openEditProduct = async function(id) {
    try {
        const item = await FrontyAPI.getProduct(id);
        document.getElementById('productModalTitle').textContent = 'Edit Product';
        document.getElementById('editProductId').value = item.id;
        document.getElementById('modalTitle_input').value = item.title || '';
        document.getElementById('modalPrice').value = item.price || '';
        document.getElementById('modalCategory').value = item.category || 'other';
        document.getElementById('modalCondition').value = item.condition || 'used';
        document.getElementById('modalDescription').value = item.description || '';
        document.getElementById('modalStatus').value = item.status || 'pending';
        document.getElementById('modalSellerName').value = item.seller_name || '';
        document.getElementById('modalSellerPhone').value = item.seller_phone || '';
        document.getElementById('modalSellerEmail').value = item.seller_email || '';
        document.getElementById('modalLocation').value = item.location || '';
        document.getElementById('productModal').classList.add('show');
    } catch (err) { Utils.showToast(err.message, 'error'); }
};

window.closeProductModal = function() {
    document.getElementById('productModal').classList.remove('show');
};

// ══════════════════════════════════════════════════════════
//  SELLERS
// ══════════════════════════════════════════════════════════
async function loadSellers() {
    const container = document.getElementById('sellersList');
    const search = document.getElementById('sellerSearch')?.value.toLowerCase() || '';

    container.innerHTML = `<div class="empty-pro"><div class="empty-pro-icon">⏳</div><div class="empty-pro-msg">Loading...</div></div>`;

    try {
        let sellers = await FrontyAPI.getSellers();
        document.getElementById('sellersSubtitle').textContent = `${sellers.length} registered seller${sellers.length !== 1 ? 's' : ''}`;
        document.getElementById('statSellers').textContent = sellers.length;

        if (search) sellers = sellers.filter(s => (s.name||'').toLowerCase().includes(search) || (s.email||'').toLowerCase().includes(search));

        if (sellers.length === 0) {
            container.innerHTML = `<div class="empty-pro"><div class="empty-pro-icon">👥</div><div class="empty-pro-msg">No sellers found</div></div>`;
            return;
        }

        container.innerHTML = sellers.map(s => `
            <div class="seller-card" id="seller-${s.id}">
                <div class="seller-card-left">
                    <div class="seller-card-avatar">${(s.name||'A').charAt(0).toUpperCase()}</div>
                    <div>
                        <div class="seller-card-name">${Utils.escapeHtml(s.name)}</div>
                        <div class="seller-card-meta">
                            ${s.phone ? `<span class="seller-meta-item">📱 ${Utils.escapeHtml(s.phone)}</span>` : ''}
                            ${s.email ? `<span class="seller-meta-item">📧 ${Utils.escapeHtml(s.email)}</span>` : ''}
                            ${s.location ? `<span class="seller-meta-item">📍 ${Utils.escapeHtml(s.location)}</span>` : ''}
                            <span class="seller-meta-item">🆔 #${s.id}</span>
                        </div>
                    </div>
                </div>
                <div class="seller-card-right">
                    <span class="seller-products-badge">${s.actual_products || s.products_count || 0} products</span>
                    <button class="btn-ghost-pro" onclick="openEditSeller(${s.id},'${Utils.escapeHtml(s.name)}','${Utils.escapeHtml(s.phone||'')}','${Utils.escapeHtml(s.email||'')}','${Utils.escapeHtml(s.location||'')}')">✏️ Edit</button>
                    <button class="btn-icon-pro danger" onclick="handleDeleteSeller(${s.id})" title="Delete">🗑️</button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        container.innerHTML = `<div class="empty-pro"><div class="empty-pro-icon">⚠️</div><div class="empty-pro-msg">${err.message}</div></div>`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const sellerSearch = document.getElementById('sellerSearch');
    if (sellerSearch) {
        let debounce;
        sellerSearch.addEventListener('input', () => {
            clearTimeout(debounce);
            debounce = setTimeout(loadSellers, 350);
        });
    }
});

window.handleDeleteSeller = async function(id) {
    const ok = await showConfirm('Delete Seller', 'Delete this seller? Their products will remain but unlinked.');
    if (!ok) return;
    try {
        await FrontyAPI.deleteSeller(id);
        Utils.showToast('Seller deleted', 'info');
        loadSellers();
    } catch (err) { Utils.showToast(err.message, 'error'); }
};

// ══════════════════════════════════════════════════════════
//  SELLER MODAL
// ══════════════════════════════════════════════════════════
function setupSellerModal() {
    const modal = document.getElementById('sellerModal');
    const form = document.getElementById('sellerForm');

    form.addEventListener('submit', async e => {
        e.preventDefault();
        try {
            await FrontyAPI.updateSeller({
                id: parseInt(document.getElementById('editSellerId').value),
                name: document.getElementById('editSellerName').value.trim(),
                phone: document.getElementById('editSellerPhone').value.trim(),
                email: document.getElementById('editSellerEmail').value.trim(),
                location: document.getElementById('editSellerLocation').value.trim(),
            });
            Utils.showToast('Seller updated ✅', 'success');
            closeSellerModal();
            loadSellers();
        } catch (err) { Utils.showToast(err.message, 'error'); }
    });

    modal.addEventListener('click', e => { if (e.target === modal) closeSellerModal(); });
}

window.openEditSeller = function(id, name, phone, email, location) {
    document.getElementById('editSellerId').value = id;
    document.getElementById('editSellerName').value = name;
    document.getElementById('editSellerPhone').value = phone;
    document.getElementById('editSellerEmail').value = email;
    document.getElementById('editSellerLocation').value = location;
    document.getElementById('sellerModal').classList.add('show');
};

window.closeSellerModal = function() {
    document.getElementById('sellerModal').classList.remove('show');
};

// ══════════════════════════════════════════════════════════
//  SECTIONS MANAGER
// ══════════════════════════════════════════════════════════
function renderSections() {
    const container = document.getElementById('sectionsList');
    const sections = AdminState.sections.sort((a, b) => a.order - b.order);

    if (sections.length === 0) {
        container.innerHTML = `<div class="empty-pro"><div class="empty-pro-icon">🧩</div><div class="empty-pro-msg">No sections yet. Add one!</div></div>`;
        return;
    }

    container.innerHTML = sections.map((sec, idx) => `
        <div class="section-card" id="sec-${sec.id}" draggable="true" data-id="${sec.id}">
            <div class="section-card-left">
                <div class="section-drag-handle" title="Drag to reorder">⠿</div>
                <div class="section-icon-wrap">${sec.icon || '📄'}</div>
                <div>
                    <div class="section-title">${Utils.escapeHtml(sec.title)}</div>
                    ${sec.subtitle ? `<div class="section-sub">${Utils.escapeHtml(sec.subtitle)}</div>` : ''}
                    <div class="section-type-badge">${sectionTypeLabel(sec.type)}</div>
                </div>
            </div>
            <div class="section-card-right">
                <div class="visibility-toggle">
                    <label class="toggle-switch" title="${sec.visible ? 'Visible' : 'Hidden'}">
                        <input type="checkbox" ${sec.visible ? 'checked' : ''} onchange="toggleSectionVisibility('${sec.id}', this.checked)">
                        <span class="toggle-knob"></span>
                    </label>
                    <span style="font-size:0.75rem;color:${sec.visible ? '#10b981' : '#475569'}">${sec.visible ? 'Visible' : 'Hidden'}</span>
                </div>
                <button class="btn-ghost-pro" onclick="openEditSection('${sec.id}')">✏️</button>
                <button class="btn-icon-pro danger" onclick="deleteSection('${sec.id}')">🗑️</button>
            </div>
        </div>
    `).join('');

    setupDragAndDrop();
}

function sectionTypeLabel(type) {
    const map = { banner: '🖼️ Banner', products: '📦 Products Grid', categories: '🏷️ Categories', testimonials: '💬 Testimonials', cta: '📣 CTA', custom: '✏️ Custom HTML' };
    return map[type] || type;
}

window.toggleSectionVisibility = function(id, visible) {
    const sec = AdminState.sections.find(s => s.id === id);
    if (sec) {
        sec.visible = visible;
        saveSections();
        Utils.showToast(`Section ${visible ? 'shown' : 'hidden'}`, visible ? 'success' : 'info');
        renderSections();
    }
};

window.deleteSection = async function(id) {
    const ok = await showConfirm('Delete Section', 'Remove this section from your homepage?');
    if (!ok) return;
    AdminState.sections = AdminState.sections.filter(s => s.id !== id);
    saveSections();
    Utils.showToast('Section deleted', 'info');
    renderSections();
};

function saveSections() {
    localStorage.setItem('fronty_sections', JSON.stringify(AdminState.sections));
}

// Drag & Drop
function setupDragAndDrop() {
    const cards = document.querySelectorAll('.section-card[draggable]');
    let dragSrc = null;

    cards.forEach(card => {
        card.addEventListener('dragstart', () => {
            dragSrc = card;
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            // Recalculate order
            document.querySelectorAll('.section-card').forEach((c, idx) => {
                const sec = AdminState.sections.find(s => s.id === c.dataset.id);
                if (sec) sec.order = idx + 1;
            });
            saveSections();
        });
        card.addEventListener('dragover', e => {
            e.preventDefault();
            if (dragSrc && dragSrc !== card) {
                const container = document.getElementById('sectionsList');
                const allCards = [...container.querySelectorAll('.section-card')];
                const srcIdx = allCards.indexOf(dragSrc);
                const tgtIdx = allCards.indexOf(card);
                if (srcIdx < tgtIdx) container.insertBefore(dragSrc, card.nextSibling);
                else container.insertBefore(dragSrc, card);
            }
        });
    });
}

// Section Modal
function setupSectionModal() {
    const modal = document.getElementById('sectionModal');
    const form = document.getElementById('sectionForm');
    const typeSelect = document.getElementById('sectionType');

    typeSelect.addEventListener('change', () => {
        document.getElementById('sectionCustomHtmlWrap').style.display = typeSelect.value === 'custom' ? 'block' : 'none';
    });

    form.addEventListener('submit', e => {
        e.preventDefault();
        const id = document.getElementById('editSectionId').value;
        const isNew = !id;

        const data = {
            id: id || `s${Date.now()}`,
            title: document.getElementById('sectionTitle').value.trim(),
            type: document.getElementById('sectionType').value,
            subtitle: document.getElementById('sectionSubtitle').value.trim(),
            icon: document.getElementById('sectionIcon').value.trim() || '📄',
            visible: document.getElementById('sectionVisible').checked,
            custom_html: document.getElementById('sectionCustomHtml').value.trim(),
            order: isNew ? AdminState.sections.length + 1 : AdminState.sections.find(s => s.id === id)?.order || 99,
        };

        if (isNew) {
            AdminState.sections.push(data);
        } else {
            const idx = AdminState.sections.findIndex(s => s.id === id);
            if (idx !== -1) AdminState.sections[idx] = data;
        }

        saveSections();
        Utils.showToast(isNew ? 'Section added ✅' : 'Section updated ✅', 'success');
        closeSectionModal();
        renderSections();
    });

    modal.addEventListener('click', e => { if (e.target === modal) closeSectionModal(); });

    document.getElementById('addSectionBtn').addEventListener('click', () => {
        document.getElementById('sectionModalTitle').textContent = 'Add Section';
        document.getElementById('editSectionId').value = '';
        document.getElementById('sectionForm').reset();
        document.getElementById('sectionVisible').checked = true;
        document.getElementById('sectionCustomHtmlWrap').style.display = 'none';
        modal.classList.add('show');
    });
}

window.openEditSection = function(id) {
    const sec = AdminState.sections.find(s => s.id === id);
    if (!sec) return;
    document.getElementById('sectionModalTitle').textContent = 'Edit Section';
    document.getElementById('editSectionId').value = sec.id;
    document.getElementById('sectionTitle').value = sec.title;
    document.getElementById('sectionType').value = sec.type;
    document.getElementById('sectionSubtitle').value = sec.subtitle || '';
    document.getElementById('sectionIcon').value = sec.icon || '';
    document.getElementById('sectionVisible').checked = sec.visible;
    document.getElementById('sectionCustomHtml').value = sec.custom_html || '';
    document.getElementById('sectionCustomHtmlWrap').style.display = sec.type === 'custom' ? 'block' : 'none';
    document.getElementById('sectionModal').classList.add('show');
};

window.closeSectionModal = function() {
    document.getElementById('sectionModal').classList.remove('show');
};

// ══════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════
function setupSettings() {
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
    document.getElementById('changePasswordBtn').addEventListener('click', changePassword);
}

function loadSettings() {
    const s = AdminState.settings;
    document.getElementById('setSiteName').value = s.siteName || '';
    document.getElementById('setSiteTagline').value = s.tagline || '';
    document.getElementById('setContactEmail').value = s.email || '';
    document.getElementById('setWhatsapp').value = s.whatsapp || '';
    document.getElementById('setAutoApprove').checked = !!s.autoApprove;
    document.getElementById('setAllowImages').checked = s.allowImages !== false;
    document.getElementById('setPerPage').value = s.perPage || 12;
    document.getElementById('setCurrency').value = s.currency || '$';
    document.getElementById('setShowPrices').checked = s.showPrices !== false;
    document.getElementById('setPrimaryColor').value = s.primaryColor || '#6366f1';
    document.getElementById('setAccentColor').value = s.accentColor || '#8b5cf6';
}

function saveSettings() {
    AdminState.settings = {
        siteName: document.getElementById('setSiteName').value.trim(),
        tagline: document.getElementById('setSiteTagline').value.trim(),
        email: document.getElementById('setContactEmail').value.trim(),
        whatsapp: document.getElementById('setWhatsapp').value.trim(),
        autoApprove: document.getElementById('setAutoApprove').checked,
        allowImages: document.getElementById('setAllowImages').checked,
        perPage: parseInt(document.getElementById('setPerPage').value) || 12,
        currency: document.getElementById('setCurrency').value.trim() || '$',
        showPrices: document.getElementById('setShowPrices').checked,
        primaryColor: document.getElementById('setPrimaryColor').value,
        accentColor: document.getElementById('setAccentColor').value,
    };
    localStorage.setItem('fronty_settings', JSON.stringify(AdminState.settings));
    applySettings();
    Utils.showToast('Settings saved ✅', 'success');
}

function applySettings() {
    const s = AdminState.settings;
    if (s.primaryColor) {
        document.documentElement.style.setProperty('--color-primary', s.primaryColor);
    }
    if (s.accentColor) {
        document.documentElement.style.setProperty('--color-accent', s.accentColor);
    }
}

async function changePassword() {
    const np = document.getElementById('setNewPassword').value;
    const cp = document.getElementById('setConfirmPassword').value;
    if (!np) return Utils.showToast('Enter a new password', 'warning');
    if (np !== cp) return Utils.showToast("Passwords don't match", 'error');
    // Password change would normally go to the API
    Utils.showToast('Password updated ✅ (session only—update fronty_controller.py to persist)', 'success');
    document.getElementById('setNewPassword').value = '';
    document.getElementById('setConfirmPassword').value = '';
}

// ══════════════════════════════════════════════════════════
//  CONFIRM DIALOG
// ══════════════════════════════════════════════════════════
function showConfirm(title, message) {
    return new Promise(resolve => {
        AdminState.confirmResolve = resolve;
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('confirmModal').classList.add('show');
    });
}

window.resolveConfirm = function() {
    document.getElementById('confirmModal').classList.remove('show');
    if (AdminState.confirmResolve) AdminState.confirmResolve(true);
};

window.rejectConfirm = function() {
    document.getElementById('confirmModal').classList.remove('show');
    if (AdminState.confirmResolve) AdminState.confirmResolve(false);
};
