// ============================================================
// Portal Público de Torneos — Burgame Gaming Arena (Estilo Challonge)
// Carga datos vía arcadeService, permite inscripción pública
// y visualización de brackets en tiempo real.
// ============================================================

import { arcadeService } from '../services/arcade-service.js';
import { showToast } from '../components/toast.js';

let _tournament = null;
let _participants = [];
let _matches = [];
let _pollInterval = null;

document.addEventListener('DOMContentLoaded', initTorneoPortal);

async function initTorneoPortal() {
    const appEl = document.getElementById('torneo-app');
    if (!appEl) return;

    const params = new URLSearchParams(window.location.search);
    let tournamentId = params.get('id');

    try {
        if (!tournamentId) {
            // Si no se pasó id, cargar el torneo más reciente
            const all = await arcadeService.getTournaments();
            const activeOrUpcoming = all.find(t => t.status === 'active') || all.find(t => t.status === 'upcoming') || all[0];
            if (activeOrUpcoming) {
                tournamentId = activeOrUpcoming.id;
            }
        }

        if (!tournamentId) {
            appEl.innerHTML = `
                <div class="torneo-card" style="text-align: center; max-width: 500px; margin: 4rem auto;">
                    <h2>🎮 No hay torneos disponibles</h2>
                    <p style="color: var(--text-muted);">Pronto anunciaremos nuevos torneos en Burgame Gaming Arena.</p>
                </div>
            `;
            return;
        }

        await loadTournamentData(tournamentId);
        renderTournamentPortal(appEl);

        // Si el torneo está en curso, actualizar brackets cada 15 segundos
        if (_tournament.status === 'active') {
            _pollInterval = setInterval(async () => {
                await refreshMatchesOnly();
            }, 15000);
        }
    } catch (err) {
        console.error('Error al iniciar portal de torneo:', err);
        appEl.innerHTML = `
            <div class="torneo-card" style="text-align: center; max-width: 500px; margin: 4rem auto;">
                <h2>⚠️ Error al cargar el evento</h2>
                <p style="color: var(--text-muted);">${err.message}</p>
                <button class="btn btn--primary btn--sm" onclick="location.reload()">Reintentar</button>
            </div>
        `;
    }
}

async function loadTournamentData(tournamentId) {
    _tournament = await arcadeService.getTournamentById(tournamentId);
    if (!_tournament) throw new Error('Torneo no encontrado');
    _participants = _tournament.participants || [];
    _matches = _tournament.matches || [];
}

async function refreshMatchesOnly() {
    if (!_tournament) return;
    try {
        const fresh = await arcadeService.getMatches(_tournament.id);
        if (fresh && fresh.length > 0) {
            _matches = fresh;
            renderBracketsPane();
        }
    } catch (e) {
        console.warn('Error polling matches:', e);
    }
}

