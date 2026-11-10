import React from 'react';

export interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Base shimmering skeleton placeholder box with rounded edges
 */
export const SkeletonBase: React.FC<SkeletonProps> = ({ className = '', style }) => (
  <div
    className={`animate-shimmer rounded-lg ${className}`}
    style={style}
    aria-hidden="true"
  />
);

/**
 * Pitch Card Skeleton matching customer & admin pitch cards
 */
export const PitchCardSkeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`p-5 rounded-3xl border border-outline-variant/40 bg-white space-y-3.5 shadow-xs ${className}`}>
    {/* Top Header Badge & Checkmark Placeholder */}
    <div className="flex justify-between items-start">
      <div className="space-y-2">
        <SkeletonBase className="h-5 w-28 rounded-full" />
        <SkeletonBase className="h-5 w-48 rounded-md" />
      </div>
      <SkeletonBase className="w-6 h-6 rounded-full shrink-0" />
    </div>

    {/* Hours & Price Line */}
    <div className="flex items-center justify-between pt-1 border-t border-outline-variant/20">
      <SkeletonBase className="h-4 w-28 rounded-md" />
      <SkeletonBase className="h-5 w-24 rounded-md" />
    </div>

    {/* Weekend Box Placeholder */}
    <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1.5">
      <div className="flex justify-between items-center">
        <SkeletonBase className="h-3.5 w-24 rounded" />
        <div className="flex gap-2">
          <SkeletonBase className="h-4 w-16 rounded" />
          <SkeletonBase className="h-4 w-16 rounded" />
        </div>
      </div>
    </div>

    {/* Evening Peak Box Placeholder */}
    <div className="p-2.5 rounded-xl bg-surface-container-low border border-outline-variant/20 space-y-1.5">
      <div className="flex justify-between items-center">
        <SkeletonBase className="h-3.5 w-32 rounded" />
        <SkeletonBase className="h-4 w-20 rounded" />
      </div>
    </div>
  </div>
);

/**
 * Grid of Pitch Card Skeletons
 */
export const PitchGridSkeleton: React.FC<{ count?: number; className?: string }> = ({
  count = 3,
  className = ''
}) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <PitchCardSkeleton key={i} />
    ))}
  </div>
);

/**
 * Sport Selector Cards Skeleton
 */
export const SportCardsSkeleton: React.FC<{ count?: number; className?: string }> = ({
  count = 5,
  className = ''
}) => (
  <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="rounded-2xl border border-outline-variant/40 overflow-hidden bg-white shadow-xs">
        <SkeletonBase className="h-28 w-full rounded-none" />
        <div className="p-3 space-y-1.5">
          <SkeletonBase className="h-4 w-20 rounded" />
          <SkeletonBase className="h-3 w-28 rounded" />
          <SkeletonBase className="h-2.5 w-16 rounded" />
        </div>
      </div>
    ))}
  </div>
);

/**
 * 14-Day Date Strip Buttons Skeleton
 */
