import { useDashboard } from '../hooks/useDashboard';
import { formatCurrency } from '../utils/currency';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  Wallet,
  ShoppingCart,
  ClipboardList,
  Ticket,
  CircleDot,
  Banknote,
  CreditCard,
  Smartphone,
} from 'lucide-react';

const quickActions = [
  { label: 'Abrir Caja', icon: Wallet, path: '/caja' },
  { label: 'Ir al POS', icon: ShoppingCart, path: '/' },
  { label: 'Ver Pedidos', icon: ClipboardList, path: '/orders' },
  { label: 'Emitir Vale', icon: Ticket, path: '/vales' },
];

export function DashboardPage({ onNavigate }: { onNavigate?: (path: string) => void }) {
  const { data, loading, error, refresh } = useDashboard();

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Panel de Inicio</h1>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Cargando...
        </div>
      ) : data ? (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Shopify connection */}
            <Card>
              <CardHeader>
                <CardTitle>Conexión Shopify</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CircleDot
                    className={cn(
                      'size-4',
                      data.shopifyConnected ? 'text-success' : 'text-destructive'
                    )}
                  />
                  <span className="font-medium">
                    {data.shopifyConnected ? 'Conectado' : 'Desconectado'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Session status */}
            <Card>
              <CardHeader>
                <CardTitle>Sesión de Caja</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CircleDot
                    className={cn(
                      'size-4',
                      data.sessionOpen ? 'text-success' : 'text-destructive'
                    )}
                  />
                  <span className="font-medium">
                    {data.sessionOpen ? 'Abierta' : 'Cerrada'}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Today sales */}
            <Card>
              <CardHeader>
                <CardTitle>Ventas de Hoy</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(data.todaySales)}</div>
                <p className="text-sm text-muted-foreground">{data.todayOrders} pedidos</p>
              </CardContent>
            </Card>

            {/* Payment breakdown */}
            <Card className="sm:col-span-2 lg:col-span-2">
              <CardHeader>
                <CardTitle>Desglose de Pagos</CardTitle>
              </CardHeader>
              <CardContent>
                {[
                  { label: 'Efectivo', value: data.paymentBreakdown.cash, color: 'bg-[#4CAF50]', icon: Banknote },
                  { label: 'Tarjeta', value: data.paymentBreakdown.card, color: 'bg-[#2196F3]', icon: CreditCard },
                  { label: 'Bizum', value: data.paymentBreakdown.bizum, color: 'bg-[#9C27B0]', icon: Smartphone },
                ].map((item) => {
                  const total = data.paymentBreakdown.cash + data.paymentBreakdown.card + data.paymentBreakdown.bizum;
                  const pct = total > 0 ? (item.value / total) * 100 : 0;
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="flex items-center gap-1.5">
                          <Icon className="size-3.5 text-muted-foreground" />
                          {item.label}
                        </span>
                        <span className="font-medium">{formatCurrency(item.value)}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn('h-full rounded-full transition-all', item.color)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Active vouchers */}
            <Card>
              <CardHeader>
                <CardTitle>Vales Activos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data.activeVouchers}</div>
                <p className="text-sm text-muted-foreground">
                  Saldo: {formatCurrency(data.voucherBalance)}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick actions */}
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Acciones Rápidas
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.path}
                  variant="outline"
                  className="h-auto flex-col gap-2 py-4"
                  onClick={() => onNavigate?.(action.path)}
                >
                  <Icon className="size-5" />
                  <span>{action.label}</span>
                </Button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
