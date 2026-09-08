// ============================================================
// Página ARCADE & GAMING ARENA - ENTERPRISE SUITE (CHALLONGE-GRADE)
// 1. Play Arena: Pacman clásico + modo arcade cabinet + controles
// 2. Torneos Gamer: Gestión integral de torneos, links públicos,
//    inscripciones online, motor de brackets interactivo y
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
let _currentManagingTourn = null;
let _bracketSubTab = 'brackets'; // 'brackets' | 'participants'

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
                🏆 Torneos Gamer & Brackets <span class="arcade-tab-badge" id="tab-tournaments-badge">0</span>
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
             MODALES DE LA SUITE DE TORNEOS
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
                    <div class="form-grid" style="grid-template-columns: 1fr 1fr 1fr; gap: 0.75rem;">
                        <div class="form-group">
                            <label class="form-label">Modalidad</label>
                            <select id="tourn-modality" class="form-select">
                                <option value="2v2">2v2 (Equipos)</option>
                                <option value="1v1">1v1 (Individual)</option>
                                <option value="3v3">3v3</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Estado</label>
                            <select id="tourn-status" class="form-select">
                                <option value="upcoming">Próximo / Inscripciones</option>
                                <option value="active">En Curso</option>
                                <option value="finished">Finalizado</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Cupo Máx.</label>
                            <input type="number" id="tourn-participants" class="form-input" placeholder="16" min="4" max="32" value="16">
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
                        <label class="form-label">Reglamento / Notas del Evento</label>
                        <textarea id="tourn-notes" class="form-textarea" rows="2" placeholder="Modalidad al mejor de 3, escenarios legales, etc."></textarea>
                    </div>

                    <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem;">
                        <button type="button" class="btn btn--secondary tournament-close-modal">Cancelar</button>
                        <button type="submit" class="btn btn--primary">Guardar Torneo</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Modal: Compartir Link & QR Público (Estilo Challonge) -->
        <div id="tournament-share-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 500px; text-align: center;">
                <div class="modal-header">
                    <h2>🔗 Link & QR Oficial del Torneo</h2>
                    <button class="btn-close share-tourn-close">&times;</button>
                </div>
                <div class="modal-body" style="padding: 1.5rem; display: flex; flex-direction: column; align-items: center; gap: 1rem;">
                    <h3 id="share-modal-title" style="color: var(--color-primary); margin: 0; font-size: 1.15rem;">-</h3>
                    <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0;">
                        Compartí este enlace con los jugadores para que se inscriban online o escaneen el QR en el salón para seguir los brackets en vivo.
                    </p>

                    <!-- QR Code Display -->
                    <div style="background: #FFF; padding: 0.75rem; border-radius: 8px; box-shadow: 0 0 20px rgba(255, 215, 0, 0.3);">
                        <img id="share-modal-qr" src="" alt="QR Torneo" style="width: 180px; height: 180px; display: block;">
                    </div>

                    <!-- Enlace copiable -->
                    <div style="display: flex; width: 100%; gap: 0.5rem;">
                        <input type="text" id="share-modal-url" class="form-input" readonly style="font-family: var(--font-mono); font-size: 0.8rem; background: rgba(0,0,0,0.5);">
                        <button class="btn btn--primary" id="btn-copy-share-url" style="white-space: nowrap;">
                            📋 Copiar
                        </button>
                    </div>

                    <div style="display: flex; gap: 0.5rem; width: 100%;">
                        <a id="share-modal-wa-btn" href="#" target="_blank" class="btn btn--secondary btn--sm" style="flex: 1; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
                            📲 WhatsApp
                        </a>
                        <a id="share-modal-open-btn" href="#" target="_blank" class="btn btn--secondary btn--sm" style="flex: 1; text-decoration: none; display: flex; align-items: center; justify-content: center; gap: 0.35rem;">
                            🌐 Abrir Portal
                        </a>
                    </div>
                </div>
            </div>
        </div>

        <!-- Modal: Gestor Interactivo de Brackets (Challonge Engine) -->
        <div id="bracket-admin-modal" class="modal-overlay hidden">
            <div class="modal-card card bracket-modal-dialog">
                <div class="modal-header">
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <h2 id="bracket-modal-tourn-title">⚔️ Cuadro de Eliminación</h2>
                        <span id="bracket-modal-status-badge" class="tournament-status-badge tournament-status-badge--active">En Curso</span>
                    </div>
                    <button class="btn-close bracket-admin-close">&times;</button>
                </div>

                <!-- Toolbar de Brackets -->
                <div class="bracket-admin-toolbar">
                    <div class="bracket-admin-tabs">
                        <button class="bracket-admin-tab-btn bracket-admin-tab-btn--active" data-subtab="brackets">
                            ⚔️ Llaves de Partidos
                        </button>
                        <button class="bracket-admin-tab-btn" data-subtab="participants">
                            👥 Inscriptos (<span id="bracket-participants-count">0</span>)
                        </button>
                    </div>

                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <button class="btn btn--secondary btn--sm" id="btn-admin-add-participant">
                            + Inscribir Equipo
                        </button>
                        <button class="btn btn--secondary btn--sm" id="btn-admin-generate-brackets" style="border-color: var(--border-gold); color: var(--color-primary);">
                            🎲 Sortear & Generar Brackets
                        </button>
                        <button class="btn btn--primary btn--sm" id="btn-admin-declare-winner">
                            🏆 Premiación Oficial (0 Gs)
                        </button>
                    </div>
                </div>

                <!-- Sub-Pestaña A: Árbol Visual de Brackets -->
                <div class="bracket-admin-viewport" id="bracket-admin-tree-pane">
                    <div class="brackets-tree-container" id="admin-brackets-tree-container">
                        <!-- Partidos interactivos generados dinámicamente -->
                    </div>
                </div>

                <!-- Sub-Pestaña B: Lista de Participantes & Check-in -->
                <div class="bracket-admin-viewport hidden" id="bracket-admin-participants-pane">
                    <div id="admin-participants-list-container">
                        <!-- Tabla de participantes -->
                    </div>
                </div>
            </div>
        </div>

        <!-- Modal: Registrar / Editar Puntaje de Partido -->
        <div id="match-score-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 440px;">
                <div class="modal-header">
                    <h2 id="match-score-modal-title">🎮 Registrar Resultado</h2>
                    <button class="btn-close match-score-close">&times;</button>
                </div>
                <form id="match-score-form" style="padding: 1.25rem;">
                    <input type="hidden" id="score-match-id" value="">
                    <input type="hidden" id="score-p1-id" value="">
                    <input type="hidden" id="score-p2-id" value="">

                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.25rem;">
                        Ingresá el resultado de la serie. El ganador avanzará automáticamente a la siguiente llave del torneo.
                    </p>

                    <!-- Equipo 1 -->
                    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-elevated); padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 0.75rem;">
                        <span id="score-p1-name" style="font-weight: 700; font-size: 0.95rem; color: #FFF;">Equipo 1</span>
                        <input type="number" id="score-val-1" class="form-input" min="0" max="99" value="0" style="width: 70px; text-align: center; font-size: 1.2rem; font-weight: 800; font-family: var(--font-mono);" required>
                    </div>

                    <div style="text-align: center; font-weight: 900; color: var(--color-primary); margin: 0.25rem 0;">VS</div>

                    <!-- Equipo 2 -->
                    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-elevated); padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 1.25rem;">
                        <span id="score-p2-name" style="font-weight: 700; font-size: 0.95rem; color: #FFF;">Equipo 2</span>
                        <input type="number" id="score-val-2" class="form-input" min="0" max="99" value="0" style="width: 70px; text-align: center; font-size: 1.2rem; font-weight: 800; font-family: var(--font-mono);" required>
                    </div>

                    <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                        <button type="button" class="btn btn--secondary match-score-close">Cancelar</button>
                        <button type="submit" class="btn btn--primary">Confirmar y Avanzar</button>
                    </div>
                </form>
            </div>
        </div>

        <!-- Modal: Inscripción Presencial de Equipo -->
        <div id="add-participant-modal" class="modal-overlay hidden">
            <div class="modal-card card" style="max-width: 480px;">
                <div class="modal-header">
                    <h2>📝 Inscribir Equipo en Torneo</h2>
                    <button class="btn-close add-participant-close">&times;</button>
                </div>
                <form id="add-participant-form" style="padding: 1.25rem;">
                    <div class="form-group" style="margin-bottom: 0.75rem;">
                        <label class="form-label">Nombre del Equipo / Gamer Tag *</label>
                        <input type="text" id="admin-reg-team" class="form-input" placeholder="Ej: Los Vengadores Gamer" required>
                    </div>
                    <div class="form-group" style="margin-bottom: 0.75rem;">
                        <label class="form-label">Capitán / Jugador 1 *</label>
                        <input type="text" id="admin-reg-cap" class="form-input" placeholder="Nombre completo" required>
                    </div>
                    <div class="form-group" style="margin-bottom: 0.75rem;">
                        <label class="form-label">Teléfono / WhatsApp *</label>
                        <input type="tel" id="admin-reg-phone" class="form-input" placeholder="0981 123456" required>
                    </div>
                    <div class="form-group" style="margin-bottom: 1.25rem;">
                        <label class="form-label">Jugador 2 (Compañero - Opcional)</label>
                        <input type="text" id="admin-reg-p2" class="form-input" placeholder="Nombre del compañero">
                    </div>

                    <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 0.5rem;">
                        <button type="button" class="btn btn--secondary add-participant-close">Cancelar</button>
                        <button type="submit" class="btn btn--primary">Registrar Equipo</button>
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
// Lógica de Torneos (Listado y Acciones Challonge)
// ============================================================
function setupTournaments(container) {
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

    const newBtn = container.querySelector('#btn-new-tournament');
    newBtn?.addEventListener('click', () => {
        openTournamentModal(container);
    });
}

