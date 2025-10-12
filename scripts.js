function updateWorkoutDisplay(workoutValue) {
    // Esconde todos os treinos
    document.querySelectorAll('.workout-content').forEach(workout => {
        workout.style.display = 'none';
    });

    // Mostra o treino selecionado
    const selectedWorkout = document.getElementById('workout-' + workoutValue);
    if (selectedWorkout) {
        selectedWorkout.style.display = 'block';

        // Adiciona uma animação suave de fade in
        selectedWorkout.style.opacity = '0';
        selectedWorkout.style.transition = 'opacity 0.3s ease';
        setTimeout(() => {
            selectedWorkout.style.opacity = '1';
        }, 50);
    }
}

function openModal() {
    document.getElementById('orientationsModal').classList.add('show');
}

function closeModal() {
    document.getElementById('orientationsModal').classList.remove('show');
}

function closeModalOutside(event) {
    if (event.target.id === 'orientationsModal') {
        closeModal();
    }
}

// Fechar modal com tecla ESC
document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
        closeModal();
    }
});

function scrollExercises(direction, workoutId) {
    const grid = document.querySelector(`#${workoutId} .exercises-grid`);
    const cards = grid.querySelectorAll('.exercise-card');

    if (!grid || cards.length === 0) return;

    const cardWidth = cards[0].offsetWidth;
    const cardMargin = 25; // gap entre os cards
    const scrollAmount = cardWidth + cardMargin;

    if (direction === 'prev') {
        grid.scrollBy({
            left: -scrollAmount,
            behavior: 'smooth'
        });
    } else {
        grid.scrollBy({
            left: scrollAmount,
            behavior: 'smooth'
        });
    }

    setTimeout(() => {
        updateScrollButtons(grid);
    }, 500);
}

function updateScrollButtons(grid) {
    if (!grid) return;

    const workoutId = grid.closest('.workout-content').id;
    const prevButton = document.querySelector(`#${workoutId} .scroll-button.prev`);
    const nextButton = document.querySelector(`#${workoutId} .scroll-button.next`);

    if (!prevButton || !nextButton) return;

    if (grid.scrollLeft <= 0) {
        prevButton.style.opacity = '0.3';
        prevButton.style.cursor = 'not-allowed';
    } else {
        prevButton.style.opacity = '1';
        prevButton.style.cursor = 'pointer';
    }

    if (grid.scrollLeft + grid.offsetWidth >= grid.scrollWidth - 1) {
        nextButton.style.opacity = '0.3';
        nextButton.style.cursor = 'not-allowed';
    } else {
        nextButton.style.opacity = '1';
        nextButton.style.cursor = 'pointer';
    }
}

// Função para abrir links do YouTube
function openYoutubeLink(event, url) {
    event.preventDefault();
    
    // Extrai o ID do vídeo da URL
    const videoId = getYoutubeVideoId(url);
    if (!videoId) {
        window.open(url, '_blank');
        return;
    }
    
    // Detecta se é dispositivo móvel
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    
    if (isMobile) {
        // Tenta abrir no app primeiro
        window.location.href = `youtube://video/${videoId}`;
        
        // Se não abrir no app após 500ms, tenta o esquema vnd.youtube
        setTimeout(function() {
            window.location.href = `vnd.youtube:${videoId}`;
            
            // Se ainda não abrir, usa o navegador como fallback após mais 500ms
            setTimeout(function() {
                window.location.href = `https://www.youtube.com/watch?v=${videoId}`;
            }, 500);
        }, 500);
    } else {
        // Em desktop, abre normalmente no navegador
        window.open(`https://www.youtube.com/watch?v=${videoId}`, '_blank');
    }
}

// Função para extrair o ID do vídeo de uma URL do YouTube
function getYoutubeVideoId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

// Inicialização dos componentes
document.addEventListener('DOMContentLoaded', function () {
    // Inicializa os botões de scroll
    const allGrids = document.querySelectorAll('.exercises-grid');
    allGrids.forEach(grid => {
        updateScrollButtons(grid);
        grid.addEventListener('scroll', () => {
            updateScrollButtons(grid);
        });
    });

    // Configura os links do YouTube
    document.querySelectorAll('a[href*="youtube.com"], a[href*="youtu.be"]').forEach(link => {
        link.addEventListener('click', function(e) {
            openYoutubeLink(e, this.href);
        });
    });
});