/**
 * FrontyStore — API Client
 * Communicates with PHP backend via AJAX (fetch)
 */
const API_BASE = 'api/index.php';

const FrontyAPI = {
    async request(action, options = {}) {
        const { method = 'GET', body = null, params = {} } = options;

        let url = `${API_BASE}?action=${action}`;
        for (const [key, val] of Object.entries(params)) {
            if (val !== null && val !== undefined) {
                url += `&${key}=${encodeURIComponent(val)}`;
            }
        }

        const fetchOptions = {
            method,
            headers: {}
        };

        if (body) {
            if (body instanceof FormData) {
                fetchOptions.body = body;
            } else {
                fetchOptions.headers['Content-Type'] = 'application/json';
                fetchOptions.body = JSON.stringify(body);
            }
        }

        try {
            const res = await fetch(url, fetchOptions);
            const json = await res.json();
            if (!json.success) {
                throw new Error(json.error || 'API Error');
            }
            return json.data;
        } catch (err) {
            console.error(`API Error [${action}]:`, err);
            throw err;
        }
    },

    // ── Products ─────────────────────────────────
    async getProducts(filter = {}) {
        return this.request('products.list', {
            params: {
                status: filter.status || null,
                category: filter.category || null,
                search: filter.search || null
            }
        });
    },

    async getProduct(id) {
        return this.request('products.get', { params: { id } });
    },

    async createProduct(data) {
        return this.request('products.create', { method: 'POST', body: data });
    },

    async updateProduct(data) {
        return this.request('products.update', { method: 'POST', body: data });
    },

    async updateStatus(id, status) {
        return this.request('products.status', { method: 'POST', body: { id, status } });
    },

    async deleteProduct(id) {
        return this.request('products.delete', { method: 'POST', body: { id } });
    },

    async getStats() {
        return this.request('products.stats');
    },

    // ── Sellers ──────────────────────────────────
    async getSellers() {
        return this.request('sellers.list');
    },

    async getSeller(id) {
        return this.request('sellers.get', { params: { id } });
    },

    async updateSeller(data) {
        return this.request('sellers.update', { method: 'POST', body: data });
    },

    async deleteSeller(id) {
        return this.request('sellers.delete', { method: 'POST', body: { id } });
    },

    // ── Auth ─────────────────────────────────────
    async login(password) {
        return this.request('auth.login', { method: 'POST', body: { password } });
    },

    // ── Image Upload ─────────────────────────────
    async uploadImage(file) {
        const formData = new FormData();
        formData.append('image', file);
        return this.request('upload', { method: 'POST', body: formData });
    }
};

// ── Shared Utilities ─────────────────────────────────────
const Utils = {
    conditionBadge(condition) {
        const map = {
            'new': { text: 'New', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
            'like-new': { text: 'Like New', class: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
            'used': { text: 'Used', class: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
        };
        return map[condition] || map['used'];
    },

    statusBadge(status) {
        const map = {
            'pending': { text: 'Pending', class: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: '⏳' },
            'approved': { text: 'Approved', class: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', icon: '✅' },
            'rejected': { text: 'Rejected', class: 'bg-red-500/20 text-red-400 border-red-500/30', icon: '❌' },
        };
        return map[status] || map['pending'];
    },

    categoryLabel(cat) {
        const map = {
            'phones': '📱 Phones',
            'laptops': '💻 Laptops & Tablets',
            'accessories': '🎧 Accessories',
            'gaming': '🎮 Gaming',
            'other': '📦 Other',
        };
        return map[cat] || cat;
    },

    categoryIcon(cat) {
        const map = {
            'phones': '📱',
            'laptops': '💻',
            'accessories': '🎧',
            'gaming': '🎮',
            'other': '📦',
        };
        return map[cat] || '📦';
    },

    formatPrice(price) {
        return '$' + parseFloat(price).toFixed(2);
    },

    timeAgo(timestamp) {
        const date = typeof timestamp === 'string' ? new Date(timestamp + 'Z') : new Date(timestamp);
        const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
        if (seconds < 60) return 'Just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return minutes + 'm ago';
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + 'h ago';
        const days = Math.floor(hours / 24);
        if (days < 30) return days + 'd ago';
        return date.toLocaleDateString();
    },

    getPlaceholderImage(category) {
        const icons = {
            'phones': '📱',
            'laptops': '💻',
            'accessories': '🎧',
            'gaming': '🎮',
            'other': '📦',
        };
        return { icon: icons[category] || '📦' };
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    showToast(message, type = 'success') {
        const toast = document.createElement('div');
        const colors = {
            success: 'from-emerald-500 to-emerald-600',
            error: 'from-red-500 to-red-600',
            info: 'from-blue-500 to-blue-600',
            warning: 'from-amber-500 to-amber-600',
        };
        toast.className = `fixed bottom-6 right-6 z-[9999] px-6 py-3 rounded-xl bg-gradient-to-r ${colors[type] || colors.info} text-white font-medium shadow-2xl transform translate-y-20 opacity-0 transition-all duration-500 flex items-center gap-3`;
        const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
        toast.innerHTML = `<span class="text-lg">${icons[type] || icons.info}</span><span>${Utils.escapeHtml(message)}</span>`;
        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-20', 'opacity-0');
        });
        setTimeout(() => {
            toast.classList.add('translate-y-20', 'opacity-0');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    },

    // ── Shared Navbar Initialization ──────────────
    // Call once per page — handles scroll effect + mobile menu toggle.
    initNavbar() {
        const navbar = document.querySelector('.navbar');
        if (navbar) {
            window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 50));
        }

        const mobileToggle = document.getElementById('mobileMenuToggle');
        const mobileMenu = document.getElementById('mobileMenu');
        if (mobileToggle && mobileMenu) {
            const openIcon = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>';
            const closeIcon = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>';
            mobileToggle.addEventListener('click', () => {
                mobileMenu.classList.toggle('open');
                mobileToggle.innerHTML = mobileMenu.classList.contains('open') ? openIcon : closeIcon;
            });
        }
    }
};
