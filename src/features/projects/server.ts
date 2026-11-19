import "server-only";

import { recordAuditEvent } from "@/lib/audit/service";
import { inAppNotificationPublisher } from "@/lib/notifications/server";
import { taskRepository } from "@/features/tasks/queries";

import { projectRepository } from "./queries";
import { createProjectService } from "./services";

export function getProjectService() {
  return createProjectService({
    repository: projectRepository,
    countOpenTasks: taskRepository.countOpen,
    countOpenAssignedTasks: taskRepository.countOpenAssigned,
    audit: recordAuditEvent,
    notifications: inAppNotificationPublisher,
  });
}
