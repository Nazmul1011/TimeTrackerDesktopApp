import { app } from "electron";

export const PRODUCTION_API_URL = "https://gr8rtrackerapp.gr8rdesign.com";

export function getMainApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_API_BASE_URL) {
    return process.env.NEXT_PUBLIC_API_BASE_URL.replace(/\/$/, "");
  }
  if (app.isPackaged) return PRODUCTION_API_URL;
  return "http://localhost:3001";
}
