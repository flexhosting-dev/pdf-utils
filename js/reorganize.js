// PDF Reorganize Module

const ReorganizeModule = {
    currentFile: null,
    pdfDoc: null,
    pdfLibDoc: null,
    pageCount: 0,
    pages: [], // Array of { originalIndex, canvas }
    resultData: null,
    resultFilename: null,

    init() {
        // Setup drop zone
        setupDropZone('reorganize-drop-zone', 'reorganize-file-input', (files) => {
            this.loadPDF(files[0]);
        }, { multiple: false, accept: '.pdf' });

        // Clear button
        document.getElementById('reorganize-clear')?.addEventListener('click', () => {
            this.clearFile();
        });

        // Reset button
        document.getElementById('reorganize-reset')?.addEventListener('click', () => {
            this.resetOrder();
        });

        // Save button
        document.getElementById('reorganize-btn')?.addEventListener('click', () => {
            this.savePDF();
        });

        // Preview button
        document.getElementById('reorganize-preview-btn')?.addEventListener('click', () => {
            if (this.currentFile) {
                PdfPreview.open(this.currentFile);
            }
        });

        // Download button
        document.getElementById('reorganize-download-btn')?.addEventListener('click', () => {
            this.downloadResult();
        });
    },

    async loadPDF(file) {
        if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
            Toast.warning('Please select a PDF file');
            return;
        }

        try {
            Progress.show('reorganize-progress', 'Loading PDF...');

            this.currentFile = file;
            const arrayBuffer = await Utils.readFileAsArrayBuffer(file);

            // Create copies of the buffer
            const bufferForPdfJs = arrayBuffer.slice(0);
            const bufferForPdfLib = arrayBuffer.slice(0);

            // Load with PDF.js for rendering
            this.pdfDoc = await pdfjsLib.getDocument({ data: bufferForPdfJs }).promise;
            this.pageCount = this.pdfDoc.numPages;

            // Load with pdf-lib for manipulation
            this.pdfLibDoc = await PDFLib.PDFDocument.load(bufferForPdfLib, { ignoreEncryption: true });

            // Update UI
            document.getElementById('reorganize-pdf-name').textContent = file.name;
            document.getElementById('reorganize-pdf-pages').textContent = `${this.pageCount} pages`;
            document.getElementById('reorganize-workspace').style.display = 'block';
            document.getElementById('reorganize-actions').style.display = 'flex';
            document.getElementById('reorganize-drop-zone').style.display = 'none';
            document.getElementById('reorganize-result').style.display = 'none';

            // Generate page thumbnails
            await this.generatePageThumbnails();

            Progress.hide('reorganize-progress');
            Toast.success('PDF loaded - drag pages to reorder');

        } catch (error) {
            console.error('Error loading PDF:', error);
            Toast.error('Failed to load PDF: ' + error.message);
            Progress.hide('reorganize-progress');
            this.clearFile();
        }
    },

    async generatePageThumbnails() {
        const container = document.getElementById('reorganize-pages');
        container.innerHTML = '';
        this.pages = [];

        for (let i = 1; i <= this.pageCount; i++) {
            Progress.update('reorganize-progress',
                Math.round((i / this.pageCount) * 100),
                `Loading page ${i}/${this.pageCount}...`
            );

            try {
                const page = await this.pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale: 1 });
                const scale = 150 / viewport.width;
                const scaledViewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                canvas.width = scaledViewport.width;
                canvas.height = scaledViewport.height;

                const context = canvas.getContext('2d');
                await page.render({
                    canvasContext: context,
                    viewport: scaledViewport
                }).promise;

                this.pages.push({
                    originalIndex: i - 1,
                    pageNumber: i
                });

                // Create page element
                const pageEl = this.createPageElement(i, canvas);
                container.appendChild(pageEl);

            } catch (error) {
                console.error(`Error loading page ${i}:`, error);
            }
        }

        // Setup drag and drop
        this.setupDragAndDrop();
    },

    createPageElement(pageNum, canvas) {
        const pageEl = document.createElement('div');
        pageEl.className = 'reorganize-page';
        pageEl.dataset.page = pageNum;
        pageEl.dataset.originalIndex = pageNum - 1;
        pageEl.draggable = true;

        pageEl.appendChild(canvas);

        // Page number badge (new position)
        const badge = document.createElement('div');
        badge.className = 'reorganize-page-badge';
        badge.textContent = pageNum;
        pageEl.appendChild(badge);

        // Original page number at bottom
        const pageNumber = document.createElement('div');
        pageNumber.className = 'reorganize-page-number';
        pageNumber.textContent = `Page ${pageNum}`;
        pageEl.appendChild(pageNumber);

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'reorganize-page-delete';
        deleteBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
        `;
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.deletePage(pageEl);
        });
        pageEl.appendChild(deleteBtn);

        return pageEl;
    },

    setupDragAndDrop() {
        const container = document.getElementById('reorganize-pages');
        let draggedEl = null;

        container.addEventListener('dragstart', (e) => {
            if (e.target.classList.contains('reorganize-page')) {
                draggedEl = e.target;
                e.target.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            }
        });

        container.addEventListener('dragend', (e) => {
            if (e.target.classList.contains('reorganize-page')) {
                e.target.classList.remove('dragging');
                draggedEl = null;
                // Remove all drag-over classes
                container.querySelectorAll('.drag-over').forEach(el => {
                    el.classList.remove('drag-over');
                });
                // Update page order
                this.updatePageOrder();
            }
        });

        container.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (!draggedEl) return;

            const afterElement = this.getDragAfterElement(container, e.clientX, e.clientY);
            if (afterElement) {
                container.insertBefore(draggedEl, afterElement);
            } else {
                container.appendChild(draggedEl);
            }
        });

        container.addEventListener('dragenter', (e) => {
            if (e.target.classList.contains('reorganize-page') && e.target !== draggedEl) {
                e.target.classList.add('drag-over');
            }
        });

        container.addEventListener('dragleave', (e) => {
            if (e.target.classList.contains('reorganize-page')) {
                e.target.classList.remove('drag-over');
            }
        });
    },

    getDragAfterElement(container, x, y) {
        const draggableElements = [...container.querySelectorAll('.reorganize-page:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offsetX = x - box.left - box.width / 2;
            const offsetY = y - box.top - box.height / 2;
            const offset = Math.sqrt(offsetX * offsetX + offsetY * offsetY);

            if (offset < closest.offset) {
                return { offset, element: child };
            }
            return closest;
        }, { offset: Number.POSITIVE_INFINITY }).element;
    },

    updatePageOrder() {
        const container = document.getElementById('reorganize-pages');
        const pageElements = container.querySelectorAll('.reorganize-page');

        this.pages = [];
        pageElements.forEach((el, index) => {
            const originalIndex = parseInt(el.dataset.originalIndex);
            const pageNumber = parseInt(el.dataset.page);
            this.pages.push({ originalIndex, pageNumber });

            // Update badge to show new position
            const badge = el.querySelector('.reorganize-page-badge');
            if (badge) {
                badge.textContent = index + 1;
            }
        });

        this.updatePageCount();
    },

    deletePage(pageEl) {
        if (this.pages.length <= 1) {
            Toast.warning('Cannot delete the last page');
            return;
        }

        pageEl.remove();
        this.updatePageOrder();
        Toast.success('Page removed');
    },

    updatePageCount() {
        const count = document.querySelectorAll('#reorganize-pages .reorganize-page').length;
        document.getElementById('reorganize-pdf-pages').textContent = `${count} pages`;
    },

    resetOrder() {
        // Reload the PDF to reset everything
        if (this.currentFile) {
            this.loadPDF(this.currentFile);
        }
    },

    clearFile() {
        this.currentFile = null;
        this.pdfDoc = null;
        this.pdfLibDoc = null;
        this.pageCount = 0;
        this.pages = [];
        this.resultData = null;
        this.resultFilename = null;

        document.getElementById('reorganize-workspace').style.display = 'none';
        document.getElementById('reorganize-actions').style.display = 'none';
        document.getElementById('reorganize-drop-zone').style.display = 'block';
        document.getElementById('reorganize-result').style.display = 'none';
        document.getElementById('reorganize-pages').innerHTML = '';
    },

    async savePDF() {
        if (this.pages.length === 0) {
            Toast.warning('No pages to save');
            return;
        }

        try {
            document.getElementById('reorganize-btn').disabled = true;
            Progress.show('reorganize-progress', 'Creating new PDF...');

            const { PDFDocument } = PDFLib;
            const newPdf = await PDFDocument.create();

            // Copy pages in new order
            for (let i = 0; i < this.pages.length; i++) {
                Progress.update('reorganize-progress',
                    Math.round((i / this.pages.length) * 90),
                    `Processing page ${i + 1}/${this.pages.length}...`
                );

                const originalIndex = this.pages[i].originalIndex;
                const [copiedPage] = await newPdf.copyPages(this.pdfLibDoc, [originalIndex]);
                newPdf.addPage(copiedPage);
            }

            Progress.update('reorganize-progress', 95, 'Generating PDF...');

            const pdfBytes = await newPdf.save();

            // Store result
            const baseName = this.currentFile.name.replace('.pdf', '');
            this.resultFilename = `${baseName}_reorganized.pdf`;
            this.resultData = pdfBytes;

            // Show result
            document.getElementById('reorganize-result-filename').textContent = this.resultFilename;
            document.getElementById('reorganize-result-pages').textContent = this.pages.length;
            document.getElementById('reorganize-result-size').textContent = Utils.formatSize(pdfBytes.length);
            document.getElementById('reorganize-result').style.display = 'block';

            Progress.hide('reorganize-progress');
            Toast.success('PDF reorganized successfully - ready to download');

        } catch (error) {
            console.error('Error saving PDF:', error);
            Toast.error('Failed to save PDF: ' + error.message);
            Progress.hide('reorganize-progress');
        } finally {
            document.getElementById('reorganize-btn').disabled = false;
        }
    },

    downloadResult() {
        if (this.resultData && this.resultFilename) {
            Utils.downloadFile(this.resultData, this.resultFilename);
            Toast.success('Download started');
        }
    }
};
