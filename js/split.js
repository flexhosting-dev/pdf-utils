// PDF Split Module

const SplitModule = {
    currentFile: null,
    pdfDoc: null,
    pdfLibDoc: null,
    pageCount: 0,
    selectedPages: new Set(),
    resultFiles: [],

    init() {
        // Setup drop zone
        setupDropZone('split-drop-zone', 'split-file-input', (files) => {
            this.loadPDF(files[0]);
        }, { multiple: false, accept: '.pdf' });

        // Clear button
        document.getElementById('split-clear')?.addEventListener('click', () => {
            this.clearFile();
        });

        // Split button
        document.getElementById('split-btn')?.addEventListener('click', () => {
            this.splitPDF();
        });

        // Mode selection
        document.querySelectorAll('input[name="split-mode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.updateModeUI();
            });
        });

        // Page input
        document.getElementById('page-input')?.addEventListener('input', (e) => {
            this.updateSelectionFromInput(e.target.value);
        });

        // Preview button
        document.getElementById('split-preview-btn')?.addEventListener('click', () => {
            if (this.currentFile) {
                PdfPreview.open(this.currentFile);
            }
        });
    },

    async loadPDF(file) {
        if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
            Toast.warning('Please select a PDF file');
            return;
        }

        try {
            Progress.show('split-progress', 'Loading PDF...');

            this.currentFile = file;
            const arrayBuffer = await Utils.readFileAsArrayBuffer(file);

            // Load with PDF.js for rendering
            this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            this.pageCount = this.pdfDoc.numPages;

            // Load with pdf-lib for manipulation
            this.pdfLibDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

            // Update UI
            document.getElementById('split-pdf-name').textContent = file.name;
            document.getElementById('split-pdf-pages').textContent = `${this.pageCount} pages`;
            document.getElementById('split-options').style.display = 'block';
            document.getElementById('split-actions').style.display = 'flex';
            document.getElementById('split-drop-zone').style.display = 'none';

            // Generate thumbnails
            await this.generateThumbnails();

            // Initialize selection
            this.selectedPages.clear();
            this.updateModeUI();

            Progress.hide('split-progress');
            Toast.success('PDF loaded successfully');

        } catch (error) {
            console.error('Error loading PDF:', error);
            Toast.error('Failed to load PDF: ' + error.message);
            Progress.hide('split-progress');
            this.clearFile();
        }
    },

    async generateThumbnails() {
        const container = document.getElementById('split-thumbnails');
        container.innerHTML = '';

        Progress.update('split-progress', 50, 'Generating thumbnails...');

        for (let i = 1; i <= this.pageCount; i++) {
            try {
                const canvas = await Utils.createThumbnail(this.pdfDoc, i, 100);

                const thumbnail = document.createElement('div');
                thumbnail.className = 'page-thumbnail';
                thumbnail.dataset.page = i;
                thumbnail.appendChild(canvas);

                const pageNum = document.createElement('div');
                pageNum.className = 'page-number';
                pageNum.textContent = i;
                thumbnail.appendChild(pageNum);

                thumbnail.addEventListener('click', () => {
                    this.togglePageSelection(i);
                });

                container.appendChild(thumbnail);

                Progress.update('split-progress',
                    50 + Math.round((i / this.pageCount) * 50),
                    `Generating thumbnails... ${i}/${this.pageCount}`
                );
            } catch (error) {
                console.error(`Error generating thumbnail for page ${i}:`, error);
            }
        }
    },

    togglePageSelection(pageNum) {
        const mode = document.querySelector('input[name="split-mode"]:checked').value;

        if (mode === 'all') return; // No selection in "all" mode

        if (this.selectedPages.has(pageNum)) {
            this.selectedPages.delete(pageNum);
        } else {
            this.selectedPages.add(pageNum);
        }

        this.updateThumbnailSelection();
        this.updatePageInput();
    },

    updateThumbnailSelection() {
        document.querySelectorAll('.page-thumbnail').forEach(thumb => {
            const page = parseInt(thumb.dataset.page);
            thumb.classList.toggle('selected', this.selectedPages.has(page));
        });
    },

    updatePageInput() {
        const input = document.getElementById('page-input');
        if (!input) return;

        const pages = Array.from(this.selectedPages).sort((a, b) => a - b);
        const ranges = [];
        let start = pages[0];
        let end = pages[0];

        for (let i = 1; i <= pages.length; i++) {
            if (pages[i] === end + 1) {
                end = pages[i];
            } else {
                if (start === end) {
                    ranges.push(String(start));
                } else {
                    ranges.push(`${start}-${end}`);
                }
                start = pages[i];
                end = pages[i];
            }
        }

        input.value = ranges.join(', ');
    },

    updateSelectionFromInput(value) {
        const pages = Utils.parsePageRange(value, this.pageCount);
        this.selectedPages = new Set(pages);
        this.updateThumbnailSelection();
    },

    updateModeUI() {
        const mode = document.querySelector('input[name="split-mode"]:checked').value;
        const pageSelection = document.getElementById('page-selection');
        const thumbnails = document.getElementById('split-thumbnails');

        if (mode === 'all') {
            pageSelection.style.display = 'none';
            thumbnails.style.pointerEvents = 'none';
            thumbnails.style.opacity = '0.6';
            // Select all pages
            this.selectedPages = new Set(Array.from({ length: this.pageCount }, (_, i) => i + 1));
        } else {
            pageSelection.style.display = mode === 'extract' || mode === 'range' ? 'block' : 'none';
            thumbnails.style.pointerEvents = 'auto';
            thumbnails.style.opacity = '1';

            if (mode === 'range') {
                document.querySelector('#page-selection label').textContent = 'Page range (e.g., 1-5):';
            } else {
                document.querySelector('#page-selection label').textContent = 'Select pages (e.g., 1, 3, 5-8):';
            }
        }

        this.updateThumbnailSelection();
    },

    clearFile() {
        this.currentFile = null;
        this.pdfDoc = null;
        this.pdfLibDoc = null;
        this.pageCount = 0;
        this.selectedPages.clear();
        this.resultFiles = [];

        document.getElementById('split-options').style.display = 'none';
        document.getElementById('split-actions').style.display = 'none';
        document.getElementById('split-drop-zone').style.display = 'block';
        document.getElementById('split-thumbnails').innerHTML = '';
        document.getElementById('page-input').value = '';
        document.getElementById('split-result').style.display = 'none';
    },

    async splitPDF() {
        if (!this.pdfLibDoc) {
            Toast.warning('Please load a PDF first');
            return;
        }

        const mode = document.querySelector('input[name="split-mode"]:checked').value;

        try {
            document.getElementById('split-btn').disabled = true;
            Progress.show('split-progress', 'Splitting PDF...');

            if (mode === 'all') {
                await this.splitAllPages();
            } else {
                await this.extractSelectedPages();
            }

        } catch (error) {
            console.error('Split error:', error);
            Toast.error('Failed to split PDF: ' + error.message);
        } finally {
            document.getElementById('split-btn').disabled = false;
            Progress.hide('split-progress');
        }
    },

    async splitAllPages() {
        const baseName = this.currentFile.name.replace('.pdf', '');
        const { PDFDocument } = PDFLib;

        this.resultFiles = [];

        for (let i = 0; i < this.pageCount; i++) {
            Progress.update('split-progress',
                Math.round((i / this.pageCount) * 100),
                `Creating page ${i + 1}/${this.pageCount}...`
            );

            const newPdf = await PDFDocument.create();
            const [page] = await newPdf.copyPages(this.pdfLibDoc, [i]);
            newPdf.addPage(page);

            const pdfBytes = await newPdf.save();
            const filename = `${baseName}_page_${String(i + 1).padStart(3, '0')}.pdf`;

            this.resultFiles.push({ data: pdfBytes, filename, size: pdfBytes.length });
        }

        this.showResult(`${this.pageCount} individual PDF files`);
        Toast.success(`Split into ${this.pageCount} individual pages - ready to download`);
    },

    async extractSelectedPages() {
        if (this.selectedPages.size === 0) {
            Toast.warning('Please select at least one page');
            return;
        }

        const { PDFDocument } = PDFLib;
        const baseName = this.currentFile.name.replace('.pdf', '');

        Progress.update('split-progress', 50, 'Extracting pages...');

        const newPdf = await PDFDocument.create();
        const pageIndices = Array.from(this.selectedPages).sort((a, b) => a - b).map(p => p - 1);

        const pages = await newPdf.copyPages(this.pdfLibDoc, pageIndices);
        for (const page of pages) {
            newPdf.addPage(page);
        }

        Progress.update('split-progress', 90, 'Generating PDF...');

        const pdfBytes = await newPdf.save();
        const pageRange = this.formatPageRange(Array.from(this.selectedPages).sort((a, b) => a - b));
        const filename = `${baseName}_pages_${pageRange}.pdf`;

        this.resultFiles = [{ data: pdfBytes, filename, size: pdfBytes.length }];
        this.showResult(`${this.selectedPages.size} page(s) extracted`);
        Toast.success(`Extracted ${this.selectedPages.size} page(s) - ready to download`);
    },

    formatPageRange(pages) {
        if (pages.length === 1) return String(pages[0]);
        if (pages.length === 2) return `${pages[0]}-${pages[1]}`;
        return `${pages[0]}-${pages[pages.length - 1]}`;
    },

    showResult(description) {
        const resultPanel = document.getElementById('split-result');
        const totalSize = this.resultFiles.reduce((sum, f) => sum + f.size, 0);

        document.getElementById('split-result-info').textContent = description;
        document.getElementById('split-result-size').textContent = Utils.formatSize(totalSize);
        document.getElementById('split-result-count').textContent =
            this.resultFiles.length === 1 ? '1 file' : `${this.resultFiles.length} files`;
        resultPanel.style.display = 'block';

        document.getElementById('split-download-btn').onclick = () => this.downloadResult();
    },

    async downloadResult() {
        if (this.resultFiles.length === 0) return;

        if (this.resultFiles.length === 1) {
            Utils.downloadFile(this.resultFiles[0].data, this.resultFiles[0].filename);
            Toast.success('Download started');
        } else {
            Toast.success(`Downloading ${this.resultFiles.length} files...`);
            for (const file of this.resultFiles) {
                Utils.downloadFile(file.data, file.filename);
                await new Promise(resolve => setTimeout(resolve, 150));
            }
        }
    }
};
