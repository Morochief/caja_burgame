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

        <div class="ajustes-container card">
            <div class="form-group">
                <label>Nombre del Negocio:</label>
                <input type="text" value="Burgame" readonly>
            </div>
            <div class="form-group">
                <label>Moneda Configurada:</label>
                <input type="text" value="Guaraní Paraguayo (Gs.)" readonly>
            </div>
            <div class="form-group">
                <label>Sincronización Cocina:</label>
                <input type="text" value="Supabase Realtime (Activo)" readonly>
            </div>
        </div>
    `;

    return container;
}
