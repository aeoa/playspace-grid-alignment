import type { PolygonBooleanMode } from "./state";

export interface ToolbarHandlers {
  isModeActive: (mode: PolygonBooleanMode) => boolean;
  onModeToggle: (mode: PolygonBooleanMode) => void;
  onClear: () => void;
  onResetCamera: () => void;
  onToggleAutoAlign: (enabled: boolean) => void;
}

export interface ToolbarControls {
  updateModeButtons(): void;
  updateCellCount(value: number): void;
  setAligning(value: boolean): void;
  setAlignStats(value: string): void;
  setAutoAlignChecked(value: boolean): void;
}

export function setupToolbar(handlers: ToolbarHandlers): ToolbarControls {
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-button"));
  const cellCountElement = document.getElementById("cell-count") as HTMLElement | null;
  const alignStatsEl = document.getElementById("align-stats") as HTMLElement | null;
  const autoAlignToggle = document.getElementById("auto-align-toggle") as HTMLInputElement | null;

  const updateModeButtons = () => {
    modeButtons.forEach((button) => {
      const buttonMode = button.dataset.mode as PolygonBooleanMode | undefined;
      if (!buttonMode) {
        return;
      }
      const isActive = handlers.isModeActive(buttonMode);
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  const updateCellCount = (value: number) => {
    if (cellCountElement) {
      cellCountElement.textContent = value.toString();
    }
  };

  const setAligning = (value: boolean) => {
    if (autoAlignToggle?.parentElement) {
      autoAlignToggle.parentElement.classList.toggle("aligning", value);
    }
    if (autoAlignToggle) {
      autoAlignToggle.disabled = value;
    }
  };

  const setAlignStats = (value: string) => {
    if (alignStatsEl) {
      alignStatsEl.textContent = value;
    }
  };

  const setAutoAlignChecked = (value: boolean) => {
    if (autoAlignToggle) {
      autoAlignToggle.checked = value;
    }
  };

  modeButtons.forEach((button) => {
    const buttonMode = button.dataset.mode as PolygonBooleanMode | undefined;
    if (!buttonMode) {
      return;
    }
    button.addEventListener("click", () => handlers.onModeToggle(buttonMode));
  });

  document.getElementById("clear-region")?.addEventListener("click", () => {
    handlers.onClear();
  });

  document.getElementById("reset-camera")?.addEventListener("click", () => {
    handlers.onResetCamera();
  });

  autoAlignToggle?.addEventListener("change", (event) => {
    handlers.onToggleAutoAlign((event.target as HTMLInputElement).checked);
  });

  return {
    updateModeButtons,
    updateCellCount,
    setAligning,
    setAlignStats,
    setAutoAlignChecked,
  };
}
