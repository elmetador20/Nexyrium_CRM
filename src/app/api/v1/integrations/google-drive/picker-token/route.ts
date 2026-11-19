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
