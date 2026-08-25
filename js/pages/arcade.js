// ============================================================
// Página ARCADE - Pacman embebido + Leaderboard
// El juego corre en un iframe aislado y envía el score vía postMessage.
// ============================================================

import { showToast } from '../components/toast.js';

const SCORES_KEY = 'burgame_scores';

export function renderArcadePage() {
    const container = document.createElement('div');
    container.className = 'arcade-page';

    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>🕹️ ARCADE BURGAME</h1>
                <p>El único que no es un juego... excepto este.</p>
            </div>
        </header>

        <div class="arcade-layout">
            <!-- Columna izquierda: juego -->
            <div class="arcade-game-section">
                <div class="arcade-game-wrapper" id="arcade-game-wrapper">
                    <div class="arcade-game-placeholder" id="arcade-placeholder">
                        <div class="arcade-logo">👾</div>
                        <h2 class="arcade-title">PAC-MAN</h2>
                        <p class="arcade-subtitle">Comé todos los puntos, esquivá los fantasmas.</p>
                        <button class="btn btn--primary arcade-play-btn" id="btn-play-pacman">
                            ▶️ JUGAR
                        </button>
                    </div>
                    <iframe
                        id="pacman-iframe"
                        class="arcade-iframe"
                        src=""
                        data-src="pacman/pacman-game.html"
                        allowfullscreen
                    ></iframe>
                </div>

                <div class="arcade-controls">
                    <button class="btn btn--secondary" id="btn-arcade-close">✕ Cerrar juego</button>
                </div>
            </div>

            <!-- Columna derecha: leaderboard -->
            <div class="arcade-leaderboard">
                <h3 class="arcade-leaderboard__title">🏆 HIGH SCORES</h3>
                <div id="arcade-scores-list" class="arcade-scores-list">
                    <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div></div>
                </div>
            </div>
        </div>
    `;

    setupArcade(container);
    renderScores(container);

    return container;
}

function setupArcade(container) {
    const placeholder = container.querySelector('#arcade-placeholder');
    const iframe = container.querySelector('#pacman-iframe');
    const playBtn = container.querySelector('#btn-play-pacman');
    const closeBtn = container.querySelector('#btn-arcade-close');

    function startGame() {
        placeholder.style.display = 'none';
        iframe.style.display = 'block';
        if (!iframe.src || iframe.src === window.location.href) {
            iframe.src = iframe.dataset.src;
        }
    }

    function stopGame() {
        iframe.src = '';
        iframe.style.display = 'none';
        placeholder.style.display = 'flex';
    }

    playBtn?.addEventListener('click', startGame);
    closeBtn?.addEventListener('click', stopGame);
}

// ============================================================
// Leaderboard (localStorage) - compatible con burgame-web
// ============================================================
function getScores() {
    let scores = JSON.parse(localStorage.getItem(SCORES_KEY) || '[]');
    if (scores.length === 0) {
        scores = [
            { initials: 'BRG', score: 10000 },
            { initials: 'LVL', score: 5000 },
            { initials: 'PAC', score: 2500 }
        ];
        localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
    }
    return scores;
}

function saveScore(initials, score) {
    let scores = getScores();
    scores.push({ initials: initials.substring(0, 3), score: parseInt(score, 10) });
    scores.sort((a, b) => b.score - a.score);
    scores = scores.slice(0, 5);
    localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
}

function renderScores(container) {
    const listEl = container.querySelector('#arcade-scores-list');
    if (!listEl) return;

    const scores = getScores();
    if (scores.length === 0) {
        listEl.innerHTML = '<p class="empty-text">Aún no hay puntajes. ¡Sé el primero!</p>';
        return;
    }

    listEl.innerHTML = scores.map((s, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
        return `
            <div class="arcade-score-row ${i === 0 ? 'arcade-score-row--top' : ''}">
                <span class="arcade-score-rank">${medal}</span>
                <span class="arcade-score-initials">${s.initials}</span>
                <span class="arcade-score-value">${s.score.toLocaleString()}</span>
            </div>
        `;
    }).join('');
}

// ============================================================
// Listener global para recibir scores del iframe
// Se registra una sola vez al cargar el módulo.
// ============================================================
let _scoreListenerRegistered = false;

function ensureScoreListener() {
    if (_scoreListenerRegistered) return;
    _scoreListenerRegistered = true;

    window.addEventListener('message', (e) => {
        if (e.data && e.data.type === 'BURGAME_SCORE') {
            saveScore(e.data.initials, e.data.score);
            // Si la página del arcade está visible, actualizar el leaderboard
            const listEl = document.querySelector('#arcade-scores-list');
            if (listEl) {
                // Re-renderizar la lista desde el container actual
                const container = document.querySelector('.arcade-page');
                if (container) renderScores(container);
            }
            showToast({ message: `¡Puntaje guardado! ${e.data.initials} - ${e.data.score}`, type: 'success' });
        }
    });
}

ensureScoreListener();
