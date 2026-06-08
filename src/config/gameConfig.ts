export interface GameConfig {
  gameId: string;
  gameName: string;
  gameVersion: string;
  receiverPubkey: string;
  fallbackLightningAddress: string;
  costToPlay: number;
  zapMemo: string;
  freePlayEnabled: boolean;
  testMode: boolean;
  scoreUrlBase: string;
}

export const gameConfig: GameConfig = {
  gameId: 'sats-man',
  gameName: 'Sats-Man',
  gameVersion: '0.1.0',
  receiverPubkey: '5a625acc4312b5b56c735e7eb0fa48521ec9a5fe72bef0015b0ca62f3c4e09b6',
  fallbackLightningAddress: 'saltybrow17@walletofsatoshi.com',
  costToPlay: 210,
  zapMemo: 'Playing Sats-Man on Gamestr',
  freePlayEnabled: true,
  testMode: true,
  scoreUrlBase: 'https://gamestr.io/sats-man/score/',
};
