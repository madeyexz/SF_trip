'use client';

import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useTrip } from '@/components/providers/TripProvider';
import { formatDate, formatMinuteLabel, formatHour } from '@/lib/helpers';
import { PLAN_HOUR_HEIGHT, PLAN_MINUTE_HEIGHT } from '@/lib/planner-helpers';

export default function PlannerItinerary() {
  const {
    selectedDate, travelMode, setTravelMode,
    dayPlanItems, activePlanId,
    routeSummary, isRouteUpdating,
    clearDayPlan, startPlanDrag, removePlanItem,
    handleExportPlannerIcs, handleAddDayPlanToGoogleCalendar
  } = useTrip();

  const routeSummaryText =
    routeSummary || (selectedDate && dayPlanItems.length ? 'Waiting for routable stops...' : 'Add stops to draw route');

  return (
    <div className="flex flex-col p-3 min-h-0 h-full overflow-hidden">
      <div className="flex items-start justify-between gap-2 mb-2.5 flex-wrap">
        <div>
          <h2 className="m-0 text-base font-bold tracking-tight">{selectedDate ? formatDate(selectedDate) : 'No date selected'}</h2>
          <div className="flex gap-1.5 items-center mt-1">
            <Select value={travelMode} onValueChange={setTravelMode}>
              <SelectTrigger id="travel-mode" className="min-h-[30px] min-w-[110px]">
                <SelectValue placeholder="Travel mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRIVING">Driving</SelectItem>
                <SelectItem value="TRANSIT">Transit</SelectItem>
                <SelectItem value="WALKING">Walking</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button type="button" size="sm" variant="secondary" onClick={clearDayPlan} disabled={!selectedDate || dayPlanItems.length === 0}>Clear</Button>
          <Button type="button" size="sm" variant="secondary" onClick={handleExportPlannerIcs} disabled={!selectedDate || dayPlanItems.length === 0}>.ics</Button>
          <Button type="button" size="sm" variant="secondary" onClick={handleAddDayPlanToGoogleCalendar} disabled={!selectedDate || dayPlanItems.length === 0}>GCal</Button>
        </div>
      </div>

      {selectedDate ? (
        <div className="planner-calendar">
          <div className="planner-time-grid">
            {Array.from({ length: 24 }, (_, hour) => (
              <div className="planner-hour-row" key={hour} style={{ top: `${hour * PLAN_HOUR_HEIGHT}px` }}>
                <span className="planner-hour-label">{formatHour(hour)}</span>
              </div>
            ))}
          </div>
          <div className="planner-block-layer">
            {dayPlanItems.map((item) => {
              const top = item.startMinutes * PLAN_MINUTE_HEIGHT;
              const height = Math.max(28, (item.endMinutes - item.startMinutes) * PLAN_MINUTE_HEIGHT);
              const itemClass = [
                'planner-item',
                item.kind === 'event' ? 'planner-item-event' : 'planner-item-place',
                activePlanId === item.id ? 'planner-item-active' : ''
              ].filter(Boolean).join(' ');

              return (
                <article className={itemClass} key={item.id} style={{ top: `${top}px`, height: `${height}px` }} onPointerDown={(e) => startPlanDrag(e, item, 'move')}>
                  <button type="button" className="absolute left-0 right-0 top-0 h-2 border-none bg-transparent cursor-ns-resize" aria-label="Adjust start time" onPointerDown={(e) => startPlanDrag(e, item, 'resize-start')} />
                  <button type="button" className="absolute top-1 right-1.5 border-none bg-transparent text-slate-600 text-base leading-none cursor-pointer hover:text-slate-900" aria-label="Remove from plan" onClick={(e) => { e.stopPropagation(); removePlanItem(item.id); }}>x</button>
                  <div className="text-[0.72rem] font-bold text-gray-800 tracking-wide">{formatMinuteLabel(item.startMinutes)} - {formatMinuteLabel(item.endMinutes)}</div>
                  <div className="mt-0.5 text-[0.82rem] font-bold text-slate-900 leading-tight break-words">{item.title}</div>
                  {item.locationText ? <div className="mt-0.5 text-[0.72rem] text-slate-700 leading-tight break-words">{item.locationText}</div> : null}
                  <button type="button" className="absolute left-0 right-0 bottom-0 h-2 border-none bg-transparent cursor-ns-resize" aria-label="Adjust end time" onPointerDown={(e) => startPlanDrag(e, item, 'resize-end')} />
                </article>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="my-3 text-muted text-sm text-center p-7 bg-bg-subtle rounded-[10px] border border-dashed border-border">Pick a date from the left to start planning.</p>
      )}

      <div className="mt-2.5 shrink-0 flex items-center gap-1.5 flex-wrap p-2 border border-border rounded-[10px] bg-bg-subtle text-foreground-secondary text-[0.8rem]" role="status" aria-live="polite">
        <strong>Route:</strong> {routeSummaryText}
        {isRouteUpdating ? <span className="inline-flex items-center ml-2 text-[0.78rem] font-semibold text-accent before:content-[''] before:w-1.5 before:h-1.5 before:rounded-full before:bg-current before:mr-1.5 before:animate-[statusPulse_1.1s_ease-in-out_infinite]">Updating...</span> : null}
      </div>
    </div>
  );
}