async function renderTournamentsList(container) {
    const grid = container.querySelector('#tournaments-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="page-loading" style="padding: 2rem; grid-column: 1 / -1;"><div class="pixel-spinner"></div></div>';

    const all = await arcadeService.getTournaments();
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
                <p style="font-size: 0.85rem;">Creá un nuevo torneo gamer para registrar podios y generar brackets.</p>
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
                    <span>👥 ${t.modality || '2v2'} (Máx. ${t.max_participants || 16})</span>
                </div>

                <!-- Botones de Acción Challonge -->
                <div class="tournament-action-strip">
                    <button class="btn-bracket-view" data-tourn-id="${t.id}">
                        ⚔️ Brackets & Llaves
                    </button>
                    <button class="btn-share-tourn" data-tourn-id="${t.id}">
                        🔗 Link / QR Público
                    </button>
                </div>

                <!-- Podio -->
                <div class="tournament-podium">
                    <span class="tournament-podium-title">Podio & Premios</span>
                    
                    <!-- 1er puesto -->
                    <div class="podium-row podium-row--1st">
                        <div class="podium-winner-info">
                            <span class="podium-icon">🥇</span>
                            <div>
                                <div class="podium-winner-name">${t.firstPlace?.name || t.first_place?.name || 'Por definir'}</div>
                                <div class="podium-prize-desc">${t.firstPlace?.prize || t.first_place?.prize || 'Membresía Club Burgame'}</div>
                            </div>
                        </div>
                        <button class="podium-grant-btn btn-grant-membership" data-tourn-id="${t.id}" data-place="1º Puesto" data-name="${t.firstPlace?.name || t.first_place?.name || ''}">
                            🏅 Otorgar (0 Gs)
                        </button>
                    </div>

                    <!-- 2do puesto -->
                    <div class="podium-row">
                        <div class="podium-winner-info">
                            <span class="podium-icon">🥈</span>
                            <div>
                                <div class="podium-winner-name">${t.secondPlace?.name || t.second_place?.name || 'Por definir'}</div>
                                <div class="podium-prize-desc">${t.secondPlace?.prize || t.second_place?.prize || 'Premio secundario'}</div>
                            </div>
                        </div>
                        <button class="podium-grant-btn btn-grant-membership" data-tourn-id="${t.id}" data-place="2º Puesto" data-name="${t.secondPlace?.name || t.second_place?.name || ''}">
                            🏅 Otorgar (0 Gs)
                        </button>
                    </div>

                    <!-- 3er puesto -->
                    <div class="podium-row">
                        <div class="podium-winner-info">
                            <span class="podium-icon">🥉</span>
                            <div>
                                <div class="podium-winner-name">${t.thirdPlace?.name || t.third_place?.name || 'Por definir'}</div>
                                <div class="podium-prize-desc">${t.thirdPlace?.prize || t.third_place?.prize || 'Consolación'}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="tournament-footer">
                    <span class="tournament-notes" title="${t.notes || ''}">
                        ${t.notes || 'Sin observaciones'}
                    </span>
                    <div class="tournament-actions-btns">
                        <button class="btn btn--secondary btn--sm btn-edit-tourn" data-id="${t.id}" title="Editar">✏️</button>
                        <button class="btn btn--secondary btn--sm btn-delete-tourn" data-id="${t.id}" style="color: var(--color-error);" title="Eliminar">🗑️</button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Conectar eventos
    grid.querySelectorAll('.btn-bracket-view').forEach(b => {
        b.addEventListener('click', async () => {
            const tourn = all.find(x => x.id === b.dataset.tournId);
            if (tourn) openBracketManagerModal(container, tourn);
        });
    });

    grid.querySelectorAll('.btn-share-tourn').forEach(b => {
        b.addEventListener('click', () => {
            const tourn = all.find(x => x.id === b.dataset.tournId);
            if (tourn) openShareModal(container, tourn);
        });
    });

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
        b.addEventListener('click', async () => {
            if (confirm('¿Eliminar este torneo y todos sus brackets?')) {
                await arcadeService.deleteTournament(b.dataset.id);
                showToast({ message: 'Torneo eliminado', type: 'info' });
                refreshAllData(container);
            }
        });
    });
}