function renderTournamentPortal(appEl) {
    const isFinished = _tournament.status === 'finished';
    const isActive = _tournament.status === 'active';
    const isUpcoming = _tournament.status === 'upcoming';

    const statusLabel = isFinished ? '🏆 Finalizado' : isActive ? '⚡ En Curso (En Vivo)' : '📅 Próximamente';
    const statusBadgeClass = isFinished ? 'finished' : isActive ? 'active' : 'upcoming';

    // Formato de fecha
    let dateFormatted = _tournament.date;
    try {
        const d = new Date(_tournament.date + 'T' + (_tournament.start_time || '19:00'));
        dateFormatted = d.toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    } catch {
        dateFormatted = _tournament.date;
    }

    appEl.innerHTML = `
        <!-- Hero Header -->
        <header class="torneo-hero">
            <div class="torneo-hero__top">
                <div class="torneo-hero__brand">
                    <img src="BurgameLogoTrazoAmarillo.png" alt="Burgame Arena" class="torneo-hero__logo">
                    <span class="torneo-hero__arena-tag">Gaming Arena</span>
                </div>
                <div class="torneo-badge torneo-badge--status-${statusBadgeClass}">
                    ${statusLabel}
                </div>
            </div>

            <h1 class="torneo-hero__title">${_tournament.title}</h1>

            <div class="torneo-hero__badges">
                <span class="torneo-badge torneo-badge--game">🎮 ${_tournament.game}</span>
                <span class="torneo-badge">👥 Modalidad: ${_tournament.modality || '2v2'}</span>
                <span class="torneo-badge">📅 ${dateFormatted}</span>
                <span class="torneo-badge">⚔️ ${_participants.length} / ${_tournament.max_participants || 16} Inscriptos</span>
            </div>

            <!-- Countdown / Info strip -->
            <div class="torneo-countdown">
                <span>📍 <strong>Lugar:</strong> Salón Principal Burgame (Av. Central #123)</span>
            </div>
        </header>

        <!-- Navegación de Pestañas -->
        <nav class="torneo-nav-tabs">
            <button class="torneo-nav-btn torneo-nav-btn--active" data-tab="info">
                📋 Info & Premios
            </button>
            <button class="torneo-nav-btn" data-tab="register">
                ✍️ Inscribirse Online
            </button>
            <button class="torneo-nav-btn" data-tab="brackets">
                ⚔️ Cuadro en Vivo (Brackets)
            </button>
        </nav>

        <!-- ==========================================
             PESTAÑA 1: INFO & PREMIOS
             ========================================== -->
        <section class="torneo-tab-pane torneo-tab-pane--active" id="pane-info">
            <div class="torneo-info-grid">
                <!-- Columna Izquierda: Reglas y Modalidad -->
                <div class="torneo-card">
                    <h3 class="torneo-card__title">📖 Reglamento y Formato del Evento</h3>
                    <p style="font-size: 0.9rem; line-height: 1.6; color: #E0E0E0; margin-bottom: 1.25rem;">
                        ${_tournament.rules || 'Modalidad de eliminación simple al mejor de 3 partidos (BO3). Gran final al mejor de 5 (BO5). Respeto obligatorio entre competidores.'}
                    </p>

                    <div style="background: rgba(255, 215, 0, 0.08); border-left: 3px solid var(--color-primary); padding: 0.85rem; border-radius: 4px; font-size: 0.85rem; margin-bottom: 1rem;">
                        <strong>🎮 Consolas y Mandos:</strong> Contamos con mandos oficiales de PS5 y Switch disponibles, o podés traer tu propio mando calibrado.
                    </div>

                    <div class="location-box">
                        <div>🍔 <strong>Comida & Barra:</strong> Toda la carta de smash burgers, papas y bebidas disponible durante todo el torneo.</div>
                        <div>📱 <strong>Contacto / Soporte:</strong> Escribinos por WhatsApp para dudas o confirmación de asistencia.</div>
                    </div>
                </div>

                <!-- Columna Derecha: Escala Oficial de Premios -->
                <div class="torneo-card">
                    <h3 class="torneo-card__title">🏆 Premios Oficiales Burgame</h3>
                    <div class="prizes-list">
                        <!-- 1er Puesto -->
                        <div class="prize-item prize-item--1st">
                            <span class="prize-medal">🥇</span>
                            <div class="prize-info">
                                <h4>1º Puesto — CAMPEÓN</h4>
                                <p style="color: #FFD700; font-weight: bold;">
                                    ${_tournament.first_place?.prize || _tournament.prize_pool?.first || 'Membresía VIP Club Burgame + Burger Fatality'}
                                </p>
                            </div>
                        </div>

                        <!-- 2do Puesto -->
                        <div class="prize-item">
                            <span class="prize-medal">🥈</span>
                            <div class="prize-info">
                                <h4>2º Puesto — SUBCAMPEÓN</h4>
                                <p>
                                    ${_tournament.second_place?.prize || _tournament.prize_pool?.second || '2x Porciones de Papas XL + Bebidas'}
                                </p>
                            </div>
                        </div>

                        <!-- 3er Puesto -->
                        <div class="prize-item">
                            <span class="prize-medal">🥉</span>
                            <div class="prize-info">
                                <h4>3º Puesto</h4>
                                <p>
                                    ${_tournament.third_place?.prize || _tournament.prize_pool?.third || 'Cervezas Artesanales o Bebidas'}
                                </p>
                            </div>
                        </div>
                    </div>

                    ${isFinished && _tournament.first_place?.name ? `
                        <div style="margin-top: 1.5rem; background: rgba(0, 230, 118, 0.1); border: 1px solid #00E676; padding: 1rem; border-radius: 8px; text-align: center;">
                            <span style="font-size: 0.75rem; font-weight: 800; color: #00E676; text-transform: uppercase;">👑 Ganador Oficial</span>
                            <h4 style="margin: 0.3rem 0; font-size: 1.2rem; color: #FFF;">${_tournament.first_place.name}</h4>
                            <span style="font-size: 0.8rem; color: var(--text-muted);">¡Felicitaciones a los campeones del torneo!</span>
                        </div>
                    ` : ''}
                </div>
            </div>
        </section>

        <!-- ==========================================
             PESTAÑA 2: INSCRIPCIÓN ONLINE
             ========================================== -->
        <section class="torneo-tab-pane" id="pane-register">
            <div class="registration-form-card" id="registration-container">
                ${renderRegistrationFormContent()}
            </div>
        </section>

        <!-- ==========================================
             PESTAÑA 3: CUADRO EN VIVO (BRACKETS)
             ========================================== -->
        <section class="torneo-tab-pane" id="pane-brackets">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="margin: 0; font-size: 1.1rem; color: var(--color-primary);">⚔️ Árbol de Eliminación</h3>
                <button class="btn btn--secondary btn--sm" id="btn-manual-refresh-brackets">
                    🔄 Actualizar Cuadro
                </button>
            </div>
            <div class="brackets-viewport">
                <div class="brackets-tree-container" id="brackets-tree-container">
                    ${renderBracketsTreeHtml()}
                </div>
            </div>
        </section>
    `;

    setupTabsHandlers(appEl);
    setupRegistrationHandlers(appEl);

    appEl.querySelector('#btn-manual-refresh-brackets')?.addEventListener('click', async () => {
        const btn = appEl.querySelector('#btn-manual-refresh-brackets');
        btn.textContent = 'Cargando...';
        await refreshMatchesOnly();
        btn.textContent = '🔄 Actualizar Cuadro';
        showToast({ message: 'Cuadro actualizado', type: 'info' });
    });
}

