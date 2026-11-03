import {
  AccusationResponseSchema,
  CapabilitiesResponseSchema,
  CaseResultSchema,
  CreateCaseRequestSchema,
  DemoCaseResponseSchema,
  ErrorResponseSchema,
  GenerationJobResponseSchema,
  GenerationJobStatusResponseSchema,
  GuestSessionResponseSchema,
  HintResponseSchema,
  PublicCaseSchema,
  type PublicCaseDTO,
} from "../../server/src/shared/index.js";

let csrfToken = "";
let sessionRequest: Promise<void> | null = null;

async function request<T>(
  path: string,
  schema: {
    safeParse: (
      input: unknown,
    ) => { success: true; data: T } | { success: false };
  },
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(init.method ?? "GET")) {
    headers.set("X-CSRF-Token", csrfToken);
  }
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const body = ErrorResponseSchema.safeParse(payload);
    const error = new Error(
      body.success
        ? body.data.error.message
        : "The request could not be completed.",
    ) as Error & { code: string };
    error.code = body.success ? body.data.error.code : "REQUEST_FAILED";
    throw error;
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success)
    throw new Error("The server returned an invalid response.");
  return parsed.data;
}

export function establishSession(): Promise<void> {
  if (!sessionRequest) {
    sessionRequest = request("/sessions/guest", GuestSessionResponseSchema, {
      method: "POST",
      body: "{}",
    })
      .then((session) => {
        csrfToken = session.csrfToken;
      })
      .catch((error: unknown) => {
        sessionRequest = null;
        throw error;
      });
  }
  return sessionRequest;
}

export const createDemoCase = () =>
  request("/demo-case", DemoCaseResponseSchema, { method: "POST", body: "{}" });

export const getCase = (caseId: string): Promise<PublicCaseDTO> =>
  request(`/cases/${encodeURIComponent(caseId)}`, PublicCaseSchema);

export const getResult = (caseId: string) =>
  request(`/cases/${encodeURIComponent(caseId)}/result`, CaseResultSchema);

export const requestHint = (caseId: string, idempotencyKey: string) =>
  request(`/cases/${encodeURIComponent(caseId)}/hints`, HintResponseSchema, {
    method: "POST",
    body: "{}",
    headers: { "Idempotency-Key": idempotencyKey },
  });

export const accuse = (
  caseId: string,
  suspectId: string,
  citedEvidenceIds: string[],
) =>
  request(
    `/cases/${encodeURIComponent(caseId)}/accusations`,
    AccusationResponseSchema,
    {
      method: "POST",
      body: JSON.stringify({ suspectId, citedEvidenceIds }),
    },
  );

export const createCase = (body: unknown) => {
  const parsed = CreateCaseRequestSchema.safeParse(body);
  if (!parsed.success)
    throw new Error(
      "Enter a fictional scenario between 30 and 600 characters.",
    );
  return request("/cases", GenerationJobResponseSchema, {
    method: "POST",
    headers: { "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(parsed.data),
  });
};

export const getCapabilities = () =>
  request("/capabilities", CapabilitiesResponseSchema);

export const getGenerationJob = (jobId: string) =>
  request(
    `/jobs/${encodeURIComponent(jobId)}`,
    GenerationJobStatusResponseSchema,
  );

export const discoverClue = (caseId: string, clueId: string) =>
  request(
    `/cases/${encodeURIComponent(caseId)}/clues/${encodeURIComponent(clueId)}/discover`,
    PublicCaseSchema,
    { method: "POST", body: "{}" },
  );
