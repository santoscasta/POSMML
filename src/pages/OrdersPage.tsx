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
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
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

      {/* Order table */}
      <OrderList
        orders={orders}
        loading={loading}
        hasNextPage={hasNextPage}
        onLoadMore={loadMore}
        onSelectOrder={handleSelectOrder}
      />

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
