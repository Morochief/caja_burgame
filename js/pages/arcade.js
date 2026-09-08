// ============================================================
// Página ARCADE & GAMING ARENA - ENTERPRISE SUITE
// 1. Play Arena: Pacman clásico + modo arcade cabinet + controles
// 2. Torneos Gamer: Gestión de torneos, podios (1º, 2º, 3º) y
//    entrega directa de membresías Club Burgame (0 Gs premio).
// 3. High Scores & Moderación: Ranking, registro de puntajes físicos,
//    moderación admin y tabla de recompensas por score.
// ============================================================

import { showToast } from '../components/toast.js';
import { arcadeService } from '../services/arcade-service.js';
import { customerService } from '../services/customer-service.js';

let _activeTab = 'arena';
let _tournamentsFilter = 'all';
let _customersCache = [];

export function renderArcadePage() {
    const container = document.createElement('div');
    container.className = 'arcade-page';

    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>🕹️ ARCADE & GAMING ARENA</h1>
                <p>Centro de torneos oficiales, gaming recreativo y fidelización de la comunidad Burgame.</p>
            </div>
        </header>

        <!-- KPI Strip Resumen -->
        <div class="arcade-kpi-strip" id="arcade-kpi-strip">
            <div class="arcade-kpi-card">
                <div class="arcade-kpi-icon">🏆</div>
                <div class="arcade-kpi-data">
                    <span class="arcade-kpi-val" id="kpi-tournaments-count">-</span>
                    <span class="arcade-kpi-label">Torneos Registrados</span>
                </div>
            </div>
            <div class="arcade-kpi-card">
                <div class="arcade-kpi-icon">🥇</div>
                <div class="arcade-kpi-data">
                    <span class="arcade-kpi-val" id="kpi-top-score">-</span>
                    <span class="arcade-kpi-label">Récord High Score</span>
                </div>
            </div>
            <div class="arcade-kpi-card">
                <div class="arcade-kpi-icon">🎮</div>
                <div class="arcade-kpi-data">
                    <span class="arcade-kpi-val" id="kpi-active-events">-</span>
                    <span class="arcade-kpi-label">Eventos Activos / Próx.</span>
                </div>
            </div>
            <div class="arcade-kpi-card">
                <div class="arcade-kpi-icon">👑</div>
                <div class="arcade-kpi-data">
                    <span class="arcade-kpi-val">CLUB 0 Gs</span>
                    <span class="arcade-kpi-label">Premio Oficial de Torneos</span>
                </div>
            </div>
        </div>

        <!-- Barra de Pestañas -->
        <div class="arcade-tabs-bar">
            <button class="arcade-tab-btn arcade-tab-btn--active" data-tab="arena">
                🕹️ Arena de Juegos
            </button>
            <button class="arcade-tab-btn" data-tab="tournaments">
                🏆 Torneos Gamer & Podios <span class="arcade-tab-badge" id="tab-tournaments-badge">0</span>
            </button>
            <button class="arcade-tab-btn" data-tab="scores">
                🥇 High Scores & Moderación
            </button>
        </div>

        <!-- ==========================================
             TAB 1: ARENA DE JUEGOS
             ========================================== -->
        <div class="arcade-tab-content arcade-tab-content--active" id="tab-content-arena">
            <div class="arcade-layout">
                <!-- Columna izquierda: juego -->
                <div class="arcade-game-section">
                    <div class="arcade-game-wrapper" id="arcade-game-wrapper">
                        <div class="arcade-game-placeholder" id="arcade-placeholder">
                            <div class="arcade-logo">👾</div>
                            <h2 class="arcade-title">PAC-MAN BURGAME</h2>
                            <p class="arcade-subtitle">Esquivá los fantasmas, comé los puntos y superá el récord del salón para ganar premios.</p>
                            <button class="btn btn--primary arcade-play-btn" id="btn-play-pacman">
                                ▶️ JUGAR AHORA
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
                        <div class="arcade-controls-left">
                            <button class="btn btn--secondary btn--sm" id="btn-arcade-close">✕ Salir del juego</button>
                            <button class="btn btn--secondary btn--sm" id="btn-arcade-fullscreen">⛶ Pantalla completa</button>
                        </div>
                        <div class="arcade-controls-right">
                            <span class="arcade-cabinet-info">🕹️ Modo Arcade Cabinet Activo</span>
                        </div>
                    </div>
                </div>

                <!-- Columna derecha: Leaderboard Rápido + Info Salón -->
                <div style="display: flex; flex-direction: column; gap: 1rem;">
                    <div class="arcade-leaderboard">
                        <h3 class="arcade-leaderboard__title">⚡ TOP 5 FLASH</h3>
                        <div id="arcade-scores-quick-list" class="arcade-scores-list">
                            <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div></div>
                        </div>
                    </div>

                    <div class="card" style="padding: 1rem; border: 1px solid var(--border-subtle); font-size: 0.82rem; display: flex; flex-direction: column; gap: 0.5rem;">
                        <h4 style="color: var(--color-primary); font-size: 0.88rem; margin: 0;">🎮 Salón Gamer Burgame</h4>
                        <p style="color: var(--text-muted); margin: 0;">Consolas PS5 y Nintendo Switch disponibles para juego libre y retas en el salón.</p>
                        <div style="background: rgba(255, 215, 0, 0.08); padding: 0.5rem; border-radius: 4px; border: 1px solid rgba(255, 215, 0, 0.2);">
                            <strong>🔥 Desafío de la Semana:</strong> Quien supere los 10.000 pts en Pac-Man se lleva una Burger Clásica gratis.
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ==========================================
             TAB 2: TORNEOS GAMER OFICIALES
             ========================================== -->
        <div class="arcade-tab-content" id="tab-content-tournaments">
            <div class="tournaments-action-bar">
                <div class="tournaments-filters">
                    <button class="btn btn--sm btn--primary filter-tourn-btn" data-filter="all">Todos</button>
                    <button class="btn btn--sm btn--secondary filter-tourn-btn" data-filter="active">En Curso</button>
                    <button class="btn btn--sm btn--secondary filter-tourn-btn" data-filter="finished">Finalizados</button>
                    <button class="btn btn--sm btn--secondary filter-tourn-btn" data-filter="upcoming">Próximos</button>
                </div>
                <button class="btn btn--primary btn--sm" id="btn-new-tournament">
                    + Nuevo Torneo Gamer
                </button>
            </div>

            <div class="tournaments-grid" id="tournaments-grid">
                <!-- Se llena dinámicamente -->
            </div>
        </div>

        <!-- ==========================================
             TAB 3: HIGH SCORES & MODERACIÓN
             ========================================== -->
        <div class="arcade-tab-content" id="tab-content-scores">
            <div class="scores-admin-layout">
                <!-- Tabla principal de ranking y moderación -->
                <div class="scores-table-card">
                    <div class="scores-table-header">
                        <div>
                            <h3>🏆 RANKING HISTÓRICO GLOBAL</h3>
                            <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0.2rem 0 0 0;">
                                Moderación en tiempo real. Podés eliminar puntajes sospechosos o registrar récords de torneos en consola/físico.
                            </p>
                        </div>
                        <button class="btn btn--primary btn--sm" id="btn-add-manual-score">
                            + Registrar Puntaje Físico
                        </button>
                    </div>

                    <div class="scores-list-container" id="arcade-scores-full-list">
                        <div class="page-loading" style="padding: 1.5rem;"><div class="pixel-spinner"></div></div>
                    </div>
                </div>

                <!-- Sidebar de Recompensas por Score -->
                <div class="arcade-rewards-sidebar">
                    <div class="arcade-rewards-card">
                        <h4 class="arcade-rewards-title">🎁 Escala Oficial de Premios</h4>
                        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: -0.5rem;">
                            Los clientes que alcancen estas metas en el arcade del salón pueden solicitar su canje al cajero:
                        </p>
                        <div class="rewards-matrix-list">
                            <div class="reward-tier-card">
                                <span class="reward-tier-badge">2.500 PTS</span>
                                <div class="reward-tier-info">
                                    <span class="reward-tier-name">🍟 Porción de Papas Gratis</span>
                                    <span class="reward-tier-sub">Válido en la próxima burger</span>
                                </div>
                            </div>
                            <div class="reward-tier-card">
                                <span class="reward-tier-badge">5.000 PTS</span>
                                <div class="reward-tier-info">
                                    <span class="reward-tier-name">🥤 Bebida XL o Cerveza</span>
                                    <span class="reward-tier-sub">Para celebrar la partida</span>
                                </div>
                            </div>
                            <div class="reward-tier-card">
                                <span class="reward-tier-badge">10.000 PTS</span>
                                <div class="reward-tier-info">
                                    <span class="reward-tier-name">🍔 Burger Clásica Arcade</span>
                                    <span class="reward-tier-sub">Totalmente gratis (1 por mes)</span>
                                </div>
                            </div>
                            <div class="reward-tier-card" style="border-color: var(--border-gold-bright);">
                                <span class="reward-tier-badge" style="background: rgba(255, 215, 0, 0.25);">20.000+ PTS</span>
                                <div class="reward-tier-info">
                                    <span class="reward-tier-name">👑 Membresía Club Burgame</span>
                                    <span class="reward-tier-sub">1 mes completo (Acceso VIP)</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- ==========================================
             MODALES
             ========================================== -->

        <!-- Modal: Nuevo / Editar Torneo -->
        <div id="tournament-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 580px;">
                <div class="modal-header">
                    <h2 id="tournament-modal-title">🏆 Nuevo Torneo Gamer</h2>
                    <button class="btn-close tournament-close-modal">&times;</button>
                </div>
                <form id="tournament-form">
                    <input type="hidden" id="tourn-id" value="">
                    <div class="form-group">
                        <label class="form-label">Título del Torneo *</label>
                        <input type="text" id="tourn-title" class="form-input" placeholder="Ej: Torneo Rocket League 2v2 - Copa Burgame" required>
                    </div>
                    <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                        <div class="form-group">
                            <label class="form-label">Juego / Disciplina *</label>
                            <input type="text" id="tourn-game" class="form-input" placeholder="Ej: Rocket League, Smash Bros, Pac-Man" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Fecha del Torneo *</label>
                            <input type="date" id="tourn-date" class="form-input" required>
                        </div>
                    </div>
                    <div class="form-grid" style="grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                        <div class="form-group">
                            <label class="form-label">Estado del Torneo</label>
                            <select id="tourn-status" class="form-select">
                                <option value="finished">Finalizado (Con Ganadores)</option>
                                <option value="active">En Curso</option>
                                <option value="upcoming">Próximo / Inscripciones</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Cant. Participantes</label>
                            <input type="number" id="tourn-participants" class="form-input" placeholder="16" min="2">
                        </div>
                    </div>

                    <!-- Podio de Ganadores -->
                    <div style="background: var(--bg-elevated); padding: 0.85rem; border-radius: 4px; border: 1px solid var(--border-subtle); margin: 0.5rem 0; display: flex; flex-direction: column; gap: 0.6rem;">
                        <span style="font-size: 0.75rem; font-weight: 700; color: var(--color-primary); text-transform: uppercase;">
                            🥇 Podio & Premios (Asignación)
                        </span>
                        <div class="form-grid" style="grid-template-columns: 1fr 1.2fr; gap: 0.5rem;">
                            <input type="text" id="tourn-1st-name" class="form-input form-input--sm" placeholder="1º Puesto (Nombre/Equipo)">
                            <input type="text" id="tourn-1st-prize" class="form-input form-input--sm" placeholder="Premio: Membresía Club Burgame + Burger">
                        </div>
                        <div class="form-grid" style="grid-template-columns: 1fr 1.2fr; gap: 0.5rem;">
                            <input type="text" id="tourn-2nd-name" class="form-input form-input--sm" placeholder="2º Puesto (Nombre/Equipo)">
                            <input type="text" id="tourn-2nd-prize" class="form-input form-input--sm" placeholder="Premio: 2x Papas XL + Bebidas">
                        </div>
                        <div class="form-grid" style="grid-template-columns: 1fr 1.2fr; gap: 0.5rem;">
                            <input type="text" id="tourn-3rd-name" class="form-input form-input--sm" placeholder="3º Puesto (Nombre/Equipo)">
                            <input type="text" id="tourn-3rd-prize" class="form-input form-input--sm" placeholder="Premio: Cervezas Artesanales">
                        </div>
                    </div>

                    <div class="form-group">
                        <label class="form-label">Notas / Resumen del Evento</label>
                        <textarea id="tourn-notes" class="form-textarea" rows="2" placeholder="Detalles, fotos de los ganadores, modalidad, etc."></textarea>
                    </div>

                    <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                        <button type="button" class="btn btn--secondary tournament-close-modal">Cancelar</button>
                        <button type="submit" class="btn btn--primary">Guardar Torneo</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Modal: Otorgar Membresía Club Burgame como Premio de Torneo -->
        <div id="grant-prize-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 500px;">
                <div class="modal-header">
                    <h2>🏅 Otorgar Membresía Club Burgame</h2>
                    <button class="btn-close grant-prize-close">&times;</button>
                </div>
                <form id="grant-prize-form">
                    <input type="hidden" id="grant-tourn-title" value="">
                    <input type="hidden" id="grant-place-name" value="">

                    <div style="background: rgba(255, 215, 0, 0.1); border: 1px solid var(--border-gold); padding: 0.85rem; border-radius: 6px; font-size: 0.85rem; display: flex; flex-direction: column; gap: 0.35rem;">
                        <div><strong>Torneo:</strong> <span id="grant-display-tourn" style="color: var(--color-primary);"></span></div>
                        <div><strong>Puesto:</strong> <span id="grant-display-place"></span></div>
                        <div><strong>Monto registrado en Caja:</strong> <span style="color: #00e676; font-weight: bold;">0 Gs (Premio oficial de Torneo)</span></div>
                    </div>

                    <div class="form-group" style="margin-top: 1rem;">
                        <label class="form-label">Seleccionar Cliente Ganador *</label>
                        <input type="text" id="grant-customer-search" class="form-input" placeholder="🔍 Buscar cliente por nombre o teléfono..." style="margin-bottom: 0.5rem;">
                        <select id="grant-customer-select" class="form-select" size="5" style="width: 100%;" required>
                            <!-- Opciones cargadas dinámicamente -->
                        </select>
                        <span style="font-size: 0.72rem; color: var(--text-muted); display: block; margin-top: 0.25rem;">
                            Si el cliente aún no está registrado, podés darlo de alta en el módulo Clientes.
                        </span>
                    </div>

                    <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.25rem;">
                        <button type="button" class="btn btn--secondary grant-prize-close">Cancelar</button>
                        <button type="submit" class="btn btn--primary">Confirmar Membresía Gratuita</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Modal: Registrar Score Manual (Máquina Física o Consola) -->
        <div id="manual-score-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 440px;">
                <div class="modal-header">
                    <h2>🕹️ Registrar Score Manual</h2>
                    <button class="btn-close manual-score-close">&times;</button>
                </div>
                <form id="manual-score-form">
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1rem;">
                        Ingresá los puntajes obtenidos en los gabinetes arcade físicos del local o partidas oficiales.
                    </p>
                    <div class="form-group">
                        <label class="form-label">Iniciales / Tag del Jugador (3 a 4 letras) *</label>
                        <input type="text" id="manual-initials" class="form-input" maxlength="4" placeholder="BUR" style="text-transform: uppercase; font-family: var(--font-mono); font-size: 1.2rem; font-weight: bold; letter-spacing: 2px;" required>
                    </div>
                    <div class="form-group">
                        <label class="form-label">Puntaje Obtenido *</label>
                        <input type="number" id="manual-score" class="form-input" placeholder="12500" min="1" required>
                    </div>
                    <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                        <button type="button" class="btn btn--secondary manual-score-close">Cancelar</button>
                        <button type="submit" class="btn btn--primary">Registrar en Ranking</button>
                    </div>
                </form>
            </div>
        </div>
    `;

    setupArcadePage(container);
    return container;
}

// ============================================================
// Setup General de la Página
// ============================================================
function setupArcadePage(container) {
    setupTabs(container);
    setupGameControls(container);
    setupTournaments(container);
    setupScores(container);
    setupModals(container);

    // Cargar datos
    refreshAllData(container);
}

// --- Pestañas ---
function setupTabs(container) {
    const tabBtns = container.querySelectorAll('.arcade-tab-btn');
    const tabContents = container.querySelectorAll('.arcade-tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.dataset.tab;
            if (!targetTab) return;

            tabBtns.forEach(b => b.classList.remove('arcade-tab-btn--active'));
            tabContents.forEach(c => c.classList.remove('arcade-tab-content--active'));

            btn.classList.add('arcade-tab-btn--active');
            container.querySelector(`#tab-content-${targetTab}`)?.classList.add('arcade-tab-content--active');
            _activeTab = targetTab;

            if (targetTab === 'tournaments') {
                renderTournamentsList(container);
            } else if (targetTab === 'scores') {
                renderFullScoresList(container);
            }
        });
    });
}

