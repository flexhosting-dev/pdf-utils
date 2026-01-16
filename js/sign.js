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

    // Signature position
    signaturePosition: { x: 0, y: 0 },
    signatureSize: 150,
    isDragging: false,
    dragOffset: { x: 0, y: 0 },

    // Canvas scale for coordinate conversion
    canvasScale: 1,
    pdfPageWidth: 0,
    pdfPageHeight: 0,

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

        // Page navigation
        document.getElementById('sign-prev-page')?.addEventListener('click', () => {
            this.goToPage(this.currentPage - 1);
        });
        document.getElementById('sign-next-page')?.addEventListener('click', () => {
            this.goToPage(this.currentPage + 1);
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

            // Update UI
            document.getElementById('sign-pdf-name').textContent = file.name;
            document.getElementById('sign-pdf-pages').textContent = `${this.pageCount} pages`;
            document.getElementById('sign-total-pages').textContent = this.pageCount;
            document.getElementById('sign-workspace').style.display = 'block';
            document.getElementById('sign-actions').style.display = 'flex';
            document.getElementById('sign-drop-zone').style.display = 'none';
            document.getElementById('sign-result').style.display = 'none';

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

    async renderPage(pageNum) {
        const canvas = document.getElementById('sign-page-canvas');
        if (!canvas || !this.pdfJsDoc) return;

        const page = await this.pdfJsDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });

        // Calculate scale to fit in container
        const wrapper = document.getElementById('sign-canvas-wrapper');
        const maxWidth = wrapper.clientWidth - 40;
        const maxHeight = 500;

        const scaleX = maxWidth / viewport.width;
        const scaleY = maxHeight / viewport.height;
        this.canvasScale = Math.min(scaleX, scaleY, 1.5);

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

        // Update page indicator
        document.getElementById('sign-current-page').textContent = pageNum;

        // Update nav buttons
        document.getElementById('sign-prev-page').disabled = pageNum <= 1;
        document.getElementById('sign-next-page').disabled = pageNum >= this.pageCount;

        // Reset signature position for footer mode
        const placementMode = document.querySelector('input[name="placement-mode"]:checked').value;
        if (placementMode === 'footer') {
            this.positionSignatureInFooter();
        }
    },

    goToPage(pageNum) {
        if (pageNum < 1 || pageNum > this.pageCount) return;
        this.currentPage = pageNum;
        this.renderPage(pageNum);
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
        const pageSelector = document.getElementById('page-selector-section');

        if (mode === 'single-page') {
            pageSelector.style.display = 'block';
        } else {
            pageSelector.style.display = 'none';
        }

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

            if (placementMode === 'footer') {
                // Apply to all pages at footer
                for (let i = 0; i < pages.length; i++) {
                    Progress.update('sign-progress',
                        Math.round((i / pages.length) * 90),
                        `Signing page ${i + 1}/${pages.length}...`
                    );

                    const page = pages[i];
                    const { width, height } = page.getSize();

                    // Position at bottom center
                    const footerX = (width - sigWidth) / 2;
                    const footerY = 30;

                    page.drawImage(signatureImage, {
                        x: footerX,
                        y: footerY,
                        width: sigWidth,
                        height: sigHeight
                    });
                }
            } else if (placementMode === 'all-pages') {
                // Apply to all pages at same position
                for (let i = 0; i < pages.length; i++) {
                    Progress.update('sign-progress',
                        Math.round((i / pages.length) * 90),
                        `Signing page ${i + 1}/${pages.length}...`
                    );

                    const page = pages[i];
                    page.drawImage(signatureImage, {
                        x: pdfX,
                        y: pdfY,
                        width: sigWidth,
                        height: sigHeight
                    });
                }
            } else {
                // Single page only
                Progress.update('sign-progress', 50, `Signing page ${this.currentPage}...`);

                const page = pages[this.currentPage - 1];
                page.drawImage(signatureImage, {
                    x: pdfX,
                    y: pdfY,
                    width: sigWidth,
                    height: sigHeight
                });
            }

            Progress.update('sign-progress', 95, 'Generating PDF...');

            const pdfBytes = await this.pdfDoc.save();

            // Store result
            const baseName = this.currentFile.name.replace('.pdf', '');
            this.resultFilename = `${baseName}_signed.pdf`;
            this.resultData = pdfBytes;

            // Show result
            document.getElementById('sign-result-filename').textContent = this.resultFilename;
            document.getElementById('sign-result-pages').textContent = this.pageCount;
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

        document.getElementById('sign-workspace').style.display = 'none';
        document.getElementById('sign-actions').style.display = 'none';
        document.getElementById('sign-drop-zone').style.display = 'block';
        document.getElementById('sign-result').style.display = 'none';

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
