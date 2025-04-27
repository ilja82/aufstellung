import {ChangeDetectionStrategy, Component, computed, inject, Signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {DIALOG_DATA, DialogRef} from '@angular/cdk/dialog';
import {Player} from '../../../models/player.model';
import {Lineup, PositionType} from '../../../models/lineup.model';
import {LineupService} from '../../lineup/lineup.service';

export interface PlayerSelectionData {
  setNumber: number;
  position: PositionType;
  currentLineup: Lineup;
  allPlayersMap: Map<string, Player>;
}

@Component({
  selector: 'app-player-selection-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-selection-modal.component.html',
  styleUrls: ['./player-selection-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayerSelectionModalComponent {
  private readonly lineupService = inject(LineupService);
  public dialogRef = inject(DialogRef<string | null>);
  public data: PlayerSelectionData = inject(DIALOG_DATA);

  eligiblePlayers: Signal<Player[]> = computed(() => {
    const {setNumber, position, currentLineup, allPlayersMap} = this.data;
    const involvedPlayerIds = new Set(currentLineup.settings.involvedPlayerIds);

    const filteredPlayers = Array.from(allPlayersMap.values())
      .filter(player => this.lineupService.isMoveEligible(currentLineup.slots, setNumber, undefined, player.id) && involvedPlayerIds.has(player.id));

    filteredPlayers.sort((a, b) => {
      let comparison: number;
      if (position === 'single') {
        comparison = (b.likesSingles ? 1 : 0) - (a.likesSingles ? 1 : 0);
      } else if (position === 'gw') {
        comparison = (b.playsGoalieWar ? 1 : 0) - (a.playsGoalieWar ? 1 : 0);
      } else if (position === 'goalie') {
        comparison = (b.isGoalie ? 1 : 0) - (a.isGoalie ? 1 : 0);
      } else {
        comparison = (b.isStriker ? 1 : 0) - (a.isStriker ? 1 : 0);
      }
      if (comparison === 0) {
        comparison = a.name.localeCompare(b.name);
      }

      return comparison;
    });

    return filteredPlayers;
  });

  currentAssignmentId: string | null = this.data.currentLineup.slots.find(
    slot => slot.setNumber === this.data.setNumber && slot.position === this.data.position
  )?.assignedPlayerId ?? null;


  selectPlayer(playerId: string): void {
    this.dialogRef.close(playerId);
  }

  removeAssignment(): void {
    this.dialogRef.close(null);
  }

  cancel(): void {
    this.dialogRef.close();
  }
}
