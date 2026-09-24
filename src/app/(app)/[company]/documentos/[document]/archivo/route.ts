import type { NextRequest } from "next/server";

import { isAppError } from "@/domain/errors";
import { getRequestContext } from "@/server/context";
import { getDocumentFile } from "@/server/documents";

/**
 * A document's file. Shown in the page (?descargar=1 downloads it instead). Only people who can
 * see the company's documents get it, and it's never cached by browsers or proxies.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/[company]/documentos/[document]/archivo">) {
  const { company, document } = await ctx.params;
  try {
    const context = await getRequestContext(company);
    const found = await getDocumentFile(context, decodeURIComponent(document));
    if (!found) return new Response("Not found", { status: 404 });

    const { data, file } = found;
    const download = request.nextUrl.searchParams.get("descargar") === "1";
    return new Response(Buffer.from(data), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Length": String(data.byteLength),
        // The name was made safe on upload (letters, digits, dot, dash, underscore).
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file.name}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        // Only this app may show it in a frame.
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  } catch (error) {
    if (isAppError(error)) return new Response(null, { status: error.code === "forbidden" ? 403 : 404 });
    throw error;
  }
}
