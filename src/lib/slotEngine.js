/**
 * Helper to compute availability and slots for doctors
 * Can run safely on both client and server
 */

export function computeDoctorDirectoryAvailability(doctors, schedules, leaves) {
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const todayStr = `${nowIST.getFullYear()}-${String(nowIST.getMonth() + 1).padStart(2, "0")}-${String(nowIST.getDate()).padStart(2, "0")}`;
  const earliestAllowedTime = new Date(Date.now() + 30 * 60 * 1000);

  const schedulesByDoc = {};
  (schedules || []).forEach((s) => {
    if (!schedulesByDoc[s.doctor_id]) schedulesByDoc[s.doctor_id] = [];
    schedulesByDoc[s.doctor_id].push(s);
  });

  const leavesByDoc = {};
  (leaves || []).forEach((l) => {
    if (!leavesByDoc[l.doctor_id]) leavesByDoc[l.doctor_id] = [];
    leavesByDoc[l.doctor_id].push(l);
  });

  return (doctors || []).map((doc) => {
    const docSchedules = schedulesByDoc[doc.doctor_id] || [];
    const docLeaves = leavesByDoc[doc.doctor_id] || [];

    const isOnLeaveToday = docLeaves.some(
      (l) => l.leave_start <= todayStr && l.leave_end >= todayStr
    );

    const activeDays = Array.from(
      new Set(docSchedules.map((s) => s.day_of_week))
    ).sort((a, b) => a - b);

    let hasAvailability = false;
    if (docSchedules.length > 0) {
      for (let i = 0; i < 14; i++) {
        const testDate = new Date(nowIST);
        testDate.setDate(testDate.getDate() + i);
        const dateStr = `${testDate.getFullYear()}-${String(testDate.getMonth() + 1).padStart(2, "0")}-${String(testDate.getDate()).padStart(2, "0")}`;
        const dow = testDate.getDay();

        const isLeaveDate = docLeaves.some(
          (l) => l.leave_start <= dateStr && l.leave_end >= dateStr
        );
        if (isLeaveDate) continue;

        const dayShifts = docSchedules.filter((s) => s.day_of_week === dow);
        if (dayShifts.length === 0) continue;

        for (const shift of dayShifts) {
          const [sh, sm] = shift.start_time.split(":").map(Number);
          const slotStart = new Date(
            `${dateStr}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00+05:30`
          );
          if (slotStart >= earliestAllowedTime) {
            hasAvailability = true;
            break;
          }
        }

        if (hasAvailability) break;
      }
    }

    return {
      ...doc,
      hasActiveSchedule: hasAvailability,
      isOnLeaveToday,
      activeDays,
    };
  });
}

export function computeAvailableSlots(schedules, leaves, fromDate, toDate) {
  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const earliestAllowedTime = new Date(Date.now() + 30 * 60 * 1000);
  const slots = [];

  for (let i = 0; i < 14; i++) {
    const d = new Date(nowIST);
    d.setDate(d.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    if (fromDate && dateStr < fromDate) continue;
    if (toDate && dateStr > toDate) continue;

    const isOnLeave = (leaves || []).some(
      (l) => l.leave_start <= dateStr && l.leave_end >= dateStr
    );
    if (isOnLeave) continue;

    const dow = d.getDay();
    const matchingShifts = (schedules || []).filter((s) => s.day_of_week === dow);

    for (const shift of matchingShifts) {
      const slotDuration = shift.slot_duration_mins || 20;
      const [startH, startM] = shift.start_time.split(":").map(Number);
      const [endH, endM] = shift.end_time.split(":").map(Number);

      const shiftStartMins = startH * 60 + startM;
      const shiftEndMins = endH * 60 + endM;

      let curMins = shiftStartMins;
      while (curMins + slotDuration <= shiftEndMins) {
        const nextMins = curMins + slotDuration;

        const slotStartH = Math.floor(curMins / 60);
        const slotStartM = curMins % 60;
        const slotEndH = Math.floor(nextMins / 60);
        const slotEndM = nextMins % 60;

        const slotStartStr = `${dateStr}T${String(slotStartH).padStart(2, "0")}:${String(slotStartM).padStart(2, "0")}:00+05:30`;
        const slotEndStr = `${dateStr}T${String(slotEndH).padStart(2, "0")}:${String(slotEndM).padStart(2, "0")}:00+05:30`;

        const slotStartDate = new Date(slotStartStr);
        if (slotStartDate >= earliestAllowedTime) {
          slots.push({
            slot_start: slotStartDate.toISOString(),
            slot_end: new Date(slotEndStr).toISOString(),
          });
        }

        curMins = nextMins;
      }
    }
  }

  return slots;
}
