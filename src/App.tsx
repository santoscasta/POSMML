import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { SessionProvider, useSession } from './context/SessionContext';
import { PosPage } from './pages/PosPage';
import { OrdersPage } from './pages/OrdersPage';
import { SessionsPage } from './pages/SessionsPage';
import { VouchersPage } from './pages/VouchersPage';
import { DashboardPage } from './pages/DashboardPage';
import { es } from './i18n/es';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Home, ShoppingCart, ClipboardList, Wallet, Ticket, CircleDot } from 'lucide-react';

const navItems = [
  { path: '/dashboard', label: es.nav.dashboard || 'Inicio', icon: Home },
  { path: '/', label: es.nav.pos, icon: ShoppingCart },
  { path: '/orders', label: es.nav.orders, icon: ClipboardList },
  { path: '/caja', label: es.nav.cashRegister, icon: Wallet },
  { path: '/vales', label: es.nav.vouchers, icon: Ticket },
];

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen } = useSession();

  return (
    <aside className="hidden md:flex md:w-60 flex-col border-r bg-white">
      <div
        className="cursor-pointer px-4 pt-4 pb-2"
        onClick={() => navigate('/dashboard')}
      >
        <img
          src="/logo-myminileo.jpg"
          alt="My mini Leo"
          className="mb-1 h-12 w-auto object-contain"
        />
        <p className="text-xs text-muted-foreground">Punto de Venta</p>
      </div>

      <Separator />

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {navItems.map((item) => {
          const active = item.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(item.path);
          const Icon = item.icon;
          return (
            <Button
              key={item.path}
              variant="ghost"
              className={cn(
                'justify-start gap-2',
                active && 'bg-accent text-accent-foreground'
              )}
              onClick={() => navigate(item.path)}
            >
              <Icon className="size-4" />
              {item.label}
            </Button>
          );
        })}
      </nav>

      <Separator />

      <div className="p-3">
        <div className="flex items-center gap-2 text-sm">
          <CircleDot
            className={cn(
              'size-4',
              isOpen ? 'text-success' : 'text-destructive'
            )}
          />
          <span className="text-muted-foreground">
            {isOpen ? 'Caja abierta' : 'Caja cerrada'}
          </span>
        </div>
      </div>
    </aside>
  );
}

function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen } = useSession();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-white md:hidden">
      {navItems.map((item) => {
        const active = item.path === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(item.path);
        const Icon = item.icon;
        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={cn(
              'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
              active ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <div className="relative">
              <Icon className="size-5" />
              {item.path === '/caja' && (
                <span className={cn(
                  'absolute -right-1 -top-1 size-2 rounded-full',
                  isOpen ? 'bg-success' : 'bg-destructive'
                )} />
              )}
            </div>
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

function AppContent() {
  const navigate = useNavigate();
  return (
    <div className="flex h-screen w-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-background pb-16 md:pb-0">
        <Routes>
          <Route path="/dashboard" element={<DashboardPage onNavigate={(path) => navigate(path)} />} />
          <Route path="/" element={<PosPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/caja" element={<SessionsPage />} />
          <Route path="/vales" element={<VouchersPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <CartProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </CartProvider>
    </SessionProvider>
  );
}
