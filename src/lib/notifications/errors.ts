export class NotificationError extends Error {
  constructor(message = "The notification could not be published.") {
    super(message);
    this.name = "NotificationError";
  }
}
