import { cashService } from '../services/cash-service.js';
import { reportService } from '../services/report-service.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

export async function renderCajaPage() {
    const container = document.createElement('div');
    container.className = 'caja-page';

    const currentRegister = await cashService.getCurrentRegister();

    if (!currentRegister) {
        // Vista para ABRIR CAJA
        container.innerHTML = `
            <div class="caja-open-container">
                <div class="caja-card">
                    <div class="caja-card__header">
                        <div class="caja-icon">🔒</div>
                        <h1>APERTURA DE CAJA</h1>
                        <p>Ingresa el monto inicial en efectivo para comenzar el turno</p>
                    </div>

                    <form id="form-open-cash" class="caja-form">
                        <div class="form-group">
                            <label for="initial-amount">Monto Inicial en Efectivo (Gs.):</label>
                            <input type="number" id="initial-amount" placeholder="Ej: 500000" min="0" required autofocus>
                        </div>

                        <button type="submit" class="btn btn--primary btn--block">
                            🔓 ABRIR CAJA E INICIAR TURNO
                        </button>
                    </form>
                </div>
            </div>
        `;

        container.querySelector('#form-open-cash')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = parseInt(container.querySelector('#initial-amount').value, 10) || 0;
            try {
                await cashService.openRegister(amount);
                showToast({ message: '¡Caja abierta con éxito!', type: 'success' });
                window.location.hash = '#/ventas';
            } catch (err) {
                showToast({ message: 'Error al abrir caja: ' + err.message, type: 'error' });
            }
        });

        return container;
    }

    // Vista para CAJA ABIERTA / CIERRE DE CAJA
    const summary = await cashService.getRegisterSummary(currentRegister.id);

    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>💰 ESTADO DE CAJA</h1>
                <p>Caja abierta desde ${new Date(currentRegister.opened_at).toLocaleString()}</p>
            </div>
            <div class="status-badge badge badge--green">CAJA ABIERTA</div>
        </header>

        <div class="caja-grid">
            <!-- Summary Stats -->
            <div class="caja-stats-grid">
                <div class="stat-card">
                    <span class="stat-card__title">Monto Inicial</span>
                    <span class="stat-card__value">${formatGs(currentRegister.initial_amount)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card__title">Ventas Totales</span>
                    <span class="stat-card__value stat-card__value--green">${formatGs(summary.totalSales)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card__title">Gastos del Turno</span>
                    <span class="stat-card__value stat-card__value--red">${formatGs(summary.totalExpenses)}</span>
                </div>
                <div class="stat-card">
                    <span class="stat-card__title">Efectivo Esperado</span>
                    <span class="stat-card__value stat-card__value--yellow">${formatGs(summary.expectedCash)}</span>
                </div>
            </div>

            <!-- Desglose por método de pago -->
            <div class="caja-breakdown-card">
                <h3>💳 Desglose por Método de Pago</h3>
                <ul class="breakdown-list">
                    <li><span>💵 Efectivo:</span> <strong>${formatGs(summary.payments.efectivo || 0)}</strong></li>
                    <li><span>📱 Transferencia:</span> <strong>${formatGs(summary.payments.transferencia || 0)}</strong></li>
                    <li><span>💳 Débito:</span> <strong>${formatGs(summary.payments.debito || 0)}</strong></li>
                    <li><span>💳 Crédito:</span> <strong>${formatGs(summary.payments.credito || 0)}</strong></li>
                </ul>
            </div>

            <!-- Form Cierre de Caja -->
            <div class="caja-close-card">
                <h3>🔒 Cierre de Caja</h3>
                <form id="form-close-cash">
                    <div class="form-group">
                        <label for="counted-amount">Monto Contado en Efectivo (Gs.):</label>
                        <input type="number" id="counted-amount" value="${summary.expectedCash || 0}" placeholder="Monto contado real" required>
                    </div>

                    <div class="form-group">
                        <label for="close-notes">Observaciones:</label>
                        <textarea id="close-notes" placeholder="Notas sobre diferencias, billetes incompletos, etc."></textarea>
                    </div>

                    <div class="caja-actions">
                        <button type="button" id="btn-export-excel" class="btn btn--secondary">
                            📥 Descargar Excel del Día
                        </button>
                        <button type="button" id="btn-send-email" class="btn btn--secondary">
                            📧 Enviar Reporte por Mail
                        </button>
                        <button type="submit" class="btn btn--danger">
                            🔒 CERRAR CAJA
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;

    setupCloseEvents(container, currentRegister, summary);
    return container;
}

function setupCloseEvents(container, register, summary) {
    container.querySelector('#btn-export-excel')?.addEventListener('click', () => {
        exportCajaExcel(register, summary);
    });

    container.querySelector('#btn-send-email')?.addEventListener('click', () => {
        const subject = encodeURIComponent(`Cierre de Caja - Burgame - ${new Date().toLocaleDateString()}`);
        const body = encodeURIComponent(
            `Resumen Cierre de Caja Burgame:\n\n` +
            `Fecha: ${new Date().toLocaleString()}\n` +
            `Monto Inicial: ${formatGs(register.initial_amount)}\n` +
            `Ventas Totales: ${formatGs(summary.totalSales)}\n` +
            `Gastos Totales: ${formatGs(summary.totalExpenses)}\n` +
            `Efectivo Esperado: ${formatGs(summary.expectedCash)}\n\n` +
            `Desglose:\n` +
            `- Efectivo: ${formatGs(summary.payments.efectivo || 0)}\n` +
            `- Transferencia: ${formatGs(summary.payments.transferencia || 0)}\n` +
            `- Débito: ${formatGs(summary.payments.debito || 0)}\n` +
            `- Crédito: ${formatGs(summary.payments.credito || 0)}\n`
        );
        window.location.href = `mailto:gero@burgame.com?subject=${subject}&body=${body}`;
    });

    container.querySelector('#form-close-cash')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const counted = parseInt(container.querySelector('#counted-amount').value, 10) || 0;
        const notes = container.querySelector('#close-notes').value;

        try {
            await cashService.closeRegister(register.id, counted, notes);
            showToast({ message: 'Caja cerrada exitosamente. ¡Hasta mañana!', type: 'success' });
            
            // Re-renderizar la página de caja para mostrar la pantalla de APERTURA
            const newContent = await renderCajaPage();
            const pageContainer = document.getElementById('page-container');
            if (pageContainer) {
                pageContainer.innerHTML = '';
                pageContainer.appendChild(newContent);
            }
        } catch (err) {
            showToast({ message: 'Error al cerrar caja: ' + err.message, type: 'error' });
        }
    });
}

