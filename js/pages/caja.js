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

                <!-- Navegador de historial: Mes → Día → Caja -->
                <div class="card" style="margin-top: 1.5rem;">
                    <h3 style="font-family: var(--font-title); font-size: 0.9rem; color: var(--color-primary); margin-bottom: 1rem;">
                        📅 HISTORIAL DE CAJAS
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

// Carga lazy de ExcelJS (estilos + imágenes embebidas en un solo motor)
function loadExcelJS() {
    return new Promise((resolve, reject) => {
        if (window.ExcelJS) { resolve(window.ExcelJS); return; }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
        script.onload = () => resolve(window.ExcelJS);
        script.onerror = () => reject(new Error('No se pudo cargar ExcelJS'));
        document.head.appendChild(script);
    });
}

// ============================================================
// Estilos Burgame para Excel (formato nativo ExcelJS / ARGB)
// ============================================================
const BURGAME_COLORS = {
    yellow: 'FFFFD700',
    yellowBright: 'FFFFE44D',
    black: 'FF0A0A0A',
    blackAlt: 'FF161616',
    white: 'FFF0F3F8',
    muted: 'FF8E9BAE',
    border: 'FF2A2A2A'
};

const BURGAME_BORDER = {
    top: { style: 'thin', color: { argb: BURGAME_COLORS.border } },
    bottom: { style: 'thin', color: { argb: BURGAME_COLORS.border } },
    left: { style: 'thin', color: { argb: BURGAME_COLORS.border } },
    right: { style: 'thin', color: { argb: BURGAME_COLORS.border } }
};

// Estilos en formato nativo ExcelJS
const BURGAME_STYLES = {
    title: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BURGAME_COLORS.yellow } },
        font: { color: { argb: BURGAME_COLORS.black }, bold: true, size: 16, name: 'Calibri' },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: BURGAME_BORDER
    },
    header: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BURGAME_COLORS.yellow } },
        font: { color: { argb: BURGAME_COLORS.black }, bold: true, size: 11, name: 'Calibri' },
        alignment: { horizontal: 'center', vertical: 'middle' },
        border: BURGAME_BORDER
    },
    section: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BURGAME_COLORS.yellow } },
        font: { color: { argb: BURGAME_COLORS.black }, bold: true, size: 12, name: 'Calibri' },
        alignment: { horizontal: 'left', vertical: 'middle' },
        border: BURGAME_BORDER
    },
    data: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BURGAME_COLORS.black } },
        font: { color: { argb: BURGAME_COLORS.white }, size: 11, name: 'Calibri' },
        alignment: { vertical: 'middle' },
        border: BURGAME_BORDER
    },
    total: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BURGAME_COLORS.yellow } },
        font: { color: { argb: BURGAME_COLORS.black }, bold: true, size: 12, name: 'Calibri' },
        alignment: { vertical: 'middle' },
        border: BURGAME_BORDER
    },
    empty: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BURGAME_COLORS.black } },
        font: { color: { argb: BURGAME_COLORS.white }, size: 11, name: 'Calibri' },
        border: BURGAME_BORDER
    }
};

function _rowIsNotEmpty(values, numCols) {
    for (let col = 0; col < numCols; col++) {
        const v = values[col];
        if (v != null && v !== '') return true;
    }
    return false;
}

function _rowHasExact(values, numCols, text) {
    const upper = text.toUpperCase();
    for (let col = 0; col < numCols; col++) {
        const v = values[col];
        if (v != null && String(v).toUpperCase().trim() === upper) return true;
    }
    return false;
}

function _rowHasSubstring(values, numCols, text) {
    const upper = text.toUpperCase();
    for (let col = 0; col < numCols; col++) {
        const v = values[col];
        if (v != null && String(v).toUpperCase().includes(upper)) return true;
    }
    return false;
}

