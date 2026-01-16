// PDF Utils - Core Application Logic

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Utility Functions
const Utils = {
    // Format file size
    formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    // Generate unique ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    },

    // Download file
    downloadFile(data, filename, mimeType = 'application/pdf') {
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // Download blob
    downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    // Read file as ArrayBuffer
    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    },

    // Read file as Data URL
    readFileAsDataURL(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    },

    // Parse page range string (e.g., "1, 3, 5-8")
    parsePageRange(rangeStr, maxPages) {
        const pages = new Set();
        const parts = rangeStr.split(',').map(s => s.trim()).filter(s => s);

        for (const part of parts) {
            if (part.includes('-')) {
                const [start, end] = part.split('-').map(n => parseInt(n.trim()));
                if (!isNaN(start) && !isNaN(end)) {
                    for (let i = Math.max(1, start); i <= Math.min(maxPages, end); i++) {
                        pages.add(i);
                    }
                }
            } else {
                const num = parseInt(part);
                if (!isNaN(num) && num >= 1 && num <= maxPages) {
                    pages.add(num);
                }
            }
        }

        return Array.from(pages).sort((a, b) => a - b);
    },

    // Create PDF thumbnail
    async createThumbnail(pdfDoc, pageNum, width = 150) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1 });
        const scale = width / viewport.width;
        const scaledViewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        const context = canvas.getContext('2d');
        await page.render({
            canvasContext: context,
            viewport: scaledViewport
        }).promise;

        return canvas;
    }
};

// Toast Notification System
const Toast = {
    container: document.getElementById('toast-container'),

    show(message, type = 'success', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
            warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>'
        };

        toast.innerHTML = `
            ${icons[type]}
            <span class="toast-message">${message}</span>
            <button class="toast-close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>
        `;

        toast.querySelector('.toast-close').addEventListener('click', () => {
            this.remove(toast);
        });

        this.container.appendChild(toast);

        if (duration > 0) {
            setTimeout(() => this.remove(toast), duration);
        }

        return toast;
    },

    remove(toast) {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    },

    success(message) {
        return this.show(message, 'success');
    },

    error(message) {
        return this.show(message, 'error');
    },

    warning(message) {
        return this.show(message, 'warning');
    }
};

// Progress Bar Management
const Progress = {
    show(containerId, text = 'Processing...') {
        const container = document.getElementById(containerId);
        if (container) {
            container.style.display = 'block';
            container.querySelector('.progress-fill').style.width = '0%';
            container.querySelector('.progress-text').textContent = text;
        }
    },

    update(containerId, percent, text) {
        const container = document.getElementById(containerId);
        if (container) {
            container.querySelector('.progress-fill').style.width = `${percent}%`;
            if (text) {
                container.querySelector('.progress-text').textContent = text;
            }
        }
    },

    hide(containerId) {
        const container = document.getElementById(containerId);
        if (container) {
            container.style.display = 'none';
        }
    }
};

// Drag and Drop Setup
function setupDropZone(dropZoneId, fileInputId, onFilesAdded, options = {}) {
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(fileInputId);

    if (!dropZone || !fileInput) return;

    const { multiple = true, accept = '.pdf' } = options;

    // Click to open file dialog
    dropZone.addEventListener('click', (e) => {
        if (e.target !== fileInput && !e.target.closest('.file-input-label')) {
            fileInput.click();
        }
    });

    // File input change
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        if (files.length > 0) {
            onFilesAdded(files);
            fileInput.value = '';
        }
    });

    // Drag events
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('drag-over');
        });
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('drag-over');
        });
    });

    dropZone.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files);
        const filteredFiles = files.filter(file => {
            if (accept === '.pdf') {
                return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            }
            if (accept === 'image/*') {
                return file.type.startsWith('image/');
            }
            return true;
        });

        if (filteredFiles.length > 0) {
            if (!multiple) {
                onFilesAdded([filteredFiles[0]]);
            } else {
                onFilesAdded(filteredFiles);
            }
        } else {
            Toast.warning('Please drop valid files');
        }
    });
}

// Sortable List Setup
function setupSortableList(containerId, onReorder) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let draggedItem = null;

    container.addEventListener('dragstart', (e) => {
        if (e.target.classList.contains('file-item') || e.target.classList.contains('image-item')) {
            draggedItem = e.target;
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        }
    });

    container.addEventListener('dragend', (e) => {
        if (e.target.classList.contains('file-item') || e.target.classList.contains('image-item')) {
            e.target.classList.remove('dragging');
            draggedItem = null;
            document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
            onReorder();
        }
    });

    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        if (draggedItem) {
            if (afterElement) {
                container.insertBefore(draggedItem, afterElement);
            } else {
                container.appendChild(draggedItem);
            }
        }
    });
}

function getDragAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.file-item:not(.dragging), .image-item:not(.dragging)')];

    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset, element: child };
        }
        return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Navigation
function initNavigation() {
    const navTabs = document.querySelectorAll('.nav-tab');
    const sections = document.querySelectorAll('.section');
    const toolCards = document.querySelectorAll('.tool-card');

    function showSection(tabId) {
        // Update nav tabs
        navTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabId);
        });

        // Show section
        sections.forEach(section => {
            section.classList.toggle('active', section.id === tabId);
        });

        // Scroll to top
        window.scrollTo(0, 0);
    }

    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            showSection(tab.dataset.tab);
        });
    });

    toolCards.forEach(card => {
        card.addEventListener('click', () => {
            showSection(card.dataset.action);
        });
    });
}

// Convert section tabs
function initConvertTabs() {
    const convertTabs = document.querySelectorAll('.convert-tab');
    const convertPanels = document.querySelectorAll('.convert-panel');

    convertTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.convert + '-panel';

            convertTabs.forEach(t => t.classList.toggle('active', t === tab));
            convertPanels.forEach(panel => {
                panel.classList.toggle('active', panel.id === targetId);
            });
        });
    });
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initConvertTabs();

    // Initialize each module
    if (typeof MergeModule !== 'undefined') MergeModule.init();
    if (typeof SplitModule !== 'undefined') SplitModule.init();
    if (typeof CompressModule !== 'undefined') CompressModule.init();
    if (typeof ConvertModule !== 'undefined') ConvertModule.init();

    console.log('PDF Utils initialized');
});
