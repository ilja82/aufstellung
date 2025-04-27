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

  addPlayer(newPlayer: Omit<Player, 'id'>): void {
    const playerWithId: Player = {
      ...newPlayer,
      id: newPlayer.name
    };
    this.#players.update(currentPlayers => [...currentPlayers, playerWithId]);
    this._savePlayersToLocalStorage();
  }

  removePlayer(playerId: string): void {
    this.#players.update(currentPlayers => currentPlayers.filter(p => p.id !== playerId));
    this._savePlayersToLocalStorage();
  }

  updatePlayer(updatedPlayer: Player): void {
    this.#players.update(currentPlayers =>
      currentPlayers.map(p => p.id === updatedPlayer.id ? updatedPlayer : p)
    );
    this._savePlayersToLocalStorage();
  }

  getPlayerById(id: string): Player | undefined {
    return this.#players().find(p => p.id === id);
  }

}
