import { redirect } from 'next/navigation';
import Image from 'next/image';
import { getCurrentSession, logout } from '@/lib/auth';
import { Toaster } from '@/components/ui/sonner';
import { Separator } from '@/components/ui/separator';
import { BackgroundBlobs } from '@/components/background-blobs';
import { themeCssVars } from '@/lib/theme';
import { getThemeColor } from './settings-helpers';
import { SidebarNav } from './sidebar-nav';
import { Topbar } from './topbar';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getCurrentSession();
  if (!session) redirect('/login');

  const theme = await getThemeColor();

  return (
    <>
      {/* テーマカラー上書き — :root に CSS 変数を再定義する。
          dangerouslySetInnerHTML だが、値は lib/theme.ts のホワイトリストから来るので安全。 */}
      <style dangerouslySetInnerHTML={{ __html: themeCssVars(theme) }} />
    <div
      className="min-h-screen flex"
      style={{ background: 'var(--paper)', color: 'var(--ink)' }}
    >
      <aside
        className="w-56 shrink-0 flex flex-col border-r"
        style={{
          background: 'var(--sidebar)',
          borderColor: 'var(--sidebar-border)',
        }}
      >
        {/* ブランドヘッダー */}
        <div
          className="px-4 py-4 flex items-center gap-3 border-b"
          style={{ borderColor: 'var(--sidebar-border)' }}
        >
          <div
            className="w-10 h-10 shrink-0 rounded-md flex items-center justify-center overflow-hidden"
            style={{ background: 'var(--brand-orange)' }}
          >
            <Image
              src="/logo.png"
              alt=""
              width={40}
              height={40}
              priority
              className="rounded-md"
            />
          </div>
          <div className="min-w-0">
            <div
              className="text-[15px] leading-tight font-semibold"
              style={{ fontFamily: 'var(--font-serif)' }}
            >
              ab.insights
            </div>
            <div className="text-[10px] tracking-[0.22em] uppercase text-muted-foreground">
              console
            </div>
          </div>
        </div>

        <SidebarNav />

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
            className="w-full text-left text-[12px] text-muted-foreground hover:text-foreground px-3 py-2 rounded-md hover:bg-accent transition-colors"
          >
            ログアウト
          </button>
        </form>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar />
        <main className="relative flex-1 px-8 py-8">
          <BackgroundBlobs />
          <div className="relative z-[1] max-w-7xl">{children}</div>
        </main>
      </div>
      <Toaster />
    </div>
    </>
  );
}
