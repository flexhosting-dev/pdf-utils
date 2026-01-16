// PDF Convert Module

const ConvertModule = {
    // Images to PDF
    images: [],
    imgToPdfResult: null,
    imgToPdfFilename: null,

    // PDF to Images
    currentPdf: null,
    pdfDoc: null,
    pageCount: 0,
    pdfToImgResults: [],

    init() {
        // Images to PDF
        this.initImagesToPdf();

        // PDF to Images
        this.initPdfToImages();
    },

    // ==================== Images to PDF ====================

    initImagesToPdf() {
        // Setup drop zone
        setupDropZone('img-drop-zone', 'img-file-input', (files) => {
            this.addImages(files);
        }, { multiple: true, accept: 'image/*' });

        // Setup sortable list
        setupSortableList('image-list', () => {
            this.updateImagesOrder();
        });

        // Clear button
        document.getElementById('img-clear')?.addEventListener('click', () => {
            this.clearImages();
        });

        // Convert button
        document.getElementById('img-to-pdf-btn')?.addEventListener('click', () => {
            this.convertImagesToPdf();
        });
    },

    async addImages(files) {
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                try {
                    const dataUrl = await Utils.readFileAsDataURL(file);
                    this.images.push({
                        id: Utils.generateId(),
                        file: file,
                        name: file.name,
                        dataUrl: dataUrl
                    });
                } catch (error) {
                    console.error('Error loading image:', error);
                }
            }
        }
        this.renderImageList();
        this.updateImageActions();
    },

    removeImage(id) {
        this.images = this.images.filter(img => img.id !== id);
        this.renderImageList();
        this.updateImageActions();
    },

    clearImages() {
        this.images = [];
        this.imgToPdfResult = null;
        this.imgToPdfFilename = null;
        this.renderImageList();
        this.updateImageActions();
        document.getElementById('img-to-pdf-result').style.display = 'none';
    },

    updateImagesOrder() {
        const imageList = document.getElementById('image-list');
        const items = imageList.querySelectorAll('.image-item');
        const newOrder = [];

        items.forEach(item => {
            const id = item.dataset.id;
            const img = this.images.find(i => i.id === id);
            if (img) newOrder.push(img);
        });

        this.images = newOrder;
    },

    renderImageList() {
        const imageList = document.getElementById('image-list');
        imageList.innerHTML = '';

        this.images.forEach((imageData) => {
            const item = document.createElement('div');
            item.className = 'image-item';
            item.dataset.id = imageData.id;
            item.draggable = true;

            item.innerHTML = `
                <img src="${imageData.dataUrl}" alt="${imageData.name}">
                <button class="remove-btn" data-id="${imageData.id}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            `;

            item.querySelector('.remove-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeImage(imageData.id);
            });

            imageList.appendChild(item);
        });
    },

    updateImageActions() {
        const actions = document.getElementById('img-to-pdf-actions');
        actions.style.display = this.images.length > 0 ? 'flex' : 'none';
    },

    async convertImagesToPdf() {
        if (this.images.length === 0) {
            Toast.warning('Please add at least one image');
            return;
        }

        try {
            document.getElementById('img-to-pdf-btn').disabled = true;
            Progress.show('convert-progress', 'Creating PDF...');

            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.create();

            for (let i = 0; i < this.images.length; i++) {
                const imageData = this.images[i];
                Progress.update('convert-progress',
                    Math.round((i / this.images.length) * 90),
                    `Processing image ${i + 1}/${this.images.length}...`
                );

                try {
                    const arrayBuffer = await Utils.readFileAsArrayBuffer(imageData.file);
                    const uint8Array = new Uint8Array(arrayBuffer);

                    let image;
                    const type = imageData.file.type.toLowerCase();

                    if (type.includes('png')) {
                        image = await pdfDoc.embedPng(uint8Array);
                    } else if (type.includes('jpeg') || type.includes('jpg')) {
                        image = await pdfDoc.embedJpg(uint8Array);
                    } else {
                        // For other formats, convert to PNG via canvas
                        const pngData = await this.convertImageToPng(imageData.dataUrl);
                        image = await pdfDoc.embedPng(pngData);
                    }

                    // Create page with image dimensions
                    const page = pdfDoc.addPage([image.width, image.height]);
                    page.drawImage(image, {
                        x: 0,
                        y: 0,
                        width: image.width,
                        height: image.height
                    });

                } catch (error) {
                    console.error(`Error processing image ${imageData.name}:`, error);
                    Toast.warning(`Skipped ${imageData.name}: ${error.message}`);
                }
            }

            Progress.update('convert-progress', 95, 'Generating PDF...');

            const pdfBytes = await pdfDoc.save();

            Progress.update('convert-progress', 100, 'Complete!');

            this.imgToPdfFilename = this.images.length === 1
                ? this.images[0].name.replace(/\.[^/.]+$/, '') + '.pdf'
                : 'images_converted.pdf';
            this.imgToPdfResult = pdfBytes;

            this.showImgToPdfResult(pdfBytes.length);
            Toast.success(`Created PDF with ${this.images.length} image(s) - ready to download`);

        } catch (error) {
            console.error('Conversion error:', error);
            Toast.error('Failed to create PDF: ' + error.message);
        } finally {
            document.getElementById('img-to-pdf-btn').disabled = false;
            Progress.hide('convert-progress');
        }
    },

    showImgToPdfResult(size) {
        const resultPanel = document.getElementById('img-to-pdf-result');
        document.getElementById('img-to-pdf-filename').textContent = this.imgToPdfFilename;
        document.getElementById('img-to-pdf-size').textContent = Utils.formatSize(size);
        document.getElementById('img-to-pdf-pages').textContent = `${this.images.length} page(s)`;
        resultPanel.style.display = 'block';

        document.getElementById('img-to-pdf-download-btn').onclick = () => this.downloadImgToPdf();
    },

    downloadImgToPdf() {
        if (this.imgToPdfResult && this.imgToPdfFilename) {
            Utils.downloadFile(this.imgToPdfResult, this.imgToPdfFilename);
            Toast.success('Download started');
        }
    },

    convertImageToPng(dataUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);

                canvas.toBlob((blob) => {
                    if (blob) {
                        blob.arrayBuffer().then(buffer => {
                            resolve(new Uint8Array(buffer));
                        });
                    } else {
                        reject(new Error('Failed to convert image'));
                    }
                }, 'image/png');
            };
            img.onerror = reject;
            img.src = dataUrl;
        });
    },

    // ==================== PDF to Images ====================

    initPdfToImages() {
        // Setup drop zone
        setupDropZone('pdf-img-drop-zone', 'pdf-img-file-input', (files) => {
            this.loadPdfForImages(files[0]);
        }, { multiple: false, accept: '.pdf' });

        // Clear button
        document.getElementById('pdf-img-clear')?.addEventListener('click', () => {
            this.clearPdfForImages();
        });

        // Convert button
        document.getElementById('pdf-to-img-btn')?.addEventListener('click', () => {
            this.convertPdfToImages();
        });

        // Scale slider
        const scaleInput = document.getElementById('scale-input');
        const scaleValue = document.getElementById('scale-value');
        scaleInput?.addEventListener('input', () => {
            scaleValue.textContent = scaleInput.value + 'x';
        });

        // Preview button
        document.getElementById('pdf-img-preview-btn')?.addEventListener('click', () => {
            if (this.currentPdf) {
                PdfPreview.open(this.currentPdf);
            }
        });
    },

    async loadPdfForImages(file) {
        if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
            Toast.warning('Please select a PDF file');
            return;
        }

        try {
            Progress.show('convert-progress', 'Loading PDF...');

            this.currentPdf = file;
            const arrayBuffer = await Utils.readFileAsArrayBuffer(file);
            this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            this.pageCount = this.pdfDoc.numPages;

            // Update UI
            document.getElementById('pdf-img-name').textContent = file.name;
            document.getElementById('pdf-img-pages').textContent = `${this.pageCount} pages`;
            document.getElementById('pdf-to-img-options').style.display = 'block';
            document.getElementById('pdf-to-img-actions').style.display = 'flex';
            document.getElementById('pdf-img-drop-zone').style.display = 'none';

            Progress.hide('convert-progress');
            Toast.success('PDF loaded successfully');

        } catch (error) {
            console.error('Error loading PDF:', error);
            Toast.error('Failed to load PDF: ' + error.message);
            Progress.hide('convert-progress');
        }
    },

    clearPdfForImages() {
        this.currentPdf = null;
        this.pdfDoc = null;
        this.pageCount = 0;
        this.pdfToImgResults = [];

        document.getElementById('pdf-to-img-options').style.display = 'none';
        document.getElementById('pdf-to-img-actions').style.display = 'none';
        document.getElementById('pdf-img-drop-zone').style.display = 'block';
        document.getElementById('pdf-to-img-result').style.display = 'none';
    },

    async convertPdfToImages() {
        if (!this.pdfDoc) {
            Toast.warning('Please load a PDF first');
            return;
        }

        const format = document.querySelector('input[name="img-format"]:checked').value;
        const scale = parseFloat(document.getElementById('scale-input').value);

        try {
            document.getElementById('pdf-to-img-btn').disabled = true;
            Progress.show('convert-progress', 'Converting pages...');

            this.pdfToImgResults = [];
            const baseName = this.currentPdf.name.replace('.pdf', '');
            const mimeType = format === 'png' ? 'image/png' : 'image/jpeg';
            const extension = format === 'png' ? 'png' : 'jpg';

            for (let i = 1; i <= this.pageCount; i++) {
                Progress.update('convert-progress',
                    Math.round((i / this.pageCount) * 100),
                    `Converting page ${i}/${this.pageCount}...`
                );

                const page = await this.pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale });

                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;

                const context = canvas.getContext('2d');

                // White background for JPG
                if (format === 'jpeg') {
                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, canvas.width, canvas.height);
                }

                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                // Convert to blob
                const blob = await new Promise(resolve => {
                    canvas.toBlob(resolve, mimeType, format === 'jpeg' ? 0.92 : undefined);
                });

                const filename = `${baseName}_page_${String(i).padStart(3, '0')}.${extension}`;
                this.pdfToImgResults.push({ blob, filename, size: blob.size });
            }

            this.showPdfToImgResult(format.toUpperCase());
            Toast.success(`Converted ${this.pageCount} page(s) to ${format.toUpperCase()} - ready to download`);

        } catch (error) {
            console.error('Conversion error:', error);
            Toast.error('Failed to convert PDF: ' + error.message);
        } finally {
            document.getElementById('pdf-to-img-btn').disabled = false;
            Progress.hide('convert-progress');
        }
    },

    showPdfToImgResult(format) {
        const resultPanel = document.getElementById('pdf-to-img-result');
        const totalSize = this.pdfToImgResults.reduce((sum, f) => sum + f.size, 0);

        document.getElementById('pdf-to-img-info').textContent = `${this.pdfToImgResults.length} ${format} image(s)`;
        document.getElementById('pdf-to-img-size').textContent = Utils.formatSize(totalSize);
        resultPanel.style.display = 'block';

        document.getElementById('pdf-to-img-download-btn').onclick = () => this.downloadPdfToImg();
    },

    async downloadPdfToImg() {
        if (this.pdfToImgResults.length === 0) return;

        Toast.success(`Downloading ${this.pdfToImgResults.length} image(s)...`);
        for (const file of this.pdfToImgResults) {
            Utils.downloadBlob(file.blob, file.filename);
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }
};
