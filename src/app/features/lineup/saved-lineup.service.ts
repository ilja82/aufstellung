import {computed, inject, Injectable, PLATFORM_ID, signal, Signal, WritableSignal} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {SavedLineup} from '../../models/saved-lineup.model';
import {Lineup} from '../../models/lineup.model';

const SAVED_LINEUPS_STORAGE_KEY = 'saved_lineups';

@Injectable({
  providedIn: 'root'
})
export class SavedLineupService {
  readonly #savedLineups: WritableSignal<SavedLineup[]> = signal<SavedLineup[]>([]);
  readonly #currentlyOpenLineupId: WritableSignal<string | null> = signal<string | null>(null);

  public savedLineups: Signal<SavedLineup[]> = this.#savedLineups.asReadonly();
  public savedLineupsCount: Signal<number> = computed(() => this.#savedLineups().length);
  public currentlyOpenLineupId: Signal<string | null> = this.#currentlyOpenLineupId.asReadonly();

  public currentlyOpenLineup: Signal<SavedLineup | null> = computed(() => {
    const id = this.#currentlyOpenLineupId();
    if (!id) return null;
    return this.#savedLineups().find(lineup => lineup.id === id) ?? null;
  });

  private readonly platformId = inject(PLATFORM_ID);

  constructor() {
    this._loadSavedLineupsFromLocalStorage();
  }

  private _generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  private _generateDefaultName(): string {
    const now = new Date();
    return now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + ' ' +
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0') + ':' +
      String(now.getSeconds()).padStart(2, '0');
  }

  public saveLineup(lineup: Lineup, name?: string, existingId?: string): SavedLineup {
    const now = new Date();
    const lineupName = name || this._generateDefaultName();

    if (existingId) {
      this.#savedLineups.update(lineups =>
        lineups.map(saved =>
          saved.id === existingId
            ? {...saved, name: lineupName, updatedAt: now, lineup: {...lineup}}
            : saved
        )
      );
      const updated = this.#savedLineups().find(l => l.id === existingId)!;
      this._saveSavedLineupsToLocalStorage();
      return updated;
    } else {
      const existingByName = this.#savedLineups().find(l => l.name === lineupName);

      if (existingByName) {
        this.#savedLineups.update(lineups =>
          lineups.map(saved =>
            saved.name === lineupName
              ? {...saved, updatedAt: now, lineup: {...lineup}}
              : saved
          )
        );
        const updated = this.#savedLineups().find(l => l.name === lineupName)!;
        this._saveSavedLineupsToLocalStorage();
        return updated;
      } else {
        const newSavedLineup: SavedLineup = {
          id: this._generateId(),
          name: lineupName,
          createdAt: now,
          updatedAt: now,
          lineup: {...lineup}
        };

        this.#savedLineups.update(lineups => [...lineups, newSavedLineup]);
        this._saveSavedLineupsToLocalStorage();
        return newSavedLineup;
      }
    }
  }

  public deleteLineup(id: string): void {
    this.#savedLineups.update(lineups => lineups.filter(lineup => lineup.id !== id));

    if (this.#currentlyOpenLineupId() === id) {
      this.#currentlyOpenLineupId.set(null);
    }

    this._saveSavedLineupsToLocalStorage();
  }

  public lineupNameExists(name: string, excludeId?: string): boolean {
    return this.#savedLineups().some(lineup =>
      lineup.name === name && lineup.id !== excludeId
    );
  }

  public getSavedLineupById(id: string): SavedLineup | undefined {
    return this.#savedLineups().find(lineup => lineup.id === id);
  }

  public setCurrentlyOpenLineup(id: string | null): void {
    this.#currentlyOpenLineupId.set(id);
  }

  private _loadSavedLineupsFromLocalStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const savedData = localStorage.getItem(SAVED_LINEUPS_STORAGE_KEY);
      if (savedData) {
        try {
          const parsedLineups: SavedLineup[] = JSON.parse(savedData).map((lineup: any) => ({
            ...lineup,
            createdAt: new Date(lineup.createdAt),
            updatedAt: new Date(lineup.updatedAt)
          }));
          this.#savedLineups.set(parsedLineups);
        } catch (e) {
          console.error('Error parsing saved lineups from localStorage:', e);
          localStorage.removeItem(SAVED_LINEUPS_STORAGE_KEY);
          this.#savedLineups.set([]);
        }
      } else {
        this.#savedLineups.set([]);
      }
    } else {
      this.#savedLineups.set([]);
    }
  }

  private _saveSavedLineupsToLocalStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const lineupsToSave = JSON.stringify(this.#savedLineups());
        localStorage.setItem(SAVED_LINEUPS_STORAGE_KEY, lineupsToSave);
      } catch (e) {
        console.error('Error saving lineups to localStorage:', e);
      }
    }
  }
}
