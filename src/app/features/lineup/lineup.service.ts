import {inject, Injectable, PLATFORM_ID, signal, Signal, WritableSignal} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {DoubleMatchesMode, Lineup, LineupSettings, LineupSlot, PositionType} from '../../models/lineup.model';
import {PlayerService} from '../player/player.service';
import {generateLineupAssignment} from './lineup-scheduler';

const LINEUP_STORAGE_KEY = 'current_lineup';

@Injectable({
  providedIn: 'root'
})
export class LineupService {
  readonly #currentLineup: WritableSignal<Lineup | null> = signal<Lineup | null>(null);

  public currentLineup: Signal<Lineup | null> = this.#currentLineup.asReadonly();

  private readonly platformId = inject(PLATFORM_ID);
  private readonly playerService = inject(PlayerService);

  constructor() {
    this._loadLineupFromLocalStorage();
  }

  public startNewLineup(settings: LineupSettings): void {
    const slots = this._generateEmptySlots(settings.doubleMatchesMode, settings.includeGoalieWar);
    const playerColors = this._generatePlayerColors(settings.involvedPlayerIds);
    const newEmptyLineup: Lineup = {
      settings: settings,
      slots: slots,
      playerColors: playerColors
    };
    this.#currentLineup.set(newEmptyLineup);
    this._saveLineupToLocalStorage();
  }