// --- Controles del Pacman iframe ---
function setupGameControls(container) {
    const placeholder = container.querySelector('#arcade-placeholder');
    const iframe = container.querySelector('#pacman-iframe');
    const playBtn = container.querySelector('#btn-play-pacman');
    const closeBtn = container.querySelector('#btn-arcade-close');
    const fullscreenBtn = container.querySelector('#btn-arcade-fullscreen');
    const gameWrapper = container.querySelector('#arcade-game-wrapper');

    function startGame() {
        placeholder.style.display = 'none';
        iframe.style.display = 'block';
        const gameSrc = iframe.dataset.src;
        if (iframe.src !== gameSrc && !iframe.src.endsWith(gameSrc)) {
            iframe.src = gameSrc;
        }
    }

    function stopGame() {
        iframe.src = 'about:blank';
        iframe.style.display = 'none';
        placeholder.style.display = 'flex';
        if (gameWrapper.classList.contains('arcade-game-wrapper--fullscreen')) {
            gameWrapper.classList.remove('arcade-game-wrapper--fullscreen');
            fullscreenBtn.textContent = '⛶ Pantalla completa';
        }
    }

    function toggleFullscreen() {
        gameWrapper.classList.toggle('arcade-game-wrapper--fullscreen');
        const isFull = gameWrapper.classList.contains('arcade-game-wrapper--fullscreen');
        fullscreenBtn.textContent = isFull ? '✕ Salir pantalla completa' : '⛶ Pantalla completa';
    }

    playBtn?.addEventListener('click', startGame);
    closeBtn?.addEventListener('click', stopGame);
    fullscreenBtn?.addEventListener('click', toggleFullscreen);
}

