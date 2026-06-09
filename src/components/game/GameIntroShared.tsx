import type { HighScoreEntry } from '@/hooks/useHighScores';
import { getHighScoreDisplayName, getHighScorePicture } from '@/hooks/useHighScores';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export function HighScoreIdentity({ entry, className = '' }: { entry?: HighScoreEntry; className?: string }) {
  const name = getHighScoreDisplayName(entry);
  const picture = getHighScorePicture(entry);

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <Avatar size="sm" className="border border-cyan-300 bg-black">
        <AvatarImage src={picture} alt={name} />
        <AvatarFallback className="bg-black text-xs font-black text-cyan-200">
          {name.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <span className="truncate text-xs font-black text-cyan-100">{name}</span>
    </div>
  );
}
