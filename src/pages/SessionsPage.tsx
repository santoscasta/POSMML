import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSession } from '../context/SessionContext';
import { apiGet } from '../utils/apiClient';
import { formatCurrency } from '../utils/currency';
import { es } from '../i18n/es';
import { OpenSessionModal } from '../components/sessions/OpenSessionModal';
import { CloseSessionModal } from '../components/sessions/CloseSessionModal';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Plus, X, RefreshCw } from 'lucide-react';
import type { CashSession } from '../types/session';

export function SessionsPage() {
  const { session, isOpen, loading, refresh } = useSession();
  const [refreshing, setRefreshing] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const data = await apiGet<CashSession[]>('/sessions?limit=5');
        if (!cancelled) setHistory(data);
      } catch (error) {
        if (!cancelled) setHistoryError(error instanceof Error ? error.message : 'Error al consultar el historial');
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    void fetchHistory();
    return () => { cancelled = true; };
  }, [isOpen, historyAttempt]);

  useEffect(() => {
    if (isOpen && searchParams.get('cerrar') === '1') {
      setCloseModalVisible(true);
      setSearchParams({}, { replace: true });
    }
  }, [isOpen, searchParams, setSearchParams]);

  useEffect(() => { void refresh(); }, [refresh]);

  const refreshPage = async () => {
    setRefreshing(true);
    try { await refresh(); setHistoryAttempt(value => value + 1); }
    finally { setRefreshing(false); }
  };
  const kpis = session?.kpis;

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'No registrada';
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (start: string | null, end?: string) => {
    if (!start) return '—';
    const startDate = new Date(start);
    const endDate = end ? new Date(end) : new Date();
    const diffMs = endDate.getTime() - startDate.getTime();
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        {es.pos.loading}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6">
        <h1 className="text-xl font-semibold">{es.nav.cashRegister}</h1>
        <Button variant="outline" onClick={() => void refreshPage()} disabled={refreshing}>
          <RefreshCw className={cn('size-4', refreshing && 'animate-spin')} />Actualizar
        </Button>
      </div>

      {isOpen && session ? (
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>
                {es.sessions.currentSession}
              </CardTitle>
              <Badge className="bg-success text-white">Abierta</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {session.accountingError && <p role="alert" className="mb-4 rounded border border-amber-400 bg-amber-50 p-3 text-sm">{session.accountingError}</p>}
            <div className="mb-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{es.sessions.cashierName}</span>
                <span className="font-medium">{session.cashierName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Apertura</span>
                <span className="font-medium">{formatDate(session.openedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duración</span>
                <span className="font-medium">{formatDuration(session.openedAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{es.sessions.openingAmount}</span>
                <span className="font-medium">{formatCurrency(session.openingAmount)}</span>
              </div>
            </div>

            {kpis && (
              <>
                <Separator className="my-4" />
                <p className="mb-3 text-sm text-muted-foreground">Solo ventas registradas en esta sesión de caja. El filtro es la sesión, no «hoy»: no incluye otras sesiones ni pedidos online.</p>
                {session.refreshedAt && <p className="mb-3 text-xs text-muted-foreground">Actualizado: {new Date(session.refreshedAt).toLocaleTimeString('es-ES')}. Se actualiza automáticamente cada 30 segundos.</p>}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Pedidos de esta sesión', value: kpis.totalOrders.toString() },
                    { label: 'Ventas brutas', value: formatCurrency(kpis.grossSales) },
                    { label: es.checkout.cash, value: formatCurrency(kpis.cashSales) },
                    { label: es.checkout.card, value: formatCurrency(kpis.cardSales) },
                    { label: es.checkout.bizum, value: formatCurrency(kpis.bizumSales) },
                    { label: es.sessions.expectedCash, value: formatCurrency(kpis.expectedCash) },
                  ].map((kpi) => (
                    <div
                      key={kpi.label}
                      className="rounded-lg bg-muted/50 p-3 text-center"
                    >
                      <div className="text-xs text-muted-foreground">{kpi.label}</div>
                      <div className="mt-1 text-base font-semibold">{kpi.value}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {!!session.unregisteredOrders?.length && <div role="alert" className="mt-4 space-y-2 rounded border border-amber-400 bg-amber-50 p-3 text-sm">
              <p className="font-medium">Hay {session.unregisteredOrders.length} {session.unregisteredOrders.length === 1 ? 'pedido pagado de hoy etiquetado' : 'pedidos pagados de hoy etiquetados'} POS MML sin registro completo de caja.</p>
              <p>No se incluyen en esta sesión. Revisa estos pedidos antes del cierre; no vuelvas a cobrarlos.</p>
              <ul className="list-inside list-disc">{session.unregisteredOrders.map(order => <li key={order.id}>{order.name}: {order.reason === 'missing_session' ? 'sin sesión asignada' : 'sin registro del método de pago'}</li>)}</ul>
            </div>}
            {session.countedOrders && <details className="mt-4 rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">Pedidos incluidos en esta sesión ({session.countedOrders.length})</summary>
              {session.countedOrders.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No hay ventas registradas en esta sesión.</p> : <div className="mt-2 max-h-72 overflow-auto">
                <Table><TableHeader><TableRow><TableHead>Pedido</TableHead><TableHead>Fecha</TableHead><TableHead>Pago</TableHead><TableHead>Importe</TableHead></TableRow></TableHeader>
                  <TableBody>{session.countedOrders.map((order, index) => <TableRow key={`${order.name}-${index}`}><TableCell>{order.name}</TableCell><TableCell>{formatDate(order.createdAt)}</TableCell><TableCell>{{ CASH: 'Efectivo', CARD: 'Tarjeta', BIZUM: 'Bizum', VOUCHER: 'Vale', MIXED: 'Mixto' }[order.method] || order.method}</TableCell><TableCell>{formatCurrency(order.amount)}</TableCell></TableRow>)}</TableBody>
                </Table>
              </div>}
            </details>}
            <div className="mt-4">
              <Button
                variant="destructive"
                onClick={() => setCloseModalVisible(true)}
              >
                <X className="size-4" />
                {es.sessions.closeSession}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="mb-6">
          <CardContent className="flex flex-col items-center py-8">
            <p className="mb-4 text-muted-foreground">{es.sessions.noOpenSession}</p>
            <Button onClick={() => setOpenModalVisible(true)}>
              <Plus className="size-4" />
              {es.sessions.openSession}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Session history */}
      <h2 className="mb-4 text-base font-semibold">{es.sessions.sessionHistory}</h2>

      {historyError ? <div role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">No se pudo cargar el historial: {historyError} <button className="underline" onClick={() => setHistoryAttempt(value => value + 1)}>Reintentar historial</button></div> : historyLoading ? (
        <p className="text-sm text-muted-foreground">{es.pos.loading}</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay sesiones anteriores</p>
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Ventas brutas</TableHead>
              <TableHead>{es.sessions.difference}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  {formatDate(s.openedAt)}
                  {s.accountingError && <p className="max-w-xs text-xs text-destructive">{s.accountingError}</p>}
                </TableCell>
                <TableCell>
                  {formatDuration(s.openedAt, s.closedAt)}
                </TableCell>
                <TableCell>
                  {s.kpis
                    ? formatCurrency(s.kpis.grossSales)
                    : '—'}
                </TableCell>
                <TableCell>
                  {s.difference != null ? (
                    <span
                      className={cn(
                        'font-medium',
                        s.difference >= 0 ? 'text-success' : 'text-destructive'
                      )}
                    >
                      {s.difference >= 0 ? '+' : ''}
                      {formatCurrency(s.difference)}
                    </span>
                  ) : (
                    '—'
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      <OpenSessionModal
        open={openModalVisible}
        onClose={() => setOpenModalVisible(false)}
      />
      <CloseSessionModal
        open={closeModalVisible}
        onClose={() => setCloseModalVisible(false)}
      />
    </div>
  );
}
