import {beforeEach, describe, expect, it} from 'vitest';
import {TestBed} from '@angular/core/testing';
import {PLATFORM_ID} from '@angular/core';
import {PlayerListComponent} from './player-list.component';
import {PlayerService} from '../player.service';
import {Player} from '../../../models/player.model';

function player(id: string, name: string): Player {
  return {id, name, isGoalie: false, isStriker: false, likesSingles: true, likesDoubles: true, playsGoalieWar: false};
}

describe('PlayerListComponent form', () => {
  let component: PlayerListComponent;
  let playerService: PlayerService;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('players', JSON.stringify([player('a1', 'Anna'), player('b1', 'Ben')]));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{provide: PLATFORM_ID, useValue: 'browser'}]
    });
    playerService = TestBed.inject(PlayerService);
    component = TestBed.runInInjectionContext(() => new PlayerListComponent());
  });

  it('rejects a spaces-only name in the add form and adds nothing', () => {
    component.toggleAdd();
    component.playerForm.patchValue({name: '   '});
    component.savePlayer();

    expect(component.playerForm.controls['name'].hasError('required')).toBe(true);
    expect(component.editingState()).toBe('add');
    expect(playerService.players().length).toBe(2);
  });

  it('rejects a taken name in the add form and adds nothing', () => {
    component.toggleAdd();
    component.playerForm.patchValue({name: ' anna '});
    component.savePlayer();

    expect(component.playerForm.controls['name'].hasError('duplicate')).toBe(true);
    expect(component.editingState()).toBe('add');
    expect(playerService.players().length).toBe(2);
  });

  it('adds a player with a free name', () => {
    component.toggleAdd();
    component.playerForm.patchValue({name: 'Carla'});
    component.savePlayer();

    expect(component.editingState()).toBeNull();
    expect(playerService.players().map(p => p.name)).toEqual(['Anna', 'Ben', 'Carla']);
  });

  it('allows editing a player and keeping its own name', () => {
    component.toggleEdit('a1');
    expect(component.playerForm.controls['name'].valid).toBe(true);
    component.playerForm.patchValue({isGoalie: true});
    component.savePlayer();

    expect(component.editingState()).toBeNull();
    expect(playerService.getPlayerById('a1')).toEqual({...player('a1', 'Anna'), isGoalie: true});
  });

  it('rejects renaming a player to the name of another player', () => {
    component.toggleEdit('b1');
    component.playerForm.patchValue({name: 'Anna'});
    component.savePlayer();

    expect(component.playerForm.controls['name'].hasError('duplicate')).toBe(true);
    expect(component.editingState()).toBe('b1');
    expect(playerService.getPlayerById('b1')?.name).toBe('Ben');
  });
});
