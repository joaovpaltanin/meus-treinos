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


});