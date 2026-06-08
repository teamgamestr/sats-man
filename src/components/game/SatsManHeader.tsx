import { LogOut } from 'lucide-react';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoginActions } from '@/hooks/useLoginActions';

interface SatsManHeaderProps {
  onLogoClick?: () => void;
}

export function SatsManHeader({ onLogoClick }: SatsManHeaderProps) {
  const { user } = useCurrentUser();
  const login = useLoginActions();

  return (
    <header className="fixed left-0 right-0 top-0 z-20 border-b border-yellow-400/20 bg-black/90 px-4 py-3 text-white backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
        {onLogoClick ? (
          <button type="button" onClick={onLogoClick} className="flex items-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-300" aria-label="End game">
            <img src="/sats-man-logo.png" alt="Sats-Man" className="h-12 w-auto object-contain" />
          </button>
        ) : (
          <div className="flex items-center">
            <img src="/sats-man-logo.png" alt="Sats-Man" className="h-12 w-auto object-contain" />
          </div>
        )}
        <div className="flex items-center gap-2">
          <LoginArea className="max-w-56" />
          {user && (
            <Button
              size="sm"
              variant="outline"
              className="border-zinc-700 bg-black text-zinc-100 hover:bg-zinc-900"
              onClick={() => void login.logout()}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
