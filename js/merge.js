// PDF Merge Module

const MergeModule = {
    files: [],
    resultData: null,
    resultFilename: null,

    init() {
        // Setup drop zone
        setupDropZone('merge-drop-zone', 'merge-file-input', (files) => {
            this.addFiles(files);
        }, { multiple: true, accept: '.pdf' });

        // Setup sortable list
        setupSortableList('merge-file-list', () => {
            this.updateFilesOrder();
        });

        // Clear button
        document.getElementById('merge-clear')?.addEventListener('click', () => {
            this.clearFiles();
        });

        // Merge button
        document.getElementById('merge-btn')?.addEventListener('click', () => {
            this.mergePDFs();
        });
    },

    addFiles(newFiles) {
        for (const file of newFiles) {
            if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
                this.files.push({
                    id: Utils.generateId(),
                    file: file,
                    name: file.name,
                    size: file.size
                });
            }
        }
        this.renderFileList();
        this.updateActions();
    },

    removeFile(id) {
        this.files = this.files.filter(f => f.id !== id);
        this.renderFileList();
        this.updateActions();
    },

    clearFiles() {
        this.files = [];
        this.resultData = null;
        this.resultFilename = null;
        this.renderFileList();
        this.updateActions();
        document.getElementById('merge-result').style.display = 'none';
    },

    updateFilesOrder() {
        const fileList = document.getElementById('merge-file-list');
        const items = fileList.querySelectorAll('.file-item');
        const newOrder = [];

        items.forEach(item => {
            const id = item.dataset.id;
            const file = this.files.find(f => f.id === id);
            if (file) newOrder.push(file);
        });

        this.files = newOrder;
    },

    renderFileList() {
        const fileList = document.getElementById('merge-file-list');
        fileList.innerHTML = '';

        this.files.forEach((fileData, index) => {
            const item = document.createElement('div');
            item.className = 'file-item';
            item.dataset.id = fileData.id;
            item.draggable = true;

            item.innerHTML = `
                <div class="drag-handle">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="8" y1="6" x2="16" y2="6"></line>
                        <line x1="8" y1="12" x2="16" y2="12"></line>
                        <line x1="8" y1="18" x2="16" y2="18"></line>
                    </svg>
                </div>
                <div class="file-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                        <polyline points="14 2 14 8 20 8"></polyline>
                    </svg>
                </div>
                <div class="file-info">
                    <div class="file-name">${fileData.name}</div>
                    <div class="file-size">${Utils.formatSize(fileData.size)}</div>
                </div>
                <button class="file-remove" data-id="${fileData.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;

            item.querySelector('.file-remove').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeFile(fileData.id);
            });

            fileList.appendChild(item);
        });
    },

    updateActions() {
        const actions = document.getElementById('merge-actions');
        actions.style.display = this.files.length > 0 ? 'flex' : 'none';
    },

    async mergePDFs() {
        if (this.files.length < 2) {
            Toast.warning('Please add at least 2 PDF files to merge');
            return;
        }

        try {
            Progress.show('merge-progress', 'Reading PDF files...');
            document.getElementById('merge-btn').disabled = true;

            const { PDFDocument } = PDFLib;
            const mergedPdf = await PDFDocument.create();

            for (let i = 0; i < this.files.length; i++) {
                const fileData = this.files[i];
                Progress.update('merge-progress',
                    Math.round((i / this.files.length) * 80),
                    `Processing ${fileData.name}...`
                );

                try {
                    const arrayBuffer = await Utils.readFileAsArrayBuffer(fileData.file);
                    const pdf = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                    const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());

                    for (const page of pages) {
                        mergedPdf.addPage(page);
                    }
                } catch (error) {
                    console.error(`Error processing ${fileData.name}:`, error);
                    Toast.error(`Failed to process ${fileData.name}: ${error.message}`);
                    Progress.hide('merge-progress');
                    document.getElementById('merge-btn').disabled = false;
                    return;
                }
            }

            Progress.update('merge-progress', 90, 'Generating merged PDF...');

            const mergedPdfBytes = await mergedPdf.save();

            Progress.update('merge-progress', 100, 'Complete!');

            // Generate filename from first file
            const baseName = this.files[0].name.replace('.pdf', '');
            this.resultFilename = `${baseName}_merged.pdf`;
            this.resultData = mergedPdfBytes;

            // Show result panel with download button
            this.showResult(mergedPdfBytes.length);
            Toast.success(`Successfully merged ${this.files.length} PDFs`);

            Progress.hide('merge-progress');

        } catch (error) {
            console.error('Merge error:', error);
            Toast.error('Failed to merge PDFs: ' + error.message);
            Progress.hide('merge-progress');
        } finally {
            document.getElementById('merge-btn').disabled = false;
        }
    },

    showResult(size) {
        const resultPanel = document.getElementById('merge-result');
        document.getElementById('merge-result-filename').textContent = this.resultFilename;
        document.getElementById('merge-result-size').textContent = Utils.formatSize(size);
        document.getElementById('merge-result-pages').textContent = `${this.files.length} files merged`;
        resultPanel.style.display = 'block';

        // Setup download button
        document.getElementById('merge-download-btn').onclick = () => this.downloadResult();
    },

    downloadResult() {
        if (this.resultData && this.resultFilename) {
            Utils.downloadFile(this.resultData, this.resultFilename);
            Toast.success('Download started');
        }
    }
};
