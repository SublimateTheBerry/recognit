// Импортируем библиотеку прямо с CDN Hugging Face
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.16.0';

// Отключаем загрузку локальных моделей, используем кэш браузера
env.allowLocalModels = false;

let transcriber = null;
let currentModel = null;

// Слушаем сообщения от main.js
self.addEventListener('message', async (event) => {
    const message = event.data;

    // 1. Инициализация / Смена модели
    if (message.type === 'load') {
        if (transcriber && currentModel === message.model) {
            self.postMessage({ status: 'ready' });
            return;
        }

        try {
            self.postMessage({ status: 'loading', data: 'Загрузка модели...' });
            
            // Загружаем pipeline
            transcriber = await pipeline('automatic-speech-recognition', message.model, {
                progress_callback: (data) => {
                    // Отправляем прогресс загрузки файлов (весов)
                    if (data.status === 'progress') {
                        self.postMessage({ 
                            status: 'progress', 
                            file: data.file, 
                            progress: data.progress 
                        });
                    }
                }
            });

            currentModel = message.model;
            self.postMessage({ status: 'ready' });
        } catch (error) {
            self.postMessage({ status: 'error', data: error.message });
        }
    }

    // 2. Запуск расшифровки
    if (message.type === 'run') {
        if (!transcriber) return;

        try {
            // Настройки генерации
            const options = {
                chunk_length_s: 30, // Разбивка на куски
                stride_length_s: 5,
                language: message.language === 'auto' ? null : message.language,
                task: 'transcribe',
                return_timestamps: message.timestamps, // Таймкоды
                callback_function: (beams) => {
                    // Эта функция вызывается в реальном времени, когда есть частичный результат
                    const decodedText = transcriber.tokenizer.decode(beams[0].output_token_ids, { skip_special_tokens: true });
                    
                    self.postMessage({ 
                        status: 'partial', 
                        data: decodedText 
                    });
                }
            };

            const output = await transcriber(message.audio, options);
            
            self.postMessage({ 
                status: 'complete', 
                data: output 
            });

        } catch (error) {
            self.postMessage({ status: 'error', data: error.message });
        }
    }
});