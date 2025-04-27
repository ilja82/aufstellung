import {ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, Signal} from '@angular/core';
import {CommonModule} from '@angular/common';
import {FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Router} from '@angular/router';
import {PlayerService} from '../../player/player.service';
import {LineupService} from '../lineup.service';
import {Player} from '../../../models/player.model';
import {LineupSettings} from '../../../models/lineup.model';
import {Subject} from 'rxjs';
import {startWith, takeUntil} from 'rxjs/operators';

@Component({
  selector: 'app-lineup-setup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './lineup-setup.component.html',
  styleUrls: ['./lineup-setup.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LineupSetupComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly playerService = inject(PlayerService);
  private readonly lineupService = inject(LineupService);
  private readonly router = inject(Router);
  private readonly destroy$ = new Subject<void>();

  availablePlayers: Signal<Player[]> = this.playerService.players;
  setupForm: FormGroup;
  isSubmitted = false;

  constructor() {
    this.setupForm = this.fb.group({
      doubleMatchesMode: ['five', Validators.required],
      includeGoalieWar: [false],
      involvedPlayers: this.fb.array([], [Validators.required, Validators.minLength(2)])
    });
  }

  ngOnInit(): void {
    this.availablePlayers().forEach(() => {
      this.involvedPlayersFormArray.push(new FormControl(true));
    });

    this.setupForm.get('doubleMatchesMode')?.valueChanges
      .pipe(
        startWith(this.setupForm.get('doubleMatchesMode')?.value),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.validatePlayerCount();
      });

    this.involvedPlayersFormArray.valueChanges
      .pipe(
        startWith(null),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.validatePlayerCount();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get involvedPlayersFormArray(): FormArray {
    return this.setupForm.get('involvedPlayers') as FormArray;
  }

  private getSelectedPlayerCount(): number {
    return this.involvedPlayersFormArray.controls
      .filter(control => control.value === true).length;
  }

  private validatePlayerCount(): void {
    const playerCount = this.getSelectedPlayerCount();
    const mode = this.setupForm.get('doubleMatchesMode')?.value;
    let errors = {...(this.involvedPlayersFormArray.errors || {})};

    if (playerCount < 2) {
      errors['required'] = true;
    }

    if (mode === 'five' && playerCount < 5 && playerCount >= 2) {
      errors['fiveDoublesMinPlayers'] = true;
    } else {
      delete errors['fiveDoublesMinPlayers'];
    }

    if (playerCount < 2) {
      delete errors['fiveDoublesMinPlayers'];
    }


    this.involvedPlayersFormArray.setErrors(Object.keys(errors).length > 0 ? errors : null);
  }


  startLineup(): void {
    this.isSubmitted = true;
    this.validatePlayerCount();


    if (this.setupForm.invalid) {
      this.setupForm.markAllAsTouched();
      return;
    }

    const formValue = this.setupForm.value;

    const selectedPlayerIds = this.availablePlayers()
      .filter((_player, index) => formValue.involvedPlayers[index])
      .map(player => player.id);

    const settings: LineupSettings = {
      doubleMatchesMode: formValue.doubleMatchesMode,
      includeGoalieWar: formValue.includeGoalieWar,
      involvedPlayerIds: selectedPlayerIds
    };

    this.lineupService.startNewLineup(settings);
    this.router.navigate(['/lineup']).then();
  }
}
