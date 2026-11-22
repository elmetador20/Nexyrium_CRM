# Nexyrium notifications

The bell opens **Settings ? Notifications**. Expense creators with submission permission can send an expense for review or save a draft. Reviewers open the expense and use its existing Approve and Reject controls. The employee's inbox links back to the decision.

## Deployment

1. Review the additive notification migration and apply it through the project's normal migration process after approval. Migration 0012 follows the existing Drive migration 0011. A previous deployment can continue using the inbox table while device delivery is being configured.
2. Set PUSH_CONTACT to a monitored mailto: address. Generate PUSH_VAPID_PRIVATE_KEY once on a trusted machine with Node's crypto.createECDH("prime256v1"), generateKeys(), and getPrivateKey().toString("base64url"). Store the result as a secret shared by the app instances. Keep this key stable across deployments.
3. Set NOTIFICATION_JOB_SECRET to a random 32-byte secret and NOTIFICATION_APP_ORIGIN to the HTTPS CRM origin. Run `node --env-file=.env.local scripts/notification-worker.mjs` as a continuously running service alongside Next.js. On serverless hosting, schedule the same script with --once or an authenticated POST to /api/internal/notification-delivery once per minute. Install the scheduler only once. The app checks reminder deadlines in Asia/Kolkata.
4. Open Settings ? Notifications on the phone and select **Enable on this device**, then **Send test**. On iOS 16.4+ install the app on the Home Screen first. A localhost URL on the developer's computer is insufficient for testing on a separate phone.
5. Test with an employee and an authorized Finance account on separate devices. Check a draft, a submission, receipt visibility, approval, rejection, loss of network, an expired subscription, duplicate submissions and a deactivated recipient. Use test data in a staging workspace.

## Delivery behavior

The notification row and its device queue entries share a transaction. Devices receive a generic lock-screen message, opening the signed-in inbox. Read items are skipped. Offline push providers are retried with bounded exponential backoff. Expired subscriptions are removed. Generic tags coalesce alerts on the phone while each inbox item remains available. Device delivery is best effort and requires browser permission, provider connectivity and a running worker. Configure server logs and job health monitoring for repeated failures.

Expense decisions, assigned tasks, reminders, quotation submissions and new project memberships use push. Other activity stays in the inbox. Existing invitees sign in through the established invite flow. A person who has never registered a device cannot receive a web push invitation.