export const DateStripSkeleton: React.FC<{ count?: number; className?: string }> = ({
  count = 14,
  className = ''
}) => (
  <div className={`flex gap-2 overflow-x-auto pb-2 no-scrollbar ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="min-w-[72px] p-3 rounded-2xl border border-outline-variant/30 bg-white flex flex-col items-center justify-center gap-1.5 shrink-0"
      >
        <SkeletonBase className="h-2.5 w-8 rounded" />
        <SkeletonBase className="h-6 w-7 rounded-md" />
        <SkeletonBase className="h-2.5 w-7 rounded" />
      </div>
    ))}
  </div>
);

/**
 * Individual Slot Card Skeleton matching BookingSlotCard
 */
export const SlotCardSkeleton: React.FC<SkeletonProps> = ({ className = '' }) => (
  <div className={`p-3.5 rounded-2xl border border-outline-variant/40 bg-white space-y-2.5 shadow-xs ${className}`}>
    {/* Top Tag / Pill Placeholder */}
    <div className="flex justify-between items-center">
      <SkeletonBase className="h-3.5 w-14 rounded-full" />
      <SkeletonBase className="h-3.5 w-12 rounded-full" />
    </div>

    {/* Time Display Placeholder */}
    <div className="flex items-center gap-2 py-1">
      <SkeletonBase className="w-5 h-5 rounded-full shrink-0" />
      <SkeletonBase className="h-5 w-24 rounded-md" />
    </div>

    {/* Price & Book Button Placeholder */}
    <div className="flex justify-between items-center pt-2 border-t border-outline-variant/20">
      <SkeletonBase className="h-4 w-14 rounded" />
      <SkeletonBase className="h-6 w-16 rounded-lg" />
    </div>
  </div>
);

/**
 * Slot Grid Skeleton
 */
export const SlotGridSkeleton: React.FC<{ count?: number; className?: string }> = ({
  count = 10,
  className = ''
}) => (
  <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <SlotCardSkeleton key={i} />
    ))}
  </div>
);

/**
 * Calendar Table Skeleton for ScheduleCalendarView
 */
export const CalendarTableSkeleton: React.FC<{ rows?: number; columns?: number; className?: string }> = ({
  rows = 8,
  columns = 2,
  className = ''
}) => (
  <div className={`w-full bg-white rounded-2xl border border-outline-variant/40 overflow-hidden shadow-xs ${className}`}>
    {/* Table Header Placeholder */}
    <table className="w-full text-left border-collapse min-w-[700px]">
      <thead>
        <tr className="bg-surface-container-low border-b border-outline-variant/40">
          <th className="p-3 w-32 border-r border-outline-variant/40">
            <SkeletonBase className="h-4 w-16 mx-auto rounded" />
          </th>
          {Array.from({ length: columns }).map((_, i) => (
            <th key={i} className="p-3 border-r border-outline-variant/40 last:border-r-0">
              <SkeletonBase className="h-4 w-36 rounded mb-1" />
              <SkeletonBase className="h-3 w-20 rounded" />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r} className="border-b border-outline-variant/30">
            {/* Time Column Placeholder */}
            <td className="p-2.5 border-r border-outline-variant/40 bg-surface-container-low/30">
              <div className="flex items-center justify-center gap-2">
                <SkeletonBase className="w-6 h-6 rounded-lg shrink-0" />
                <SkeletonBase className="h-4 w-16 rounded" />
              </div>
            </td>
            {/* Court Column Cells */}
            {Array.from({ length: columns }).map((_, c) => (
              <td key={c} className="p-2 border-r border-outline-variant/30 last:border-r-0">
                <SkeletonBase className="w-full h-14 rounded-lg" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/**
 * Booking List Table Skeleton for BookingListView
 */
export const BookingTableSkeleton: React.FC<{ rows?: number; className?: string }> = ({
  rows = 6,
  className = ''
}) => (
  <div className={`w-full bg-white rounded-2xl border border-outline-variant/40 overflow-hidden shadow-xs ${className}`}>
    <div className="divide-y divide-outline-variant/30">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SkeletonBase className="w-10 h-10 rounded-full shrink-0" />
            <div className="space-y-1.5">
              <SkeletonBase className="h-4 w-36 rounded" />
              <SkeletonBase className="h-3 w-48 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SkeletonBase className="h-6 w-20 rounded-full" />
            <SkeletonBase className="h-5 w-16 rounded" />
            <SkeletonBase className="h-8 w-24 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/**
 * Full Customer Storefront Page Skeleton for initial loading
 */
export const CustomerPortalSkeleton: React.FC = () => (
  <div className="space-y-8 animate-fadeIn">
    {/* Venue Banner Skeleton */}
    <div className="rounded-3xl p-6 sm:p-10 border border-outline-variant/30 bg-white relative overflow-hidden space-y-4 shadow-sm">
      <SkeletonBase className="h-4 w-32 rounded-full" />
      <SkeletonBase className="h-8 w-72 rounded-lg" />
      <SkeletonBase className="h-4 w-96 rounded-md" />
      <div className="flex gap-3 pt-2">
        <SkeletonBase className="h-10 w-36 rounded-xl" />
        <SkeletonBase className="h-10 w-44 rounded-xl" />
      </div>
    </div>

    {/* Sports Skeleton */}
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <SkeletonBase className="h-6 w-32 rounded-md" />
        <SkeletonBase className="h-4 w-40 rounded" />
      </div>
      <SportCardsSkeleton count={5} />
    </div>

    {/* Pitch Skeletons */}
    <div className="space-y-4 pt-2">
      <div className="flex justify-between items-center">
        <SkeletonBase className="h-6 w-48 rounded-md" />
        <SkeletonBase className="h-5 w-28 rounded-full" />
      </div>
      <PitchGridSkeleton count={3} />
    </div>

    {/* Date Strip Skeleton */}
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <SkeletonBase className="h-5 w-36 rounded-md" />
        <SkeletonBase className="h-4 w-28 rounded" />
      </div>
      <DateStripSkeleton count={14} />
    </div>

    {/* Slots Skeleton */}
    <div className="bg-white rounded-3xl p-6 border border-outline-variant/50 shadow-sm space-y-4">
      <div className="flex justify-between items-center border-b border-outline-variant/30 pb-4">
        <SkeletonBase className="h-6 w-44 rounded-md" />
        <SkeletonBase className="h-5 w-24 rounded-full" />
      </div>
      <SlotGridSkeleton count={10} />
    </div>
  </div>
);
