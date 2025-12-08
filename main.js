const worker = new Worker('worker.js', { type: 'module' });

const els = {
    fileInput: document.getElementById('file-input'),
    uploadArea: document.getElementById('upload-area'),
    statusContainer: document.getElementById('status-container'),
    statusText: document.getElementById('status-text'),
    statusPercent: document.getElementById('status-percent'),
    progressBar: document.getElementById('progress-bar'),
    resultArea: document.getElementById('output-area'),
    resultText: document.getElementById('result-text'),
    settingsBtn: document.getElementById('settings-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    modelSelect: document.getElementById('model-select'),
    langSelect: document.getElementById('language-select'),
    timestampsCheck: document.getElementById('timestamps-check'),
    fp32Check: document.getElementById('fp32-check'),
};

let isBusy = false;

// Переключение настроек
els.settingsBtn.addEventListener('click', () => {
    els.settingsPanel.classList.toggle('hidden');
});

// Drag & Drop
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    els.uploadArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

els.uploadArea.addEventListener('dragover', () => els.uploadArea.classList.add('border-blue-400', 'bg-slate-50'));
els.uploadArea.addEventListener('dragleave', () => els.uploadArea.classList.remove('border-blue-400', 'bg-slate-50'));
els.uploadArea.addEventListener('drop', (e) => {
    els.uploadArea.classList.remove('border-blue-400', 'bg-slate-50');
    handleFiles(e.dataTransfer.files);
});

els.fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

async function handleFiles(files) {
    if (files.length === 0 || isBusy) return;
    const file = files[0];
    
    startProcess();
    
    try {
        updateStatus('Чтение аудиофайла...', 5);
        const audio = await readAudio(file);
        
        updateStatus('Инициализация модели...', 15);
        
        worker.postMessage({
            type: 'load',
            model: els.modelSelect.value,
            useFp32: els.fp32Check.checked
        });

        worker.currentAudioData = audio;

    } catch (e) {
        showError('Не удалось прочитать файл. Проверьте формат аудио.');
    }
}

worker.addEventListener('message', (e) => {
    const { status, data, file, progress } = e.data;

    if (status === 'progress') {
        // Округляем до целого для красоты
        const p = Math.round(progress);
        els.statusText.textContent = `Загрузка: ${file}`;
        els.statusPercent.textContent = `${p}%`;
        els.progressBar.style.width = `${p}%`;
    }
    
    if (status === 'loading') {
        updateStatus(data, 40);
    }
    
    if (status === 'info') {
        updateStatus(data, 45, true);
    }

    if (status === 'ready') {
        updateStatus('Запуск расшифровки...', 60);
        
        worker.postMessage({
            type: 'run',
            audio: worker.currentAudioData,
            language: els.langSelect.value,
            timestamps: els.timestampsCheck.checked
        });
    }

    if (status === 'working') {
         updateStatus('Обработка аудио...', 80, true);
    }

    if (status === 'complete') {
        finishProcess(data);
    }

    if (status === 'error') {
        showError(data);
    }
});

function startProcess() {
    isBusy = true;
    els.statusContainer.classList.remove('hidden');
    els.resultArea.classList.add('hidden');
    els.resultArea.classList.remove('opacity-100');
    els.resultText.innerHTML = '';
}

function updateStatus(text, percent, pulse = false) {
    els.statusText.textContent = text;
    els.statusPercent.textContent = `${percent}%`;
    els.progressBar.style.width = `${percent}%`;
    if (pulse) {
        els.progressBar.classList.add('animate-pulse');
    } else {
        els.progressBar.classList.remove('animate-pulse');
    }
}

function finishProcess(data) {
    isBusy = false;
    els.statusContainer.classList.add('hidden');
    els.resultArea.classList.remove('hidden');
    
    // Небольшая задержка для плавного появления
    setTimeout(() => {
        els.resultArea.classList.add('opacity-100');
    }, 50);
    
    let text = '';
    if (typeof data === 'string') {
        text = data;
    } else if (Array.isArray(data)) {
        text = data.map(chunk => {
            const [start, end] = chunk.timestamp;
            return `<span class="text-blue-400 text-xs select-none">[${formatTime(start)} - ${formatTime(end)}]</span> ${chunk.text}`;
        }).join('\n');
    } else {
        text = data.text;
    }
    
    els.resultText.innerHTML = text; // innerHTML для цветных таймкодов
}

function showError(msg) {
    isBusy = false;
    els.statusContainer.classList.add('hidden');
    alert('Произошла ошибка: ' + msg);
}

async function readAudio(file) {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer.getChannelData(0);
}

function formatTime(s) {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}
