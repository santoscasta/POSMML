import { useState } from 'react';
import { apiGet } from '../../utils/apiClient';
import { formatCurrency } from '../../utils/currency';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Search } from 'lucide-react';
import type { Voucher } from '../../types/voucher';

interface VoucherBalanceCheckerProps {
  onSelect?: (voucher: Voucher) => void;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'ACTIVE': return 'Activo';
    case 'EXHAUSTED': return 'Agotado';
    case 'CANCELLED': return 'Cancelado';
    default: return status;
  }
}

function statusBadgeVariant(status: string) {
  switch (status) {
    case 'ACTIVE': return 'default' as const;
    case 'EXHAUSTED': return 'secondary' as const;
    case 'CANCELLED': return 'destructive' as const;
    default: return 'outline' as const;
  }
}

export function VoucherBalanceChecker({ onSelect }: VoucherBalanceCheckerProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [voucher, setVoucher] = useState<Voucher | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCheck = async () => {
    if (!code.trim()) return;
    try {
      setLoading(true);
      setError(null);
      setVoucher(null);
      const result = await apiGet<Voucher>(`/vouchers/${code.trim().toUpperCase()}`);
      setVoucher(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vale no encontrado');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCheck();
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Consultar saldo de vale
        </div>
        <div className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={handleKeyDown}
            placeholder="Introducir código del vale"
            className="flex-1 font-mono tracking-wider"
          />
          <Button
            onClick={handleCheck}
            disabled={loading || !code.trim()}
          >
            <Search className="size-4" />
            {loading ? '...' : 'Verificar'}
          </Button>
        </div>

        {error && (
          <div className="mt-2.5 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {voucher && (
          <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/50 p-3">
            <div>
              <div className="mb-1 font-mono text-base font-semibold tracking-wider">
                {voucher.code}
              </div>
              <Badge variant={statusBadgeVariant(voucher.status)}>
                {statusLabel(voucher.status)}
              </Badge>
            </div>
            <div className="text-right">
              <div className="mb-0.5 text-xs text-muted-foreground">Saldo</div>
              <div
                className={cn(
                  'text-xl font-bold',
                  voucher.currentBalance > 0 ? 'text-success' : 'text-muted-foreground'
                )}
              >
                {formatCurrency(voucher.currentBalance)}
              </div>
            </div>
            {onSelect && voucher.status === 'ACTIVE' && voucher.currentBalance > 0 && (
              <Button
                size="sm"
                className="ml-3"
                onClick={() => onSelect(voucher)}
              >
                Usar
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
