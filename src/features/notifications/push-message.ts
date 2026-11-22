export const genericPushMessage = {
  title: "Nexyrium",
  body: "Open your inbox to view your notifications.",
} as const;

const templates = {
  "expense.submitted": ["Expense ready for review", "A new expense requires your approval. Tap to review."],
  "expense.approved": ["Expense approved", "Your submitted expense has been approved."],
  "expense.rejected": ["Expense rejected", "Your submitted expense has been rejected. Tap to review."],
  "task.assigned": ["New task assigned", "A task has been assigned to you."],
  "task.due": ["Task reminder", "A task requires your attention."],
  "lead.follow_up": ["Lead follow-up due", "You have a lead follow-up to review."],
  "quotation.submitted": ["Quotation ready for review", "A quotation requires your attention."],
  "project.member.added": ["Added to a project", "You have been added to a project."],
  "invoice.overdue": ["Invoice payment overdue", "An invoice requires your attention."],
} as const satisfies Record<string, readonly [string, string]>;

function hasTemplate(type: unknown): type is keyof typeof templates {
  return typeof type === "string" && Object.hasOwn(templates, type);
}

export function pushMessage(type: unknown) {
  if (!hasTemplate(type)) return genericPushMessage;
  const [title, body] = templates[type];
  return { title, body };
}
