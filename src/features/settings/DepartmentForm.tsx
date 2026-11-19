"use client";

import { useActionState } from "react";
import { createDepartment, type DepartmentFormState } from "./departments";

export function DepartmentForm() {
  const [state, action, pending] = useActionState<DepartmentFormState, FormData>(createDepartment, {});
  return (
    <form action={action} className="flex flex-wrap items-start gap-2">
      <label className="sr-only" htmlFor="department-name">Department name</label>
      <input id="department-name" name="name" required minLength={2} maxLength={150} placeholder="e.g. Marketing" className="input mt-0 min-w-0 flex-1 basis-48" />
      <button className="button-primary px-4 py-2 text-sm" disabled={pending}>{pending ? "Adding…" : "Add department"}</button>
      {state.error ? <p role="alert" className="w-full text-sm text-danger">{state.error}</p> : null}
      {state.created ? <p role="status" className="w-full text-sm text-success">{state.created} added.</p> : null}
    </form>
  );
}
