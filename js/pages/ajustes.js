import { qrAuthService } from '../services/qr-auth-service.js';
import { settingsService, DEFAULT_SETTINGS } from '../services/settings-service.js';
import { showToast } from '../components/toast.js';

let activeTab = 'company'; // 'company' | 'kitchen' | 'qr' | 'club' | 'backup'
let previewAudio = null;

export async function renderAjustesPage() {
    const container = document.createElement('div');
    container.className = 'ajustes-page';

    renderPageContent(container);
    return container;
}

function renderPageContent(container) {
    const settings = settingsService.getSettings();
    const creds = qrAuthService.getCurrentCredentials();
    const customerUrl = qrAuthService.buildCustomerUrl(window.location.origin);
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(customerUrl)}&color=FFD700&bgcolor=0E1017`;

    container.innerHTML = `
        <header class="page-header" style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 0.5rem;">
            <div class="page-header__info">
                <h1 style="display: flex; align-items: center; gap: 0.6rem;">
                    ⚙️ CONFIGURACIÓN & ADMINISTRACIÓN DE ÉLITE
                </h1>
                <p>Identidad empresarial, tickets térmicos, alertas de cocina KDS, Club Burgame y respaldos</p>
            </div>
            <div style="display: flex; gap: 0.5rem;">
                <button id="btn-save-all-top" class="btn btn--primary" style="font-weight: 800; box-shadow: 0 0 12px var(--color-primary-glow);">
                    💾 Guardar Cambios
                </button>
            </div>
        </header>

        <!-- Barra de Pestañas Principales -->
        <div class="ajustes-tabs-bar">
            <button class="ajustes-tab-btn ${activeTab === 'company' ? 'active' : ''}" data-tab="company">
                🏢 Empresa & Tickets
            </button>
            <button class="ajustes-tab-btn ${activeTab === 'kitchen' ? 'active' : ''}" data-tab="kitchen">
                👨‍🍳 Cocina KDS & Sonidos
            </button>
            <button class="ajustes-tab-btn ${activeTab === 'qr' ? 'active' : ''}" data-tab="qr">
                📱 QR Dinámico & Geocerca
            </button>
            <button class="ajustes-tab-btn ${activeTab === 'club' ? 'active' : ''}" data-tab="club">
                👑 Club Burgame
            </button>
            <button class="ajustes-tab-btn ${activeTab === 'backup' ? 'active' : ''}" data-tab="backup">
                🛡️ Diagnóstico & Backup
            </button>
        </div>

        <!-- Contenido según la pestaña activa -->
        <div class="ajustes-card" id="ajustes-tab-content">
            ${renderActiveTabContent(activeTab, settings, creds, customerUrl, qrApiUrl)}
        </div>

        <!-- Barra de Guardado Inferior -->
        <div class="ajustes-footer-bar">
            <button id="btn-reset-defaults" class="btn btn--secondary" style="color: #FF5252; border-color: rgba(255, 61, 113, 0.4);">
                ↺ Restaurar Valores de Fábrica
            </button>
            <button id="btn-save-all-bottom" class="btn btn--primary" style="font-weight: 800; font-size: 0.9rem; padding: 0.6rem 1.4rem; box-shadow: 0 0 14px var(--color-primary-glow);">
                💾 Guardar Todos los Ajustes
            </button>
        </div>
    `;

    setupEvents(container);
}

function renderActiveTabContent(tab, settings, creds, customerUrl, qrApiUrl) {
    if (tab === 'company') {
        return `
            <div class="ajustes-section-header">
                <div>
                    <h3 class="ajustes-section-title">🏢 Identidad del Negocio & Impresión Térmica</h3>
                    <div class="ajustes-section-desc">Datos fiscales paraguayos y configuración de tickets para impresora térmica (80mm / 58mm).</div>
                </div>
            </div>

            <div class="ajustes-grid">
                <div class="ajustes-field">
                    <label>Nombre de Fantasía Comercial:</label>
                    <input type="text" id="setting-business-name" value="${settings.businessName}">
                    <span class="ajustes-field-help">Encabezado principal en tickets y portal web.</span>
                </div>

                <div class="ajustes-field">
                    <label>Razón Social / Titular:</label>
                    <input type="text" id="setting-legal-name" value="${settings.legalName}">
                    <span class="ajustes-field-help">Nombre de la sociedad o propietario legal.</span>
                </div>

                <div class="ajustes-field">
                    <label>RUC Fiscal (Paraguay):</label>
                    <input type="text" id="setting-tax-id" value="${settings.taxId}" placeholder="Ej: 80012345-6">
                    <span class="ajustes-field-help">Registro Único de Contribuyentes para liquidación IVA 10%.</span>
                </div>

                <div class="ajustes-field">
                    <label>Teléfono / WhatsApp de Atención:</label>
                    <input type="text" id="setting-phone" value="${settings.phone}">
                    <span class="ajustes-field-help">Contacto impreso en tickets para consultas o delivery.</span>
                </div>

                <div class="ajustes-field" style="grid-column: 1 / -1;">
                    <label>Dirección del Local:</label>
                    <input type="text" id="setting-address" value="${settings.address}">
                    <span class="ajustes-field-help">Ubicación física del restaurante en Asunción / Gran Asunción.</span>
                </div>

                <div class="ajustes-field">
                    <label>Formato de Impresora Térmica:</label>
                    <select id="setting-ticket-width">
                        <option value="80mm" ${settings.ticketWidth === '80mm' ? 'selected' : ''}>80 mm (Estándar Punto de Venta)</option>
                        <option value="58mm" ${settings.ticketWidth === '58mm' ? 'selected' : ''}>58 mm (Compacto / Portátil)</option>
                    </select>
                    <span class="ajustes-field-help">Ancho del papel térmico continuo para tickets y auditorías.</span>
                </div>

                <div class="ajustes-field">
                    <label>Impresión Automática:</label>
                    <div class="toggle-switch-wrapper">
                        <span style="font-size: 0.85rem;">Imprimir comprobante al cobrar comanda</span>
                        <label class="toggle-switch">
                            <input type="checkbox" id="setting-auto-print" ${settings.autoPrintTicket ? 'checked' : ''}>
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>

                <div class="ajustes-field" style="grid-column: 1 / -1;">
                    <label>Mensaje de Agradecimiento al Pie del Ticket:</label>
                    <textarea id="setting-ticket-footer" rows="2">${settings.ticketFooter}</textarea>
                    <span class="ajustes-field-help">Texto que saldrá al final del comprobante térmico entregado al cliente.</span>
                </div>
            </div>
        `;
    }

    if (tab === 'kitchen') {
        return `
            <div class="ajustes-section-header">
                <div>
                    <h3 class="ajustes-section-title">👨‍🍳 Pantalla de Cocina (KDS) & Alertas Sonoras</h3>
                    <div class="ajustes-section-desc">Personaliza el tono retro gamer y el volumen de aviso al entrar una comanda a cocina.</div>
                </div>
            </div>

            <div class="ajustes-grid">
                <div class="ajustes-field">
                    <label>Tono de Notificación de Comanda:</label>
                    <select id="setting-kitchen-sound">
                        <option value="assets/item-get.mp3" ${settings.kitchenSound === 'assets/item-get.mp3' ? 'selected' : ''}>🗡️ Zelda: Ocarina of Time (Item Get)</option>
                        <option value="assets/item_get_pokemon.mp3" ${settings.kitchenSound === 'assets/item_get_pokemon.mp3' ? 'selected' : ''}>⚡ Pokémon (Item Obtained)</option>
                        <option value="pacman/app/style/audio/power_up.mp3" ${settings.kitchenSound === 'pacman/app/style/audio/power_up.mp3' ? 'selected' : ''}>👾 Pac-Man (Power Up)</option>
                        <option value="silent" ${settings.kitchenSound === 'silent' ? 'selected' : ''}>🔕 Silencioso (Sin sonido)</option>
                    </select>
                    <span class="ajustes-field-help">Suena automáticamente en la pantalla de cocina cada vez que ingresa una comanda.</span>
                </div>

                <div class="ajustes-field">
                    <label>Volumen de Alerta: <strong id="val-kitchen-volume" style="color: var(--color-primary);">${Math.round(settings.kitchenVolume * 100)}%</strong></label>
                    <input type="range" id="setting-kitchen-volume" min="0.1" max="1" step="0.05" value="${settings.kitchenVolume}">
                    <span class="ajustes-field-help">Ajusta la intensidad del altavoz para cocina ruidosa.</span>
                </div>

                <div class="sound-preview-card" style="grid-column: 1 / -1;">
                    <div>
                        <strong style="color: var(--color-primary); font-size: 0.95rem;">🔊 Prueba de Audio en Vivo</strong>
                        <p style="margin: 0.2rem 0 0 0; font-size: 0.8rem; color: var(--text-muted);">
                            Haz clic para escuchar cómo sonará la alerta en los parlantes de cocina.
                        </p>
                    </div>
                    <button id="btn-test-sound" class="btn btn--secondary" style="font-weight: 700; display: inline-flex; align-items: center; gap: 0.5rem;">
                        🔔 Reproducir Sonido
                    </button>
                </div>

                <div class="ajustes-field">
                    <label>Alerta de Demora Crítica en Cocina:</label>
                    <select id="setting-kitchen-delay">
                        <option value="15" ${settings.kitchenDelayWarningMinutes === 15 ? 'selected' : ''}>15 Minutos (Ritmo Rápido)</option>
                        <option value="20" ${settings.kitchenDelayWarningMinutes === 20 ? 'selected' : ''}>20 Minutos (Estándar Burgame)</option>
                        <option value="30" ${settings.kitchenDelayWarningMinutes === 30 ? 'selected' : ''}>30 Minutos (Días de Torneo / Mucha Demanda)</option>
                    </select>
                    <span class="ajustes-field-help">Comandas que superen este tiempo parpadearán en rojo en el monitor de cocina.</span>
                </div>
            </div>
        `;
    }

    if (tab === 'qr') {
        return `
            <div class="ajustes-section-header">
                <div>
                    <h3 class="ajustes-section-title">📱 Código QR Dinámico & Geocerca Anti-Fraude</h3>
                    <div class="ajustes-section-desc">Protección para evitar que clientes pidan desde sus casas sin estar en el salón.</div>
                </div>
                <a href="pantalla-qr.html" target="_blank" class="btn btn--primary btn--sm" style="display: flex; align-items: center; gap: 0.4rem;">
                    🖥️ Abrir Pantalla Mostrador (TV / Tablet)
                </a>
            </div>

            <div style="display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; background: rgba(255,215,0,0.05); padding: 1.25rem; border-radius: var(--radius-md); border: 1px solid var(--border-gold); margin-bottom: 1.5rem;">
                <img id="ajustes-qr-img" src="${qrApiUrl}" alt="QR Autopedido Dinámico" style="width: 130px; height: 130px; border-radius: 8px; border: 2px solid var(--color-primary); box-shadow: 0 0 15px var(--color-primary-glow);">
                
                <div style="display: flex; flex-direction: column; gap: 0.6rem; flex: 1; min-width: 260px;">
                    <div style="display: flex; align-items: center; gap: 0.8rem;">
                        <span style="font-weight: 700; font-size: 0.88rem;">PIN Actual del Mostrador:</span>
                        <span id="ajustes-pin-badge" style="font-family: var(--font-mono); font-size: 1.3rem; font-weight: 800; color: var(--color-primary); background: #000; padding: 0.2rem 0.8rem; border-radius: 6px; border: 1px dashed var(--color-primary);">
                            ${creds.pin}
                        </span>
                    </div>

                    <div style="font-size: 0.8rem; color: var(--text-muted);">
                        ⏳ Rota en: <strong id="ajustes-timer-label" style="color: var(--color-primary);">${Math.floor(creds.secondsRemaining / 60)}:${String(creds.secondsRemaining % 60).padStart(2, '0')} min</strong>
                    </div>

                    <div style="display: flex; gap: 0.6rem; margin-top: 0.3rem;">
                        <a href="${customerUrl}" target="_blank" class="btn btn--secondary btn--sm">
                            🔗 Probar Portal del Cliente
                        </a>
                        <a href="pantalla-qr.html" target="_blank" class="btn btn--primary btn--sm">
                            📺 Pantalla Completa
                        </a>
                    </div>
                </div>
            </div>

            <div class="ajustes-grid">
                <div class="ajustes-field">
                    <label>Latitud GPS del Local:</label>
                    <input type="number" step="0.0001" id="setting-gps-lat" value="${settings.gpsLat}">
                    <span class="ajustes-field-help">Coordenada geográfica central de Burgame.</span>
                </div>

                <div class="ajustes-field">
                    <label>Longitud GPS del Local:</label>
                    <input type="number" step="0.0001" id="setting-gps-lng" value="${settings.gpsLng}">
                    <span class="ajustes-field-help">Coordenada geográfica central de Burgame.</span>
                </div>

                <div class="ajustes-field">
                    <label>Radio Máximo de Tolerancia (Metros):</label>
                    <input type="number" id="setting-gps-radius" value="${settings.gpsRadiusMeters}">
                    <span class="ajustes-field-help">Distancia máxima en metros para validar que el cliente está físicamente en el local.</span>
                </div>

                <div class="ajustes-field">
                    <label>Frecuencia de Rotación del QR:</label>
                    <select id="setting-qr-rotation">
                        <option value="5" ${settings.qrRotationMinutes === 5 ? 'selected' : ''}>Cada 5 Minutos (Máxima Seguridad)</option>
                        <option value="10" ${settings.qrRotationMinutes === 10 ? 'selected' : ''}>Cada 10 Minutos (Recomendado)</option>
                        <option value="15" ${settings.qrRotationMinutes === 15 ? 'selected' : ''}>Cada 15 Minutos</option>
                    </select>
                    <span class="ajustes-field-help">Tiempo tras el cual el PIN y el código QR cambian automáticamente.</span>
                </div>
            </div>
        `;
    }

    if (tab === 'club') {
        return `
            <div class="ajustes-section-header">
                <div>
                    <h3 class="ajustes-section-title">👑 Club Burgame & Parámetros de Membresías</h3>
                    <div class="ajustes-section-desc">Control de precios de cuota, duraciones estándar y notificaciones de WhatsApp.</div>
                </div>
            </div>

            <div class="ajustes-grid">
                <div class="ajustes-field">
                    <label>Cuota Mensual Estándar (Gs.):</label>
                    <input type="number" id="setting-club-fee" value="${settings.clubFee}" step="5000">
                    <span class="ajustes-field-help">Monto sugerido por defecto al afiliar o renovar a un socio.</span>
                </div>

                <div class="ajustes-field">
                    <label>Duración Predeterminada (Días):</label>
                    <select id="setting-club-days">
                        <option value="30" ${settings.clubDefaultDays === 30 ? 'selected' : ''}>30 Días (Mensual)</option>
                        <option value="60" ${settings.clubDefaultDays === 60 ? 'selected' : ''}>60 Días (Bimestral)</option>
                        <option value="90" ${settings.clubDefaultDays === 90 ? 'selected' : ''}>90 Días (Temporada / Trimestral)</option>
                    </select>
                    <span class="ajustes-field-help">Período asignado automáticamente al cargar una nueva suscripción.</span>
                </div>

                <div class="ajustes-field">
                    <label>Días Previos para Alerta de Vencimiento:</label>
                    <select id="setting-club-warn-days">
                        <option value="3" ${settings.clubWarnDays === 3 ? 'selected' : ''}>3 Días Antes</option>
                        <option value="5" ${settings.clubWarnDays === 5 ? 'selected' : ''}>5 Días Antes (Recomendado)</option>
                        <option value="7" ${settings.clubWarnDays === 7 ? 'selected' : ''}>7 Días Antes (1 Semana)</option>
                    </select>
                    <span class="ajustes-field-help">Los socios aparecerán en amarillo en POS y Dashboard con esta anticipación.</span>
                </div>

                <div class="ajustes-field" style="grid-column: 1 / -1;">
                    <label>Plantilla de Mensaje de WhatsApp (Renovación):</label>
                    <textarea id="setting-club-msg" rows="3">${settings.clubRenewalMessage}</textarea>
                    <span class="ajustes-field-help">Variables disponibles: <code>{nombre}</code> (nombre del socio), <code>{dias}</code> (días restantes).</span>
                </div>
            </div>
        `;
    }

    if (tab === 'backup') {
        return `
            <div class="ajustes-section-header">
                <div>
                    <h3 class="ajustes-section-title">🛡️ Diagnóstico, Salud del Servidor & Respaldo de Base de Datos</h3>
                    <div class="ajustes-section-desc">Herramientas de recuperación ante desastres (Disaster Recovery) y chequeo de latencia.</div>
                </div>
            </div>

            <!-- Diagnóstico de Conexión en Tiempo Real -->
            <div class="diagnostic-box" style="margin-bottom: 1.5rem;">
                <div>
                    <strong style="color: var(--text-main); font-size: 0.95rem;">🛰️ Estado de Conexión con Supabase</strong>
                    <p style="margin: 0.2rem 0 0 0; font-size: 0.8rem; color: var(--text-muted);">
                        Mide la latencia de ida y vuelta (ping) hacia los servidores de la nube.
                    </p>
                </div>
                <div style="display: flex; align-items: center; gap: 0.75rem;">
                    <div id="dash-latency-result">
                        <span class="latency-badge latency-badge--good">🟢 Medir Ping</span>
                    </div>
                    <button id="btn-test-latency" class="btn btn--secondary btn--sm" style="font-weight: 700;">
                        🔄 Testear Latencia
                    </button>
                </div>
            </div>

            <!-- Caja de Respaldo Completo (Disaster Recovery) -->
            <div class="backup-card" style="margin-bottom: 1.5rem;">
                <div>
                    <strong style="color: #29B6F6; font-size: 1rem; display: flex; align-items: center; gap: 0.4rem;">
                        💾 Respaldo Integral del Sistema (Copia de Seguridad JSON)
                    </strong>
                    <p style="margin: 0.3rem 0 0 0; font-size: 0.82rem; color: var(--text-muted); max-width: 600px;">
                        Descarga instantáneamente en un solo archivo JSON todos los productos, categorías, catálogo de clientes, socios del club, historial de gastos y comandas.
                    </p>
                </div>
                <button id="btn-export-backup" class="btn btn--primary" style="font-weight: 800; font-size: 0.85rem; padding: 0.55rem 1.1rem; box-shadow: 0 0 12px var(--color-primary-glow);">
                    📥 Descargar Backup
                </button>
            </div>

            <!-- Limpieza de Caché y Mantenimiento Local -->
            <div class="ajustes-grid">
                <div class="ajustes-field">
                    <label>Mantenimiento de Caché del Navegador:</label>
                    <div style="display: flex; gap: 0.6rem; align-items: center; margin-top: 0.3rem;">
                        <button id="btn-clear-cache" class="btn btn--secondary btn--sm">
                            🧹 Purgar Caché Local
                        </button>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">Limpia la memoria intermedia de productos e imágenes.</span>
                    </div>
                </div>

                <div class="ajustes-field">
                    <label>Ficha Técnica del Sistema:</label>
                    <div style="font-size: 0.82rem; color: var(--text-muted); font-family: var(--font-mono); margin-top: 0.4rem;">
                        Versión: <strong>v2.5.0 Enterprise Arcade</strong><br>
                        Motor: <strong>Supabase Postgres 15 + Realtime WS</strong><br>
                        Almacenamiento: <strong>LocalStorage / SessionCache</strong>
                    </div>
                </div>
            </div>
        `;
    }

    return '';
}

function setupEvents(container) {
    // Manejo de cambio de pestañas
    container.querySelectorAll('.ajustes-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            activeTab = btn.dataset.tab;
            renderPageContent(container);
        });
    });

    // Evento Slider de volumen en pestaña kitchen
    const volumeSlider = container.querySelector('#setting-kitchen-volume');
    const volumeVal = container.querySelector('#val-kitchen-volume');
    if (volumeSlider && volumeVal) {
        volumeSlider.addEventListener('input', (e) => {
            volumeVal.textContent = `${Math.round(e.target.value * 100)}%`;
            if (previewAudio) previewAudio.volume = parseFloat(e.target.value);
        });
    }

    // Botón para probar sonido
    container.querySelector('#btn-test-sound')?.addEventListener('click', () => {
        const soundSrc = container.querySelector('#setting-kitchen-sound')?.value;
        const vol = parseFloat(container.querySelector('#setting-kitchen-volume')?.value || '0.8');

        if (!soundSrc || soundSrc === 'silent') {
            showToast({ message: 'El modo silencioso no emite sonidos', type: 'info' });
            return;
        }

        try {
            if (previewAudio) {
                previewAudio.pause();
                previewAudio.currentTime = 0;
            }
            previewAudio = new Audio(soundSrc);
            previewAudio.volume = vol;
            previewAudio.play().then(() => {
                showToast({ message: '🔔 Reproduciendo alerta sonora...', type: 'info' });
            }).catch(err => {
                showToast({ message: 'Autoplay bloqueado por el navegador: ' + err.message, type: 'warning' });
            });
        } catch (err) {
            showToast({ message: 'Error reproduciendo audio: ' + err.message, type: 'error' });
        }
    });

    // Botón para testear latencia con Supabase
    container.querySelector('#btn-test-latency')?.addEventListener('click', async () => {
        const resultEl = container.querySelector('#dash-latency-result');
        const btn = container.querySelector('#btn-test-latency');
        if (resultEl) resultEl.innerHTML = `<span class="latency-badge latency-badge--warn">⏳ Midiendo...</span>`;
        if (btn) btn.disabled = true;

        try {
            const res = await settingsService.testSupabaseLatency();
            if (res.ok) {
                let badgeClass = 'latency-badge--good';
                if (res.latencyMs > 250) badgeClass = 'latency-badge--warn';
                if (res.latencyMs > 800) badgeClass = 'latency-badge--bad';

                if (resultEl) {
                    resultEl.innerHTML = `<span class="latency-badge ${badgeClass}">🟢 ${res.latencyMs} ms (${res.latencyMs < 200 ? 'Excelente' : 'Aceptable'})</span>`;
                }
                showToast({ message: `Latencia de red: ${res.latencyMs} ms`, type: 'success' });
            } else {
                if (resultEl) {
                    resultEl.innerHTML = `<span class="latency-badge latency-badge--bad">🔴 Error: ${res.error}</span>`;
                }
                showToast({ message: 'Fallo al contactar servidor: ' + res.error, type: 'error' });
            }
        } finally {
            if (btn) btn.disabled = false;
        }
    });

    // Botón para descargar Backup Completo JSON
    container.querySelector('#btn-export-backup')?.addEventListener('click', async () => {
        const btn = container.querySelector('#btn-export-backup');
        const origText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '⏳ Generando Backup...';

        try {
            const stats = await settingsService.exportFullBackup();
            showToast({
                message: `✅ Backup generado (${stats.productsCount} productos, ${stats.customersCount} clientes, ${stats.ordersCount} órdenes)`,
                type: 'success'
            });
        } catch (err) {
            console.error('Error generando backup:', err);
            showToast({ message: 'Error al exportar backup: ' + err.message, type: 'error' });
        } finally {
            btn.disabled = false;
            btn.innerHTML = origText;
        }
    });

    // Botón purgar caché
    container.querySelector('#btn-clear-cache')?.addEventListener('click', () => {
        settingsService.clearLocalCaches();
        showToast({ message: '🧹 Caché local de productos purgado con éxito', type: 'success' });
    });

    // Botón para guardar todos los ajustes
    const handleSave = () => {
        try {
            const current = settingsService.getSettings();
            const payload = { ...current };

            // Leer campos si están presentes en el DOM actual
            const bName = container.querySelector('#setting-business-name');
            if (bName) payload.businessName = bName.value.trim();

            const lName = container.querySelector('#setting-legal-name');
            if (lName) payload.legalName = lName.value.trim();

            const taxId = container.querySelector('#setting-tax-id');
            if (taxId) payload.taxId = taxId.value.trim();

            const phone = container.querySelector('#setting-phone');
            if (phone) payload.phone = phone.value.trim();

            const address = container.querySelector('#setting-address');
            if (address) payload.address = address.value.trim();

            const tWidth = container.querySelector('#setting-ticket-width');
            if (tWidth) payload.ticketWidth = tWidth.value;

            const autoPrint = container.querySelector('#setting-auto-print');
            if (autoPrint) payload.autoPrintTicket = autoPrint.checked;

            const tFooter = container.querySelector('#setting-ticket-footer');
            if (tFooter) payload.ticketFooter = tFooter.value.trim();

            const kSound = container.querySelector('#setting-kitchen-sound');
            if (kSound) payload.kitchenSound = kSound.value;

            const kVol = container.querySelector('#setting-kitchen-volume');
            if (kVol) payload.kitchenVolume = parseFloat(kVol.value);

            const kDelay = container.querySelector('#setting-kitchen-delay');
            if (kDelay) payload.kitchenDelayWarningMinutes = parseInt(kDelay.value, 10);

            const gpsLat = container.querySelector('#setting-gps-lat');
            if (gpsLat) payload.gpsLat = parseFloat(gpsLat.value);

            const gpsLng = container.querySelector('#setting-gps-lng');
            if (gpsLng) payload.gpsLng = parseFloat(gpsLng.value);

            const gpsRad = container.querySelector('#setting-gps-radius');
            if (gpsRad) payload.gpsRadiusMeters = parseInt(gpsRad.value, 10);

            const qrRot = container.querySelector('#setting-qr-rotation');
            if (qrRot) payload.qrRotationMinutes = parseInt(qrRot.value, 10);

            const cFee = container.querySelector('#setting-club-fee');
            if (cFee) payload.clubFee = parseInt(cFee.value, 10);

            const cDays = container.querySelector('#setting-club-days');
            if (cDays) payload.clubDefaultDays = parseInt(cDays.value, 10);

            const cWarn = container.querySelector('#setting-club-warn-days');
            if (cWarn) payload.clubWarnDays = parseInt(cWarn.value, 10);

            const cMsg = container.querySelector('#setting-club-msg');
            if (cMsg) payload.clubRenewalMessage = cMsg.value.trim();

            settingsService.saveSettings(payload);
            showToast({ message: '💾 ¡Configuración guardada exitosamente!', type: 'success' });
        } catch (err) {
            console.error('Error guardando configuración:', err);
            showToast({ message: 'Error al guardar ajustes: ' + err.message, type: 'error' });
        }
    };

    container.querySelector('#btn-save-all-top')?.addEventListener('click', handleSave);
    container.querySelector('#btn-save-all-bottom')?.addEventListener('click', handleSave);

    // Botón restaurar valores de fábrica
    container.querySelector('#btn-reset-defaults')?.addEventListener('click', () => {
        if (confirm('¿Estás seguro de restablecer todos los ajustes a los valores predeterminados de Burgame?')) {
            settingsService.resetSettings();
            showToast({ message: 'Valores restablecidos por defecto', type: 'info' });
            renderPageContent(container);
        }
    });

    // Timer para actualizar PIN y cuenta regresiva en vivo si la pestaña QR está activa
    if (activeTab === 'qr') {
        const timerInterval = setInterval(() => {
            if (!container.isConnected || activeTab !== 'qr') {
                clearInterval(timerInterval);
                return;
            }
            const updated = qrAuthService.getCurrentCredentials();
            const pinBadge = container.querySelector('#ajustes-pin-badge');
            const timerLabel = container.querySelector('#ajustes-timer-label');
            if (pinBadge) pinBadge.textContent = updated.pin;
            if (timerLabel) {
                const m = Math.floor(updated.secondsRemaining / 60);
                const s = updated.secondsRemaining % 60;
                timerLabel.textContent = `${m}:${String(s).padStart(2, '0')} min`;
            }
        }, 1000);
    }
}

