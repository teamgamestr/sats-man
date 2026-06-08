import { NWCContext } from '@/hooks/useNWCContext';
import { useNWCInternal } from '@/hooks/useNWC';

export function NWCProvider({ children }: { children: React.ReactNode }) {
  const value = useNWCInternal();
  return <NWCContext value={value}>{children}</NWCContext>;
}
