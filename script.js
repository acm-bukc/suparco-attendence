const MAX_REGISTRATIONS = 40;
// Change to false to close the local form. The Google Sheets backend has its own switch below.
const REGISTRATION_OPEN = true;
const ALLOWED_DEPARTMENTS = ["cs", "it", "ai"];
const ALLOWED_SEMESTERS = ["1", "2", "3", "4", "5", "6", "7", "8"];
// Paste your deployed Google Apps Script web-app URL here after setup.
const GOOGLE_SHEETS_ENDPOINT = "https://script.google.com/macros/s/AKfycbyWXD4-wLsVHNXv1rRfPRJrYNbzy8ygUehTqJHYgvITrbbtiX3Y0vNqAFBXBXCfCaVk/exec";

const form = document.querySelector("#registrationForm");
const message = document.querySelector("#formMessage");
const submitButton = form.querySelector("button");
const registrationStatus = document.querySelector("#registrationStatus");
const registrationCount = document.querySelector("#registrationCount");
let currentRegistrationCount = null;
const fields = {
  name: document.querySelector("#name"),
  enrollment: document.querySelector("#enrollment"),
  cnic: document.querySelector("#cnic"),
  semester: document.querySelector("#semester"),
  department: document.querySelector("#department"),
  phone: document.querySelector("#phone")
};

function normalize(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizedPhone(value) {
  return value.replace(/[^\d+]/g, "").replace(/^\+92/, "0").replace(/^92/, "0");
}

function normalizedCnic(value) {
  return value.replace(/[^\d-]/g, "");
}

function showMessage(text, type) {
  message.textContent = text;
  message.className = `form-message ${type}`;
}

function updateRegistrationStatus(count) {
  currentRegistrationCount = count;
  const open = REGISTRATION_OPEN && count < MAX_REGISTRATIONS;
  registrationStatus.querySelector("strong").textContent = open ? "Registration is open" : "Registration is closed";
  registrationStatus.classList.toggle("closed", !open);
  registrationCount.textContent = `${count} of ${MAX_REGISTRATIONS} students registered`;
  submitButton.disabled = !open;
}

function markInvalid(field, invalid) {
  field.closest(".field").classList.toggle("invalid", invalid);
}

function validate(name, enrollment, cnic, semester, department, phone) {
  const errors = [];
  const nameValid = /^[a-zA-Z][a-zA-Z .'-]{2,59}$/.test(name);
  const enrollmentValid = /^[a-zA-Z0-9][a-zA-Z0-9\/_-]{2,29}$/.test(enrollment);
  const cnicValid = /^\d{5}-\d{7}-\d$/.test(cnic);
  const semesterValid = ALLOWED_SEMESTERS.includes(semester);
  const departmentValid = ALLOWED_DEPARTMENTS.includes(department);
  const phoneValid = /^03\d{9}$/.test(phone);
  markInvalid(fields.name, !nameValid);
  markInvalid(fields.enrollment, !enrollmentValid);
  markInvalid(fields.cnic, !cnicValid);
  markInvalid(fields.semester, !semesterValid);
  markInvalid(fields.department, !departmentValid);
  markInvalid(fields.phone, !phoneValid);
  if (!nameValid) errors.push("Enter a valid name (at least 3 letters).");
  if (!enrollmentValid) errors.push("Enter a valid enrollment number.");
  if (!cnicValid) errors.push("Enter CNIC in the format 42201-1234567-1.");
  if (!semesterValid) errors.push("Select a semester from 1 to 8.");
  if (!departmentValid) errors.push("Select CS, IT, or AI.");
  if (!phoneValid) errors.push("Enter a valid phone number, for example +92 356 1234567.");
  return errors;
}

function getRegistrationStatus() {
  return new Promise((resolve, reject) => {
    const callbackName = `registrationStatus_${Date.now()}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Could not load registration availability."));
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
      reject(new Error("Could not connect to registration service."));
    };
    script.src = `${GOOGLE_SHEETS_ENDPOINT}?callback=${callbackName}`;
    document.body.appendChild(script);
  });
}

async function saveToGoogleSheet(student) {
  const response = await fetch(GOOGLE_SHEETS_ENDPOINT, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(student)
  });
  // Apps Script redirects its response to a host without CORS headers.
  // no-cors lets the POST reach the sheet, but the browser cannot read the response.
  if (response.type === "opaque") return { success: true };
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("Google Sheets connection is not deployed correctly. Please update the Apps Script deployment.");
  }
  const result = await response.json();
  if (!response.ok || !result.success) throw new Error(result.message || "Registration could not be saved.");
  return result;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!REGISTRATION_OPEN) {
    showMessage("Registration is currently closed.", "error");
    return;
  }
  const data = new FormData(form);
  const name = normalize(data.get("name") || "");
  const enrollment = normalize(data.get("enrollment") || "");
  const cnic = normalizedCnic(data.get("cnic") || "");
  const semester = String(data.get("semester") || "");
  const department = normalize(data.get("department") || "");
  const phone = normalizedPhone(data.get("phone") || "");
  const website = (data.get("website") || "").trim();
  const validationErrors = validate(name, enrollment, cnic, semester, department, phone);

  if (website) {
    showMessage("Registration could not be submitted.", "error");
    return;
  }
  if (validationErrors.length) {
    showMessage(validationErrors[0], "error");
    return;
  }

  const student = { name, enrollment, cnic, semester, department, phone, website };
  submitButton.disabled = true;
  submitButton.querySelector("span").textContent = "Saving...";
  showMessage("Saving your registration...", "pending");

  try {
    if (GOOGLE_SHEETS_ENDPOINT) {
      await saveToGoogleSheet(student);
    } else {
      throw new Error("Google Sheets is not configured.");
    }
    form.reset();
    Object.values(fields).forEach((field) => markInvalid(field, false));
    showMessage("Registration submitted successfully.", "success");
  } catch (error) {
    const messageText = error instanceof TypeError && error.message.toLowerCase().includes("fetch")
      ? "Could not connect to Google Sheets. Check that the Apps Script is deployed as a Web app for Anyone."
      : error.message;
    showMessage(messageText, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.querySelector("span").textContent = "Register now";
  }
});

getRegistrationStatus()
  .then((status) => updateRegistrationStatus(status.count))
  .catch(() => {
    registrationStatus.querySelector("strong").textContent = "Registration is open";
    registrationStatus.classList.remove("closed");
    registrationCount.textContent = "Live count unavailable";
  });
