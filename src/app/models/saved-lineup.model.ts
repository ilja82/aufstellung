export interface SavedLineup {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  lineup: import('./lineup.model').Lineup;
}