// ============================================================
// Lógica de Torneos
// ============================================================
function setupTournaments(container) {
    // Filtros
    const filterBtns = container.querySelectorAll('.filter-tourn-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => {
                b.classList.remove('btn--primary');
                b.classList.add('btn--secondary');
            });
            btn.classList.remove('btn--secondary');
            btn.classList.add('btn--primary');

            _tournamentsFilter = btn.dataset.filter;
            renderTournamentsList(container);
        });
    });

    // Botón nuevo torneo
    const newBtn = container.querySelector('#btn-new-tournament');
    newBtn?.addEventListener('click', () => {
        openTournamentModal(container);
    });
}

function renderTournamentsList(container) {
    const grid = container.querySelector('#tournaments-grid');
    if (!grid) return;

    const all = arcadeService.getTournaments();
    container.querySelector('#tab-tournaments-badge').textContent = all.length;

    let filtered = all;
    if (_tournamentsFilter !== 'all') {
        filtered = all.filter(t => t.status === _tournamentsFilter);
    }

    if (filtered.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-md); border: 1px dashed var(--border-subtle);">
                <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎮</div>
                <h3 style="color: var(--color-text); margin-bottom: 0.25rem;">No hay torneos en esta sección</h3>
                <p style="font-size: 0.85rem;">Creá un nuevo torneo gamer para registrar podios y otorgar membresías.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = filtered.map(t => {
        const isFinished = t.status === 'finished';
        const statusLabel = isFinished ? 'Finalizado' : t.status === 'active' ? 'En Curso' : 'Próximo';
        const statusClass = isFinished ? 'finished' : t.status === 'active' ? 'active' : 'upcoming';

        return `
            <div class="tournament-card tournament-card--${statusClass}">
                <div class="tournament-header">
                    <div class="tournament-title-box">
                        <h3>${t.title}</h3>
                        <span class="tournament-game-badge">🎮 ${t.game}</span>
                    </div>
                    <span class="tournament-status-badge tournament-status-badge--${statusClass}">${statusLabel}</span>
                </div>

                <div class="tournament-meta-row">
                    <span>📅 ${t.date || 'Sin fecha'}</span>
                    <span>👥 ${t.participantsCount || 0} Participantes</span>
                </div>

                <!-- Podio -->
                <div class="tournament-podium">
                    <span class="tournament-podium-title">Podio & Premios</span>
                    
                    <!-- 1er puesto -->
                    <div class="podium-row podium-row--1st">
                        <div class="podium-winner-info">
                            <span class="podium-icon">🥇</span>
                            <div>
                                <div class="podium-winner-name">${t.firstPlace?.name || 'Por definir'}</div>
                                <div class="podium-prize-desc">${t.firstPlace?.prize || 'Membresía Club Burgame'}</div>
                            </div>
                        </div>
                        <button class="podium-grant-btn btn-grant-membership" data-tourn-id="${t.id}" data-place="1º Puesto" data-name="${t.firstPlace?.name || ''}">
                            🏅 Otorgar Membresía (0 Gs)
                        </button>
                    </div>

                    <!-- 2do puesto -->
                    <div class="podium-row">
                        <div class="podium-winner-info">
                            <span class="podium-icon">🥈</span>
                            <div>
                                <div class="podium-winner-name">${t.secondPlace?.name || 'Por definir'}</div>
                                <div class="podium-prize-desc">${t.secondPlace?.prize || 'Premio secundario'}</div>
                            </div>
                        </div>
                        <button class="podium-grant-btn btn-grant-membership" data-tourn-id="${t.id}" data-place="2º Puesto" data-name="${t.secondPlace?.name || ''}">
                            🏅 Otorgar (0 Gs)
                        </button>
                    </div>

                    <!-- 3er puesto -->
                    <div class="podium-row">
                        <div class="podium-winner-info">
                            <span class="podium-icon">🥉</span>
                            <div>
                                <div class="podium-winner-name">${t.thirdPlace?.name || 'Por definir'}</div>
                                <div class="podium-prize-desc">${t.thirdPlace?.prize || 'Consolación'}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tournament-footer">
                    <span class="tournament-notes" title="${t.notes || ''}">
                        ${t.notes || 'Sin observaciones'}
                    </span>
                    <div class="tournament-actions-btns">
                        <button class="btn btn--secondary btn--sm btn-edit-tourn" data-id="${t.id}">✏️</button>
                        <button class="btn btn--secondary btn--sm btn-delete-tourn" data-id="${t.id}" style="color: var(--color-error);">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Eventos de botones en tarjetas
    grid.querySelectorAll('.btn-grant-membership').forEach(b => {
        b.addEventListener('click', () => {
            const tournId = b.dataset.tournId;
            const place = b.dataset.place;
            const winnerName = b.dataset.name;
            const tourn = all.find(x => x.id === tournId);
            if (tourn) openGrantPrizeModal(container, tourn, place, winnerName);
        });
    });

    grid.querySelectorAll('.btn-edit-tourn').forEach(b => {
        b.addEventListener('click', () => {
            const tourn = all.find(x => x.id === b.dataset.id);
            if (tourn) openTournamentModal(container, tourn);
        });
    });

    grid.querySelectorAll('.btn-delete-tourn').forEach(b => {
        b.addEventListener('click', () => {
            if (confirm('¿Eliminar este torneo?')) {
                arcadeService.deleteTournament(b.dataset.id);
                showToast({ message: 'Torneo eliminado', type: 'info' });
                refreshAllData(container);
            }
        });
    });
}

// ============================================================
// Lógica de Scores & Moderación
// ============================================================
function setupScores(container) {
    const addManualBtn = container.querySelector('#btn-add-manual-score');
    addManualBtn?.addEventListener('click', () => {
        const modal = container.querySelector('#manual-score-modal');
        container.querySelector('#manual-score-form').reset();
        modal.classList.remove('hidden');
    });
}

async function renderFullScoresList(container) {
    const listEl = container.querySelector('#arcade-scores-full-list');
    if (!listEl) return;

    try {
        const scores = await arcadeService.getTopScores(25);
        if (scores.length === 0) {
            listEl.innerHTML = '<p class="empty-text">No hay puntajes registrados.</p>';
            return;
        }

        listEl.innerHTML = scores.map((s, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}º`;
            const dateStr = s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Oficial';
            return `
                <div class="arcade-score-row ${i === 0 ? 'arcade-score-row--top' : ''}">
                    <span class="arcade-score-rank">${medal}</span>
                    <div class="arcade-score-initials-col">
                        <span class="arcade-score-initials">${s.initials}</span>
                        <span class="arcade-score-date">📅 ${dateStr}</span>
                    </div>
                    <span class="arcade-score-value">${(s.score || 0).toLocaleString()} PTS</span>
                    <button class="arcade-score-delete-btn btn-delete-score" data-id="${s.id}" title="Eliminar score (Moderación)">
                        🗑️
                    </button>
                </div>
            `;
        }).join('');

        listEl.querySelectorAll('.btn-delete-score').forEach(b => {
            b.addEventListener('click', async () => {
                if (confirm('¿Seguro de eliminar este score?')) {
                    await arcadeService.deleteScore(b.dataset.id);
                    showToast({ message: 'Puntaje eliminado', type: 'info' });
                    refreshAllData(container);
                }
            });
        });
    } catch (err) {
        console.warn('Error al cargar full scores:', err);
        listEl.innerHTML = '<p class="empty-text">Error al cargar ranking.</p>';
    }
}

