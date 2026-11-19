export type NotificationMessage = {
  recipientUserIds: string[];
  type: string;
  title: string;
  body: string;
  resourceType?: string;
  resourceId?: string;
  dedupeKey?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
};

export type NotificationPublisher = {
  publish(input: NotificationMessage): Promise<void>;
};
