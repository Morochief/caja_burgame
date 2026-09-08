// js/services/excel-export-service.js
// Exportador centralizado de Excel con branding oficial Burgame

export async function loadExcelJS() {
    return new Promise((resolve, reject) => {
        if (window.ExcelJS) { resolve(window.ExcelJS); return; }
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js';
        script.onload = () => resolve(window.ExcelJS);
        script.onerror = () => reject(new Error('No se pudo cargar ExcelJS'));
        document.head.appendChild(script);
    });
}

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
    orderHeader: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1E1E' } },
        font: { color: { argb: BURGAME_COLORS.yellowBright }, bold: true, size: 11, name: 'Calibri' },
        alignment: { vertical: 'middle' },
        border: BURGAME_BORDER
    },
    subHeader: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF161616' } },
        font: { color: { argb: BURGAME_COLORS.muted }, bold: true, size: 10, name: 'Calibri' },
        alignment: { vertical: 'middle' },
        border: BURGAME_BORDER
    },
    subItem: {
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: BURGAME_COLORS.black } },
        font: { color: { argb: BURGAME_COLORS.white }, size: 10, name: 'Calibri' },
        alignment: { vertical: 'middle' },
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

export function buildBurgameSheet(ws, rows, opts = {}) {
    const { firstRowIsTitle = false, imageRows = 0 } = opts;
    const numCols = rows.reduce((m, r) => Math.max(m, r.length), 0);

    rows.forEach((rowValues, i) => {
        const excelRow = ws.getRow(i + 1);
        let style;

        if (i < imageRows) {
            style = BURGAME_STYLES.empty;
        } else {
            const isEmpty = !_rowIsNotEmpty(rowValues, numCols);
            const isTotal = _rowHasExact(rowValues, numCols, 'TOTAL') || _rowHasExact(rowValues, numCols, 'TOTAL GASTOS') || _rowHasExact(rowValues, numCols, 'BENEFICIO NETO');
            const isSection = _rowHasSubstring(rowValues, numCols, '---') || _rowHasExact(rowValues, numCols, 'RESUMEN POR PRODUCTO');
            const isSubHeader = _rowHasExact(rowValues, numCols, 'CANTIDAD') && _rowHasExact(rowValues, numCols, 'ARTÍCULO');
            const isOrderHeader = rowValues._isOrderHeader === true;
            const isSubItem = rowValues._isSubItem === true;

            if (i === imageRows && firstRowIsTitle) {
                style = BURGAME_STYLES.title;
            } else if (i === imageRows) {
                style = BURGAME_STYLES.header;
            } else if (isSection) {
                style = BURGAME_STYLES.section;
            } else if (isTotal) {
                style = BURGAME_STYLES.total;
            } else if (isSubHeader) {
                style = BURGAME_STYLES.subHeader;
            } else if (isOrderHeader) {
                style = BURGAME_STYLES.orderHeader;
            } else if (isSubItem) {
                style = BURGAME_STYLES.subItem;
            } else if (isEmpty) {
                style = BURGAME_STYLES.empty;
            } else {
                style = BURGAME_STYLES.data;
            }
        }

        for (let col = 0; col < numCols; col++) {
            const cell = excelRow.getCell(col + 1);
            const v = rowValues[col];
            if (v != null && v !== '') cell.value = v;
            cell.style = style;
        }
    });

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

export async function downloadBurgameExcel(exceljsWb, filename, opts = {}) {
    const { logoSheets = [], bannerSheet = null } = opts;
    const CM_TO_PX = 37.7953;
    const logoW = Math.round(3.86 * CM_TO_PX);
    const logoH = Math.round(3.47 * CM_TO_PX);
    const bannerW = Math.round(7.78 * CM_TO_PX);
    const bannerH = Math.round(2.84 * CM_TO_PX);

    const logoColChars = Math.ceil(logoW / 7) + 1;
    const bannerColChars = Math.ceil(bannerW / 7) + 1;
    const CM_TO_PT = 28.3465;
    const imgRowHeight = Math.ceil(3.47 * CM_TO_PT / 5);

    try {
        if (logoSheets.length > 0) {
            const logoBase64 = await fetchImageBase64('BurgameLogoTrazoAmarillo.png');
            const logoId = exceljsWb.addImage({ base64: logoBase64, extension: 'png' });

            for (const sheetName of logoSheets) {
                const ws = exceljsWb.getWorksheet(sheetName);
                if (!ws) continue;

                const colA = ws.getColumn(1);
                colA.width = Math.max(colA.width || 8, logoColChars);

                for (let r = 1; r <= 5; r++) {
                    ws.getRow(r).height = imgRowHeight;
                }

                ws.addImage(logoId, {
                    tl: { col: 0, row: 0 },
                    ext: { width: logoW, height: logoH }
                });
            }
        }

        if (bannerSheet) {
            const bannerBase64 = await fetchImageBase64('banner.png');
            const bannerId = exceljsWb.addImage({ base64: bannerBase64, extension: 'png' });
            const ws = exceljsWb.getWorksheet(bannerSheet);
            if (ws) {
                const colB = ws.getColumn(2);
                colB.width = Math.max(colB.width || 8, bannerColChars);
                ws.addImage(bannerId, {
                    tl: { col: 1, row: 0.5 },
                    ext: { width: bannerW, height: bannerH }
                });
            }
        }

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

// Genera el reporte Excel maestro consolidado con desglose contable de élite
export async function exportConsolidatedReportExcel(analyticsData, periodLabel = '') {
    const ExcelJS = await loadExcelJS();
    const wb = new ExcelJS.Workbook();
    const fmtDate = (d) => new Date(d).toLocaleString('es-PY');
    const paymentLabels = { efectivo: 'Efectivo', transferencia: 'Transferencia', debito: 'Débito', credito: 'Crédito' };

    const {
        paidOrders = [],
        allOrders = [],
        expenses = [],
        totalSales = 0,
        totalExpenses = 0,
        netProfit = 0,
        avgTicket = 0,
        payments = { efectivo: 0, transferencia: 0, debito: 0, credito: 0 },
        topProducts = [],
        registers = []
    } = analyticsData;

    // Cálculo contable de IVA 10% (Régimen General Paraguay: Total / 11)
    const totalIva = Math.round(totalSales / 11);
    const totalSubtotal = totalSales - totalIva;

    // 1. Resumen
    const wsResumen = wb.addWorksheet('Resumen');
    const resumenRows = [
        [''], [''], [''], [''], [''],
        [`REPORTE CONSOLIDADO DE VENTAS Y GASTOS — BURGAME`],
        [''],
        ['Período / Fecha:', periodLabel || 'Personalizado'],
        ['Generado el:', new Date().toLocaleString('es-PY')],
        ['Sucursal / Local:', 'Burgame Central'],
        [''],
        ['--- RESUMEN FINANCIERO Y CONTABLE ---'],
        ['Ventas Totales (Gs.):', totalSales],
        ['Subtotal Sin IVA (Gs.):', totalSubtotal],
        ['Liquidación IVA 10% (Gs.):', totalIva],
        ['Gastos Totales (Gs.):', totalExpenses],
        ['Beneficio Neto (Gs.):', netProfit],
        ['Ticket Promedio (Gs.):', avgTicket],
        [''],
        ['--- DESGLOSE POR MÉTODO DE PAGO ---'],
        ['💵 Efectivo (Gs.):', payments.efectivo || 0],
        ['📱 Transferencia (Gs.):', payments.transferencia || 0],
        ['💳 Tarjeta Débito (Gs.):', payments.debito || 0],
        ['💳 Tarjeta Crédito (Gs.):', payments.credito || 0],
        [''],
        ['--- OPERACIONES Y CAJA ---'],
        ['Pedidos Cobrados:', paidOrders.length],
        ['Pedidos Cancelados:', allOrders.filter(o => o.status === 'cancelled').length],
        ['Gastos Registrados:', expenses.length],
        ['Turnos / Cajas en el período:', registers.length]
    ];
    buildBurgameSheet(wsResumen, resumenRows, { firstRowIsTitle: true, imageRows: 5 });

    // 2. Ventas Detalladas (Formato Superior: Ticket Principal + Renglones de Artículos con IVA)
    const wsVentas = wb.addWorksheet('Ventas');
    const ventasHeader = [
        'ID / DOC',
        '# PEDIDO',
        'FECHA Y HORA',
        'CLIENTE',
        'USUARIO / CAJA',
        'M. DE PAGO',
        'TIPO',
        'SUBTOTAL',
        'IVA 10%',
        'TOTAL (Gs.)',
        'NOTAS'
    ];
    const ventasRows = [[''], [''], [''], [''], [''], ventasHeader];

    paidOrders.forEach((o) => {
        const orderTotal = o.total || 0;
        const orderIva = Math.round(orderTotal / 11);
        const orderSubtotal = orderTotal - orderIva;
        const methodDisplay = paymentLabels[o.payment_method] || o.payment_method || 'Efectivo';

        // Fila Maestra del Pedido
        const headerRow = [
            (o.id || '').slice(0, 8),
            o.order_number || '—',
            fmtDate(o.created_at),
            o.customer_name || 'Consumidor Final',
            'BurgAdmin / Central',
            `${methodDisplay}: ${orderTotal.toLocaleString('es-PY')}`,
            'Contado',
            orderSubtotal,
            orderIva,
            orderTotal,
            o.notes || ''
        ];
        headerRow._isOrderHeader = true;
        ventasRows.push(headerRow);

        // Subcabecera de Artículos
        const items = o.order_items || [];
        if (items.length > 0) {
            const subHead = ['', 'CANTIDAD', 'ARTÍCULO', 'PRECIO UNITARIO', 'SUBTOTAL ITEM', '', '', '', '', '', ''];
            ventasRows.push(subHead);

            // Renglón por cada artículo
            items.forEach((it) => {
                const qty = it.quantity || 1;
                const price = it.price || 0;
                const sub = price * qty;
                const cleanName = (it.product_name || 'Item').replace(/\s*\[📝\s*[^\]]+\]/, '').trim();

                const itemRow = [
                    '',
                    qty,
                    cleanName,
                    price,
                    sub,
                    it.is_combo ? 'COMBO' : 'INDIVIDUAL',
                    '', '', '', '', ''
                ];
                itemRow._isSubItem = true;
                ventasRows.push(itemRow);
            });
        }

        // Fila espaciadora entre pedidos para legibilidad
        ventasRows.push([]);
    });

    // Fila de Totales Generales
    ventasRows.push(['', '', '', '', '', 'TOTALES', '', totalSubtotal, totalIva, totalSales, '']);
    buildBurgameSheet(wsVentas, ventasRows, { imageRows: 5 });

    // 3. Ítems / Ranking de Productos (Idéntico y superior al reporte mensual de 3 columnas)
    const wsItems = wb.addWorksheet('Productos');
    const itemsHeader = ['#', 'Nombre', 'Cantidad', 'Total (Gs.)', '% del Total'];
    const itemsRows = [[''], [''], [''], [''], [''], itemsHeader];
    topProducts.forEach((p, idx) => {
        const pct = totalSales > 0 ? ((p.total / totalSales) * 100).toFixed(1) + '%' : '0%';
        itemsRows.push([
            idx + 1,
            p.name,
            p.qty,
            p.total,
            pct
        ]);
    });
    itemsRows.push([]);
    itemsRows.push(['', 'TOTALES', topProducts.reduce((sum, p) => sum + p.qty, 0), totalSales, '100%']);
    buildBurgameSheet(wsItems, itemsRows, { imageRows: 5 });

    // 4. Gastos Detallados
    const wsGastos = wb.addWorksheet('Gastos');
    const gastosHeader = ['#', 'Fecha y Hora', 'Descripción', 'Categoría', 'Monto (Gs.)'];
    const gastosRows = [[''], [''], [''], [''], [''], gastosHeader];
    expenses.forEach((e, idx) => {
        gastosRows.push([
            idx + 1,
            fmtDate(e.created_at),
            e.description || '—',
            (e.expense_categories && e.expense_categories.name) || 'Sin categoría',
            e.amount || 0
        ]);
    });
    gastosRows.push([]);
    gastosRows.push(['', '', '', 'TOTAL GASTOS', totalExpenses]);
    buildBurgameSheet(wsGastos, gastosRows, { imageRows: 5 });

    // Descarga con branding
    const safeDateStr = (periodLabel || 'Reporte').replace(/[^a-zA-Z0-9_-]/g, '_');
    await downloadBurgameExcel(wb, `Burgame_Reporte_${safeDateStr}.xlsx`, {
        logoSheets: ['Resumen', 'Ventas', 'Productos', 'Gastos'],
        bannerSheet: 'Resumen'
    });
}