// Pinta una hoja de ExcelJS con estilos Burgame y agrega datos.
// rows: array de arrays (valores puros). imageRows: nro de filas reservadas.
// firstRowIsTitle: si la primera fila (tras imageRows) es titulo en vez de header.
function buildBurgameSheet(ws, rows, opts = {}) {
    const { firstRowIsTitle = false, imageRows = 0 } = opts;
    const numCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    let dataCount = 0;

    rows.forEach((rowValues, i) => {
        const excelRow = ws.getRow(i + 1);
        let style;

        if (i < imageRows) {
            style = BURGAME_STYLES.empty;
        } else {
            const isEmpty = !_rowIsNotEmpty(rowValues, numCols);
            const isTotal = _rowHasExact(rowValues, numCols, 'TOTAL') || _rowHasExact(rowValues, numCols, 'TOTAL GASTOS');
            const isSection = _rowHasSubstring(rowValues, numCols, '---') || _rowHasExact(rowValues, numCols, 'RESUMEN POR PRODUCTO');

            if (i === imageRows && firstRowIsTitle) {
                style = BURGAME_STYLES.title;
            } else if (i === imageRows) {
                style = BURGAME_STYLES.header;
            } else if (isSection) {
                style = BURGAME_STYLES.section;
            } else if (isTotal) {
                style = BURGAME_STYLES.total;
            } else if (isEmpty) {
                style = BURGAME_STYLES.empty;
                dataCount = 0;
            } else {
                style = BURGAME_STYLES.data;
                dataCount++;
            }
        }

        for (let col = 0; col < numCols; col++) {
            const cell = excelRow.getCell(col + 1);
            const v = rowValues[col];
            if (v != null && v !== '') cell.value = v;
            cell.style = style;
        }
    });

    // Auto-ajustar columnas midiendo el contenido (sin contar filas de imagen)
    const colWidths = new Array(numCols).fill(8);
    rows.forEach((rowValues, i) => {
        if (i < imageRows) return;
        rowValues.forEach((v, col) => {
            if (v == null) return;
            const lines = String(v).split('\n');
            let maxLine = 0;
            for (const line of lines) maxLine = Math.max(maxLine, line.length);
            const w = maxLine + 3;
            if (w > colWidths[col]) colWidths[col] = w;
        });
    });
    for (let col = 0; col < numCols; col++) {
        ws.getColumn(col + 1).width = Math.min(colWidths[col], 50);
    }
}

// ============================================================
// Helpers para incrustar logo y banner de Burgame en Excel
// ============================================================

