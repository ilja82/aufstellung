import {Component, inject, OnInit, PLATFORM_ID, signal, WritableSignal} from '@angular/core';
import {RouterLink, RouterLinkActive, RouterOutlet} from '@angular/router';
import {CommonModule, isPlatformBrowser} from '@angular/common';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed',
    platform: string
  }>;

  prompt(): Promise<void>;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);

  protected deferredPrompt: WritableSignal<BeforeInstallPromptEvent | null> = signal(null);
  protected showInstallButton: WritableSignal<boolean> = signal(false);

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.setupInstallButton();
    }
  }

  private setupInstallButton(): void {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      this.deferredPrompt.set(e as BeforeInstallPromptEvent);
      if (!isStandalone) {
        this.showInstallButton.set(true);
      }
    });

    window.addEventListener('appinstalled', () => {
      this.showInstallButton.set(false);
      this.deferredPrompt.set(null);
    });

    if (isStandalone) {
      this.showInstallButton.set(false);
    }
  }

  installPWA(): void {
    const promptEvent = this.deferredPrompt();
    if (!promptEvent) {
      console.log('Install prompt event is not available. Skipping install..');
      return;
    }
    promptEvent.prompt();
    promptEvent.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('The user accepted the installation');
      } else {
        console.log('The user did not accept the installation');
      }
      this.deferredPrompt.set(null);
      this.showInstallButton.set(false);
    });
  }
}