async function renderQuickScores(container) {
    const listEl = container.querySelector('#arcade-scores-quick-list');
    if (!listEl) return;

    try {
        const scores = await arcadeService.getTopScores(5);
        if (scores.length === 0) {
            listEl.innerHTML = '<p class="empty-text" style="font-size: 0.8rem; padding: 0.5rem;">Sin registros aún.</p>';
            return;
        }

        listEl.innerHTML = scores.map((s, i) => {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
            return `
                <div class="arcade-score-row ${i === 0 ? 'arcade-score-row--top' : ''}" style="grid-template-columns: 35px 1fr auto; padding: 0.4rem 0.6rem;">
                    <span class="arcade-score-rank" style="font-size: 1rem;">${medal}</span>
                    <span class="arcade-score-initials" style="font-size: 0.9rem;">${s.initials}</span>
                    <span class="arcade-score-value" style="font-size: 0.95rem;">${(s.score || 0).toLocaleString()}</span>
                </div>
            `;
        }).join('');
    } catch {
        listEl.innerHTML = '<p class="empty-text" style="font-size: 0.8rem;">Modo offline</p>';
    }
}

// ============================================================
// Modales y Formularios
// ============================================================
function setupModals(container) {
    // Cerrar modales con botones de clase o fondo
    container.querySelectorAll('.tournament-close-modal').forEach(b => {
        b.addEventListener('click', () => container.querySelector('#tournament-modal')?.classList.add('hidden'));
    });
    container.querySelectorAll('.grant-prize-close').forEach(b => {
        b.addEventListener('click', () => container.querySelector('#grant-prize-modal')?.classList.add('hidden'));
    });
    container.querySelectorAll('.manual-score-close').forEach(b => {
        b.addEventListener('click', () => container.querySelector('#manual-score-modal')?.classList.add('hidden'));
    });

    container.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', e => {
            if (e.target === overlay) overlay.classList.add('hidden');
        });
    });

    // Guardar Torneo Form
    const tournForm = container.querySelector('#tournament-form');
    tournForm?.addEventListener('submit', e => {
        e.preventDefault();
        const id = container.querySelector('#tourn-id').value;
        const tournament = {
            id: id || undefined,
            title: container.querySelector('#tourn-title').value.trim(),
            game: container.querySelector('#tourn-game').value.trim(),
            date: container.querySelector('#tourn-date').value,
            status: container.querySelector('#tourn-status').value,
            participantsCount: parseInt(container.querySelector('#tourn-participants').value, 10) || 0,
            firstPlace: {
                name: container.querySelector('#tourn-1st-name').value.trim() || 'Por definir',
                prize: container.querySelector('#tourn-1st-prize').value.trim() || 'Membresía Club Burgame'
            },
            secondPlace: {
                name: container.querySelector('#tourn-2nd-name').value.trim() || 'Por definir',
                prize: container.querySelector('#tourn-2nd-prize').value.trim() || 'Premio 2º Puesto'
            },
            thirdPlace: {
                name: container.querySelector('#tourn-3rd-name').value.trim() || 'Por definir',
                prize: container.querySelector('#tourn-3rd-prize').value.trim() || 'Premio 3º Puesto'
            },
            notes: container.querySelector('#tourn-notes').value.trim()
        };

        arcadeService.saveTournament(tournament);
        showToast({ message: id ? 'Torneo actualizado con éxito' : '¡Nuevo torneo creado!', type: 'success' });
        container.querySelector('#tournament-modal')?.classList.add('hidden');
        refreshAllData(container);
    });

    // Guardar Premio Membresía Form
    const grantForm = container.querySelector('#grant-prize-form');
    grantForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const customerId = container.querySelector('#grant-customer-select').value;
        const tournTitle = container.querySelector('#grant-tourn-title').value;
        const placeName = container.querySelector('#grant-place-name').value;

        if (!customerId) {
            showToast({ message: 'Por favor seleccioná un cliente', type: 'error' });
            return;
        }

        try {
            await arcadeService.grantTournamentMembership(customerId, tournTitle, placeName);
            showToast({ message: `¡Membresía otorgada con éxito (0 Gs)!`, type: 'success' });
            container.querySelector('#grant-prize-modal')?.classList.add('hidden');
        } catch (err) {
            console.error('Error al otorgar membresía:', err);
            showToast({ message: 'Error al registrar premio: ' + err.message, type: 'error' });
        }
    });

    // Guardar Score Manual Form
    const manualScoreForm = container.querySelector('#manual-score-form');
    manualScoreForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const initials = container.querySelector('#manual-initials').value.trim().toUpperCase();
        const score = parseInt(container.querySelector('#manual-score').value, 10);

        if (!initials || !score) {
            showToast({ message: 'Completá todos los campos requeridos', type: 'error' });
            return;
        }

        try {
            await arcadeService.saveScore(initials, score);
            showToast({ message: `Puntaje guardado: ${initials} - ${score}`, type: 'success' });
            container.querySelector('#manual-score-modal')?.classList.add('hidden');
            refreshAllData(container);
        } catch (err) {
            showToast({ message: 'Error al registrar puntaje: ' + err.message, type: 'error' });
        }
    });

    // Buscador rápido en modal de otorgar membresía
    const searchInput = container.querySelector('#grant-customer-search');
    searchInput?.addEventListener('input', () => {
        filterCustomerOptions(container, searchInput.value);
    });
}

