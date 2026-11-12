/**
 * Jobs marketplace — list, detail, apply, my applications, claim.
 */
import { getApiBase } from "./api";

type AuthOpts = { token: string };

async function authed(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export type Job = {
  id: number;
  title: string;
  description: string;
  budget?: number | null;
  location?: string | null;
  country?: string | null;
  status: string;
  paid?: boolean;
  feeAmount?: number | null;
  feeCurrency?: string | null;
  posterId?: number;
  posterName?: string | null;
  claimedById?: number | null;
  createdAt?: string;
};

export type JobApplication = {
  id: number;
  job_id: number;
  job_title?: string;
  job_status?: string;
  poster_name?: string;
  status?: string;
  cover_letter?: string | null;
  whatsapp?: string | null;
  employer_note?: string | null;
  created_at?: string;
};

export async function fetchJobs(opts: AuthOpts): Promise<Job[]> {
  const res = await authed("/jobs", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Jobs failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function fetchMyJobs(opts: AuthOpts): Promise<Job[]> {
  const res = await authed("/jobs/me", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `My jobs failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function fetchJob(id: number, opts: AuthOpts): Promise<Job> {
  const res = await authed(`/jobs/${id}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Job failed (${res.status})`);
  return data as Job;
}

export async function applyToJob(
  id: number,
  input: { coverLetter?: string; whatsapp?: string },
  opts: AuthOpts,
): Promise<void> {
  const res = await authed(`/jobs/${id}/apply`, {
    ...opts,
    method: "POST",
    body: {
      coverLetter: input.coverLetter ?? "",
      whatsapp: input.whatsapp ?? "",
    },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Apply failed (${res.status})`);
}

export async function claimJob(id: number, opts: AuthOpts): Promise<Job> {
  const res = await authed(`/jobs/${id}/claim`, { ...opts, method: "POST", body: {} });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || data.message || `Claim failed (${res.status})`);
  return data as Job;
}

export async function fetchMyJobApplications(opts: AuthOpts): Promise<JobApplication[]> {
  const res = await authed("/jobs/my-applications", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Applications failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function createJob(
  input: { title: string; description: string; location?: string; budget?: number },
  opts: AuthOpts,
): Promise<{ job: Job; fee?: { amount: number; currency: string; methods: string[] } }> {
  const res = await authed("/jobs", {
    ...opts,
    method: "POST",
    body: input,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Create job failed (${res.status})`);
  return {
    job: (data.job ?? data) as Job,
    fee: data.fee,
  };
}

export async function payJobFee(
  id: number,
  opts: AuthOpts & { paymentMethod?: string },
): Promise<void> {
  const res = await authed(`/jobs/${id}/pay`, {
    ...opts,
    method: "POST",
    body: {
      paymentMethod: opts.paymentMethod ?? "fm_wallet",
      paymentRef: `mobile-wallet-${Date.now()}`,
    },
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Pay failed (${res.status})`);
}
