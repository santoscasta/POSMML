import { useState, useEffect } from 'react';
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
import { Plus, X } from 'lucide-react';
import type { CashSession } from '../types/session';

export function SessionsPage() {
  const { session, isOpen, loading } = useSession();
  const [openModalVisible, setOpenModalVisible] = useState(false);
  const [closeModalVisible, setCloseModalVisible] = useState(false);
  const [history, setHistory] = useState<CashSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await apiGet<CashSession[]>('/sessions?limit=5');
        setHistory(data);
      } catch {
        setHistory([]);
      } finally {
        setHistoryLoading(false);
      }
    };
    fetchHistory();
  }, [isOpen]);

  const kpis = session?.kpis;

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (start: string, end?: string) => {
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
      <h1 className="mb-4 text-xl font-semibold sm:mb-6">{es.nav.cashRegister}</h1>

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
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {[
                    { label: 'Pedidos', value: kpis.totalOrders.toString() },
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

      {historyLoading ? (
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
                </TableCell>
                <TableCell>
                  {formatDuration(s.openedAt, s.closedAt)}
                </TableCell>
                <TableCell>
                  {s.expectedAmount != null
                    ? formatCurrency(s.expectedAmount - s.openingAmount)
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
