"use server";

import { revalidatePath } from "next/cache";

import { isAppError } from "@/domain/errors";
import type { ReviewDenial } from "@/domain/review";

import { getRequestContext } from "./context";
import { decideDocument } from "./documents";

export type ReviewFormState =
  | { status: "idle" }
  | { status: "done"; decision: "accept" | "reject"; superseded: number }
  | { status: "error"; code: ReviewDenial | "not_found" | "invalid" };

/**
 * The Aceptar / Rechazar form. company and documentId are bound on the server page; the
 * decision comes from the button pressed. Expected failures come back as a code the form
 * shows as a message; anything else goes to the error page with a reference.
 */
export async function reviewDocumentAction(
  company: string,
  documentId: string,
  _previous: ReviewFormState,
  form: FormData,
): Promise<ReviewFormState> {
  const decision = form.get("decision");
  const reason = form.get("reason");
  if ((decision !== "accept" && decision !== "reject") || (reason !== null && typeof reason !== "string")) {
    return { status: "error", code: "invalid" };
  }

  try {
    const ctx = await getRequestContext(company);
    const outcome = await decideDocument(ctx, documentId, decision, reason ?? "");
    if (!outcome.ok) return { status: "error", code: outcome.denial };
    // Compliance, the panel and the supplier pages all change with a decision.
    revalidatePath(`/${company}`, "layout");
    return { status: "done", decision, superseded: outcome.superseded };
  } catch (error) {
    if (isAppError(error)) {
      return { status: "error", code: error.code === "forbidden" ? "no_permission" : "not_found" };
    }
    throw error;
  }
}