// ============================================================
// Modal Compartir Link & QR Público
// ============================================================
function openShareModal(container, tourn) {
    const modal = container.querySelector('#tournament-share-modal');
    if (!modal) return;

    const shareUrl = `${window.location.origin}${window.location.pathname.replace('index.html', '')}torneo.html?id=${tourn.id}`;
    
    container.querySelector('#share-modal-title').textContent = `🎮 ${tourn.title}`;
    const urlInput = container.querySelector('#share-modal-url');
    urlInput.value = shareUrl;

    // Generar QR dinámico
    const qrImg = container.querySelector('#share-modal-qr');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(shareUrl)}&bgcolor=FFFFFF&color=000000`;

    // WhatsApp button
    const waBtn = container.querySelector('#share-modal-wa-btn');
    const waText = encodeURIComponent(`¡Te invitamos al ${tourn.title} en Burgame! Inscribí a tu equipo o mirá las llaves en vivo aquí: ${shareUrl}`);
    waBtn.href = `https://api.whatsapp.com/send?text=${waText}`;

    // Open button
    const openBtn = container.querySelector('#share-modal-open-btn');
    openBtn.href = shareUrl;

    // Copy action
    const copyBtn = container.querySelector('#btn-copy-share-url');
    copyBtn.onclick = () => {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showToast({ message: '¡Link copiado al portapapeles!', type: 'success' });
            copyBtn.textContent = '✅ ¡Copiado!';
            setTimeout(() => { copyBtn.textContent = '📋 Copiar'; }, 2000);
        });
    };

    modal.classList.remove('hidden');
}

