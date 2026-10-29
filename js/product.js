/**
 * Product Detail Page — API-powered
 */
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    const itemId = params.get('id');
    const container = document.getElementById('productDetail');
    const breadcrumbTitle = document.getElementById('breadcrumbTitle');

    if (!itemId) { showNotFound(); return; }

    try {
        const item = await FrontyAPI.getProduct(itemId);
        if (!item || item.status !== 'approved') { showNotFound(); return; }
        document.title = `${item.title} — Fronty`;
        if (breadcrumbTitle) breadcrumbTitle.textContent = item.title;
        renderProduct(item);
    } catch {
        showNotFound();
    }

    function showNotFound() {
        container.innerHTML = `
            <div class="text-center py-24 fade-in" style="opacity: 0;">
                <div class="text-6xl mb-4 opacity-50">🔍</div>
                <h2 class="text-2xl font-bold text-white mb-3">Product Not Found</h2>
                <p class="text-slate-400 mb-8">This product may have been removed or doesn't exist.</p>
                <a href="index.html" class="btn-primary no-underline">← Back to Store</a>
            </div>
        `;
    }

    async function renderProduct(item) {
        const badge = Utils.conditionBadge(item.condition);
        const hasImages = item.images && item.images.length > 0;
        const placeholder = Utils.getPlaceholderImage(item.category);
        const sellerName = item.seller_name || 'Anonymous';
        const sellerPhone = item.seller_phone || '';
        const sellerEmail = item.seller_email || '';

        const whatsappMessage = encodeURIComponent(
            `Hi ${sellerName}! I'm interested in your "${item.title}" listed on Fronty for ${Utils.formatPrice(item.price)}. Is it still available?`
        );
        const whatsappLink = sellerPhone
            ? `https://wa.me/${sellerPhone.replace(/[^0-9]/g, '')}?text=${whatsappMessage}`
            : null;

        // Related items
        let related = [];
        try {
            const all = await FrontyAPI.getProducts({ status: 'approved', category: item.category });
            related = all.filter(i => i.id !== item.id).slice(0, 4);
        } catch {}

        container.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-8 mb-16 fade-in" style="opacity: 0;">
                <div class="lg:col-span-3">
                    <div class="glass-card-static rounded-2xl overflow-hidden">
                        <div id="mainImageContainer" class="relative bg-gradient-to-br from-slate-800 to-slate-900 aspect-[4/3] flex items-center justify-center overflow-hidden">
                            ${hasImages
                                ? `<img id="mainImage" src="${item.images[0]}" alt="${Utils.escapeHtml(item.title)}" class="w-full h-full object-contain">`
                                : `<div class="flex flex-col items-center gap-3"><span class="text-8xl">${placeholder.icon}</span><span class="text-sm text-slate-500 font-medium uppercase tracking-wider">${Utils.categoryLabel(item.category).replace(/^.+?\s/, '')}</span></div>`
                            }
                            <div class="absolute top-4 left-4">
                                <span class="px-3 py-1.5 rounded-full text-xs font-semibold border ${badge.class} backdrop-blur-sm">${badge.text}</span>
                            </div>
                        </div>
                        ${hasImages && item.images.length > 1 ? `
                        <div class="p-4 flex gap-3 overflow-x-auto">
                            ${item.images.map((img, i) => `
                                <button onclick="switchImage('${img}', this)" class="thumbnail-btn shrink-0 w-20 h-20 rounded-xl overflow-hidden border-2 ${i === 0 ? 'border-indigo-500' : 'border-slate-700'} hover:border-indigo-400 transition-all">
                                    <img src="${img}" alt="Photo ${i + 1}" class="w-full h-full object-cover">
                                </button>
                            `).join('')}
                        </div>` : ''}
                    </div>
                </div>
                <div class="lg:col-span-2 space-y-5">
                    <div class="glass-card-static rounded-2xl p-6">
                        <div class="flex items-center gap-2 text-xs text-slate-500 mb-3">
                            <span>${Utils.categoryLabel(item.category)}</span><span>•</span><span>${Utils.timeAgo(item.created_at)}</span>
                        </div>
                        <h1 class="text-2xl sm:text-3xl font-bold text-white mb-4 leading-tight">${Utils.escapeHtml(item.title)}</h1>
                        <span class="text-4xl font-black bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent block mb-4">${Utils.formatPrice(item.price)}</span>
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="px-3 py-1 rounded-full text-xs font-semibold border ${badge.class}">${badge.text}</span>
                            ${item.location ? `<span class="px-3 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">📍 ${Utils.escapeHtml(item.location)}</span>` : ''}
                        </div>
                    </div>
                    <div class="glass-card-static rounded-2xl p-6">
                        <h3 class="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Seller Information</h3>
                        <div class="flex items-center gap-4 mb-5">
                            <div class="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl text-white font-bold shadow-lg shadow-indigo-500/20">
                                ${sellerName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                                <p class="text-lg font-semibold text-white">${Utils.escapeHtml(sellerName)}</p>
                                ${item.location ? `<p class="text-sm text-slate-400">📍 ${Utils.escapeHtml(item.location)}</p>` : ''}
                            </div>
                        </div>
                        <div class="space-y-3">
                            ${whatsappLink ? `
                            <a href="${whatsappLink}" target="_blank" rel="noopener noreferrer"
                                class="whatsapp-btn w-full flex items-center justify-center gap-3 py-3.5 rounded-xl font-semibold text-white no-underline transition-all duration-300 text-base">
                                <svg class="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                Contact via WhatsApp
                            </a>` : ''}
                            ${sellerEmail ? `
                            <a href="mailto:${Utils.escapeHtml(sellerEmail)}?subject=${encodeURIComponent('Interested in: ' + item.title)}" class="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold bg-slate-700/50 hover:bg-slate-700 text-slate-300 no-underline transition-all duration-300 border border-slate-600/50">📧 Send Email</a>` : ''}
                            ${sellerPhone ? `
                            <a href="tel:${Utils.escapeHtml(sellerPhone)}" class="w-full flex items-center justify-center gap-3 py-3 rounded-xl font-semibold bg-slate-700/50 hover:bg-slate-700 text-slate-300 no-underline transition-all duration-300 border border-slate-600/50">📞 Call Seller</a>` : ''}
                        </div>
                    </div>
                    <div class="glass-card-static rounded-2xl p-5">
                        <h4 class="text-sm font-semibold text-amber-400 flex items-center gap-2 mb-3"><span>🛡️</span> Safety Tips</h4>
                        <ul class="space-y-2 text-xs text-slate-400">
                            <li class="flex items-start gap-2"><span class="text-amber-500 mt-0.5">•</span> Meet in a public place for exchanges</li>
                            <li class="flex items-start gap-2"><span class="text-amber-500 mt-0.5">•</span> Inspect the item before paying</li>
                            <li class="flex items-start gap-2"><span class="text-amber-500 mt-0.5">•</span> Don't send money in advance</li>
                        </ul>
                    </div>
                </div>
            </div>
            <div class="glass-card-static rounded-2xl p-6 sm:p-8 mb-8 fade-in stagger-1" style="opacity: 0;">
                <h2 class="text-xl font-bold text-white mb-4 flex items-center gap-2"><span>📝</span> Description</h2>
                <p class="text-slate-300 leading-relaxed whitespace-pre-line">${Utils.escapeHtml(item.description)}</p>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12 fade-in stagger-2" style="opacity: 0;">
                <div class="glass-card-static rounded-xl p-4 text-center"><div class="text-2xl mb-2">${Utils.categoryIcon(item.category)}</div><p class="text-xs text-slate-500 mb-1">Category</p><p class="text-sm font-semibold text-white">${Utils.categoryLabel(item.category).replace(/^.+?\s/, '')}</p></div>
                <div class="glass-card-static rounded-xl p-4 text-center"><div class="text-2xl mb-2">📊</div><p class="text-xs text-slate-500 mb-1">Condition</p><p class="text-sm font-semibold text-white">${badge.text}</p></div>
                <div class="glass-card-static rounded-xl p-4 text-center"><div class="text-2xl mb-2">📅</div><p class="text-xs text-slate-500 mb-1">Listed</p><p class="text-sm font-semibold text-white">${Utils.timeAgo(item.created_at)}</p></div>
                <div class="glass-card-static rounded-xl p-4 text-center"><div class="text-2xl mb-2">📍</div><p class="text-xs text-slate-500 mb-1">Location</p><p class="text-sm font-semibold text-white">${item.location || 'Not specified'}</p></div>
            </div>
            ${related.length > 0 ? `
            <div class="fade-in stagger-3" style="opacity: 0;">
                <h2 class="text-xl font-bold text-white mb-6 flex items-center gap-2"><span>🔗</span> Similar Items</h2>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    ${related.map((rel) => {
                        const relHas = rel.images && rel.images.length > 0;
                        const relP = Utils.getPlaceholderImage(rel.category);
                        return `
                        <a href="product.html?id=${rel.id}" class="glass-card rounded-xl overflow-hidden block no-underline group">
                            <div class="product-img-placeholder bg-gradient-to-br from-slate-800 to-slate-900 relative !min-h-[140px]">
                                ${relHas ? `<img src="${rel.images[0]}" alt="${Utils.escapeHtml(rel.title)}" class="w-full h-36 object-cover">` : `<span class="text-3xl">${relP.icon}</span>`}
                            </div>
                            <div class="p-4">
                                <h4 class="text-sm font-bold text-white mb-1 line-clamp-1 group-hover:text-indigo-300 transition-colors">${Utils.escapeHtml(rel.title)}</h4>
                                <span class="text-lg font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">${Utils.formatPrice(rel.price)}</span>
                            </div>
                        </a>`;
                    }).join('')}
                </div>
            </div>` : ''}
        `;
    }

    window.switchImage = function(src, btn) {
        const mainImg = document.getElementById('mainImage');
        if (mainImg) {
            mainImg.style.opacity = '0';
            setTimeout(() => { mainImg.src = src; mainImg.style.opacity = '1'; }, 200);
        }
        document.querySelectorAll('.thumbnail-btn').forEach(b => {
            b.classList.remove('border-indigo-500');
            b.classList.add('border-slate-700');
        });
        if (btn) {
            btn.classList.remove('border-slate-700');
            btn.classList.add('border-indigo-500');
        }
    };

    // ── Image Lightbox ────────────────────────────
    const lightbox = document.createElement('div');
    lightbox.id = 'lightbox';
    lightbox.className = 'lightbox';
    lightbox.innerHTML = `
        <div class="lightbox-backdrop"></div>
        <button class="lightbox-close" aria-label="Close">✕</button>
        <img class="lightbox-img" src="" alt="Full size image">
    `;
    document.body.appendChild(lightbox);

    const lightboxImg = lightbox.querySelector('.lightbox-img');

    function openLightbox(src) {
        lightboxImg.src = src;
        lightbox.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeLightbox() {
        lightbox.classList.remove('open');
        document.body.style.overflow = '';
    }

    lightbox.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    lightbox.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeLightbox(); });

    // Wire main image click to lightbox after render
    const mainImgContainer = document.getElementById('mainImageContainer');
    if (mainImgContainer) {
        mainImgContainer.addEventListener('click', () => {
            const src = document.getElementById('mainImage')?.src;
            if (src) openLightbox(src);
        });
        mainImgContainer.style.cursor = 'zoom-in';
    }

    Utils.initNavbar();
});
