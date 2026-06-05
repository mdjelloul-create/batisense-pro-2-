import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";

interface WeatherData {
  temp: number;
  feels_like: number;
  humidity: number;
  description: string;
  icon: string;
  city: string;
}

const BASE = location.protocol === "file:"
  ? "https://batisense-production.up.railway.app"
  : location.origin;

const FALLBACK: WeatherData = {
  temp: 22,
  feels_like: 20,
  humidity: 55,
  description: "Ciel dégagé",
  icon: "01d",
  city: "Alger",
};

export function WeatherWidget() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/api/weather`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then(setWeather)
      .catch(() => setWeather(FALLBACK))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="bg-black/[.96] border-zinc-800 p-6">
        <div className="loader mx-auto" />
      </Card>
    );
  }

  const w = weather!;

  return (
    <Card className="bg-black/[.96] border-zinc-800 p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-wider text-neutral-500">{w.city}</p>
          <p className="mt-1 text-4xl font-bold text-neutral-100">{w.temp}°C</p>
          <p className="mt-1 text-sm capitalize text-neutral-400">{w.description}</p>
        </div>
        <img
          src={`https://openweathermap.org/img/wn/${w.icon}@2x.png`}
          alt={w.description}
          className="h-16 w-16 -mr-2"
        />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-center text-xs">
        <div className="rounded-lg bg-zinc-800/60 p-2">
          <p className="text-neutral-500">Ressenti</p>
          <p className="font-semibold text-neutral-200">{w.feels_like}°C</p>
        </div>
        <div className="rounded-lg bg-zinc-800/60 p-2">
          <p className="text-neutral-500">Humidité</p>
          <p className="font-semibold text-neutral-200">{w.humidity}%</p>
        </div>
      </div>
    </Card>
  );
}
