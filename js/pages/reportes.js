import { reportService } from '../services/report-service.js';
import { formatGs } from '../components/currency.js';

export async function renderReportesPage() {
    const container = document.createElement('div');
    container.className = 'reportes-page';

    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>📈 REPORTES Y ANALÍTICA</h1>
                <p>Estadísticas completas de ventas y comportamiento del negocio</p>
            </div>
        </header>

        <div class="reportes-grid">
            <div class="card">
                <h3>📊 Resumen de Rendimiento</h3>
                <p class="empty-text">Los gráficos analíticos detallados se generarán a medida que se acumulen transacciones en el sistema.</p>
            </div>
        </div>
    `;

    return container;
}
