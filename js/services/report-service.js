import { supabase } from '../supabase-client.js';

export async function getCurrentShiftSummary(cashRegisterId) {
    if (!cashRegisterId) {
        return {
            totalSales: 0,
            totalExpenses: 0,
            net: 0,
            orderCount: 0
        };
    }

    const [ordersRes, expensesRes] = await Promise.all([
        supabase.from('orders').select('*').eq('cash_register_id', cashRegisterId).not('paid_at', 'is', null),
        supabase.from('expenses').select('*').eq('cash_register_id', cashRegisterId)
    ]);

    const orders = ordersRes.data || [];
    const expenses = expensesRes.data || [];

    const totalSales = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const net = totalSales - totalExpenses;

    return {
        totalSales,
        totalExpenses,
        net,
        orderCount: orders.length
    };
}

export async function getWeeklySales() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data, error } = await supabase.from('orders').select('*').gte('created_at', sevenDaysAgo.toISOString()).not('paid_at', 'is', null);
    if (error) throw error;
    return data || [];
}

export async function getTopProducts(limit = 10) {
    const { data, error } = await supabase.from('order_items').select('*').limit(limit);
    if (error) throw error;
    return data || [];
}

export async function getPaymentBreakdown() {
    const { data, error } = await supabase.from('orders').select('payment_method, total').not('paid_at', 'is', null);
    if (error) throw error;
    return data || [];
}

export async function getRegisterHistory() {
    const { data, error } = await supabase.from('cash_registers').select('*').order('opened_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function getDailySalesSummary(days = 30) {
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - days);
    fromDate.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
        .from('orders')
        .select('total, status, payment_method, created_at, paid_at')
        .gte('created_at', fromDate.toISOString())
        .not('paid_at', 'is', null)
        .order('created_at', { ascending: true });

    if (error) throw error;

    // Agrupar por día
    const dailyMap = {};
    (data || []).forEach(order => {
        const day = new Date(order.created_at).toISOString().split('T')[0];
        if (!dailyMap[day]) {
            dailyMap[day] = {
                date: day,
                totalSales: 0,
                orderCount: 0,
                payments: { efectivo: 0, transferencia: 0, debito: 0, credito: 0 }
            };
        }
        dailyMap[day].totalSales += order.total || 0;
        dailyMap[day].orderCount++;
        const method = order.payment_method || 'efectivo';
        if (dailyMap[day].payments[method] !== undefined) {
            dailyMap[day].payments[method] += order.total || 0;
        }
    });

    return Object.values(dailyMap).reverse(); // más reciente primero
}

// Carga lazy de Chart.js si por alguna razón no terminó de cargar el script defer
export async function ensureChartJS() {
    if (window.Chart) return window.Chart;
    return new Promise((resolve, reject) => {
        const existing = document.querySelector('script[src*="chart.js"], script[src*="chart.umd.min.js"]');
        if (existing) {
            existing.addEventListener('load', () => resolve(window.Chart));
            existing.addEventListener('error', () => reject(new Error('No se pudo cargar Chart.js')));
            // Por si ya cargó mientras armábamos la promesa
            if (window.Chart) resolve(window.Chart);
        } else {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js';
            s.onload = () => resolve(window.Chart);
            s.onerror = () => reject(new Error('No se pudo cargar Chart.js'));
            document.head.appendChild(s);
        }
    });
}

