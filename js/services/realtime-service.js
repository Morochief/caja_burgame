import { supabase } from '../supabase-client.js';

let channel = null;

export function subscribeToOrders(onInsert, onUpdate) {
    channel = supabase.channel('realtime_orders')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
            if (onInsert) onInsert(payload);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, payload => {
            if (onUpdate) onUpdate(payload);
        })
        .subscribe();
    return channel;
}

export function unsubscribe() {
    if (channel) {
        supabase.removeChannel(channel);
        channel = null;
    }
}
