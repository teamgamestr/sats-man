import { useSeoMeta } from '@unhead/react';
import { SatsManGame } from '@/components/game/SatsManGame';

const Index = () => {
  useSeoMeta({
    title: 'Sats-Man',
    description: 'A Nostr and Lightning powered arcade maze game for Gamestr.',
  });

  return <SatsManGame />;
};

export default Index;
