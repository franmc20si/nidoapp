import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://tdwpdnvwneajnqiezjbf.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRkd3BkbnZ3bmVham5xaWV6amJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAyMTA3ODUsImV4cCI6MjA5NTc4Njc4NX0.vJcnAgqSPK7xgrBuXNsxkvZxWSyeUVE8H0LY9mZf2o8';

// On web use the browser's localStorage (Supabase default) so detectSessionInUrl
// can read OAuth tokens from the URL hash correctly.
// On native use AsyncStorage for persistence.
const storage = Platform.OS === 'web' ? undefined : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'implicit',
  },
});