function openTournamentModal(container, tourn = null) {
    const modal = container.querySelector('#tournament-modal');
    const form = container.querySelector('#tournament-form');
    form.reset();

    const titleEl = container.querySelector('#tournament-modal-title');
    if (tourn) {
        titleEl.textContent = '✏️ Editar Torneo Gamer';
        container.querySelector('#tourn-id').value = tourn.id;
        container.querySelector('#tourn-title').value = tourn.title || '';
        container.querySelector('#tourn-game').value = tourn.game || '';
        container.querySelector('#tourn-date').value = tourn.date || '';
        container.querySelector('#tourn-status').value = tourn.status || 'finished';
        container.querySelector('#tourn-participants').value = tourn.participantsCount || 16;
        container.querySelector('#tourn-1st-name').value = tourn.firstPlace?.name || '';
        container.querySelector('#tourn-1st-prize').value = tourn.firstPlace?.prize || '';
        container.querySelector('#tourn-2nd-name').value = tourn.secondPlace?.name || '';
        container.querySelector('#tourn-2nd-prize').value = tourn.secondPlace?.prize || '';
        container.querySelector('#tourn-3rd-name').value = tourn.thirdPlace?.name || '';
        container.querySelector('#tourn-3rd-prize').value = tourn.thirdPlace?.prize || '';
        container.querySelector('#tourn-notes').value = tourn.notes || '';
    } else {
        titleEl.textContent = '🏆 Nuevo Torneo Gamer';
        container.querySelector('#tourn-id').value = '';
        container.querySelector('#tourn-date').value = new Date().toISOString().split('T')[0];
        container.querySelector('#tourn-1st-prize').value = 'Membresía Club Burgame 1 Mes';
        container.querySelector('#tourn-status').value = 'active';
    }

    modal.classList.remove('hidden');
}

