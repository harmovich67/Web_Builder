/**
 * Sell Page — Multi-step form with API submission + image upload
 */
document.addEventListener('DOMContentLoaded', () => {
    const steps = document.querySelectorAll('.form-step');
    const stepDots = document.querySelectorAll('.step-dot');
    const stepLines = document.querySelectorAll('.step-line');
    const btnNext = document.getElementById('btnNext');
    const btnPrev = document.getElementById('btnPrev');
    const btnSubmit = document.getElementById('btnSubmit');

    let currentStep = 0;
    let uploadedImages = []; // base64 for preview
    let uploadedFiles = []; // File objects for upload

    function goToStep(step) {
        steps.forEach((s, i) => {
            s.style.display = i === step ? 'block' : 'none';
        });
        stepDots.forEach((dot, i) => {
            dot.classList.remove('active', 'completed');
            if (i < step) dot.classList.add('completed');
            else if (i === step) dot.classList.add('active');
        });
        stepLines.forEach((line, i) => line.classList.toggle('active', i < step));
        btnPrev.style.display = step === 0 ? 'none' : 'inline-flex';
        btnNext.style.display = step < steps.length - 1 ? 'inline-flex' : 'none';
        btnSubmit.style.display = step === steps.length - 1 ? 'inline-flex' : 'none';
        if (step === steps.length - 1) renderPreview();
        currentStep = step;
    }

    function validateStep(step) {
        if (step === 0) {
            const title = document.getElementById('itemTitle').value.trim();
            const price = document.getElementById('itemPrice').value.trim();
            const category = document.getElementById('itemCategory').value;
            const desc = document.getElementById('itemDescription').value.trim();
            const name = document.getElementById('sellerName').value.trim();
            const phone = document.getElementById('sellerPhone').value.trim();
            const loc = document.getElementById('sellerLocation').value.trim();
            if (!title) { Utils.showToast('Please enter a title', 'warning'); return false; }
            if (!price || isNaN(price) || parseFloat(price) <= 0) { Utils.showToast('Please enter a valid price', 'warning'); return false; }
            if (!category) { Utils.showToast('Please select a category', 'warning'); return false; }
            if (!desc) { Utils.showToast('Please enter a description', 'warning'); return false; }
            if (!name) { Utils.showToast('Please enter your name', 'warning'); return false; }
            if (!phone) { Utils.showToast('Please enter your WhatsApp number', 'warning'); return false; }
            if (!loc) { Utils.showToast('Please enter your location', 'warning'); return false; }
        }
        return true;
    }

    btnNext.addEventListener('click', () => {
        if (validateStep(currentStep)) goToStep(currentStep + 1);
    });
    btnPrev.addEventListener('click', () => {
        if (currentStep > 0) goToStep(currentStep - 1);
    });

    // ── Image Upload ─────────────────────────────
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const previewGrid = document.getElementById('imagePreviewGrid');

    if (uploadZone) {
        uploadZone.addEventListener('click', () => fileInput.click());
        uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.classList.add('dragover'); });
        uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
        uploadZone.addEventListener('drop', (e) => { e.preventDefault(); uploadZone.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
    }
    if (fileInput) fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    function handleFiles(files) {
        const remaining = 5 - uploadedImages.length;
        if (remaining <= 0) { Utils.showToast('Maximum 5 images', 'warning'); return; }
        Array.from(files).slice(0, remaining).forEach(file => {
            if (!file.type.startsWith('image/')) { Utils.showToast(`${file.name} is not an image`, 'error'); return; }
            if (file.size > 5 * 1024 * 1024) { Utils.showToast(`${file.name} too large`, 'warning'); return; }
            uploadedFiles.push(file);
            const reader = new FileReader();
            reader.onload = (e) => { uploadedImages.push(e.target.result); renderImagePreviews(); };
            reader.readAsDataURL(file);
        });
    }

    function renderImagePreviews() {
        const countEl = document.getElementById('imageCount');
        if (countEl) countEl.textContent = `${uploadedImages.length}/5 images`;
        if (!previewGrid) return;
        if (uploadedImages.length === 0) { previewGrid.innerHTML = ''; return; }
        previewGrid.innerHTML = uploadedImages.map((img, i) => `
            <div class="image-preview-item fade-in">
                <img src="${img}" alt="Preview ${i + 1}">
                <button type="button" class="remove-btn" data-index="${i}" title="Remove">✕</button>
            </div>
        `).join('');
        previewGrid.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                uploadedImages.splice(idx, 1);
                uploadedFiles.splice(idx, 1);
                renderImagePreviews();
            });
        });
    }

    function renderPreview() {
        const previewCard = document.getElementById('previewCard');
        if (!previewCard) return;
        const title = document.getElementById('itemTitle').value.trim();
        const price = document.getElementById('itemPrice').value.trim();
        const category = document.getElementById('itemCategory').value;
        const condition = document.querySelector('input[name="condition"]:checked')?.value || 'used';
        const description = document.getElementById('itemDescription').value.trim();
        const sellerName = document.getElementById('sellerName').value.trim() || 'Anonymous';
        const sellerPhone = document.getElementById('sellerPhone').value.trim();
        const sellerLocation = document.getElementById('sellerLocation').value.trim();
        const badge = Utils.conditionBadge(condition);
        const hasImage = uploadedImages.length > 0;
        const placeholder = Utils.getPlaceholderImage(category);

        previewCard.innerHTML = `
            <div class="glass-card rounded-2xl overflow-hidden max-w-sm mx-auto">
                <div class="product-img-placeholder bg-gradient-to-br from-slate-800 to-slate-900 relative">
                    ${hasImage ? `<img src="${uploadedImages[0]}" alt="${Utils.escapeHtml(title)}" class="w-full h-52 object-cover">` : `<div class="flex flex-col items-center gap-2 py-10"><span class="text-5xl">${placeholder.icon}</span></div>`}
                    <div class="absolute top-3 right-3"><span class="px-2.5 py-1 rounded-full text-xs font-semibold border ${badge.class}">${badge.text}</span></div>
                </div>
                <div class="p-5">
                    <h3 class="text-lg font-bold text-white mb-2">${Utils.escapeHtml(title)}</h3>
                    <p class="text-slate-400 text-sm mb-3 line-clamp-3">${Utils.escapeHtml(description)}</p>
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-2xl font-extrabold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">${Utils.formatPrice(price)}</span>
                        <span class="text-xs text-slate-500">${Utils.categoryLabel(category)}</span>
                    </div>
                    <div class="pt-3 border-t border-slate-700/50 flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <div class="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-xs text-white font-bold">${sellerName.charAt(0).toUpperCase()}</div>
                            <div><span class="text-xs text-slate-300 font-medium">${Utils.escapeHtml(sellerName)}</span>${sellerLocation ? `<span class="text-[10px] text-slate-500 block">📍 ${Utils.escapeHtml(sellerLocation)}</span>` : ''}</div>
                        </div>
                        ${sellerPhone ? `<span class="text-xs text-emerald-400 font-medium flex items-center gap-1">💬 WhatsApp</span>` : ''}
                    </div>
                </div>
            </div>
            ${uploadedImages.length > 1 ? `<p class="text-center text-sm text-slate-500 mt-3">+ ${uploadedImages.length - 1} more photo${uploadedImages.length > 2 ? 's' : ''}</p>` : ''}
        `;
    }

    // ── Submit ───────────────────────────────────
    btnSubmit.addEventListener('click', async (e) => {
        e.preventDefault();
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<span class="animate-spin">⏳</span> Submitting...';

        try {
            // Upload images first
            const imageUrls = [];
            for (const file of uploadedFiles) {
                try {
                    const result = await FrontyAPI.uploadImage(file);
                    imageUrls.push(result.url);
                } catch (err) {
                    console.warn('Image upload failed:', err);
                }
            }

            // Create product via API
            await FrontyAPI.createProduct({
                title: document.getElementById('itemTitle').value.trim(),
                description: document.getElementById('itemDescription').value.trim(),
                price: document.getElementById('itemPrice').value.trim(),
                category: document.getElementById('itemCategory').value,
                condition: document.querySelector('input[name="condition"]:checked')?.value || 'used',
                images: imageUrls,
                sellerName: document.getElementById('sellerName').value.trim() || 'Anonymous',
                sellerEmail: document.getElementById('sellerEmail').value.trim(),
                sellerPhone: document.getElementById('sellerPhone').value.trim(),
                location: document.getElementById('sellerLocation').value.trim()
            });

            document.getElementById('formContainer').style.display = 'none';
            const successEl = document.getElementById('successScreen');
            successEl.style.display = 'block';
            successEl.classList.add('fade-in');
        } catch (err) {
            Utils.showToast('Failed to submit: ' + err.message, 'error');
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '✓ Submit Listing';
        }
    });

    Utils.initNavbar();
    goToStep(0);
});