function setupTabsHandlers(appEl) {
    const tabBtns = appEl.querySelectorAll('.torneo-nav-btn');
    const panes = appEl.querySelectorAll('.torneo-tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.dataset.tab;
            if (!target) return;

            tabBtns.forEach(b => b.classList.remove('torneo-nav-btn--active'));
            panes.forEach(p => p.classList.remove('torneo-tab-pane--active'));

            btn.classList.add('torneo-nav-btn--active');
            appEl.querySelector(`#pane-${target}`)?.classList.add('torneo-tab-pane--active');
        });
    });
}

function renderRegistrationFormContent() {
    if (_tournament.status === 'finished') {
        return `
            <div style="text-align: center; padding: 2rem 1rem;">
                <div style="font-size: 3rem; margin-bottom: 0.5rem;">🏁</div>
                <h3 style="color: #FFF;">Inscripciones Finalizadas</h3>
                <p style="color: var(--text-muted); font-size: 0.85rem;">Este torneo ya concluyó. Revisá la pestaña de Brackets para ver los resultados.</p>
            </div>
        `;
    }

    if (_tournament.registration_open === false) {
        return `
            <div style="text-align: center; padding: 2rem 1rem;">
                <div style="font-size: 3rem; margin-bottom: 0.5rem;">🔒</div>
                <h3 style="color: #FFF;">Inscripciones Cerradas</h3>
                <p style="color: var(--text-muted); font-size: 0.85rem;">Los cupos fueron completados o las llaves ya comenzaron. Podés consultar al staff de Burgame si hay vacantes de última hora.</p>
            </div>
        `;
    }

    const is2v2 = (_tournament.modality || '').toLowerCase().includes('2v2');

    return `
        <div class="registration-form-header">
            <h3>🎮 Formulario de Inscripción Oficial</h3>
            <p>Completá los datos de tu equipo para asegurar tu lugar en el cuadro del torneo.</p>
        </div>

        <form id="public-registration-form">
            <div class="form-group" style="margin-bottom: 1rem;">
                <label class="form-label">Nombre del Equipo o Gamer Tag *</label>
                <input type="text" id="reg-team-name" class="form-input" placeholder="Ej: Los Pumas Gamer, ShadowNinja" required>
            </div>

            <!-- Capitán / Jugador 1 -->
            <div class="form-group-player">
                <div class="form-player-title">👤 Jugador 1 (Capitán)</div>
                <div class="form-group" style="margin-bottom: 0.75rem;">
                    <label class="form-label">Nombre y Apellido *</label>
                    <input type="text" id="reg-captain-name" class="form-input" placeholder="Ej: Matias Ramirez" required>
                </div>
                <div class="form-group">
                    <label class="form-label">Número de WhatsApp (Notificaciones) *</label>
                    <input type="tel" id="reg-captain-phone" class="form-input" placeholder="0981 123456" required>
                </div>
            </div>

            <!-- Jugador 2 (si aplica) -->
            ${is2v2 ? `
                <div class="form-group-player">
                    <div class="form-player-title">👥 Jugador 2 (Compañero)</div>
                    <div class="form-group" style="margin-bottom: 0.75rem;">
                        <label class="form-label">Nombre y Apellido</label>
                        <input type="text" id="reg-player2-name" class="form-input" placeholder="Ej: Lucas Gomez">
                    </div>
                    <div class="form-group">
                        <label class="form-label">Teléfono / WhatsApp</label>
                        <input type="tel" id="reg-player2-phone" class="form-input" placeholder="0971 654321">
                    </div>
                </div>
            ` : ''}

            <div style="margin: 1.25rem 0;">
                <button type="submit" class="btn btn--primary" style="width: 100%; padding: 0.85rem; font-size: 1rem; font-weight: 800;">
                    🚀 Confirmar Inscripción al Torneo
                </button>
            </div>
            <p style="font-size: 0.72rem; color: var(--text-muted); text-align: center; margin: 0;">
                Al inscribirte aceptás el reglamento del torneo y la puntualidad para el check-in en el salón.
            </p>
        </form>
    `;
}

