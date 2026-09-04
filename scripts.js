(() => {
  'use strict';

  const CONFIG = Object.freeze({
    selectedWorkoutStorageKey: 'meusTreinos.selectedWorkout',
    storageKey: 'meusTreinos.data',
    datasetVersion: 'workoutsDataVersion',
    excludeWeightWorkouts: new Set(['T', 'H']),
    fadeInMs: 180,
    debounceMs: 80,
    timerTickMs: 250,
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
    get: (key) => { try { return localStorage.getItem(key); } catch { return null; } },
    set: (key, value) => { try { localStorage.setItem(key, value); } catch { } },
    remove: (key) => { try { localStorage.removeItem(key); } catch { } },
  };

  const STORAGE = loadPersisted();
  let DATASET = null;
  const TIMERS = new Map();

  function loadPersisted() {
    const raw = storage.get(CONFIG.storageKey);
    if (!raw) return { weights: {}, history: {}, timers: {} };
    try {
      const parsed = JSON.parse(raw);
      return { weights: parsed.weights || {}, history: parsed.history || {}, timers: parsed.timers || {} };
    } catch {
      return { weights: {}, history: {}, timers: {} };
    }
  }

  function savePersisted() {
    storage.set(CONFIG.storageKey, JSON.stringify(STORAGE));
  }

  function uniqueExerciseId(workoutId, title) {
    return `${workoutId}::${text.normalize(title)}`;
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(value) {
    return (value ?? '').toString()
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function parseSecondsFromInterval(value) {
    const v = text.normalize(value);
    if (!v || v.includes('nonstop')) return 0;
    const range = v.match(/(\d+)\s*(?:a| até |-)\s*(\d+)/i);
    if (range) return parseInt(range[1], 10);
    const m = v.match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function formatTime(totalSeconds) {
    const s = Math.max(0, Math.round(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  }

  function buildSparkline(values, width = 60, height = 20, stroke = '#7bed9f') {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pts = values.map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" aria-hidden="true">
      <polyline fill="none" stroke="${stroke}" stroke-width="2" points="${pts}" />
    </svg>`;
  }

  function persistSelection(value) {
    storage.set(CONFIG.selectedWorkoutStorageKey, value);
    const hash = `#workout-${value}`;
    if (location.hash !== hash) history.replaceState(null, '', hash);
  }

  function getSelectedWorkout() {
    const select = dom.byId('workout-tabs');
    return select?.querySelector('[aria-selected="true"]')?.dataset.value || '';
  }

  function findWorkout(value) {
    return DATASET?.workouts?.find(w => w.id === value) || null;
  }

  function getWorkouts() {
    return DATASET?.workouts || [];
  }

  function resolveInitialWorkoutValue() {
    const hash = location.hash.replace('#workout-', '');
    const ids = getWorkouts().map(w => w.id);
    if (ids.includes(hash)) return hash;
    const stored = storage.get(CONFIG.selectedWorkoutStorageKey);
    if (ids.includes(stored)) return stored;
    return ids[0] || '';
  }

  function renderTabs(selectedValue) {
    const nav = dom.byId('workout-tabs');
    if (!nav) return;
    nav.innerHTML = getWorkouts().map((w, i) => `
      <button
        class="workout-tab${w.id === selectedValue ? ' workout-tab--active' : ''}"
        role="tab"
        aria-selected="${w.id === selectedValue ? 'true' : 'false'}"
        data-value="${escapeHtml(w.id)}"
        id="tab-${escapeHtml(w.id)}"
        tabindex="${w.id === selectedValue ? '0' : '-1'}"
        aria-controls="panel-${escapeHtml(w.id)}"
      >
        <span class="workout-tab__short">${escapeHtml(w.label.split(' - ')[0] || w.label)}</span>
        <span class="workout-tab__full">${escapeHtml(w.label)}</span>
      </button>
    `).join('');

    nav.querySelectorAll('.workout-tab').forEach(btn => {
      btn.addEventListener('click', () => showWorkout(btn.dataset.value));
    });
  }

  function detailByLabel(card, label) {
    return (card.details || []).find(d => d.label === label)?.value || '';
  }

  function getWeightHistory(exerciseId) {
    return (STORAGE.history[exerciseId] || []).slice().reverse();
  }

  function renderWeightBlock(exerciseId, title, workoutValue) {
    const hasWeight = !CONFIG.excludeWeightWorkouts.has(workoutValue);
    if (!hasWeight) return '';

    const current = STORAGE.weights[exerciseId] ?? '';
    const history = getWeightHistory(exerciseId);
    const trendValues = history.map(h => parseFloat(h.value) || 0).slice(0, 12).reverse();
    const sparkline = buildSparkline(trendValues);

    const historyRows = history.map((h, idx) => `
      <div class="history-row">
        <span class="history-date">${formatDate(h.date)}</span>
        <span class="history-weight">${h.value} kg</span>
        ${h.delta ? `<span class="history-delta ${h.delta > 0 ? 'history-delta--up' : 'history-delta--down'}">${h.delta > 0 ? '+' : ''}${h.delta.toFixed(1)} kg</span>` : '<span class="history-delta">—</span>'}
        <button type="button" class="history-delete" data-history-idx="${idx}" aria-label="Remover registro de ${formatDate(h.date)}">×</button>
      </div>
    `).join('');

    return `
      <div class="exercise-section">
        <div class="section-title">Carga</div>
        <div class="weight-control">
          <button type="button" class="step-btn" data-step="-0.5" aria-label="Diminuir carga em 0,5 kg">−</button>
          <input
            type="number"
            inputmode="decimal"
            step="0.5"
            min="0"
            class="weight-input"
            id="weight-${escapeHtml(exerciseId)}"
            value="${escapeHtml(current)}"
            placeholder="0"
            aria-label="Carga em kg para ${escapeHtml(title)}"
          />
          <button type="button" class="step-btn" data-step="0.5" aria-label="Aumentar carga em 0,5 kg">+</button>
          <button type="button" class="save-weight-btn" data-exercise="${escapeHtml(exerciseId)}">Salvar</button>
        </div>
        <div class="weight-history">
          <button type="button" class="history-toggle" aria-expanded="false" aria-controls="history-${escapeHtml(exerciseId)}">
            Histórico (${history.length})
          </button>
          <div id="history-${escapeHtml(exerciseId)}" class="history-body" hidden>
            ${history.length ? `<div class="history-list">${historyRows}</div>${sparkline}` : '<p class="history-empty">Nenhum registro ainda.</p>'}
          </div>
        </div>
      </div>
    `;
  }

  function renderTimerBlock(exerciseId, intervalSeconds) {
    const saved = STORAGE.timers[exerciseId];
    const elapsed = saved ? saved.elapsed : 0;
    const running = saved ? saved.running : false;
    const mode = saved?.mode || 'stopwatch';
    const target = intervalSeconds > 0 ? intervalSeconds : 60;

    const countdownOptions = intervalSeconds > 0
      ? [{ label: 'Intervalo', value: intervalSeconds }]
      : [];

    return `
      <div class="exercise-section">
        <div class="section-title">Tempo</div>
        <div class="timer" data-timer="${escapeHtml(exerciseId)}" data-mode="${mode}">
          <div class="timer-display" aria-live="polite">${formatTime(elapsed)}</div>
          <div class="timer-mode" ${countdownOptions.length ? '' : 'hidden'}>
            <label class="timer-mode__label">
              <input type="checkbox" class="timer-mode__toggle" ${mode === 'countdown' ? 'checked' : ''}>
              <span>Countdown ${target}s</span>
            </label>
          </div>
          <div class="timer-controls">
            <button type="button" class="timer-btn timer-btn--play" data-action="play" aria-label="Iniciar">▶</button>
            <button type="button" class="timer-btn timer-btn--pause" data-action="pause" aria-label="Pausar">⏸</button>
            <button type="button" class="timer-btn timer-btn--reset" data-action="reset" aria-label="Zerar">↺</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderCard(card, workoutValue, index) {
    const exerciseId = uniqueExerciseId(workoutValue, card.title);
    const title = escapeHtml(card.title);
    const img = card.image?.src
      ? `<img src="${escapeHtml(card.image.src)}" alt="${escapeHtml(card.image.alt || card.title)}" class="exercise-image" loading="lazy" decoding="async">`
      : '';

    const badges = (card.details || []).map(d => `
      <div class="badge" title="${escapeHtml(d.label)}: ${escapeHtml(d.value)}">
        <span class="badge__label">${escapeHtml(d.label.split('/')[0])}</span>
        <span class="badge__value">${escapeHtml(d.value)}</span>
      </div>
    `).join('');

    const notes = (card.notes || []).length
      ? `<div class="notes"><p class="notes-title">Orientações</p><ul>${(card.notes || []).map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>`
      : '';

    const youtube = card.youtubeUrl
      ? `<a href="${escapeHtml(card.youtubeUrl)}" target="_blank" rel="noopener noreferrer" class="youtube-link">
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>
          <span>Assistir</span>
        </a>`
      : '';

    const intervalSeconds = parseSecondsFromInterval(detailByLabel(card, 'Intervalo'));

    return `
      <article class="exercise-card" data-card-type="${escapeHtml(card.type || 'info')}" id="card-${escapeHtml(exerciseId)}">
        ${img}
        <div class="exercise-card__body">
          <div class="exercise-card__header">
            <div>
              <h3 class="exercise-title">${title}</h3>
              ${badges ? `<div class="badges">${badges}</div>` : ''}
            </div>
            ${youtube}
          </div>
          ${notes}
          ${card.type === 'exercise' ? renderWeightBlock(exerciseId, card.title, workoutValue) : ''}
          ${card.type === 'exercise' ? renderTimerBlock(exerciseId, intervalSeconds) : ''}
        </div>
      </article>
    `;
  }

  function renderWorkout(workoutValue) {
    const container = dom.byId('workout-content');
    const workout = findWorkout(workoutValue);
    if (!container || !workout) {
      if (container) container.innerHTML = '<p class="empty-state">Treino não encontrado.</p>';
      return;
    }

    const cards = (workout.cards || []).map((card, i) => renderCard(card, workoutValue, i)).join('');
    container.innerHTML = `
      <div class="workout-panel" id="panel-${escapeHtml(workoutValue)}" role="tabpanel" aria-labelledby="tab-${escapeHtml(workoutValue)}">
        <h2 class="workout-title">${escapeHtml(workout.label)}</h2>
        <div class="exercises-list">${cards}</div>
      </div>
    `;

    fadeIn(container);
    bindWeightControls(workoutValue);
    bindTimerControls(workoutValue);
    restoreTimerDisplays(workoutValue);
  }

  function fadeIn(el) {
    el.style.opacity = '0';
    el.style.transition = `opacity ${CONFIG.fadeInMs}ms ease`;
    window.setTimeout(() => { el.style.opacity = '1'; }, 20);
  }

  function bindWeightControls(workoutValue) {
    const container = dom.byId('workout-content');
    if (!container) return;

    container.querySelectorAll('.weight-control').forEach(ctrl => {
      const input = ctrl.querySelector('.weight-input');
      const exerciseId = input.id.replace('weight-', '');

      ctrl.querySelectorAll('.step-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const step = parseFloat(btn.dataset.step) || 0;
          const current = parseFloat(input.value) || 0;
          const next = Math.max(0, Math.round((current + step) * 2) / 2);
          input.value = next;
        });
      });

      const saveBtn = ctrl.querySelector('.save-weight-btn');
      saveBtn.addEventListener('click', () => saveWeight(exerciseId, input.value));
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveWeight(exerciseId, input.value); });

      const toggle = ctrl.parentElement.querySelector('.history-toggle');
      const body = ctrl.parentElement.querySelector('.history-body');
      if (toggle && body) {
        toggle.addEventListener('click', () => {
          const open = toggle.getAttribute('aria-expanded') === 'true';
          toggle.setAttribute('aria-expanded', String(!open));
          body.hidden = open;
        });
      }

      ctrl.parentElement.querySelectorAll('.history-delete').forEach(btn => {
        btn.addEventListener('click', () => deleteHistoryEntry(exerciseId, parseInt(btn.dataset.historyIdx, 10), workoutValue));
      });
    });
  }

  function saveWeight(exerciseId, rawValue) {
    const value = parseFloat((rawValue || '').toString().replace(',', '.'));
    if (Number.isNaN(value) || value < 0) return;

    const previous = parseFloat(STORAGE.weights[exerciseId]);
    STORAGE.weights[exerciseId] = value;
    if (!STORAGE.history[exerciseId]) STORAGE.history[exerciseId] = [];

    const entry = { date: new Date().toISOString(), value };
    if (!Number.isNaN(previous)) {
      const delta = Math.round((value - previous) * 10) / 10;
      if (Math.abs(delta) > 0) entry.delta = delta;
    }

    if (!Number.isNaN(previous) && Math.abs(value - previous) < 0.05) {
      savePersisted();
      return;
    }

    STORAGE.history[exerciseId].unshift(entry);
    if (STORAGE.history[exerciseId].length > 50) STORAGE.history[exerciseId].pop();
    savePersisted();

    const workoutValue = getSelectedWorkout();
    renderWorkout(workoutValue);
  }

  function deleteHistoryEntry(exerciseId, idx, workoutValue) {
    if (!STORAGE.history[exerciseId]) return;
    STORAGE.history[exerciseId].splice(idx, 1);
    savePersisted();
    renderWorkout(workoutValue);
  }

  function restoreTimerDisplays(workoutValue) {
    const workout = findWorkout(workoutValue);
    if (!workout) return;
    (workout.cards || []).forEach(card => {
      if (card.type !== 'exercise') return;
      const exerciseId = uniqueExerciseId(workoutValue, card.title);
      const saved = STORAGE.timers[exerciseId];
      const timerEl = dom.one(`.timer[data-timer="${CSS.escape(exerciseId)}"]`, dom.byId('workout-content'));
      if (timerEl && saved) {
        timerEl.dataset.mode = saved.mode || 'stopwatch';
        timerEl.querySelector('.timer-display').textContent = formatTime(saved.elapsed || 0);
        const toggle = timerEl.querySelector('.timer-mode__toggle');
        if (toggle) toggle.checked = saved.mode === 'countdown';
        updateTimerButtonStates(timerEl, saved.running || false);
      }
    });
  }

  function bindTimerControls(workoutValue) {
    const container = dom.byId('workout-content');
    if (!container) return;

    container.querySelectorAll('.timer').forEach(timerEl => {
      const exerciseId = timerEl.dataset.timer;
      timerEl.querySelectorAll('button[data-action]').forEach(btn => {
        btn.addEventListener('click', () => handleTimerAction(exerciseId, btn.dataset.action, timerEl));
      });
      const toggle = timerEl.querySelector('.timer-mode__toggle');
      if (toggle) {
        toggle.addEventListener('change', () => {
          const mode = toggle.checked ? 'countdown' : 'stopwatch';
          const saved = STORAGE.timers[exerciseId] || { elapsed: 0, running: false };
          saved.mode = mode;
          STORAGE.timers[exerciseId] = saved;
          timerEl.dataset.mode = mode;
          if (mode === 'countdown') saved.elapsed = saved.elapsed || getDefaultCountdown(exerciseId);
          savePersisted();
          updateTimerDisplay(exerciseId, timerEl);
        });
      }
    });
  }

  function getDefaultCountdown(exerciseId) {
    const workoutValue = getSelectedWorkout();
    const workout = findWorkout(workoutValue);
    if (!workout) return 60;
    const card = (workout.cards || []).find(c => uniqueExerciseId(workoutValue, c.title) === exerciseId);
    const seconds = parseSecondsFromInterval(detailByLabel(card || {}, 'Intervalo'));
    return seconds > 0 ? seconds : 60;
  }

  function handleTimerAction(exerciseId, action, timerEl) {
    if (action === 'reset') {
      const mode = (STORAGE.timers[exerciseId]?.mode) || timerEl.dataset.mode || 'stopwatch';
      const target = mode === 'countdown' ? getDefaultCountdown(exerciseId) : 0;
      STORAGE.timers[exerciseId] = { elapsed: target, running: false, mode };
      savePersisted();
      TIMERS.delete(exerciseId);
      updateTimerDisplay(exerciseId, timerEl);
      updateTimerButtonStates(timerEl, false);
      return;
    }

    if (!STORAGE.timers[exerciseId]) {
      STORAGE.timers[exerciseId] = { elapsed: 0, running: false, mode: timerEl.dataset.mode || 'stopwatch' };
    }

    if (action === 'play') {
      const state = STORAGE.timers[exerciseId];
      state.running = true;
      state.startedAt = Date.now() - (state.elapsed * 1000);
      if (state.mode === 'countdown') {
        state.startedAt = Date.now() + ((state.elapsed) * 1000);
        state.target = state.elapsed;
      }
      savePersisted();
      TIMERS.set(exerciseId, { timerEl });
      updateTimerButtonStates(timerEl, true);
    } else if (action === 'pause') {
      const state = STORAGE.timers[exerciseId];
      state.running = false;
      savePersisted();
      TIMERS.delete(exerciseId);
      updateTimerButtonStates(timerEl, false);
    }
  }

  function updateTimerButtonStates(timerEl, running) {
    if (!timerEl) return;
    const play = timerEl.querySelector('[data-action="play"]');
    const pause = timerEl.querySelector('[data-action="pause"]');
    if (play) play.disabled = running;
    if (pause) pause.disabled = !running;
  }

  function updateTimerDisplay(exerciseId, timerEl) {
    const state = STORAGE.timers[exerciseId];
    if (!state || !timerEl) return;
    const display = timerEl.querySelector('.timer-display');
    if (!display) return;

    let elapsed = state.elapsed;
    if (state.running) {
      const now = Date.now();
      if (state.mode === 'countdown') {
        elapsed = Math.max(0, Math.round((state.startedAt - now) / 1000));
      } else {
        elapsed = Math.round((now - state.startedAt) / 1000);
      }
      state.elapsed = elapsed;
    }

    display.textContent = formatTime(elapsed);
    if (state.mode === 'countdown' && elapsed === 0 && state.running) {
      state.running = false;
      TIMERS.delete(exerciseId);
      updateTimerButtonStates(timerEl, false);
      savePersisted();
      if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
    }
  }

  function tickTimers() {
    TIMERS.forEach(({ timerEl }, exerciseId) => updateTimerDisplay(exerciseId, timerEl));
    savePersisted();
  }

  function showWorkout(value) {
    persistSelection(value);
    renderTabs(value);
    renderWorkout(value);
    const activeTab = dom.one(`.workout-tab[data-value="${CSS.escape(value)}"]`, dom.byId('workout-tabs'));
    if (activeTab) activeTab.scrollIntoView({ inline: 'center', behavior: 'smooth' });
  }

  async function loadDataset() {
    if (window.WORKOUTS_DATA && Array.isArray(window.WORKOUTS_DATA.workouts)) {
      DATASET = window.WORKOUTS_DATA;
      return;
    }
    const res = await fetch('workouts.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Falha ao carregar workouts.json');
    const data = await res.json();
    if (!data || !Array.isArray(data.workouts)) throw new Error('workouts.json inválido');
    DATASET = data;
  }

  function migrateOldWeightStorage() {
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith('exerciseWeightKg:')) {
          const [, workout, title] = key.split(':');
          const value = localStorage.getItem(key);
          if (value) {
            const exerciseId = uniqueExerciseId(workout, title);
            STORAGE.weights[exerciseId] = parseFloat(value) || 0;
          }
          localStorage.removeItem(key);
        }
      }
      savePersisted();
    } catch { }
  }

  async function init() {
    await loadDataset();
    migrateOldWeightStorage();
    const initial = resolveInitialWorkoutValue();
    showWorkout(initial);
    window.setInterval(tickTimers, CONFIG.timerTickMs);

    window.addEventListener('hashchange', () => {
      const value = location.hash.replace('#workout-', '');
      if (getWorkouts().some(w => w.id === value) && value !== getSelectedWorkout()) {
        showWorkout(value);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch(err => {
      const container = dom.byId('workout-content');
      if (container) container.innerHTML = '<p class="empty-state">Erro ao carregar treinos. Tente recarregar.</p>';
      console.error(err);
    });
  });
})();
