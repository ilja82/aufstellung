import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  inject,
  OnInit,
  PLATFORM_ID,
  Signal,
  signal,
  WritableSignal
} from '@angular/core';
import {CommonModule, isPlatformBrowser} from '@angular/common';
import {Router, RouterModule} from '@angular/router';
import {Dialog, DialogModule} from '@angular/cdk/dialog';
import {CdkDragDrop, CdkDragStart, DragDropModule} from '@angular/cdk/drag-drop';

import {LineupService} from '../lineup.service';
import {PlayerService} from '../../player/player.service';
import {Lineup, LineupSlot, PositionType} from '../../../models/lineup.model';
import {Player} from '../../../models/player.model';
import {PlayerSelectionData, PlayerSelectionModalComponent} from '../../shared/player-selection-modal/player-selection-modal.component';

interface BaseDisplayRow {
  rowKey: string;
}

interface SingleDisplayRow extends BaseDisplayRow {
  type: 'single';
  setsLabel: string;
  setNumber: number;
  slot: LineupSlot | undefined;
}

interface GoalieWarDisplayRow extends BaseDisplayRow {
  type: 'gw';
  setsLabel: string;
  setNumber: number;
  slot: LineupSlot | undefined;
}

interface DoubleDisplayRow extends BaseDisplayRow {
  type: 'double';
  setsLabel: string;
  setNumbers: [number, number];
  strikerSlot: LineupSlot | undefined;
  goalieSlot: LineupSlot | undefined;
}

type LineupDisplayRow = SingleDisplayRow | GoalieWarDisplayRow | DoubleDisplayRow;

const EDIT_MODE_STORAGE_KEY = 'lineup_edit_mode';

