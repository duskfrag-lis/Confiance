import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

const MAX_STAGGER = 8;

@Directive({ selector: '[appScrollReveal]' })
export class ScrollReveal {
  private readonly host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
  private observer?: IntersectionObserver;

  constructor() {
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || typeof IntersectionObserver === 'undefined') return;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('sr-in');
          this.observer?.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );

    afterNextRender(() => this.scan());

    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => requestAnimationFrame(() => this.scan()));

    inject(DestroyRef).onDestroy(() => this.observer?.disconnect());
  }

  private scan(): void {
    for (const section of Array.from(this.host.querySelectorAll('section'))) {
      if (section.closest('dialog')) continue;

      for (const child of Array.from(section.children) as HTMLElement[]) {
        if (child.tagName === 'SECTION' || child.classList.contains('sr') || child.hasAttribute('data-no-reveal')) continue;

        const items = Array.from(child.children) as HTMLElement[];
        const display = getComputedStyle(child).display;
        const isGroup = items.length > 2 && (display.includes('grid') || display.includes('flex'));

        if (isGroup) {
          child.classList.add('sr-group');
          items.forEach((item, i) => this.watch(item, Math.min(i, MAX_STAGGER)));
        } else {
          this.watch(child, 0);
        }
      }
    }
  }

  private watch(el: HTMLElement, index: number): void {
    if (el.classList.contains('sr')) return;
    el.style.setProperty('--sr-i', String(index));
    el.classList.add('sr');
    this.observer!.observe(el);
  }
}
