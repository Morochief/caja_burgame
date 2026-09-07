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

    subscribeToMessages(callback) {
        const channel = supabase
            .channel('kitchen-chat-' + Date.now())
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: TABLE
            }, (payload) => callback(payload.new))
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

    unsubscribe(channel) {
        if (channel) supabase.removeChannel(channel);
    }
};
