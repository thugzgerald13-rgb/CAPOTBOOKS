import React, { Suspense } from 'react';
import type { ComponentType } from 'react';
import { PageSkeleton } from './ui/Skeleton';
import { getAssignedVariantId, resolveComponentVariant, useUiVariants } from '../lib/uiVariants';

/**
 * If a customized variant throws while rendering, show the universal UI instead
 * of blanking the page — a broken custom page must never lock a client out.
 */
class VariantBoundary extends React.Component<
  { slot: string; variantId: string; fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.error(`[ui-variants] "${this.props.slot}" variant "${this.props.variantId}" crashed; showing the universal UI.`, error);
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

interface SwappableProps<P extends object> {
  /** Slot id from SWAPPABLE_SLOTS, e.g. "page.sales". */
  slot: string;
  /** The universal component currently used in this place. */
  Universal: ComponentType<P>;
  /** Props passed to whichever component renders (universal or custom). */
  componentProps?: P;
}

/**
 * Renders the universal component, or the customized variant the developer
 * assigned to the signed-in user / their plan for this slot.
 *
 *   <Swappable slot="page.sales" Universal={Sales} />
 *
 * Works for pages and for any in-page feature/section you add to SWAPPABLE_SLOTS.
 * The variant receives the same props plus `Universal`, so it can wrap or extend
 * the default instead of re-implementing it.
 */
export function Swappable<P extends object = {}>({ slot, Universal, componentProps }: SwappableProps<P>) {
  const ready = useUiVariants();
  const props = (componentProps ?? {}) as P;

  // Wait for the (small) assignment lookup so users never see the universal page
  // flash and then get swapped, which would remount it and lose its state.
  if (!ready) return <PageSkeleton />;

  const variant = resolveComponentVariant(slot);
  const universal = <Universal {...props} />;
  if (!variant) return universal;

  const Custom = variant.Component;
  return (
    <VariantBoundary key={`${slot}:${getAssignedVariantId(slot)}`} slot={slot} variantId={variant.id} fallback={universal}>
      <Suspense fallback={<PageSkeleton />}>
        <Custom {...props} Universal={Universal} />
      </Suspense>
    </VariantBoundary>
  );
}