// Análisis completo para rango de fechas (Dashboard y Reportes)
export async function getAnalyticsByRange(fromIso, toIso) {
    const [ordersRes, expensesRes] = await Promise.all([
        supabase.from('orders')
            .select('*, order_items(*)')
            .gte('created_at', fromIso)
            .lte('created_at', toIso)
            .order('created_at', { ascending: true }),
        supabase.from('expenses')
            .select('*, expense_categories(*)')
            .gte('created_at', fromIso)
            .lte('created_at', toIso)
            .order('created_at', { ascending: true })
    ]);

    if (ordersRes.error) throw ordersRes.error;
    if (expensesRes.error) throw expensesRes.error;

    const allOrders = ordersRes.data || [];
    const expenses = expensesRes.data || [];
    const paidOrders = allOrders.filter(o => o.paid_at);

    // Totales globales
    const totalSales = paidOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netProfit = totalSales - totalExpenses;
    const profitMargin = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : 0;
    const orderCount = paidOrders.length;
    const avgTicket = orderCount > 0 ? Math.round(totalSales / orderCount) : 0;

    // Métodos de pago
    const payments = { efectivo: 0, transferencia: 0, debito: 0, credito: 0 };
    paidOrders.forEach(o => {
        const m = (o.payment_method || 'efectivo').toLowerCase();
        if (payments[m] !== undefined) payments[m] += (o.total || 0);
        else payments.efectivo += (o.total || 0);
    });

    // Serie temporal por día (Ventas vs Gastos)
    const timelineMap = {};
    paidOrders.forEach(o => {
        const d = new Date(o.created_at).toISOString().split('T')[0];
        if (!timelineMap[d]) timelineMap[d] = { date: d, sales: 0, expenses: 0, count: 0 };
        timelineMap[d].sales += (o.total || 0);
        timelineMap[d].count += 1;
    });
    expenses.forEach(e => {
        const d = new Date(e.created_at).toISOString().split('T')[0];
        if (!timelineMap[d]) timelineMap[d] = { date: d, sales: 0, expenses: 0, count: 0 };
        timelineMap[d].expenses += (e.amount || 0);
    });

    // Ordenar serie por fecha ascendente
    const timeline = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date));

    // Horas pico (distribución por hora 0 a 23)
    const hourlyDistribution = Array(24).fill(0);
    const hourlySales = Array(24).fill(0);
    paidOrders.forEach(o => {
        const h = new Date(o.created_at).getHours();
        hourlyDistribution[h] += 1;
        hourlySales[h] += (o.total || 0);
    });

    // Desglose de Gastos por Categoría (P&L)
    const categoryMap = {};
    expenses.forEach(e => {
        const catName = (e.expense_categories && e.expense_categories.name) || 'Otros / Sin categoría';
        if (!categoryMap[catName]) {
            categoryMap[catName] = { name: catName, total: 0, count: 0 };
        }
        categoryMap[catName].total += (e.amount || 0);
        categoryMap[catName].count++;
    });
    const expenseCategories = Object.values(categoryMap)
        .map(c => ({
            name: c.name,
            total: c.total,
            count: c.count,
            pctOfExpenses: totalExpenses > 0 ? ((c.total / totalExpenses) * 100).toFixed(1) : '0',
            pctOfSales: totalSales > 0 ? ((c.total / totalSales) * 100).toFixed(1) : '0'
        }))
        .sort((a, b) => b.total - a.total);

    // Identificar Hora Pico
    let peakHour = 20;
    let maxHourlyCount = 0;
    hourlyDistribution.forEach((cnt, hr) => {
        if (cnt > maxHourlyCount) {
            maxHourlyCount = cnt;
            peakHour = hr;
        }
    });

    // Ranking de productos
    const productStats = {};
    paidOrders.forEach(order => {
        (order.order_items || []).forEach(item => {
            const name = item.product_name || 'Producto';
            if (!productStats[name]) productStats[name] = { qty: 0, total: 0 };
            productStats[name].qty += (item.quantity || 1);
            productStats[name].total += ((item.price || 0) * (item.quantity || 1));
        });
    });
    const topProducts = Object.entries(productStats)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.qty - a.qty);

    return {
        allOrders,
        paidOrders,
        expenses,
        totalSales,
        totalExpenses,
        netProfit,
        profitMargin,
        orderCount,
        avgTicket,
        payments,
        timeline,
        hourlyDistribution,
        hourlySales,
        peakHour,
        maxHourlyCount,
        expenseCategories,
        topProducts
    };
}

// Obtener datos completos de un día específico para Excel o auditoría
export async function getDayFullConsolidated(dateStr) {
    const start = new Date(dateStr);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateStr);
    end.setHours(23, 59, 59, 999);

    const analytics = await getAnalyticsByRange(start.toISOString(), end.toISOString());

    // Cajas que abrieron o cerraron ese día
    const { data: registers } = await supabase.from('cash_registers')
        .select('*')
        .gte('opened_at', start.toISOString())
        .lte('opened_at', end.toISOString())
        .order('opened_at', { ascending: true });

    return {
        ...analytics,
        registers: registers || [],
        dateStr
    };
}

