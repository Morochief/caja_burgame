import { cashService } from '../services/cash-service.js';
import { reportService } from '../services/report-service.js';
import { appState } from '../app.js';
import { formatGs } from '../components/currency.js';
import { showToast } from '../components/toast.js';

export async function renderCajaPage() {
    const container = document.createElement('div');
    container.className = 'caja-page';

    // Skeleton inicial
    container.innerHTML = `
        <div class="page-loading" style="padding: 4rem;">
            <div class="pixel-spinner"></div>
            <p>Cargando estado de caja...</p>
        </div>
    `;

    // Cargar data en background
    loadCajaData(container);

    return container;
}

async function loadCajaData(container) {
    const currentRegister = appState.cashRegister || await cashService.getCurrentRegister();

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
                appState.cashRegister = null;
                appState._registerFetchedAt = 0;
                showToast({ message: '¡Caja abierta con éxito!', type: 'success' });
                window.location.hash = '#/ventas';
            } catch (err) {
                showToast({ message: 'Error al abrir caja: ' + err.message, type: 'error' });
            }
        });

        return;
    }

    // Vista CAJA ABIERTA: mostrar skeleton del summary mientras carga
    container.innerHTML = `
        <header class="page-header">
            <div class="page-header__info">
                <h1>💰 ESTADO DE CAJA</h1>
                <p>Caja abierta desde ${new Date(currentRegister.opened_at).toLocaleString()}</p>
            </div>
            <div class="status-badge badge badge--green">CAJA ABIERTA</div>
        </header>
        <div id="caja-content">
            <div class="page-loading" style="padding: 3rem;"><div class="pixel-spinner"></div><p>Calculando resumen...</p></div>
        </div>
    `;

    // Cargar summary en background
    try {
        const summary = await cashService.getRegisterSummary(currentRegister.id);
        const contentEl = container.querySelector('#caja-content');
        if (contentEl) {
            contentEl.innerHTML = `
                <div class="caja-grid">
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
                    <div class="caja-breakdown-card">
                        <h3>💳 Desglose por Método de Pago</h3>
                        <ul class="breakdown-list">
                            <li><span>💵 Efectivo:</span> <strong>${formatGs(summary.payments.efectivo || 0)}</strong></li>
                            <li><span>📱 Transferencia:</span> <strong>${formatGs(summary.payments.transferencia || 0)}</strong></li>
                            <li><span>💳 Débito:</span> <strong>${formatGs(summary.payments.debito || 0)}</strong></li>
                            <li><span>💳 Crédito:</span> <strong>${formatGs(summary.payments.credito || 0)}</strong></li>
                        </ul>
                    </div>
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
                                <button type="button" id="btn-export-excel" class="btn btn--secondary">📥 Descargar Excel del Día</button>
                                <button type="button" id="btn-send-email" class="btn btn--secondary">📧 Enviar Reporte por Mail</button>
                                <button type="submit" class="btn btn--danger">🔒 CERRAR CAJA</button>
                            </div>
                        </form>
                    </div>
                </div>

                <!-- Historial de cajas por día -->
                <div class="card" style="margin-top: 1.5rem;">
                    <h3 style="font-family: var(--font-title); font-size: 0.9rem; color: var(--color-primary); margin-bottom: 1rem;">
                        📅 HISTORIAL DE CAJAS POR DÍA
                    </h3>
                    <div id="caja-history-container">
                        <div class="page-loading" style="padding: 1rem;"><div class="pixel-spinner"></div><p>Cargando historial...</p></div>
                    </div>
                </div>
            `;
            setupCloseEvents(container, currentRegister, summary);
            loadCajaHistory(container);
        }
    } catch (err) {
        const contentEl = container.querySelector('#caja-content');
        if (contentEl) {
            contentEl.innerHTML = `<div class="card p-4" style="color: #FF5252; text-align: center;"><p>Error al cargar resumen: ${err.message}</p></div>`;
        }
    }
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
            // Invalidar caché: la caja ya no está abierta
            appState.cashRegister = null;
            appState._registerFetchedAt = 0;
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

