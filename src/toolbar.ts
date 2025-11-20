import type { PolygonBooleanMode } from "./state";

export interface ToolbarHandlers {
  isModeActive: (mode: PolygonBooleanMode) => boolean;
  onModeToggle: (mode: PolygonBooleanMode) => void;
  onClear: () => void;
  onResetCamera: () => void;
  onResetGrid: () => void;
}

export interface ToolbarControls {
  updateModeButtons(): void;
  updateCellCount(value: number): void;
}

export function setupToolbar(handlers: ToolbarHandlers): ToolbarControls {
  const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>(".mode-button"));
  const cellCountElement = document.getElementById("cell-count") as HTMLElement | null;

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

  return {
    updateModeButtons,
    updateCellCount,
  };
}
