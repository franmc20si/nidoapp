import { create } from 'zustand';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Profile, Household } from '@/types';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  household: Household | null;
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setHousehold: (household: Household | null) => void;
  signOut: () => Promise<void>;
  resetHousehold: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  profile: null,
  household: null,
  isLoading: true,

  setSession: (session) =>
    set({ session, user: session?.user ?? null, isLoading: false }),

  setProfile: (profile) => set({ profile }),

  setHousehold: (household) => set({ household }),

  signOut: async () => {
    await supabase.auth.signOut();
    set({ session: null, user: null, profile: null, household: null });
  },

  resetHousehold: () => set({ household: null }),
}));
