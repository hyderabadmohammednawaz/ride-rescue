'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import { useRouter } from 'next/navigation';
import { api, clearToken, getToken, setToken } from './api';
import type { User } from './types';

interface AuthValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
  refresh: () => Promise<void>;
  setUser: Dispatch<SetStateAction<User | null>>;
  completeAuth: (token: string, user: User) => void;
}

const AuthContext = createContext<AuthValue>({} as AuthValue);

export const HOME_BY_ROLE: Record<string, string> = {
  customer: '/customer',
  mechanic: '/mechanic',
  vendor: '/vendor',
  admin: '/admin',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user } = await api<{ user: User }>('/auth/me');
      setUser(user);
    } catch {
      clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Keep the browser's idea of "where I am" fresh so nearest-mechanic queries work.
  useEffect(() => {
    if (!user || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        api('/profile/location', {
          method: 'PUT',
          body: { coordinates: [pos.coords.longitude, pos.coords.latitude] },
        }).catch(() => {});
      },
      () => {
        // Permission denied or unavailable - the seeded location stays in use.
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, [user?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const completeAuth = (token: string, nextUser: User) => {
    setToken(token);
    setUser(nextUser);
    router.push(HOME_BY_ROLE[nextUser.role] || '/');
  };

  const login = async (email: string, password: string) => {
    const { token, user: nextUser } = await api<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });
    completeAuth(token, nextUser);
    return nextUser;
  };

  const logout = () => {
    clearToken();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh, setUser, completeAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
