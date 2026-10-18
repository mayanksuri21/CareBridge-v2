import { NextResponse } from "next/server";
import { createClientServer } from "../../../../../lib/supabase/server";
import {
  getTinyFishRunStatus,
  cancelTinyFishRun,
  parseAgentResult,
  isRunRunning,
  isRunTerminal,
  normalizeNameForComparison,
  isActiveStatus,
} from "../../../../../lib/agents/tinyfish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RUN_TIMEOUT_MS = 90000; // 90 seconds

function fail(status, code, message) {
  return NextResponse.json({ error: code, message }, { status });
}

/**
 * GET /api/agents/credential/status?application_id=<uuid>
 *
 * Refreshes and returns the credential verification run status.
 * Admin-only.
 */
export async function GET(request) {
  const applicationId = request.nextUrl.searchParams.get("application_id");

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

  // Verify admin
  const isAdmin = await supabase.rpc("is_admin");
  if (!isAdmin) {
    return fail(403, "not_authorized", "Administrator privileges required.");
  }

  // Fetch application
  const { data: application, error: appError } = await supabase
    .from("doctor_applications")
    .select("id, full_name, registration_number")
    .eq("id", applicationId)
    .maybeSingle();

  if (appError) {
    return fail(500, "application_lookup_failed", "Could not load the application.");
  }
  if (!application) {
    return fail(404, "application_not_found", "Application not found.");
  }

  // Fetch latest agent run
  const { data: agentRun, error: runError } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("kind", "credential")
    .eq("subject_key", applicationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (runError) {
    return fail(500, "agent_run_lookup_failed", "Could not load agent run.");
  }

  if (!agentRun) {
    return NextResponse.json({
      exists: false,
      message: "No verification run found for this application.",
    });
  }

  // Refresh if still running
  if (isRunRunning(agentRun.status) && agentRun.tinyfish_run_id) {
    const age = Date.now() - new Date(agentRun.created_at).getTime();

    // Check for timeout
    if (age > RUN_TIMEOUT_MS) {
      await cancelTinyFishRun(agentRun.tinyfish_run_id);
      await supabase
        .from("agent_runs")
        .update({ status: "timeout", error: "Run exceeded 90 second timeout" })
        .eq("id", agentRun.id);
      agentRun.status = "timeout";
    } else {
      try {
        const tinyfishStatus = await getTinyFishRunStatus(agentRun.tinyfish_run_id);

        const newStatus = tinyfishStatus.status === "COMPLETED" ? "completed"
          : tinyfishStatus.status === "FAILED" ? "failed"
            : tinyfishStatus.status === "CANCELLED" ? "cancelled"
              : "running";

        const updateData = { status: newStatus };
        if (newStatus === "completed" && tinyfishStatus.result) {
          updateData.result = tinyfishStatus.result;
        }
        if (newStatus === "failed" && tinyfishStatus.error) {
          updateData.error = JSON.stringify(tinyfishStatus.error);
        }

        await supabase
          .from("agent_runs")
          .update(updateData)
          .eq("id", agentRun.id);

        agentRun.status = newStatus;
        agentRun.result = updateData.result || agentRun.result;
        agentRun.error = updateData.error || agentRun.error;
      } catch (err) {
        console.error("[Credential Status] Refresh error:", err);
        // Don't fail the request, just return stale status
      }
    }
  }

  // Determine comparison status
  let comparison = "unverified";
  const result = parseAgentResult(agentRun.result);

  if (agentRun.status === "completed" && result) {
    if (result.blocked) {
      comparison = "unverified";
    } else if (!result.found) {
      comparison = "unverified";
    } else {
      const registryName = normalizeNameForComparison(result.name);
      const applicantName = normalizeNameForComparison(application.full_name);
      const active = isActiveStatus(result.status);

      if (registryName === applicantName && active) {
        comparison = "match";
      } else {
        comparison = "mismatch";
      }
    }
  }

  return NextResponse.json({
    exists: true,
    agentRun: {
      id: agentRun.id,
      status: agentRun.status,
      comparison,
      result: agentRun.result,
      error: agentRun.error,
      created_at: agentRun.created_at,
      updated_at: agentRun.updated_at,
    },
  });
}
