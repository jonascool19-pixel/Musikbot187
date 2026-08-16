import type { AppState } from "./types.js";

export function recordDiagnostic(state: AppState, message: string): void {
  state.diagnostics.unshift({ time: new Date().toISOString(), message });
  state.diagnostics = state.diagnostics.slice(0, 100);
  console.error(`[Musikbot 187] ${message}`);
}
