import type { Order, OrderSortKey } from '../../types/order';
import type { SortConfig } from '../../utils/sort';
import { SortableTableHead } from '../SortableTableHead';
import { formatCurrency } from '../../utils/currency';
import { es } from '../../i18n/es';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { ClipboardList } from 'lucide-react';

interface OrderListProps {
  orders: Order[];
  loading: boolean;
  hasNextPage: boolean;
  onLoadMore: () => void;
  onSelectOrder: (order: Order) => void;
  sort: SortConfig<OrderSortKey>;
  onSort: (key: OrderSortKey) => void;
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

function formatOrderDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

const columns: { key: OrderSortKey; label: string }[] = [
  { key: 'ORDER_NUMBER', label: es.orders.orderNumber },
  { key: 'CREATED_AT', label: es.orders.createdDate },
  { key: 'PROCESSED_AT', label: es.orders.processedDate },
  { key: 'CUSTOMER_NAME', label: es.orders.customer },
  { key: 'TOTAL_PRICE', label: es.orders.total },
  { key: 'FINANCIAL_STATUS', label: es.orders.status },
  { key: 'FULFILLMENT_STATUS', label: 'Envío' },
];

export function OrderList({ orders, loading, hasNextPage, onLoadMore, onSelectOrder, sort, onSort }: OrderListProps) {

  return (
    <div>
      <div className="overflow-x-auto">
      <Table aria-busy={loading}>
        <TableHeader>
          <TableRow>
            {columns.map(column => <SortableTableHead
              key={column.key}
              label={column.label}
              direction={sort.key === column.key ? sort.direction : undefined}
              onSort={() => onSort(column.key)}
            />)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 && <TableRow>
            <TableCell colSpan={columns.length}>
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground" role="status">
                {!loading && <ClipboardList className="mb-2 size-8" />}
                <span>{loading ? es.pos.loading : es.orders.noOrders}</span>
              </div>
            </TableCell>
          </TableRow>}
          {orders.map((order) => (
            <TableRow
              key={order.id}
              className="cursor-pointer hover:bg-muted/70"
              onClick={() => onSelectOrder(order)}
            >
              <TableCell className="font-semibold">{order.name}</TableCell>
              <TableCell>{formatOrderDate(order.createdAt)}</TableCell>
              <TableCell>{formatOrderDate(order.processedAt)}</TableCell>
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
      </div>
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