function setupRegistrationHandlers(appEl) {
    const form = appEl.querySelector('#public-registration-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Procesando inscripción...';

        try {
            const teamName = form.querySelector('#reg-team-name')?.value;
            const captainName = form.querySelector('#reg-captain-name')?.value;
            const captainPhone = form.querySelector('#reg-captain-phone')?.value;
            const player2Name = form.querySelector('#reg-player2-name')?.value || '';
            const player2Phone = form.querySelector('#reg-player2-phone')?.value || '';

            const newParticipant = await arcadeService.registerParticipant({
                tournament_id: _tournament.id,
                team_name: teamName,
                captain_name: captainName,
                captain_phone: captainPhone,
                player2_name: player2Name,
                player2_phone: player2Phone
            });

            _participants.push(newParticipant);

            // Renderizar Pase Gamer de Éxito
            const container = appEl.querySelector('#registration-container');
            const waMsg = encodeURIComponent(`¡Hola Burgame! Inscribí a mi equipo "${teamName}" para el ${ _tournament.title } (Capitán: ${captainName}).`);
            const waUrl = `https://api.whatsapp.com/send?phone=595981000000&text=${waMsg}`;

            container.innerHTML = `
                <div class="gamer-pass-card">
                    <div class="gamer-pass-icon">🎟️</div>
                    <span class="gamer-pass-seed">SEED #${newParticipant.seed || _participants.length}</span>
                    <div class="gamer-pass-team">${newParticipant.team_name}</div>
                    <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.25rem;">
                        Capitán: <strong>${newParticipant.captain_name}</strong> (${newParticipant.captain_phone})
                    </p>

                    <div style="background: rgba(0, 230, 118, 0.15); border: 1px solid #00E676; padding: 0.75rem; border-radius: 8px; font-size: 0.82rem; color: #00E676; margin-bottom: 1.25rem;">
                        ✅ ¡Inscripción registrada con éxito en Burgame Gaming Arena!
                    </div>

                    <a href="${waUrl}" target="_blank" class="btn btn--primary" style="display: block; width: 100%; box-sizing: border-box; text-decoration: none; padding: 0.75rem; margin-bottom: 0.5rem; font-weight: 700;">
                        📲 Enviar Comprobante por WhatsApp
                    </a>

                    <button class="btn btn--secondary btn--sm" id="btn-new-reg" style="width: 100%;">
                        Inscribir otro equipo
                    </button>
                </div>
            `;

            container.querySelector('#btn-new-reg')?.addEventListener('click', () => {
                container.innerHTML = renderRegistrationFormContent();
                setupRegistrationHandlers(appEl);
            });

            showToast({ message: '¡Inscripción confirmada! Te esperamos en el salón.', type: 'success' });
        } catch (err) {
            console.error('Error al registrar participante:', err);
            showToast({ message: err.message, type: 'error' });
            submitBtn.disabled = false;
            submitBtn.textContent = '🚀 Confirmar Inscripción al Torneo';
        }
    });
}

