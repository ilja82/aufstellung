import {beforeEach, describe, expect, it} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {PLATFORM_ID} from '@angular/core';
import {provideRouter} from '@angular/router';
import {SavedLineupsListComponent} from './saved-lineups-list.component';
import {PlayerService} from '../../player/player.service';
import {SavedLineup} from '../../../models/saved-lineup.model';
import {Player} from '../../../models/player.model';

function player(id: string, name: string): Player {
  return {id, name, isGoalie: false, isStriker: false, likesSingles: true, likesDoubles: true, playsGoalieWar: false};
}

function savedLineup(involvedPlayerIds: string[]): SavedLineup {
  const now = new Date();
  return {
    id: 'lineup-1',
    name: 'Test',
    createdAt: now,
    updatedAt: now,
    lineup: {
      settings: {doubleMatchesMode: 'four', includeGoalieWar: false, involvedPlayerIds},
      slots: []
    }
  };
}

describe('SavedLineupsListComponent.getPlayerNames', () => {
  let component: SavedLineupsListComponent;
  let playerService: PlayerService;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('players', JSON.stringify([player('Anna', 'Anna'), player('p2', 'Ben')]));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{provide: PLATFORM_ID, useValue: 'browser'}, provideRouter([])]
    });
    playerService = TestBed.inject(PlayerService);
    component = TestBed.runInInjectionContext(() => new SavedLineupsListComponent());
  });

  it('shows the current player names instead of the ids', () => {
    expect(component.getPlayerNames(savedLineup(['Anna', 'p2']))).toBe('Anna, Ben');
  });

  it('shows the new name after a player was renamed', () => {
    playerService.updatePlayer(player('Anna', 'Anne'));
    expect(component.getPlayerNames(savedLineup(['Anna', 'p2']))).toBe('Anne, Ben');
  });

  it('falls back to the stored id for a player that no longer exists', () => {
    expect(component.getPlayerNames(savedLineup(['Gone', 'p2']))).toBe('Gone, Ben');
  });
});