// ============================================================
// Modal Gestor de Brackets (Challonge Engine en Admin)
// ============================================================
async function openBracketManagerModal(container, tourn) {
    _currentManagingTourn = tourn;
    const modal = container.querySelector('#bracket-admin-modal');
    if (!modal) return;

    container.querySelector('#bracket-modal-tourn-title').textContent = `⚔️ ${tourn.title}`;
    const statusBadge = container.querySelector('#bracket-modal-status-badge');
    statusBadge.textContent = tourn.status === 'finished' ? 'Finalizado' : tourn.status === 'active' ? 'En Curso' : 'Próximo';
    statusBadge.className = `tournament-status-badge tournament-status-badge--${tourn.status}`;

    modal.classList.remove('hidden');
    await refreshBracketAdminData(container);
}

async function refreshBracketAdminData(container) {
    if (!_currentManagingTourn) return;

    const fullTourn = await arcadeService.getTournamentById(_currentManagingTourn.id);
    if (!fullTourn) return;

    _currentManagingTourn = fullTourn;
    const participants = fullTourn.participants || [];
    const matches = fullTourn.matches || [];

    container.querySelector('#bracket-participants-count').textContent = participants.length;

    renderAdminBracketsTree(container, fullTourn, matches, participants);
    renderAdminParticipantsList(container, fullTourn, participants);
}

function renderAdminBracketsTree(container, tourn, matches, participants) {
    const treeContainer = container.querySelector('#admin-brackets-tree-container');
    if (!treeContainer) return;

    if (!matches || matches.length === 0) {
        treeContainer.innerHTML = `
            <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted); width: 100%;">
                <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🎲</div>
                <h4 style="color: #FFF; margin-bottom: 0.25rem;">Cuadro no generado</h4>
                <p style="font-size: 0.85rem; margin-bottom: 1.25rem;">
                    Inscribí a los participantes y presioná "Sortear & Generar Brackets" para armar las llaves de eliminación.
                </p>
                <button class="btn btn--primary" id="btn-empty-generate-brackets">
                    🎲 Generar Brackets Ahora
                </button>
            </div>
        `;
        treeContainer.querySelector('#btn-empty-generate-brackets')?.addEventListener('click', () => {
            handleGenerateBrackets(container);
        });
        return;
    }

    const mainMatches = matches.filter(m => !m.is_third_place);
    const thirdPlaceMatch = matches.find(m => m.is_third_place);

    const roundsMap = {};
    mainMatches.forEach(m => {
        if (!roundsMap[m.round_index]) roundsMap[m.round_index] = [];
        roundsMap[m.round_index].push(m);
    });

    const roundIndexes = Object.keys(roundsMap).map(Number).sort((a, b) => a - b);
    const totalRounds = roundIndexes.length;

    let columnsHtml = roundIndexes.map((rIdx) => {
        const matchesInRound = roundsMap[rIdx].sort((a, b) => a.match_index - b.match_index);
        const roundTitle = matchesInRound[0]?.round_name || (rIdx === totalRounds ? 'Gran Final' : rIdx === totalRounds - 1 ? 'Semifinales' : 'Cuartos de Final');
        const isFinalRound = rIdx === totalRounds;

        let pairsHtml = '';

        if (!isFinalRound) {
            for (let i = 0; i < matchesInRound.length; i += 2) {
                const mTop = matchesInRound[i];
                const mBottom = matchesInRound[i + 1] || null;

                const topWon = mTop?.status === 'completed' && mTop.winner_id;
                const bottomWon = mBottom?.status === 'completed' && mBottom.winner_id;

                let winnerBranchClass = '';
                if (topWon) winnerBranchClass = 'bracket-fork--winner-top';
                else if (bottomWon) winnerBranchClass = 'bracket-fork--winner-bottom';

                pairsHtml += `
                    <div class="bracket-pair">
                        <div class="bracket-match-slot bracket-match-slot--top">
                            ${renderAdminMatchCardHtml(mTop, participants)}
                        </div>
                        ${mBottom ? `
                            <div class="bracket-match-slot bracket-match-slot--bottom">
                                ${renderAdminMatchCardHtml(mBottom, participants)}
                            </div>
                            <div class="bracket-fork ${winnerBranchClass}">
                                <div class="bracket-fork-arm-top"></div>
                                <div class="bracket-fork-vertical"></div>
                                <div class="bracket-fork-arm-bottom"></div>
                                <div class="bracket-fork-stem"></div>
                            </div>
                        ` : ''}
                    </div>
                `;
            }
        } else {
            // Gran Final (Single Match + Stem al Campeón)
            const finalMatch = matchesInRound[0];
            pairsHtml = `
                <div class="bracket-pair bracket-pair--single">
                    <div class="bracket-match-slot">
                        ${renderAdminMatchCardHtml(finalMatch, participants)}
                    </div>
                    <div class="bracket-single-stem"></div>
                </div>
            `;

            if (thirdPlaceMatch) {
                pairsHtml += `
                    <div class="third-place-container">
                        <div class="third-place-title">🥉 3er Puesto (Bronce)</div>
                        <div class="bracket-match-slot">
                            ${renderAdminMatchCardHtml(thirdPlaceMatch, participants)}
                        </div>
                    </div>
                `;
            }
        }

        return `
            <div class="bracket-round-column">
                <div class="bracket-round-header">
                    <span>${rIdx === totalRounds ? '👑' : '⚔️'}</span>
                    <span>${roundTitle}</span>
                </div>
                <div class="bracket-pairs-list">
                    ${pairsHtml}
                </div>
            </div>
        `;
    }).join('');

    // Columna del Campeón
    const finalMatch = mainMatches.find(m => m.round_index === totalRounds);
    const champ = tourn.first_place?.name 
        ? tourn.first_place 
        : (finalMatch?.winner_id ? participants.find(p => p.id === finalMatch.winner_id) : null);

    const champName = champ ? (champ.team_name || champ.name) : 'Por Definir';
    const isChampDefined = !!champ;
    const champPrize = tourn.first_place?.prize || tourn.prize_pool?.first || 'Membresía Club Burgame VIP';

    columnsHtml += `
        <div class="bracket-round-column bracket-round-column--champion">
            <div class="bracket-round-header" style="background: linear-gradient(135deg, rgba(255,215,0,0.2) 0%, rgba(255,165,0,0.2) 100%); border-color: #FFD700; color: #FFD700;">
                <span>🏆</span>
                <span>CAMPEÓN BURGAME</span>
            </div>
            <div class="champion-podium-card">
                <div class="champion-trophy-icon">🏆</div>
                <div class="champion-badge-top">${isChampDefined ? '1º PUESTO OFICIAL' : 'EN DISPUTA'}</div>
                <div class="champion-team-name">${champName}</div>
                <div class="champion-prize-tag">${champPrize}</div>
                ${isChampDefined ? `
                    <button class="btn btn--primary btn--sm btn-podium-grant-vip" style="width: 100%; margin-top: 0.5rem; font-weight: 800;">
                        👑 Otorgar Club Burgame (0 Gs)
                    </button>
                ` : ''}
            </div>
        </div>
    `;

    treeContainer.innerHTML = columnsHtml;

    // Conectar botón de otorgar en el podio
    treeContainer.querySelector('.btn-podium-grant-vip')?.addEventListener('click', () => {
        openGrantPrizeModal(container, tourn, '1º Puesto', champName);
    });

    // Eventos de click en partidos para cargar score
    treeContainer.querySelectorAll('.match-card--admin').forEach(card => {
        card.addEventListener('click', () => {
            const matchId = card.dataset.matchId;
            const match = matches.find(m => m.id === matchId);
            if (!match) return;

            const p1 = participants.find(p => p.id === match.participant1_id);
            const p2 = participants.find(p => p.id === match.participant2_id);

            if (!p1 && !p2) {
                showToast({ message: 'Esperando que avancen los rivales de rondas previas', type: 'info' });
                return;
            }

            openMatchScoreModal(container, tourn, match, p1, p2);
        });
    });
}

