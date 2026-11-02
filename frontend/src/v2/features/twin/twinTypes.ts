import type { StationId } from '../../types';

export type TwinTone = 'good' | 'watch' | 'alert';

export interface TwinMetric {
  key: string;
  label: string;
  en: string;
  value: number | null;
  unit: string;
  precision: number;
  tone: TwinTone;
  spark: number[];
}

export interface TwinStation {
  id: StationId;
  name: string;
  waterClass: string;
  tone: TwinTone;
  statusLabel: string;
  riskCode: string;
  summary: string;
  coordinates: string;
  updatedAt: string;
  position: { x: number; y: number };
  metrics: TwinMetric[];
}

export interface TwinData {
  demo?: boolean;
  updatedAt: string;
  sceneName: string;
  location: string;
  riverLength: string;
  flowSpeed: string;
  stations: TwinStation[];
  activeRisk: {
    eventId: string;
    title: string;
    riskCode: string;
    status: string;
    stationId: StationId;
    reading: string;
  };
}
