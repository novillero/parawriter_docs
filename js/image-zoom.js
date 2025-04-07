$(document).ready(function() {
    handleImageZoom();
    
    // Создаем MutationObserver для отслеживания изменений в DOM
    const observer = new MutationObserver(mutations => {
        mutations.forEach(() => {
            handleImageZoom();
        });
    });

    // Настраиваем наблюдателя для отслеживания вставки и удаления узлов
    observer.observe(document.body, { childList: true, subtree: true });

    // Добавляем обработчики событий для динамически добавляемых элементов
    $('body').on('DOMNodeInserted', function() {
        handleImageZoom();
    });
});

// Функция обработки увеличения изображений
function handleImageZoom() {
    $('img:not([alt="logo"],.no-zoom)').off('click').css({ cursor: 'zoom-in' }).on('click', function() {
        var img = $(this);
        var scale = 1; // Начальный масштаб
        var isDragging = false; // Флаг для отслеживания перетаскивания
        var startX, startY, initialX, initialY; // Переменные для координат

        // Создаем увеличенное изображение
        var bigImg = $('<img class="your-image-class"/>').css({
            'max-width': '100%',
            'max-height': '100%',
            'position': 'fixed',
            'top': '50%',
            'left': '50%',
            'transform': 'translate(-50%, -50%) scale(' + scale + ')',
            'transition': 'transform 0.2s' // Плавный переход при изменении масштаба
        });

        bigImg.attr({
            src: img.attr('src'),
            alt: img.attr('alt'),
            title: img.attr('title')
        });

        // Создаем затемненный фон
        var over = $('<div />').css({
            'height': '100%',
            'width': '100%',
            'background': 'rgba(0,0,0,.82)',
            'position': 'fixed',
            'top': 0,
            'left': 0,
            'opacity': 0.0,
            'cursor': 'zoom-out',
            'z-index': 9999,
            'text-align': 'center'
        }).append(bigImg).off('click').on('click', function(event) {
            if ($(event.target).closest('.your-image-class').length === 0) {
                $(this).fadeOut(300, function() {
                    $(this).remove();
                });
            }
        }).insertAfter(this).animate({
            'opacity': 1
        }, 300);

        // Остановка всплытия события клика на изображении
        bigImg.on('click', function(event) {
            event.stopPropagation(); // Останавливаем всплытие события
        });

        // Обработка изменения масштаба с помощью колесика мыши
        bigImg.on('wheel', function(event) {
            event.preventDefault();
            if (event.originalEvent.deltaY < 0) {
                scale += 0.1; // Увеличиваем масштаб
            } else {
                scale = Math.max(1, scale - 0.1); // Уменьшаем масштаб, но не меньше 1
            }
            $(this).css('transform', 'translate(-50%, -50%) scale(' + scale + ')');
        });

        // Обработка перетаскивания изображения
        bigImg.on('mousedown', function(event) {
            isDragging = true;
            startX = event.clientX;
            startY = event.clientY;
            initialX = parseFloat($(this).css('left')) || 0;
            initialY = parseFloat($(this).css('top')) || 0;
            event.preventDefault(); // Предотвращаем выделение текста
        });

        $(document).on('mousemove', function(event) {
            if (isDragging) {
                var dx = event.clientX - startX;
                var dy = event.clientY - startY;
                bigImg.css({
                    left: initialX + dx + 'px',
                    top: initialY + dy + 'px'
                });
            }
        }).on('mouseup', function() {
            isDragging = false; // Убираем флаг перетаскивания
        });

        // Обработчик для закрытия изображения при клике на затемненный фон
        over.on('click', function(event) {
            if ($(event.target).closest('.your-image-class').length === 0) {
                $(this).fadeOut(300, function() {
                    $(this).remove();
                });
            }
        });

        // Закрытие увеличенного изображения по клавише Esc
        $(document).on('keydown', function(event) {
            if (event.key === "Escape") {
                over.fadeOut(300, function() {
                    $(this).remove();
                });
            }
        });
    });
}