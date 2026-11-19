import "server-only";

import { recordAuditEvent } from "@/lib/audit/service";
import { inAppNotificationPublisher } from "@/lib/notifications/server";
import { projectRepository } from "@/features/projects/queries";

import { taskRepository } from "./queries";
import { createTaskService } from "./services";

export function getTaskService() {
  return createTaskService({
    repository: taskRepository,
    addProjectActivity: projectRepository.addActivity,
    audit: recordAuditEvent,
    notifications: inAppNotificationPublisher,
  });
}
