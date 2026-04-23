import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentSession, logout } from '@/lib/auth';
import { Toaster } from '@/components/ui/sonner';
import { Separator } from '@/components/ui/separator';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login');

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      <aside className="w-60 border-r bg-card flex flex-col shrink-0">
        <div className="px-5 py-5 border-b">
          <div className="font-mono text-[11px] tracking-widest text-primary uppercase">ab-insights</div>
          <div className="text-sm font-semibold mt-1">管理コンソール</div>
        </div>
        <nav className="flex-1 p-3 space-y-1 text-sm">
          <NavLink href="/" label="ダッシュボード" />
          <NavLink href="/appeals" label="訴求ポイント統計" />
          <NavLink href="/prompts" label="プロンプト管理" />
          <NavLink href="/upload" label="学習アップロード" />
          <NavLink href="/events" label="イベント一覧" />
          <NavLink href="/settings" label="設定" />
        </nav>
        <Separator />
        <form
          action={async () => {
            'use server';
            await logout();
            redirect('/login');
          }}
          className="p-3"
        >
          <button
            type="submit"
            className="w-full text-left text-xs text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-accent"
          >
            ログアウト
          </button>
        </form>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="px-8 py-8 max-w-6xl">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded-md text-foreground/80 hover:text-foreground hover:bg-accent transition"
    >
      {label}
    </Link>
  );
}
