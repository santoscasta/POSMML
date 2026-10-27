import { useAuth } from '../context/AuthContext';
import { PasswordChangeForm } from '../components/PasswordChangeForm';

export function AccountPage() {
  const { user } = useAuth();
  return <div className="mx-auto max-w-xl space-y-6 p-4 sm:p-6">
    <div><h1 className="text-xl font-semibold">Mi cuenta</h1><p className="mt-1 text-sm text-muted-foreground">{user.name} · {user.role === 'admin' ? 'Administrador' : 'Colaborador'}</p></div>
    <section className="space-y-4 rounded-xl border bg-white p-4 sm:p-6">
      <h2 className="text-lg font-semibold">Cambiar contraseña</h2>
      <PasswordChangeForm />
    </section>
  </div>;
}
