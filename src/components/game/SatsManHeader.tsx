import { LoginArea } from '@/components/auth/LoginArea';

export function SatsManHeader() {
  return (
    <header className="fixed left-0 right-0 top-0 z-20 border-b border-yellow-400/20 bg-black/90 px-4 py-3 text-white backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        <a href="/" aria-label="Go to Sats-Man home" className="flex items-center rounded-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-yellow-300/60">
          <img src="/sats-man-logo.png" alt="Sats-Man" className="h-12 w-auto object-contain" />
        </a>
        <div className="flex items-center gap-2">
          <LoginArea className="max-w-56" />
        </div>
      </div>
    </header>
  );
}
