import {inject, Injectable, PLATFORM_ID, signal, Signal, WritableSignal} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {DoubleMatchesMode, Lineup, LineupSettings, LineupSlot, PositionType} from '../../models/lineup.model';
import {PlayerService} from '../player/player.service';
import {Player} from '../../models/player.model';

const LINEUP_STORAGE_KEY = 'current_lineup';
const MAX_RANDOM_ASSIGNMENT_ATTEMPTS = 20;

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
    const allPlayersArray = this.playerService.players();
    const playersMap = new Map<string, Player>();
    allPlayersArray.forEach(p => playersMap.set(p.id, p));

    if (!lineup) {
      console.warn("Cannot generate: No current lineup.");
      return;
    }

    const involvedPlayerIds = new Set(lineup.settings.involvedPlayerIds);
    const playerCount = involvedPlayerIds.size;
    let assignmentSuccessful = false;
    let attempt = 0;
    let finalWorkingSlots: LineupSlot[] = lineup.slots.map((slot): LineupSlot => ({...slot, assignedPlayerId: null}));


    let maxSetNumberToFill = lineup.slots.length;
    if (playerCount === 2) {
      maxSetNumberToFill = 6;
    } else if (playerCount === 3) {
      maxSetNumberToFill = 12;
    }


    while (attempt < MAX_RANDOM_ASSIGNMENT_ATTEMPTS && !assignmentSuccessful) {
      attempt++;
      let workingSlots: LineupSlot[] = lineup.slots.map((slot): LineupSlot => ({...slot, assignedPlayerId: null}));

      const shuffledPlayers = allPlayersArray.filter(player => involvedPlayerIds.has(player.id));
      this._shuffleArray(shuffledPlayers);
      const playerCounts = new Map<Player, number>();
      for (const player of shuffledPlayers) {
        playerCounts.set(player, 0);
      }

      let slotsToCheckAssigned = false;
      let innerLoopProtection = 0;
      const maxInnerLoops = shuffledPlayers.length * workingSlots.length * 2;

      while (!slotsToCheckAssigned && innerLoopProtection < maxInnerLoops) {
        innerLoopProtection++;
        let playersAssignedThisPass = 0;

        const slotsToConsider = workingSlots.filter(slot => slot.setNumber <= maxSetNumberToFill);


        for (const player of shuffledPlayers) {
          let slotAssigned = false;
          for (const slot of slotsToConsider) {
            if (!slot.assignedPlayerId) {
              if (slot.position === 'single' && player.likesSingles ||
                slot.position === 'striker' && player.isStriker ||
                slot.position === 'goalie' && player.isGoalie ||
                slot.position === 'gw' && player.playsGoalieWar) {
                if (this.isMoveEligible(workingSlots, slot.setNumber, undefined, player.id)) {
                  const targetSlotInWorkingSlots = workingSlots.find(ws => ws.setNumber === slot.setNumber);
                  if (targetSlotInWorkingSlots) targetSlotInWorkingSlots.assignedPlayerId = player.id;
                  let setsToAdd = 1;
                  if (slot.position === 'striker' || slot.position === 'goalie') {
                    setsToAdd = 2;
                  }
                  playerCounts.set(player, (playerCounts.get(player) ?? 0) + setsToAdd);
                  slotAssigned = true;
                  playersAssignedThisPass++;
                  break;
                }
              }
            }
          }
          if (!slotAssigned) {
            for (const slot of slotsToConsider) {
              if (!slot.assignedPlayerId) {
                if (this.isMoveEligible(workingSlots, slot.setNumber, undefined, player.id)) {
                  const targetSlotInWorkingSlots = workingSlots.find(ws => ws.setNumber === slot.setNumber);
                  if (targetSlotInWorkingSlots) targetSlotInWorkingSlots.assignedPlayerId = player.id;
                  let setsToAdd = 1;
                  if (slot.position === 'striker' || slot.position === 'goalie') {
                    setsToAdd = 2;
                  }
                  playerCounts.set(player, (playerCounts.get(player) ?? 0) + setsToAdd);
                  playersAssignedThisPass++;
                  break;
                }
              }
            }
          }
        }
        shuffledPlayers.sort((a, b) => {
          const countA = playerCounts.get(a) ?? 0;
          const countB = playerCounts.get(b) ?? 0;
          return countA - countB;
        });

        slotsToCheckAssigned = workingSlots
          .filter(slot => slot.setNumber <= maxSetNumberToFill)
          .every(slot => slot.assignedPlayerId !== null);


        if (playersAssignedThisPass === 0 && !slotsToCheckAssigned) {
          break;
        }
      }

      finalWorkingSlots = workingSlots;

      if (slotsToCheckAssigned) {
        assignmentSuccessful = true;
      }

    }

    this.#currentLineup.update(currentL => {
      if (!currentL) return null;
      return {
        ...currentL,
        slots: finalWorkingSlots
      };
    });
    this._saveLineupToLocalStorage();

    if (assignmentSuccessful) {
      console.log(`Random assignment for relevant slots successful after ${attempt} attempts.`);
    } else {
      console.warn(`Could not fill all relevant slots (up to set ${maxSetNumberToFill}) after ${MAX_RANDOM_ASSIGNMENT_ATTEMPTS} attempts. Some slots may be empty.`);
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

  private _shuffleArray(array: any[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
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