// Imprime ticket de resumen fiscal y de gestión en impresora térmica (80mm / 58mm)
export function printThermalReport(analytics, periodLabel = '') {
    if (!analytics) return;

    const fmt = (n) => (n || 0).toLocaleString('es-PY') + ' Gs.';
    const totalIva = Math.round((analytics.totalSales || 0) / 11);
    const totalSubtotal = (analytics.totalSales || 0) - totalIva;

    const now = new Date();
    const emitDate = now.toLocaleDateString('es-PY') + ' ' + now.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });

    let productsRows = '';
    (analytics.topProducts || []).slice(0, 5).forEach((p, idx) => {
        productsRows += `
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
                <span>${idx + 1}. ${p.name.slice(0, 22)} x${p.qty}</span>
                <span style="font-weight: bold;">${fmt(p.total)}</span>
            </div>
        `;
    });

    let expensesRows = '';
    (analytics.expenseCategories || []).slice(0, 4).forEach(c => {
        expensesRows += `
            <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px;">
                <span>• ${c.name.slice(0, 20)} (${c.pctOfSales}%)</span>
                <span>${fmt(c.total)}</span>
            </div>
        `;
    });

    const printHtml = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Reporte_Burgame_${periodLabel}</title>
            <style>
                @page { size: 80mm auto; margin: 0; }
                body {
                    font-family: 'Courier New', Courier, monospace;
                    width: 72mm;
                    margin: 0 auto;
                    padding: 8px 4px;
                    color: #000;
                    background: #fff;
                    font-size: 12px;
                    line-height: 1.3;
                }
                .text-center { text-align: center; }
                .text-right { text-align: right; }
                .bold { font-weight: bold; }
                .divider { border-top: 1px dashed #000; margin: 6px 0; }
                .double-divider { border-top: 2px solid #000; margin: 6px 0; }
                .row { display: flex; justify-content: space-between; }
                .title { font-size: 14px; font-weight: 900; letter-spacing: 1px; }
                .subtitle { font-size: 11px; margin-top: 2px; }
            </style>
        </head>
        <body>
            <div class="text-center">
                <div class="title">BURGAME BURGERS</div>
                <div class="subtitle">ARCADE RETRO FOOD</div>
                <div class="subtitle">=== REPORTE EJECUTIVO ===</div>
                <div style="font-size: 11px; margin-top: 4px;">Período: <strong style="text-transform: uppercase;">${periodLabel}</strong></div>
                <div style="font-size: 10px; color: #555;">Emisión: ${emitDate}</div>
            </div>

            <div class="double-divider"></div>

            <div class="row bold" style="font-size: 13px;">
                <span>FACTURACIÓN BRUTA:</span>
                <span>${fmt(analytics.totalSales)}</span>
            </div>
            <div class="row" style="font-size: 11px; margin-top: 2px;">
                <span>Subtotal (Base Imponible):</span>
                <span>${fmt(totalSubtotal)}</span>
            </div>
            <div class="row" style="font-size: 11px;">
                <span>Liquidación IVA 10%:</span>
                <span>${fmt(totalIva)}</span>
            </div>
            <div class="row" style="font-size: 11px;">
                <span>Pedidos Cobrados:</span>
                <span>${analytics.orderCount} ord.</span>
            </div>
            <div class="row" style="font-size: 11px;">
                <span>Ticket Promedio:</span>
                <span>${fmt(analytics.avgTicket)}</span>
            </div>

            <div class="divider"></div>

            <div class="bold" style="font-size: 11px; margin-bottom: 3px;">DESGLOSE MEDIOS DE PAGO:</div>
            <div class="row" style="font-size: 11px;">
                <span>💵 Efectivo:</span>
                <span>${fmt(analytics.payments.efectivo)}</span>
            </div>
            <div class="row" style="font-size: 11px;">
                <span>📱 Transferencia / QR:</span>
                <span>${fmt(analytics.payments.transferencia)}</span>
            </div>
            <div class="row" style="font-size: 11px;">
                <span>💳 Débito:</span>
                <span>${fmt(analytics.payments.debito)}</span>
            </div>
            <div class="row" style="font-size: 11px;">
                <span>💳 Crédito:</span>
                <span>${fmt(analytics.payments.credito)}</span>
            </div>

            <div class="divider"></div>

            <div class="row bold" style="font-size: 12px; color: #000;">
                <span>GASTOS OPERATIVOS:</span>
                <span>${fmt(analytics.totalExpenses)}</span>
            </div>
            <div style="font-size: 10px; margin-bottom: 2px;">Total Egresos: ${analytics.expenses.length} registros</div>
            ${expensesRows}

            <div class="double-divider"></div>

            <div class="row bold" style="font-size: 14px;">
                <span>UTILIDAD NETA:</span>
                <span>${fmt(analytics.netProfit)}</span>
            </div>
            <div class="row bold" style="font-size: 11px; margin-top: 2px;">
                <span>MARGEN OPERATIVO:</span>
                <span>${analytics.profitMargin}%</span>
            </div>

            <div class="divider"></div>

            <div class="bold" style="font-size: 11px; margin-bottom: 3px;">TOP PRODUCTOS MÁS VENDIDOS:</div>
            ${productsRows}

            <div class="divider"></div>
            <div class="text-center" style="font-size: 10px; color: #555;">
                Hora Pico: ${analytics.peakHour}:00 hs (${analytics.maxHourlyCount} pedidos)<br>
                *** BURGAME POS ENTERPRISE ***
            </div>
            <br>
        </body>
        </html>
    `;

    const printWin = window.open('', '_blank', 'width=380,height=600');
    if (printWin) {
        printWin.document.open();
        printWin.document.write(printHtml);
        printWin.document.close();
        setTimeout(() => {
            printWin.focus();
            printWin.print();
        }, 300);
    }
}

export const reportService = {
    getCurrentShiftSummary,
    getWeeklySales,
    getTopProducts,
    getPaymentBreakdown,
    getRegisterHistory,
    getDailySalesSummary,
    getAnalyticsByRange,
    getDayFullConsolidated,
    ensureChartJS,
    printThermalReport
};

