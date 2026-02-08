'use client';

import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useTrip } from '@/components/providers/TripProvider';
import { AlertTriangle } from 'lucide-react';
import { formatDate, formatMinuteLabel, formatHour } from '@/lib/helpers';
import { PLAN_HOUR_HEIGHT, PLAN_MINUTE_HEIGHT, buildGoogleCalendarItemUrl } from '@/lib/planner-helpers';

function computeOverlapColumns(items) {
  const sorted = [...items].sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
  const overlaps = (a, b) => a.startMinutes < b.endMinutes && a.endMinutes > b.startMinutes;

  const groups = [];
  for (const item of sorted) {
    let merged = null;
    for (const group of groups) {
      if (group.some((g) => overlaps(item, g))) {
        group.push(item);
        merged = group;
        break;
      }
    }
    if (!merged) groups.push([item]);
  }

  const columns = new Map();
  const totalCols = new Map();
  for (const group of groups) {
    if (group.length === 1) {
      columns.set(group[0].id, 0);
      totalCols.set(group[0].id, 1);
      continue;
    }
    const cols = [];
    for (const item of group) {
      let col = 0;
      while (cols[col]?.some((g) => overlaps(item, g))) col++;
      if (!cols[col]) cols[col] = [];
      cols[col].push(item);
      columns.set(item.id, col);
    }
    for (const item of group) totalCols.set(item.id, cols.length);
  }

  return { columns, totalCols };
}

function getCollisions(items) {
  const collisions = new Set();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (items[i].startMinutes < items[j].endMinutes && items[i].endMinutes > items[j].startMinutes) {
        collisions.add(items[i].id);
        collisions.add(items[j].id);
      }
    }
  }
  return collisions;
}

export default function PlannerItinerary() {
  const {
    selectedDate, travelMode, setTravelMode,
    dayPlanItems, activePlanId, baseLocationText,
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
            {(() => {
              const { columns, totalCols } = computeOverlapColumns(dayPlanItems);
              const collisions = getCollisions(dayPlanItems);
              return dayPlanItems.map((item) => {
                const top = item.startMinutes * PLAN_MINUTE_HEIGHT;
                const height = Math.max(28, (item.endMinutes - item.startMinutes) * PLAN_MINUTE_HEIGHT);
                const col = columns.get(item.id) || 0;
                const total = totalCols.get(item.id) || 1;
                const widthPct = 100 / total;
                const leftPct = col * widthPct;
                const hasCollision = collisions.has(item.id);
                const itemClass = [
                  'planner-item',
                  item.kind === 'event' ? 'planner-item-event' : 'planner-item-place',
                  activePlanId === item.id ? 'planner-item-active' : ''
                ].filter(Boolean).join(' ');

                return (
                  <article className={itemClass} key={item.id} style={{ top: `${top}px`, height: `${height}px`, width: `${widthPct}%`, left: `${leftPct}%` }} onPointerDown={(e) => startPlanDrag(e, item, 'move')}>
                    <button type="button" className="absolute left-0 right-0 top-0 h-2 border-none bg-transparent cursor-ns-resize" aria-label="Adjust start time" onPointerDown={(e) => startPlanDrag(e, item, 'resize-start')} />
                    <div className="absolute top-1 right-1.5 flex items-center gap-1.5">
                      {hasCollision ? <AlertTriangle size={12} className="text-amber-500" title="Time conflict" /> : null}
                      <button type="button" className="px-1.5 py-0.5 rounded border border-slate-300 bg-white text-slate-600 text-[0.65rem] font-semibold leading-tight cursor-pointer hover:bg-blue-50 hover:border-blue-400 hover:text-blue-600 transition-colors" aria-label="Add to Google Calendar" onClick={(e) => { e.stopPropagation(); const url = buildGoogleCalendarItemUrl({ dateISO: selectedDate, item, baseLocationText }); window.open(url, '_blank', 'noopener,noreferrer'); }} title="Add to Google Calendar">+ GCal</button>
                      <button type="button" className="border-none bg-transparent text-slate-600 text-base leading-none cursor-pointer hover:text-slate-900" aria-label="Remove from plan" onClick={(e) => { e.stopPropagation(); removePlanItem(item.id); }}>x</button>
                    </div>
                    <div className="text-[0.72rem] font-bold text-gray-800 tracking-wide">{formatMinuteLabel(item.startMinutes)} - {formatMinuteLabel(item.endMinutes)}</div>
                    <div className="mt-0.5 text-[0.82rem] font-bold text-slate-900 leading-tight break-words">{item.title}</div>
                    {item.locationText ? <div className="mt-0.5 text-[0.72rem] text-slate-700 leading-tight break-words">{item.locationText}</div> : null}
                    <button type="button" className="absolute left-0 right-0 bottom-0 h-2 border-none bg-transparent cursor-ns-resize" aria-label="Adjust end time" onPointerDown={(e) => startPlanDrag(e, item, 'resize-end')} />
                  </article>
                );
              });
            })()}
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
