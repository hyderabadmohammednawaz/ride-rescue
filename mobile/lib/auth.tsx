import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, clearToken, getToken, setToken } from './api';
import { signOutFirebase } from './phoneAuth';

export interface Vehicle {
  _id: string;
  make: string;
  model: string;
  registrationNumber: string;
  year?: number;
  fuelType?: 'Petrol' | 'Electric';
  odometerKm?: number;
  lastServiceOdometerKm?: number;
  lastServiceDate?: string;
  isPrimary?: boolean;
}

export interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'mechanic' | 'vendor' | 'admin';
  avatarColor?: string;
  walletBalance: number;
  referralCode?: string;
  phoneVerified?: boolean;
  location: { coordinates: [number, number]; address?: string };
  vehicles: Vehicle[];
  emergencyContact?: { name?: string; phone?: string };
  mechanicProfile?: {
    experienceYears: number;
    isAvailable: boolean;
    ratingAverage: number;
    ratingCount: number;
    completedJobs: number;
    serviceRadiusKm: number;
  };
}

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  /** Completes a session from a token issued by any of the auth routes. */
  adoptSession: (token: string, user: User) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
}

const AuthContext = createContext<AuthValue>({} as AuthValue);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user } = await api<{ user: User }>('/auth/me');
      setUser(user);
    } catch {
      await clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const res = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      auth: false,
      body: { email, password },
    });
    await setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const adoptSession = async (token: string, nextUser: User) => {
    await setToken(token);
    setUser(nextUser);
    return nextUser;
  };

  const logout = async () => {
    await clearToken();
    setUser(null);
    // Drop the Firebase session too, so the next phone sign-in starts clean.
    await signOutFirebase();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, adoptSession, logout, refresh, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
