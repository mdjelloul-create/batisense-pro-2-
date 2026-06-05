import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface CostData {
  electricity: { consumption_kwh: number; estimated_cost_dzd: number };
  water: { consumption_m3: number; estimated_cost_dzd: number };
  gas: { consumption_m3: number; consumption_kwh: number; estimated_cost_dzd: number };
  total_cost_dzd: number;
  currency: string;
}

const BASE = location.protocol === "file:"
  ? "https://batisense-production.up.railway.app"
  : location.origin;

export function CostEstimate() {
  const [data, setData] = useState<CostData | null>(null);

  useEffect(() => {
    fetch(`${BASE}/api/cost-estimate`, { credentials: "include" })
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  if (!data) {
    return (
      <Card className="bg-black/[.96] border-zinc-800 p-6">
        <div className="loader mx-auto" />
      </Card>
    );
  }

  const items = [
    { label: "Électricité", icon: "⚡", consumption: `${data.electricity.consumption_kwh} kWh`, cost: data.electricity.estimated_cost_dzd, color: "text-violet-400" },
    { label: "Eau", icon: "💧", consumption: `${data.water.consumption_m3} m³`, cost: data.water.estimated_cost_dzd, color: "text-cyan-400" },
    { label: "Gaz", icon: "🔥", consumption: `${data.gas.consumption_m3} m³`, cost: data.gas.estimated_cost_dzd, color: "text-amber-400" },
  ];

  return (
    <Card className="bg-black/[.96] border-zinc-800 p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-300">
        <span>💰</span> Estimation Mensuelle
      </h3>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between border-b border-zinc-800 pb-2 last:border-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">{item.icon}</span>
              <div>
                <p className="text-sm font-medium text-neutral-200">{item.label}</p>
                <p className="text-xs text-neutral-500">{item.consumption}</p>
              </div>
            </div>
            <span className={`text-lg font-bold ${item.color}`}>{item.cost.toLocaleString()} DA</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-zinc-700 pt-3">
        <span className="text-sm text-neutral-400">Total estimé</span>
        <span className="text-xl font-bold text-emerald-400">{data.total_cost_dzd.toLocaleString()} DA</span>
      </div>
    </Card>
  );
}
