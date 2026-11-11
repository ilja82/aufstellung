import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {PLATFORM_ID} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {SavedLineupService} from './saved-lineup.service';
import {Lineup} from '../../models/lineup.model';

const KEY = 'open_lineup_id';
const lineup = {slots: []} as unknown as Lineup;

function freshService(platform: string = 'browser'): SavedLineupService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({providers: [{provide: PLATFORM_ID, useValue: platform}]});
  return TestBed.inject(SavedLineupService);
}

describe('SavedLineupService open lineup persistence', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('restores the open lineup in a new instance', () => {
    const first = freshService();
    const saved = first.saveLineup(lineup, 'A');
    first.setCurrentlyOpenLineup(saved.id);
    expect(localStorage.getItem(KEY)).toBe(saved.id);

    const second = freshService();
    expect(second.currentlyOpenLineupId()).toBe(saved.id);
    expect(second.currentlyOpenLineup()?.id).toBe(saved.id);
  });

  it('drops a stored id without a matching saved lineup', () => {
    localStorage.setItem(KEY, 'ghost');
    const service = freshService();
    expect(service.currentlyOpenLineupId()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('removes the key when the open lineup is deleted, keeps it for another', () => {
    const first = freshService();
    const a = first.saveLineup(lineup, 'A');
    const b = first.saveLineup(lineup, 'B');
    first.setCurrentlyOpenLineup(a.id);

    first.deleteLineup(b.id);
    expect(localStorage.getItem(KEY)).toBe(a.id);

    first.deleteLineup(a.id);
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(freshService().currentlyOpenLineupId()).toBeNull();
  });

  it('removes the key on setCurrentlyOpenLineup(null)', () => {
    const service = freshService();
    const a = service.saveLineup(lineup, 'A');
    service.setCurrentlyOpenLineup(a.id);
    service.setCurrentlyOpenLineup(null);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('does not touch localStorage on the server', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    const service = freshService('server');
    service.setCurrentlyOpenLineup('x');
    service.setCurrentlyOpenLineup(null);
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
  });

  it('logs and continues when localStorage throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const service = freshService();
    const a = service.saveLineup(lineup, 'A');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('full'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });

    service.setCurrentlyOpenLineup(a.id);
    expect(service.currentlyOpenLineupId()).toBe(a.id);
    service.setCurrentlyOpenLineup(null);
    expect(service.currentlyOpenLineupId()).toBeNull();
    expect(error).toHaveBeenCalled();

    vi.restoreAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const realGetItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, k: string) {
      if (k === KEY) throw new Error('denied');
      return realGetItem.call(this, k);
    });
    expect(freshService().currentlyOpenLineupId()).toBeNull();
  });

  it('writes an empty string id as given', () => {
    const service = freshService();
    service.setCurrentlyOpenLineup('');
    expect(localStorage.getItem(KEY)).toBe('');
  });

  it('survives getItem throwing for every key', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    const service = freshService();
    expect(service.savedLineups()).toEqual([]);
    expect(service.currentlyOpenLineupId()).toBeNull();
    expect(error).toHaveBeenCalled();
  });

  it('survives malformed saved data when removeItem throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem('saved_lineups', '{not json');
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    const service = freshService();
    expect(service.savedLineups()).toEqual([]);
    expect(error).toHaveBeenCalled();
  });
});
