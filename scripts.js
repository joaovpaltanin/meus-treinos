(() => {
    'use strict';

    const CONFIG = Object.freeze({
        workoutIdPrefix: 'workout-',
        selectedWorkoutStorageKey: 'selectedWorkout',
        weightStoragePrefix: 'exerciseWeightKg',
        excludeWeightWorkouts: new Set(['T', 'H']), // Técnicas/Orientações e Alongamento
        fadeInMs: 300,
        weightSaveDebounceMs: 150,
        workoutsJsonPath: 'workouts.json',
    });

    const dom = {
        byId: (id) => document.getElementById(id),
        one: (sel, root = document) => root.querySelector(sel),
        all: (sel, root = document) => Array.from(root.querySelectorAll(sel)),
    };

    const text = {
        normalize: (value) => (value ?? '')
            .toString()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim(),
    };

    const storage = {
        get: (key) => {
            try { return localStorage.getItem(key); } catch { return null; }
        },
        set: (key, value) => {
            try { localStorage.setItem(key, value); } catch { }
        },
        remove: (key) => {
            try { localStorage.removeItem(key); } catch { }
        },
    };

    /**
     * In-memory dataset loaded from workouts.json
     * Shape: { version: number, workouts: Array<{id,label,cards:Array<...>}> }
     */
    let DATASET = null;

    function workoutKeyFromElement(el) {
        const id = el?.id || '';
        const match = new RegExp(`^${CONFIG.workoutIdPrefix}(.+)$`).exec(id);
        return match ? match[1] : '';
    }

    function fadeIn(el) {
        el.style.opacity = '0';
        el.style.transition = `opacity ${CONFIG.fadeInMs}ms ease`;
        window.setTimeout(() => { el.style.opacity = '1'; }, 50);
    }

    function persistWorkoutSelection(workoutValue) {
        storage.set(CONFIG.selectedWorkoutStorageKey, workoutValue);
        const hash = `#${CONFIG.workoutIdPrefix}${workoutValue}`;
        if (location.hash !== hash) history.replaceState(null, '', hash);
    }

    function weightStorageKey(workoutValue, exerciseTitle) {
        return `${CONFIG.weightStoragePrefix}:${workoutValue}:${text.normalize(exerciseTitle)}`;
    }

    function shouldHaveWeightField(workoutValue) {
        return !!workoutValue && !CONFIG.excludeWeightWorkouts.has(workoutValue);
    }

    function ensureWeightInputsForRenderedWorkout(workoutValue, rootEl) {
        if (!rootEl) return;
        if (!shouldHaveWeightField(workoutValue)) return;

        const cards = dom.all('.exercise-card', rootEl);
        for (const card of cards) {
            if (dom.one('.exercise-weight', card)) continue;

            const titleEl = dom.one('.exercise-title', card);
            const titleText = (titleEl?.textContent || '').trim();
            if (!titleText) continue;

            const block = document.createElement('div');
            block.className = 'exercise-weight';

            const row = document.createElement('div');
            row.className = 'exercise-weight__row';

            const label = document.createElement('label');
            label.className = 'exercise-weight__label';
            label.textContent = 'Peso atual (kg)';

            const input = document.createElement('input');
            input.className = 'exercise-weight__input';
            input.type = 'number';
            input.inputMode = 'decimal';
            input.step = '0.5';
            input.min = '0';
            input.placeholder = 'Ex: 20';
            input.setAttribute('aria-label', `Peso atual em kg para ${titleText}`);

            const key = weightStorageKey(workoutValue, titleText);
            const saved = storage.get(key);
            if (saved) input.value = saved;

            let timer = 0;
            input.addEventListener('input', () => {
                window.clearTimeout(timer);
                timer = window.setTimeout(() => {
                    const v = (input.value || '').toString().trim();
                    if (!v) storage.remove(key);
                    else storage.set(key, v);
                }, CONFIG.weightSaveDebounceMs);
            });

            row.appendChild(label);
            row.appendChild(input);
            block.appendChild(row);

            const content = dom.one('.exercise-content', card) || card;
            content.appendChild(block);
        }
    }

    function focusWorkoutContainer() {
        const container = dom.byId('workout-container');
        if (container) container.focus({ preventScroll: true });
    }

    function resolveInitialWorkoutValue() {
        const select = dom.byId('workout-select');
        if (!select) return '';

        const fromHash = (location.hash || '').replace('#' + CONFIG.workoutIdPrefix, '');
        const candidate = fromHash || storage.get(CONFIG.selectedWorkoutStorageKey) || '';

        if (candidate && Array.from(select.options).some(o => o.value === candidate)) return candidate;
        return select.value || '';
    }

    function escapeHtml(value) {
        return (value ?? '')
            .toString()
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#039;');
    }

    function renderWorkoutIntoContainer(workoutValue) {
        const container = dom.byId('workout-container');
        if (!container) return;

        const workout = DATASET?.workouts?.find(w => w.id === workoutValue) || null;
        if (!workout) {
            container.innerHTML = '';
            return;
        }

        const cardsHtml = (workout.cards || []).map(card => {
            const title = escapeHtml(card.title);
            const img = card.image?.src
                ? `<img src="${escapeHtml(card.image.src)}" alt="${escapeHtml(card.image.alt || card.title)}" class="exercise-image">`
                : '';

            const detailsBlock = (card.details || []).length
                ? `<details class="disclosure" data-default-open="${card.type === 'exercise' ? 'false' : 'true'}">
                      <summary class="disclosure__summary">Detalhes</summary>
                      <div class="disclosure__body">
                        <div class="exercise-details">
                          ${(card.details || []).map(d => `
                            <div class="detail-row">
                              <span class="detail-label">${escapeHtml(d.label)}</span>
                              <span class="detail-value">${escapeHtml(d.value)}</span>
                            </div>
                          `).join('')}
                        </div>
                      </div>
                    </details>`
                : '';

            const notesBlock = (card.notes || []).length
                ? `<details class="disclosure">
                      <summary class="disclosure__summary">Notas</summary>
                      <div class="disclosure__body">
                        <div class="notes">
                          ${(card.notes || []).map(n => `<div class="technique-note">${escapeHtml(n)}</div>`).join('')}
                        </div>
                      </div>
                    </details>`
                : '';

            const youtube = card.youtubeUrl
                ? `<a href="${escapeHtml(card.youtubeUrl)}" target="_blank" rel="noopener noreferrer" class="youtube-btn">
                      <svg class="youtube-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                      </svg>
                      Assistir Vídeo
                  </a>`
                : '';

            return `<div class="exercise-card" data-card-type="${escapeHtml(card.type || 'info')}">
                      ${img}
                      <div class="exercise-content">
                        <h3 class="exercise-title">${title}</h3>
                        ${detailsBlock}
                        ${notesBlock}
                        ${youtube}
                      </div>
                    </div>`;
        }).join('');

        container.innerHTML = `<div class="workout-content">
                                  <div class="carousel-container">
                                    <div class="exercises-carousel">
                                      <div class="exercises-wrapper">
                                        <div class="exercises-grid">${cardsHtml}</div>
                                      </div>
                                    </div>
                                  </div>
                                </div>`;

        fadeIn(container);
    }

    function showWorkout(workoutValue) {
        persistWorkoutSelection(workoutValue);
        renderWorkoutIntoContainer(workoutValue);

        const container = dom.byId('workout-container');
        if (container) {
            ensureWeightInputsForRenderedWorkout(workoutValue, container);
            dom.all('details.disclosure[data-default-open="true"]', container).forEach(d => { d.open = true; });
        }

        focusWorkoutContainer();
    }

    async function loadDataset() {
        // Preferência: dados embutidos (funciona em file:// sem CORS)
        if (window.WORKOUTS_DATA && Array.isArray(window.WORKOUTS_DATA.workouts)) {
            DATASET = window.WORKOUTS_DATA;
            return;
        }

        // Fallback: fetch (quando servido via http)
        const res = await fetch(CONFIG.workoutsJsonPath, { cache: 'no-cache' });
        if (!res.ok) throw new Error(`Falha ao carregar ${CONFIG.workoutsJsonPath}`);
        const data = await res.json();
        if (!data || !Array.isArray(data.workouts)) throw new Error('workouts.json inválido');
        DATASET = data;
    }

    function rebuildSelectOptionsFromDataset(select) {
        if (!select || !DATASET) return;
        select.innerHTML = (DATASET.workouts || [])
            .map(w => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.label)}</option>`)
            .join('');
    }

    async function init() {
        const select = dom.byId('workout-select');
        if (!select) return;

        await loadDataset();
        rebuildSelectOptionsFromDataset(select);

        const initial = resolveInitialWorkoutValue();
        if (initial) select.value = initial;
        showWorkout(select.value);

        select.addEventListener('change', () => {
            showWorkout(select.value);
        });

        // Open disclosures marked as default-open (mainly info cards)
        dom.all('details.disclosure[data-default-open="true"]').forEach(d => { d.open = true; });
    }

    // Compatibilidade (ainda existem onclicks antigos no HTML)
    window.updateWorkoutDisplay = (value) => showWorkout(value);
    window.scrollExercises = () => { };
    window.updateScrollButtons = () => { };

    document.addEventListener('DOMContentLoaded', () => {
        init().catch((e) => {
            // Fail-safe: do not break the page rendering completely
            const container = dom.byId('workout-container');
            if (container) container.innerHTML = '';
            // eslint-disable-next-line no-console
            console.error(e);
        });
    });
})();