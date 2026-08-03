import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://vgpaexxlxexegnivfxgj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZncGFleHhseGV4ZWduaXZmeGdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3NTg0MjksImV4cCI6MjEwMTMzNDQyOX0.VcTgNG84V7NbkSZjwu1hdeoK1HCk8z4F1yjbP6K-ilQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