// Carga lazy de SheetJS: solo se descarga cuando se exporta Excel
function loadXLSX() {
    return new Promise((resolve, reject) => {
        if (window.XLSX) { resolve(window.XLSX); return; }
        const script = document.createElement('script');
        script.src = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js';
        script.onload = () => resolve(window.XLSX);
        script.onerror = () => reject(new Error('No se pudo cargar la librería Excel'));
        document.head.appendChild(script);
    });
}

async function exportCajaExcel(register, summary) {
    try {
        const XLSX = await loadXLSX();
        const data = [
            ['CONCEPTO', 'MONTO (Gs.)'],
            ['Fecha / Hora', new Date().toLocaleString()],
            ['Monto Inicial', register.initial_amount],
            ['Ventas Totales', summary.totalSales],
            ['Efectivo', summary.payments.efectivo || 0],
            ['Transferencia', summary.payments.transferencia || 0],
            ['Débito', summary.payments.debito || 0],
            ['Crédito', summary.payments.credito || 0],
            ['Gastos Totales', summary.totalExpenses],
            ['Efectivo Esperado', summary.expectedCash]
        ];

        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Cierre de Caja');
        XLSX.writeFile(wb, `Cierre_Caja_Burgame_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (err) {
        showToast({ message: 'Error al exportar Excel: ' + err.message, type: 'error' });
    }
}
