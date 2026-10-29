/**
 * Admin Dashboard — Full CRUD with API
 * Tabs: Products (pending/approved/rejected) | Sellers
 * Features: Add product, Edit product, Delete, Approve/Reject, Manage sellers
 */
document.addEventListener('DOMContentLoaded', () => {
    let isLoggedIn = sessionStorage.getItem('fronty_admin') === 'true';
    let activeTab = 'pending';
    let activeSection = 'products';

    const loginOverlay = document.getElementById('loginOverlay');
    const dashboardContent = document.getElementById('dashboardContent');
    const loginBtn = document.getElementById('loginBtn');
    const loginInput = document.getElementById('loginPassword');
    const loginError = document.getElementById('loginError');
    const logoutBtn = document.getElementById('logoutBtn');

    // ── Auth ─────────────────────────────────────
    function checkAuth() {
        if (isLoggedIn) {
            loginOverlay.style.display = 'none';
            dashboardContent.style.display = 'block';
            refreshDashboard();
        } else {
            loginOverlay.style.display = 'flex';
            dashboardContent.style.display = 'none';
        }
    }

    loginBtn.addEventListener('click', async () => {
        const pass = loginInput.value.trim();
        try {
            await FrontyAPI.login(pass);
            isLoggedIn = true;
            sessionStorage.setItem('fronty_admin', 'true');
            loginOverlay.style.display = 'none';
            dashboardContent.style.display = 'block';
            dashboardContent.classList.add('fade-in');
            refreshDashboard();
        } catch {
            loginError.textContent = 'Wrong password. Try again.';
            loginError.style.display = 'block';
            loginInput.classList.add('border-red-500');
            setTimeout(() => { loginError.style.display = 'none'; loginInput.classList.remove('border-red-500'); }, 3000);
        }
    });

    loginInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loginBtn.click(); });

    logoutBtn.addEventListener('click', () => {
        isLoggedIn = false;
        sessionStorage.removeItem('fronty_admin');
        loginOverlay.style.display = 'flex';
        dashboardContent.style.display = 'none';
        loginInput.value = '';
    });

    // ── Dashboard Refresh ────────────────────────
    async function refreshDashboard() {
        await renderStats();
        if (activeSection === 'products') await renderItems();
        else await renderSellers();
    }

    async function renderStats() {
        try {
            const stats = await FrontyAPI.getStats();
            document.getElementById('statTotal').textContent = stats.total;
            document.getElementById('statPending').textContent = stats.pending;
            document.getElementById('statApproved').textContent = stats.approved;
            document.getElementById('statRejected').textContent = stats.rejected;
        } catch {}
    }

    // ── Section Tabs (Products / Sellers) ────────
    document.querySelectorAll('[data-section]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-section]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeSection = btn.dataset.section;
            document.getElementById('productsSection').style.display = activeSection === 'products' ? 'block' : 'none';
            document.getElementById('sellersSection').style.display = activeSection === 'sellers' ? 'block' : 'none';
            if (activeSection === 'sellers') renderSellers();
            else renderItems();
        });
    });

    // ── Product Status Tabs ──────────────────────
    document.querySelectorAll('[data-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            activeTab = tab.dataset.tab;
            renderItems();
        });
    });

    // ── Render Products ──────────────────────────
    async function renderItems() {
        const container = document.getElementById('itemsList');
        try {
            const items = await FrontyAPI.getProducts({ status: activeTab });

            if (items.length === 0) {
                container.innerHTML = `<div class="empty-state fade-in"><div class="empty-state-icon">${activeTab === 'pending' ? '📭' : activeTab === 'approved' ? '✅' : '🗑️'}</div><h3 class="text-xl font-semibold text-slate-400 mb-2">No ${activeTab} items</h3></div>`;
                return;
            }

            container.innerHTML = items.map((item, idx) => {
                const condBadge = Utils.conditionBadge(item.condition);
                const statusBadge = Utils.statusBadge(item.status);
                const hasImage = item.images && item.images.length > 0;
                const placeholder = Utils.getPlaceholderImage(item.category);

                return `
                <div class="glass-card-static rounded-2xl overflow-hidden fade-in stagger-${(idx % 5) + 1}" style="opacity: 0;" id="item-${item.id}">
                    <div class="flex flex-col md:flex-row">
                        <div class="md:w-56 shrink-0">
                            ${hasImage
                                ? `<img src="${item.images[0]}" alt="${Utils.escapeHtml(item.title)}" class="w-full h-48 md:h-full object-cover">`
                                : `<div class="w-full h-48 md:h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center text-5xl">${placeholder.icon}</div>`
                            }
                        </div>
                        <div class="flex-1 p-5">
                            <div class="flex items-start justify-between gap-3 mb-3">
                                <div>
                                    <h3 class="text-lg font-bold text-white mb-1">${Utils.escapeHtml(item.title)}</h3>
                                    <div class="flex items-center gap-2 flex-wrap">
                                        <span class="px-2.5 py-0.5 rounded-full text-xs font-semibold border ${condBadge.class}">${condBadge.text}</span>
                                        <span class="text-xs text-slate-500">${Utils.categoryLabel(item.category)}</span>
                                        <span class="text-xs text-slate-500">•</span>
                                        <span class="text-xs text-slate-500">ID: ${item.id}</span>
                                        <span class="text-xs text-slate-500">•</span>
                                        <span class="text-xs text-slate-500">${Utils.timeAgo(item.created_at)}</span>
                                    </div>
                                </div>
                                <span class="text-xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent whitespace-nowrap">${Utils.formatPrice(item.price)}</span>
                            </div>
                            <p class="text-slate-400 text-sm mb-4 line-clamp-2">${Utils.escapeHtml(item.description)}</p>
                            <div class="flex items-center justify-between flex-wrap gap-3">
                                <div class="flex items-center gap-2">
                                    <div class="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs text-white font-bold">${(item.seller_name || 'A').charAt(0).toUpperCase()}</div>
                                    <div>
                                        <span class="text-sm text-slate-300 font-medium">${Utils.escapeHtml(item.seller_name)}</span>
                                        ${item.seller_phone ? `<span class="text-xs text-slate-500 block">📱 ${Utils.escapeHtml(item.seller_phone)}</span>` : ''}
                                        ${item.location ? `<span class="text-xs text-slate-500 block">📍 ${Utils.escapeHtml(item.location)}</span>` : ''}
                                    </div>
                                </div>
                                <div class="flex items-center gap-2 flex-wrap">
                                    <button class="btn-ghost text-sm" onclick="openEditProduct(${item.id})">✏️ Edit</button>
                                    ${activeTab === 'pending' ? `
                                        <button class="btn-success text-sm" onclick="handleAction(${item.id}, 'approved')">✓ Approve</button>
                                        <button class="btn-danger text-sm" onclick="handleAction(${item.id}, 'rejected')">✕ Reject</button>
                                    ` : activeTab === 'approved' ? `
                                        <span class="px-3 py-1.5 rounded-full text-xs font-semibold border ${statusBadge.class}">${statusBadge.icon} ${statusBadge.text}</span>
                                        <button class="btn-ghost text-sm" onclick="handleAction(${item.id}, 'rejected')">✕ Reject</button>
                                    ` : `
                                        <span class="px-3 py-1.5 rounded-full text-xs font-semibold border ${statusBadge.class}">${statusBadge.icon} ${statusBadge.text}</span>
                                        <button class="btn-ghost text-sm" onclick="handleAction(${item.id}, 'approved')">✓ Approve</button>
                                    `}
                                    <button class="btn-ghost text-sm text-red-400 hover:text-red-300" onclick="handleDelete(${item.id})" title="Delete">🗑️</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');
        } catch (err) {
            container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3 class="text-xl text-red-400">${err.message}</h3></div>`;
        }
    }

    // ── Render Sellers ───────────────────────────
    async function renderSellers() {
        const container = document.getElementById('sellersList');
        try {
            const sellers = await FrontyAPI.getSellers();
            document.getElementById('sellersCount').textContent = `${sellers.length} seller${sellers.length !== 1 ? 's' : ''}`;

            if (sellers.length === 0) {
                container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">👥</div><h3 class="text-xl text-slate-400">No sellers yet</h3></div>`;
                return;
            }

            container.innerHTML = sellers.map((seller, idx) => `
                <div class="glass-card-static rounded-2xl p-5 fade-in stagger-${(idx % 5) + 1}" style="opacity: 0;" id="seller-${seller.id}">
                    <div class="flex items-center justify-between flex-wrap gap-4">
                        <div class="flex items-center gap-4">
                            <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-lg text-white font-bold shadow-lg">
                                ${(seller.name || 'A').charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-white">${Utils.escapeHtml(seller.name)}</h3>
                                <div class="flex items-center gap-3 flex-wrap text-xs text-slate-400 mt-1">
                                    ${seller.phone ? `<span>📱 ${Utils.escapeHtml(seller.phone)}</span>` : ''}
                                    ${seller.email ? `<span>📧 ${Utils.escapeHtml(seller.email)}</span>` : ''}
                                    ${seller.location ? `<span>📍 ${Utils.escapeHtml(seller.location)}</span>` : ''}
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="px-3 py-1.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                ${seller.actual_products || seller.products_count || 0} products
                            </span>
                            <span class="text-xs text-slate-500">#${seller.id}</span>
                            <button class="btn-ghost text-sm" onclick="openEditSeller(${seller.id}, '${Utils.escapeHtml(seller.name)}', '${Utils.escapeHtml(seller.phone || '')}', '${Utils.escapeHtml(seller.email || '')}', '${Utils.escapeHtml(seller.location || '')}')">✏️</button>
                            <button class="btn-ghost text-sm text-red-400" onclick="handleDeleteSeller(${seller.id})">🗑️</button>
                        </div>
                    </div>
                </div>
            `).join('');
        } catch (err) {
            container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">⚠️</div><h3 class="text-xl text-red-400">${err.message}</h3></div>`;
        }
    }

    // ── Product Actions (global) ─────────────────
    window.handleAction = async function(id, newStatus) {
        const el = document.getElementById(`item-${id}`);
        if (el) { el.style.transition = 'all 0.4s ease'; el.style.opacity = '0'; el.style.transform = 'translateX(30px)'; }
        try {
            await FrontyAPI.updateStatus(id, newStatus);
            Utils.showToast(`Product ${newStatus === 'approved' ? 'approved ✅' : 'rejected ❌'}`, newStatus === 'approved' ? 'success' : 'error');
            setTimeout(() => refreshDashboard(), 400);
        } catch (err) { Utils.showToast(err.message, 'error'); }
    };

    window.handleDelete = async function(id) {
        if (!confirm('Delete this product permanently?')) return;
        try {
            await FrontyAPI.deleteProduct(id);
            Utils.showToast('Product deleted', 'info');
            refreshDashboard();
        } catch (err) { Utils.showToast(err.message, 'error'); }
    };

    window.handleDeleteSeller = async function(id) {
        if (!confirm('Delete this seller?')) return;
        try {
            await FrontyAPI.deleteSeller(id);
            Utils.showToast('Seller deleted', 'info');
            renderSellers();
        } catch (err) { Utils.showToast(err.message, 'error'); }
    };

    // ── Product Modal ────────────────────────────
    const productModal = document.getElementById('productModal');
    const productForm = document.getElementById('productForm');

    document.getElementById('addProductBtn').addEventListener('click', () => {
        document.getElementById('modalTitle').textContent = 'Add New Product';
        document.getElementById('editProductId').value = '';
        productForm.reset();
        document.getElementById('modalStatus').value = 'approved';
        productModal.classList.add('show');
    });

    window.openEditProduct = async function(id) {
        try {
            const item = await FrontyAPI.getProduct(id);
            document.getElementById('modalTitle').textContent = 'Edit Product';
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
            productModal.classList.add('show');
        } catch (err) { Utils.showToast(err.message, 'error'); }
    };

    window.closeProductModal = function() { productModal.classList.remove('show'); };

    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editProductId').value;
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
            location: document.getElementById('modalLocation').value.trim()
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
            productModal.classList.remove('show');
            refreshDashboard();
        } catch (err) { Utils.showToast(err.message, 'error'); }
    });

    // ── Seller Modal ─────────────────────────────
    const sellerModal = document.getElementById('sellerModal');
    const sellerForm = document.getElementById('sellerForm');

    window.openEditSeller = function(id, name, phone, email, location) {
        document.getElementById('editSellerId').value = id;
        document.getElementById('editSellerName').value = name;
        document.getElementById('editSellerPhone').value = phone;
        document.getElementById('editSellerEmail').value = email;
        document.getElementById('editSellerLocation').value = location;
        sellerModal.classList.add('show');
    };

    window.closeSellerModal = function() { sellerModal.classList.remove('show'); };

    sellerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            await FrontyAPI.updateSeller({
                id: parseInt(document.getElementById('editSellerId').value),
                name: document.getElementById('editSellerName').value.trim(),
                phone: document.getElementById('editSellerPhone').value.trim(),
                email: document.getElementById('editSellerEmail').value.trim(),
                location: document.getElementById('editSellerLocation').value.trim()
            });
            Utils.showToast('Seller updated ✅', 'success');
            sellerModal.classList.remove('show');
            renderSellers();
        } catch (err) { Utils.showToast(err.message, 'error'); }
    });

    Utils.initNavbar();
    checkAuth();
});
