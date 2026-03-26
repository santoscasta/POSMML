import { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../utils/apiClient';
import { formatCurrency } from '../utils/currency';
import { IssueVoucherModal } from '../components/vouchers/IssueVoucherModal';
import { VoucherDetail } from '../components/vouchers/VoucherDetail';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Plus, Search, X, Ticket } from 'lucide-react';
import type { Voucher, VoucherStatus } from '../types/voucher';

interface VoucherStats {
  total: number;
  active: number;
  exhausted: number;
  cancelled: number;
  activeBalance: number;
}

type FilterStatus = 'ALL' | VoucherStatus;

function statusBadgeVariant(status: string) {
  switch (status) {
    case 'ACTIVE': return 'default' as const;
    case 'EXHAUSTED': return 'secondary' as const;
    case 'CANCELLED': return 'destructive' as const;
    default: return 'outline' as const;
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'Activo';
    case 'EXHAUSTED': return 'Agotado';
    case 'CANCELLED': return 'Cancelado';
    default: return status;
  }
}

export function VouchersPage() {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [stats, setStats] = useState<VoucherStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('ALL');
  const [issueOpen, setIssueOpen] = useState(false);
  const [selectedVoucher, setSelectedVoucher] = useState<Voucher | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [vouchersData, statsData] = await Promise.all([
        apiGet<Voucher[]>('/vouchers'),
        apiGet<VoucherStats>('/vouchers/stats'),
      ]);
      setVouchers(vouchersData);
      setStats(statsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar vales');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredVouchers = vouchers.filter((v) => {
    if (filter !== 'ALL' && v.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        v.code.toLowerCase().includes(q) ||
        (v.customerName && v.customerName.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleVoucherClick = (voucher: Voucher) => {
    setSelectedVoucher(voucher);
    setDetailOpen(true);
  };

  const filterChips: { label: string; value: FilterStatus }[] = [
    { label: 'Todos', value: 'ALL' },
    { label: 'Activos', value: 'ACTIVE' },
    { label: 'Agotados', value: 'EXHAUSTED' },
    { label: 'Cancelados', value: 'CANCELLED' },
  ];

  return (
    <div className="p-3 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-2 sm:mb-6">
        <h1 className="text-xl font-semibold">Vales</h1>
        <Button onClick={() => setIssueOpen(true)}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Emitir Vale</span>
          <span className="sm:hidden">Emitir</span>
        </Button>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-5 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { label: 'Total emitidos', value: stats.total.toString(), color: 'text-foreground' },
            { label: 'Activos', value: stats.active.toString(), color: 'text-success' },
            { label: 'Agotados', value: stats.exhausted.toString(), color: 'text-orange-600' },
            { label: 'Cancelados', value: stats.cancelled.toString(), color: 'text-destructive' },
            { label: 'Saldo activo', value: formatCurrency(stats.activeBalance), color: 'text-accent' },
          ].map((stat) => (
            <Card key={stat.label}>
              <CardContent className="py-4 text-center">
                <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </div>
                <div className={cn('text-xl font-bold', stat.color)}>
                  {stat.value}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Search & filters */}
      <div className="mb-4">
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código o nombre..."
            className="pl-8 pr-8"
          />
          {search && (
            <button
              title="Limpiar búsqueda"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setSearch('')}
            >
              <X className="size-4" />
              <span className="sr-only">Limpiar búsqueda</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {filterChips.map((chip) => (
            <Button
              key={chip.value}
              variant={filter === chip.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(chip.value)}
            >
              {chip.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Table */}
      {loading && vouchers.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          Cargando...
        </div>
      ) : filteredVouchers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Ticket className="mb-2 size-8" />
          <span>No hay vales registrados</span>
        </div>
      ) : (
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Saldo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Fecha</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredVouchers.map((v) => (
              <TableRow
                key={v.id}
                className="cursor-pointer"
                onClick={() => handleVoucherClick(v)}
              >
                <TableCell>
                  <span className="font-mono font-semibold tracking-wider">
                    {v.code}
                  </span>
                </TableCell>
                <TableCell>{formatCurrency(v.originalAmount)}</TableCell>
                <TableCell
                  className={cn(
                    'font-semibold',
                    v.currentBalance > 0 ? 'text-success' : 'text-muted-foreground'
                  )}
                >
                  {formatCurrency(v.currentBalance)}
                </TableCell>
                <TableCell>{v.customerName || '—'}</TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(v.status)}>
                    {statusLabel(v.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {new Date(v.issuedAt).toLocaleDateString('es-ES', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                  })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      {/* Modals */}
      <IssueVoucherModal
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        onIssued={fetchData}
      />
      <VoucherDetail
        voucher={selectedVoucher}
        open={detailOpen}
        onClose={() => { setDetailOpen(false); setSelectedVoucher(null); }}
        onUpdate={fetchData}
      />
    </div>
  );
}
