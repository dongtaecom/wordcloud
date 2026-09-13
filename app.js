// Initialize PDF.js worker path default
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// Asynchronously load worker via Blob URL to bypass local file protocol restrictions (CORS)
(async function initPdfWorker() {
    try {
        const response = await fetch('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        pdfjsLib.GlobalWorkerOptions.workerSrc = blobUrl;
    } catch (e) {
        console.warn("Could not load PDF.js worker via Blob URL, falling back to standard CDN path.", e);
    }
})();

// Default Stop Words (Korean and English grammatical particles, numbers, and common prepositions)
const DEFAULT_STOP_WORDS = [
    // Korean
    '은', '는', '이', '가', '을', '를', '의', '에', '와', '과', '으로', '로', '에서', '하다', '이다', 
    '그', '저', '것', '등', '및', '제', '즉', '더', '또는', '혹은', '에 대한', '합니다', '있습니다', 
    '하는', '한', '할', '합니다', '하여', '따라', '통해', '위해', '대한', '대해', '있으며', '있고',
    // English
    'the', 'and', 'a', 'of', 'to', 'in', 'is', 'that', 'it', 'on', 'for', 'as', 'with', 'was', 'at', 
    'by', 'an', 'be', 'this', 'are', 'from', 'or', 'had', 'not', 'but', 'he', 'she', 'they', 'we', 
    'you', 'which', 'their', 'will', 'can', 'about', 'also', 'has', 'have', 'more', 'only', 'other', 
    'into', 'been', 'who', 'when', 'some', 'there', 'their', 'its', 'all', 'out', 'up', 'our', 'up'
];

// Color Palettes Definition
const PALETTES = {
    cyberpunk: ['#ff007f', '#00f0ff', '#9d00ff', '#ffea00', '#ff00aa', '#00ff66'],
    ocean: ['#1e40af', '#3b82f6', '#0d9488', '#2dd4bf', '#06b6d4', '#0284c7'],
    sunset: ['#ef4444', '#f97316', '#f43f5e', '#eab308', '#ec4899', '#db2777'],
    emerald: ['#064e3b', '#10b981', '#84cc16', '#34d399', '#059669', '#15803d'],
    monochrome: ['#ffffff', '#e2e8f0', '#94a3b8', '#64748b', '#475569', '#cbd5e1']
};

// Global App State
const state = {
    uploadedFiles: [],    // Array of parsed files: { name, size, pages, words }
    rawWords: [],         // Combined raw tokens
    wordFreqs: [],        // Sorted array of [word, frequency]
    parseTime: 0
};

// Interactive Canvas View State (Zoom / Pan)
const transformState = {
    scale: 1,
    panX: 0,
    panY: 0,
    isDragging: false,
    startX: 0,
    startY: 0
};

// DOM Cache
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileNameDisplay = document.getElementById('file-name');
const fileMetaDisplay = document.getElementById('file-meta');
const statusDot = document.getElementById('status-dot');
const regenerateBtn = document.getElementById('regenerate-btn');
const downloadBtn = document.getElementById('download-btn');
const clearBtn = document.getElementById('clear-btn');
const topNInput = document.getElementById('top-n-slider');
const topNVal = document.getElementById('top-n-val');
const minLenInput = document.getElementById('min-len-slider');
const minLenVal = document.getElementById('min-len-val');
const excludeNumbersCb = document.getElementById('exclude-numbers');
const stopWordsInput = document.getElementById('stop-words');
const resetStopwordsBtn = document.getElementById('reset-stopwords');
const paletteSelect = document.getElementById('color-palette');
const shapeSelect = document.getElementById('cloud-shape');
const fontSelect = document.getElementById('font-family');
const bgSelect = document.getElementById('bg-color');
const canvasContainer = document.getElementById('canvas-container');
const canvas = document.getElementById('cloud-canvas');
const canvasControls = document.getElementById('canvas-controls');
const zoomIndicator = document.getElementById('zoom-indicator');
const resetViewBtn = document.getElementById('reset-view-btn');
const appOverlay = document.getElementById('app-overlay');
const stateIdle = document.getElementById('state-idle');
const stateLoading = document.getElementById('state-loading');
const loadingTitle = document.getElementById('loading-title');
const loadingSubtitle = document.getElementById('loading-subtitle');
const loadProgress = document.getElementById('load-progress');
const statTotalWords = document.getElementById('stat-total-words');
const statUniqueWords = document.getElementById('stat-unique-words');
const statParseTime = document.getElementById('stat-parse-time');
const topWordsBody = document.getElementById('top-words-body');

// Initialize Events & Setup UI defaults
document.addEventListener('DOMContentLoaded', () => {
    // Fill textareas with default stop words
    stopWordsInput.value = DEFAULT_STOP_WORDS.join(', ');
    
    // Sliders dynamic value updates
    topNInput.addEventListener('input', (e) => {
        topNVal.textContent = e.target.value;
    });
    
    minLenInput.addEventListener('input', (e) => {
        minLenVal.textContent = e.target.value;
    });

    // Auto-update WordCloud when layout settings change (only if data exists)
    [topNInput, minLenInput, excludeNumbersCb, paletteSelect, shapeSelect, fontSelect, bgSelect].forEach(el => {
        el.addEventListener('change', () => {
            if (state.rawWords.length > 0) {
                processAndRender();
            }
        });
    });

    // Also auto-update when sliders are finished dragging
    [topNInput, minLenInput].forEach(el => {
        el.addEventListener('mouseup', () => {
            if (state.rawWords.length > 0) processAndRender();
        });
        el.addEventListener('touchend', () => {
            if (state.rawWords.length > 0) processAndRender();
        });
    });

    // Stop words custom field triggers updates
    stopWordsInput.addEventListener('blur', () => {
        if (state.rawWords.length > 0) processAndRender();
    });

    // Reset Stop Words
    resetStopwordsBtn.addEventListener('click', () => {
        stopWordsInput.value = DEFAULT_STOP_WORDS.join(', ');
        if (state.rawWords.length > 0) processAndRender();
    });

    // File Drop Zone Handling
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const pdfFiles = Array.from(files).filter(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
            if (pdfFiles.length > 0) {
                loadPDFFiles(pdfFiles);
            } else {
                alert('업로드된 파일 중 PDF 형식이 없습니다.');
            }
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadPDFFiles(Array.from(e.target.files));
        }
    });

    // Clear and Reset Workspace Button
    clearBtn.addEventListener('click', clearAllFiles);

    // Manual Redraw Button
    regenerateBtn.addEventListener('click', () => {
        if (state.rawWords.length > 0) {
            processAndRender();
        }
    });

    // Download PNG Button
    downloadBtn.addEventListener('click', downloadWordCloud);

    // Setup Dynamic Viewport Event Listeners (Zoom / Pan)
    setupViewportControls();

    // Resize Canvas on viewport changes
    window.addEventListener('resize', debounce(() => {
        if (state.rawWords.length > 0) {
            processAndRender();
        }
    }, 300));
});

