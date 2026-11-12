/**
 * KYC — GET /api/kyc/status + multipart POST /api/kyc/submit.
 * Admin approval required; never auto-approves.
 */
import { getApiBase } from "./api";

export type KycStatus = {
  status: "not_submitted" | "pending" | "approved" | "rejected" | string;
  documentType?: string | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
};

export type DocType = "national_id" | "passport" | "driving_license";

type AuthOpts = { token: string };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchKycStatus(opts: AuthOpts): Promise<KycStatus> {
  const res = await fetch(`${getApiBase()}/kyc/status`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `KYC status failed (${res.status})`);
  return data as KycStatus;
}

export async function submitKyc(
  input: {
    docType: DocType;
    documentUri: string;
    selfieUri: string;
    documentName?: string;
    selfieName?: string;
  },
  opts: AuthOpts,
): Promise<{ ok: boolean; status?: string }> {
  const form = new FormData();
  form.append("docType", input.docType);
  form.append("document", {
    uri: input.documentUri,
    name: input.documentName || "document.jpg",
    type: "image/jpeg",
  } as any);
  form.append("selfie", {
    uri: input.selfieUri,
    name: input.selfieName || "selfie.jpg",
    type: "image/jpeg",
  } as any);

  const res = await fetch(`${getApiBase()}/kyc/submit`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
      // Let fetch set multipart boundary — do not set Content-Type manually.
    },
    body: form,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `KYC submit failed (${res.status})`);
  return data;
}
