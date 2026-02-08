'use client';

import { useTrip } from '@/components/providers/TripProvider';

export default function StatusBar() {
  const { status, statusError } = useTrip();

  return (
    <div
      className="absolute bottom-3 left-3 flex items-center gap-1.5 px-3 py-1.5 bg-card-glass backdrop-blur-sm rounded-[10px] border border-border shadow-sm text-[0.78rem] text-foreground-secondary max-w-[calc(100%-24px)] z-10"
      role="status"
    >
      <span
        className={`w-[7px] h-[7px] rounded-full shrink-0 ${statusError ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.4)]' : 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)] animate-[statusPulse_2.5s_ease-in-out_infinite]'}`}
      />
      <span style={{ color: statusError ? '#e11d48' : undefined }}>{status}</span>
    </div>
  );
}
