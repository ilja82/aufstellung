import {Directive, ElementRef, inject, NgZone, OnDestroy, PLATFORM_ID} from '@angular/core';
import {isPlatformBrowser} from '@angular/common';
import {CdkDrag} from '@angular/cdk/drag-drop';

/** How long a finger has to rest on an element before it hands over control of it. */
export const HOLD_TO_MOVE_MS = 400;

/** Bubbling event, fired the moment a hold turns into a grip. */
export const HOLD_ARMED_EVENT = 'holdarmed';

/**
 * Mirrors the CDK's own drag start threshold. Past it the CDK treats the gesture as scrolling and
 * drops the drag sequence, so the grip has to let go at exactly the same point.
 */
const SCROLL_TOLERANCE_PX = 5;

/** How long after a closed grip the trailing click is discarded. */
const CLICK_SWALLOW_MS = 400;

/**
 * Companion to `cdkDrag` that shows what a touch hold is doing: the element takes the `is-holding`
 * class while the finger rests on it and `is-gripped` once the hold is long enough to move it. The
 * hold duration comes from the drag's own `cdkDragStartDelay`, so the visuals and the CDK can never
 * disagree about when the element is ready.
 *
 * Mouse input is untouched - only touch gestures need the pause.
 */
@Directive({
  selector: '[appHoldToMove]',
  standalone: true
})
export class HoldToMoveDirective implements OnDestroy {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private readonly drag = inject(CdkDrag, {self: true, optional: true});
  private readonly teardown: Array<() => void> = [];

  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private touchOrigin: { x: number, y: number } | null = null;
  private isGripped = false;
  private swallowClickUntil = 0;

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) {
      return;
    }
    this.host.classList.add('hold-to-move');
    this.zone.runOutsideAngular(() => {
      this.on('touchstart', this.onTouchStart, {passive: true});
      this.on('touchmove', this.onTouchMove, {passive: true});
      this.on('touchend', this.onTouchEnd, {passive: true});
      this.on('touchcancel', this.onTouchEnd, {passive: true});
      this.on('contextmenu', this.onContextMenu);
      this.on('click', this.onClick, {capture: true});
    });
  }

  ngOnDestroy(): void {
    this.release();
    this.teardown.forEach(off => off());
  }

  /** The hold the CDK is waiting for, so both count the same milliseconds. */
  private get holdDuration(): number {
    const delay = this.drag?.dragStartDelay;
    if (typeof delay === 'number') {
      return delay;
    }
    return delay?.touch ?? HOLD_TO_MOVE_MS;
  }

  private onTouchStart = (event: TouchEvent): void => {
    if (event.touches.length > 1) {
      this.release();
      return;
    }
    if (this.drag?.disabled || this.holdDuration <= 0) {
      return;
    }
    const touch = event.touches[0];
    this.touchOrigin = {x: touch.clientX, y: touch.clientY};
    this.host.style.setProperty('--grip-hold', `${this.holdDuration}ms`);
    this.host.classList.add('is-holding');
    this.holdTimer = setTimeout(() => this.grip(), this.holdDuration);
  };

  private onTouchMove = (event: TouchEvent): void => {
    if (!this.touchOrigin || this.isGripped) {
      return;
    }
    const touch = event.touches[0];
    const travelled = Math.abs(touch.clientX - this.touchOrigin.x) + Math.abs(touch.clientY - this.touchOrigin.y);
    if (travelled >= SCROLL_TOLERANCE_PX) {
      // The finger is scrolling the page, not holding on to this element.
      this.release();
    }
  };

  private onTouchEnd = (): void => {
    if (this.isGripped) {
      // A grip that ends without a move is a cancelled move, not a tap on the slot.
      this.swallowClickUntil = Date.now() + CLICK_SWALLOW_MS;
    }
    this.release();
  };

  private onContextMenu = (event: Event): void => {
    if (this.touchOrigin) {
      event.preventDefault();
    }
  };

  private onClick = (event: Event): void => {
    if (Date.now() > this.swallowClickUntil) {
      return;
    }
    this.swallowClickUntil = 0;
    event.stopImmediatePropagation();
    event.preventDefault();
  };

  private grip(): void {
    this.holdTimer = null;
    this.isGripped = true;
    this.host.classList.remove('is-holding');
    this.host.classList.add('is-gripped');
    navigator.vibrate?.(12);
    this.zone.run(() => this.host.dispatchEvent(new CustomEvent(HOLD_ARMED_EVENT, {bubbles: true})));
  }

  private release(): void {
    if (this.holdTimer !== null) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
    this.touchOrigin = null;
    this.isGripped = false;
    this.host.classList.remove('is-holding', 'is-gripped');
  }

  private on<K extends keyof HTMLElementEventMap>(
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions
  ): void {
    this.host.addEventListener(type, listener as EventListener, options);
    this.teardown.push(() => this.host.removeEventListener(type, listener as EventListener, options));
  }
}
