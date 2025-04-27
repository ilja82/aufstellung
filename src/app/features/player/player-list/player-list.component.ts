import {ChangeDetectionStrategy, Component, inject, signal, Signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {PlayerService} from '../player.service';
import {Player} from '../../../models/player.model';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {RouterModule} from '@angular/router';

@Component({
  selector: 'app-player-list',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './player-list.component.html',
  styleUrls: ['./player-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayerListComponent {
  private readonly playerService = inject(PlayerService);
  private readonly fb = inject(FormBuilder);

  editingState = signal<string | null>(null);

  players: Signal<Player[]> = this.playerService.players;
  playerCount: Signal<number> = this.playerService.playerCount;

  playerForm: FormGroup = this.fb.group({
    id: [''],
    name: ['', Validators.required],
    isGoalie: [false],
    isStriker: [false],
    likesSingles: [false],
    likesDoubles: [false],
    playsGoalieWar: [false]
  });

  toggleEdit(playerId: string): void {
    const currentState = this.editingState();
    if (currentState === playerId) {
      this.editingState.set(null);
      this.playerForm.reset();
    } else {
      const playerToEdit = this.playerService.getPlayerById(playerId);
      if (playerToEdit) {
        this.playerForm.patchValue(playerToEdit);
        this.editingState.set(playerId);
      }
    }
  }

  toggleAdd(): void {
    const currentState = this.editingState();
    if (currentState === 'add') {
      this.editingState.set(null);
      this.playerForm.reset();
    } else {
      this.playerForm.reset();
      this.editingState.set('add');
    }
  }

  savePlayer(): void {
    if (this.playerForm.invalid) {
      this.playerForm.markAllAsTouched();
      return;
    }

    const formValue = this.playerForm.getRawValue();
    const currentState = this.editingState();

    if (currentState === 'add') {
      const {id, ...newPlayerData} = formValue;
      this.playerService.addPlayer(newPlayerData);
    } else if (currentState !== null) {
      this.playerService.updatePlayer(formValue as Player);
    }

    this.editingState.set(null);
    this.playerForm.reset();
  }

  cancelEdit(): void {
    this.editingState.set(null);
    this.playerForm.reset();
  }

  removePlayer(id: string): void {
    this.playerService.removePlayer(id);
    if (this.editingState() === id) {
      this.cancelEdit();
    }
  }
}
