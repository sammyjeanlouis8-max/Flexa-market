import { getApiBase } from "./api";

export type KycStatus = {
  status: "not_submitted" | "pending" | "approved" | "rejected" | string;
  documentType: string | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
};

type AuthOpts = { token: string; signal?: AbortSignal };

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
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `KYC status failed (${res.status})`);
  return data as KycStatus;
}

export async function submitKyc(
  input: {
    docType: "national_id" | "passport" | "driving_license";
    documentUri: string;
    selfieUri: string;
    documentMime?: string;
    selfieMime?: string;
  },
  opts: AuthOpts,
): Promise<{ ok: boolean; status: string }> {
  const form = new FormData();
  form.append("docType", input.docType);
  form.append("document", {
    uri: input.documentUri,
    name: "document.jpg",
    type: input.documentMime || "image/jpeg",
  } as any);
  form.append("selfie", {
    uri: input.selfieUri,
    name: "selfie.jpg",
    type: input.selfieMime || "image/jpeg",
  } as any);

  const res = await fetch(`${getApiBase()}/kyc/submit`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: form,
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `KYC submit failed (${res.status})`);
  return data as { ok: boolean; status: string };
}
