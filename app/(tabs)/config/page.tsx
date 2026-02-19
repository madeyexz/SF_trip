'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useTrip } from '@/components/providers/TripProvider';
import { safeHostname } from '@/lib/helpers';

function normalizePlannerRoomId(value) {
  const nextValue = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (nextValue.length < 2 || nextValue.length > 64) {
    return '';
  }
  return nextValue;
}

export default function ConfigPage() {
  const {
    authLoading, profile, canManageGlobal, isSigningOut, handleSignOut,
    currentPairRoomId, pairRooms, pairMemberCount,
    isPairActionPending, handleUsePersonalPlanner, handleCreatePairRoom, handleJoinPairRoom, handleSelectPairRoom,
    groupedSources,
    newSourceType, setNewSourceType, newSourceUrl, setNewSourceUrl,
    newSourceLabel, setNewSourceLabel, isSavingSource, syncingSourceId,
    handleCreateSource, handleToggleSourceStatus, handleDeleteSource, handleSyncSource,
    tripStart, tripEnd, handleSaveTripDates,
    baseLocationText, handleSaveBaseLocation,
    setStatusMessage
  } = useTrip();

  const [roomCodeInput, setRoomCodeInput] = useState(currentPairRoomId);
  const [pairSaveState, setPairSaveState] = useState('idle');
  const [localTripStart, setLocalTripStart] = useState(tripStart);
  const [localTripEnd, setLocalTripEnd] = useState(tripEnd);
  const [dateSaveState, setDateSaveState] = useState('idle');
  const [localBaseLocation, setLocalBaseLocation] = useState(baseLocationText);
  const [locationSaveState, setLocationSaveState] = useState('idle');
  const pairTimerRef = useRef<any>(null);
  const dateTimerRef = useRef<any>(null);
  const locationTimerRef = useRef<any>(null);

  useEffect(() => { setLocalTripStart(tripStart); }, [tripStart]);
  useEffect(() => { setLocalTripEnd(tripEnd); }, [tripEnd]);
  useEffect(() => { setLocalBaseLocation(baseLocationText); }, [baseLocationText]);
  useEffect(() => {
    if (!currentPairRoomId) {
      setRoomCodeInput('');
    }
  }, [currentPairRoomId]);

  const onCopyRoomCode = async () => {
    if (!currentPairRoomId || !navigator?.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(currentPairRoomId);
      setStatusMessage(`Copied room code "${currentPairRoomId}".`);
    } catch {
      setStatusMessage('Could not copy room code. Copy it manually.', true);
    }
  };

  const onJoinRoom = async (event) => {
    event.preventDefault();
    const normalizedRoomCode = normalizePlannerRoomId(roomCodeInput);
    if (!normalizedRoomCode) {
      setStatusMessage('Room code is required (2-64 chars: a-z, 0-9, _ or -).', true);
      return;
    }
    setPairSaveState('saving');
    const joined = await handleJoinPairRoom(normalizedRoomCode);
    if (joined) {
      setRoomCodeInput(normalizedRoomCode);
      setPairSaveState('saved');
      clearTimeout(pairTimerRef.current);
      pairTimerRef.current = setTimeout(() => setPairSaveState('idle'), 2000);
      return;
    }
    setPairSaveState('idle');
  };

  const onCreateRoom = async () => {
    setPairSaveState('saving');
    const roomCode = await handleCreatePairRoom();
    if (roomCode) {
      setRoomCodeInput(roomCode);
      setPairSaveState('saved');
      clearTimeout(pairTimerRef.current);
      pairTimerRef.current = setTimeout(() => setPairSaveState('idle'), 2000);
      return;
    }
    setPairSaveState('idle');
  };

  const onUsePersonal = () => {
    handleUsePersonalPlanner();
    setRoomCodeInput('');
    setPairSaveState('saved');
    clearTimeout(pairTimerRef.current);
    pairTimerRef.current = setTimeout(() => setPairSaveState('idle'), 2000);
  };

  const onSelectSavedRoom = (roomCode) => {
    const normalizedRoomCode = normalizePlannerRoomId(roomCode);
    if (!normalizedRoomCode) return;
    handleSelectPairRoom(normalizedRoomCode);
    setRoomCodeInput(normalizedRoomCode);
    setPairSaveState('saved');
    clearTimeout(pairTimerRef.current);
    pairTimerRef.current = setTimeout(() => setPairSaveState('idle'), 2000);
  };

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
    const isReadonly = Boolean(source.readonly) || !canManageGlobal;

    return (
      <Card
        className={`p-3 transition-all duration-150 hover:border-border-hover hover:shadow-[0_1px_4px_rgba(12,18,34,0.05)] ${source.status === 'paused' ? 'opacity-60' : ''}`}
        style={{ borderLeft: `3px solid ${isEvent ? 'rgba(59,108,245,0.5)' : 'rgba(13,148,136,0.5)'}` }}
        key={source.id || `${source.sourceType}-${source.url}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h4 className="m-0 text-[0.86rem] font-bold text-foreground leading-snug">{displayTitle}</h4>
            <a className="block mt-0.5 text-muted text-[0.72rem] no-underline truncate hover:text-accent hover:underline" href={source.url} target="_blank" rel="noreferrer" title={source.url}>{source.url}</a>
          </div>
          <Badge variant={isActive ? 'default' : 'secondary'} className={`shrink-0 gap-1 capitalize ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.5)]' : 'bg-amber-500'}`} />
            {source.status}
          </Badge>
        </div>
        <div className="flex items-center gap-1.5 mt-1.5 text-muted text-[0.7rem]">
          <span>{source.lastSyncedAt ? `Synced ${new Date(source.lastSyncedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })}` : 'Never synced'}</span>
          {source.lastError ? <span className="text-rose-600">· {source.lastError}</span> : null}
          {source.readonly ? <span className="italic">· Read-only</span> : null}
        </div>
        <div className="flex gap-1.5 mt-2">
          <Button type="button" size="sm" variant="default" className="text-[0.7rem] min-h-[26px] px-2 py-0.5" disabled={isSyncingThis || isReadonly} onClick={() => { void handleSyncSource(source); }}>
            {isSyncingThis ? <><RefreshCw size={10} className="animate-spin" />Syncing...</> : 'Sync'}
          </Button>
          <Button type="button" size="sm" variant="secondary" className="text-[0.7rem] min-h-[26px] px-2 py-0.5" disabled={isReadonly} onClick={() => { void handleToggleSourceStatus(source); }}>
            {isActive ? 'Pause' : 'Resume'}
          </Button>
          <Button type="button" size="sm" variant="secondary" className="text-[0.7rem] min-h-[26px] px-2 py-0.5 border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:border-rose-300 hover:text-rose-700" disabled={isReadonly} onClick={() => { void handleDeleteSource(source); }}>
            Remove
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <section className="flex-1 min-h-0 overflow-y-auto p-8 max-sm:p-4 bg-bg">
      <div className="w-full mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight">Account</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Signed in with magic link authentication.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className={canManageGlobal ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}>
              {authLoading ? 'Loading...' : canManageGlobal ? 'Owner' : 'Member'}
            </Badge>
            <Button type="button" size="sm" variant="secondary" disabled={isSigningOut || authLoading} onClick={() => { void handleSignOut(); }}>
              {isSigningOut ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        </div>
        <Card className="p-3">
          <div className="flex items-center justify-between gap-3 max-sm:flex-col max-sm:items-start">
            <div>
              <div className="text-sm font-semibold text-foreground">{profile?.email || 'No email returned'}</div>
              <div className="text-[0.78rem] text-muted">User ID: {profile?.userId || 'Unknown'}</div>
            </div>
          </div>
        </Card>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight">Pair Planner</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Personal mode shows only your plans. Pair mode shows both people, and you can edit only yours.</p>
          </div>
        </div>
        <Card className="p-3 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={currentPairRoomId ? 'default' : 'secondary'} className={currentPairRoomId ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'}>
              {currentPairRoomId ? `Pair room: ${currentPairRoomId}` : 'Personal planner'}
            </Badge>
            {currentPairRoomId ? (
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">{pairMemberCount} member{pairMemberCount === 1 ? '' : 's'}</Badge>
            ) : null}
            {pairSaveState === 'saved' ? <Badge variant="secondary" className="bg-emerald-50 text-emerald-700"><Check size={12} />Saved</Badge> : null}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button type="button" size="sm" variant="secondary" onClick={onUsePersonal} disabled={isPairActionPending || !currentPairRoomId}>Use Personal</Button>
            <Button type="button" size="sm" onClick={() => { void onCreateRoom(); }} disabled={isPairActionPending}>
              {isPairActionPending ? 'Working...' : 'Create Pair Room'}
            </Button>
            {currentPairRoomId ? (
              <Button type="button" size="sm" variant="secondary" onClick={() => { void onCopyRoomCode(); }}>
                <Copy size={12} />
                Copy Room Code
              </Button>
            ) : null}
          </div>

          <form className="flex items-center gap-2 max-sm:flex-col" onSubmit={onJoinRoom}>
            <Input type="text" value={roomCodeInput} onChange={(event) => setRoomCodeInput(event.target.value)} placeholder="Enter room code" />
            <Button type="submit" size="sm" className="min-h-[36px] rounded-lg min-w-[100px] shrink-0" disabled={isPairActionPending || pairSaveState === 'saving'}>
              {pairSaveState === 'saving' ? 'Joining...' : 'Join Room'}
            </Button>
          </form>

          {pairRooms.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="m-0 text-[0.78rem] font-bold uppercase tracking-wider text-muted">Your Pair Rooms</h3>
              <div className="flex gap-2 flex-wrap">
                {pairRooms.map((room) => {
                  const roomCode = normalizePlannerRoomId(room?.roomCode);
                  if (!roomCode) return null;
                  const isActiveRoom = roomCode === currentPairRoomId;
                  return (
                    <Button
                      key={roomCode}
                      type="button"
                      size="sm"
                      variant={isActiveRoom ? 'default' : 'secondary'}
                      onClick={() => onSelectSavedRoom(roomCode)}
                    >
                      {roomCode} ({Number(room?.memberCount) || 1})
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </Card>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight">Trip Config</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Set your trip date range to populate the day planner.</p>
          </div>
        </div>
        <Card className="p-3">
          <form className="flex items-center gap-2 max-sm:flex-col" onSubmit={onSaveDates}>
            <label className="text-sm font-medium text-foreground-secondary shrink-0">Start</label>
            <Input type="date" value={localTripStart} onChange={(event) => setLocalTripStart(event.target.value)} className="max-w-[180px] max-sm:max-w-none" />
            <label className="text-sm font-medium text-foreground-secondary shrink-0">End</label>
            <Input type="date" value={localTripEnd} onChange={(event) => setLocalTripEnd(event.target.value)} className="max-w-[180px] max-sm:max-w-none" />
            <Button type="submit" size="sm" className="min-h-[36px] rounded-lg min-w-[80px] shrink-0" disabled={!canManageGlobal || dateSaveState === 'saving'}>
              {dateSaveState === 'saving' ? 'Saving...' : dateSaveState === 'saved' ? <><Check size={14} />Saved</> : 'Save'}
            </Button>
          </form>
          {!canManageGlobal ? <p className="mt-2 mb-0 text-xs text-muted">Owner role required.</p> : null}
        </Card>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight">Base Location</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Your home base for travel time calculations and route planning.</p>
          </div>
        </div>
        <Card className="p-3">
          <form className="flex items-center gap-2 max-sm:flex-col" onSubmit={onSaveLocation}>
            <label className="text-sm font-medium text-foreground-secondary shrink-0">Address</label>
            <Input type="text" value={localBaseLocation} onChange={(event) => setLocalBaseLocation(event.target.value)} placeholder="e.g. 1100 California St, San Francisco, CA 94108, United States" className="max-sm:max-w-none" />
            <Button type="submit" size="sm" className="min-h-[36px] rounded-lg min-w-[80px] shrink-0" disabled={!canManageGlobal || locationSaveState === 'saving'}>
              {locationSaveState === 'saving' ? 'Saving...' : locationSaveState === 'saved' ? <><Check size={14} />Saved</> : 'Save'}
            </Button>
          </form>
          {!canManageGlobal ? <p className="mt-2 mb-0 text-xs text-muted">Owner role required.</p> : null}
        </Card>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight">Sources</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Manage your event and spot feeds.</p>
          </div>
        </div>

        <form className="flex items-center gap-2 p-2.5 px-3 bg-card border border-border rounded-xl max-sm:flex-col" onSubmit={handleCreateSource}>
          <Select value={newSourceType} onValueChange={setNewSourceType}>
            <SelectTrigger className="min-h-[36px] w-[120px] shrink-0 rounded-lg">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="event">Event</SelectItem>
              <SelectItem value="spot">Spot</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="https://example.com/source" value={newSourceUrl} onChange={(event) => setNewSourceUrl(event.target.value)} />
          <Input className="max-w-[160px] max-sm:max-w-none" placeholder="Label (optional)" value={newSourceLabel} onChange={(event) => setNewSourceLabel(event.target.value)} />
          <Button type="submit" size="sm" className="min-h-[36px] rounded-lg min-w-[100px] shrink-0 max-sm:w-full" disabled={!canManageGlobal || isSavingSource}>
            {isSavingSource ? 'Adding...' : 'Add Source'}
          </Button>
        </form>
        {!canManageGlobal ? <p className="mt-1 mb-0 text-xs text-muted">Owner role required to add/edit/delete sources.</p> : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '20px' }}>
          {[
            { key: 'event', title: 'Events', dotColor: 'bg-accent' },
            { key: 'spot', title: 'Spots', dotColor: 'bg-teal-600' }
          ].map((group) => (
            <section className="flex flex-col" key={group.key}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="m-0 text-[0.78rem] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <span className={`inline-block w-[7px] h-[7px] rounded-full ${group.dotColor}`} />
                  {group.title}
                </h3>
                <Badge variant="secondary" className="text-[0.68rem] tabular-nums">{groupedSources[group.key].length}</Badge>
              </div>
              {groupedSources[group.key].length === 0 ? (
                <p className="border border-dashed border-border rounded-[10px] p-5 text-center text-muted text-[0.82rem] bg-bg-subtle">No {group.key} sources yet.</p>
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
