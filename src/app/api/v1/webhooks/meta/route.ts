import { NextResponse } from "next/server";

import { MetaIntegrationError } from "@/features/integrations/meta/service";
import { metaIntegrationService } from "@/features/integrations/meta";

function errorResponse(error: unknown) {
  if (error instanceof MetaIntegrationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  return NextResponse.json({ error: "Meta webhook processing failed.", code: "META_WEBHOOK_FAILED" }, { status: 500 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const result = metaIntegrationService.verifyChallenge({
    mode: url.searchParams.get("hub.mode"),
    verifyToken: url.searchParams.get("hub.verify_token"),
    challenge: url.searchParams.get("hub.challenge"),
  });
  return result.ok ? new NextResponse(result.challenge, { status: 200 }) : NextResponse.json({ error: "Meta webhook verification failed.", code: "META_CHALLENGE_INVALID" }, { status: 403 });
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const result = await metaIntegrationService.receive({
      rawBody,
      signatureHeader: request.headers.get("x-hub-signature-256"),
      correlationId: request.headers.get("x-correlation-id") ?? crypto.randomUUID(),
    });
    return NextResponse.json(result, { status: result.status === "needs_review" ? 202 : result.status === "failed" ? 502 : 200 });
  } catch (error) {
    return errorResponse(error);
  }
}
