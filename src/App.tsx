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
import { AuthGate } from './components/AuthGate';
import { PendingOperations } from './components/PendingOperations';
import { clearCredentials } from './utils/auth';
import { OpenSessionModal } from './components/sessions/OpenSessionModal';

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
    <aside className="hidden xl:flex xl:w-60 flex-col border-r bg-white">
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
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-white xl:hidden">
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
  const { isOpen, loading } = useSession();
  return (
    <div className="flex h-screen w-full flex-col">
      <header className="flex h-8 shrink-0 items-center justify-end gap-2 border-b bg-white px-3">
        <PendingOperations />
        <button className="px-2 text-xs text-muted-foreground hover:text-foreground" onClick={clearCredentials}>Salir</button>
      </header>
      <div className="flex min-h-0 flex-1">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto bg-background pb-16 xl:pb-0">
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
      <OpenSessionModal open={!loading && !isOpen} onClose={() => {}} required />
    </div>
  );
}

export default function App() {
  return (
    <AuthGate><SessionProvider>
      <CartProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </CartProvider>
    </SessionProvider></AuthGate>
  );
}
