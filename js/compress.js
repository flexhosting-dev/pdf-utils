// PDF Compress Module

const CompressModule = {
    currentFile: null,
    pdfDoc: null,
    originalSize: 0,
    resultData: null,
    resultFilename: null,

    init() {
        // Setup drop zone
        setupDropZone('compress-drop-zone', 'compress-file-input', (files) => {
            this.loadPDF(files[0]);
        }, { multiple: false, accept: '.pdf' });

        // Clear button
        document.getElementById('compress-clear')?.addEventListener('click', () => {
            this.clearFile();
        });

        // Compress button
        document.getElementById('compress-btn')?.addEventListener('click', () => {
            this.compressPDF();
        });

        // Preview button
        document.getElementById('compress-preview-btn')?.addEventListener('click', () => {
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
            Progress.show('compress-progress', 'Loading PDF...');

            this.currentFile = file;
            this.originalSize = file.size;

            // Load with PDF.js for rendering
            const arrayBuffer = await Utils.readFileAsArrayBuffer(file);
            this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            // Update UI
            document.getElementById('compress-pdf-name').textContent = file.name;
            document.getElementById('compress-pdf-size').textContent = Utils.formatSize(file.size);
            document.getElementById('compress-options').style.display = 'block';
            document.getElementById('compress-actions').style.display = 'flex';
            document.getElementById('compress-drop-zone').style.display = 'none';
            document.getElementById('compress-result').style.display = 'none';

            Progress.hide('compress-progress');
            Toast.success('PDF loaded successfully');

        } catch (error) {
            console.error('Error loading PDF:', error);
            Toast.error('Failed to load PDF: ' + error.message);
            Progress.hide('compress-progress');
        }
    },

    clearFile() {
        this.currentFile = null;
        this.pdfDoc = null;
        this.originalSize = 0;
        this.resultData = null;
        this.resultFilename = null;

        document.getElementById('compress-options').style.display = 'none';
        document.getElementById('compress-actions').style.display = 'none';
        document.getElementById('compress-drop-zone').style.display = 'block';
        document.getElementById('compress-result').style.display = 'none';
    },

    async compressPDF() {
        if (!this.pdfDoc) {
            Toast.warning('Please load a PDF first');
            return;
        }

        const quality = document.querySelector('input[name="quality"]:checked').value;

        try {
            document.getElementById('compress-btn').disabled = true;
            Progress.show('compress-progress', 'Starting compression...');

            const settings = this.getQualitySettings(quality);
            const pageCount = this.pdfDoc.numPages;

            // Create new PDF with pdf-lib
            const { PDFDocument } = PDFLib;
            const compressedDoc = await PDFDocument.create();

            for (let i = 1; i <= pageCount; i++) {
                Progress.update('compress-progress',
                    Math.round((i / pageCount) * 90),
                    `Compressing page ${i}/${pageCount}...`
                );

                // Render page with PDF.js
                const page = await this.pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale: settings.scale });

                // Create canvas
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const context = canvas.getContext('2d');

                // White background
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, canvas.width, canvas.height);

                // Render page
                await page.render({
                    canvasContext: context,
                    viewport: viewport
                }).promise;

                // Convert to JPEG with quality setting
                const jpegDataUrl = canvas.toDataURL('image/jpeg', settings.imageQuality);
                const jpegBytes = this.dataUrlToBytes(jpegDataUrl);

                // Embed image in new PDF
                const image = await compressedDoc.embedJpg(jpegBytes);

                // Add page with original dimensions (scaled back up for display)
                const originalViewport = page.getViewport({ scale: 1 });
                const pdfPage = compressedDoc.addPage([originalViewport.width, originalViewport.height]);

                // Draw image to fill page
                pdfPage.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: originalViewport.width,
                    height: originalViewport.height
                });
            }

            Progress.update('compress-progress', 95, 'Generating compressed PDF...');

            // Save compressed PDF
            const compressedBytes = await compressedDoc.save();

            Progress.update('compress-progress', 100, 'Complete!');

            const compressedSize = compressedBytes.length;
            const savings = ((this.originalSize - compressedSize) / this.originalSize * 100).toFixed(1);

            // Store result
            const baseName = this.currentFile.name.replace('.pdf', '');
            this.resultFilename = `${baseName}_compressed.pdf`;
            this.resultData = compressedBytes;

            // Show results
            this.showResults(compressedSize, savings);

            if (compressedSize >= this.originalSize) {
                Toast.warning('Compressed file is not smaller. Try a lower quality setting.');
            } else {
                Toast.success(`Compressed! Saved ${savings}% - ready to download`);
            }

        } catch (error) {
            console.error('Compression error:', error);
            Toast.error('Failed to compress PDF: ' + error.message);
        } finally {
            document.getElementById('compress-btn').disabled = false;
            Progress.hide('compress-progress');
        }
    },

    getQualitySettings(quality) {
        // Scale affects render resolution, imageQuality affects JPEG compression
        switch (quality) {
            case 'low':
                // Aggressive compression - lower resolution and quality
                return { scale: 1.0, imageQuality: 0.4 };
            case 'medium':
                // Balanced compression
                return { scale: 1.5, imageQuality: 0.6 };
            case 'high':
                // Light compression - maintain quality
                return { scale: 2.0, imageQuality: 0.8 };
            default:
                return { scale: 1.5, imageQuality: 0.6 };
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

    showResults(compressedSize, savings) {
        document.getElementById('original-size').textContent = Utils.formatSize(this.originalSize);
        document.getElementById('compressed-size').textContent = Utils.formatSize(compressedSize);

        const savingsEl = document.getElementById('savings');
        if (compressedSize < this.originalSize) {
            savingsEl.textContent = `Reduced by ${savings}%`;
            savingsEl.style.color = '#10b981';
        } else {
            const increase = ((compressedSize - this.originalSize) / this.originalSize * 100).toFixed(1);
            savingsEl.textContent = `Size increased by ${increase}% - try lower quality`;
            savingsEl.style.color = '#f59e0b';
        }

        document.getElementById('compress-result').style.display = 'block';
        document.getElementById('compress-download-btn').onclick = () => this.downloadResult();
    },

    downloadResult() {
        if (this.resultData && this.resultFilename) {
            Utils.downloadFile(this.resultData, this.resultFilename);
            Toast.success('Download started');
        }
    }
};
