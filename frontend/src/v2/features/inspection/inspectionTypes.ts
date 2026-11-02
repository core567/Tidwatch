import type { Station, StationId } from '../../types';

export type TaskStatus = '待派发' | '进行中' | '待复核' | '已归档';
export type TaskPriority = '高' | '中' | '低';
export type MemberStatus = '在岗' | '外勤' | '离线';

export interface TaskChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface FieldReading {
  key: string;
  label: string;
  value: number;
  unit: string;
  precision: number;
  normalRange: [number, number];
}

export interface TaskPhotoPlaceholder {
  id: string;
  label: string;
  time: string;
}

export interface TaskTimelineStep {
  time: string;
  actor: string;
  action: string;
  note: string;
  state: 'done' | 'active' | 'todo';
}

export interface InspectionTask {
  id: string;
  title: string;
  stationId: StationId;
  assignee: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  dueAt: string;
  description: string;
  checklist: TaskChecklistItem[];
  measurements?: FieldReading[];
  photos?: TaskPhotoPlaceholder[];
  feedback?: string;
  reviewNote?: string;
  submittedAt?: string;
  relatedEventId?: string;
  timeline: TaskTimelineStep[];
}

export interface Inspector {
  id: string;
  name: string;
  initials: string;
  role: string;
  scope: string;
  status: MemberStatus;
}

export interface InspectionData {
  demo: true;
  updatedAt: string;
  stations: Station[];
  members: Inspector[];
  tasks: InspectionTask[];
}
