import { supabase } from '../supabase-client.js';

const TABLE = 'kitchen_messages';

export const chatService = {
    async sendMessage(senderRole, message) {
        const { data, error } = await supabase
            .from(TABLE)
            .insert({ sender_role: senderRole, message })
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /** Editar un mensaje propio */
    async updateMessage(id, newText) {
        const { data, error } = await supabase
            .from(TABLE)
            .update({ message: newText, edited: true, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async getTodayMessages() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { data, error } = await supabase
            .from(TABLE)
            .select('*')
            .gte('created_at', today.toISOString())
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data || [];
    },

    /** Suscribirse a INSERT y UPDATE en tiempo real */
    subscribeToMessages(onInsert, onUpdate) {
        const channel = supabase
            .channel('kitchen-chat-' + Date.now())
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: TABLE
            }, (payload) => onInsert(payload.new))
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: TABLE
            }, (payload) => { if (onUpdate) onUpdate(payload.new); })
            .subscribe();
        return channel;
    },

    async markRead(ids) {
        if (!ids || ids.length === 0) return;
        const { error } = await supabase
            .from(TABLE)
            .update({ read_at: new Date().toISOString() })
            .in('id', ids)
            .is('read_at', null);
        if (error) console.error('Error marking read:', error);
    },

    /** Limpiar mensajes del dia actual (para admin) */
    async clearTodayMessages() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { error } = await supabase
            .from(TABLE)
            .delete()
            .gte('created_at', today.toISOString());
        if (error) throw error;
    },

    unsubscribe(channel) {
        if (channel) supabase.removeChannel(channel);
    }
};
