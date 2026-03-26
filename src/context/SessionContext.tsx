import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
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
  openSession: (input: OpenSessionInput) => Promise<void>;
  closeSession: (input: CloseSessionInput) => Promise<SessionCloseResult>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionWithKPIs | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await apiGet<SessionWithKPIs | null>('/sessions/current');
      setSession(data);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openSession = useCallback(async (input: OpenSessionInput & { force?: boolean }) => {
    const data = await apiPost<SessionWithKPIs>('/sessions/open', input);
    setSession(data);
  }, []);

  const closeSession = useCallback(async (input: CloseSessionInput & { force?: boolean }): Promise<SessionCloseResult> => {
    if (!session) throw new Error('No session open');
    const result = await apiPost<SessionCloseResult>('/sessions/close', { ...input, sessionId: session.id });
    setSession(null);
    return result;
  }, [session]);

  return (
    <SessionContext.Provider value={{ session, isOpen: !!session, loading, openSession, closeSession, refresh }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used within SessionProvider');
  return context;
}
