/**
 * KYC / identity verification — status + multipart document submit.
 */
import { getApiBase } from "./api";

export type KycStatus = "not_submitted" | "pending" | "approved" | "rejected";
export type KycDocType = "national_id" | "passport" | "driving_license";

export type KycInfo = {
  status: KycStatus;
  documentType?: KycDocType | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
};

export type KycImageAsset = {
  uri: string;
  name?: string | null;
  type?: string | null;
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchKycStatus(opts: AuthOpts): Promise<KycInfo> {
  const res = await fetch(`${getApiBase()}/kyc/status`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `KYC status failed (${res.status})`);
  return {
    status: (data.status as KycStatus) ?? "not_submitted",
    documentType: data.documentType ?? null,
    rejectionReason: data.rejectionReason ?? null,
    submittedAt: data.submittedAt ?? null,
    reviewedAt: data.reviewedAt ?? null,
  };
}

/**
 * Submit KYC via multipart FormData.
 * RN appends file parts as `{ uri, name, type }` objects (not Blob/File).
 */
export async function submitKyc(
  input: {
    docType: KycDocType;
    document: KycImageAsset;
    selfie: KycImageAsset;
  },
  opts: AuthOpts,
): Promise<{ ok: boolean; status: KycStatus }> {
  const form = new FormData();
  form.append("docType", input.docType);

  const docName = input.document.name || "document.jpg";
  const docType = input.document.type || "image/jpeg";
  form.append("document", {
    uri: input.document.uri,
    name: docName,
    type: docType,
  } as unknown as Blob);

  const selfieName = input.selfie.name || "selfie.jpg";
  const selfieType = input.selfie.type || "image/jpeg";
  form.append("selfie", {
    uri: input.selfie.uri,
    name: selfieName,
    type: selfieType,
  } as unknown as Blob);

  const res = await fetch(`${getApiBase()}/kyc/submit`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
      // Do not set Content-Type — fetch sets multipart boundary.
    },
    body: form,
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `KYC submit failed (${res.status})`);
  return {
    ok: Boolean(data.ok ?? true),
    status: (data.status as KycStatus) ?? "pending",
  };
}
