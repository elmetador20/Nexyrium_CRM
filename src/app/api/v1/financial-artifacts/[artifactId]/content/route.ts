import { NextResponse } from "next/server";

import { getFinancialArtifact } from "@/features/finance/documents/artifact-service";
import { financeStorage, invoiceService, quotationService } from "@/features/finance/server";
import { financeErrorResponse } from "@/features/finance/shared/errors";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";

export async function GET(request: Request, { params }: { params: Promise<{ artifactId: string }> }) {
  try {
    const actor = await requirePermission(PERMISSIONS.FINANCIAL_DOCUMENTS_DOWNLOAD);
    const { artifactId } = await params;
    const artifact = await getFinancialArtifact(artifactId);
    if (!artifact || artifact.status !== "available") return NextResponse.json({ error: "Financial artifact not found.", code: "NOT_FOUND" }, { status: 404 });
    if (artifact.quotationId) await quotationService.get(actor, artifact.quotationId);
    if (artifact.invoiceId) await invoiceService.get(actor, artifact.invoiceId);
    const body = await financeStorage().download(artifact.providerObjectId);
    return new NextResponse(body.body as unknown as BodyInit, { status: 200, headers: { "content-type": "application/pdf", "content-length": String(body.sizeBytes), "content-disposition": `inline; filename="${artifact.filename.replace(/"/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff", "x-correlation-id": request.headers.get("x-correlation-id") ?? "" } });
  } catch (error) { return financeErrorResponse(error) ?? authorizationErrorResponse(error); }
}
