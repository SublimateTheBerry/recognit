// Запуск воркера
const worker = new Worker('worker.js', { type: 'module' });

// Элементы UI
const fileInput = document.getElementById('file-input');
const uploadArea = document.getElementById('upload-area');
const statusDiv = document.getElementById('status-bar');
const outputContainer = document.getElementById('output-container');
const outputText = document.getElementById('output-text');
const processingIndicator = document.getElementById('processing-indicator');
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');

// Состояние
let isModelLoading = false;
let isProcessing = false;

// 1. Управление настройками
settingsToggle.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
});

// 2. Обработка Drag & Drop
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('border-blue-500', 'bg-blue-50');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('border-blue-500', 'bg-blue-50');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('border-blue-500', 'bg-blue-50');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processFile(file);
});

// 3. Основная логика запуска
async function processFile(file) {
    if (isProcessing) return;
    
    // Сброс UI
    outputContainer.classList.remove('hidden');
    outputText.textContent = 'Инициализация...';
    processingIndicator.classList.remove('hidden');
    isProcessing = true;

    // Чтение аудио
    const audioData = await readAudio(file);
    
    // Получение настроек
    const model = document.getElementById('model-select').value;
    const language = document.getElementById('language-select').value;
    const timestamps = document.getElementById('timestamps-check').checked;

    // Шаг 1: Загрузка модели (если не загружена)
    worker.postMessage({ type: 'load', model: model });

    // Ждем готовности, затем запускаем
    // (Логика упрощена: воркер сам поймет, загружена ли модель)
    worker.postMessage({ 
        type: 'run', 
        audio: audioData, 
        language: language,
        timestamps: timestamps 
    });
}

// 4. Обработка сообщений от Воркера
worker.addEventListener('message', (e) => {
    const { status, data, file, progress } = e.data;

    if (status === 'progress') {
        // Показываем загрузку весов модели
        statusDiv.classList.remove('hidden');
        statusDiv.textContent = `Загрузка ${file}: ${Math.round(progress)}%`;
    }

    if (status === 'ready') {
        statusDiv.classList.add('hidden');
        outputText.textContent = 'Обработка аудио...';
    }

    if (status === 'partial') {
        // Частичный результат (потоковая передача)
        // Внимание: частичный вывод в текущей версии Transformers.js может быть дерганным
        // Мы просто обновляем текст
       // outputText.textContent = data; // Раскомментируй для риал-тайма
    }

    if (status === 'complete') {
        isProcessing = false;
        processingIndicator.classList.add('hidden');
        
        if (typeof data === 'string') {
             outputText.textContent = data;
        } else if (Array.isArray(data)) {
            // Если включены таймкоды, формат другой
            outputText.innerHTML = data.map(chunk => 
                `<span class="text-xs text-blue-400">[${formatTime(chunk.timestamp[0])} -> ${formatTime(chunk.timestamp[1])}]</span> ${chunk.text}<br>`
            ).join('');
        } else {
             outputText.textContent = data.text;
        }
    }
    
    if (status === 'error') {
        isProcessing = false;
        processingIndicator.classList.add('hidden');
        outputText.textContent = `Ошибка: ${data}`;
        outputText.classList.add('text-red-500');
    }
});

// Хелпер: чтение аудио файла в формат, понятный библиотеке (Float32Array)
async function readAudio(file) {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 16000 });
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    return audioBuffer.getChannelData(0);
}

// Хелпер: форматирование времени
function formatTime(s) {
    if(!s) return "00:00";
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec.toString().padStart(2, '0')}`;
}