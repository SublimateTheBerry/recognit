import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

env.allowLocalModels = false;

if (typeof self === 'undefined') {
    globalThis.self = globalThis;
}

let transcriber = null;
let currentSettings = null; // Храним настройки модели, чтобы знать, надо ли перезагружать

self.addEventListener('message', async (event) => {
    // Добавили useFp32
    const { type, model, audio, language, timestamps, useFp32 } = event.data;

    if (type === 'load') {
        const device = 'webgpu'; // Принудительно ставим WebGPU, раз уж мы боремся за него
        
        // Проверяем, изменилась ли модель или настройки точности (FP32)
        const settingsChanged = !currentSettings || 
                                currentSettings.model !== model || 
                                currentSettings.quantized !== !useFp32;

        if (transcriber && !settingsChanged) {
            self.postMessage({ status: 'ready' });
            return;
        }

        try {
            self.postMessage({ status: 'loading', data: 'Загрузка нейросети (может занять время)...' });
            
            if (device === 'webgpu') {
                self.postMessage({ status: 'info', data: 'Компиляция шейдеров видеокарты...' });
            }

            /* 
               ВАЖНЫЙ МОМЕНТ:
               quantized: false — скачивает полную FP32 модель.
               Это заставляет WebGPU работать на полную.
            */
            transcriber = await pipeline('automatic-speech-recognition', model, {
                device: device,
                quantized: !useFp32, // Если useFp32=true, то quantized=false
                progress_callback: (data) => {
                    if (data.status === 'progress') {
                        self.postMessage({ 
                            status: 'progress', 
                            file: data.file, 
                            progress: data.progress 
                        });
                    }
                }
            });

            currentSettings = { model, quantized: !useFp32 };
            self.postMessage({ status: 'ready' });

        } catch (error) {
            self.postMessage({ status: 'error', data: `Ошибка WebGPU: ${error.message}. Попробуйте модель поменьше или отключите FP32.` });
        }
    }

    if (type === 'run') {
        if (!transcriber) return;

        try {
            self.postMessage({ status: 'working', data: 'Расшифровка на видеокарте...' });

            const options = {
                chunk_length_s: 30,
                stride_length_s: 5,
                language: language === 'auto' ? null : language,
                task: 'transcribe',
                return_timestamps: timestamps,
            };

            const result = await transcriber(audio, options);
            
            self.postMessage({ 
                status: 'complete', 
                data: result 
            });

        } catch (error) {
            self.postMessage({ status: 'error', data: error.message });
        }
    }
});
