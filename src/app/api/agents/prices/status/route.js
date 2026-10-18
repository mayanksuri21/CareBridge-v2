import { NextResponse } from "next/server";
import { createClientServer } from "../../../../../lib/supabase/server";
import {
  getTinyFishRunStatus,
  cancelTinyFishRun,
  parseAgentResult,
  isRunRunning,
  isRunTerminal,
} from "../../../../../lib/agents/tinyfish";
import { PHARMACIES } from "../../../../../lib/agents/pharmacies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RUN_TIMEOUT_MS = 90000; // 90 seconds
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

function fail(status, code, message) {
  return NextResponse.json({ error: code, message }, { status });
}

/**
 * GET /api/agents/prices/status?prescription_id=<uuid>
 *
 * Refreshes pending runs and returns ranked pharmacy prices per medicine.
 * Same authorization as start (patient or doctor).
 */
export async function GET(request) {
  const prescriptionId = request.nextUrl.searchParams.get("prescription_id");

  if (typeof prescriptionId !== "string" || !UUID_RE.test(prescriptionId)) {
    return fail(400, "invalid_prescription_id", "A valid prescription_id is required.");
  }

  const supabase = createClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail(401, "unauthenticated", "You must be signed in.");
  }

  // Fetch prescription
  const { data: prescription, error: prescriptionError } = await supabase
    .from("prescriptions")
    .select("id, patient_id, doctor_id, status, prescription_items (*)")
    .eq("id", prescriptionId)
    .maybeSingle();

  if (prescriptionError) {
    return fail(500, "prescription_lookup_failed", "Could not load the prescription.");
  }
  if (!prescription) {
    return fail(404, "prescription_not_found", "Prescription not found.");
  }

  // Verify authorization
  const isPatient = prescription.patient_id === user.id;
  const isDoctor = prescription.doctor_id === user.id;

  if (!isPatient && !isDoctor) {
    return fail(403, "not_authorized", "You are not authorized to access this prescription.");
  }

  const medicines = prescription.prescription_items || [];
  const medicinesToCheck = medicines.slice(0, 5);

  const results = {};

  // For each medicine × pharmacy
  for (const medicine of medicinesToCheck) {
    const medicineKey = `${medicine.medicine_name} ${medicine.strength || ''}`.toLowerCase().trim().replace(/\s+/g, ' ');
    const medicineResults = [];

    for (const pharmacy of PHARMACIES) {
      try {
        // Fetch latest run for this medicine+pharmacy
        const { data: agentRun } = await supabase
          .from("agent_runs")
          .select("*")
          .eq("kind", "price")
          .eq("subject_key", medicineKey)
          .eq("site", pharmacy.name)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!agentRun) {
          continue;
        }

        // Refresh if still running
        if (isRunRunning(agentRun.status) && agentRun.tinyfish_run_id) {
          const age = Date.now() - new Date(agentRun.created_at).getTime();

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
              console.error("[Price Status] Refresh error:", err);
            }
          }
        }

        // Parse result if completed
        if (agentRun.status === "completed" && agentRun.result) {
          const parsed = parseAgentResult(agentRun.result);

          if (parsed && parsed.found && typeof parsed.price_inr === "number" && parsed.price_inr > 0) {
            const age = Date.now() - new Date(agentRun.created_at).getTime();
            const isCached = age > CACHE_DURATION_MS;

            medicineResults.push({
              pharmacy: pharmacy.name,
              product_name: parsed.product_name,
              price_inr: parsed.price_inr,
              pack_size: parsed.pack_size,
              in_stock: parsed.in_stock,
              product_url: parsed.product_url,
              cached: isCached,
              age_hours: Math.floor(age / (60 * 60 * 1000)),
            });
          }
        }
      } catch (err) {
        console.error("[Price Status] Error for", medicineKey, pharmacy.name, err);
      }
    }

    // Sort: in-stock first by price, then out-of-stock by price
    medicineResults.sort((a, b) => {
      if (a.in_stock && !b.in_stock) return -1;
      if (!a.in_stock && b.in_stock) return 1;
      return a.price_inr - b.price_inr;
    });

    results[medicineKey] = medicineResults;
  }

  return NextResponse.json({
    success: true,
    results,
  });
}
