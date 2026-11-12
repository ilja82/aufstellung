import {beforeEach, describe, expect, it, vi} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {PLATFORM_ID, signal} from '@angular/core';
import {provideRouter, Router} from '@angular/router';
import {SavedLineupsListComponent} from './saved-lineups-list.component';
import {LineupService} from '../../lineup/lineup.service';
import {SavedLineupService} from '../../lineup/saved-lineup.service';
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

describe('SavedLineupsListComponent.openLineup', () => {
  it('loads the saved lineup instead of starting a new one', () => {
    const lineupService = {loadLineup: vi.fn(), startNewLineup: vi.fn(), assignPlayerToSlot: vi.fn()};
    const savedLineupService = {
      savedLineups: signal([]),
      savedLineupsCount: signal(0),
      currentlyOpenLineupId: signal(null),
      setCurrentlyOpenLineup: vi.fn()
    };
    const router = {navigate: vi.fn().mockResolvedValue(true)};
    TestBed.configureTestingModule({
      providers: [
        {provide: LineupService, useValue: lineupService},
        {provide: SavedLineupService, useValue: savedLineupService},
        {provide: Router, useValue: router}
      ]
    });
    const component = TestBed.runInInjectionContext(() => new SavedLineupsListComponent());
    const saved: SavedLineup = {
      id: 'x', name: 'n', createdAt: new Date(), updatedAt: new Date(),
      lineup: {
        settings: {doubleMatchesMode: 'four', includeGoalieWar: false, involvedPlayerIds: ['a']},
        slots: [{setNumber: 1, position: 'single', assignedPlayerId: 'a'}],
        playerColors: {a: 'hsl(1, 70%, 40%)'}
      }
    };
    component.openLineup(saved);
    expect(lineupService.loadLineup).toHaveBeenCalledWith(saved.lineup);
    expect(lineupService.startNewLineup).not.toHaveBeenCalled();
    expect(lineupService.assignPlayerToSlot).not.toHaveBeenCalled();
    expect(savedLineupService.setCurrentlyOpenLineup).toHaveBeenCalledWith('x');
    expect(router.navigate).toHaveBeenCalledWith(['/lineup']);
  });
});

