'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchJson } from '@/lib/helpers';
import { parsePlannerPayload, sanitizePlannerByDate } from '@/lib/planner-domain.ts';
import { compactPlannerByDate } from '@/lib/planner-helpers';

type Planner = Record<string, any[]>;
export type PlannerPersistenceStatus = 'loading' | 'saved' | 'unsaved' | 'saving' | 'error';

type PersistenceState = {
  plannerPersistenceStatus: PlannerPersistenceStatus;
  plannerPersistenceError: string;
  plannerReady: boolean;
};

// Each authenticated session owns its queue. Disposed sessions cannot apply responses
// or start more writes, and only one write can be in flight at a time.
export function createPlannerPersistenceSession({ load, save, onLoad, onState }: {
  load: (signal: AbortSignal) => Promise<any>;
  save: (planner: Planner, signal: AbortSignal) => Promise<void>;
  onLoad: (planner: Planner, userId: string) => void;
  onState: (state: PersistenceState) => void;
}) {
  const abort = new AbortController();
  let disposed = false;
  let ready = false;
  let loading = false;
  let saving = false;
  let failed = false;
  let savedKey = '';
  let latest: { planner: Planner; key: string } | null = null;
  let pending: { planner: Planner; key: string } | null = null;
  const emit = (status: PlannerPersistenceStatus, error = '') => {
    if (!disposed) onState({ plannerPersistenceStatus: status, plannerPersistenceError: error, plannerReady: ready });
  };
  const snapshot = (planner: Planner) => {
    const parsed = parsePlannerPayload({ plannerByDate: compactPlannerByDate(planner) });
    if (!parsed.ok) throw new Error('The plan could not be saved. Check your plan and retry.');
    return { planner: parsed.plannerByDate, key: JSON.stringify(parsed.plannerByDate) };
  };
  async function drain() {
    if (disposed || !ready || saving || failed) return;
    saving = true;
    try {
      while (pending && !disposed) {
        const next = pending;
        pending = null;
        if (next.key === savedKey) continue;
        emit('saving');
        try {
          await save(next.planner, abort.signal);
          if (disposed) return;
          savedKey = next.key;
        } catch (error) {
          if (disposed) return;
          failed = true;
          pending = latest;
          emit('error', `Your changes are not saved. ${error instanceof Error ? error.message : 'Please retry.'}`);
          return;
        }
      }
      if (!disposed) emit(latest && latest.key !== savedKey ? 'unsaved' : 'saved');
    } finally {
      saving = false;
    }
  }
  async function hydrate() {
    if (disposed || loading || ready) return;
    loading = true;
    emit('loading');
    try {
      const payload = await load(abort.signal);
      if (disposed) return;
      // A malformed response is not an empty plan and must never unlock autosave.
      if (!payload || typeof payload.plannerByDate !== 'object' || payload.plannerByDate === null || Array.isArray(payload.plannerByDate)) {
        throw new Error('The server returned an invalid plan.');
      }
      const planner = sanitizePlannerByDate(payload.plannerByDate);
      latest = snapshot(planner);
      savedKey = latest.key;
      ready = true;
      failed = false;
      onLoad(planner, String(payload.userId || ''));
      emit('saved');
    } catch (error) {
      if (!disposed) emit('error', `Your plan could not be loaded. Saving is paused to protect it. ${error instanceof Error ? error.message : 'Please retry.'}`);
    } finally {
      loading = false;
    }
  }
  return {
    hydrate,
    edit(planner: Planner) {
      if (disposed || !ready) return;
      try {
        latest = snapshot(planner);
        if (!failed && !saving) emit(latest.key === savedKey ? 'saved' : 'unsaved');
      } catch (error) {
        failed = true;
        emit('error', error instanceof Error ? error.message : 'Your changes are not saved.');
      }
    },
    flush() {
      if (disposed || !ready || !latest || failed) return;
      pending = latest;
      void drain();
    },
    retry() {
      if (disposed) return;
      if (!ready) { void hydrate(); return; }
      failed = false;
      pending = latest;
      void drain();
    },
    dispose() {
      disposed = true;
      ready = false;
      pending = null;
      abort.abort();
    }
  };
}

export function usePlannerPersistence({
  authUserId, isAuthenticated, plannerByDate, plannerHydratedRef, setAuthUserId, setPlannerByDate
}: {
  authUserId: string;
  isAuthenticated: boolean;
  plannerByDate: Planner;
  plannerHydratedRef: { current: boolean };
  setAuthUserId: (value: string) => void;
  setPlannerByDate: (value: Planner | ((previous: Planner) => Planner)) => void;
}) {
  const [state, setState] = useState<PersistenceState>({
    plannerPersistenceStatus: 'loading', plannerPersistenceError: '', plannerReady: false
  });
  const sessionRef = useRef<ReturnType<typeof createPlannerPersistenceSession> | null>(null);
  useEffect(() => {
    plannerHydratedRef.current = false;
    if (!isAuthenticated) {
      setPlannerByDate({});
      return;
    }
    const session = createPlannerPersistenceSession({
      load: signal => fetchJson('/api/planner', { signal }),
      save: async (planner, signal) => {
        const response = await fetch('/api/planner', {
          method: 'POST', signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plannerByDate: planner })
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || `Planner save failed: ${response.status}`);
        }
      },
      onLoad: (planner, userId) => {
        if (userId && userId !== authUserId) setAuthUserId(userId);
        setPlannerByDate(planner);
      },
      onState: next => {
        plannerHydratedRef.current = next.plannerReady;
        setState(next);
      }
    });
    sessionRef.current = session;
    void session.hydrate();
    return () => {
      session.dispose();
      if (sessionRef.current === session) sessionRef.current = null;
      plannerHydratedRef.current = false;
    };
  }, [authUserId, isAuthenticated, plannerHydratedRef, setAuthUserId, setPlannerByDate]);

  useEffect(() => {
    const session = sessionRef.current;
    if (!session || !state.plannerReady || !isAuthenticated) return;
    session.edit(plannerByDate);
    const timeoutId = window.setTimeout(() => session.flush(), 450);
    return () => window.clearTimeout(timeoutId);
  }, [isAuthenticated, plannerByDate, state.plannerReady]);

  const retryPlannerPersistence = useCallback(() => sessionRef.current?.retry(), []);
  return {
    ...(isAuthenticated ? state : {
      plannerPersistenceStatus: 'saved' as PlannerPersistenceStatus,
      plannerPersistenceError: '',
      plannerReady: false
    }),
    retryPlannerPersistence
  };
}
