import { NextResponse } from "next/server";
import { createClientServer } from "../../../../../lib/supabase/server";
import { startTinyFishRun, normalizeMedicineKey } from "../../../../../lib/agents/tinyfish";
import { PHARMACIES } from "../../../../../lib/agents/pharmacies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const IN_FLIGHT_REUSE_MS = 2 * 60 * 1000; // 2 minutes

function fail(status, code, message) {
  return NextResponse.json({ error: code, message }, { status });
}

/**
 * POST /api/agents/prices/start
 *
 * Starts pharmacy price finder runs for a finalized prescription.
 * Body: { prescription_id: string }
 *
 * Requires auth. Caller must be the patient or doctor who issued it.
 * Prescription must be finalized.
 */
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const prescriptionId = body?.prescription_id;

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

  // Fetch prescription with items
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

  // Must be finalized
  if (prescription.status !== "finalized") {
    return fail(400, "invalid_status", "Prescription must be finalized to fetch prices.");
  }

  const medicines = prescription.prescription_items || [];
  const medicinesToCheck = medicines.slice(0, 5); // Cap at 5 medicines

  const runsStarted = [];
  const errors = [];

  // For each medicine × pharmacy
  for (const medicine of medicinesToCheck) {
    const medicineKey = normalizeMedicineKey(medicine.medicine_name, medicine.strength);

    for (const pharmacy of PHARMACIES) {
      try {
        // Check for recent completed run (cache)
        const cacheCutoff = new Date(Date.now() - CACHE_DURATION_MS).toISOString();
        const { data: cachedRun } = await supabase
          .from("agent_runs")
          .select("*")
          .eq("kind", "price")
          .eq("subject_key", medicineKey)
          .eq("site", pharmacy.name)
          .eq("status", "completed")
          .gte("created_at", cacheCutoff)
          .maybeSingle();

        if (cachedRun) {
          runsStarted.push({
            medicine: medicineKey,
            pharmacy: pharmacy.name,
            cached: true,
            agentRunId: cachedRun.id,
          });
          continue;
        }

        // Check for in-flight run (reuse)
        const inFlightCutoff = new Date(Date.now() - IN_FLIGHT_REUSE_MS).toISOString();
        const { data: inFlightRun } = await supabase
          .from("agent_runs")
          .select("*")
          .eq("kind", "price")
          .eq("subject_key", medicineKey)
          .eq("site", pharmacy.name)
          .in("status", ["pending", "running"])
          .gte("created_at", inFlightCutoff)
          .maybeSingle();

        if (inFlightRun) {
          runsStarted.push({
            medicine: medicineKey,
            pharmacy: pharmacy.name,
            cached: false,
            agentRunId: inFlightRun.id,
          });
          continue;
        }

        // Start new run
        const goal = `Search this pharmacy site for "${medicine.medicine_name} ${medicine.strength || ''}". Open the best matching product page. Return ONLY JSON: {"found": boolean, "product_name": string, "price_inr": number, "pack_size": string, "in_stock": boolean, "product_url": string}. If nothing matches, return {"found": false}. Do not guess prices.`;

        // Insert agent_runs record
        const { data: agentRun, error: insertError } = await supabase
          .from("agent_runs")
          .insert({
            kind: "price",
            subject_key: medicineKey,
            site: pharmacy.name,
            status: "pending",
            created_by: user.id,
          })
          .select("id")
          .single();

        if (insertError) {
          console.error("[Price Agent] Insert error:", insertError);
          errors.push(`${medicineKey} @ ${pharmacy.name}: insert failed`);
          continue;
        }

        // Start TinyFish run
        let tinyfishRunId;
        try {
          tinyfishRunId = await startTinyFishRun(pharmacy.url, goal);
        } catch (err) {
          console.error("[Price Agent] TinyFish start error:", err);
          await supabase
            .from("agent_runs")
            .update({ status: "failed", error: err.message })
            .eq("id", agentRun.id);
          errors.push(`${medicineKey} @ ${pharmacy.name}: ${err.message}`);
          continue;
        }

        // Update with tinyfish_run_id
        await supabase
          .from("agent_runs")
          .update({ tinyfish_run_id: tinyfishRunId, status: "running" })
          .eq("id", agentRun.id);

        runsStarted.push({
          medicine: medicineKey,
          pharmacy: pharmacy.name,
          cached: false,
          agentRunId: agentRun.id,
        });
      } catch (err) {
        console.error("[Price Agent] Error for", medicineKey, pharmacy.name, err);
        errors.push(`${medicineKey} @ ${pharmacy.name}: ${err.message}`);
      }
    }
  }

  return NextResponse.json({
    success: true,
    runsStarted,
    errors,
    message: `Started ${runsStarted.length} price checks${errors.length > 0 ? ` with ${errors.length} errors` : ""}.`,
  });
}
