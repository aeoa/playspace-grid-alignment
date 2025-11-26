import type { PolygonBooleanMode } from "./state";

export interface ToolbarHandlers {
  isModeActive: (mode: PolygonBooleanMode) => boolean;
  onModeToggle: (mode: PolygonBooleanMode) => void;
  onClear: () => void;
  onResetCamera: () => void;
  onResetGrid: () => void;
  onAutoAlign: () => void;
}

export interface ToolbarControls {
  updateModeButtons(): void;
  updateCellCount(value: number): void;
  setAligning(value: boolean): void;
  setAlignStats(value: string): void;
}

export function setupToolbar(handlers: ToolbarHandlers): ToolbarControls {
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-button"));
  const cellCountElement = document.getElementById("cell-count") as HTMLElement | null;
  const autoAlignButton = document.getElementById("auto-align-grid") as HTMLButtonElement | null;
  const alignStatsEl = document.getElementById("align-stats") as HTMLElement | null;

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
    if (autoAlignButton) {
      autoAlignButton.disabled = value;
      autoAlignButton.classList.toggle("aligning", value);
    }
  };

  const setAlignStats = (value: string) => {
    if (alignStatsEl) {
      alignStatsEl.textContent = value;
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

  document.getElementById("reset-grid")?.addEventListener("click", () => {
    handlers.onResetGrid();
  });

  autoAlignButton?.addEventListener("click", () => {
    handlers.onAutoAlign();
  });

  return {
    updateModeButtons,
    updateCellCount,
    setAligning,
    setAlignStats,
  };
}
