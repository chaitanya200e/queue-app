import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin emails for role-based access
export const ADMIN_EMAILS = ["chaitanyamandale125@gmail.com"];
export const SUPER_ADMIN_EMAILS = ["chaitanyamandale125@gmail.com"];
