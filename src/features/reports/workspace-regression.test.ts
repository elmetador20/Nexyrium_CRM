import { test } from "node:test";
import assert from "node:assert/strict";
import { leadIntakeSchema, manualCrmLeadSchema } from "../lead-intake/schemas";
import { expenseCreateSchema, expenseUpdateSchema } from "../accounting/schemas";
import { taskCreateSchema } from "../tasks/schemas";

test("manual leads require a company and phone while ingestion still accepts incomplete leads",()=>{
  const lead={eventId:"synthetic-event",source:"whatsapp",contactName:"Contact"};
  assert.equal(leadIntakeSchema.safeParse(lead).success,true);
  assert.equal(manualCrmLeadSchema.safeParse({...lead,companyName:"Agency"}).success,false);
  assert.equal(manualCrmLeadSchema.safeParse({...lead,phone:"5551234567"}).success,false);
  assert.equal(manualCrmLeadSchema.safeParse({...lead,companyName:"Agency",phone:"5551234567"}).success,true);
});

test("omitted expense category defaults on creation and stays untouched on a partial edit",()=>{
  const expense={description:"Hosting",amountMinor:"25000",currencyCode:"INR",incurredOn:"2026-11-01"};
  assert.equal(expenseCreateSchema.parse(expense).category,"Other");
  assert.deepEqual(expenseUpdateSchema.parse({description:"Hosting renewal"}),{description:"Hosting renewal"});
});

test("project tasks accept just a title",()=>{
  const result=taskCreateSchema.parse({title:"Review invoice"});
  assert.equal(result.status,"todo");
  assert.equal(result.priority,"medium");
});
