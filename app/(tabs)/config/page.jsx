'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw, Check } from 'lucide-react';
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
    groupedSources,
    newSourceType, setNewSourceType, newSourceUrl, setNewSourceUrl,
    newSourceLabel, setNewSourceLabel, isSavingSource, syncingSourceId,
    handleCreateSource, handleToggleSourceStatus, handleDeleteSource, handleSyncSource,
    tripStart, tripEnd, handleSaveTripDates,
    baseLocationText, handleSaveBaseLocation,
    authConfigured, isAdminAuthenticated, handleAdminLogin, handleAdminLogout,
    plannerMode, sharedPlannerRoomId, applyPlannerSettings, setStatusMessage
  } = useTrip();

  const canManageGlobal = authConfigured && isAdminAuthenticated;
  const [adminPassword, setAdminPassword] = useState('');
  const [authSaveState, setAuthSaveState] = useState('idle');
  const [localPlannerMode, setLocalPlannerMode] = useState(plannerMode);
  const [localSharedRoomId, setLocalSharedRoomId] = useState(sharedPlannerRoomId);
  const [plannerSaveState, setPlannerSaveState] = useState('idle');
  const [localTripStart, setLocalTripStart] = useState(tripStart);
  const [localTripEnd, setLocalTripEnd] = useState(tripEnd);
  const [dateSaveState, setDateSaveState] = useState('idle');
  const [localBaseLocation, setLocalBaseLocation] = useState(baseLocationText);
  const [locationSaveState, setLocationSaveState] = useState('idle');
  const authTimerRef = useRef(null);
  const plannerTimerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const locationTimerRef = useRef(null);

  useEffect(() => { setLocalPlannerMode(plannerMode); }, [plannerMode]);
  useEffect(() => { setLocalSharedRoomId(sharedPlannerRoomId); }, [sharedPlannerRoomId]);
  useEffect(() => { setLocalTripStart(tripStart); }, [tripStart]);
  useEffect(() => { setLocalTripEnd(tripEnd); }, [tripEnd]);
  useEffect(() => { setLocalBaseLocation(baseLocationText); }, [baseLocationText]);

  const onUnlockAdmin = async (e) => {
    e.preventDefault();
    if (!authConfigured) {
      setStatusMessage('Server admin password is not configured. Set APP_ADMIN_PASSWORD first.', true);
      return;
    }
    if (!adminPassword.trim()) {
      setStatusMessage('Password is required.', true);
      return;
    }

    setAuthSaveState('saving');
    try {
      await handleAdminLogin(adminPassword);
      setAdminPassword('');
      setAuthSaveState('saved');
      clearTimeout(authTimerRef.current);
      authTimerRef.current = setTimeout(() => setAuthSaveState('idle'), 2000);
    } catch {
      setAuthSaveState('idle');
    }
  };

  const onLockAdmin = async () => {
    setAuthSaveState('saving');
    await handleAdminLogout();
    setAuthSaveState('idle');
  };

  const onSavePlannerSettings = (e) => {
    e.preventDefault();
    const normalizedRoomId = normalizePlannerRoomId(localSharedRoomId);
    if (localPlannerMode === 'shared') {
      if (!canManageGlobal) {
        setStatusMessage('Unlock admin mode before using shared planner mode.', true);
        return;
      }
      if (!normalizedRoomId) {
        setStatusMessage('Shared mode requires a room ID (2-64 chars: a-z, 0-9, _ or -).', true);
        return;
      }
    }

    applyPlannerSettings({
      mode: localPlannerMode,
      roomId: localPlannerMode === 'shared' ? normalizedRoomId : ''
    });

    setPlannerSaveState('saved');
    clearTimeout(plannerTimerRef.current);
    plannerTimerRef.current = setTimeout(() => setPlannerSaveState('idle'), 2000);
  };

  const onSaveDates = async (e) => {
    e.preventDefault();
    setDateSaveState('saving');
    try {
      await handleSaveTripDates(localTripStart, localTripEnd);
      setDateSaveState('saved');
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => setDateSaveState('idle'), 2000);
    } catch {
      setDateSaveState('idle');
    }
  };

  const onSaveLocation = async (e) => {
    e.preventDefault();
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
            <h2 className="m-0 text-xl font-extrabold tracking-tight">Access</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Unlock admin mode to run sync and manage shared settings.</p>
          </div>
          <Badge variant={canManageGlobal ? 'default' : 'secondary'} className={canManageGlobal ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}>
            {canManageGlobal ? 'Unlocked' : authConfigured ? 'Locked' : 'Not configured'}
          </Badge>
        </div>
        <Card className="p-3">
          <form className="flex items-center gap-2 max-sm:flex-col" onSubmit={onUnlockAdmin}>
            <Input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder={authConfigured ? 'Enter admin password' : 'APP_ADMIN_PASSWORD missing on server'} disabled={!authConfigured || canManageGlobal} className="max-sm:max-w-none" />
            {canManageGlobal ? (
              <Button type="button" size="sm" className="min-h-[36px] rounded-lg min-w-[110px] shrink-0" onClick={() => { void onLockAdmin(); }} disabled={authSaveState === 'saving'}>
                {authSaveState === 'saving' ? 'Locking...' : 'Lock'}
              </Button>
            ) : (
              <Button type="submit" size="sm" className="min-h-[36px] rounded-lg min-w-[110px] shrink-0" disabled={!authConfigured || authSaveState === 'saving'}>
                {authSaveState === 'saving' ? 'Unlocking...' : authSaveState === 'saved' ? <><Check size={14} />Unlocked</> : 'Unlock'}
              </Button>
            )}
          </form>
        </Card>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="m-0 text-xl font-extrabold tracking-tight">Planning Mode</h2>
            <p className="mt-0.5 text-muted text-[0.82rem]">Local mode keeps plans in this browser. Shared mode syncs by room ID.</p>
          </div>
        </div>
        <Card className="p-3">
          <form className="flex items-center gap-2 max-sm:flex-col" onSubmit={onSavePlannerSettings}>
            <Select value={localPlannerMode} onValueChange={setLocalPlannerMode}>
              <SelectTrigger className="min-h-[36px] w-[160px] shrink-0 rounded-lg">
                <SelectValue placeholder="Planning mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="shared">Shared (2 people)</SelectItem>
              </SelectContent>
            </Select>
            <Input type="text" value={localSharedRoomId} onChange={(e) => setLocalSharedRoomId(e.target.value)} placeholder="Room ID (for shared mode)" disabled={localPlannerMode !== 'shared'} className="max-sm:max-w-none" />
            <Button type="submit" size="sm" className="min-h-[36px] rounded-lg min-w-[100px] shrink-0" disabled={plannerSaveState === 'saving'}>
              {plannerSaveState === 'saving' ? 'Saving...' : plannerSaveState === 'saved' ? <><Check size={14} />Saved</> : 'Save'}
            </Button>
          </form>
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
            <Input type="date" value={localTripStart} onChange={(e) => setLocalTripStart(e.target.value)} className="max-w-[180px] max-sm:max-w-none" />
            <label className="text-sm font-medium text-foreground-secondary shrink-0">End</label>
            <Input type="date" value={localTripEnd} onChange={(e) => setLocalTripEnd(e.target.value)} className="max-w-[180px] max-sm:max-w-none" />
            <Button type="submit" size="sm" className="min-h-[36px] rounded-lg min-w-[80px] shrink-0" disabled={!canManageGlobal || dateSaveState === 'saving'}>
              {dateSaveState === 'saving' ? 'Saving...' : dateSaveState === 'saved' ? <><Check size={14} />Saved</> : 'Save'}
            </Button>
          </form>
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
            <Input type="text" value={localBaseLocation} onChange={(e) => setLocalBaseLocation(e.target.value)} placeholder="e.g. 1100 California St, San Francisco, CA 94108, United States" className="max-sm:max-w-none" />
            <Button type="submit" size="sm" className="min-h-[36px] rounded-lg min-w-[80px] shrink-0" disabled={!canManageGlobal || locationSaveState === 'saving'}>
              {locationSaveState === 'saving' ? 'Saving...' : locationSaveState === 'saved' ? <><Check size={14} />Saved</> : 'Save'}
            </Button>
          </form>
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
          <Input placeholder="https://example.com/source" value={newSourceUrl} onChange={(e) => setNewSourceUrl(e.target.value)} />
          <Input className="max-w-[160px] max-sm:max-w-none" placeholder="Label (optional)" value={newSourceLabel} onChange={(e) => setNewSourceLabel(e.target.value)} />
          <Button type="submit" size="sm" className="min-h-[36px] rounded-lg min-w-[100px] shrink-0 max-sm:w-full" disabled={!canManageGlobal || isSavingSource}>
            {isSavingSource ? 'Adding...' : 'Add Source'}
          </Button>
        </form>

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
