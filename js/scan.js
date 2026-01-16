// PDF Scan Effect Module

const ScanModule = {
    currentFile: null,
    pdfDoc: null,
    pageCount: 0,
    resultData: null,
    resultFilename: null,
    previewPage: null,
    previewTimeout: null,

    init() {
        // Setup drop zone
        setupDropZone('scan-drop-zone', 'scan-file-input', (files) => {
            this.loadPDF(files[0]);
        }, { multiple: false, accept: '.pdf' });

        // Clear button
        document.getElementById('scan-clear')?.addEventListener('click', () => {
            this.clearFile();
        });

        // Scan button
        document.getElementById('scan-btn')?.addEventListener('click', () => {
            this.applyScanEffect();
        });

        // Download button
        document.getElementById('scan-download-btn')?.addEventListener('click', () => {
            this.downloadResult();
        });

        // Setup sliders with live preview
        this.setupSliders();
    },

    setupSliders() {
        const sliders = [
            { id: 'noise-level', valueId: 'noise-value', suffix: '%' },
            { id: 'rotation-level', valueId: 'rotation-value', suffix: '°' },
            { id: 'brightness-level', valueId: 'brightness-value', prefix: true },
            { id: 'contrast-level', valueId: 'contrast-value', prefix: true }
        ];

        sliders.forEach(({ id, valueId, suffix, prefix }) => {
            const slider = document.getElementById(id);
            const valueEl = document.getElementById(valueId);

            if (slider && valueEl) {
                slider.addEventListener('input', () => {
                    const val = parseFloat(slider.value);
                    if (prefix) {
                        valueEl.textContent = (val >= 0 ? '+' : '') + val;
                    } else {
                        valueEl.textContent = val + (suffix || '');
                    }
                    this.schedulePreviewUpdate();
                });
            }
        });

        // Color mode radio buttons
        document.querySelectorAll('input[name="color-mode"]').forEach(radio => {
            radio.addEventListener('change', () => {
                this.schedulePreviewUpdate();
            });
        });
    },

    schedulePreviewUpdate() {
        // Debounce preview updates
        if (this.previewTimeout) {
            clearTimeout(this.previewTimeout);
        }
        this.previewTimeout = setTimeout(() => {
            this.generatePreview();
        }, 150);
    },

    async loadPDF(file) {
        if (!file || (!file.type.includes('pdf') && !file.name.toLowerCase().endsWith('.pdf'))) {
            Toast.warning('Please select a PDF file');
            return;
        }

        try {
            Progress.show('scan-progress', 'Loading PDF...');

            this.currentFile = file;
            const arrayBuffer = await Utils.readFileAsArrayBuffer(file);
            this.pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            this.pageCount = this.pdfDoc.numPages;

            // Update UI
            document.getElementById('scan-pdf-name').textContent = file.name;
            document.getElementById('scan-pdf-pages').textContent = `${this.pageCount} pages`;
            document.getElementById('scan-options').style.display = 'block';
            document.getElementById('scan-actions').style.display = 'flex';
            document.getElementById('scan-drop-zone').style.display = 'none';
            document.getElementById('scan-result').style.display = 'none';

            Progress.hide('scan-progress');

            // Generate initial preview
            await this.generatePreview();
            Toast.success('PDF loaded - adjust settings and see live preview');

        } catch (error) {
            console.error('Error loading PDF:', error);
            Toast.error('Failed to load PDF: ' + error.message);
            Progress.hide('scan-progress');
        }
    },

    async generatePreview() {
        if (!this.pdfDoc) return;

        const loadingEl = document.getElementById('scan-preview-loading');
        const canvas = document.getElementById('scan-preview-canvas');

        if (!canvas) return;

        // Show loading
        loadingEl?.classList.remove('hidden');

        try {
            const settings = this.getSettings();

            // Render first page at lower scale for preview
            const page = await this.pdfDoc.getPage(1);
            const viewport = page.getViewport({ scale: 1.0 });

            // Create canvas
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            // White background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Render PDF page
            await page.render({
                canvasContext: ctx,
                viewport: viewport
            }).promise;

            // Get image data for processing
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;

            // Apply effects (no rotation for preview to keep it stable)
            this.applyColorMode(data, settings.colorMode);
            this.applyBrightnessContrast(data, settings.brightness, settings.contrast);
            this.applyNoise(data, settings.noise);

            ctx.putImageData(imageData, 0, 0);

            // Hide loading
            loadingEl?.classList.add('hidden');

        } catch (error) {
            console.error('Preview error:', error);
            loadingEl?.classList.add('hidden');
        }
    },

    clearFile() {
        this.currentFile = null;
        this.pdfDoc = null;
        this.pageCount = 0;
        this.resultData = null;
        this.resultFilename = null;

        document.getElementById('scan-options').style.display = 'none';
        document.getElementById('scan-actions').style.display = 'none';
        document.getElementById('scan-drop-zone').style.display = 'block';
        document.getElementById('scan-result').style.display = 'none';

        // Clear preview canvas
        const canvas = document.getElementById('scan-preview-canvas');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    },

    getSettings() {
        return {
            noise: parseInt(document.getElementById('noise-level').value) / 100,
            rotation: parseFloat(document.getElementById('rotation-level').value),
            brightness: parseInt(document.getElementById('brightness-level').value),
            contrast: parseInt(document.getElementById('contrast-level').value),
            colorMode: document.querySelector('input[name="color-mode"]:checked').value
        };
    },

    async applyScanEffect() {
        if (!this.pdfDoc) {
            Toast.warning('Please load a PDF first');
            return;
        }

        try {
            document.getElementById('scan-btn').disabled = true;
            Progress.show('scan-progress', 'Applying scan effect...');

            const settings = this.getSettings();
            const { PDFDocument } = PDFLib;
            const scannedDoc = await PDFDocument.create();

            for (let i = 1; i <= this.pageCount; i++) {
                Progress.update('scan-progress',
                    Math.round((i / this.pageCount) * 90),
                    `Processing page ${i}/${this.pageCount}...`
                );

                // Render page
                const page = await this.pdfDoc.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 });

                // Create canvas with rotation padding
                const rotationRad = (settings.rotation * Math.PI) / 180;
                const padding = Math.ceil(Math.max(viewport.width, viewport.height) * Math.sin(Math.abs(rotationRad)));

                const canvas = document.createElement('canvas');
                canvas.width = viewport.width + padding * 2;
                canvas.height = viewport.height + padding * 2;
                const ctx = canvas.getContext('2d');

                // White background
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Apply random rotation
                const randomRotation = (Math.random() - 0.5) * 2 * settings.rotation;
                ctx.save();
                ctx.translate(canvas.width / 2, canvas.height / 2);
                ctx.rotate((randomRotation * Math.PI) / 180);
                ctx.translate(-viewport.width / 2, -viewport.height / 2);

                // Render PDF page
                await page.render({
                    canvasContext: ctx,
                    viewport: viewport
                }).promise;

                ctx.restore();

                // Get image data for processing
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // Apply effects
                this.applyColorMode(data, settings.colorMode);
                this.applyBrightnessContrast(data, settings.brightness, settings.contrast);
                this.applyNoise(data, settings.noise);

                ctx.putImageData(imageData, 0, 0);

                // Convert to JPEG
                const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
                const jpegBytes = this.dataUrlToBytes(jpegDataUrl);

                // Add to new PDF
                const image = await scannedDoc.embedJpg(jpegBytes);
                const pdfPage = scannedDoc.addPage([canvas.width / 1.5, canvas.height / 1.5]);
                pdfPage.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: canvas.width / 1.5,
                    height: canvas.height / 1.5
                });
            }

            Progress.update('scan-progress', 95, 'Generating PDF...');

            const pdfBytes = await scannedDoc.save();

            // Store result
            const baseName = this.currentFile.name.replace('.pdf', '');
            this.resultFilename = `${baseName}_scanned.pdf`;
            this.resultData = pdfBytes;

            // Show result
            document.getElementById('scan-result-filename').textContent = this.resultFilename;
            document.getElementById('scan-result-pages').textContent = this.pageCount;
            document.getElementById('scan-result-size').textContent = Utils.formatSize(pdfBytes.length);
            document.getElementById('scan-result').style.display = 'block';

            Progress.hide('scan-progress');
            Toast.success('Scan effect applied - ready to download');

        } catch (error) {
            console.error('Scan effect error:', error);
            Toast.error('Failed to apply scan effect: ' + error.message);
            Progress.hide('scan-progress');
        } finally {
            document.getElementById('scan-btn').disabled = false;
        }
    },

    applyColorMode(data, mode) {
        if (mode === 'color') return;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // Calculate grayscale using luminance formula
            const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

            if (mode === 'grayscale') {
                data[i] = gray;
                data[i + 1] = gray;
                data[i + 2] = gray;
            } else if (mode === 'bw') {
                // Black and white with threshold
                const bw = gray > 128 ? 255 : 0;
                data[i] = bw;
                data[i + 1] = bw;
                data[i + 2] = bw;
            }
        }
    },

    applyBrightnessContrast(data, brightness, contrast) {
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

        for (let i = 0; i < data.length; i += 4) {
            for (let j = 0; j < 3; j++) {
                let value = data[i + j];
                // Apply brightness
                value += brightness * 2.55;
                // Apply contrast
                value = factor * (value - 128) + 128;
                // Clamp
                data[i + j] = Math.max(0, Math.min(255, Math.round(value)));
            }
        }
    },

    applyNoise(data, noiseLevel) {
        if (noiseLevel === 0) return;

        const intensity = noiseLevel * 50;

        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * intensity;
            data[i] = Math.max(0, Math.min(255, data[i] + noise));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
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

    downloadResult() {
        if (this.resultData && this.resultFilename) {
            Utils.downloadFile(this.resultData, this.resultFilename);
            Toast.success('Download started');
        }
    }
};