function renderAdminMatchCardHtml(match, participants) {
    if (!match) return '';

    const p1 = participants.find(p => p.id === match.participant1_id);
    const p2 = participants.find(p => p.id === match.participant2_id);

    const isCompleted = match.status === 'completed';
    const isLive = match.status === 'in_progress';

    const p1Name = p1 ? p1.team_name : (match.round_index === 1 ? 'BYE' : 'Por definir');
    const p2Name = p2 ? p2.team_name : (match.round_index === 1 ? 'BYE' : 'Por definir');

    const p1Won = isCompleted && match.winner_id === match.participant1_id;
    const p2Won = isCompleted && match.winner_id === match.participant2_id;

    const statusText = isCompleted ? 'Finalizado' : isLive ? '🔥 EN VIVO' : 'Por Jugar';
    const statusClass = isCompleted ? 'completed' : isLive ? 'in_progress' : 'pending';

    return `
        <div class="match-card match-card--admin ${isCompleted ? 'match-card--completed' : ''} ${isLive ? 'match-card--in_progress' : ''}" data-match-id="${match.id}">
            <div class="match-card-header">
                <span class="match-card-num">PARTIDA #${(match.match_index || 0) + 1}</span>
                <span class="match-card-status match-card-status--${statusClass}">${statusText}</span>
            </div>

            <!-- Equipo 1 -->
            <div class="match-slot-row ${p1Won ? 'match-slot-row--winner' : (isCompleted && !p1Won ? 'match-slot-row--loser' : '')}">
                <div class="match-slot-left">
                    <span class="match-slot-seed">#${p1 ? (p1.seed || '1') : '-'}</span>
                    <span class="match-slot-name ${!p1 ? 'match-slot-name--empty' : ''}">${p1Name}</span>
                </div>
                <span class="match-slot-score">${match.score1 ?? 0}</span>
            </div>

            <!-- Equipo 2 -->
            <div class="match-slot-row ${p2Won ? 'match-slot-row--winner' : (isCompleted && !p2Won ? 'match-slot-row--loser' : '')}">
                <div class="match-slot-left">
                    <span class="match-slot-seed">#${p2 ? (p2.seed || '2') : '-'}</span>
                    <span class="match-slot-name ${!p2 ? 'match-slot-name--empty' : ''}">${p2Name}</span>
                </div>
                <span class="match-slot-score">${match.score2 ?? 0}</span>
            </div>

            <div class="match-card-admin-action">
                ⚡ Cargar Resultado / Avanzar
            </div>
        </div>
    `;
}

