// IMPORTANT: this file must stay IDENTICAL in client/src/shared/rules.ts and server/src/shared/rules.ts.
export type Mode = 'ffa' | 'teams';

export const ROUND_CHOICES = [1, 2, 3, 4, 5, 6, 7]; // number of rounds in a series
export const TARGET_CHOICES = [5, 10, 15, 20];    // kills needed to win a round (a team's total kills in team mode)
export const MAX_PLAYERS: Record<Mode, number> = { ffa: 5, teams: 10 };
export const MIN_PLAYERS = 2;

export const TEAM_NAMES = ['BLUE', 'RED'];
export const TEAM_COLORS = [0x2f6bff, 0xe53935];
export const TEAM_TEXT = ['#8fb4ff', '#ff9a96'];
