import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

env.allowLocalModels = false;

// Полифилл для self, на случай странного окружения
if (typeof self === 'undefined') {
    globalThis.self = globalThis;
}

let transcriber = null;
let currentModelId = null;
let currentDevice = null;

self.addEventListener('message', async (event) => {
    const { type, model, audio, language, timestamps, useGpu } = event.data;

    if (type === 'load') {
        const device = useGpu ? 'webgpu' : 'wasm';
        
        if (transcriber && currentModelId === model && currentDevice === device) {
            self.postMessage({ status: 'ready' });
            return;
        }

        try {
            self.postMessage({ status: 'loading', data: 'Загрузка компонентов модели...' });
            
            if (device === 'webgpu') {
                self.postMessage({ status: 'info', data: 'Подготовка графического ускорителя (это может занять время при первом запуске)...' });
            }

            transcriber = await pipeline('automatic-speech-recognition', model, {
                device: device,
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

            currentModelId = model;
            currentDevice = device;
            self.postMessage({ status: 'ready' });

        } catch (error) {
            if (device === 'webgpu') {
                 self.postMessage({ status: 'error', data: `Ошибка запуска WebGPU. Попробуйте отключить ускорение в настройках.` });
            } else {
                 self.postMessage({ status: 'error', data: error.message });
            }
        }
    }

    if (type === 'run') {
        if (!transcriber) return;

        try {
            self.postMessage({ status: 'working', data: 'Идет расшифровка аудио...' });

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
            self.postMessage({ status: 'error', data: `Ошибка при обработке: ${error.message}` });
        }
    }
});