// ============================================================
// Historial de cajas cerradas por día
// ============================================================
async function loadCajaHistory(container) {
    const historyEl = container.querySelector('#caja-history-container');
    if (!historyEl) return;

    try {
        const registers = await cashService.getRegisterHistory();
        const closed = registers.filter(r => r.status === 'closed');

        if (closed.length === 0) {
            historyEl.innerHTML = '<p class="empty-text">No hay cajas cerradas todavía. El historial aparecerá aquí cuando cierres el primer turno.</p>';
            return;
        }

        historyEl.innerHTML = `
            <table class="table" style="font-size: 0.85rem;">
                <thead>
                    <tr>
                        <th>Fecha</th>
                        <th>Apertura</th>
                        <th>Cierre</th>
                        <th>Monto Inicial</th>
                        <th>Efectivo Contado</th>
                        <th>Estado</th>
                        <th>Descarga</th>
                    </tr>
                </thead>
                <tbody>
                    ${closed.map(r => {
                        const openedDate = new Date(r.opened_at).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });
                        const openedTime = new Date(r.opened_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
                        const closedTime = r.closed_at ? new Date(r.closed_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '—';
                        return `
                            <tr>
                                <td style="font-weight: 700;">${openedDate}</td>
                                <td style="color: var(--text-muted);">${openedTime}</td>
                                <td style="color: var(--text-muted);">${closedTime}</td>
                                <td style="font-family: var(--font-mono);">${formatGs(r.initial_amount)}</td>
                                <td style="font-family: var(--font-mono); font-weight: 700; color: var(--color-primary);">${r.counted_amount ? formatGs(r.counted_amount) : '—'}</td>
                                <td><span class="badge badge--dark">🔒 CERRADA</span></td>
                                <td>
                                    <button class="btn btn--secondary btn-download-cash" data-id="${r.id}" data-date="${openedDate}" title="Descargar Excel completo de esta caja">
                                        📥 Excel
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;

        // Bind botones de descarga
        historyEl.querySelectorAll('.btn-download-cash').forEach(btn => {
            btn.addEventListener('click', () => {
                downloadClosedCajaExcel(btn.dataset.id, btn.dataset.date, btn);
            });
        });
    } catch (err) {
        historyEl.innerHTML = `<p class="empty-text">Error al cargar historial: ${err.message}</p>`;
    }
}

