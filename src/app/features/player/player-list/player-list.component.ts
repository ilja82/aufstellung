import {ChangeDetectionStrategy, Component, inject, signal, Signal, WritableSignal} from '@angular/core';

import {PlayerService} from '../player.service';
import {Player} from '../../../models/player.model';
import {AbstractControl, FormBuilder, FormGroup, ReactiveFormsModule, ValidationErrors, ValidatorFn} from '@angular/forms';
import {RouterModule} from '@angular/router';

@Component({
  selector: 'app-player-list',
  standalone: true,
  imports: [ReactiveFormsModule, RouterModule],
  templateUrl: './player-list.component.html',
  styleUrls: ['./player-list.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlayerListComponent {
  private readonly playerService = inject(PlayerService);
  private readonly fb = inject(FormBuilder);

  editingState = signal<string | null>(null);
  playerToDelete: WritableSignal<Player | null> = signal(null);

  players: Signal<Player[]> = this.playerService.players;
  playerCount: Signal<number> = this.playerService.playerCount;

  /**
   * Name must not be blank after trim and must not belong to another player.
   * Reads the player id from the parent form so editing a player may keep its own name.
   */
  private readonly nameValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
    const name: string = (control.value ?? '').toString();
    if (!name.trim()) {
      return {required: true};
    }
    const id: string | null | undefined = control.parent?.get('id')?.value;
    if (this.playerService.isNameTaken(name, id || undefined)) {
      return {duplicate: true};
    }
    return null;
  };

  playerForm: FormGroup = this.fb.group({
    id: [''],
    name: ['', this.nameValidator],
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
        this.playerForm.controls['name'].updateValueAndValidity();
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
    this.playerForm.controls['name'].updateValueAndValidity();
    if (this.playerForm.invalid) {
      this.playerForm.markAllAsTouched();
      return;
    }

    const formValue = this.playerForm.getRawValue();
    const currentState = this.editingState();

    let saved = false;
    if (currentState === 'add') {
      const {id, ...newPlayerData} = formValue;
      saved = this.playerService.addPlayer(newPlayerData);
    } else if (currentState !== null) {
      saved = this.playerService.updatePlayer(formValue as Player);
    }

    if (!saved) {
      // The service refused the name (e.g. taken in the meantime): keep the form open with the error.
      this.playerForm.controls['name'].updateValueAndValidity();
      this.playerForm.markAllAsTouched();
      return;
    }

    this.editingState.set(null);
    this.playerForm.reset();
  }

  cancelEdit(): void {
    this.editingState.set(null);
    this.playerForm.reset();
  }

  confirmDelete(player: Player): void {
    this.playerToDelete.set(player);
  }

  deletePlayer(): void {
    const player = this.playerToDelete();
    if (player) {
      this.playerService.removePlayer(player.id);
      this.playerToDelete.set(null);
      if (this.editingState() === player.id) {
        this.cancelEdit();
      }
    }
  }

  cancelDelete(): void {
    this.playerToDelete.set(null);
  }
}