async function openGrantPrizeModal(container, tourn, place, winnerName) {
    const modal = container.querySelector('#grant-prize-modal');
    container.querySelector('#grant-tourn-title').value = tourn.title;
    container.querySelector('#grant-place-name').value = place;
    container.querySelector('#grant-display-tourn').textContent = tourn.title;
    container.querySelector('#grant-display-place').textContent = `${place} (${winnerName || 'Ganador'})`;

    const select = container.querySelector('#grant-customer-select');
    select.innerHTML = '<option value="">Cargando clientes...</option>';

    modal.classList.remove('hidden');

    try {
        if (_customersCache.length === 0) {
            _customersCache = await customerService.getCustomers();
        }
        filterCustomerOptions(container, '');
    } catch (err) {
        console.error('Error al cargar clientes para premio:', err);
        select.innerHTML = '<option value="">Error al cargar clientes</option>';
    }
}

function filterCustomerOptions(container, query = '') {
    const select = container.querySelector('#grant-customer-select');
    const q = query.toLowerCase().trim();
    const filtered = _customersCache.filter(c => {
        if (!q) return true;
        const name = (c.name || '').toLowerCase();
        const phone = (c.phone || '').toLowerCase();
        return name.includes(q) || phone.includes(q);
    });

    if (filtered.length === 0) {
        select.innerHTML = '<option value="" disabled>No se encontraron clientes</option>';
        return;
    }

    select.innerHTML = filtered.map(c => `
        <option value="${c.id}">${c.name || 'Sin nombre'} (${c.phone || 'Sin tel.'})</option>
    `).join('');
}

