'use client';

import { useTrip } from '@/components/providers/TripProvider';

export default function StatusBar() {
  const {
    status,
    statusError,
    plannerPersistenceStatus,
    plannerPersistenceError,
    retryPlannerPersistence
  } = useTrip();
  const hasError = Boolean(statusError || plannerPersistenceError);
  const plannerStatusLabel = {
    loading: '[PLAN_LOADING]',
    saved: '[PLAN_SAVED]',
    unsaved: '[PLAN_UNSAVED]',
    saving: '[PLAN_SAVING]',
    error: '[PLAN_ERROR]'
  }[plannerPersistenceStatus as string];
  const plannerPending = ['loading', 'unsaved', 'saving'].includes(plannerPersistenceStatus);

  return (
    <div
      className="absolute bottom-3 left-3 flex flex-wrap items-center gap-1.5 px-3 py-1.5 bg-card-glass backdrop-blur-sm rounded-none border border-border text-[0.78rem] text-foreground-secondary max-w-[calc(100%-24px)] z-10 status-bar-responsive"
      role="status"
      aria-live="polite"
    >
      <span
        className={`w-[7px] h-[7px] shrink-0 ${hasError ? 'bg-[#FF4444]' : plannerPending ? 'bg-[#FF8800]' : 'bg-accent'}`}
      />
      <span style={{ color: hasError ? '#FF4444' : undefined }}>
        {plannerPersistenceError || status}
      </span>
      {plannerStatusLabel && !plannerPersistenceError && (
        <span className={plannerPending ? 'text-[#FF8800]' : 'text-accent'}>
          {plannerStatusLabel}
        </span>
      )}
      {plannerPersistenceError && (
        <button
          type="button"
          onClick={retryPlannerPersistence}
          className="border border-border px-2 py-1 text-foreground hover:border-accent focus-visible:outline focus-visible:outline-accent"
        >
          RETRY PLAN
        </button>
      )}
    </div>
  );
}
