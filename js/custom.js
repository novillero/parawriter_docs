document.addEventListener("DOMContentLoaded", function() {
    // Найдем все изображения на странице
    let images = document.getElementsByTagName("img");
    
    // Инициализируем Viewer.js для каждого изображения
    Array.from(images).forEach(img => {
        new Viewer(img, {
            inline: true,  // Показывать изображение во всплывающем окне
            toolbar: true,  // Отображать панель инструментов
            navbar: true,   // Отображать навигационную панель
            title: true,    // Отображать заголовок изображения
            tooltip: true,  // Отображать подсказки
            movable: true,  // Возможность перемещения изображения
            zoomable: true, // Возможность масштабирования изображения
            rotatable: true, // Возможность поворота изображения
            scalable: true,  // Возможность изменения размера изображения
            transition: true, // Анимация перехода между изображениями
            fullscreen: true, // Полноэкранный режим
            keyboard: true,   // Управление клавиатурой
            url: 'data-src'  // Атрибут для получения исходного изображения
        });
    });
});