export const PROJECT_STATUSES = ["planned", "active", "on_hold", "completed", "canceled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_TRANSITIONS: Record<ProjectStatus, readonly ProjectStatus[]> = {
  planned: ["active", "on_hold", "canceled"],
  active: ["on_hold", "completed", "canceled"],
  on_hold: ["active", "canceled"],
  completed: ["active"],
  canceled: ["planned"],
};
