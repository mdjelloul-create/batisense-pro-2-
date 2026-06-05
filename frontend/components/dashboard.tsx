import { useState, useEffect, useCallback } from "react";
import { SplineSceneBasic } from "@/components/demo";
import { CostEstimate } from "@/components/cost-estimate";
import { WeatherWidget } from "@/components/weather-widget";
import { FloorPlan } from "@/components/floor-plan";
import { useSSE } from "@/hooks/useSSE";
import { useToast } from "@/components/toast";

const BASE = location.protocol === "file:"
  ? "https://batisense-production.up.railway.app"
  : location.origin;

type Section = "overview" | "consumption" | "nodes" | "alerts" | "plan";

const NAV_ITEMS: { id: Section; label: string; icon: string }[] = [
  { id: "overview", label: "Vue d'ensemble", icon: "📊" },
  { id: "consumption", label: "Consommation", icon: "⚡" },
  { id: "nodes", label: "Nœuds", icon: "📡" },
  { id: "plan", label: "Plan", icon: "🏠" },
  { id: "alerts", label: "Alertes", icon: "🔔" },
];

interface Alert {
  id: number;
  node_id: string;
  sensor_type: string;
  value: number;
  message: string;
  level: string;
  timestamp: string;
  acked: number;
}

export function Dashboard() {
  const [section, setSection] = useState<Section>("overview");
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [unackedCount, setUnackedCount] = useState(0);
  const { addToast } = useToast();

  const fetchAlerts = useCallback(() => {
    fetch(`${BASE}/api/alerts`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        setAlerts(data);
        setUnackedCount(data.filter((a: Alert) => !a.acked).length);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 15000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  useSSE({
    onAlert: (data) => {
      const level = data.level === "danger" ? "danger" : data.level === "warning" ? "warning" : "info";
      addToast(data.message || `Alerte ${data.sensor_type} sur ${data.node_id}`, level);
      setAlerts((prev) => [data, ...prev]);
      setUnackedCount((c) => c + 1);
    },
    onSensor: () => {},
    onPing: () => {},
  });

  const ackAlert = async (id: number) => {
    await fetch(`${BASE}/api/alerts/${id}/ack`, { method: "POST", credentials: "include" });
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    setUnackedCount((c) => Math.max(0, c - 1));
  };

  const levelColor = (level: string) => {
    switch (level) {
      case "danger": return "border-l-red-500 bg-red-950/40";
      case "warning": return "border-l-amber-500 bg-amber-950/40";
      default: return "border-l-blue-500 bg-blue-950/40";
    }
  };

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <aside className="flex w-56 flex-col border-r border-zinc-800 bg-black/60 p-4 backdrop-blur-xl">
        <div className="mb-8 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/20 text-lg font-bold text-emerald-400">B</div>
          <div>
            <p className="text-sm font-bold text-zinc-100">BatiSense</p>
            <p className="text-[10px] uppercase tracking-widest text-emerald-400">Pro</p>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                section === item.id
                  ? "bg-emerald-500/10 text-emerald-400 shadow-[inset_0_0_0_1px_rgba(0,245,160,0.15)]"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === "alerts" && unackedCount > 0 && (
                <span className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {unackedCount}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="border-t border-zinc-800 pt-4 text-[10px] text-zinc-600">
          <div className="flex items-center gap-2 px-2">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(0,245,160,0.5)]" />
            Connecté
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-6">
        {section === "overview" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Vue d'ensemble</h1>
              <p className="mt-1 text-sm text-zinc-500">Surveillance temps réel de votre bâtiment</p>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <SplineSceneBasic />
              </div>
              <div className="space-y-6">
                <WeatherWidget />
                <CostEstimate />
              </div>
            </div>
            <div className="mt-6">
              <FloorPlan />
            </div>
          </>
        )}

        {section === "consumption" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Consommation</h1>
              <p className="mt-1 text-sm text-zinc-500">Suivi détaillé de votre consommation</p>
            </div>
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <CostEstimate />
              <div className="lg:col-span-2">
                <div className="rounded-2xl border border-zinc-800 bg-black/60 p-6 backdrop-blur-xl">
                  <h3 className="mb-2 text-sm font-semibold text-zinc-300">Détails des tarifs (Algérie)</h3>
                  <div className="space-y-4 text-sm text-zinc-400">
                    <div>
                      <p className="font-medium text-zinc-200">Électricité (Sonelgaz)</p>
                      <p>0-125 kWh: 1,708 DA/kWh • 126-250 kWh: 4,051 DA/kWh</p>
                      <p>251-1000 kWh: 5,650 DA/kWh • &gt;1000 kWh: 7,618 DA/kWh</p>
                    </div>
                    <div>
                      <p className="font-medium text-zinc-200">Eau (ADE)</p>
                      <p>0-25 m³: 5,50 DA/m³ • 26-45 m³: 9,00 DA/m³</p>
                      <p>46-75 m³: 18,00 DA/m³ • &gt;75 m³: 35,00 DA/m³</p>
                    </div>
                    <div>
                      <p className="font-medium text-zinc-200">Gaz (Sonelgaz)</p>
                      <p>0,384 DA/kWh (1 m³ ≈ 10,55 kWh)</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {section === "nodes" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Nœuds</h1>
              <p className="mt-1 text-sm text-zinc-500">État des capteurs et nœuds de mesure</p>
            </div>
            <FloorPlan />
          </>
        )}

        {section === "plan" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Plan du bâtiment</h1>
              <p className="mt-1 text-sm text-zinc-500">Visualisation interactive des pièces et capteurs</p>
            </div>
            <div className="mx-auto max-w-3xl">
              <FloorPlan />
            </div>
          </>
        )}

        {section === "alerts" && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Alertes</h1>
              <p className="mt-1 text-sm text-zinc-500">Notifications et événements</p>
            </div>
            <div className="space-y-3">
              {alerts.length === 0 ? (
                <div className="rounded-2xl border border-zinc-800 bg-black/40 p-8 text-center text-zinc-500">
                  Aucune alerte pour le moment
                </div>
              ) : (
                alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`flex items-start gap-4 rounded-xl border border-zinc-800 border-l-4 p-4 backdrop-blur-xl ${levelColor(alert.level)}`}
                  >
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-zinc-100">{alert.message}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {alert.node_id} · {alert.sensor_type} · {new Date(alert.timestamp).toLocaleString()}
                      </p>
                    </div>
                    {!alert.acked && (
                      <button
                        onClick={() => ackAlert(alert.id)}
                        className="shrink-0 rounded-lg border border-zinc-700 bg-zinc-800/50 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-700/50"
                      >
                        OK
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
