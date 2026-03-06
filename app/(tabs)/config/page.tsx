'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useTrip } from '@/components/providers/TripProvider';
import { safeHostname } from '@/lib/helpers';

export default function ConfigPage() {
  const {
    authLoading, profile, isSigningOut, handleSignOut,
    groupedSources,
    newSourceType, setNewSourceType, newSourceUrl, setNewSourceUrl,
    newSourceLabel, setNewSourceLabel, isSavingSource, syncingSourceId,
    handleCreateSource, handleToggleSourceStatus, handleDeleteSource, handleSyncSource,
    tripStart, tripEnd, handleSaveTripDates,
    baseLocationText, handleSaveBaseLocation,
    showSharedPlaceRecommendations, handleSaveSharedPlaceRecommendations
  } = useTrip();

  const [localTripStart, setLocalTripStart] = useState(tripStart);
  const [localTripEnd, setLocalTripEnd] = useState(tripEnd);
  const [dateSaveState, setDateSaveState] = useState('idle');
  const [localBaseLocation, setLocalBaseLocation] = useState(baseLocationText);
  const [locationSaveState, setLocationSaveState] = useState('idle');
  const dateTimerRef = useRef<any>(null);
  const locationTimerRef = useRef<any>(null);

  useEffect(() => { setLocalTripStart(tripStart); }, [tripStart]);
  useEffect(() => { setLocalTripEnd(tripEnd); }, [tripEnd]);
  useEffect(() => { setLocalBaseLocation(baseLocationText); }, [baseLocationText]);

  const onSaveDates = async (event) => {
    event.preventDefault();
    setDateSaveState('saving');
    try {
      await handleSaveTripDates(localTripStart, localTripEnd);
      setDateSaveState('saved');
      clearTimeout(dateTimerRef.current);
      dateTimerRef.current = setTimeout(() => setDateSaveState('idle'), 2000);
    } catch {
      setDateSaveState('idle');
    }
  };

  const onSaveLocation = async (event) => {
    event.preventDefault();
    setLocationSaveState('saving');
    try {
      await handleSaveBaseLocation(localBaseLocation);
      setLocationSaveState('saved');
      clearTimeout(locationTimerRef.current);
      locationTimerRef.current = setTimeout(() => setLocationSaveState('idle'), 2000);
    } catch {
      setLocationSaveState('idle');
    }
  };

  const renderSourceCard = (source) => {
    const isEvent = source.sourceType === 'event';
    const isActive = source.status === 'active';
    const isSyncingThis = syncingSourceId === source.id;
    const displayTitle = source.label || safeHostname(source.url);
    const isReadonly = Boolean(source.readonly);

    return (
      <Card
        className={`p-3 ${source.status === 'paused' ? 'opacity-60' : ''}`}
        style={{ borderLeft: `2px solid ${isEvent ? '#ff8800' : '#00ff88'}` }}
        key={source.id || `${source.sourceType}-${source.url}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="m-0 text-[0.82rem] font-semibold uppercase tracking-wide text-foreground leading-snug">{displayTitle}</h4>
            <a className="block mt-1 text-muted text-[0.72rem] no-underline truncate hover:text-accent hover:underline" href={source.url} target="_blank" rel="noreferrer" title={source.url}>{source.url}</a>
          </div>
          <Badge variant={isActive ? 'default' : 'warning'} className="shrink-0 capitalize">
            {isActive ? 'active' : 'paused'}
          </Badge>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[0.7rem] text-muted">
          <span>{source.lastSyncedAt ? `Synced ${new Date(source.lastSyncedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })}` : 'Never synced'}</span>
          {source.lastError ? <span className="text-[#FF4444]">· {source.lastError}</span> : null}
          {source.readonly ? <span className="italic">· Read-only</span> : null}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button type="button" size="sm" variant="default" className="min-h-[26px] px-2 py-0.5 text-[0.7rem]" disabled={isSyncingThis || isReadonly} onClick={() => { void handleSyncSource(source); }}>
            {isSyncingThis ? <><RefreshCw size={10} className="animate-spin" />Syncing...</> : 'Sync'}
          </Button>
          <Button type="button" size="sm" variant="secondary" className="min-h-[26px] px-2 py-0.5 text-[0.7rem]" disabled={isReadonly} onClick={() => { void handleToggleSourceStatus(source); }}>
            {isActive ? 'Pause' : 'Resume'}
          </Button>
          <Button type="button" size="sm" variant="danger" className="min-h-[26px] px-2 py-0.5 text-[0.7rem]" disabled={isReadonly} onClick={() => { void handleDeleteSource(source); }}>
            Remove
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <section className="flex-1 min-h-0 overflow-y-auto bg-bg p-4 sm:p-8">
      <div className="w-full mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight uppercase" style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk'), sans-serif" }}>Account</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Signed in with magic link authentication.</p>
          </div>
          <div className="flex items-center gap-2 max-sm:w-full max-sm:flex-wrap">
            <Badge variant="default">
              {authLoading ? 'Loading...' : 'Personal'}
            </Badge>
            <Button type="button" size="sm" variant="secondary" className="max-sm:flex-1" disabled={isSigningOut || authLoading} onClick={() => { void handleSignOut(); }}>
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        </div>

        <Card className="p-3">
          <div className="text-sm font-semibold text-foreground">{profile?.email || 'No email returned'}</div>
        </Card>

        <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight uppercase" style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk'), sans-serif" }}>Trip Config</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Set your trip date range to populate the day planner.</p>
          </div>
        </div>
        <Card className="p-3">
          <form className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch" onSubmit={onSaveDates}>
            <label className="shrink-0 text-sm font-medium text-foreground-secondary">Start</label>
            <Input type="date" value={localTripStart} onChange={(event) => setLocalTripStart(event.target.value)} className="max-w-[180px] max-sm:max-w-none" />
            <label className="shrink-0 text-sm font-medium text-foreground-secondary">End</label>
            <Input type="date" value={localTripEnd} onChange={(event) => setLocalTripEnd(event.target.value)} className="max-w-[180px] max-sm:max-w-none" />
            <Button type="submit" size="sm" className="min-h-[36px] min-w-[80px] shrink-0 max-sm:w-full" disabled={dateSaveState === 'saving'}>
              {dateSaveState === 'saving' ? 'Saving...' : dateSaveState === 'saved' ? <><Check size={14} />Saved</> : 'Save'}
            </Button>
          </form>
        </Card>

        <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight uppercase" style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk'), sans-serif" }}>Base Location</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Your home base for travel time calculations and route planning.</p>
          </div>
        </div>
        <Card className="p-3">
          <form className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch" onSubmit={onSaveLocation}>
            <label className="shrink-0 text-sm font-medium text-foreground-secondary">Address</label>
            <Input type="text" value={localBaseLocation} onChange={(event) => setLocalBaseLocation(event.target.value)} placeholder="e.g. 1100 California St, San Francisco, CA 94108, United States" className="max-sm:max-w-none" />
            <Button type="submit" size="sm" className="min-h-[36px] min-w-[80px] shrink-0 max-sm:w-full" disabled={locationSaveState === 'saving'}>
              {locationSaveState === 'saving' ? 'Saving...' : locationSaveState === 'saved' ? <><Check size={14} />Saved</> : 'Save'}
            </Button>
          </form>
        </Card>

        <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight uppercase" style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk'), sans-serif" }}>Shared Recommendations</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Show or hide the shared Winston map recommendations for your account.</p>
          </div>
        </div>
        <Card className="p-3 flex items-start justify-between gap-4 max-sm:flex-col">
          <div className="min-w-0">
            <p className="m-0 text-sm font-semibold text-foreground uppercase tracking-wide">Winston Recommendations</p>
            <p className="mt-1 mb-0 text-[0.82rem] text-muted leading-relaxed">
              Shared across all users. Credit:{' '}
              <a className="text-accent no-underline hover:underline" href="https://x.com/hsu_winston" target="_blank" rel="noreferrer">
                @hsu_winston
              </a>
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0 max-sm:w-full">
            <Button
              type="button"
              size="sm"
              variant={showSharedPlaceRecommendations ? 'default' : 'secondary'}
              className="max-sm:flex-1"
              onClick={() => { void handleSaveSharedPlaceRecommendations(true); }}
            >
              On
            </Button>
            <Button
              type="button"
              size="sm"
              variant={!showSharedPlaceRecommendations ? 'danger' : 'secondary'}
              className="max-sm:flex-1"
              onClick={() => { void handleSaveSharedPlaceRecommendations(false); }}
            >
              Off
            </Button>
          </div>
        </Card>

        <div className="flex items-center justify-between gap-4 max-sm:flex-col max-sm:items-start">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight uppercase" style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk'), sans-serif" }}>Sources</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Manage personal event and spot feeds for this trip plan.</p>
          </div>
        </div>

        <form className="flex items-center gap-2 border border-border bg-card p-2.5 px-3 max-sm:flex-col max-sm:items-stretch" onSubmit={handleCreateSource}>
          <Select value={newSourceType} onValueChange={setNewSourceType}>
            <SelectTrigger className="min-h-[36px] w-[120px] shrink-0 max-sm:w-full">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="event">Event</SelectItem>
              <SelectItem value="spot">Spot</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="https://example.com/source" value={newSourceUrl} onChange={(event) => setNewSourceUrl(event.target.value)} />
          <Input className="max-w-[160px] max-sm:max-w-none" placeholder="Label (optional)" value={newSourceLabel} onChange={(event) => setNewSourceLabel(event.target.value)} />
          <Button type="submit" size="sm" className="min-h-[36px] min-w-[100px] shrink-0 max-sm:w-full" disabled={isSavingSource}>
            {isSavingSource ? 'Adding...' : 'Add Source'}
          </Button>
        </form>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {[
            { key: 'event', title: 'Events', dotColor: 'bg-accent' },
            { key: 'spot', title: 'Spots', dotColor: 'bg-accent' }
          ].map((group) => (
            <section className="flex flex-col" key={group.key}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="m-0 text-[0.78rem] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <span className={`inline-block w-[7px] h-[7px] ${group.dotColor}`} />
                  {group.title}
                </h3>
                <Badge variant="secondary" className="text-[0.68rem] tabular-nums">{groupedSources[group.key].length}</Badge>
              </div>
              {groupedSources[group.key].length === 0 ? (
                <p className="border border-dashed border-border p-5 text-center text-muted text-[0.82rem] bg-bg-subtle">No {group.key} sources yet.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {groupedSources[group.key].map((source) => renderSourceCard(source))}
                </div>
              )}
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
