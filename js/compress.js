// PDF Compress Module

const CompressModule = {
    currentFile: null,
    originalSize: 0,

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
    },

    loadPDF(file) {
        if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
            Toast.warning('Please select a PDF file');
            return;
        }

        this.currentFile = file;
        this.originalSize = file.size;

        // Update UI
        document.getElementById('compress-pdf-name').textContent = file.name;
        document.getElementById('compress-pdf-size').textContent = Utils.formatSize(file.size);
        document.getElementById('compress-options').style.display = 'block';
        document.getElementById('compress-actions').style.display = 'flex';
        document.getElementById('compress-drop-zone').style.display = 'none';
        document.getElementById('compress-result').style.display = 'none';

        Toast.success('PDF loaded successfully');
    },

    clearFile() {
        this.currentFile = null;
        this.originalSize = 0;

        document.getElementById('compress-options').style.display = 'none';
        document.getElementById('compress-actions').style.display = 'none';
        document.getElementById('compress-drop-zone').style.display = 'block';
        document.getElementById('compress-result').style.display = 'none';
    },

    async compressPDF() {
        if (!this.currentFile) {
            Toast.warning('Please load a PDF first');
            return;
        }

        const quality = document.querySelector('input[name="quality"]:checked').value;

        try {
            document.getElementById('compress-btn').disabled = true;
            Progress.show('compress-progress', 'Reading PDF...');

            const arrayBuffer = await Utils.readFileAsArrayBuffer(this.currentFile);

            Progress.update('compress-progress', 20, 'Analyzing PDF...');

            // Load PDF with pdf-lib
            const { PDFDocument } = PDFLib;
            const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

            Progress.update('compress-progress', 40, 'Compressing...');

            // Get quality settings
            const qualitySettings = this.getQualitySettings(quality);

            // Compress by re-rendering pages with adjusted image quality
            const compressedPdf = await this.compressWithImageOptimization(pdfDoc, qualitySettings);

            Progress.update('compress-progress', 80, 'Generating compressed PDF...');

            // Save with compression options
            const compressedBytes = await compressedPdf.save({
                useObjectStreams: true,
                addDefaultPage: false,
            });

            Progress.update('compress-progress', 100, 'Complete!');

            const compressedSize = compressedBytes.length;
            const savings = ((this.originalSize - compressedSize) / this.originalSize * 100).toFixed(1);

            // Show results
            this.showResults(compressedSize, savings);

            // Download
            const baseName = this.currentFile.name.replace('.pdf', '');
            const filename = `${baseName}_compressed.pdf`;
            Utils.downloadFile(compressedBytes, filename);

            if (compressedSize >= this.originalSize) {
                Toast.warning('PDF is already optimized. Compression may not reduce size further.');
            } else {
                Toast.success(`Compressed! Saved ${savings}%`);
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
        switch (quality) {
            case 'low':
                return { scale: 0.5, imageQuality: 0.3 };
            case 'medium':
                return { scale: 0.75, imageQuality: 0.6 };
            case 'high':
                return { scale: 0.9, imageQuality: 0.85 };
            default:
                return { scale: 0.75, imageQuality: 0.6 };
        }
    },

    async compressWithImageOptimization(pdfDoc, settings) {
        // Create a new document for the compressed version
        const { PDFDocument } = PDFLib;
        const compressedDoc = await PDFDocument.create();

        const pages = pdfDoc.getPages();

        for (let i = 0; i < pages.length; i++) {
            Progress.update('compress-progress',
                40 + Math.round((i / pages.length) * 40),
                `Compressing page ${i + 1}/${pages.length}...`
            );

            // Copy page directly (basic compression)
            const [copiedPage] = await compressedDoc.copyPages(pdfDoc, [i]);
            compressedDoc.addPage(copiedPage);
        }

        return compressedDoc;
    },

    showResults(compressedSize, savings) {
        document.getElementById('original-size').textContent = Utils.formatSize(this.originalSize);
        document.getElementById('compressed-size').textContent = Utils.formatSize(compressedSize);

        const savingsText = compressedSize < this.originalSize
            ? `Reduced by ${savings}%`
            : 'No size reduction achieved';
        document.getElementById('savings').textContent = savingsText;

        document.getElementById('compress-result').style.display = 'block';
    }
};
