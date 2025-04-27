export type DoubleMatchesMode = 'four' | 'five';

export interface LineupSettings {
  doubleMatchesMode: DoubleMatchesMode;
  includeGoalieWar: boolean;
  involvedPlayerIds: string[];
}

export type PositionType = 'single' | 'gw' | 'goalie' | 'striker';

export interface LineupSlot {
  setNumber: number;
  position: PositionType;
  assignedPlayerId: string | null;
}

export interface Lineup {
  settings: LineupSettings;
  slots: LineupSlot[];
  playerColors?: { [playerId: string]: string };
}