// Helper: Debounce function for resizing
function debounce(func, wait) {
    let timeout;
    return function() {
        const context = this, args = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// Format byte size
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Promise wrapper for FileReader
function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (err) => reject(new Error('파일을 읽는 중에 실패했습니다: ' + err));
        reader.readAsArrayBuffer(file);
    });
}

// 1. Process multiple PDF files asynchronously
async function loadPDFFiles(files) {
    statusDot.className = 'status-indicator processing';
    
    // Show Loading View Overlay
    appOverlay.classList.remove('fade-out');
    stateIdle.classList.add('d-none');
    stateLoading.classList.remove('d-none');

    const startTime = performance.now();
    let loadedCount = 0;
    const totalToLoad = files.length;

    for (let i = 0; i < totalToLoad; i++) {
        const file = files[i];
        loadingTitle.textContent = `PDF 문서를 분석하고 있습니다 (${i + 1}/${totalToLoad})`;
        loadingSubtitle.textContent = `"${file.name}" 텍스트 추출 중...`;
        loadProgress.style.width = `${(i / totalToLoad) * 90}%`;

        try {
            const arrayBuffer = await readFileAsArrayBuffer(file);
            const parsedData = await parseSinglePDF(arrayBuffer, file.name, file.size);
            state.uploadedFiles.push(parsedData);
        } catch (err) {
            console.error(err);
            alert(`"${file.name}" 파싱 도중 에러가 발생했습니다: ` + err.message);
        }
    }

    const endTime = performance.now();
    state.parseTime = ((endTime - startTime) / 1000).toFixed(2);

    // Merge words and update layout
    combineUploadedFiles();
    updateFileInfoUI();
    processAndRender();
}

