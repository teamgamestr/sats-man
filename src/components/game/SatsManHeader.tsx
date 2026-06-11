import { LoginArea } from '@/components/auth/LoginArea';

interface SatsManHeaderProps {
  children?: React.ReactNode;
}

export function SatsManHeader({ children }: SatsManHeaderProps) {
  return (
    <header className="fixed left-0 right-0 top-0 z-20 border-b border-yellow-400/20 bg-black/90 px-4 py-3 text-white backdrop-blur">
      <div className="relative mx-auto flex max-w-6xl items-center justify-between gap-3">
        <a href="/" aria-label="Go to Sats-Man home" className="flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yellow-300/60">
          <img src="/sats-man-logo.png" alt="Sats-Man" className="h-12 w-auto object-contain" />
        </a>
        <div className="pointer-events-none absolute left-1/2 top-1/2 flex w-[min(52rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 justify-center">
          {children}
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <LoginArea className="max-w-56" />
        </div>
      </div>
    </header>
  );
}