function renderAdminParticipantsList(container, tourn, participants) {
    const listContainer = container.querySelector('#admin-participants-list-container');
    if (!listContainer) return;

    if (!participants || participants.length === 0) {
        listContainer.innerHTML = `
            <div style="text-align: center; padding: 2.5rem 1rem; color: var(--text-muted);">
                <p>No hay participantes registrados aún.</p>
                <button class="btn btn--primary btn--sm" id="btn-reg-first-team">Inscribir Primer Equipo</button>
            </div>
        `;
        listContainer.querySelector('#btn-reg-first-team')?.addEventListener('click', () => {
            openAddParticipantModal(container, tourn);
        });
        return;
    }

    listContainer.innerHTML = `
        <table class="participants-admin-table">
            <thead>
                <tr>
                    <th style="width: 50px;">Seed</th>
                    <th>Equipo / Tag</th>
                    <th>Capitán</th>
                    <th>WhatsApp</th>
                    <th>Jugador 2</th>
                    <th>Check-in</th>
                    <th style="width: 40px;"></th>
                </tr>
            </thead>
            <tbody>
                ${participants.map(p => {
                    const isChecked = p.status === 'checked_in';
                    return `
                        <tr>
                            <td style="font-family: var(--font-mono); font-weight: bold; color: var(--color-primary);">#${p.seed || '-'}</td>
                            <td style="font-weight: 700; color: #FFF;">${p.team_name}</td>
                            <td>${p.captain_name}</td>
                            <td>
                                <a href="https://api.whatsapp.com/send?phone=${p.captain_phone.replace(/\D/g, '')}" target="_blank" style="color: #00E676; text-decoration: none;">
                                    ${p.captain_phone}
                                </a>
                            </td>
                            <td>${p.player2_name || '-'}</td>
                            <td>
                                <span class="checkin-badge ${isChecked ? 'checkin-badge--checked' : 'checkin-badge--pending'} btn-toggle-checkin" data-id="${p.id}" data-status="${p.status}">
                                    ${isChecked ? '✅ Presente' : '⏳ Pendiente'}
                                </span>
                            </td>
                            <td>
                                <button class="btn-delete-participant" data-id="${p.id}" style="background: none; border: none; cursor: pointer; color: var(--color-error); font-size: 0.9rem;" title="Eliminar inscripto">
                                    🗑️
                                </button>
                            </td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    // Toggle check-in
    listContainer.querySelectorAll('.btn-toggle-checkin').forEach(badge => {
        badge.addEventListener('click', async () => {
            const partId = badge.dataset.id;
            const newStatus = badge.dataset.status === 'checked_in' ? 'registered' : 'checked_in';
            await arcadeService.updateParticipantStatus(partId, newStatus);
            showToast({ message: 'Estado de check-in actualizado', type: 'info' });
            await refreshBracketAdminData(container);
        });
    });

    // Delete participant
    listContainer.querySelectorAll('.btn-delete-participant').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (confirm('¿Eliminar este participante de las inscripciones?')) {
                await arcadeService.deleteParticipant(btn.dataset.id);
                showToast({ message: 'Participante eliminado', type: 'info' });
                await refreshBracketAdminData(container);
            }
        });
    });
}

// ============================================================
// Acciones del Bracket Manager
// ============================================================
async function handleGenerateBrackets(container) {
    if (!_currentManagingTourn) return;

    const participants = await arcadeService.getParticipants(_currentManagingTourn.id);
    if (participants.length < 2) {
        showToast({ message: 'Se necesitan al menos 2 equipos para armar las llaves.', type: 'warning' });
        return;
    }

    if (!confirm(`¿Generar cuadro de eliminación con sorteo aleatorio (Shuffle) para ${participants.length} equipos?`)) {
        return;
    }

    try {
        await arcadeService.generateBrackets(_currentManagingTourn.id, { shuffle: true, includeThirdPlace: true });
        showToast({ message: '¡Brackets generados con éxito!', type: 'success' });
        await refreshBracketAdminData(container);
        refreshAllData(container);
    } catch (err) {
        console.error('Error al generar brackets:', err);
        showToast({ message: err.message, type: 'error' });
    }
}

function openMatchScoreModal(container, tourn, match, p1, p2) {
    const modal = container.querySelector('#match-score-modal');
    if (!modal) return;

    container.querySelector('#score-match-id').value = match.id;
    container.querySelector('#score-p1-id').value = p1 ? p1.id : '';
    container.querySelector('#score-p2-id').value = p2 ? p2.id : '';

    container.querySelector('#score-p1-name').textContent = p1 ? p1.team_name : 'BYE';
    container.querySelector('#score-p2-name').textContent = p2 ? p2.team_name : 'BYE';

    container.querySelector('#score-val-1').value = match.score1 || 0;
    container.querySelector('#score-val-2').value = match.score2 || 0;

    container.querySelector('#match-score-modal-title').textContent = `Partida: ${match.round_name}`;

    modal.classList.remove('hidden');
}

