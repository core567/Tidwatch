export interface ScenarioStatus {
  running: boolean;
  scenario: string | null;
  speed?: number;
  startedAt?: string;
  finishedAt?: string | null;
  returncode?: number | null;
  stdoutTail?: string;
}