async function fetchImageBase64(url) {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Agrega logo y banner a un workbook ExcelJS ya construido y descarga el archivo
async function downloadBurgameExcel(exceljsWb, filename, opts = {}) {
    const { logoSheets = [], bannerSheet = null } = opts;

    // Dimensiones exactas en cm → píxeles (96 DPI estándar de Excel)
    const CM_TO_PX = 37.7953;
    const logoW = Math.round(3.86 * CM_TO_PX);   // ≈ 146 px
    const logoH = Math.round(3.47 * CM_TO_PX);   // ≈ 131 px
    const bannerW = Math.round(7.78 * CM_TO_PX); // ≈ 294 px
    const bannerH = Math.round(2.84 * CM_TO_PX); // ≈ 107 px

    // Ancho mínimo de columna (en "caracteres" de Calibri 11) para que no se solapen
    const logoColChars = Math.ceil(logoW / 7) + 1;     // ≈ 22
    const bannerColChars = Math.ceil(bannerW / 7) + 1; // ≈ 43

    // Altura de filas 1-5: el logo es el más alto (3.47 cm), repartir en 5 filas
    const CM_TO_PT = 28.3465;
    const imgRowHeight = Math.ceil(3.47 * CM_TO_PT / 5); // ≈ 20 pt por fila

    try {
        // --- Logo en hojas especificadas (columna A, filas 1-5) ---
        if (logoSheets.length > 0) {
            const logoBase64 = await fetchImageBase64('BurgameLogoTrazoAmarillo.png');
            const logoId = exceljsWb.addImage({ base64: logoBase64, extension: 'png' });

            for (const sheetName of logoSheets) {
                const ws = exceljsWb.getWorksheet(sheetName);
                if (!ws) continue;

                // Columna A: ancho suficiente para el logo
                const colA = ws.getColumn(1);
                colA.width = Math.max(colA.width || 8, logoColChars);

                // Filas 1-5: altura suficiente para el logo
                for (let r = 1; r <= 5; r++) {
                    ws.getRow(r).height = imgRowHeight;
                }

                // Logo en esquina superior izquierda
                ws.addImage(logoId, {
                    tl: { col: 0, row: 0 },
                    ext: { width: logoW, height: logoH }
                });
            }
        }

        // --- Banner al lado del logo (columna B, filas 1-5) ---
        if (bannerSheet) {
            const bannerBase64 = await fetchImageBase64('banner.png');
            const bannerId = exceljsWb.addImage({ base64: bannerBase64, extension: 'png' });

            const ws = exceljsWb.getWorksheet(bannerSheet);
            if (ws) {
                // Columna B: ancho suficiente para el banner
                const colB = ws.getColumn(2);
                colB.width = Math.max(colB.width || 8, bannerColChars);

                // Banner a la derecha del logo, centrado verticalmente en las 5 filas
                ws.addImage(bannerId, {
                    tl: { col: 1, row: 0.5 },
                    ext: { width: bannerW, height: bannerH }
                });
            }
        }

        // --- Descargar ---
        const buffer = await exceljsWb.xlsx.writeBuffer();
        const blob = new Blob([buffer], {
            type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.warn('Error al exportar Excel con imágenes:', err);
        throw err;
    }
}

async function exportCajaExcel(register, summary) {
    try {
        const ExcelJS = await loadExcelJS();
        const wb = new ExcelJS.Workbook();
        const ws = wb.addWorksheet('Cierre de Caja');

        const data = [
            [''], [''], [''], [''], [''],
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
        buildBurgameSheet(ws, data, { imageRows: 5 });

        await downloadBurgameExcel(wb, `Cierre_Caja_Burgame_${new Date().toISOString().slice(0, 10)}.xlsx`, {
            logoSheets: ['Cierre de Caja'],
            bannerSheet: 'Cierre de Caja'
        });
    } catch (err) {
        showToast({ message: 'Error al exportar Excel: ' + err.message, type: 'error' });
    }
}

// ============================================================
// Navegador de historial: Mes → Día → Caja (con edición)
// ============================================================
const MONTH_NAMES_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Agrupa cajas por mes y por día
function groupRegistersByMonthDay(registers) {
    const byMonth = {};
    registers.forEach(r => {
        const d = new Date(r.opened_at);
        const year = d.getFullYear();
        const month = d.getMonth(); // 0-11
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        const dayKey = d.getDate();
        if (!byMonth[monthKey]) byMonth[monthKey] = { label: `${MONTH_NAMES_ES[month]} ${year}`, days: {} };
        if (!byMonth[monthKey].days[dayKey]) byMonth[monthKey].days[dayKey] = [];
        byMonth[monthKey].days[dayKey].push(r);
    });
    return byMonth;
}

let _historyCache = null;

async function loadCajaHistory(container) {
    const historyEl = container.querySelector('#caja-history-container');
    if (!historyEl) return;

    try {
        const registers = await cashService.getAllRegistersGrouped();
        _historyCache = registers;
        renderMonthView(historyEl);
    } catch (err) {
        historyEl.innerHTML = `<p class="empty-text">Error al cargar historial: ${err.message}</p>`;
    }
}

// Vista 1: selección de mes
function renderMonthView(historyEl) {
    if (!_historyCache || _historyCache.length === 0) {
        historyEl.innerHTML = '<p class="empty-text">No hay cajas registradas todavía.</p>';
        return;
    }

    const byMonth = groupRegistersByMonthDay(_historyCache);
    const monthKeys = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

    historyEl.innerHTML = `
        <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 0.75rem;">Seleccioná un mes para ver las cajas de cada día:</p>
        <div class="caja-month-grid">
            ${monthKeys.map(key => {
                const m = byMonth[key];
                const dayCount = Object.keys(m.days).length;
                const cashCount = Object.values(m.days).reduce((sum, arr) => sum + arr.length, 0);
                return `
                    <div class="caja-month-card" data-month="${key}">
                        <div class="caja-month-card__icon">📅</div>
                        <div class="caja-month-card__label">${m.label}</div>
                        <div class="caja-month-card__info">${dayCount} día(s) • ${cashCount} caja(s)</div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    historyEl.querySelectorAll('.caja-month-card').forEach(card => {
        card.addEventListener('click', () => {
            renderDayView(historyEl, card.dataset.month, byMonth[card.dataset.month]);
        });
    });
}

// Vista 2: días del mes seleccionado
function renderDayView(historyEl, monthKey, monthData) {
    const byMonth = groupRegistersByMonthDay(_historyCache);
    const dayNums = Object.keys(monthData.days).sort((a, b) => parseInt(b) - parseInt(a));

    historyEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
            <button class="btn btn--ghost btn-back-month" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">← Volver a meses</button>
            <h4 style="font-family: var(--font-title); color: var(--color-primary); margin: 0;">${monthData.label}</h4>
        </div>
        <div class="caja-day-grid">
            ${dayNums.map(dayNum => {
                const cashBoxes = monthData.days[dayNum];
                const dateLabel = new Date(cashBoxes[0].opened_at).toLocaleDateString('es-PY', { weekday: 'long', day: '2-digit', month: 'short' });
                return `
                    <div class="caja-day-card" data-day="${dayNum}">
                        <div class="caja-day-card__header">
                            <span class="caja-day-card__num">${dayNum}</span>
                            <span class="caja-day-card__label">${dateLabel}</span>
                        </div>
                        <div class="caja-day-card__info">
                            ${cashBoxes.length} caja(s) • ${cashBoxes.map(c => c.status === 'open' ? '🟢' : '🔒').join(' ')}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    historyEl.querySelector('.btn-back-month')?.addEventListener('click', () => renderMonthView(historyEl));

    historyEl.querySelectorAll('.caja-day-card').forEach(card => {
        card.addEventListener('click', () => {
            const dayNum = card.dataset.day;
            renderCashDetailView(historyEl, monthKey, dayNum, monthData.days[dayNum]);
        });
    });
}

// Vista 3: detalle de cajas de un día específico (con edición y descarga)
function renderCashDetailView(historyEl, monthKey, dayNum, cashBoxes) {
    historyEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
            <button class="btn btn--ghost btn-back-day" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;">← Volver a días</button>
            <h4 style="font-family: var(--font-title); color: var(--color-primary); margin: 0;">Cajas del día ${dayNum}</h4>
        </div>
        <div id="cash-detail-list">
            ${cashBoxes.map(r => {
                const openedTime = new Date(r.opened_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
                const closedTime = r.closed_at ? new Date(r.closed_at).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '—';
                const isOpen = r.status === 'open';
                return `
                    <div class="card caja-detail-item" style="margin-bottom: 0.75rem;" data-id="${r.id}">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
                            <div>
                                <strong>${openedTime} → ${closedTime}</strong>
                                ${isOpen ? '<span class="badge badge--green" style="margin-left: 0.5rem;">ABIERTA</span>' : '<span class="badge badge--dark" style="margin-left: 0.5rem;">🔒 CERRADA</span>'}
                            </div>
                            <div class="caja-detail-actions">
                                <button class="btn btn--secondary btn-view-detail" data-id="${r.id}" style="font-size: 0.8rem; padding: 0.35rem 0.7rem;">👁️ Ver / Editar</button>
                                <button class="btn btn--secondary btn-download-cash" data-id="${r.id}" data-date="${dayNum}" style="font-size: 0.8rem; padding: 0.35rem 0.7rem;">📥 Excel</button>
                            </div>
                        </div>
                        <div style="margin-top: 0.5rem; font-size: 0.82rem; color: var(--text-muted);">
                            Inicial: <strong style="font-family: var(--font-mono);">${formatGs(r.initial_amount)}</strong>
                            ${r.counted_amount != null ? ` • Contado: <strong style="font-family: var(--font-mono);">${formatGs(r.counted_amount)}</strong>` : ''}
                            ${r.notes ? ` • <em>${r.notes}</em>` : ''}
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    historyEl.querySelector('.btn-back-day')?.addEventListener('click', () => {
        const byMonth = groupRegistersByMonthDay(_historyCache);
        renderDayView(historyEl, monthKey, byMonth[monthKey]);
    });

    historyEl.querySelectorAll('.btn-download-cash').forEach(btn => {
        btn.addEventListener('click', () => {
            downloadClosedCajaExcel(btn.dataset.id, btn.dataset.date, btn);
        });
    });

    historyEl.querySelectorAll('.btn-view-detail').forEach(btn => {
        btn.addEventListener('click', () => {
            openEditModal(btn.dataset.id);
        });
    });
}

// ============================================================
// Modal de edición de caja cerrada
// ============================================================
async function openEditModal(registerId) {
    // Buscar la caja en caché o cargarla
    let register = _historyCache && _historyCache.find(r => r.id === registerId);
    if (!register) {
        try {
            const all = await cashService.getAllRegistersGrouped();
            _historyCache = all;
            register = all.find(r => r.id === registerId);
        } catch (err) {
            showToast({ message: 'Error al cargar caja: ' + err.message, type: 'error' });
            return;
        }
    }
    if (!register) {
        showToast({ message: 'No se encontró la caja', type: 'error' });
        return;
    }

    // Cargar el summary para mostrar el contexto
    let summary = null;
    try {
        summary = await cashService.getRegisterSummary(registerId);
    } catch (err) {
        console.warn('No se pudo cargar summary:', err.message);
    }

    // Crear overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 1rem;';

    const isOpen = register.status === 'open';
    const openedDate = new Date(register.opened_at).toLocaleString('es-PY');
    const closedDate = register.closed_at ? new Date(register.closed_at).toLocaleString('es-PY') : '';

    overlay.innerHTML = `
        <div class="card" style="max-width: 540px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 1.5rem; background: var(--bg-card); border-radius: var(--radius-md);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                <h3 style="font-family: var(--font-title); color: var(--color-primary); margin: 0; font-size: 1rem;">
                    ✏️ Editar Caja #${register.order_number || register.id.slice(0, 8)}
                </h3>
                <button class="btn btn--ghost btn-close-modal" style="padding: 0.3rem 0.6rem; font-size: 1.2rem;">✕</button>
            </div>

            <div style="background: rgba(255,255,255,0.03); border-radius: var(--radius-sm); padding: 0.75rem; margin-bottom: 1rem; font-size: 0.82rem; color: var(--text-muted);">
                <div>📅 Abierta: ${openedDate}</div>
                ${closedDate ? `<div>🔒 Cerrada: ${closedDate}</div>` : ''}
                <div>Estado: <strong>${isOpen ? 'ABIERTA' : 'CERRADA'}</strong></div>
                ${summary ? `<div style="margin-top: 0.5rem; border-top: 1px solid var(--border-subtle); padding-top: 0.5rem;">
                    Ventas: <strong style="font-family: var(--font-mono);">${formatGs(summary.totalSales)}</strong> •
                    Gastos: <strong style="font-family: var(--font-mono);">${formatGs(summary.totalExpenses)}</strong> •
                    Efec. Esperado: <strong style="font-family: var(--font-mono);">${formatGs(summary.expectedCash)}</strong>
                </div>` : ''}
            </div>

            <form id="form-edit-cash">
                <div class="form-group">
                    <label for="edit-initial-amount">Monto Inicial (Gs.):</label>
                    <input type="number" id="edit-initial-amount" value="${register.initial_amount || 0}" min="0" required>
                </div>
                ${!isOpen ? `
                    <div class="form-group">
                        <label for="edit-counted-amount">Efectivo Contado (Gs.):</label>
                        <input type="number" id="edit-counted-amount" value="${register.counted_amount || 0}" min="0">
                    </div>
                ` : ''}
                <div class="form-group">
                    <label for="edit-notes">Observaciones:</label>
                    <textarea id="edit-notes" placeholder="Notas...">${register.notes || ''}</textarea>
                </div>
                <div class="form-group">
                    <label for="edit-opened-at">Fecha/Hora de Apertura:</label>
                    <input type="datetime-local" id="edit-opened-at" value="${toLocalDatetimeInput(register.opened_at)}">
                </div>
                ${register.closed_at ? `
                    <div class="form-group">
                        <label for="edit-closed-at">Fecha/Hora de Cierre:</label>
                        <input type="datetime-local" id="edit-closed-at" value="${toLocalDatetimeInput(register.closed_at)}">
                    </div>
                ` : ''}

                <div style="display: flex; gap: 0.75rem; margin-top: 1rem;">
                    <button type="button" class="btn btn--ghost btn-close-modal" style="flex: 1;">Cancelar</button>
                    <button type="submit" class="btn btn--primary" style="flex: 1;">💾 Guardar Cambios</button>
                </div>
            </form>
        </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelectorAll('.btn-close-modal').forEach(b => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#form-edit-cash')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const updates = {
            initial_amount: parseInt(overlay.querySelector('#edit-initial-amount').value, 10) || 0,
            notes: overlay.querySelector('#edit-notes').value
        };

        if (!isOpen) {
            updates.counted_amount = parseInt(overlay.querySelector('#edit-counted-amount').value, 10) || 0;
        }

        const openedAtVal = overlay.querySelector('#edit-opened-at').value;
        if (openedAtVal) updates.opened_at = new Date(openedAtVal).toISOString();

        const closedAtVal = overlay.querySelector('#edit-closed-at');
        if (closedAtVal && closedAtVal.value) {
            updates.closed_at = new Date(closedAtVal.value).toISOString();
        }

        // Recalcular diferencia si la caja está cerrada
        if (!isOpen && updates.counted_amount != null && summary) {
            updates.difference = updates.counted_amount - summary.expectedCash;
        }

        try {
            const saveBtn = overlay.querySelector('button[type="submit"]');
            saveBtn.disabled = true;
            saveBtn.textContent = '⏳ Guardando...';
            await cashService.updateRegister(registerId, updates);
            showToast({ message: '✅ Caja actualizada correctamente', type: 'success' });

            // Actualizar caché local
            if (_historyCache) {
                const idx = _historyCache.findIndex(r => r.id === registerId);
                if (idx >= 0) _historyCache[idx] = { ..._historyCache[idx], ...updates };
            }
            close();
            // Re-renderizar la vista de detalle del día
            const historyEl = document.querySelector('#caja-history-container');
            if (historyEl) {
                const byMonth = groupRegistersByMonthDay(_historyCache);
                // Determinar el mes/día de la caja editada
                const updatedReg = registerId;
                const reg = _historyCache.find(r => r.id === updatedReg);
                if (reg) {
                    const d = new Date(reg.opened_at);
                    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                    const dayNum = d.getDate();
                    if (byMonth[monthKey] && byMonth[monthKey].days[dayNum]) {
                        renderCashDetailView(historyEl, monthKey, dayNum, byMonth[monthKey].days[dayNum]);
                    }
                }
            }
        } catch (err) {
            showToast({ message: 'Error al guardar: ' + err.message, type: 'error' });
            const saveBtn = overlay.querySelector('button[type="submit"]');
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 Guardar Cambios'; }
        }
    });
}

// Convierte un ISO timestamp a formato válido para <input type="datetime-local">
function toLocalDatetimeInput(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d - tzOffset).toISOString().slice(0, 16);
}

// ============================================================
// Descarga Excel completo de una caja (multi-hoja)
// ============================================================
async function downloadClosedCajaExcel(registerId, dateLabel, btn) {
    const originalText = btn ? btn.innerHTML : '';
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '⏳ Cargando...';
    }

    try {
        const ExcelJS = await loadExcelJS();
        const details = await cashService.getRegisterFullDetails(registerId);
        const { register, paidOrders, orders, expenses, totalSales, totalExpenses, payments, expectedCash, counted, difference } = details;

        const wb = new ExcelJS.Workbook();
        const fmtDate = (d) => new Date(d).toLocaleString('es-PY');
        const paymentLabels = { efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito', credito: 'Crédito' };

        // ---------- HOJA 1: Resumen ----------
        const wsResumen = wb.addWorksheet('Resumen');
        const resumenData = [
            [''], [''], [''], [''], [''],
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
        buildBurgameSheet(wsResumen, resumenData, { firstRowIsTitle: true, imageRows: 5 });

        // ---------- HOJA 2: Ventas Detalladas ----------
        const wsVentas = wb.addWorksheet('Ventas Detalladas');
        const ventasHeader = ['#', 'Pedido Nº', 'Hora', 'Cliente', 'Método de Pago', 'Estado', 'Total (Gs.)', 'Notas'];
        const ventasData = [[''], [''], [''], [''], [''], ventasHeader];
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
        ventasData.push([]);
        ventasData.push(['', '', '', '', '', 'TOTAL', totalSales, '']);
        buildBurgameSheet(wsVentas, ventasData, { imageRows: 5 });

        // ---------- HOJA 3: Items Vendidos ----------
        const wsItems = wb.addWorksheet('Items Vendidos');
        const itemsHeader = ['Pedido Nº', 'Producto', 'Cantidad', 'Precio Unit. (Gs.)', 'Subtotal (Gs.)', '¿Combo?', 'Cliente'];
        const itemsData = [[''], [''], [''], [''], [''], itemsHeader];
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
        buildBurgameSheet(wsItems, itemsData, { imageRows: 5 });

        // ---------- HOJA 4: Gastos Detallados ----------
        const wsGastos = wb.addWorksheet('Gastos Detallados');
        const gastosHeader = ['#', 'Fecha/Hora', 'Descripción', 'Categoría', 'Monto (Gs.)'];
        const gastosData = [[''], [''], [''], [''], [''], gastosHeader];
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
        buildBurgameSheet(wsGastos, gastosData, { imageRows: 5 });

        // ---------- HOJA 5: Resumen por Categoría de Gasto ----------
        const wsCat = wb.addWorksheet('Gastos por Categoría');
        const gastosPorCat = {};
        expenses.forEach(e => {
            const cat = (e.expense_categories && e.expense_categories.name) || 'Sin categoría';
            if (!gastosPorCat[cat]) gastosPorCat[cat] = 0;
            gastosPorCat[cat] += (e.amount || 0);
        });
        const catData = [[''], [''], [''], [''], [''], ['Categoría', 'Monto Total (Gs.)']];
        Object.entries(gastosPorCat)
            .sort((a, b) => b[1] - a[1])
            .forEach(([cat, monto]) => catData.push([cat, monto]));
        catData.push([]);
        catData.push(['TOTAL', totalExpenses]);
        buildBurgameSheet(wsCat, catData, { imageRows: 5 });

        // ---------- Nombre del archivo ----------
        const dateStr = new Date(register.opened_at).toISOString().slice(0, 10);
        await downloadBurgameExcel(wb, `Caja_Burgame_${dateStr}.xlsx`, {
            logoSheets: ['Resumen', 'Ventas Detalladas', 'Items Vendidos', 'Gastos Detallados', 'Gastos por Categoría'],
            bannerSheet: 'Resumen'
        });
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