function renderBracketsPane() {
    const container = document.getElementById('brackets-tree-container');
    if (container) {
        container.innerHTML = renderBracketsTreeHtml();
    }
}

function renderBracketsTreeHtml() {
    if (!_matches || _matches.length === 0) {
        return `
            <div style="text-align: center; padding: 3rem 1rem; color: var(--text-muted); width: 100%;">
                <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">⚔️</div>
                <h4 style="color: #FFF; margin-bottom: 0.25rem;">Cuadro en fase de sorteo</h4>
                <p style="font-size: 0.85rem;">Las llaves oficiales se publicarán una vez confirmados los equipos.</p>
            </div>
        `;
    }

    // Separar partidos principales del 3er puesto
    const mainMatches = _matches.filter(m => !m.is_third_place);
    const thirdPlaceMatch = _matches.find(m => m.is_third_place);

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
            // Agrupar en pares para trazar las ramas estilo Challonge
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
                            ${renderMatchCardHtml(mTop)}
                        </div>
                        ${mBottom ? `
                            <div class="bracket-match-slot bracket-match-slot--bottom">
                                ${renderMatchCardHtml(mBottom)}
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
            // Gran Final (Single Match + Branch al Campeón)
            const finalMatch = matchesInRound[0];
            pairsHtml = `
                <div class="bracket-pair bracket-pair--single">
                    <div class="bracket-match-slot">
                        ${renderMatchCardHtml(finalMatch)}
                    </div>
                    <div class="bracket-single-stem"></div>
                </div>
            `;

            if (thirdPlaceMatch) {
                pairsHtml += `
                    <div class="third-place-container">
                        <div class="third-place-title">🥉 3er Puesto (Bronce)</div>
                        <div class="bracket-match-slot">
                            ${renderMatchCardHtml(thirdPlaceMatch)}
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
    const champ = _tournament.first_place?.name 
        ? _tournament.first_place 
        : (finalMatch?.winner_id ? _participants.find(p => p.id === finalMatch.winner_id) : null);

    const champName = champ ? (champ.team_name || champ.name) : 'Por Definir';
    const isChampDefined = !!champ;
    const champPrize = _tournament.first_place?.prize || _tournament.prize_pool?.first || 'Membresía Club Burgame VIP';

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
            </div>
        </div>
    `;

    return columnsHtml;
}

function renderMatchCardHtml(match) {
    if (!match) return '';

    const p1 = _participants.find(p => p.id === match.participant1_id);
    const p2 = _participants.find(p => p.id === match.participant2_id);

    const isCompleted = match.status === 'completed';
    const isLive = match.status === 'in_progress';

    const p1Name = p1 ? p1.team_name : (match.round_index === 1 ? 'BYE (Pase libre)' : 'Por definir');
    const p2Name = p2 ? p2.team_name : (match.round_index === 1 ? 'BYE (Pase libre)' : 'Por definir');

    const p1Won = isCompleted && match.winner_id === match.participant1_id;
    const p2Won = isCompleted && match.winner_id === match.participant2_id;

    const statusText = isCompleted ? 'Finalizado' : isLive ? '🔥 EN VIVO' : 'Por Jugar';
    const statusClass = isCompleted ? 'completed' : isLive ? 'in_progress' : 'pending';

    return `
        <div class="match-card ${isCompleted ? 'match-card--completed' : ''} ${isLive ? 'match-card--in_progress' : ''}">
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
        </div>
    `;
}
