import { useState } from 'react';
import { CheckCircle, Plus, Trash2, Wallet, WalletMinimal, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useNWC } from '@/hooks/useNWCContext';
import { useWallet } from '@/hooks/useWallet';

export function WalletModal({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [alias, setAlias] = useState('');
  const [connectionUri, setConnectionUri] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const { connections, activeConnection, connectionInfo, addConnection, removeConnection, setActiveConnection } = useNWC();
  const { hasWebLN, isDetecting } = useWallet();

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const success = await addConnection(connectionUri, alias.trim() || undefined);
      if (success) {
        setAlias('');
        setConnectionUri('');
        setAddOpen(false);
      }
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          {children ?? (
            <Button variant="outline" size="sm">
              <Wallet className="mr-2 h-4 w-4" /> Wallet Settings
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" /> Lightning Wallet</DialogTitle>
            <DialogDescription>Connect WebLN or Nostr Wallet Connect for one-tap zaps.</DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            <div className="rounded-lg border p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">WebLN</div>
                  <div className="text-xs text-muted-foreground">Browser extension wallet</div>
                </div>
                <Badge variant={hasWebLN ? 'default' : 'secondary'}>{isDetecting ? 'Detecting' : hasWebLN ? 'Ready' : 'Not found'}</Badge>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="font-medium">Nostr Wallet Connect</div>
                <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
              </div>
              {connections.length === 0 ? (
                <div className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">No NWC wallets connected.</div>
              ) : connections.map((connection) => {
                const active = activeConnection === connection.connectionString;
                const info = connectionInfo[connection.connectionString];
                return (
                  <div key={connection.connectionString} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="flex items-center gap-3">
                      <WalletMinimal className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm font-medium">{connection.alias ?? info?.alias ?? 'NWC Wallet'}</div>
                        <div className="text-xs text-muted-foreground">{active ? 'Active wallet' : 'Connected wallet'}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {active ? <CheckCircle className="h-4 w-4 text-green-600" /> : (
                        <Button size="icon" variant="ghost" onClick={() => setActiveConnection(connection.connectionString)}>
                          <Zap className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => removeConnection(connection.connectionString)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect NWC Wallet</DialogTitle>
            <DialogDescription>Paste the connection string from your Lightning wallet.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="wallet-alias">Wallet name</Label>
              <Input id="wallet-alias" value={alias} onChange={(event) => setAlias(event.target.value)} placeholder="My wallet" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="wallet-uri">Connection URI</Label>
              <Textarea id="wallet-uri" value={connectionUri} onChange={(event) => setConnectionUri(event.target.value)} placeholder="nostr+walletconnect://..." rows={4} />
            </div>
            <Button className="w-full" onClick={handleConnect} disabled={isConnecting || !connectionUri.trim()}>
              {isConnecting ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
