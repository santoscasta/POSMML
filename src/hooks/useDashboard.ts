import { useState, useEffect, useCallback, useRef } from 'react';
import { apiGet } from '../utils/apiClient';

export interface DashboardData {
  shopifyConnected: boolean;
  store: string;
  sessionOpen: boolean;
  sessionId: string | null;
  todaySales: number;
  todayOrders: number;
  activeVouchers: number;
  voucherBalance: number;
  paymentBreakdown: {
    cash: number;
    card: number;
    bizum: number;
    mixed: number;
  };
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await apiGet<DashboardData>('/dashboard');
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  return { data, loading, error, refresh };
}
