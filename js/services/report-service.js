import { supabase } from '../supabase-client.js';
import {
    getParaguayToday,
    formatParaguayTime,
    formatParaguayDate,
    getParaguayHour,
    getParaguayIsoRange,
    addDaysToYmd
} from '../utils/date-utils.js';

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
    const today = getParaguayToday();
    const start = addDaysToYmd(today, -7);
    const { fromIso } = getParaguayIsoRange(start, today);

    const { data, error } = await supabase.from('orders').select('*').gte('created_at', fromIso).not('paid_at', 'is', null);
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
    const today = getParaguayToday();
    const start = addDaysToYmd(today, -days);
    const { fromIso } = getParaguayIsoRange(start, today);

    const { data, error } = await supabase
        .from('orders')
        .select('total, status, payment_method, created_at, paid_at')
        .gte('created_at', fromIso)
        .not('paid_at', 'is', null)
        .order('created_at', { ascending: true });

    if (error) throw error;

    // Agrupar por día según zona horaria oficial de Paraguay (America/Asuncion)
    const dailyMap = {};
    (data || []).forEach(order => {
        const day = formatParaguayDate(order.created_at);
        if (!day) return;
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

    // Serie temporal por día (Ventas vs Gastos) en hora de Paraguay
    const timelineMap = {};
    paidOrders.forEach(o => {
        const d = formatParaguayDate(o.created_at);
        if (!d) return;
        if (!timelineMap[d]) timelineMap[d] = { date: d, sales: 0, expenses: 0, count: 0 };
        timelineMap[d].sales += (o.total || 0);
        timelineMap[d].count += 1;
    });
    expenses.forEach(e => {
        const d = e.expense_date || formatParaguayDate(e.created_at);
        if (!d) return;
        if (!timelineMap[d]) timelineMap[d] = { date: d, sales: 0, expenses: 0, count: 0 };
        timelineMap[d].expenses += (e.amount || 0);
    });

    // Ordenar serie por fecha ascendente
    const timeline = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date));

    // Horas pico (distribución por hora 0 a 23 en hora de Paraguay)
    const hourlyDistribution = Array(24).fill(0);
    const hourlySales = Array(24).fill(0);
    paidOrders.forEach(o => {
        const h = getParaguayHour(o.created_at);
        if (h >= 0 && h < 24) {
            hourlyDistribution[h] += 1;
            hourlySales[h] += (o.total || 0);
        }
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

    // Análisis integral de tiempos y cuellos de botella de cocina (KDS)
    const kitchenPerformance = calculateKitchenPerformance(allOrders);

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
        topProducts,
        kitchenPerformance
    };
}

