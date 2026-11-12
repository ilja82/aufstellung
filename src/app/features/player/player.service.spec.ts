import {beforeEach, describe, expect, it} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {PLATFORM_ID} from '@angular/core';
import {PlayerService} from './player.service';
import {Player} from '../../models/player.model';

const STORAGE_KEY = 'players';

function playerData(name: string): Omit<Player, 'id'> {
  return {name, isGoalie: false, isStriker: false, likesSingles: true, likesDoubles: true, playsGoalieWar: false};
}

function createService(): PlayerService {
  TestBed.configureTestingModule({
    providers: [{provide: PLATFORM_ID, useValue: 'browser'}]
  });
  return TestBed.inject(PlayerService);
}

function stored(): Player[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
}

describe('PlayerService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  describe('addPlayer', () => {
    it('gives a new player a generated id that is not its name', () => {
      const service = createService();
      expect(service.addPlayer(playerData('Anna'))).toBe(true);

      const [anna] = service.players();
      expect(anna.name).toBe('Anna');
      expect(anna.id).toBeTruthy();
      expect(anna.id).not.toBe('Anna');
      expect(stored()).toEqual([anna]);
    });

    it('gives two players different ids', () => {
      const service = createService();
      service.addPlayer(playerData('Anna'));
      service.addPlayer(playerData('Ben'));

      const [anna, ben] = service.players();
      expect(anna.id).not.toBe(ben.id);
    });

    it('stores the name trimmed', () => {
      const service = createService();
      expect(service.addPlayer(playerData('  Anna  '))).toBe(true);
      expect(service.players()[0].name).toBe('Anna');
    });

    it('refuses a name that is already taken, also with other case and spaces', () => {
      const service = createService();
      service.addPlayer(playerData('Anna'));
      const playersBefore = service.players();
      const storageBefore = localStorage.getItem(STORAGE_KEY);

      expect(service.addPlayer(playerData('Anna'))).toBe(false);
      expect(service.addPlayer(playerData(' anna '))).toBe(false);

      expect(service.players()).toBe(playersBefore);
      expect(service.players().length).toBe(1);
      expect(localStorage.getItem(STORAGE_KEY)).toBe(storageBefore);
    });

    it('refuses a blank or spaces-only name', () => {
      const service = createService();
      expect(service.addPlayer(playerData(''))).toBe(false);
      expect(service.addPlayer(playerData('   '))).toBe(false);
      expect(service.players()).toEqual([]);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    });
  });

  describe('updatePlayer', () => {
    it('allows keeping the own name and never changes the id', () => {
      const service = createService();
      service.addPlayer(playerData('Anna'));
      const anna = service.players()[0];

      expect(service.updatePlayer({...anna, name: ' Anna ', isGoalie: true})).toBe(true);

      expect(service.players()).toEqual([{...anna, name: 'Anna', isGoalie: true}]);
      expect(stored()).toEqual(service.players());
    });

    it('refuses renaming to the name of another player', () => {
      const service = createService();
      service.addPlayer(playerData('Anna'));
      service.addPlayer(playerData('Ben'));
      const ben = service.players()[1];
      const storageBefore = localStorage.getItem(STORAGE_KEY);

      expect(service.updatePlayer({...ben, name: 'ANNA'})).toBe(false);

      expect(service.getPlayerById(ben.id)?.name).toBe('Ben');
      expect(localStorage.getItem(STORAGE_KEY)).toBe(storageBefore);
    });

    it('refuses a blank or spaces-only name', () => {
      const service = createService();
      service.addPlayer(playerData('Anna'));
      const anna = service.players()[0];

      expect(service.updatePlayer({...anna, name: ''})).toBe(false);
      expect(service.updatePlayer({...anna, name: '   '})).toBe(false);
      expect(service.getPlayerById(anna.id)?.name).toBe('Anna');
    });
  });

  describe('removePlayer', () => {
    it('removes only the player with the matching id', () => {
      const service = createService();
      service.addPlayer(playerData('Anna'));
      service.addPlayer(playerData('Ben'));
      const [anna, ben] = service.players();

      service.removePlayer(anna.id);

      expect(service.players()).toEqual([ben]);
      expect(stored()).toEqual([ben]);
    });
  });

  describe('isNameTaken', () => {
    it('compares trimmed names case-insensitively and can exclude a player', () => {
      const service = createService();
      service.addPlayer(playerData('Anna'));
      const anna = service.players()[0];

      expect(service.isNameTaken(' aNNa ')).toBe(true);
      expect(service.isNameTaken('Ben')).toBe(false);
      expect(service.isNameTaken('Anna', anna.id)).toBe(false);
    });
  });

  describe('legacy stored players (id = name)', () => {
    const legacy: Player[] = [
      {id: 'Anna', ...playerData('Anna')},
      {id: 'Ben', ...playerData('Ben')}
    ];

    beforeEach(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(legacy));
    });

    it('loads them with their ids unchanged', () => {
      const service = createService();
      expect(service.players()).toEqual(legacy);
      expect(service.getPlayerById('Anna')?.name).toBe('Anna');
    });

    it('can still update and remove them by their old id', () => {
      const service = createService();

      expect(service.updatePlayer({...legacy[0], name: 'Anne'})).toBe(true);
      expect(service.getPlayerById('Anna')?.name).toBe('Anne');

      service.removePlayer('Ben');
      expect(service.players()).toEqual([{...legacy[0], name: 'Anne'}]);
      expect(stored()).toEqual([{...legacy[0], name: 'Anne'}]);
    });

    it('lets a new player reuse the old name of a renamed player with a new id', () => {
      const service = createService();
      service.updatePlayer({...legacy[0], name: 'Anne'});

      expect(service.addPlayer(playerData('Anna'))).toBe(true);
      const added = service.players().find(p => p.name === 'Anna')!;
      expect(added.id).not.toBe('Anna');
      expect(service.getPlayerById('Anna')?.name).toBe('Anne');
    });
  });
});