function openAddParticipantModal(container, tourn) {
    const modal = container.querySelector('#add-participant-modal');
    if (!modal) return;
    container.querySelector('#add-participant-form').reset();
    modal.classList.remove('hidden');
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
// Configuración de Formularios y Modales
// ============================================================
function setupModals(container) {
    // Cerrar modales
    container.querySelectorAll('.tournament-close-modal').forEach(b => {
        b.addEventListener('click', () => container.querySelector('#tournament-modal')?.classList.add('hidden'));
    });
    container.querySelectorAll('.share-tourn-close').forEach(b => {
        b.addEventListener('click', () => container.querySelector('#tournament-share-modal')?.classList.add('hidden'));
    });
    container.querySelectorAll('.bracket-admin-close').forEach(b => {
        b.addEventListener('click', () => container.querySelector('#bracket-admin-modal')?.classList.add('hidden'));
    });
    container.querySelectorAll('.match-score-close').forEach(b => {
        b.addEventListener('click', () => container.querySelector('#match-score-modal')?.classList.add('hidden'));
    });
    container.querySelectorAll('.add-participant-close').forEach(b => {
        b.addEventListener('click', () => container.querySelector('#add-participant-modal')?.classList.add('hidden'));
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

    // Pestañas internas del Bracket Admin Modal
    container.querySelectorAll('.bracket-admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.subtab;
            container.querySelectorAll('.bracket-admin-tab-btn').forEach(b => b.classList.remove('bracket-admin-tab-btn--active'));
            btn.classList.add('bracket-admin-tab-btn--active');

            if (target === 'brackets') {
                container.querySelector('#bracket-admin-tree-pane')?.classList.remove('hidden');
                container.querySelector('#bracket-admin-participants-pane')?.classList.add('hidden');
            } else {
                container.querySelector('#bracket-admin-tree-pane')?.classList.add('hidden');
                container.querySelector('#bracket-admin-participants-pane')?.classList.remove('hidden');
            }
        });
    });

    // Toolbar de Brackets
    container.querySelector('#btn-admin-generate-brackets')?.addEventListener('click', () => {
        handleGenerateBrackets(container);
    });

    container.querySelector('#btn-admin-add-participant')?.addEventListener('click', () => {
        if (_currentManagingTourn) openAddParticipantModal(container, _currentManagingTourn);
    });

    container.querySelector('#btn-admin-declare-winner')?.addEventListener('click', () => {
        if (_currentManagingTourn) {
            openGrantPrizeModal(container, _currentManagingTourn, '1º Puesto', _currentManagingTourn.first_place?.name || '');
        }
    });

    // Formulario Crear / Editar Torneo
    const tournForm = container.querySelector('#tournament-form');
    tournForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const id = container.querySelector('#tourn-id').value;
        const title = container.querySelector('#tourn-title').value;
        const game = container.querySelector('#tourn-game').value;
        const date = container.querySelector('#tourn-date').value;
        const modality = container.querySelector('#tourn-modality')?.value || '2v2';
        const status = container.querySelector('#tourn-status').value;
        const maxParticipants = parseInt(container.querySelector('#tourn-participants').value, 10) || 16;
        const notes = container.querySelector('#tourn-notes').value;

        const firstPlace = {
            name: container.querySelector('#tourn-1st-name').value || 'Por definir',
            prize: container.querySelector('#tourn-1st-prize').value || 'Membresía Club Burgame'
        };
        const secondPlace = {
            name: container.querySelector('#tourn-2nd-name').value || 'Por definir',
            prize: container.querySelector('#tourn-2nd-prize').value || 'Premio secundario'
        };
        const thirdPlace = {
            name: container.querySelector('#tourn-3rd-name').value || 'Por definir',
            prize: container.querySelector('#tourn-3rd-prize').value || 'Consolación'
        };

        const newTourn = {
            title,
            game,
            date,
            modality,
            status,
            max_participants: maxParticipants,
            participantsCount: maxParticipants,
            first_place: firstPlace,
            second_place: secondPlace,
            third_place: thirdPlace,
            firstPlace,
            secondPlace,
            thirdPlace,
            notes
        };

        if (id) newTourn.id = id;

        await arcadeService.saveTournament(newTourn);
        showToast({ message: id ? 'Torneo actualizado' : 'Torneo creado con éxito', type: 'success' });
        container.querySelector('#tournament-modal').classList.add('hidden');
        refreshAllData(container);
    });

    // Formulario Match Score
    const matchScoreForm = container.querySelector('#match-score-form');
    matchScoreForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const matchId = container.querySelector('#score-match-id').value;
        const p1Id = container.querySelector('#score-p1-id').value;
        const p2Id = container.querySelector('#score-p2-id').value;
        const s1 = parseInt(container.querySelector('#score-val-1').value, 10) || 0;
        const s2 = parseInt(container.querySelector('#score-val-2').value, 10) || 0;

        if (s1 === s2) {
            showToast({ message: 'Debe haber un ganador (partida sin empate)', type: 'warning' });
            return;
        }

        const winnerId = s1 > s2 ? p1Id : p2Id;

        try {
            const res = await arcadeService.updateMatchScore(matchId, s1, s2, winnerId);
            container.querySelector('#match-score-modal').classList.add('hidden');
            showToast({ message: '¡Resultado registrado! El ganador avanzó al siguiente partido.', type: 'success' });

            if (res.tournamentFinished) {
                showToast({ message: '🏆 ¡GRAN FINAL CONCLUIDA! Ya podés premiar a los campeones.', type: 'success' });
            }

            await refreshBracketAdminData(container);
            refreshAllData(container);
        } catch (err) {
            console.error('Error al actualizar score:', err);
            showToast({ message: err.message, type: 'error' });
        }
    });

    // Formulario Inscripción Presencial
    const addPartForm = container.querySelector('#add-participant-form');
    addPartForm?.addEventListener('submit', async e => {
        e.preventDefault();
        if (!_currentManagingTourn) return;

        const team = container.querySelector('#admin-reg-team').value;
        const cap = container.querySelector('#admin-reg-cap').value;
        const phone = container.querySelector('#admin-reg-phone').value;
        const p2 = container.querySelector('#admin-reg-p2').value;

        try {
            await arcadeService.registerParticipant({
                tournament_id: _currentManagingTourn.id,
                team_name: team,
                captain_name: cap,
                captain_phone: phone,
                player2_name: p2,
                status: 'checked_in'
            });

            container.querySelector('#add-participant-modal').classList.add('hidden');
            showToast({ message: `Equipo "${team}" inscripto con éxito`, type: 'success' });
            await refreshBracketAdminData(container);
        } catch (err) {
            showToast({ message: err.message, type: 'error' });
        }
    });

    // Formulario Otorgar Membresía Premio
    const grantForm = container.querySelector('#grant-prize-form');
    grantForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const tournTitle = container.querySelector('#grant-tourn-title').value;
        const placeName = container.querySelector('#grant-place-name').value;
        const customerId = container.querySelector('#grant-customer-select').value;

        if (!customerId) {
            showToast({ message: 'Seleccione un cliente', type: 'warning' });
            return;
        }

        try {
            await arcadeService.grantTournamentMembership(customerId, tournTitle, placeName);
            showToast({ message: `¡Membresía VIP oficial (0 Gs) otorgada con éxito!`, type: 'success' });
            container.querySelector('#grant-prize-modal').classList.add('hidden');
        } catch (err) {
            console.error('Error al otorgar premio:', err);
            showToast({ message: err.message || 'Error al otorgar membresía', type: 'error' });
        }
    });

    // Formulario Score Manual
    const manualForm = container.querySelector('#manual-score-form');
    manualForm?.addEventListener('submit', async e => {
        e.preventDefault();
        const initials = container.querySelector('#manual-initials').value;
        const score = container.querySelector('#manual-score').value;

        try {
            await arcadeService.saveScore(initials, score);
            showToast({ message: 'Puntaje registrado en el ranking', type: 'success' });
            container.querySelector('#manual-score-modal').classList.add('hidden');
            refreshAllData(container);
        } catch (err) {
            showToast({ message: err.message || 'Error al guardar puntaje', type: 'error' });
        }
    });

    // Búsqueda en selector de clientes
    const searchInput = container.querySelector('#grant-customer-search');
    searchInput?.addEventListener('input', e => {
        filterCustomerOptions(container, e.target.value);
    });
}

