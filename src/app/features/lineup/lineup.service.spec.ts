import {beforeEach, describe, expect, it} from 'vitest';
import {PLATFORM_ID} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {LineupSlot, PositionType} from '../../models/lineup.model';
import {PlayerService} from '../player/player.service';
import {LineupService} from './lineup.service';

// Layout (five doubles mode):
//  1,2 single | 3/4 striker/goalie | 5/6 striker/goalie | 7/8 striker/goalie
//  9,10 single (or gw) | 11/12 striker/goalie | 13,14 single | 15/16 striker/goalie
function slotsWith(assigned: Record<number, string>, goalieWar = false): LineupSlot[] {
  const positions: PositionType[] = [
    'single', 'single', 'striker', 'goalie', 'striker', 'goalie', 'striker', 'goalie',
    goalieWar ? 'gw' : 'single', goalieWar ? 'gw' : 'single',
    'striker', 'goalie', 'single', 'single', 'striker', 'goalie'
  ];
  return positions.map((position, i) => ({
    setNumber: i + 1,
    position,
    assignedPlayerId: assigned[i + 1] ?? null
  }));
}

describe('LineupService.isMoveEligible', () => {
  let service: LineupService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {provide: PlayerService, useValue: {players: () => []}},
        {provide: PLATFORM_ID, useValue: 'server'}
      ]
    });
    service = TestBed.inject(LineupService);
  });

  describe('single limit (max 2)', () => {
    it('rejects a 3rd single slot (picker)', () => {
      expect(service.isMoveEligible(slotsWith({1: 'A', 2: 'A'}), 13, undefined, 'A')).toBe(false);
    });

    it('allows a 2nd single slot (picker)', () => {
      expect(service.isMoveEligible(slotsWith({1: 'A'}), 2, undefined, 'A')).toBe(true);
    });

    it('rejects a swap that gives a 3rd single slot', () => {
      const slots = slotsWith({1: 'A', 2: 'A', 3: 'A', 13: 'B'});
      expect(service.isMoveEligible(slots, 13, 3)).toBe(false);
    });

    it('allows a swap that gives a 2nd single slot', () => {
      const slots = slotsWith({1: 'A', 3: 'A', 13: 'B'});
      expect(service.isMoveEligible(slots, 13, 3)).toBe(true);
    });
  });

  describe('double limit (max 2)', () => {
    it('rejects a 3rd striker/goalie slot (picker)', () => {
      expect(service.isMoveEligible(slotsWith({3: 'A', 5: 'A'}), 7, undefined, 'A')).toBe(false);
    });

    it('allows a 2nd striker/goalie slot (picker)', () => {
      expect(service.isMoveEligible(slotsWith({3: 'A'}), 5, undefined, 'A')).toBe(true);
    });

    it('rejects a swap that gives a 3rd striker/goalie slot', () => {
      const slots = slotsWith({1: 'A', 3: 'A', 5: 'A', 7: 'B'});
      expect(service.isMoveEligible(slots, 7, 1)).toBe(false);
    });

    it('allows a swap that gives a 2nd striker/goalie slot', () => {
      const slots = slotsWith({1: 'A', 3: 'A', 7: 'B'});
      expect(service.isMoveEligible(slots, 7, 1)).toBe(true);
    });
  });

  describe('self-pairing in a double', () => {
    it('rejects the same player as striker and goalie (picker, empty target)', () => {
      expect(service.isMoveEligible(slotsWith({3: 'A'}), 4, undefined, 'A')).toBe(false);
    });

    it('rejects the same player as striker and goalie (picker, replacing another player)', () => {
      expect(service.isMoveEligible(slotsWith({3: 'A', 4: 'B'}), 4, undefined, 'A')).toBe(false);
    });

    it('allows two different players in one double (picker)', () => {
      expect(service.isMoveEligible(slotsWith({3: 'A'}), 4, undefined, 'C')).toBe(true);
    });

    it('rejects a swap that puts one player in both slots of a double', () => {
      const slots = slotsWith({1: 'A', 3: 'A', 4: 'C'});
      expect(service.isMoveEligible(slots, 4, 1)).toBe(false);
    });

    it('allows a swap that keeps the double with two different players', () => {
      const slots = slotsWith({1: 'B', 3: 'A', 4: 'C'});
      expect(service.isMoveEligible(slots, 4, 1)).toBe(true);
    });
  });

  describe('same pair in two doubles', () => {
    it('rejects the same pair in the same order (picker)', () => {
      const slots = slotsWith({3: 'A', 4: 'B', 5: 'A'});
      expect(service.isMoveEligible(slots, 6, undefined, 'B')).toBe(false);
    });

    it('rejects the same pair in swapped order (picker)', () => {
      const slots = slotsWith({3: 'A', 4: 'B', 5: 'B'});
      expect(service.isMoveEligible(slots, 6, undefined, 'A')).toBe(false);
    });

    it('allows a different pair (picker)', () => {
      const slots = slotsWith({3: 'A', 4: 'B', 5: 'A'});
      expect(service.isMoveEligible(slots, 6, undefined, 'C')).toBe(true);
    });

    it('rejects a swap that creates the same pair again', () => {
      const slots = slotsWith({1: 'B', 3: 'A', 4: 'B', 5: 'A', 6: 'C'});
      expect(service.isMoveEligible(slots, 6, 1)).toBe(false);
    });

    it('rejects a swap that creates the same pair in swapped order', () => {
      const slots = slotsWith({1: 'A', 3: 'A', 4: 'B', 5: 'B'});
      expect(service.isMoveEligible(slots, 6, 1)).toBe(false);
    });

    it('allows a swap that creates a different pair', () => {
      const slots = slotsWith({1: 'D', 3: 'A', 4: 'B', 5: 'A', 6: 'C'});
      expect(service.isMoveEligible(slots, 6, 1)).toBe(true);
    });
  });

  describe('goalie war counts as single', () => {
    it('allows 2 gw slots for one player (picker)', () => {
      expect(service.isMoveEligible(slotsWith({9: 'A'}, true), 10, undefined, 'A')).toBe(true);
    });

    it('rejects a 3rd single-type slot when gw and single are mixed (picker)', () => {
      expect(service.isMoveEligible(slotsWith({9: 'A', 10: 'A'}, true), 1, undefined, 'A')).toBe(false);
    });

    it('allows a swap that gives gw + single (2 single-type slots)', () => {
      const slots = slotsWith({1: 'B', 3: 'A', 9: 'A'}, true);
      expect(service.isMoveEligible(slots, 1, 3)).toBe(true);
    });

    it('rejects a swap that gives a 3rd single-type slot (2 gw + single)', () => {
      const slots = slotsWith({1: 'B', 3: 'A', 9: 'A', 10: 'A'}, true);
      expect(service.isMoveEligible(slots, 1, 3)).toBe(false);
    });
  });

  describe('same player at source and target', () => {
    it('rejects a swap of two slots with the same player', () => {
      expect(service.isMoveEligible(slotsWith({1: 'A', 2: 'A'}), 2, 1)).toBe(false);
    });

    it('allows a swap of two slots with different players', () => {
      expect(service.isMoveEligible(slotsWith({1: 'A', 2: 'B'}), 2, 1)).toBe(true);
    });

    it('rejects a swap of two empty slots', () => {
      expect(service.isMoveEligible(slotsWith({}), 2, 1)).toBe(false);
    });

    it('rejects a picker player who is already in the target slot', () => {
      expect(service.isMoveEligible(slotsWith({1: 'A'}), 1, undefined, 'A')).toBe(false);
    });

    it('allows a picker player into a slot held by someone else', () => {
      expect(service.isMoveEligible(slotsWith({1: 'B'}), 1, undefined, 'A')).toBe(true);
    });
  });

  it('does not mutate the slots it is given', () => {
    const slots = slotsWith({1: 'A', 3: 'A', 13: 'B'});
    const before = JSON.parse(JSON.stringify(slots));
    service.isMoveEligible(slots, 13, 3);
    service.isMoveEligible(slots, 2, undefined, 'A');
    expect(slots).toEqual(before);
  });
});
