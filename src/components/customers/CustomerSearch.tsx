import { useState, useRef, useEffect } from 'react';
import { useCustomers } from '../../hooks/useCustomers';
import type { Customer } from '../../types/customer';
import { es } from '../../i18n/es';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { User, X } from 'lucide-react';

interface CustomerSearchProps {
  onSelect: (customer: Customer) => void;
}

export function CustomerSearch({ onSelect }: CustomerSearchProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const { customers, loading, searchCustomers } = useCustomers();
  const ref = useRef<HTMLDivElement>(null);

  const handleChange = (value: string) => {
    setQuery(value);
    searchCustomers(value);
    setOpen(value.length > 0);
  };

  const handleSelect = (customer: Customer) => {
    onSelect(customer);
    setQuery('');
    setOpen(false);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <User className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={es.customers.search}
          autoComplete="off"
          className="pl-9 pr-8"
        />
        {query && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="absolute right-1.5 top-1/2 -translate-y-1/2"
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
          >
            <X className="size-3.5" />
          </Button>
        )}
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-sm border border-border bg-popover shadow-md">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {es.pos.loading}
            </div>
          ) : customers.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {es.customers.noResults}
            </div>
          ) : (
            customers.map((customer) => (
              <div
                key={customer.id}
                className="cursor-pointer px-3 py-2 transition-colors hover:bg-muted"
                onClick={() => handleSelect(customer)}
              >
                <div className="text-sm font-medium">
                  {customer.firstName} {customer.lastName}
                </div>
                <div className="text-xs text-muted-foreground">{customer.email}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
