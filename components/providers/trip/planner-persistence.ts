'use client';

import { useCallback, useEffect } from 'react';
import { fetchJson } from '@/lib/helpers';
import { parsePlannerPayload, sanitizePlannerByDate } from '@/lib/planner-domain.ts';
import { compactPlannerByDate } from '@/lib/planner-helpers';

export function usePlannerPersistence({
  authUserId,
  isAuthenticated,
  plannerByDate,
  plannerHydratedRef,
  setAuthUserId,
  setPlannerByDate
}: {
  authUserId: string;
  isAuthenticated: boolean;
  plannerByDate: Record<string, any[]>;
  plannerHydratedRef: { current: boolean };
  setAuthUserId: (value: string) => void;
  setPlannerByDate: (value: Record<string, any[]> | ((previous: Record<string, any[]>) => Record<string, any[]>)) => void;
}) {
  useEffect(() => {
    let mounted = true;
    plannerHydratedRef.current = false;
    setPlannerByDate({});

    async function loadPlannerFromServer() {
      if (!isAuthenticated) {
        if (mounted) {
          setPlannerByDate({});
          plannerHydratedRef.current = true;
        }
        return;
      }

      try {
        const payload = await fetchJson('/api/planner');
        if (!mounted) return;

        const resolvedUserId = String(payload?.userId || authUserId || '');
        if (resolvedUserId) {
          setAuthUserId(resolvedUserId);
        }
        setPlannerByDate(sanitizePlannerByDate(payload?.plannerByDate || {}));
      } catch (error) {
        console.error('Planner load failed; continuing with in-memory planner state.', error);
        if (mounted) {
          setPlannerByDate({});
        }
      } finally {
        if (mounted) plannerHydratedRef.current = true;
      }
    }

    void loadPlannerFromServer();
    return () => {
      mounted = false;
      plannerHydratedRef.current = true;
    };
  }, [authUserId, isAuthenticated, plannerHydratedRef, setAuthUserId, setPlannerByDate]);

  const savePlannerToServer = useCallback(async (nextPlannerByDate: Record<string, any[]>) => {
    try {
      const response = await fetch('/api/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plannerByDate: compactPlannerByDate(nextPlannerByDate)
        })
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || `Planner save failed: ${response.status}`);
      }
    } catch (error) {
      console.error('Planner save failed; retaining local planner cache.', error);
    }
  }, []);

  useEffect(() => {
    if (!plannerHydratedRef.current) return;
    if (!isAuthenticated) return;

    const timeoutId = window.setTimeout(() => {
      const parsed = parsePlannerPayload({
        plannerByDate: compactPlannerByDate(plannerByDate)
      });
      if (parsed.ok) {
        void savePlannerToServer(parsed.plannerByDate);
      }
    }, 450);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [isAuthenticated, plannerByDate, plannerHydratedRef, savePlannerToServer]);
}