// ============================================================
// Análisis de Tiempos y Rendimiento de Cocina (KDS)
// ============================================================
export function calculateKitchenPerformance(orders = []) {
    const orderTimes = [];
    const hourlyMap = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        label: `${String(i).padStart(2, '0')}:00`,
        count: 0,
        totalWait: 0,
        delayedCount: 0,
        criticalCount: 0,
        avgMinutes: 0
    }));

    const productDelays = {};
    const modalityMap = {
        salon: { count: 0, totalWait: 0, delayed: 0, label: '🍽️ Salón' },
        llevar: { count: 0, totalWait: 0, delayed: 0, label: '🥡 Llevar' },
        delivery: { count: 0, totalWait: 0, delayed: 0, label: '🛵 Delivery' },
        other: { count: 0, totalWait: 0, delayed: 0, label: '📦 General' }
    };

    let totalRealisticOrders = 0;
    let totalRealisticMinutes = 0;
    let totalQueueMinutes = 0;
    let countQueue = 0;
    let totalCookingMinutes = 0;
    let countCooking = 0;

    let onTimeCount = 0;   // < 15 min
    let delayedCount = 0;  // 15 - 25 min
    let criticalCount = 0; // >= 25 min

    orders.forEach(order => {
        if (!order.created_at) return;
        const createdAt = new Date(order.created_at);
        const preparingAt = order.preparing_at ? new Date(order.preparing_at) : null;
        const readyAt = order.ready_at ? new Date(order.ready_at) : (order.delivered_at ? new Date(order.delivered_at) : null);
        const deliveredAt = order.delivered_at ? new Date(order.delivered_at) : null;

        // Minutos de espera total (hasta estar listo o entregado)
        let totalMinutes = null;
        let isCompleted = false;

        if (readyAt) {
            totalMinutes = Math.max(0, (readyAt.getTime() - createdAt.getTime()) / 60000);
            isCompleted = true;
        } else if (deliveredAt) {
            totalMinutes = Math.max(0, (deliveredAt.getTime() - createdAt.getTime()) / 60000);
            isCompleted = true;
        } else if (order.status === 'ordered' || order.status === 'preparing') {
            const hoursAgo = (Date.now() - createdAt.getTime()) / 3600000;
            // Solo si la orden es reciente (turno actual <= 18h) se calcula tiempo en curso
            if (hoursAgo <= 18) {
                totalMinutes = Math.max(0, (Date.now() - createdAt.getTime()) / 60000);
                isCompleted = false;
            } else {
                // Orden histórica abandonada/olvidada sin cerrar en turnos previos
                totalMinutes = null;
                isCompleted = false;
            }
        }

        // Minutos en cola (esperando que inicien preparación)
        let queueMinutes = null;
        if (preparingAt) {
            queueMinutes = Math.max(0, (preparingAt.getTime() - createdAt.getTime()) / 60000);
        }

        // Minutos de cocción (plancha activa)
        let cookingMinutes = null;
        if (preparingAt && readyAt) {
            cookingMinutes = Math.max(0, (readyAt.getTime() - preparingAt.getTime()) / 60000);
        }

        // Detectar modalidad desde notas
        const notesUpper = (order.notes || '').toUpperCase();
        let modality = 'other';
        if (notesUpper.includes('SALÓN') || notesUpper.includes('SALON') || notesUpper.includes('MESA')) modality = 'salon';
        else if (notesUpper.includes('LLEVAR') || notesUpper.includes('RETIR')) modality = 'llevar';
        else if (notesUpper.includes('DELIVERY')) modality = 'delivery';

        // Categoría de retraso
        let delayCategory = 'optimal';
        let delayBadge = '🟢 Rápido';
        let delayColor = '#00E676';

        if (totalMinutes !== null) {
            if (totalMinutes >= 25) {
                delayCategory = 'critical';
                delayBadge = '🔴 Crítico';
                delayColor = '#FF3D71';
            } else if (totalMinutes >= 15) {
                delayCategory = 'delayed';
                delayBadge = '🟠 Demorado';
                delayColor = '#FF9100';
            } else if (totalMinutes >= 12) {
                delayCategory = 'normal';
                delayBadge = '🟡 Normal';
                delayColor = '#FFD700';
            }
        }

        // Consideramos realista si está entre 0 y 180 minutos (3 horas) para no distorsionar con comandas olvidadas
        const isRealistic = totalMinutes !== null && totalMinutes >= 0 && totalMinutes <= 180;

        if (isCompleted && isRealistic) {
            totalRealisticOrders++;
            totalRealisticMinutes += totalMinutes;

            if (totalMinutes < 15) onTimeCount++;
            else if (totalMinutes < 25) delayedCount++;
            else criticalCount++;

            if (queueMinutes !== null && queueMinutes <= 180) {
                totalQueueMinutes += queueMinutes;
                countQueue++;
            }
            if (cookingMinutes !== null && cookingMinutes <= 180) {
                totalCookingMinutes += cookingMinutes;
                countCooking++;
            }

            // Horas del día (hora paraguaya)
            const hour = getParaguayHour(order.created_at);
            if (hour >= 0 && hour < 24) {
                hourlyMap[hour].count++;
                hourlyMap[hour].totalWait += totalMinutes;
                if (totalMinutes >= 25) hourlyMap[hour].criticalCount++;
                else if (totalMinutes >= 15) hourlyMap[hour].delayedCount++;
            }

            // Modalidad
            if (modalityMap[modality]) {
                modalityMap[modality].count++;
                modalityMap[modality].totalWait += totalMinutes;
                if (totalMinutes >= 15) modalityMap[modality].delayed++;
            }

            // Productos involucrados en pedidos demorados (>= 15 min)
            (order.order_items || []).forEach(item => {
                const pName = (item.product_name || 'Producto')
                    .replace(/\s*\[📝\s*[^\]]+\]/, '')
                    .replace(/\s*\(COMBO\)/i, '')
                    .trim();
                const qty = item.quantity || 1;

                // Filtrar bebidas comunes para centrar el cuello de botella en cocina/hamburguesas
                const isBeverage = /^(coca|sprite|fanta|agua|cerveza|gaseosa|jugo|bebida|schweppes|heineken|pilsen|budweiser)/i.test(pName);
                if (!isBeverage) {
                    if (!productDelays[pName]) {
                        productDelays[pName] = { name: pName, totalPrepared: 0, delayedOrders: 0, totalWaitSum: 0 };
                    }
                    productDelays[pName].totalPrepared += qty;
                    if (totalMinutes >= 15) {
                        productDelays[pName].delayedOrders++;
                        productDelays[pName].totalWaitSum += totalMinutes;
                    }
                }
            });
        }

        const itemsSummary = (order.order_items || []).map(i => `${i.quantity}x ${i.product_name}`).join(', ');

        orderTimes.push({
            id: order.id,
            order_number: order.order_number,
            customer_name: order.customer_name || 'Mostrador / Mesa',
            status: order.status,
            notes: order.notes || '',
            modality,
            modalityLabel: modalityMap[modality]?.label || 'General',
            created_at: order.created_at,
            preparing_at: order.preparing_at,
            ready_at: order.ready_at,
            delivered_at: order.delivered_at,
            createdAtFormatted: order.created_at ? formatParaguayTime(order.created_at) : '—',
            preparingAtFormatted: order.preparing_at ? formatParaguayTime(order.preparing_at) : '—',
            readyAtFormatted: order.ready_at ? formatParaguayTime(order.ready_at) : (order.delivered_at ? formatParaguayTime(order.delivered_at) : '—'),
            productsSummary: itemsSummary,
            totalMinutes: totalMinutes !== null ? Math.round(totalMinutes * 10) / 10 : null,
            queueMinutes: queueMinutes !== null ? Math.round(queueMinutes * 10) / 10 : null,
            cookingMinutes: cookingMinutes !== null ? Math.round(cookingMinutes * 10) / 10 : null,
            delayCategory,
            delayBadge,
            delayColor,
            isCompleted,
            isRealistic,
            itemsSummary
        });
    });

    // Calcular promedios por hora
    hourlyMap.forEach(h => {
        h.avgMinutes = h.count > 0 ? Math.round((h.totalWait / h.count) * 10) / 10 : 0;
    });

    const avgTotalMinutes = totalRealisticOrders > 0 ? Math.round((totalRealisticMinutes / totalRealisticOrders) * 10) / 10 : 0;
    const avgQueueMinutes = countQueue > 0 ? Math.round((totalQueueMinutes / countQueue) * 10) / 10 : 0;
    const avgCookingMinutes = countCooking > 0 ? Math.round((totalCookingMinutes / countCooking) * 10) / 10 : 0;

    const onTimePct = totalRealisticOrders > 0 ? Math.round((onTimeCount / totalRealisticOrders) * 100) : 0;
    const delayedPct = totalRealisticOrders > 0 ? Math.round(((delayedCount + criticalCount) / totalRealisticOrders) * 100) : 0;

    // Productos cuello de botella ordenados por cantidad de apariciones en demoras
    const topBottleneckProducts = Object.values(productDelays)
        .filter(p => p.delayedOrders > 0)
        .map(p => ({
            ...p,
            pctDelayed: p.totalPrepared > 0 ? Math.round((p.delayedOrders / p.totalPrepared) * 100) : 0,
            avgWaitWhenDelayed: p.delayedOrders > 0 ? Math.round((p.totalWaitSum / p.delayedOrders) * 10) / 10 : 0,
            avgDelayMinutes: p.delayedOrders > 0 ? Math.round((p.totalWaitSum / p.delayedOrders) * 10) / 10 : 0
        }))
        .sort((a, b) => b.delayedOrders - a.delayedOrders)
        .slice(0, 10);

    // Identificar hora con peor cuello de botella
    const peakDelayHour = [...hourlyMap].filter(h => h.count >= 3).sort((a, b) => b.avgMinutes - a.avgMinutes)[0] || null;

    // Diagnóstico inteligente automático
    let diagnosis = [];
    if (totalRealisticOrders === 0) {
        diagnosis.push('No hay suficientes pedidos cerrados con tiempos registrados en este rango.');
    } else {
        if (avgTotalMinutes >= 25) {
            diagnosis.push(`🚨 CRÍTICO: La cocina promedia ${avgTotalMinutes} min por pedido. El ${delayedPct}% de las órdenes superó los 15 min.`);
        } else if (avgTotalMinutes >= 15) {
            diagnosis.push(`⚠️ ATENCIÓN: Tiempo promedio de ${avgTotalMinutes} min (supera la meta de 15 min). ${delayedPct}% de demoras.`);
        } else {
            diagnosis.push(`✅ ÓPTIMO: Tiempo promedio de ${avgTotalMinutes} min. El ${onTimePct}% de los pedidos salió dentro de la meta.`);
        }

        if (avgQueueMinutes >= 10 && avgQueueMinutes > avgCookingMinutes) {
            diagnosis.push(`⏳ Cuello de botella en ESPERA PREVIA: Las comandas pasan ${avgQueueMinutes} min en cola antes de que empiece la cocción.`);
        }

        if (peakDelayHour && peakDelayHour.avgMinutes >= 20) {
            diagnosis.push(`🔥 Franja de saturación: ${peakDelayHour.label} hs promedia ${peakDelayHour.avgMinutes} min con ${peakDelayHour.delayedCount + peakDelayHour.criticalCount} órdenes demoradas.`);
        }

        if (topBottleneckProducts.length > 0) {
            diagnosis.push(`🍔 Producto con más demoras: "${topBottleneckProducts[0].name}" (presente en ${topBottleneckProducts[0].delayedOrders} órdenes demoradas).`);
        }
    }

    // Ordenar orderTimes por created_at desc
    orderTimes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    return {
        orderTimes,
        totalOrders: orders.length,
        totalRealisticOrders,
        avgTotalMinutes,
        avgQueueMinutes,
        avgCookingMinutes,
        onTimeCount,
        onTimePct,
        delayedCount,
        criticalCount,
        delayedPct,
        hourlyMap,
        topBottleneckProducts,
        modalityMap,
        peakDelayHour,
        diagnosis
    };
}

// Obtener datos completos de un día específico para Excel o auditoría
export async function getDayFullConsolidated(dateStr) {
    const { fromIso, toIso } = getParaguayIsoRange(dateStr);

    const analytics = await getAnalyticsByRange(fromIso, toIso);

    // Cajas que abrieron ese día en hora de Paraguay
    const { data: registers } = await supabase.from('cash_registers')
        .select('*')
        .gte('opened_at', fromIso)
        .lte('opened_at', toIso)
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
    printThermalReport,
    calculateKitchenPerformance
};

