// PDF Sign Module

const SignModule = {
    currentFile: null,
    pdfDoc: null,
    pdfJsDoc: null,
    pageCount: 0,
    currentPage: 1,
    signatureImage: null,
    signatureDataUrl: null,
    resultData: null,
    resultFilename: null,

    // Page selection
    selectedPages: new Set(),
    pageThumbnails: [],

    // Signature position
    signaturePosition: { x: 0, y: 0 },
    signatureSize: 150,
    isDragging: false,
    dragOffset: { x: 0, y: 0 },

    // Canvas scale for coordinate conversion
    canvasScale: 1,
    pdfPageWidth: 0,
    pdfPageHeight: 0,

    // Drawing canvas
    drawCanvas: null,
    drawCtx: null,
    isDrawing: false,
    penColor: '#000000',
    penSize: 3,

    // LocalStorage key
    STORAGE_KEY: 'pdf-utils-signatures',
    MAX_SIGNATURES: 5,

    init() {
        // Setup drop zone
        setupDropZone('sign-drop-zone', 'sign-file-input', (files) => {
            this.loadPDF(files[0]);
        }, { multiple: false, accept: '.pdf' });

        // Clear button
        document.getElementById('sign-clear')?.addEventListener('click', () => {
            this.clearFile();
        });

        // Sign button
        document.getElementById('sign-btn')?.addEventListener('click', () => {
            this.applySignature();
        });

        // Download button
        document.getElementById('sign-download-btn')?.addEventListener('click', () => {
            this.downloadResult();
        });

        // Signature file input
        document.getElementById('signature-file-input')?.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.loadSignature(e.target.files[0]);
            }
        });

        // Remove signature button
        document.getElementById('remove-signature')?.addEventListener('click', () => {
            this.removeCurrentSignature();
        });

        // Placement mode radio buttons
        document.querySelectorAll('input[name="placement-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                this.onPlacementModeChange(e.target.value);
            });
        });

        // Signature size slider
        const sizeSlider = document.getElementById('signature-size');
        sizeSlider?.addEventListener('input', () => {
            this.signatureSize = parseInt(sizeSlider.value);
            document.getElementById('signature-size-value').textContent = this.signatureSize + 'px';
            this.updateDraggableSize();
        });

        // Setup draggable signature
        this.setupDraggable();

        // Setup drawing canvas
        this.setupDrawingCanvas();

        // Load saved signatures
        this.loadSavedSignatures();
    },

    setupDraggable() {
        const draggable = document.getElementById('signature-draggable');
        const wrapper = document.getElementById('sign-canvas-wrapper');

        if (!draggable || !wrapper) return;

        // Mouse events
        draggable.addEventListener('mousedown', (e) => this.startDrag(e));
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.endDrag());

        // Touch events
        draggable.addEventListener('touchstart', (e) => this.startDrag(e), { passive: false });
        document.addEventListener('touchmove', (e) => this.onDrag(e), { passive: false });
        document.addEventListener('touchend', () => this.endDrag());
    },

    setupDrawingCanvas() {
        // Draw signature button
        document.getElementById('draw-signature-btn')?.addEventListener('click', () => {
            this.openDrawModal();
        });

        // Close modal
        document.getElementById('close-draw-modal')?.addEventListener('click', () => {
            this.closeDrawModal();
        });

        // Click outside to close
        document.getElementById('draw-signature-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'draw-signature-modal') {
                this.closeDrawModal();
            }
        });

        // Clear canvas button
        document.getElementById('clear-draw-canvas')?.addEventListener('click', () => {
            this.clearDrawCanvas();
        });

        // Use signature button
        document.getElementById('use-drawn-signature')?.addEventListener('click', () => {
            this.useDrawnSignature();
        });

        // Color buttons
        document.querySelectorAll('.color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.penColor = btn.dataset.color;
            });
        });

        // Pen size
        document.getElementById('pen-size')?.addEventListener('input', (e) => {
            this.penSize = parseInt(e.target.value);
        });
    },

    openDrawModal() {
        const modal = document.getElementById('draw-signature-modal');
        modal.style.display = 'flex';

        // Initialize canvas
        this.drawCanvas = document.getElementById('draw-signature-canvas');
        this.drawCtx = this.drawCanvas.getContext('2d');

        // Set canvas size
        const container = this.drawCanvas.parentElement;
        this.drawCanvas.width = Math.min(500, container.clientWidth - 20);
        this.drawCanvas.height = 200;

        // White background
        this.drawCtx.fillStyle = '#ffffff';
        this.drawCtx.fillRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);

        // Setup drawing events
        this.drawCanvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.drawCanvas.addEventListener('mousemove', (e) => this.draw(e));
        this.drawCanvas.addEventListener('mouseup', () => this.stopDrawing());
        this.drawCanvas.addEventListener('mouseleave', () => this.stopDrawing());

        this.drawCanvas.addEventListener('touchstart', (e) => this.startDrawing(e), { passive: false });
        this.drawCanvas.addEventListener('touchmove', (e) => this.draw(e), { passive: false });
        this.drawCanvas.addEventListener('touchend', () => this.stopDrawing());
    },

    closeDrawModal() {
        document.getElementById('draw-signature-modal').style.display = 'none';
    },

    startDrawing(e) {
        e.preventDefault();
        this.isDrawing = true;

        const rect = this.drawCanvas.getBoundingClientRect();
        const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

        this.drawCtx.beginPath();
        this.drawCtx.moveTo(x, y);
    },

    draw(e) {
        if (!this.isDrawing) return;
        e.preventDefault();

        const rect = this.drawCanvas.getBoundingClientRect();
        const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
        const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;

        this.drawCtx.lineTo(x, y);
        this.drawCtx.strokeStyle = this.penColor;
        this.drawCtx.lineWidth = this.penSize;
        this.drawCtx.lineCap = 'round';
        this.drawCtx.lineJoin = 'round';
        this.drawCtx.stroke();
    },

    stopDrawing() {
        this.isDrawing = false;
    },

    clearDrawCanvas() {
        if (this.drawCtx) {
            this.drawCtx.fillStyle = '#ffffff';
            this.drawCtx.fillRect(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        }
    },

    useDrawnSignature() {
        if (!this.drawCanvas) return;

        // Check if canvas has any drawing (not just white)
        const imageData = this.drawCtx.getImageData(0, 0, this.drawCanvas.width, this.drawCanvas.height);
        const data = imageData.data;
        let hasDrawing = false;

        for (let i = 0; i < data.length; i += 4) {
            if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) {
                hasDrawing = true;
                break;
            }
        }

        if (!hasDrawing) {
            Toast.warning('Please draw a signature first');
            return;
        }

        // Get data URL with transparency
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.drawCanvas.width;
        tempCanvas.height = this.drawCanvas.height;
        const tempCtx = tempCanvas.getContext('2d');

        // Copy and make white transparent
        tempCtx.drawImage(this.drawCanvas, 0, 0);
        const tempData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
        const pixels = tempData.data;

        for (let i = 0; i < pixels.length; i += 4) {
            if (pixels[i] > 250 && pixels[i + 1] > 250 && pixels[i + 2] > 250) {
                pixels[i + 3] = 0; // Make white transparent
            }
        }

        tempCtx.putImageData(tempData, 0, 0);

        const dataUrl = tempCanvas.toDataURL('image/png');
        this.setSignature(dataUrl);
        this.saveSignatureToStorage(dataUrl);

        this.closeDrawModal();
        Toast.success('Signature created');
    },

    startDrag(e) {
        if (!this.signatureDataUrl) return;

        e.preventDefault();
        this.isDragging = true;

        const draggable = document.getElementById('signature-draggable');
        const rect = draggable.getBoundingClientRect();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        this.dragOffset = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };

        draggable.style.cursor = 'grabbing';
    },

    onDrag(e) {
        if (!this.isDragging) return;

        e.preventDefault();

        const wrapper = document.getElementById('sign-canvas-wrapper');
        const draggable = document.getElementById('signature-draggable');
        const wrapperRect = wrapper.getBoundingClientRect();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        let x = clientX - wrapperRect.left - this.dragOffset.x;
        let y = clientY - wrapperRect.top - this.dragOffset.y;

        // Constrain within wrapper
        const maxX = wrapperRect.width - draggable.offsetWidth;
        const maxY = wrapperRect.height - draggable.offsetHeight;

        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));

        draggable.style.left = x + 'px';
        draggable.style.top = y + 'px';

        // Store position relative to canvas
        this.signaturePosition = { x, y };
    },

    endDrag() {
        if (!this.isDragging) return;

        this.isDragging = false;
        const draggable = document.getElementById('signature-draggable');
        draggable.style.cursor = 'grab';
    },

    async loadPDF(file) {
        if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
            Toast.warning('Please select a PDF file');
            return;
        }

        try {
            Progress.show('sign-progress', 'Loading PDF...');

            this.currentFile = file;
            const arrayBuffer = await Utils.readFileAsArrayBuffer(file);

            // Create copies of ArrayBuffer for each library (prevents detachment issues)
            const pdfJsBuffer = arrayBuffer.slice(0);
            const pdfLibBuffer = arrayBuffer.slice(0);

            // Load with PDF.js for rendering
            this.pdfJsDoc = await pdfjsLib.getDocument({ data: pdfJsBuffer }).promise;
            this.pageCount = this.pdfJsDoc.numPages;

            // Load with pdf-lib for manipulation
            const { PDFDocument } = PDFLib;
            this.pdfDoc = await PDFDocument.load(pdfLibBuffer);

            // Initialize selected pages (all selected by default)
            this.selectedPages = new Set();
            for (let i = 1; i <= this.pageCount; i++) {
                this.selectedPages.add(i);
            }

            // Update UI
            document.getElementById('sign-pdf-name').textContent = file.name;
            document.getElementById('sign-pdf-pages').textContent = `${this.pageCount} pages`;
            document.getElementById('sign-workspace').style.display = 'block';
            document.getElementById('sign-actions').style.display = 'flex';
            document.getElementById('sign-drop-zone').style.display = 'none';
            document.getElementById('sign-result').style.display = 'none';

            // Generate thumbnails
            await this.generateThumbnails();

            // Render first page
            this.currentPage = 1;
            await this.renderPage(1);

            Progress.hide('sign-progress');
            Toast.success('PDF loaded - add a signature to continue');

        } catch (error) {
            console.error('Error loading PDF:', error);
            Toast.error('Failed to load PDF: ' + error.message);
            Progress.hide('sign-progress');
        }
    },

    async generateThumbnails() {
        const container = document.getElementById('sign-page-thumbnails');
        if (!container) return;

        container.innerHTML = '<div class="loading-thumbnails">Generating previews...</div>';
        this.pageThumbnails = [];

        const thumbnailsHtml = [];

        for (let i = 1; i <= this.pageCount; i++) {
            try {
                const canvas = await Utils.createThumbnail(this.pdfJsDoc, i, 120);
                const dataUrl = canvas.toDataURL();

                thumbnailsHtml.push(`
                    <div class="sign-thumb-item ${i === 1 ? 'active' : ''}" data-page="${i}">
                        <div class="sign-thumb-checkbox">
                            <input type="checkbox" id="sign-page-${i}" checked data-page="${i}">
                            <label for="sign-page-${i}"></label>
                        </div>
                        <img src="${dataUrl}" alt="Page ${i}">
                        <span class="sign-thumb-number">${i}</span>
                    </div>
                `);

                this.pageThumbnails.push({ page: i, dataUrl });
            } catch (error) {
                console.error(`Error generating thumbnail for page ${i}:`, error);
            }
        }

        container.innerHTML = thumbnailsHtml.join('');

        // Add click handlers
        container.querySelectorAll('.sign-thumb-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox' && !e.target.closest('.sign-thumb-checkbox')) {
                    const page = parseInt(item.dataset.page);
                    this.selectPage(page);
                }
            });
        });

        // Add checkbox handlers
        container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                const page = parseInt(checkbox.dataset.page);
                if (checkbox.checked) {
                    this.selectedPages.add(page);
                } else {
                    this.selectedPages.delete(page);
                }
                this.updateSelectedCount();
            });
        });
    },

    selectPage(pageNum) {
        // Update active state
        document.querySelectorAll('.sign-thumb-item').forEach(item => {
            item.classList.toggle('active', parseInt(item.dataset.page) === pageNum);
        });

        this.currentPage = pageNum;
        this.renderPage(pageNum);
    },

    updateSelectedCount() {
        const count = this.selectedPages.size;
        const pagesEl = document.getElementById('sign-pdf-pages');
        if (pagesEl) {
            pagesEl.textContent = `${count}/${this.pageCount} pages selected`;
        }
    },

    async renderPage(pageNum) {
        const canvas = document.getElementById('sign-page-canvas');
        if (!canvas || !this.pdfJsDoc) return;

        const page = await this.pdfJsDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });

        // Calculate scale using fixed max dimensions (not wrapper size which shrinks)
        const maxWidth = 700;
        const maxHeight = 600;

        const scaleX = maxWidth / viewport.width;
        const scaleY = maxHeight / viewport.height;
        this.canvasScale = Math.min(scaleX, scaleY, 2.0);

        const scaledViewport = page.getViewport({ scale: this.canvasScale });

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        this.pdfPageWidth = viewport.width;
        this.pdfPageHeight = viewport.height;

        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({
            canvasContext: ctx,
            viewport: scaledViewport
        }).promise;

        // Reset signature position for footer mode
        const placementMode = document.querySelector('input[name="placement-mode"]:checked').value;
        if (placementMode === 'footer') {
            this.positionSignatureInFooter();
        }
    },

    async loadSignature(file) {
        if (!file.type.startsWith('image/')) {
            Toast.warning('Please select an image file');
            return;
        }

        try {
            const dataUrl = await Utils.readFileAsDataURL(file);
            this.setSignature(dataUrl);

            // Save to local storage
            this.saveSignatureToStorage(dataUrl);

            Toast.success('Signature loaded');
        } catch (error) {
            console.error('Error loading signature:', error);
            Toast.error('Failed to load signature image');
        }
    },

    setSignature(dataUrl) {
        this.signatureDataUrl = dataUrl;

        // Show current signature preview
        const preview = document.getElementById('signature-preview');
        const container = document.getElementById('current-signature');
        preview.src = dataUrl;
        container.style.display = 'block';

        // Show draggable signature
        const draggable = document.getElementById('signature-draggable');
        const draggableImg = document.getElementById('draggable-signature');
        draggableImg.src = dataUrl;
        draggable.style.display = 'block';

        // Update draggable size
        this.updateDraggableSize();

        // Position based on mode
        const placementMode = document.querySelector('input[name="placement-mode"]:checked').value;
        if (placementMode === 'footer') {
            this.positionSignatureInFooter();
        } else {
            // Center the signature
            this.centerSignature();
        }

        // Enable sign button
        document.getElementById('sign-btn').disabled = false;

        // Hide hint
        document.getElementById('canvas-hint').style.display = 'none';
    },

    updateDraggableSize() {
        const draggable = document.getElementById('signature-draggable');
        const img = document.getElementById('draggable-signature');

        if (!draggable || !img) return;

        draggable.style.width = this.signatureSize + 'px';
        img.style.width = '100%';
        img.style.height = 'auto';
    },

    positionSignatureInFooter() {
        const canvas = document.getElementById('sign-page-canvas');
        const draggable = document.getElementById('signature-draggable');

        if (!canvas || !draggable) return;

        // Position at bottom center
        const x = (canvas.width - this.signatureSize) / 2;
        const y = canvas.height - this.signatureSize - 20;

        draggable.style.left = x + 'px';
        draggable.style.top = y + 'px';

        this.signaturePosition = { x, y };
    },

    centerSignature() {
        const canvas = document.getElementById('sign-page-canvas');
        const draggable = document.getElementById('signature-draggable');

        if (!canvas || !draggable) return;

        const x = (canvas.width - this.signatureSize) / 2;
        const y = (canvas.height - this.signatureSize) / 2;

        draggable.style.left = x + 'px';
        draggable.style.top = y + 'px';

        this.signaturePosition = { x, y };
    },

    removeCurrentSignature() {
        this.signatureDataUrl = null;
        this.signatureImage = null;

        document.getElementById('current-signature').style.display = 'none';
        document.getElementById('signature-draggable').style.display = 'none';
        document.getElementById('sign-btn').disabled = true;
        document.getElementById('canvas-hint').style.display = 'block';
    },

    onPlacementModeChange(mode) {
        if (mode === 'footer' && this.signatureDataUrl) {
            this.positionSignatureInFooter();
        }
    },

    // LocalStorage functions
    loadSavedSignatures() {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            const signatures = saved ? JSON.parse(saved) : [];
            this.renderSavedSignatures(signatures);
        } catch (error) {
            console.error('Error loading saved signatures:', error);
        }
    },

    saveSignatureToStorage(dataUrl) {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            let signatures = saved ? JSON.parse(saved) : [];

            // Check if signature already exists
            if (signatures.includes(dataUrl)) {
                // Move to front
                signatures = signatures.filter(s => s !== dataUrl);
            }

            // Add to front
            signatures.unshift(dataUrl);

            // Keep only MAX_SIGNATURES
            if (signatures.length > this.MAX_SIGNATURES) {
                signatures = signatures.slice(0, this.MAX_SIGNATURES);
            }

            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(signatures));
            this.renderSavedSignatures(signatures);
        } catch (error) {
            console.error('Error saving signature:', error);
        }
    },

    removeSignatureFromStorage(dataUrl) {
        try {
            const saved = localStorage.getItem(this.STORAGE_KEY);
            let signatures = saved ? JSON.parse(saved) : [];

            signatures = signatures.filter(s => s !== dataUrl);

            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(signatures));
            this.renderSavedSignatures(signatures);

            Toast.success('Signature removed from saved');
        } catch (error) {
            console.error('Error removing signature:', error);
        }
    },

    renderSavedSignatures(signatures) {
        const container = document.getElementById('saved-signatures');
        if (!container) return;

        if (signatures.length === 0) {
            container.innerHTML = '<p class="no-signatures">No saved signatures yet</p>';
            return;
        }

        container.innerHTML = signatures.map((sig, index) => `
            <div class="saved-signature-item" data-index="${index}">
                <img src="${sig}" alt="Saved signature ${index + 1}" class="saved-sig-img">
                <button class="saved-sig-remove" title="Remove" data-sig="${index}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
        `).join('');

        // Add click handlers
        container.querySelectorAll('.saved-sig-img').forEach((img, index) => {
            img.addEventListener('click', () => {
                this.setSignature(signatures[index]);
                Toast.success('Signature selected');
            });
        });

        container.querySelectorAll('.saved-sig-remove').forEach((btn, index) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeSignatureFromStorage(signatures[index]);
            });
        });
    },

    async applySignature() {
        if (!this.pdfDoc || !this.signatureDataUrl) {
            Toast.warning('Please load a PDF and add a signature');
            return;
        }

        if (this.selectedPages.size === 0) {
            Toast.warning('Please select at least one page');
            return;
        }

        try {
            document.getElementById('sign-btn').disabled = true;
            Progress.show('sign-progress', 'Applying signature...');

            const { PDFDocument } = PDFLib;

            // Get signature image bytes
            const signatureBytes = this.dataUrlToBytes(this.signatureDataUrl);

            // Embed image
            let signatureImage;
            if (this.signatureDataUrl.includes('image/png')) {
                signatureImage = await this.pdfDoc.embedPng(signatureBytes);
            } else {
                signatureImage = await this.pdfDoc.embedJpg(signatureBytes);
            }

            const pages = this.pdfDoc.getPages();
            const placementMode = document.querySelector('input[name="placement-mode"]:checked').value;

            // Calculate signature dimensions maintaining aspect ratio
            const aspectRatio = signatureImage.width / signatureImage.height;
            const sigWidth = this.signatureSize / this.canvasScale;
            const sigHeight = sigWidth / aspectRatio;

            // Convert canvas position to PDF coordinates
            const canvas = document.getElementById('sign-page-canvas');
            const pdfX = this.signaturePosition.x / this.canvasScale;
            // PDF Y is from bottom, canvas Y is from top
            const pdfY = (canvas.height - this.signaturePosition.y - (this.signatureSize * (1/aspectRatio))) / this.canvasScale;

            const pagesToSign = placementMode === 'single-page'
                ? [this.currentPage]
                : Array.from(this.selectedPages);

            let processed = 0;
            for (const pageNum of pagesToSign) {
                Progress.update('sign-progress',
                    Math.round((processed / pagesToSign.length) * 90),
                    `Signing page ${pageNum}...`
                );

                const page = pages[pageNum - 1];
                const { width, height } = page.getSize();

                if (placementMode === 'footer') {
                    // Position at bottom center
                    const footerX = (width - sigWidth) / 2;
                    const footerY = 30;

                    page.drawImage(signatureImage, {
                        x: footerX,
                        y: footerY,
                        width: sigWidth,
                        height: sigHeight
                    });
                } else {
                    page.drawImage(signatureImage, {
                        x: pdfX,
                        y: pdfY,
                        width: sigWidth,
                        height: sigHeight
                    });
                }

                processed++;
            }

            Progress.update('sign-progress', 95, 'Generating PDF...');

            const pdfBytes = await this.pdfDoc.save();

            // Store result
            const baseName = this.currentFile.name.replace('.pdf', '');
            this.resultFilename = `${baseName}_signed.pdf`;
            this.resultData = pdfBytes;

            // Show result
            document.getElementById('sign-result-filename').textContent = this.resultFilename;
            document.getElementById('sign-result-pages').textContent = pagesToSign.length;
            document.getElementById('sign-result-size').textContent = Utils.formatSize(pdfBytes.length);
            document.getElementById('sign-result').style.display = 'block';

            Progress.hide('sign-progress');
            Toast.success('Signature applied - ready to download');

        } catch (error) {
            console.error('Signature error:', error);
            Toast.error('Failed to apply signature: ' + error.message);
            Progress.hide('sign-progress');
        } finally {
            document.getElementById('sign-btn').disabled = false;
        }
    },

    dataUrlToBytes(dataUrl) {
        const base64 = dataUrl.split(',')[1];
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    },

    clearFile() {
        this.currentFile = null;
        this.pdfDoc = null;
        this.pdfJsDoc = null;
        this.pageCount = 0;
        this.currentPage = 1;
        this.resultData = null;
        this.resultFilename = null;
        this.selectedPages = new Set();
        this.pageThumbnails = [];

        document.getElementById('sign-workspace').style.display = 'none';
        document.getElementById('sign-actions').style.display = 'none';
        document.getElementById('sign-drop-zone').style.display = 'block';
        document.getElementById('sign-result').style.display = 'none';

        // Clear thumbnails
        const thumbContainer = document.getElementById('sign-page-thumbnails');
        if (thumbContainer) {
            thumbContainer.innerHTML = '';
        }

        // Clear canvas
        const canvas = document.getElementById('sign-page-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    },

    downloadResult() {
        if (this.resultData && this.resultFilename) {
            Utils.downloadFile(this.resultData, this.resultFilename);
            Toast.success('Download started');
        }
    }
};
