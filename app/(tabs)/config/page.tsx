'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useTrip } from '@/components/providers/TripProvider';

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

  return (
    <section className="flex-1 min-h-0 overflow-y-auto p-8 max-sm:p-4 bg-bg">
      <div className="w-full mx-auto flex flex-col gap-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight uppercase" style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk'), sans-serif" }}>Account</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Signed in with magic link authentication.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={canManageGlobal ? 'default' : 'secondary'}>
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
            <h2 className="m-0 text-xl font-extrabold tracking-tight uppercase" style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk'), sans-serif" }}>Pair Planner</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Personal mode shows only your plans. Pair mode shows both people, and you can edit only yours.</p>
          </div>
        </div>
        <Card className="p-3 flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={currentPairRoomId ? 'default' : 'secondary'}>
              {currentPairRoomId ? `Pair room: ${currentPairRoomId}` : 'Personal planner'}
            </Badge>
            {currentPairRoomId ? (
              <Badge variant="secondary">{pairMemberCount} member{pairMemberCount === 1 ? '' : 's'}</Badge>
            ) : null}
            {pairSaveState === 'saved' ? <Badge variant="default"><Check size={12} />Saved</Badge> : null}
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
            <Button type="submit" size="sm" className="min-h-[36px] min-w-[100px] shrink-0" disabled={isPairActionPending || pairSaveState === 'saving'}>
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
            <h2 className="m-0 text-xl font-extrabold tracking-tight uppercase" style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk'), sans-serif" }}>Trip Config</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Set your trip date range to populate the day planner.</p>
          </div>
        </div>
        <Card className="p-3">
          <form className="flex items-center gap-2 max-sm:flex-col" onSubmit={onSaveDates}>
            <label className="text-sm font-medium text-foreground-secondary shrink-0">Start</label>
            <Input type="date" value={localTripStart} onChange={(event) => setLocalTripStart(event.target.value)} className="max-w-[180px] max-sm:max-w-none" />
            <label className="text-sm font-medium text-foreground-secondary shrink-0">End</label>
            <Input type="date" value={localTripEnd} onChange={(event) => setLocalTripEnd(event.target.value)} className="max-w-[180px] max-sm:max-w-none" />
            <Button type="submit" size="sm" className="min-h-[36px] min-w-[80px] shrink-0" disabled={dateSaveState === 'saving'}>
              {dateSaveState === 'saving' ? 'Saving...' : dateSaveState === 'saved' ? <><Check size={14} />Saved</> : 'Save'}
            </Button>
          </form>
        </Card>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight uppercase" style={{ fontFamily: "var(--font-space-grotesk, 'Space Grotesk'), sans-serif" }}>Base Location</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Your home base for travel time calculations and route planning.</p>
          </div>
        </div>
        <Card className="p-3">
          <form className="flex items-center gap-2 max-sm:flex-col" onSubmit={onSaveLocation}>
            <label className="text-sm font-medium text-foreground-secondary shrink-0">Address</label>
            <Input type="text" value={localBaseLocation} onChange={(event) => setLocalBaseLocation(event.target.value)} placeholder="e.g. 1100 California St, San Francisco, CA 94108, United States" className="max-sm:max-w-none" />
            <Button type="submit" size="sm" className="min-h-[36px] min-w-[80px] shrink-0" disabled={locationSaveState === 'saving'}>
              {locationSaveState === 'saving' ? 'Saving...' : locationSaveState === 'saved' ? <><Check size={14} />Saved</> : 'Save'}
            </Button>
          </form>
        </Card>

        <Card className="p-3">
          <p className="m-0 text-[0.82rem] text-muted">
            Event and spot sources are configured via environment defaults in this build.
          </p>
        </Card>
      </div>
    </section>
  );
}
