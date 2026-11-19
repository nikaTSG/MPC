import { useEffect, useState } from 'react';
import { getMarineConditions, type MarineConditions } from '../utils/portCalls';
import type { MaritimePort } from '../utils/seaRouter';

const CACHE_MS = 15 * 60_000;
const cache = new Map<string, { forecast: MarineConditions; expiresAt: number }>();

export function usePortWeather(port: MaritimePort | null, enabled: boolean) {
  const [result, setResult] = useState<{ portCode: string; forecast: MarineConditions | null } | null>(null);

  useEffect(() => {
    if (!port || !enabled) return;
    const controller = new AbortController();
    const load = async () => {
      const cached = cache.get(port.code);
      try {
        const forecast = cached && cached.expiresAt > Date.now()
          ? cached.forecast
          : await getMarineConditions(port.coords, AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)]));
        if (controller.signal.aborted) return;
        if (forecast !== cached?.forecast) cache.set(port.code, { forecast, expiresAt: Date.now() + CACHE_MS });
        setResult({ portCode: port.code, forecast });
      } catch {
        if (!controller.signal.aborted) setResult({ portCode: port.code, forecast: null });
      }
    };

    void load();
    const refresh = window.setInterval(() => void load(), CACHE_MS);
    return () => {
      controller.abort();
      window.clearInterval(refresh);
    };
  }, [port, enabled]);

  return result?.portCode === port?.code ? result : null;
}