// 2. Parse a single PDF document
async function parseSinglePDF(arrayBuffer, fileName, fileSize) {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const totalPages = pdf.numPages;
    let extractedText = '';

    for (let i = 1; i <= totalPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        extractedText += pageText + ' ';
    }

    // Tokenize text based on active checkbox
    const includeNumbers = !excludeNumbersCb.checked;
    const regexPattern = includeNumbers 
        ? /[\p{L}\p{N}]+/gu 
        : /[\p{L}]+/gu;

    const words = [];
    let match;
    const normalizedText = extractedText.toLowerCase();
    
    while ((match = regexPattern.exec(normalizedText)) !== null) {
        words.push(match[0]);
    }

    return {
        name: fileName,
        size: fileSize,
        pages: totalPages,
        words: words
    };
}

// Combine all uploaded file tokens
function combineUploadedFiles() {
    state.rawWords = [];
    state.uploadedFiles.forEach(file => {
        state.rawWords = state.rawWords.concat(file.words);
    });
}

// Update file metadata displaying files merged status
function updateFileInfoUI() {
    const fileCount = state.uploadedFiles.length;
    if (fileCount === 0) {
        resetToIdle();
        return;
    }

    const totalSize = state.uploadedFiles.reduce((sum, f) => sum + f.size, 0);
    const totalPages = state.uploadedFiles.reduce((sum, f) => sum + f.pages, 0);

    clearBtn.disabled = false;
    regenerateBtn.disabled = false;
    downloadBtn.disabled = false;
    statusDot.className = 'status-indicator success';

    if (fileCount === 1) {
        fileNameDisplay.textContent = state.uploadedFiles[0].name;
        fileMetaDisplay.textContent = `${formatBytes(totalSize)} · 총 ${totalPages}페이지 · 완료`;
    } else {
        fileNameDisplay.textContent = `${state.uploadedFiles[0].name} 외 ${fileCount - 1}개 PDF 병합`;
        fileMetaDisplay.textContent = `${formatBytes(totalSize)} · 총 ${totalPages}페이지 · 병합 완료`;
    }
}

// Clear files and purge state
function clearAllFiles() {
    state.uploadedFiles = [];
    state.rawWords = [];
    state.wordFreqs = [];
    state.parseTime = 0;
    
    clearBtn.disabled = true;
    regenerateBtn.disabled = true;
    downloadBtn.disabled = true;

    // Reset Zoom/Pan
    resetTransform();

    // Clear Canvas content
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.opacity = 0;

    resetToIdle();
}

// Reset UI state to idle
function resetToIdle() {
    statusDot.className = 'status-indicator idle';
    fileNameDisplay.textContent = '선택된 파일 없음';
    fileMetaDisplay.textContent = 'PDF 파일을 업로드해 주세요';
    appOverlay.classList.remove('fade-out');
    stateIdle.classList.remove('d-none');
    stateLoading.classList.add('d-none');
    canvasControls.classList.add('d-none');
}

// 3. Filter raw words and Render
function processAndRender() {
    if (state.rawWords.length === 0) return;

    // Show Loading
    appOverlay.classList.remove('fade-out');
    stateIdle.classList.add('d-none');
    stateLoading.classList.remove('d-none');
    loadingTitle.textContent = '워드 클라우드를 그리는 중입니다';
    loadingSubtitle.textContent = '레이아웃 계산 중...';
    loadProgress.style.width = '100%';

    setTimeout(() => {
        const topN = parseInt(topNInput.value);
        const minLen = parseInt(minLenInput.value);
        const excludeNumbers = excludeNumbersCb.checked;
        
        // Get custom stop words
        const stopWordsSet = new Set(
            stopWordsInput.value
                .toLowerCase()
                .split(',')
                .map(w => w.trim())
                .filter(w => w.length > 0)
        );

        // Filter and count frequencies
        const freqs = {};
        let filteredCount = 0;

        state.rawWords.forEach(word => {
            if (word.length < minLen) return;
            if (excludeNumbers && /^\d+$/.test(word)) return;
            if (stopWordsSet.has(word)) return;

            freqs[word] = (freqs[word] || 0) + 1;
            filteredCount++;
        });

        // Convert to sorted list of [word, frequency]
        const sortedFreqs = Object.entries(freqs)
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

        state.wordFreqs = sortedFreqs;

        // Take Top N
        const topWords = sortedFreqs.slice(0, topN);

        // Render Dashboard Stats
        renderDashboardStats(sortedFreqs, filteredCount);

        if (topWords.length === 0) {
            canvas.style.opacity = 0;
            loadingTitle.textContent = '시각화할 단어가 없습니다';
            loadingSubtitle.textContent = '필터 옵션을 확인하고 제외 단어를 줄여보세요.';
            return;
        }

        // Draw the Word Cloud
        drawWordCloudCanvas(topWords);
    }, 50); // Timeout to yield UI thread
}

