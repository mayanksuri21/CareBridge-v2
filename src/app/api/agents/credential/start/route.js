import { NextResponse } from "next/server";
import { createClientServer } from "../../../../../lib/supabase/server";
import { startTinyFishRun } from "../../../../../lib/agents/tinyfish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(status, code, message) {
  return NextResponse.json({ error: code, message }, { status });
}

/**
 * POST /api/agents/credential/start
 *
 * Starts a credential verification agent run for a doctor application.
 * Body: { application_id: string }
 *
 * Requires auth. Caller must own the application or be admin.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const applicationId = body?.application_id;

  if (typeof applicationId !== "string" || !UUID_RE.test(applicationId)) {
    return fail(400, "invalid_application_id", "A valid application_id is required.");
  }

  const supabase = createClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(401, "unauthenticated", "You must be signed in.");
  }

  // Fetch application and verify ownership
  const { data: application, error: appError } = await supabase
    .from("doctor_applications")
    .select("id, user_id, registration_number, full_name")
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) {
    return fail(500, "application_lookup_failed", "Could not load the application.");
  }
  if (!application) {
    return fail(404, "application_not_found", "Application not found.");
  }

  // Check ownership or admin
  const isAdmin = await supabase.rpc("is_admin");
  const isOwner = application.user_id === user.id;

  if (!isOwner && !isAdmin) {
    return fail(403, "not_authorized", "You do not have permission to start verification for this application.");
  }

  const registrationNumber = application.registration_number;
  const nmcUrl = process.env.NMC_REGISTRY_URL || "https://www.nmc.org.in/information-system/indian-medical-register/";

  const goal = `Search the public medical register for registration number ${registrationNumber}. Return ONLY JSON: {"found": boolean, "name": string|null, "registration_number": string|null, "status": string|null, "specialty": string|null, "council": string|null, "blocked": boolean}. If a captcha or login blocks you, return {"found": false, "blocked": true}. Do not guess or invent values.`;

  try {
    // Insert agent_runs record
    const { data: agentRun, error: insertError } = await supabase
      .from("agent_runs")
      .insert({
        kind: "credential",
        subject_key: applicationId,
        site: "nmc_registry",
        status: "pending",
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertError) {
      console.error("[Credential Agent] Insert error:", insertError);
      return fail(500, "agent_run_insert_failed", "Could not create agent run record.");
    }

    // Start TinyFish run
    let tinyfishRunId;
    try {
      tinyfishRunId = await startTinyFishRun(nmcUrl, goal);
    } catch (err) {
      console.error("[Credential Agent] TinyFish start error:", err);
      // Mark as failed
      await supabase
        .from("agent_runs")
        .update({ status: "failed", error: err.message })
        .eq("id", agentRun.id);
      return fail(500, "tinyfish_start_failed", "Failed to start verification agent.");
    }

    // Update with tinyfish_run_id
    const { error: updateError } = await supabase
      .from("agent_runs")
      .update({ tinyfish_run_id: tinyfishRunId, status: "running" })
      .eq("id", agentRun.id);

    if (updateError) {
      console.error("[Credential Agent] Update error:", updateError);
    }

    return NextResponse.json({
      success: true,
      agentRunId: agentRun.id,
      message: "Credential verification started.",
    });
  } catch (err) {
    console.error("[Credential Agent] Unexpected error:", err);
    return fail(500, "unexpected_error", "An unexpected error occurred.");
  }
}
