let mockPushRunning = false;

export function setLiveOpsMockPushRunning(running: boolean): void {
  mockPushRunning = running;
}

export function isLiveOpsMockPushRunning(): boolean {
  return mockPushRunning;
}
