import {computed, inject, Injectable, PLATFORM_ID, signal, Signal, WritableSignal} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {Player} from '../../models/player.model';

const PLAYER_STORAGE_KEY = 'players';

@Injectable({
  providedIn: 'root'
})
export class PlayerService {
  readonly #players: WritableSignal<Player[]> = signal<Player[]>([]);
  public players: Signal<Player[]> = this.#players.asReadonly();
  public playerCount: Signal<number> = computed(() => this.#players().length);

  private readonly platformId = inject(PLATFORM_ID);

  constructor() {
    this._loadPlayersFromLocalStorage();
  }

  private _loadPlayersFromLocalStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const savedPlayers = localStorage.getItem(PLAYER_STORAGE_KEY);
      if (savedPlayers) {
        try {
          const parsedPlayers: Player[] = JSON.parse(savedPlayers);
          this.#players.set(parsedPlayers);
        } catch (e) {
          console.error('Error parsing players from localStorage:', e);
          localStorage.removeItem(PLAYER_STORAGE_KEY);
          this.#players.set([]);
        }
      } else {
        this.#players.set([]);
      }
    } else {
      this.#players.set([]);
    }
  }

  private _savePlayersToLocalStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const playersToSave = JSON.stringify(this.#players());
        localStorage.setItem(PLAYER_STORAGE_KEY, playersToSave);
      } catch (e) {
        console.error('Error saving players to localStorage:', e);
      }
    }
  }

  addPlayer(newPlayer: Omit<Player, 'id'>): boolean {
    const name = newPlayer.name?.trim() ?? '';
    if (!name || this.isNameTaken(name)) {
      return false;
    }
    const playerWithId: Player = {
      ...newPlayer,
      name,
      id: this._generateUniqueId(name)
    };
    this.#players.update(currentPlayers => [...currentPlayers, playerWithId]);
    this._savePlayersToLocalStorage();
    return true;
  }

  removePlayer(playerId: string): void {
    this.#players.update(currentPlayers => currentPlayers.filter(p => p.id !== playerId));
    this._savePlayersToLocalStorage();
  }

  updatePlayer(updatedPlayer: Player): boolean {
    const name = updatedPlayer.name?.trim() ?? '';
    if (!name || this.isNameTaken(name, updatedPlayer.id)) {
      return false;
    }
    const playerToSave: Player = {...updatedPlayer, name};
    this.#players.update(currentPlayers =>
      currentPlayers.map(p => p.id === updatedPlayer.id ? playerToSave : p)
    );
    this._savePlayersToLocalStorage();
    return true;
  }

  /**
   * True when another player (not the one with `excludeId`) already has this name.
   * Names are compared trimmed and case-insensitively.
   */
  isNameTaken(name: string, excludeId?: string): boolean {
    const normalized = this._normalizeName(name);
    return this.#players().some(p =>
      p.id !== excludeId && this._normalizeName(p.name) === normalized
    );
  }

  getPlayerById(id: string): Player | undefined {
    return this.#players().find(p => p.id === id);
  }

  private _normalizeName(name: string | null | undefined): string {
    return (name ?? '').trim().toLowerCase();
  }

  private _generateUniqueId(name: string): string {
    let id: string;
    do {
      id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    } while (id === name || this.#players().some(p => p.id === id));
    return id;
  }
}
