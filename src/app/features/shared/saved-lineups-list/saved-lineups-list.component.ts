import {ChangeDetectionStrategy, Component, computed, inject, PLATFORM_ID, Signal, signal, WritableSignal} from '@angular/core';
import {CommonModule, isPlatformBrowser} from '@angular/common';
import {Router, RouterModule} from '@angular/router';
import {SavedLineupService} from '../../lineup/saved-lineup.service';
import {LineupService} from '../../lineup/lineup.service';
import {SavedLineup} from '../../../models/saved-lineup.model';

@Component({
  selector: 'app-saved-lineups-list',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './saved-lineups-list.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SavedLineupsListComponent {
  private readonly savedLineupService = inject(SavedLineupService);
  private readonly lineupService = inject(LineupService);
  private readonly router = inject(Router);
  private readonly platformId = inject(PLATFORM_ID);

  savedLineups: Signal<SavedLineup[]> = computed(() => {
    return [...this.savedLineupService.savedLineups()].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  });

  savedLineupsCount: Signal<number> = this.savedLineupService.savedLineupsCount;
  currentlyOpenLineupId: Signal<string | null> = this.savedLineupService.currentlyOpenLineupId;

  lineupToDelete: WritableSignal<SavedLineup | null> = signal(null);
  editingLineupId: WritableSignal<string | null> = signal(null);

  trackBySavedLineupId(_index: number, savedLineup: SavedLineup): string {
    return savedLineup.id;
  }

  isCurrentlyOpen(lineupId: string): boolean {
    return this.currentlyOpenLineupId() === lineupId;
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  getPlayerCount(savedLineup: SavedLineup): string {
    return savedLineup.lineup.settings.involvedPlayerIds.join(", ");
  }

  getGameModeText(savedLineup: SavedLineup): string {
    const {doubleMatchesMode, includeGoalieWar} = savedLineup.lineup.settings;
    let modeText = doubleMatchesMode === 'five' ? 'Fünf Doppel' : 'Vier Doppel';
    if (includeGoalieWar) {
      modeText += ' + Goalie War';
    }
    return modeText;
  }

  openLineup(savedLineup: SavedLineup): void {
    this.lineupService.startNewLineup(savedLineup.lineup.settings);

    savedLineup.lineup.slots.forEach(slot => {
      this.lineupService.assignPlayerToSlot(slot.setNumber, slot.assignedPlayerId);
    });

    this.savedLineupService.setCurrentlyOpenLineup(savedLineup.id);

    if (isPlatformBrowser(this.platformId)) {
      localStorage.setItem('lineup_edit_mode', 'false');
    }

    this.router.navigate(['/lineup']).then();
  }

  startRename(lineupId: string): void {
    this.editingLineupId.set(lineupId);
  }

  cancelRename(): void {
    this.editingLineupId.set(null);
  }

  saveNewName(lineupId: string, newName: string): void {
    const trimmedName = newName.trim();

    if (!trimmedName) {
      this.cancelRename();
      return;
    }

    if (this.savedLineupService.lineupNameExists(trimmedName, lineupId)) {
      alert('Eine Aufstellung mit diesem Namen existiert bereits.');
      return;
    }

    const savedLineup = this.savedLineupService.getSavedLineupById(lineupId);
    if (savedLineup) {
      this.savedLineupService.saveLineup(savedLineup.lineup, trimmedName, lineupId);
    }

    this.editingLineupId.set(null);
  }

  confirmDelete(savedLineup: SavedLineup): void {
    this.lineupToDelete.set(savedLineup);
  }

  deleteLineup(): void {
    const lineup = this.lineupToDelete();
    if (lineup) {
      this.savedLineupService.deleteLineup(lineup.id);
      this.lineupToDelete.set(null);
    }
  }

  cancelDelete(): void {
    this.lineupToDelete.set(null);
  }
}