function openTournamentModal(container, tourn = null) {
    const modal = container.querySelector('#tournament-modal');
    const titleEl = container.querySelector('#tournament-modal-title');
    container.querySelector('#tournament-form').reset();

    if (tourn) {
        titleEl.textContent = '✏️ Editar Torneo Gamer';
        container.querySelector('#tourn-id').value = tourn.id;
        container.querySelector('#tourn-title').value = tourn.title || '';
        container.querySelector('#tourn-game').value = tourn.game || '';
        container.querySelector('#tourn-date').value = tourn.date || '';
        container.querySelector('#tourn-modality').value = tourn.modality || '2v2';
        container.querySelector('#tourn-status').value = tourn.status || 'active';
        container.querySelector('#tourn-participants').value = tourn.max_participants || tourn.participantsCount || 16;
        container.querySelector('#tourn-1st-name').value = tourn.firstPlace?.name || tourn.first_place?.name || '';
        container.querySelector('#tourn-1st-prize').value = tourn.firstPlace?.prize || tourn.first_place?.prize || '';
        container.querySelector('#tourn-2nd-name').value = tourn.secondPlace?.name || tourn.second_place?.name || '';
        container.querySelector('#tourn-2nd-prize').value = tourn.secondPlace?.prize || tourn.second_place?.prize || '';
        container.querySelector('#tourn-3rd-name').value = tourn.thirdPlace?.name || tourn.third_place?.name || '';
        container.querySelector('#tourn-3rd-prize').value = tourn.thirdPlace?.prize || tourn.third_place?.prize || '';
        container.querySelector('#tourn-notes').value = tourn.notes || '';
    } else {
        titleEl.textContent = '🏆 Nuevo Torneo Gamer';
        container.querySelector('#tourn-id').value = '';
        container.querySelector('#tourn-date').value = new Date().toISOString().split('T')[0];
        container.querySelector('#tourn-1st-prize').value = 'Membresía Club Burgame 1 Mes';
        container.querySelector('#tourn-status').value = 'upcoming';
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
    const tournaments = await arcadeService.getTournaments();
    renderTournamentsList(container);
    renderQuickScores(container);
    renderFullScoresList(container);

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