// ============================================================
// Descarga Excel completo de una caja cerrada (multi-hoja)
// ============================================================
async function downloadClosedCajaExcel(registerId, dateLabel, btn) {
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Cargando...';
    }

    try {
        const XLSX = await loadXLSX();
        const details = await cashService.getRegisterFullDetails(registerId);
        const { register, paidOrders, orders, expenses, totalSales, totalExpenses, payments, expectedCash, counted, difference } = details;

        const wb = XLSX.utils.book_new();
        const fmtDate = (d) => new Date(d).toLocaleString('es-PY');
        const paymentLabels = { efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito', credito: 'Crédito' };

        // ---------- HOJA 1: Resumen ----------
        const resumenData = [
            ['CIERRE DE CAJA - BURGAME'],
            [''],
            ['Fecha de apertura', fmtDate(register.opened_at)],
            ['Fecha de cierre', register.closed_at ? fmtDate(register.closed_at) : '—'],
            [''],
            ['--- RESUMEN GENERAL ---'],
            ['Monto Inicial', register.initial_amount],
            ['Ventas Totales (pagadas)', totalSales],
            ['Gastos Totales', totalExpenses],
            ['Efectivo Esperado', expectedCash],
            ['Efectivo Contado', counted],
            ['Diferencia', difference],
            [''],
            ['--- DESGLOSE POR MÉTODO DE PAGO ---'],
            ['💵 Efectivo', payments.efectivo],
            ['📱 Transferencia', payments.transferencia],
            ['💳 Débito', payments.debito],
            ['💳 Crédito', payments.credito],
            [''],
            ['--- ESTADÍSTICAS ---'],
            ['Total de pedidos (todas)', orders.length],
            ['Pedidos pagos', paidOrders.length],
            ['Pedidos cancelados', orders.filter(o => o.status === 'cancelled').length],
            ['Pedidos pendientes', orders.filter(o => !['paid', 'cancelled'].includes(o.status)).length],
            ['Gastos registrados', expenses.length],
            [''],
            ['Observaciones', register.notes || '—']
        ];
        const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
        wsResumen['!cols'] = [{ wch: 30 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen');

        // ---------- HOJA 2: Ventas Detalladas ----------
        const ventasHeader = ['#', 'Pedido Nº', 'Hora', 'Cliente', 'Método de Pago', 'Estado', 'Total (Gs.)', 'Notas'];
        const ventasData = [ventasHeader];
        paidOrders.forEach((o, i) => {
            ventasData.push([
                i + 1,
                o.order_number || '—',
                new Date(o.created_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }),
                o.customer_name || '—',
                paymentLabels[o.payment_method] || o.payment_method || 'Efectivo',
                o.status,
                o.total || 0,
                o.notes || ''
            ]);
        });
        // Fila de total
        ventasData.push([]);
        ventasData.push(['', '', '', '', '', 'TOTAL', totalSales, '']);

        const wsVentas = XLSX.utils.aoa_to_sheet(ventasData);
        wsVentas['!cols'] = [{ wch: 5 }, { wch: 10 }, { wch: 8 }, { wch: 22 }, { wch: 16 }, { wch: 10 }, { wch: 14 }, { wch: 30 }];
        XLSX.utils.book_append_sheet(wb, wsVentas, 'Ventas Detalladas');

        // ---------- HOJA 3: Items Vendidos ----------
        const itemsHeader = ['Pedido Nº', 'Producto', 'Cantidad', 'Precio Unit. (Gs.)', 'Subtotal (Gs.)', '¿Combo?', 'Cliente'];
        const itemsData = [itemsHeader];
        paidOrders.forEach(o => {
            (o.order_items || []).forEach(it => {
                itemsData.push([
                    o.order_number || '—',
                    it.product_name || '—',
                    it.quantity || 0,
                    it.price || 0,
                    (it.price || 0) * (it.quantity || 0),
                    it.is_combo ? 'Sí' : 'No',
                    o.customer_name || '—'
                ]);
            });
        });
        // Resumen de items
        const itemTotals = {};
        paidOrders.forEach(o => {
            (o.order_items || []).forEach(it => {
                const name = it.product_name || '—';
                if (!itemTotals[name]) itemTotals[name] = { qty: 0, subtotal: 0 };
                itemTotals[name].qty += (it.quantity || 0);
                itemTotals[name].subtotal += (it.price || 0) * (it.quantity || 0);
            });
        });
        itemsData.push([]);
        itemsData.push(['', 'RESUMEN POR PRODUCTO', '', '', '', '', '']);
        itemsData.push(['', 'Producto', 'Cant. Total', '', 'Subtotal Total', '', '']);
        Object.entries(itemTotals)
            .sort((a, b) => b[1].subtotal - a[1].subtotal)
            .forEach(([name, t]) => {
                itemsData.push(['', name, t.qty, '', t.subtotal, '', '']);
            });

        const wsItems = XLSX.utils.aoa_to_sheet(itemsData);
        wsItems['!cols'] = [{ wch: 10 }, { wch: 32 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 8 }, { wch: 22 }];
        XLSX.utils.book_append_sheet(wb, wsItems, 'Items Vendidos');

        // ---------- HOJA 4: Gastos Detallados ----------
        const gastosHeader = ['#', 'Fecha/Hora', 'Descripción', 'Categoría', 'Monto (Gs.)'];
        const gastosData = [gastosHeader];
        expenses.forEach((e, i) => {
            gastosData.push([
                i + 1,
                fmtDate(e.created_at),
                e.description || '—',
                (e.expense_categories && e.expense_categories.name) || 'Sin categoría',
                e.amount || 0
            ]);
        });
        gastosData.push([]);
        gastosData.push(['', '', '', 'TOTAL GASTOS', totalExpenses]);

        const wsGastos = XLSX.utils.aoa_to_sheet(gastosData);
        wsGastos['!cols'] = [{ wch: 5 }, { wch: 22 }, { wch: 36 }, { wch: 18 }, { wch: 14 }];
        XLSX.utils.book_append_sheet(wb, wsGastos, 'Gastos Detallados');

        // ---------- HOJA 5: Resumen por Categoría de Gasto ----------
        const gastosPorCat = {};
        expenses.forEach(e => {
            const cat = (e.expense_categories && e.expense_categories.name) || 'Sin categoría';
            if (!gastosPorCat[cat]) gastosPorCat[cat] = 0;
            gastosPorCat[cat] += (e.amount || 0);
        });
        const catData = [['Categoría', 'Monto Total (Gs.)']];
        Object.entries(gastosPorCat)
            .sort((a, b) => b[1] - a[1])
            .forEach(([cat, monto]) => catData.push([cat, monto]));
        catData.push([]);
        catData.push(['TOTAL', totalExpenses]);

        const wsCat = XLSX.utils.aoa_to_sheet(catData);
        wsCat['!cols'] = [{ wch: 22 }, { wch: 18 }];
        XLSX.utils.book_append_sheet(wb, wsCat, 'Gastos por Categoría');

        // ---------- Nombre del archivo ----------
        const dateStr = new Date(register.opened_at).toISOString().slice(0, 10);
        XLSX.writeFile(wb, `Caja_Burgame_${dateStr}.xlsx`);
        showToast({ message: `✅ Descargado: Caja del ${dateLabel}`, type: 'success' });
    } catch (err) {
        showToast({ message: 'Error al exportar: ' + err.message, type: 'error' });
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }
}
