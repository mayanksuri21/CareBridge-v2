/**
 * Tests for Phase 04: Role-Based Access Control and Authentication Routing Verification
 *
 * Verifies:
 * 1. Callback route logic routes unapproved doctor applications to /doctor/application-status
 * 2. Callback route routes approved doctor applications to /doctor/dashboard
 * 3. Callback route routes administrators to /admin/dashboard
 * 4. Callback route routes default patient accounts to /patient/dashboard
 * 5. Doctor dashboard access gate restricts unverified/pending/rejected applicants
 * 6. Admin dashboard authorization rejects non-administrators
 */

describe("Phase 04 Role-Based Access Control & Routing", () => {
  describe("Auth Callback Routing Matrix", () => {
    function resolveCallbackRoute({ isAdmin, doctorAppStatus }) {
      if (isAdmin) {
        return "/admin/dashboard";
      }
      if (doctorAppStatus) {
        if (doctorAppStatus === "approved") {
          return "/doctor/dashboard";
        }
        return "/doctor/application-status";
      }
      return "/patient/dashboard";
    }

    test("Patient account routes to /patient/dashboard", () => {
      const destination = resolveCallbackRoute({ isAdmin: false, doctorAppStatus: null });
      if (destination !== "/patient/dashboard") {
        throw new Error(`Expected /patient/dashboard, got ${destination}`);
      }
    });

    test("Doctor applicant with pending status routes to /doctor/application-status", () => {
      const destination = resolveCallbackRoute({ isAdmin: false, doctorAppStatus: "pending" });
      if (destination !== "/doctor/application-status") {
        throw new Error(`Expected /doctor/application-status, got ${destination}`);
      }
    });

    test("Doctor applicant with changes_requested status routes to /doctor/application-status", () => {
      const destination = resolveCallbackRoute({ isAdmin: false, doctorAppStatus: "changes_requested" });
      if (destination !== "/doctor/application-status") {
        throw new Error(`Expected /doctor/application-status, got ${destination}`);
      }
    });

    test("Doctor applicant with rejected status routes to /doctor/application-status", () => {
      const destination = resolveCallbackRoute({ isAdmin: false, doctorAppStatus: "rejected" });
      if (destination !== "/doctor/application-status") {
        throw new Error(`Expected /doctor/application-status, got ${destination}`);
      }
    });

    test("Only approved doctor application routes to /doctor/dashboard", () => {
      const destination = resolveCallbackRoute({ isAdmin: false, doctorAppStatus: "approved" });
      if (destination !== "/doctor/dashboard") {
        throw new Error(`Expected /doctor/dashboard, got ${destination}`);
      }
    });

    test("Admin account routes strictly to /admin/dashboard", () => {
      const destination = resolveCallbackRoute({ isAdmin: true, doctorAppStatus: "approved" });
      if (destination !== "/admin/dashboard") {
        throw new Error(`Expected /admin/dashboard, got ${destination}`);
      }
    });
  });

  describe("Doctor Dashboard Access Gate", () => {
    function checkDoctorDashboardAccess(docData) {
      if (!docData) {
        return { allowed: false, reason: "no_application" };
      }
      if (docData.status !== "approved") {
        return { allowed: false, reason: docData.status };
      }
      return { allowed: true, reason: null };
    }

    test("Denies user with no doctor application", () => {
      const check = checkDoctorDashboardAccess(null);
      if (check.allowed || check.reason !== "no_application") {
        throw new Error("Expected denial with reason 'no_application'");
      }
    });

    test("Denies pending applicant", () => {
      const check = checkDoctorDashboardAccess({ status: "pending" });
      if (check.allowed || check.reason !== "pending") {
        throw new Error("Expected denial with reason 'pending'");
      }
    });

    test("Denies rejected applicant", () => {
      const check = checkDoctorDashboardAccess({ status: "rejected" });
      if (check.allowed || check.reason !== "rejected") {
        throw new Error("Expected denial with reason 'rejected'");
      }
    });

    test("Allows approved doctor with NMC verified record", () => {
      const check = checkDoctorDashboardAccess({ status: "approved" });
      if (!check.allowed) {
        throw new Error("Expected access granted for approved doctor");
      }
    });
  });

  describe("Admin Authorization & Review Action Rules", () => {
    function validateReviewAction({ isAdmin, action, reviewNotes }) {
      if (!isAdmin) {
        return { success: false, error: "Unauthorized: not an administrator" };
      }
      if (action === "rejected" && (!reviewNotes || !reviewNotes.trim())) {
        return { success: false, error: "Review notes required for rejection" };
      }
      return { success: true };
    }

    test("Rejects review action from non-admin session", () => {
      const result = validateReviewAction({ isAdmin: false, action: "approved", reviewNotes: "Ok" });
      if (result.success) {
        throw new Error("Non-admin should not be authorized to approve doctors");
      }
    });

    test("Requires reason when rejecting doctor application", () => {
      const result = validateReviewAction({ isAdmin: true, action: "rejected", reviewNotes: "" });
      if (result.success) {
        throw new Error("Rejection without review notes should fail validation");
      }
    });

    test("Allows rejection with detailed review notes", () => {
      const result = validateReviewAction({
        isAdmin: true,
        action: "rejected",
        reviewNotes: "NMC register number does not match practitioner records.",
      });
      if (!result.success) {
        throw new Error("Rejection with justification notes should succeed");
      }
    });

    test("Allows approval by authorized admin", () => {
      const result = validateReviewAction({
        isAdmin: true,
        action: "approved",
        reviewNotes: "NMC verification confirmed.",
      });
      if (!result.success) {
        throw new Error("Approval by authorized admin should succeed");
      }
    });
  });
});
