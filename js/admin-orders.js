/**
 * Fronty Admin — Mobile Orders Manager
 * Handles orders placed via the Fronty mobile app
 */

const AdminOrders = (() => {

    const STATUS_CONFIG = {
        pending:   { label: 'Pending',   color: '#f59e0b', bg: '#fef3c7' },
        confirmed: { label: 'Confirmed', color: '#3b82f6', bg: '#dbeafe' },
        shipped:   { label: 'Shipped',   color: '#8b5cf6', bg: '#ede9fe' },
        delivered: { label: 'Delivered', color: '#10b981', bg: '#d1fae5' },
        cancelled: { label: 'Cancelled', color: '#ef4444', bg: '#fee2e2' },
    };

    const NEXT_STATUS = {
        pending:   'confirmed',
        confirmed: 'shipped',
        shipped:   'delivered',
    };

    let orders = [];

    async function load() {
        const filter = document.getElementById('ordersStatusFilter')?.value ?? '';
        const url    = `api/index.php?action=admin.orders.list${filter ? '&status=' + filter : ''}`;

        show('ordersLoading');
        hide('ordersTable');
        hide('ordersEmpty');

        try {
            const res  = await fetch(url);
            const json = await res.json();
            orders = json.data ?? [];
            render(orders);
        } catch (e) {
            console.error('Failed to load orders', e);
        }

        hide('ordersLoading');

        // Update sidebar badge with pending count
        const pending = orders.filter(o => o.status === 'pending').length;
        const badge   = document.getElementById('navBadgeOrders');
        if (badge) badge.textContent = pending > 0 ? pending : '';
    }

    function render(list) {
        const tbody = document.getElementById('ordersBody');
        if (!tbody) return;

        if (!list.length) {
            show('ordersEmpty');
            return;
        }

        show('ordersTable');
        tbody.innerHTML = list.map(o => {
            const cfg     = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pending;
            const date    = new Date(o.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
            const price   = `$${parseFloat(o.product_price).toFixed(0)}`;
            const next    = NEXT_STATUS[o.status];
            const nextCfg = next ? STATUS_CONFIG[next] : null;

            return `
            <tr>
                <td style="font-weight:700;color:var(--text-muted)">#${o.id}</td>
                <td>
                    <div style="font-weight:700">${esc(o.customer_name)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted)">${esc(o.customer_email)}</div>
                    ${o.customer_phone ? `<div style="font-size:0.75rem;color:var(--text-muted)">${esc(o.customer_phone)}</div>` : ''}
                </td>
                <td>
                    <div style="font-weight:600">${esc(o.product_title)}</div>
                    <div style="font-size:0.75rem;color:var(--text-muted);text-transform:capitalize">${esc(o.product_category)}</div>
                </td>
                <td style="font-weight:800;color:var(--primary)">${price}</td>
                <td style="font-size:0.8rem;max-width:160px;word-break:break-word">${esc(o.shipping_address)}</td>
                <td style="font-size:0.8rem;color:var(--text-muted);white-space:nowrap">${date}</td>
                <td>
                    <span style="display:inline-block;padding:4px 10px;border-radius:20px;font-size:0.75rem;font-weight:700;background:${cfg.bg};color:${cfg.color}">
                        ${cfg.label}
                    </span>
                </td>
                <td>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                        ${nextCfg ? `<button class="btn-sm-pro btn-primary-pro" onclick="AdminOrders.setStatus(${o.id},'${next}')" title="Mark as ${nextCfg.label}">→ ${nextCfg.label}</button>` : ''}
                        ${o.status !== 'cancelled' && o.status !== 'delivered'
                            ? `<button class="btn-sm-pro btn-danger-pro" onclick="AdminOrders.setStatus(${o.id},'cancelled')">Cancel</button>`
                            : ''}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    async function setStatus(id, status) {
        try {
            const res  = await fetch('api/index.php?action=admin.orders.status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, status }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error);
            await load();
        } catch (e) {
            alert('Error: ' + e.message);
        }
    }

    function show(id) { const el = document.getElementById(id); if (el) el.style.display = ''; }
    function hide(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
    function esc(s)   { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    // Auto-load when orders page becomes active
    document.addEventListener('DOMContentLoaded', () => {
        document.querySelectorAll('.sidebar-nav-item[data-page]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.page === 'orders') load();
            });
        });
    });

    return { load, setStatus };

})();
