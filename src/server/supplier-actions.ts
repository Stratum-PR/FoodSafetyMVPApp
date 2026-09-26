"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import type { ApprovalError, ApprovalField } from "@/domain/approval";
import { isAppError } from "@/domain/errors";
import type { NewSupplierError, NewSupplierField } from "@/domain/new-supplier";
import type { NonconformityError, NonconformityField } from "@/domain/nonconformity";
import type { Denial } from "@/domain/permissions";

import { changeSupplierStatus, recordNonconformity } from "./approvals";
import { getRequestContext } from "./context";
import { createSupplier } from "./suppliers";

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
};

export type StatusFormState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "invalid"; errors: Partial<Record<ApprovalField, ApprovalError>> }
  | { status: "denied"; denial: Denial | "not_found" };

/** Approve, approve with conditions, suspend, deactivate… (company and supplier bound on the page). */
export async function changeStatusAction(
  company: string,
  partyId: string,
  _previous: StatusFormState,
  form: FormData,
): Promise<StatusFormState> {
  try {
    const ctx = await getRequestContext(company);
    const outcome = await changeSupplierStatus(ctx, partyId, {
      action: text(form, "action"),
      reason: text(form, "reason"),
      conditions: text(form, "conditions"),
      reviewBy: text(form, "reviewBy"),
    });
    if (!outcome.ok) {
      return "denial" in outcome
        ? { status: "denied", denial: outcome.denial }
        : { status: "invalid", errors: outcome.errors };
    }
  } catch (error) {
    if (isAppError(error)) {
      return { status: "denied", denial: error.code === "forbidden" ? "no_permission" : "not_found" };
    }
    throw error;
  }
  // Approval changes the supplier list, the panel and this page.
  revalidatePath(`/${company}`, "layout");
  return { status: "done" };
}

export type NonconformityFormState =
  | { status: "idle" }
  | { status: "done" }
  | { status: "invalid"; errors: Partial<Record<NonconformityField, NonconformityError>> }
  | { status: "denied"; denial: "no_permission" | "not_found" };

export async function recordNonconformityAction(
  company: string,
  partyId: string,
  _previous: NonconformityFormState,
  form: FormData,
): Promise<NonconformityFormState> {
  try {
    const ctx = await getRequestContext(company);
    const outcome = await recordNonconformity(ctx, partyId, {
      date: text(form, "date"),
      severity: text(form, "severity"),
      description: text(form, "description"),
      lotCode: text(form, "lotCode"),
    });
    if (!outcome.ok) return { status: "invalid", errors: outcome.errors };
  } catch (error) {
    if (isAppError(error)) {
      return { status: "denied", denial: error.code === "forbidden" ? "no_permission" : "not_found" };
    }
    throw error;
  }
  revalidatePath(`/${company}`, "layout");
  return { status: "done" };
}

export type NewSupplierFormState =
  | { status: "idle" }
  | { status: "invalid"; errors: Partial<Record<NewSupplierField, NewSupplierError>> }
  | { status: "denied" };

/** Adds a supplier and opens its page, where documents and materials come next. */
export async function createSupplierAction(
  company: string,
  _previous: NewSupplierFormState,
  form: FormData,
): Promise<NewSupplierFormState> {
  let id: string;
  try {
    const ctx = await getRequestContext(company);
    const outcome = await createSupplier(ctx, {
      name: text(form, "name"),
      type: text(form, "type"),
      city: text(form, "city"),
      country: text(form, "country"),
      fei: text(form, "fei"),
    });
    if (!outcome.ok) return { status: "invalid", errors: outcome.errors };
    id = outcome.id;
  } catch (error) {
    if (isAppError(error)) return { status: "denied" };
    throw error;
  }
  revalidatePath(`/${company}`, "layout");
  // redirect() works by throwing, so it stays outside the try/catch.
  redirect(`/${company}/suplidores/${encodeURIComponent(id)}?nuevo=1`);
}
