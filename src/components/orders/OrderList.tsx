import type { Order } from '../../types/order';
import { formatCurrency } from '../../utils/currency';
import { es } from '../../i18n/es';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { ClipboardList } from 'lucide-react';

interface OrderListProps {
  orders: Order[];
  loading: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  onSelectOrder: (order: Order) => void;
}

function financialBadgeVariant(status: string) {
  switch (status) {
    case 'PAID': return 'default' as const;
    case 'PENDING': return 'secondary' as const;
    case 'REFUNDED': return 'destructive' as const;
    case 'PARTIALLY_REFUNDED': return 'destructive' as const;
    default: return 'outline' as const;
  }
}

function fulfillmentBadgeVariant(status: string) {
  switch (status) {
    case 'FULFILLED': return 'default' as const;
    case 'UNFULFILLED': return 'secondary' as const;
    default: return 'outline' as const;
  }
}

function financialLabel(status: string): string {
  switch (status) {
    case 'PAID': return es.orders.paid;
    case 'PENDING': return es.orders.pending;
    case 'REFUNDED': return es.orders.refunded;
    case 'PARTIALLY_REFUNDED': return es.orders.partiallyRefunded;
    default: return status;
  }
}

function fulfillmentLabel(status: string): string {
  switch (status) {
    case 'FULFILLED': return es.orders.fulfilled;
    case 'UNFULFILLED': return es.orders.unfulfilled;
    default: return status;
  }
}

export function OrderList({ orders, loading, hasNextPage, onLoadMore, onSelectOrder }: OrderListProps) {
  if (loading && orders.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        Cargando...
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <ClipboardList className="mb-2 size-8" />
        <span>{es.orders.noOrders}</span>
      </div>
    );
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{es.orders.orderNumber}</TableHead>
            <TableHead>{es.orders.date}</TableHead>
            <TableHead>{es.orders.customer}</TableHead>
            <TableHead>{es.orders.total}</TableHead>
            <TableHead>{es.orders.status}</TableHead>
            <TableHead>Envio</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.map((order) => (
            <TableRow
              key={order.id}
              className="cursor-pointer hover:bg-muted/70"
              onClick={() => onSelectOrder(order)}
            >
              <TableCell className="font-semibold">{order.name}</TableCell>
              <TableCell>
                {new Date(order.createdAt).toLocaleDateString('es-ES', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </TableCell>
              <TableCell>
                {order.customer
                  ? `${order.customer.firstName} ${order.customer.lastName}`
                  : '\u2014'}
              </TableCell>
              <TableCell>
                {formatCurrency(
                  order.totalPriceSet.shopMoney.amount,
                  order.totalPriceSet.shopMoney.currencyCode,
                )}
              </TableCell>
              <TableCell>
                <Badge variant={financialBadgeVariant(order.displayFinancialStatus)}>
                  {financialLabel(order.displayFinancialStatus)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant={fulfillmentBadgeVariant(order.displayFulfillmentStatus)}>
                  {fulfillmentLabel(order.displayFulfillmentStatus)}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {hasNextPage && (
        <div className="flex justify-center py-4">
          <Button variant="outline" onClick={onLoadMore} disabled={loading}>
            {loading ? es.pos.loading : 'Cargar mas'}
          </Button>
        </div>
      )}
    </div>
  );
}
