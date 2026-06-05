import { useEffect, useRef, useCallback } from "react";

const BASE = location.protocol === "file:"
  ? "https://batisense-production.up.railway.app"
  : location.origin;

export type SSEEvent = "alert" | "sensor" | "ping";

interface SSEOptions {
  onAlert?: (data: any) => void;
  onSensor?: (data: any) => void;
  onPing?: () => void;
}

export function useSSE(options: SSEOptions) {
  const esRef = useRef<EventSource | null>(null);
  const optsRef = useRef(options);
  optsRef.current = options;

  const connect = useCallback(() => {
    if (esRef.current) return;
    const es = new EventSource(`${BASE}/api/stream`, { withCredentials: true });

    es.addEventListener("alert", (e) => {
      try { optsRef.current.onAlert?.(JSON.parse(e.data)); } catch {}
    });

    es.addEventListener("sensor", (e) => {
      try { optsRef.current.onSensor?.(JSON.parse(e.data)); } catch {}
    });

    es.addEventListener("ping", () => optsRef.current.onPing?.());

    es.onerror = () => {
      es.close();
      esRef.current = null;
      setTimeout(connect, 3000);
    };

    esRef.current = es;
  }, []);

  useEffect(() => {
    connect();
    return () => esRef.current?.close();
  }, [connect]);

  return { reconnect: connect };
}