// 4. Render Top 10 Words table
function renderDashboardStats(allSorted, totalFiltered) {
    statTotalWords.textContent = state.rawWords.length.toLocaleString();
    statUniqueWords.textContent = allSorted.length.toLocaleString();
    statParseTime.textContent = `${state.parseTime}초`;

    // Top 10 list
    const top10 = allSorted.slice(0, 10);
    topWordsBody.innerHTML = '';

    if (top10.length === 0) {
        topWordsBody.innerHTML = `<tr><td colspan="5" class="empty-table">조건에 맞는 단어가 없습니다.</td></tr>`;
        return;
    }

    const maxCount = top10[0][1];

    top10.forEach(([word, count], idx) => {
        const ratio = ((count / totalFiltered) * 100).toFixed(2);
        const barWidth = ((count / maxCount) * 100).toFixed(0);
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="rank">#${idx + 1}</td>
            <td class="word">${word}</td>
            <td class="frequency">${count.toLocaleString()}회</td>
            <td>
                <div class="ratio-bar-wrapper">
                    <span class="ratio-text">${ratio}%</span>
                    <div class="ratio-bar-bg">
                        <div class="ratio-bar-fill" style="width: ${barWidth}%"></div>
                    </div>
                </div>
            </td>
            <td>${idx === 0 ? '🏆 최다 빈도' : ''}</td>
        `;
        topWordsBody.appendChild(row);
    });
}

// 5. Draw the word cloud on canvas using WordCloud2
function drawWordCloudCanvas(wordsList) {
    // Reset transforms to default coordinates when building a new cloud layout
    resetTransform();

    // Container dimensions
    const dpr = window.devicePixelRatio || 1;
    const width = canvasContainer.offsetWidth - 10;
    const height = Math.max(480, canvasContainer.offsetHeight - 10);

    // Apply high-res layout dimensions
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    // Do not call ctx.scale(dpr, dpr) as WordCloud2 draws directly on the canvas grid.
    // Instead, passing weightFactor: dpr will scale the font size and positioning grid coordinates.

    // Fetch theme styles
    const paletteKey = paletteSelect.value;
    const palette = PALETTES[paletteKey] || PALETTES.cyberpunk;
    const fontFamily = fontSelect.value;
    const cloudShape = shapeSelect.value;
    const bgColor = bgSelect.value;

    // Normalize weights
    const maxFreq = wordsList[0][1];
    const minFreq = wordsList[wordsList.length - 1][1];
    const minFont = 14;
    const maxFont = Math.min(85, width / 7);

    const mappedWords = wordsList.map(([word, freq]) => {
        let size;
        if (maxFreq === minFreq) {
            size = (minFont + maxFont) / 2;
        } else {
            size = minFont + ((freq - minFreq) / (maxFreq - minFreq)) * (maxFont - minFont);
        }
        return [word, size];
    });

    canvas.addEventListener('wordcloudstop', onWordCloudFinished, { once: true });

    // Execute WordCloud2
    WordCloud(canvas, {
        list: mappedWords,
        fontFamily: fontFamily,
        fontWeight: 'bold',
        color: (word, weight, fontSize, distance, theta) => {
            const paletteIndex = Math.floor((weight - minFont) / (maxFont - minFont) * (palette.length - 1));
            const clampedIndex = Math.max(0, Math.min(palette.length - 1, paletteIndex));
            return palette[clampedIndex];
        },
        backgroundColor: bgColor === 'transparent' ? 'transparent' : bgColor,
        shape: cloudShape,
        gridSize: 8,
        weightFactor: dpr, // Scale font sizes and coordinates by DPR for high-res output
        rotateRatio: 0.3,
        rotationSteps: 2,
        drawOutOfBound: false,
        clearCanvas: true
    });
}

// Callback when cloud layout rendering is finished
function onWordCloudFinished() {
    canvas.style.opacity = 1;
    appOverlay.classList.add('fade-out');
    // Display camera controls floating block
    canvasControls.classList.remove('d-none');
}

// 6. Viewport Panning and Zooming Controllers (CSS 2D transforms)
function setupViewportControls() {
    // 6a. Zoom Controller (Wheel scroll event centered relative to cursor pointer)
    canvasContainer.addEventListener('wheel', (e) => {
        if (state.rawWords.length === 0) return;
        e.preventDefault();

        const zoomIntensity = 0.08;
        const oldScale = transformState.scale;
        
        // Calculate new scale bounds
        if (e.deltaY < 0) {
            transformState.scale *= (1 + zoomIntensity);
        } else {
            transformState.scale /= (1 + zoomIntensity);
        }
        transformState.scale = Math.max(0.25, Math.min(5.0, transformState.scale));

        // Pan adjustments to anchor zoom on cursor position
        const rect = canvasContainer.getBoundingClientRect();
        const cursorX = e.clientX - rect.left - rect.width / 2;
        const cursorY = e.clientY - rect.top - rect.height / 2;
        const ratio = transformState.scale / oldScale;

        transformState.panX = cursorX - (cursorX - transformState.panX) * ratio;
        transformState.panY = cursorY - (cursorY - transformState.panY) * ratio;

        applyTransform();
    }, { passive: false });

    // 6b. Pan Controller (Mouse Drag translation)
    canvasContainer.addEventListener('mousedown', (e) => {
        if (state.rawWords.length === 0 || e.button !== 0) return; // Only left click drag
        transformState.isDragging = true;
        transformState.startX = e.clientX - transformState.panX;
        transformState.startY = e.clientY - transformState.panY;
    });

    window.addEventListener('mousemove', (e) => {
        if (!transformState.isDragging) return;
        transformState.panX = e.clientX - transformState.startX;
        transformState.panY = e.clientY - transformState.startY;
        applyTransform();
    });

    window.addEventListener('mouseup', () => {
        transformState.isDragging = false;
    });

    // 6c. Mobile Touch Support for dragging
    canvasContainer.addEventListener('touchstart', (e) => {
        if (state.rawWords.length === 0 || e.touches.length !== 1) return;
        transformState.isDragging = true;
        const touch = e.touches[0];
        transformState.startX = touch.clientX - transformState.panX;
        transformState.startY = touch.clientY - transformState.panY;
    });

    canvasContainer.addEventListener('touchmove', (e) => {
        if (!transformState.isDragging || e.touches.length !== 1) return;
        const touch = e.touches[0];
        transformState.panX = touch.clientX - transformState.startX;
        transformState.panY = touch.clientY - transformState.startY;
        applyTransform();
    });

    canvasContainer.addEventListener('touchend', () => {
        transformState.isDragging = false;
    });

    // 6d. Reset view floating trigger
    resetViewBtn.addEventListener('click', resetTransform);
}

// Apply transform styles
function applyTransform() {
    canvas.style.transform = `translate(${transformState.panX}px, ${transformState.panY}px) scale(${transformState.scale})`;
    zoomIndicator.textContent = `${Math.round(transformState.scale * 100)}%`;
}

// Reset canvas zoom/pan back to 100% centered coordinates
function resetTransform() {
    transformState.scale = 1;
    transformState.panX = 0;
    transformState.panY = 0;
    applyTransform();
}

// 7. Download original high-quality canvas independent of the viewport zoom/pan
function downloadWordCloud() {
    if (state.wordFreqs.length === 0) return;

    const bgColor = bgSelect.value;
    const originalWidth = canvas.width;
    const originalHeight = canvas.height;

    // Create a temporary layout matching original dimensions to draw background color
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = originalWidth;
    tempCanvas.height = originalHeight;
    const tempCtx = tempCanvas.getContext('2d');

    // Fill background color if NOT transparent
    if (bgColor !== 'transparent') {
        tempCtx.fillStyle = bgColor;
        tempCtx.fillRect(0, 0, originalWidth, originalHeight);
    }

    // Capture canvas representation directly
    // This ignores CSS transform state, giving a crisp full image
    tempCtx.drawImage(canvas, 0, 0);

    const imageURI = tempCanvas.toDataURL('image/png');
    const downloadLink = document.createElement('a');
    
    // Construct aggregated filename
    const safeName = state.uploadedFiles[0].name.replace(/\.pdf$/i, '');
    const finalName = state.uploadedFiles.length === 1 
        ? `${safeName}_wordcloud.png`
        : `${safeName}_merged_wordcloud.png`;

    downloadLink.download = finalName;
    downloadLink.href = imageURI;
    
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}
