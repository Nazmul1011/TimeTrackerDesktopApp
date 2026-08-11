/**
 * IPC channel name constants (must match electron/ipc handlers).
 */
export const IPC_CHANNELS = {
  AUTH_LOGIN: "auth:login",
  AUTH_LOGOUT: "auth:logout",
  AUTH_GET_SESSION: "auth:getSession",
  TIMER_START: "timer:start",
  TIMER_STOP: "timer:stop",
  TIMER_PAUSE: "timer:pause",
  TIMER_RESUME: "timer:resume",
  TIMER_GET_STATUS: "timer:getStatus",
  SCREENSHOT_CAPTURE: "screenshot:capture",
  SCREENSHOT_LIST: "screenshot:list",
  ACTIVITY_GET_IDLE_STATE: "activity:getIdleState",
  ACTIVITY_GET_SUMMARY: "activity:getSummary",
  NOTIFICATION_SHOW: "notification:show",
  NOTIFICATION_LIST: "notification:list",
  SETTINGS_GET: "settings:get",
  SETTINGS_SET: "settings:set",
  SYNC_RUN: "sync:run",
  SYNC_GET_STATUS: "sync:getStatus",
} as const;
