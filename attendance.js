const GOOGLE_SHEETS_ENDPOINT = "https://script.google.com/macros/s/AKfycbwtGnho2SgbUTfh96KSBiDwbjwx2NlA506M0WefqCHWX6p9SdYOObV1P6m9fO7XzLKKww/exec";

const form = document.querySelector("#attendanceForm");
const enrollmentField = document.querySelector("#enrollment");
const message = document.querySelector("#formMessage");
const submitButton = form.querySelector("button");
const attendanceModal = document.querySelector("#attendanceModal");
const closeAttendanceModal = document.querySelector("#closeAttendanceModal");

function normalize(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function showMessage(text, type) {
  message.textContent = text;
  message.className = `form-message ${type}`;
}

function getAttendanceStatus(enrollment) {
  return new Promise((resolve, reject) => {
    const callbackName = `attendanceStatus_${Date.now()}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Could not verify the enrollment number."));
    }, 8000);
    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
    window[callbackName] = (result) => {
      cleanup();
      if (!result.success) reject(new Error(result.message));
      else resolve(result);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("Could not connect to the attendance service."));
    };
    script.src = `${GOOGLE_SHEETS_ENDPOINT}?action=attendance&enrollment=${encodeURIComponent(enrollment)}&callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

function showAttendanceModal() {
  attendanceModal.hidden = false;
  closeAttendanceModal.focus();
}

closeAttendanceModal.addEventListener("click", () => {
  attendanceModal.hidden = true;
  enrollmentField.focus();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const enrollment = normalize(enrollmentField.value);
  const valid = /^[a-zA-Z0-9][a-zA-Z0-9\/_-]{2,29}$/.test(enrollment);
  enrollmentField.closest(".field").classList.toggle("invalid", !valid);
  if (!valid) {
    showMessage("Enter a valid enrollment number.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "Checking...";
  showMessage("Submitting attendance...", "pending");

  try {
    const attendanceRequest = fetch(GOOGLE_SHEETS_ENDPOINT, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action: "attendance", enrollment })
    });

    let status;
    try {
      status = await getAttendanceStatus(enrollment);
    } catch {
      await attendanceRequest;
      form.reset();
      enrollmentField.closest(".field").classList.remove("invalid");
      showMessage("Attendance request submitted. Please confirm the row turns green in Google Sheets.", "pending");
      return;
    }

    if (!status.found) {
      await attendanceRequest;
      throw new Error("Enrollment not found.");
    }
    if (status.attended) {
      await attendanceRequest;
      throw new Error("Attendance has already been marked for this enrollment.");
    }

    await attendanceRequest;
    const afterStatus = await getAttendanceStatus(enrollment).catch(() => null);
    if (!afterStatus || !afterStatus.attended) {
      form.reset();
      enrollmentField.closest(".field").classList.remove("invalid");
      showMessage("Attendance request submitted. Please confirm the row turns green in Google Sheets.", "pending");
      return;
    }
    if (afterStatus.attended) {
      showMessage("Attendance marked successfully.", "success");
      showAttendanceModal();
    }
    form.reset();
    enrollmentField.closest(".field").classList.remove("invalid");
  } catch (error) {
    const errorMessage = error instanceof TypeError && error.message.toLowerCase().includes("fetch")
      ? "Could not connect to the attendance service. Please try again."
      : error.message || "Attendance could not be marked. Please try again.";
    showMessage(errorMessage, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "Mark attendance";
  }
});
