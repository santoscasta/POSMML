import { useState } from 'react';
import { OrderList } from '../components/orders/OrderList';
import { OrderDetailModal } from '../components/orders/OrderDetail';
import { useOrders } from '../hooks/useOrders';
import { es } from '../i18n/es';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search, RefreshCw } from 'lucide-react';
import type { Order } from '../types/order';

export function OrdersPage() {
  const {
    orders,
    loading,
    error,
    hasNextPage,
    loadMore,
    refresh,
    searchQuery,
    setSearchQuery,
    posOnly,
    setPosOnly,
  } = useOrders();

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const handleSelectOrder = (order: Order) => {
    setSelectedOrderId(order.id);
    setDetailOpen(true);
  };

  const handleCloseDetail = () => {
    setDetailOpen(false);
    setSelectedOrderId(null);
  };

  const handleOrderUpdated = () => {
    handleCloseDetail();
    refresh();
  };

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6">
        <h1 className="text-xl font-semibold">{es.orders.title}</h1>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
          Actualizar
        </Button>
      </div>

      {/* Search + Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={es.orders.search}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant={!posOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPosOnly(false)}
          >
            Todos
          </Button>
          <Button
            variant={posOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setPosOnly(true)}
          >
            Solo POS
          </Button>
        </div>
      </div>

      {error && <div role="alert" className="mb-4 rounded-lg border border-destructive p-3 text-sm text-destructive">No se pudieron cargar los pedidos: {error} <button className="underline" onClick={refresh}>Reintentar</button></div>}

      {/* Order table */}
      {(!error || orders.length > 0) && <OrderList
        orders={orders}
        loading={loading}
        hasNextPage={hasNextPage}
        onLoadMore={loadMore}
        onSelectOrder={handleSelectOrder}
      />}

      {/* Order detail modal */}
      <OrderDetailModal
        orderId={selectedOrderId}
        open={detailOpen}
        onClose={handleCloseDetail}
        onUpdate={handleOrderUpdated}
      />
    </div>
  );
}
