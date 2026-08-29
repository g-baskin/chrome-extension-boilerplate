import { validateIdentityProfile, type IdentityProfile, type PurpleRunStepOutcome } from "./purple-flow";

export const MAX_AUTHORIZATION_COMPARISON_RESPONSE_BYTES = 1024 * 1024;

export type AuthorizationClassification = "enforced" | "possible-bypass" | "different" | "inconclusive";

export type AuthorizationResponseEvidence = Pick<
  PurpleRunStepOutcome,
  "status" | "responseLength" | "responseSha256" | "responseTruncated" | "error"
>;

export type AuthorizationComparison = Readonly<{
  classification: AuthorizationClassification;
  explanations: readonly string[];
}>;

/**
 * Profile metadata is safe to keep as ordinary data. Complete Authorization values
 * deliberately are not part of this model and must be supplied ephemerally per run.
 */
export type AuthorizationMatrixProfiles = Readonly<{
  browser: IdentityProfile;
  anonymous: IdentityProfile;
  named: readonly [IdentityProfile, IdentityProfile, ...IdentityProfile[]];
}>;

export function createAuthorizationMatrixProfiles(named: readonly IdentityProfile[]): AuthorizationMatrixProfiles {
  if (named.length < 2) throw new Error("Authorization comparisons require at least two named profiles.");
  const browser: IdentityProfile = { id: "browser", displayName: "Browser session", mode: "browser", authorizationScheme: null };
  const anonymous: IdentityProfile = { id: "anonymous", displayName: "Anonymous", mode: "anonymous", authorizationScheme: null };
  const seen = new Set([browser.id, anonymous.id]);
  for (const profile of named) {
    validateIdentityProfile(profile);
    if (profile.mode !== "authorization-header" || seen.has(profile.id)) {
      throw new Error("Named authorization profiles are malformed or duplicated.");
    }
    seen.add(profile.id);
  }
  return { browser, anonymous, named: [...named] as [IdentityProfile, IdentityProfile, ...IdentityProfile[]] };
}

/**
 * Compares a reviewed browser response with a lower-privilege response. Equality is
 * evidence only: it is intentionally reported as a possible bypass, never proof of a
 * vulnerability. Redirects, partial bodies, transport failures, and malformed evidence
 * cannot support a comparison and fail closed as inconclusive.
 */
export function classifyAuthorizationResponse(
  browser: AuthorizationResponseEvidence,
  lowerPrivilege: AuthorizationResponseEvidence,
): AuthorizationComparison {
  const browserProblem = evidenceProblem(browser, "Browser");
  const candidateProblem = evidenceProblem(lowerPrivilege, "Lower-privilege");
  if (browserProblem || candidateProblem) {
    return {
      classification: "inconclusive",
      explanations: [browserProblem ?? candidateProblem!],
    };
  }

  const statusSame = browser.status === lowerPrivilege.status;
  const lengthSame = browser.responseLength === lowerPrivilege.responseLength;
  const fingerprintSame = browser.responseSha256 === lowerPrivilege.responseSha256;
  const explanations = [
    statusSame
      ? `Status matched (${browser.status}).`
      : `Status differed (${browser.status} versus ${lowerPrivilege.status}).`,
    lengthSame
      ? `Bounded response length matched (${browser.responseLength} bytes).`
      : `Bounded response length differed (${browser.responseLength} versus ${lowerPrivilege.responseLength} bytes).`,
    fingerprintSame ? "SHA-256 fingerprints matched." : "SHA-256 fingerprints differed.",
    "No redirects were followed in either request.",
  ];

  if (isSuccessful(browser.status!) && isAuthorizationDenial(lowerPrivilege.status!)) {
    return {
      classification: "enforced",
      explanations: [...explanations, "The lower-privilege request was denied with 401 or 403 while the browser request succeeded."],
    };
  }

  if (isSuccessful(browser.status!) && statusSame && lengthSame && fingerprintSame) {
    return {
      classification: "possible-bypass",
      explanations: [
        ...explanations,
        "The lower-privilege response looks the same as the successful browser response; this is similarity evidence only, not proof of a bypass or vulnerability.",
      ],
    };
  }

  return {
    classification: "different",
    explanations: [...explanations, "The responses differ, but response differences alone do not prove authorization enforcement or a vulnerability."],
  };
}

function evidenceProblem(evidence: AuthorizationResponseEvidence, label: string): string | null {
  if (!evidence || typeof evidence !== "object") return `${label} response evidence was malformed.`;
  if (evidence.error !== null && typeof evidence.error !== "string") return `${label} response error was malformed.`;
  if (typeof evidence.responseTruncated !== "boolean") return `${label} response truncation evidence was malformed.`;
  if (evidence.error === "redirect" || evidence.error === "Redirect refused.") {
    return `${label} request redirected; redirects are not followed, so the comparison is inconclusive.`;
  }
  if (evidence.error) return `${label} request did not complete (${safeError(evidence.error)}), so the comparison is inconclusive.`;
  if (evidence.responseTruncated) return `${label} response exceeded the comparison limit, so its fingerprint is incomplete.`;
  if (!Number.isInteger(evidence.status) || evidence.status! < 100 || evidence.status! > 599) return `${label} response status was unavailable or malformed.`;
  if (!Number.isInteger(evidence.responseLength) || evidence.responseLength! < 0 || evidence.responseLength! > MAX_AUTHORIZATION_COMPARISON_RESPONSE_BYTES) {
    return `${label} response length was unavailable or outside the comparison limit.`;
  }
  if (typeof evidence.responseSha256 !== "string" || !/^[a-f0-9]{64}$/.test(evidence.responseSha256)) {
    return `${label} response fingerprint was unavailable or malformed.`;
  }
  return null;
}

function safeError(error: string): string {
  if (error === "timeout" || error === "Step timed out.") return "timeout";
  if (error === "cancelled" || error === "Run cancelled.") return "cancelled";
  if (error === "navigation" || error === "The inspected tab navigated before dispatch.") return "navigation";
  if (error === "network" || error === "Request failed.") return "network";
  return "execution error";
}

function isSuccessful(status: number): boolean {
  return status >= 200 && status < 300;
}

function isAuthorizationDenial(status: number): boolean {
  return status === 401 || status === 403;
}
