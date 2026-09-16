import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { apiGet, apiPost } from '../utils/apiClient';
import type { CashSession, SessionKPIs, OpenSessionInput, CloseSessionInput } from '../types/session';

interface SessionWithKPIs extends CashSession {
  kpis?: SessionKPIs;
}

export interface SessionCloseResult extends SessionWithKPIs {
  orderDetails?: {
    name: string;
    amount: number;
    method: string;
    type: string;
    voucherCode?: string;
  }[];
}

interface SessionContextValue {
  session: SessionWithKPIs | null;
  isOpen: boolean;
  loading: boolean;
  error: string | null;
  openSession: (input: OpenSessionInput) => Promise<void>;
  closeSession: (input: CloseSessionInput) => Promise<SessionCloseResult>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionWithKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  const requestVersion = useRef(0);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    try {
      const data = await apiGet<SessionWithKPIs | null>('/sessions/current');
      if (version !== requestVersion.current) return;
      setSession(data);
      setError(null);
    } catch {
      if (version !== requestVersion.current) return;
      setError("No se pudo comprobar la caja. Revisa la conexión y reintenta.");
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const sync = () => { if (document.visibilityState === 'visible') void refresh(); };
    const interval = window.setInterval(sync, 30000);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    const version = requestVersion;
    return () => {
      ++version.current;
      clearInterval(interval);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [refresh]);

  const openSession = useCallback(async (input: OpenSessionInput & { force?: boolean }) => {
    const data = await apiPost<SessionWithKPIs>('/sessions/open', input);
    ++requestVersion.current;
    setSession(data);
    setError(null);
    setLoading(false);
  }, []);

  const closeSession = useCallback(async (input: CloseSessionInput & { force?: boolean }): Promise<SessionCloseResult> => {
    if (!session) throw new Error('No session open');
    const result = await apiPost<SessionCloseResult>('/sessions/close', { ...input, sessionId: session.id });
    ++requestVersion.current;
    setSession(null);
    setError(null);
    setLoading(false);
    return result;
  }, [session]);

  return (
    <SessionContext.Provider value={{ session, isOpen: !!session, loading, error, openSession, closeSession, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

// Context hooks share their provider module; edits may require a full refresh.
// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider');
  return context;
}
