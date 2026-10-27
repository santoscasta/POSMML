import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { SessionProvider, useSession } from './context/SessionContext';
import { PosPage } from './pages/PosPage';
import { OrdersPage } from './pages/OrdersPage';
import { SessionsPage } from './pages/SessionsPage';
import { VouchersPage } from './pages/VouchersPage';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { es } from './i18n/es';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Home, ShoppingCart, ClipboardList, Wallet, Ticket, CircleDot, Settings, Clock3 } from 'lucide-react';
import { AuthGate } from './components/AuthGate';
import { PendingOperations } from './components/PendingOperations';
import { useAuth } from './context/AuthContext';
import { useState } from 'react';
import { AttendanceProvider, useAttendance } from './context/AttendanceContext';
import { attendanceLabels } from './utils/attendance';
import { AttendancePage } from './pages/AttendancePage';

const navItems = [
  { path: '/dashboard', label: es.nav.dashboard || 'Inicio', icon: Home },
  { path: '/', label: es.nav.pos, icon: ShoppingCart },
  { path: '/orders', label: es.nav.orders, icon: ClipboardList },
  { path: '/caja', label: es.nav.cashRegister, icon: Wallet },
  { path: '/vales', label: es.nav.vouchers, icon: Ticket },
  { path: '/horario', label: 'Horario', icon: Clock3 },
  { path: '/ajustes', label: 'Ajustes', icon: Settings },
];

function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isOpen } = useSession();
  const { user } = useAuth();
  const visibleItems = navItems.filter(item => user.role === 'admin' || !['/dashboard', '/ajustes'].includes(item.path));

  return (
    <aside className="hidden xl:flex xl:w-60 flex-col border-r bg-white">
      <div
        className="cursor-pointer px-4 pt-4 pb-2"
        onClick={() => navigate(user.role === 'admin' ? '/dashboard' : '/horario')}
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
        {visibleItems.map((item) => {
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
  const { user } = useAuth();
  const visibleItems = navItems.filter(item => user.role === 'admin' || !['/dashboard', '/ajustes'].includes(item.path));

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t bg-white xl:hidden">
      {visibleItems.map((item) => {
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
  const location = useLocation();
  const { isOpen, error, refresh } = useSession();
  const { overview } = useAttendance();
  const { user, logout } = useAuth();
  const [logoutError, setLogoutError] = useState('');
  const [loggingOut, setLoggingOut] = useState(false);
  const admin = user.role === 'admin';
  const employeeStatus = overview?.employees.find(e => e.id === overview.employee.id)?.status;
  return (
    <div className="flex h-dvh w-full flex-col">
      <header className="flex min-h-11 shrink-0 flex-wrap items-center justify-end gap-2 border-b bg-white px-3 py-1">
        <Button size="sm" variant="ghost" className="mr-auto max-w-full" onClick={() => navigate('/horario')}>
          <Clock3 className="size-4" /><span className="max-w-44 truncate">{user.name}</span><span className="text-xs text-muted-foreground">· {admin ? 'Admin' : 'Colaborador'}</span>{employeeStatus && <span className="hidden text-xs text-muted-foreground sm:inline">· {attendanceLabels[employeeStatus]}</span>}
        </Button>
        {isOpen && <Button size="sm" variant="outline" onClick={() => navigate('/caja?cerrar=1')}>
          <Wallet className="size-4" />Cerrar caja
        </Button>}
        {admin && <PendingOperations />}
        <button disabled={loggingOut} className="px-2 text-xs text-muted-foreground hover:text-foreground" onClick={() => { setLoggingOut(true); setLogoutError(''); void logout().catch(error => { setLoggingOut(false); setLogoutError(error instanceof Error ? error.message : 'No se pudo cerrar la sesión. Reintenta.'); }); }}>{loggingOut ? 'Saliendo…' : 'Salir'}</button>
      </header>
      {logoutError && <p role="alert" className="bg-red-50 p-2 text-sm text-red-800">{logoutError}</p>}
      <div className="flex min-h-0 flex-1">
      <Sidebar />
      <main className={cn("min-h-0 min-w-0 flex-1 bg-background pb-16 xl:pb-0", location.pathname === "/" ? "overflow-hidden" : "overflow-y-auto")}>
        <Routes>
          <Route path="/dashboard" element={admin ? <DashboardPage onNavigate={(path) => navigate(path)} /> : <Navigate to="/horario" replace />} />
          <Route path="/" element={<PosPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/caja" element={<SessionsPage />} />
          <Route path="/vales" element={<VouchersPage />} />
          <Route path="/horario" element={<AttendancePage />} />
          <Route path="/ajustes/*" element={admin ? <SettingsPage /> : <Navigate to="/horario" replace />} />
          <Route path="/correos" element={<Navigate to="/ajustes/correos" replace />} />
          <Route path="*" element={<Navigate to={admin ? '/dashboard' : '/horario'} replace />} />
        </Routes>
      </main>
      <BottomNav />
      </div>
      {error && <div role="alert" className="fixed inset-x-0 top-8 z-50 bg-destructive p-3 text-white">{error} <button onClick={() => void refresh()} className="underline">Reintentar</button></div>}
    </div>
  );
}

export default function App() {
  return (
    <AuthGate><SessionProvider>
      <CartProvider>
        <BrowserRouter>
          <AttendanceProvider><AppContent /></AttendanceProvider>
        </BrowserRouter>
      </CartProvider>
    </SessionProvider></AuthGate>
  );
}
