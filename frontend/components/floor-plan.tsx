import { useState } from "react";
import { Card } from "@/components/ui/card";

interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  icon: string;
}

const ROOMS: Room[] = [
  { id: "kitchen", name: "Cuisine", x: 0, y: 0, w: 40, h: 45, color: "#00f5a0", icon: "🍳" },
  { id: "salon", name: "Salon", x: 42, y: 0, w: 58, h: 45, color: "#00d4e0", icon: "🛋️" },
  { id: "port", name: "Porte", x: 0, y: 47, w: 30, h: 20, color: "#ffc233", icon: "🚪" },
  { id: "room", name: "Chambre", x: 32, y: 47, w: 38, h: 53, color: "#4d8dff", icon: "🛏️" },
  { id: "bathroom", name: "Salle de Bain", x: 72, y: 47, w: 28, h: 53, color: "#a06bff", icon: "🚿" },
];

interface SensorDot {
  roomId: string;
  cx: number;
  cy: number;
  label: string;
  value?: string;
  color: string;
}

const SENSORS: SensorDot[] = [
  { roomId: "kitchen", cx: 20, cy: 22, label: "Temp", value: "---", color: "#00f5a0" },
  { roomId: "salon", cx: 70, cy: 20, label: "Temp", value: "---", color: "#00d4e0" },
  { roomId: "port", cx: 15, cy: 57, label: "Porte", value: "Fermée", color: "#ffc233" },
  { roomId: "room", cx: 50, cy: 70, label: "Présence", value: "---", color: "#4d8dff" },
  { roomId: "bathroom", cx: 85, cy: 72, label: "Humidité", value: "---", color: "#a06bff" },
];

export function FloorPlan() {
  const [activeRoom, setActiveRoom] = useState<string | null>(null);

  const vw = 100;
  const vh = 100;

  return (
    <Card className="bg-black/[.96] border-zinc-800 p-6">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-neutral-300">
        <span>🏠</span> Plan du bâtiment
      </h3>
      <div className="relative w-full" style={{ aspectRatio: `${vw}/${vh}` }}>
        <svg viewBox={`0 0 ${vw} ${vh}`} className="h-full w-full">
          {ROOMS.map((room) => (
            <g key={room.id}>
              <rect
                x={room.x} y={room.y} width={room.w} height={room.h} rx={3}
                fill={activeRoom === room.id ? `${room.color}25` : `${room.color}12`}
                stroke={activeRoom === room.id ? room.color : `${room.color}40`}
                strokeWidth={activeRoom === room.id ? 1.5 : 0.8}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() => setActiveRoom(room.id)}
                onMouseLeave={() => setActiveRoom(null)}
              />
              <text
                x={room.x + room.w / 2}
                y={room.y + room.h / 2 - 4}
                textAnchor="middle"
                fontSize={5}
                fill="#d4e8ff"
                className="pointer-events-none select-none"
              >
                {room.icon} {room.name}
              </text>
            </g>
          ))}

          {SENSORS.map((s) => {
            const r = 3;
            return (
              <g key={`${s.roomId}-${s.label}`}>
                <circle cx={s.cx} cy={s.cy} r={r} fill={s.color} opacity={0.8}>
                  <animate
                    attributeName="opacity"
                    values="0.4;1;0.4"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
                <circle cx={s.cx} cy={s.cy} r={r + 2} fill="none" stroke={s.color} strokeWidth={0.4} opacity={0.4}>
                  <animate
                    attributeName="r"
                    values={`${r + 2};${r + 5};${r + 2}`}
                    dur="2s"
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.4;0;0.4"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                </circle>
              </g>
            );
          })}
        </svg>

        {activeRoom && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-zinc-700 bg-zinc-900/95 px-5 py-3 text-center shadow-2xl backdrop-blur-sm">
            <p className="text-sm font-bold text-neutral-100">
              {ROOMS.find((r) => r.id === activeRoom)?.icon}{" "}
              {ROOMS.find((r) => r.id === activeRoom)?.name}
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              {SENSORS.filter((s) => s.roomId === activeRoom).map((s) => `${s.label}: ${s.value}`).join(" | ")}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