  public assignPlayerToSlot(setNumber: number, playerId: string | null): void {
    this.#currentLineup.update(lineup => {
      if (!lineup) return null;
      const updatedSlots = lineup.slots.map(slot => {
          if (slot.setNumber === setNumber) {
            return {...slot, assignedPlayerId: playerId};
          } else {
            return slot;
          }
        }
      );
      return {...lineup, slots: updatedSlots};
    });
    this._saveLineupToLocalStorage();
  }

  public isMoveEligible(currentSlots: LineupSlot[], targetSetNumber: number, sourceSetNumber?: number, playerId?: string): boolean {
    const workingSlots = currentSlots.map(slot => ({...slot}));

    let sourcePlayerId = null;
    let targetPlayerId = null;
    if (sourceSetNumber) {
      sourcePlayerId = workingSlots.find(s => s.setNumber === sourceSetNumber)?.assignedPlayerId;
    } else {
      sourcePlayerId = playerId;
    }
    if (targetSetNumber) {
      targetPlayerId = workingSlots.find(s => s.setNumber === targetSetNumber)?.assignedPlayerId;
    }

    if (sourcePlayerId === targetPlayerId) {
      return false;
    }

    workingSlots.forEach(slot => {
      if (slot.setNumber === targetSetNumber) {
        slot.assignedPlayerId = sourcePlayerId ?? null;
      } else if (slot.setNumber === sourceSetNumber) {
        slot.assignedPlayerId = targetPlayerId ?? null;
      }
    });

    // Check rules:

    // 1: Each player can only play a maximum of 2 singles and a maximum of 2 doubles
    const playerCounts = new Map<string, { singleCount: number, doubleCount: number }>();
    workingSlots.forEach(slot => {
      if (slot.assignedPlayerId) {
        const counts = playerCounts.get(slot.assignedPlayerId) || {singleCount: 0, doubleCount: 0};
        if (slot.position === 'single' || slot.position === 'gw') {
          counts.singleCount++;
        } else {
          counts.doubleCount++;
        }
        playerCounts.set(slot.assignedPlayerId, counts);
      }
    });

    for (const [, counts] of playerCounts.entries()) {
      if (counts.singleCount > 2 || counts.doubleCount > 2) {
        return false;
      }
    }

    // 2: Players can't play with themselves in doubles
    for (let i = 0; i < workingSlots.length - 1; i++) {
      if (workingSlots[i].position === 'striker' && workingSlots[i + 1].position === 'goalie') {
        if (workingSlots[i].assignedPlayerId && workingSlots[i + 1].assignedPlayerId) {
          if (workingSlots[i].assignedPlayerId === workingSlots[i + 1].assignedPlayerId) {
            return false;
          }
        }
      }
    }

    // 3: The same pair can't play twice in doubles
    const assignedDoublePairs = new Set<string>();
    for (let i = 0; i < workingSlots.length - 1; i++) {
      if (workingSlots[i].position === 'striker' && workingSlots[i + 1].position === 'goalie') {
        if (workingSlots[i].assignedPlayerId && workingSlots[i + 1].assignedPlayerId) {
          const player1 = workingSlots[i].assignedPlayerId!;
          const player2 = workingSlots[i + 1].assignedPlayerId!;
          const pairKey = [player1, player2].sort((a, b) => a.localeCompare(b)).join('_');
          if (assignedDoublePairs.has(pairKey)) {
            return false;
          }
          assignedDoublePairs.add(pairKey);
        }
      }
    }

    return true;
  }

  public generateRandomAssignment(): void {
    const lineup = this.#currentLineup();
    if (!lineup) {
      console.warn("Cannot generate: No current lineup.");
      return;
    }

    const involvedPlayerIds = new Set(lineup.settings.involvedPlayerIds);
    const involvedPlayers = this.playerService.players().filter(player => involvedPlayerIds.has(player.id));
    const {slots, report} = generateLineupAssignment(lineup.slots, involvedPlayers);

    this.#currentLineup.update(currentL => {
      if (!currentL) return null;
      return {
        ...currentL,
        slots: slots
      };
    });
    this._saveLineupToLocalStorage();

    if (report.emptySeats > 0) {
      console.warn(`Generated lineup leaves ${report.emptySeats} slot(s) empty: the squad cannot staff every set.`);
    }
    if (report.backToBackAppearances > 0) {
      console.warn(`Generated lineup makes ${report.backToBackAppearances} appearance(s) follow the previous set directly.`);
    }
  }


  private _generatePlayerColors(playerIds: string[]): Record<string, string> {
    const N = playerIds.length;
    const startHue = Math.random() * 360;
    const step = 360 / N;

    return Object.fromEntries(
      playerIds.map((id, i) => {
        const hue = Math.round((startHue + step * i) % 360);
        const saturation = 65 + Math.floor(Math.random() * 15);
        const lightness = 35 + Math.floor(Math.random() * 25);
        return [id, `hsl(${hue}, ${saturation}%, ${lightness}%)`] as [string, string];
      })
    );
  }

  private _generateEmptySlots(mode: DoubleMatchesMode, gw: boolean): LineupSlot[] {
    const slots: LineupSlot[] = [];
    const createSlot = (set: number, pos: PositionType): LineupSlot => ({setNumber: set, position: pos, assignedPlayerId: null});
    slots.push(createSlot(1, 'single'));
    slots.push(createSlot(2, 'single'));
    slots.push(createSlot(3, 'striker'));
    slots.push(createSlot(4, 'goalie'));
    if (mode === 'five') {
      slots.push(createSlot(5, 'striker'));
      slots.push(createSlot(6, 'goalie'));
    } else {
      slots.push(createSlot(5, 'single'));
      slots.push(createSlot(6, 'single'));
    }
    slots.push(createSlot(7, 'striker'));
    slots.push(createSlot(8, 'goalie'));
    if (gw) {
      slots.push(createSlot(9, 'gw'));
      slots.push(createSlot(10, 'gw'));
    } else {
      slots.push(createSlot(9, 'single'));
      slots.push(createSlot(10, 'single'));
    }
    slots.push(createSlot(11, 'striker'));
    slots.push(createSlot(12, 'goalie'));
    slots.push(createSlot(13, 'single'));
    slots.push(createSlot(14, 'single'));
    slots.push(createSlot(15, 'striker'));
    slots.push(createSlot(16, 'goalie'));
    return slots;
  }

  private _loadLineupFromLocalStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const savedLineup = localStorage.getItem(LINEUP_STORAGE_KEY);
      if (savedLineup) {
        try {
          let parsedLineup: Lineup = JSON.parse(savedLineup);
          if (!parsedLineup.playerColors && parsedLineup.settings?.involvedPlayerIds) {
            parsedLineup.playerColors = this._generatePlayerColors(parsedLineup.settings.involvedPlayerIds);
          }
          this.#currentLineup.set(parsedLineup);
        } catch (e) {
          console.error('Error parsing lineup from localStorage:', e);
          localStorage.removeItem(LINEUP_STORAGE_KEY);
          this.#currentLineup.set(null);
        }
      } else {
        this.#currentLineup.set(null);
      }
    } else {
      this.#currentLineup.set(null);
    }
  }

  private _saveLineupToLocalStorage(): void {
    if (isPlatformBrowser(this.platformId)) {
      const lineup = this.#currentLineup();
      if (lineup) {
        try {
          localStorage.setItem(LINEUP_STORAGE_KEY, JSON.stringify(lineup));
        } catch (e) {
          console.error('Error saving lineup to localStorage:', e);
        }
      } else {
        localStorage.removeItem(LINEUP_STORAGE_KEY);
      }
    }
  }

  clearSets() {
    const lineup = this.#currentLineup();
    if (!lineup) return;
    this.#currentLineup.update(currentL => {
      if (!currentL) return null;
      return {
        ...currentL,
        slots: currentL.slots.map((slot): LineupSlot => ({...slot, assignedPlayerId: null}))
      }
    });
    this._saveLineupToLocalStorage();
  }
}