@Component({
  selector: 'app-lineup-display',
  standalone: true,
  imports: [CommonModule, RouterModule, DialogModule, DragDropModule],
  templateUrl: './lineup-display.component.html',
  styleUrls: ['./lineup-display.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LineupDisplayComponent implements OnInit {
  private readonly lineupService = inject(LineupService);
  private readonly playerService = inject(PlayerService);
  private readonly router = inject(Router);
  private readonly dialog = inject(Dialog);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly platformId = inject(PLATFORM_ID);

  isCurrentlyDragging = false;
  isEditModeEnabled: WritableSignal<boolean> = signal(true);
  draggedPlayerId: string | null = null;
  sourceSetNumber: number | undefined = undefined;

  currentLineup: Signal<Lineup | null> = this.lineupService.currentLineup;
  private readonly allPlayersMap: Signal<Map<string, Player>> = computed(() => {
    const map = new Map<string, Player>();
    this.playerService.players().forEach(player => map.set(player.id, player));
    return map;
  });
  involvedPlayers: Signal<Player[]> = computed(() => {
    const lineup = this.currentLineup();
    const playerMap = this.allPlayersMap();
    if (!lineup) return [];
    return lineup.settings.involvedPlayerIds.map(id => playerMap.get(id)).filter((player): player is Player => !!player);
  });
  displayRows: Signal<LineupDisplayRow[]> = computed(() => {
    const lineup = this.currentLineup();
    if (!lineup) return [];
    const slots = lineup.slots;
    const rows: LineupDisplayRow[] = [];
    const mode = lineup.settings.doubleMatchesMode;
    const gw = lineup.settings.includeGoalieWar;
    const findSlot = (set: number, pos: PositionType): LineupSlot | undefined => slots.find(s => s.setNumber === set && s.position === pos);
    const findDoubleSlots = (set: number): {
      strikerSlot: LineupSlot | undefined,
      goalieSlot: LineupSlot | undefined
    } => ({strikerSlot: findSlot(set, 'striker'), goalieSlot: findSlot(set + 1, 'goalie')});
    rows.push({type: 'single', setsLabel: 'Einzel (E1)', setNumber: 1, slot: findSlot(1, 'single'), rowKey: 's1'});
    rows.push({type: 'single', setsLabel: 'Einzel (E2)', setNumber: 2, slot: findSlot(2, 'single'), rowKey: 's2'});
    rows.push({type: 'double', setsLabel: 'Doppel (D1)', setNumbers: [3, 4], ...findDoubleSlots(3), rowKey: 'd34'});
    if (mode === 'five') {
      rows.push({type: 'double', setsLabel: 'Doppel (D5)', setNumbers: [5, 6], ...findDoubleSlots(5), rowKey: 'd56'});
    } else {
      rows.push({type: 'single', setsLabel: 'Einzel (E3)', setNumber: 5, slot: findSlot(5, 'single'), rowKey: 's5'});
      rows.push({type: 'single', setsLabel: 'Einzel (E4)', setNumber: 6, slot: findSlot(6, 'single'), rowKey: 's6'});
    }
    rows.push({type: 'double', setsLabel: 'Doppel (D2)', setNumbers: [7, 8], ...findDoubleSlots(7), rowKey: 'd78'});
    if (gw) {
      rows.push({type: 'gw', setsLabel: 'Goalie 1', setNumber: 9, slot: findSlot(9, 'gw'), rowKey: 'gw9'});
      rows.push({type: 'gw', setsLabel: 'Goalie 2', setNumber: 10, slot: findSlot(10, 'gw'), rowKey: 'gw10'});
    } else {
      rows.push({type: 'single', setsLabel: 'Einzel (E5)', setNumber: 9, slot: findSlot(9, 'single'), rowKey: 's9'});
      rows.push({type: 'single', setsLabel: 'Einzel (E6)', setNumber: 10, slot: findSlot(10, 'single'), rowKey: 's10'});
    }
    rows.push({type: 'double', setsLabel: 'Doppel (D3)', setNumbers: [11, 12], ...findDoubleSlots(11), rowKey: 'd1112'});
    rows.push({type: 'single', setsLabel: 'Einzel (E7)', setNumber: 13, slot: findSlot(13, 'single'), rowKey: 's13'});
    rows.push({type: 'single', setsLabel: 'Einzel (E8)', setNumber: 14, slot: findSlot(14, 'single'), rowKey: 's14'});
    rows.push({type: 'double', setsLabel: 'Doppel (D4)', setNumbers: [15, 16], ...findDoubleSlots(15), rowKey: 'd1516'});
    return rows;
  });

  ngOnInit(): void {
    this.loadEditModeState();
  }

  private loadEditModeState(): void {
    if (isPlatformBrowser(this.platformId)) {
      const savedState = localStorage.getItem(EDIT_MODE_STORAGE_KEY);
      this.isEditModeEnabled.set(savedState === null || savedState === 'true');
    }
  }

  private saveEditModeState(isEnabled: boolean): void {
    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem(EDIT_MODE_STORAGE_KEY, String(isEnabled));
    }
  }


  toggleEditMode(): void {
    this.isEditModeEnabled.update(enabled => {
      const newState = !enabled;
      this.saveEditModeState(newState);
      return newState;
    });
    if (!this.isEditModeEnabled() && this.isCurrentlyDragging) {
      this.onDragReleased();
    }
  }

  getPlayerName(playerId: string | null): string {
    if (!playerId) return 'Spieler';
    return this.allPlayersMap().get(playerId)?.name ?? 'Spieler';
  }

  getPlayerColor(playerId: string | null): string {
    if (!playerId) {
      return 'transparent';
    }
    const colors = this.currentLineup()?.playerColors;
    return colors?.[playerId] ?? '#D1D5DB';
  }

  trackByRowKey(_index: number, row: LineupDisplayRow): string {
    return row.rowKey;
  }

  getAllSetListIds() {
    const rows = this.displayRows();
    if (!rows) return [];
    return [...rows.map(row => row.setsLabel)]
  }

  getAllSlotListIds(): string[] {
    const lineup = this.currentLineup();
    if (!lineup) return [];
    return [...lineup.slots.map(slot => this.getDropListId(slot.setNumber, slot.position))];
  }

  getDropListId(setNumber: number, position: PositionType): string {
    const effectivePosition = position === 'gw' ? 'gw' : position;
    return `slot-${setNumber}-${effectivePosition}`;
  }

  onDragStarted(event: CdkDragStart): void {
    if (!this.isEditModeEnabled()) return;
    this.isCurrentlyDragging = true;
    const dragData = event.source.data as { playerId: string, sourceSlot: { setNumber: number, position: PositionType } } | null;
    this.draggedPlayerId = dragData?.playerId ?? null;
    this.sourceSetNumber = dragData?.sourceSlot?.setNumber;
  }

  onDragReleased(): void {
    setTimeout(() => {
      this.isCurrentlyDragging = false;
      this.draggedPlayerId = null;
      this.sourceSetNumber = undefined;
      this.changeDetectorRef.detectChanges();
    }, 0);
  }

  isDropTargetEligible(targetSetNumber: number): boolean {
    const lineup = this.currentLineup();
    if (!this.isCurrentlyDragging || !this.draggedPlayerId || !lineup) {
      return false;
    }
    return this.lineupService.isMoveEligible(
      lineup.slots,
      targetSetNumber,
      this.sourceSetNumber,
      this.draggedPlayerId
    ) || this.lineupService.isMoveEligible(
      lineup.slots,
      targetSetNumber,
      undefined,
      this.draggedPlayerId
    );
  }

  onSlotClick(setNumber: number, position: PositionType): void {
    if (!this.isEditModeEnabled() || this.isCurrentlyDragging) {
      return;
    }
    const lineup = this.currentLineup();
    if (!lineup) return;
    const dialogRef = this.dialog.open<string | null | undefined>(PlayerSelectionModalComponent, {
      width: '320px',
      panelClass: 'bg-transparent',
      backdropClass: 'bg-black/60',
      data: {setNumber: setNumber, position: position, currentLineup: lineup, allPlayersMap: this.allPlayersMap()} as PlayerSelectionData
    });
    dialogRef.closed.subscribe(selectedPlayerId => {
      if (selectedPlayerId !== undefined) {
        this.lineupService.assignPlayerToSlot(setNumber, selectedPlayerId);
      }
    });
  }

  onDrop(event: CdkDragDrop<any>): void {
    if (!this.isEditModeEnabled()) return;

    const targetContainerId = event.container.id;
    const sourceContainerId = event.previousContainer.id;

    if (targetContainerId === sourceContainerId) {
      return;
    }

    const draggedItemData = event.item.data;
    const targetSlotInfo = event.container.data as { setNumber: number, position: PositionType };

    const lineup = this.currentLineup();
    if (!lineup || !targetSlotInfo || !draggedItemData) {
      console.error("Lineup, target data, or dragged item data missing!");
      return;
    }

    const {playerId: playerIdToMove, sourceSlot: sourceSlotInfo} = draggedItemData as {
      playerId: string,
      sourceSlot: { setNumber: number, position: PositionType }
    };

    const targetSlotCurrentPlayerId = lineup.slots.find(s => s.setNumber === targetSlotInfo.setNumber && s.position === targetSlotInfo.position)?.assignedPlayerId ?? null;

    const canSwapPositions = this.lineupService.isMoveEligible(lineup.slots, targetSlotInfo.setNumber, sourceSlotInfo.setNumber);

    if (canSwapPositions) {
      this.lineupService.assignPlayerToSlot(sourceSlotInfo.setNumber, targetSlotCurrentPlayerId);
      this.lineupService.assignPlayerToSlot(targetSlotInfo.setNumber, playerIdToMove);
    } else {
      const canMovePosition = this.lineupService.isMoveEligible(lineup.slots, targetSlotInfo.setNumber, undefined, playerIdToMove);
      if (canMovePosition) {
        this.lineupService.assignPlayerToSlot(sourceSlotInfo.setNumber, null);
        this.lineupService.assignPlayerToSlot(targetSlotInfo.setNumber, playerIdToMove);
      } else {
        console.warn(`Cannot swap: ${this.getPlayerName(playerIdToMove)} not eligible for target ${targetSlotInfo.setNumber}/${targetSlotInfo.position}`);
      }
    }
  }

  onDropRow(event: CdkDragDrop<any>) {
    console.log(event);

    if (!this.isEditModeEnabled()) return;

    const targetContainerId = event.container.id;
    const sourceContainerId = event.previousContainer.id;

    if (targetContainerId === sourceContainerId) {
      return;
    }

    const sourceSetLabel = event.item.data;
    const targetSetLabel = event.container.data;

    console.log(sourceSetLabel + " " + targetSetLabel);

    const sourceDisplayRow = this.displayRows().find(row => row.setsLabel === sourceSetLabel);
    const targetDisplayRow = this.displayRows().find(row => row.setsLabel === targetSetLabel);

    if ((sourceDisplayRow?.type !== targetDisplayRow?.type)) {
      console.error("Cannot move between different types of sets!");
      return;
    }

    const lineup = this.currentLineup();
    if (sourceDisplayRow?.type === 'single' && targetDisplayRow?.type === 'single') {
      const sourcePlayer = lineup?.slots.find(s => s.setNumber === sourceDisplayRow.setNumber && s.position === 'single')?.assignedPlayerId;
      const targetPlayer = lineup?.slots.find(s => s.setNumber === targetDisplayRow.setNumber && s.position === 'single')?.assignedPlayerId;
      if (sourcePlayer && targetPlayer) {
        this.lineupService.assignPlayerToSlot(sourceDisplayRow.setNumber, targetPlayer);
        this.lineupService.assignPlayerToSlot(targetDisplayRow.setNumber, sourcePlayer);
      }
    }

    if (sourceDisplayRow?.type === 'double' && targetDisplayRow?.type === 'double') {
      const sourceStriker = lineup?.slots.find(s => s.setNumber === sourceDisplayRow.setNumbers[0] && s.position === 'striker')?.assignedPlayerId;
      const sourceGoalie = lineup?.slots.find(s => s.setNumber === sourceDisplayRow.setNumbers[1] && s.position === 'goalie')?.assignedPlayerId;
      const targetStriker = lineup?.slots.find(s => s.setNumber === targetDisplayRow.setNumbers[0] && s.position === 'striker')?.assignedPlayerId;
      const targetGoalie = lineup?.slots.find(s => s.setNumber === targetDisplayRow.setNumbers[1] && s.position === 'goalie')?.assignedPlayerId;
      if (sourceStriker && sourceGoalie && targetStriker && targetGoalie) {
        this.lineupService.assignPlayerToSlot(sourceDisplayRow.setNumbers[0], targetStriker);
        this.lineupService.assignPlayerToSlot(sourceDisplayRow.setNumbers[1], targetGoalie);
        this.lineupService.assignPlayerToSlot(targetDisplayRow.setNumbers[0], sourceStriker);
        this.lineupService.assignPlayerToSlot(targetDisplayRow.setNumbers[1], sourceGoalie);
      }
    }
    if (sourceDisplayRow?.type === 'gw' && targetDisplayRow?.type === 'gw') {
      const sourcePlayer = lineup?.slots.find(s => s.setNumber === sourceDisplayRow.setNumber && s.position === 'gw')?.assignedPlayerId;
      const targetPlayer = lineup?.slots.find(s => s.setNumber === targetDisplayRow.setNumber && s.position === 'gw')?.assignedPlayerId;
      if (sourcePlayer && targetPlayer) {
        this.lineupService.assignPlayerToSlot(sourceDisplayRow.setNumber, targetPlayer);
        this.lineupService.assignPlayerToSlot(targetDisplayRow.setNumber, sourcePlayer);
      }
    }
  }

  generateRandom(): void {
    if (!this.isEditModeEnabled()) return;
    try {
      this.lineupService.generateRandomAssignment();
    } catch (error) {
      console.error("Error:", error);
    }
  }

  clearLineup(): void {
    if (!this.isEditModeEnabled()) return;
    this.lineupService.clearSets();
  }

  newSetup() {
    this.lineupService.clearCurrentLineup();
    this.router.navigate(['/lineup/setup']).then();
  }
}
