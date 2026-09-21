export const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  "https://sdoc-api-856612571283.asia-southeast1.run.app"
).replace(/\/+$/, "");

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = data?.detail;
    const error = new Error(
      typeof detail === "string"
        ? detail
        : `Request failed (${response.status})`
    );
    // Keep the status so callers can tell "endpoint missing" from
    // "endpoint said no".
    error.status = response.status;
    throw error;
  }

  return data;
}

export async function getAmendment(emailId, refresh = false) {
  const query = refresh ? "?refresh=true" : "";

  return request(
    `/emails/${encodeURIComponent(emailId)}/amendment${query}`
  );
}

// The original email: sender, subject, body, attachment names.
export async function getEmailSource(emailId) {
  return request(`/emails/${encodeURIComponent(emailId)}/source`);
}

// An attachment as the pipeline read it, line by line, with the lines each
// field was extracted from marked. which: "si" | "bl".
export async function getDocument(emailId, which) {
  return request(`/emails/${encodeURIComponent(emailId)}/document/${which}`);
}

// Link to download the original attachment file.
export function documentFileUrl(emailId, which) {
  return `${API_BASE_URL}/emails/${encodeURIComponent(emailId)}/file/${which}`;
}

export async function getAllEmails() {
  const data = await request("/emails");
  return data.emails;
}

export async function getEmail(emailId) {
  return request(`/emails/${encodeURIComponent(emailId)}`);
}

export async function getReviewQueue() {
  const data = await request("/review-queue");
  return data.items;
}

export async function submitReview(emailId, decision) {
  const payload = {
    action: decision.action,
  };

  if (decision.action === "correct") {
    payload.field = decision.field;
    payload.corrected_value = decision.value;
  }

  return request(`/review/${encodeURIComponent(emailId)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export async function retryEmailProcess(emailId) {
  return request(`/process/${encodeURIComponent(emailId)}`, {
    method: "POST",
  });
}

export async function processInbox(seed = null, n = 500) {
  const body = {};

  if (seed !== null && seed !== "") {
    body.seed = Number(seed);
    body.n = Number(n);
  }

  return request("/process", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

export async function getValidationRuns(limit = 5) {
  const data = await request(`/validation-runs?limit=${encodeURIComponent(limit)}`);
  return data.runs || [];
}

export async function resetToDefault() {
  return request("/reset", {
    method: "POST",
  });
}