// ============================================================
// Actualización Global de Métricas y Datos
// ============================================================
async function refreshAllData(container) {
    const tournaments = arcadeService.getTournaments();
    renderTournamentsList(container);
    renderQuickScores(container);
    renderFullScoresList(container);

    // KPI Strip
    const totalTournaments = tournaments.length;
    const activeEvents = tournaments.filter(t => t.status === 'active' || t.status === 'upcoming').length;
    container.querySelector('#kpi-tournaments-count').textContent = totalTournaments;
    container.querySelector('#kpi-active-events').textContent = activeEvents;

    try {
        const topScores = await arcadeService.getTopScores(1);
        const topScore = topScores[0]?.score || 10000;
        container.querySelector('#kpi-top-score').textContent = topScore.toLocaleString() + ' PTS';
    } catch {
        container.querySelector('#kpi-top-score').textContent = '10.000 PTS';
    }
}

// ============================================================
// Listener Global para recibir scores del iframe (Pacman)
// ============================================================
let _scoreListenerRegistered = false;

function ensureScoreListener() {
    if (_scoreListenerRegistered) return;
    _scoreListenerRegistered = true;

    window.addEventListener('message', async (e) => {
        if (e.data && e.data.type === 'BURGAME_SCORE') {
            try {
                await arcadeService.saveScore(e.data.initials, e.data.score);
                showToast({ message: `¡Puntaje registrado! ${e.data.initials} - ${e.data.score}`, type: 'success' });
            } catch {
                showToast({ message: `Score recibido: ${e.data.score}`, type: 'info' });
            }

            const container = document.querySelector('.arcade-page');
            if (container) refreshAllData(container);
        }
    });
}

ensureScoreListener();

