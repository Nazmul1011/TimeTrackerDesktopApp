/**
 * Electron service barrel.
 */
export { getElectronAPI, isElectron } from "./bridge";
export {
  loadPersistedAuthSession,
  savePersistedAuthSession,
  clearPersistedAuthSession,
} from "./auth-session";
