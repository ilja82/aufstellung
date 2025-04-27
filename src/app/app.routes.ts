import {Routes} from '@angular/router';

export const routes: Routes = [
  {
    path: 'players',
    loadComponent: () => import('./features/player/player-list/player-list.component')
      .then(m => m.PlayerListComponent),
    title: 'Spielerliste'
  },
  {
    path: 'lineup/setup',
    loadComponent: () => import('./features/lineup/lineup-setup/lineup-setup.component')
      .then(m => m.LineupSetupComponent),
    title: 'Aufstellung konfigurieren'
  },
  {
    path: 'lineup',
    loadComponent: () => import('./features/lineup/lineup-display/lineup-display.component')
      .then(m => m.LineupDisplayComponent),
    title: 'Aktuelle Aufstellung'
  },
  {
    path: '',
    redirectTo: '/players',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: '/players'
  }
];
