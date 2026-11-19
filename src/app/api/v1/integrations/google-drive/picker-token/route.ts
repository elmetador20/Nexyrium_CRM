import { NextResponse } from "next/server";

import { pickerAccessToken } from "@/features/integrations/google-drive/connection";
import { PERMISSIONS } from "@/lib/authorization/permissions";
import { authorizationErrorResponse, requirePermission } from "@/lib/authorization/server";
import { getGoogleDriveEnv } from "@/lib/env";
import { StorageError } from "@/lib/storage";

const noStore = { "cache-control": "private, no-store", "x-content-type-options": "nosniff" };

/**
 * Returns what the Google Picker needs in the browser: a short-lived (≈1h) drive.file access token,
 * the browser API key and the Cloud project number. The refresh token and client secret stay server-side.
 */
export async function GET() {
  try {
    await requirePermission(PERMISSIONS.SETTINGS_MANAGE);
    const env = getGoogleDriveEnv();
    // Safe diagnostics: presence/length only. Never log the key, project number value or tokens.
    console.info("[google-picker] server config", {
      apiKeyPresent: Boolean(env.GOOGLE_PICKER_API_KEY),
      apiKeyLength: env.GOOGLE_PICKER_API_KEY?.length ?? 0,
      projectNumberPresent: Boolean(env.GOOGLE_CLOUD_PROJECT_NUMBER),
      projectNumberDigits: env.GOOGLE_CLOUD_PROJECT_NUMBER?.length ?? 0,
      projectNumberMatchesOAuthClient: Boolean(env.GOOGLE_CLOUD_PROJECT_NUMBER) && process.env.AUTH_GOOGLE_ID?.split("-")[0] === env.GOOGLE_CLOUD_PROJECT_NUMBER,
    });
    if (!env.GOOGLE_PICKER_API_KEY || !env.GOOGLE_CLOUD_PROJECT_NUMBER) {
      return NextResponse.json({ error: "Google Picker is not configured (GOOGLE_PICKER_API_KEY and GOOGLE_CLOUD_PROJECT_NUMBER are required).", code: "PICKER_NOT_CONFIGURED" }, { status: 503, headers: noStore });
    }
    const accessToken = await pickerAccessToken();
    return NextResponse.json({ accessToken, apiKey: env.GOOGLE_PICKER_API_KEY, appId: env.GOOGLE_CLOUD_PROJECT_NUMBER }, { headers: noStore });
  } catch (error) {
    if (error instanceof StorageError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    return authorizationErrorResponse(error);
  }
}
