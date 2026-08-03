export async function renderAjustesPage() {
    const container = document.createElement('div');
    container.className = 'ajustes-page';

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

            <!-- Sección QR Autopedido Cliente -->
            <div style="margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border-subtle);">
                <h3 style="font-family: var(--font-title); font-size: 0.88rem; color: var(--color-primary); margin-bottom: 0.8rem;">
                    📱 CÓDIGO QR PARA MESAS Y MOSTRADOR (AUTOPEDIDOS)
                </h3>
                <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
                    Los clientes pueden escanear este código QR con sus teléfonos para realizar sus pedidos directamente a la cocina.
                </p>

                <div style="display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; background: rgba(255,215,0,0.05); padding: 1.2rem; border-radius: var(--radius-md); border: 1px solid var(--border-gold);">
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=https://caja-burgame.vercel.app/cliente.html&color=FFD700&bgcolor=0E1017" alt="QR Autopedido" style="width: 130px; height: 130px; border-radius: 8px; border: 2px solid var(--color-primary); box-shadow: 0 0 15px var(--color-primary-glow);">
                    
                    <div style="display: flex; flex-direction: column; gap: 0.5rem; flex: 1;">
                        <span style="font-weight: 700; font-size: 0.9rem;">Enlace directo de Autopedido:</span>
                        <code style="background: #000; padding: 0.6rem 0.8rem; border-radius: 6px; font-family: var(--font-mono); font-size: 0.82rem; color: var(--color-primary);">
                            https://caja-burgame.vercel.app/cliente.html
                        </code>
                        <a href="cliente.html" target="_blank" class="btn btn--secondary btn--sm" style="width: fit-content; margin-top: 0.4rem;">
                            🔗 Probar Portal del Cliente
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;

    return container;
}
