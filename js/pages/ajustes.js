import { qrAuthService } from '../services/qr-auth-service.js';

export async function renderAjustesPage() {
    const container = document.createElement('div');
    container.className = 'ajustes-page';

    const creds = qrAuthService.getCurrentCredentials();
    const customerUrl = qrAuthService.buildCustomerUrl(window.location.origin);
    const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(customerUrl)}&color=FFD700&bgcolor=0E1017`;

    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>⚙️ CONFIGURACIÓN DEL SISTEMA</h1>
                <p>Ajustes generales, moneda y opciones de cocina</p>
            </div>
        </header>

        <div class="ajustes-container card" style="display: flex; flex-direction: column; gap: 1.2rem;">
            <div class="form-group">
                <label>Nombre del Negocio:</label>
                <input type="text" value="Burgame — Arcade Burger Bar" readonly>
            </div>
            <div class="form-group">
                <label>Moneda Configurada:</label>
                <input type="text" value="Guaraní Paraguayo (Gs.)" readonly>
            </div>
            <div class="form-group">
                <label>Sincronización Cocina:</label>
                <input type="text" value="Supabase Realtime (Activo)" readonly>
            </div>

            <!-- Sección QR Autopedido Cliente Dinámico -->
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle);">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.8rem; margin-bottom: 0.8rem;">
                    <div>
                        <h3 style="font-family: var(--font-title); font-size: 0.88rem; color: var(--color-primary); margin-bottom: 0.3rem;">
                            📱 CÓDIGO QR DINÁMICO Y PROTECCIÓN ANTI-FRAUDE
                        </h3>
                        <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 600px;">
                            El código QR rota automáticamente cada 10 minutos para evitar que clientes guarden el link y hagan pedidos falsos desde sus casas.
                        </p>
                    </div>
                    <a href="pantalla-qr.html" target="_blank" class="btn btn--primary btn--sm" style="display: flex; align-items: center; gap: 0.4rem;">
                        🖥️ Abrir Pantalla Mostrador (TV / Tablet)
                    </a>
                </div>

                <div style="display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; background: rgba(255,215,0,0.05); padding: 1.2rem; border-radius: var(--radius-md); border: 1px solid var(--border-gold);">
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
            </div>
        </div>
    `;

    // Timer para actualizar PIN y cuenta regresiva en vivo en ajustes
    const timerInterval = setInterval(() => {
        if (!container.isConnected) {
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

    return container;
}
