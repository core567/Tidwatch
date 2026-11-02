import type { StationId } from '../../types';

/** 双视图：河段全景或某个监测断面。由 TwinPage 统一持有。 */
export type TwinView = 'overview' | StationId;

export type TwinSceneLayer = 'flow' | 'labels' | 'terrain';

export interface TwinRiskInfo {
  tone: 'good' | 'watch' | 'alert';
  code: string;
  title: string;
  status: string;
  desc: string;
  link: string;
  linkLabel: string;
}
