CREATE TABLE "notification_push_deliveries" (
	"notification_id" uuid NOT NULL,
	"device_id" uuid NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_push_deliveries_notification_id_device_id_pk" PRIMARY KEY("notification_id","device_id")
);
--> statement-breakpoint
CREATE TABLE "notification_push_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_push_deliveries" ADD CONSTRAINT "notification_push_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_push_deliveries" ADD CONSTRAINT "notification_push_deliveries_device_id_notification_push_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."notification_push_devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_push_devices" ADD CONSTRAINT "notification_push_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_deliveries_due_idx" ON "notification_push_deliveries" USING btree ("next_attempt_at");--> statement-breakpoint
CREATE UNIQUE INDEX "push_devices_endpoint_unique" ON "notification_push_devices" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_devices_user_idx" ON "notification_push_devices" USING btree ("user_id");
--> statement-breakpoint
CREATE FUNCTION nx_queue_push() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.type IN ('expense.submitted','expense.approved','expense.rejected','task.assigned','task.due','lead.follow_up','invoice.overdue','quotation.submitted','project.member.added','push.test') THEN
    INSERT INTO notification_push_deliveries(notification_id,device_id)
      SELECT NEW.id,id FROM notification_push_devices WHERE user_id=NEW.recipient_user_id
      ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER nx_queue_push AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION nx_queue_push();
--> statement-breakpoint
CREATE FUNCTION nx_record_notice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  kind text; label text; resource text; audience uuid[]; team uuid; permission_slug text;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'leads' THEN
      IF NEW.owner_id IS NULL OR (TG_OP='UPDATE' AND NEW.owner_id IS NOT DISTINCT FROM OLD.owner_id) THEN RETURN NEW; END IF;
      kind:='lead.assigned'; label:='A lead was assigned to you'; resource:='lead'; audience:=ARRAY[NEW.owner_id];
    WHEN 'deals' THEN
      IF NEW.stage NOT IN ('won','lost') OR (TG_OP='UPDATE' AND OLD.stage=NEW.stage) THEN RETURN NEW; END IF;
      kind:='deal.'||NEW.stage; label:='Deal marked '||NEW.stage; resource:='deal'; audience:=ARRAY[NEW.owner_id]; team:=NEW.department_id;
    WHEN 'quotations' THEN
      IF OLD.status=NEW.status OR NEW.status NOT IN ('submitted','approved','rejected','accepted') THEN RETURN NEW; END IF;
      kind:='quotation.'||NEW.status; label:='Quotation '||NEW.status; resource:='quotation';
      audience:=ARRAY[NEW.owner_id,NEW.created_by_user_id]; team:=NEW.department_id;
      IF NEW.status='submitted' THEN permission_slug:='quotations:approve'; END IF;
    WHEN 'payments' THEN
      kind:='payment.recorded'; label:='A payment was recorded'; resource:='payment'; audience:=ARRAY[NEW.owner_id]; team:=NEW.department_id; permission_slug:='payments:read';
    ELSE RETURN NEW;
  END CASE;
  INSERT INTO notifications(recipient_user_id,type,title,body,resource_type,resource_id,metadata)
    SELECT u.id,kind,label,'Open the record for details.',resource,NEW.id,'{}'::jsonb
    FROM users u WHERE u.is_active AND NOT EXISTS(SELECT 1 FROM people_profiles p WHERE p.user_id=u.id AND p.employment_status='terminated')
    AND (u.id=ANY(audience) OR EXISTS(
      SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND (
        (permission_slug IS NOT NULL AND r.slug IN ('owner_admin','founder'))
        OR (EXISTS(SELECT 1 FROM user_departments ud WHERE ud.department_id=team AND ud.user_id=u.id)
          AND ((resource='deal' AND r.slug='department_lead') OR (r.slug IN ('finance','department_lead') AND EXISTS(
            SELECT 1 FROM role_permissions rp JOIN permissions p ON p.id=rp.permission_id
            WHERE rp.role_id=r.id AND p.slug=permission_slug)))))));
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER nx_lead_notice AFTER INSERT OR UPDATE OF owner_id ON leads FOR EACH ROW EXECUTE FUNCTION nx_record_notice();
--> statement-breakpoint
CREATE TRIGGER nx_deal_notice AFTER INSERT OR UPDATE OF stage ON deals FOR EACH ROW EXECUTE FUNCTION nx_record_notice();
--> statement-breakpoint
CREATE TRIGGER nx_quotation_notice AFTER UPDATE OF status ON quotations FOR EACH ROW EXECUTE FUNCTION nx_record_notice();
--> statement-breakpoint
CREATE TRIGGER nx_payment_notice AFTER INSERT ON payments FOR EACH ROW EXECUTE FUNCTION nx_record_notice();

--> statement-breakpoint
CREATE FUNCTION nx_document_notice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='available' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.owner_id IS DISTINCT FROM NEW.created_by_user_id
    AND coalesce(NEW.category,'') <> 'expense_receipt' THEN
    INSERT INTO notifications(recipient_user_id,type,title,body,resource_type,resource_id,dedupe_key,metadata)
      SELECT u.id,'document.available','A business document is available','Open Documents to review the upload.',
        'document',NEW.id,concat('document-available:',NEW.id,':',u.id),'{}'::jsonb FROM users u
      WHERE u.id=NEW.owner_id AND u.is_active AND NOT EXISTS
        (SELECT 1 FROM people_profiles p WHERE p.user_id=u.id AND p.employment_status='terminated')
      ON CONFLICT(dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
--> statement-breakpoint
CREATE TRIGGER nx_document_notice AFTER UPDATE OF status ON documents FOR EACH ROW EXECUTE FUNCTION nx_document_notice();
--> statement-breakpoint
CREATE FUNCTION nx_team_notice() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE member_id uuid; inviting_id uuid;
BEGIN
  IF TG_TABLE_NAME='invitations' THEN
    inviting_id:=NEW.invited_by_user_id;
    INSERT INTO notifications(recipient_user_id,type,title,body,resource_type,resource_id,metadata)
      SELECT u.id,'team.invitation','A team invitation was created','Open People to manage invitations.','team',NEW.id,'{}'::jsonb
      FROM users u WHERE u.is_active AND u.id IS DISTINCT FROM inviting_id
      AND NOT EXISTS (SELECT 1 FROM people_profiles p WHERE p.user_id=u.id AND p.employment_status='terminated')
      AND EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.slug IN ('owner_admin','founder'));
  ELSE
    IF TG_OP='DELETE' THEN member_id:=OLD.user_id; ELSE member_id:=NEW.user_id; END IF;
    INSERT INTO notifications(recipient_user_id,type,title,body,metadata)
      SELECT id,'team.role_changed','Your workspace access was updated','Your current roles apply the next time you open a record.','{}'::jsonb
      FROM users WHERE id=member_id AND is_active AND NOT EXISTS
        (SELECT 1 FROM people_profiles p WHERE p.user_id=member_id AND p.employment_status='terminated');
  END IF;
  RETURN NULL;
END $$;
--> statement-breakpoint
CREATE TRIGGER nx_invite_notice AFTER INSERT ON invitations FOR EACH ROW EXECUTE FUNCTION nx_team_notice();
--> statement-breakpoint
CREATE TRIGGER nx_role_notice AFTER INSERT OR DELETE ON user_roles FOR EACH ROW EXECUTE FUNCTION nx_team_notice();
