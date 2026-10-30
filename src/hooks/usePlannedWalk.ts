import { useCallback, useEffect, useRef, useState } from "react";
import { getFollowingPlan, saveFollowingPlan, type FollowingPlan } from "../database/routePlanRepository";
import type { RoutePlan } from "../services/routePlanning";

export function usePlannedWalk(ready: boolean, sessionId: number | null, recoverySessionId: number | null) {
  const [following, setFollowing] = useState<FollowingPlan | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const writing = useRef(false);
  useEffect(() => {
    if (!ready) return;
    const current = ++generation.current;
    setLoaded(false);
    setFollowing(value => value?.sessionId && value.sessionId !== sessionId && value.sessionId !== recoverySessionId ? null : value);
    void getFollowingPlan().then(value => {
      if (generation.current !== current) return;
      // A finished or discarded recording cannot reattach its guidance to a new one.
      setFollowing(value?.sessionId && value.sessionId !== sessionId && value.sessionId !== recoverySessionId ? null : value);
      setError(false);
    }).catch(() => { if (generation.current === current) setError(true); })
      .finally(() => { if (generation.current === current) setLoaded(true); });
    return () => { generation.current++; };
  }, [ready, sessionId, recoverySessionId, revision]);
  const select = useCallback(async (plan: RoutePlan | null) => {
    if (writing.current) throw new Error("Guidance update in progress");
    writing.current = true;
    const current = ++generation.current;
    const value = plan ? { plan, sessionId } : null;
    try {
      await saveFollowingPlan(value);
      if (generation.current === current) { setFollowing(value); setLoaded(true); setError(false); }
    } catch (cause) {
      if (generation.current === current) { setLoaded(true); setError(true); }
      throw cause;
    } finally { writing.current = false; }
  }, [sessionId]);
  const reload = useCallback(() => { setFollowing(null); setLoaded(false); setRevision(v => v + 1); }, []);
  return { following, loaded, error, select, reload };
}
