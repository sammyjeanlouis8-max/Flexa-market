import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Layers, Info, Clock, MoreVertical, Play, Rocket, Film,
  Loader2, Megaphone, RefreshCw, Trash2, Pencil, Eye, BarChart3, Upload,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { VideoUploadJobRow } from "@/components/VideoUploadCenter";
import {
  defaultReturnPathForPurpose,
  getVideoUploads,
  retryVideoUpload,
  setVideoUploadIdentity,
  subscribeVideoUploads,
  type VideoUploadJob,
} from "@/lib/videoUploadQueue";
import "./myDrafts.css";
import "@/components/video-upload-center.css";

type Tab = "videoDrafts" | "activeBoosts" | "boostDrafts" | "expiredBoosts";

interface OwnerBoost {
  listingId: number;
  title: string;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  boostStartAt: string | null;
  boostExpiresAt: string | null;
  impressions: number;
  clicks: number;
  boostId: number;
  plan: string | null;
  budget: number;
  remainingBudgetUsd?: number;
  isExpired: boolean;
}

interface BoosterCampaign {
  boostId: number;
  listingId: number;
  title: string;
  thumbnail: string | null;
  status: string;
  budget: number;
  startsAt: string | null;
  endsAt: string | null;
  impressions: number;
  clicks: number;
}

function remainingLabel(iso: string | null | undefined, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!iso) return t("myDrafts.endsUnknown", { defaultValue: "End date unavailable" });
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return t("myDrafts.ended", { defaultValue: "Ended" });
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return t("myDrafts.endsInDays", { defaultValue: "Ends in: {{d}}d {{h}}h {{m}}m", d, h, m });
  if (h > 0) return t("myDrafts.endsInHours", { defaultValue: "Ends in: {{h}}h {{m}}m", h, m });
  return t("myDrafts.endsInMins", { defaultValue: "Ends in: {{m}}m", m });
}

function uploadStatusLabel(state: VideoUploadJob["state"], t: (k: string, o?: Record<string, unknown>) => string) {
  switch (state) {
    case "complete":
      return t("myDrafts.statusReady", { defaultValue: "Ready to use" });
    case "uploading":
    case "preparing":
    case "queued":
    case "processing":
      return t("myDrafts.statusUploading", { defaultValue: "Uploading" });
    case "waiting_for_connection":
    case "paused":
      return t("myDrafts.statusInterrupted", { defaultValue: "Interrupted — can resume" });
    case "failed":
      return t("myDrafts.statusFailed", { defaultValue: "Upload failed" });
    case "draft":
      return t("myDrafts.statusDraft", { defaultValue: "Draft" });
    default:
      return state;
  }
}

export default function MyDrafts() {
  const { t } = useTranslation();
  const { user, token, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>("activeBoosts");
  const [boosts, setBoosts] = useState<OwnerBoost[]>([]);
  const [campaigns, setCampaigns] = useState<BoosterCampaign[]>([]);
  const [loadingBoosts, setLoadingBoosts] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const jobs = useSyncExternalStore(subscribeVideoUploads, getVideoUploads, getVideoUploads);

  useEffect(() => {
    setVideoUploadIdentity(user?.id ?? null, token ?? null);
  }, [user?.id, token]);

  useEffect(() => {
    if (!authLoading && !user && import.meta.env.PROD) {
      setLocation(`/auth/login?next=${encodeURIComponent("/my-drafts")}`);
    }
  }, [user, authLoading, setLocation]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const loadBoosts = useCallback(async () => {
    if (!token) { setLoadingBoosts(false); return; }
    setLoadingBoosts(true);
    try {
      const res = await fetch("/api/boost/my-active", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("myDrafts.loadError"));
      setBoosts(Array.isArray(data.boosts) ? data.boosts : []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("myDrafts.loadError"));
      setBoosts([]);
    } finally {
      setLoadingBoosts(false);
    }
  }, [token, t]);

  const loadCampaigns = useCallback(async () => {
    if (!token) { setLoadingCampaigns(false); return; }
    setLoadingCampaigns(true);
    try {
      const res = await fetch("/api/booster/campaigns", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoadingCampaigns(false);
    }
  }, [token]);

  useEffect(() => {
    void loadBoosts();
    void loadCampaigns();
  }, [loadBoosts, loadCampaigns]);

  const ownJobs = useMemo(() => {
    if (!user) return [] as VideoUploadJob[];
    return jobs
      .filter((j) => j.ownerId === user.id && j.state !== "cancelled")
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [jobs, user?.id]);

  const activeBoosts = useMemo(() => boosts.filter((b) => !b.isExpired), [boosts]);
  const expiredBoosts = useMemo(() => boosts.filter((b) => b.isExpired), [boosts]);
  const boostDrafts = useMemo(() => campaigns.filter((c) => c.status === "draft"), [campaigns]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    {
      key: "videoDrafts",
      label: t("myDrafts.tabVideoDrafts", { defaultValue: "Video Drafts" }),
      count: ownJobs.length,
    },
    {
      key: "activeBoosts",
      label: t("myDrafts.tabActive", { defaultValue: "Active Boosts" }),
      count: activeBoosts.length,
    },
    {
      key: "boostDrafts",
      label: t("myDrafts.tabBoostDrafts", { defaultValue: "Boost Drafts" }),
      count: boostDrafts.length,
    },
    {
      key: "expiredBoosts",
      label: t("myDrafts.tabExpired", { defaultValue: "Expired Boosts" }),
      count: expiredBoosts.length,
    },
  ];

  const continueJob = (job: VideoUploadJob) => {
    const path =
      job.returnPath ||
      defaultReturnPathForPurpose(job.purpose) ||
      (job.purpose === "listing" ? "/sell" : "/booster/create");
    setLocation(path);
  };

  if (authLoading) {
    return (
      <div className="md-page">
        <div className="md-shell md-loading"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
      </div>
    );
  }
  if (!user && import.meta.env.PROD) return null;

  const loading = (tab === "activeBoosts" || tab === "expiredBoosts") ? loadingBoosts
    : tab === "boostDrafts" ? loadingCampaigns
    : false;

  return (
    <div className="md-page" data-testid="my-drafts-page">
      <div className="md-shell">
        <div className="md-top">
          <Link href="/settings" className="md-back" aria-label={t("common.back", { defaultValue: "Back" })}>
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="md-title">{t("myDrafts.title", { defaultValue: "My Drafts" })}</h1>
          <button
            type="button"
            className="md-info"
            aria-label={t("myDrafts.infoAria", { defaultValue: "About My Drafts" })}
            onClick={() => toast({
              title: t("myDrafts.title", { defaultValue: "My Drafts" }),
              description: t("myDrafts.infoBody", {
                defaultValue: "Manage video uploads, active boosts, unpaid boost drafts, and expired campaigns. Expired boosts leave the public Promotional Videos feed but stay here for you.",
              }),
            })}
          >
            <Info className="h-4 w-4" />
          </button>
        </div>

        <section className="md-banner" aria-label={t("myDrafts.bannerTitle", { defaultValue: "Bouyon" })}>
          <div className="md-banner-row">
            <div className="md-banner-icon"><Layers className="h-5 w-5" /></div>
            <div>
              <h2>{t("myDrafts.bannerTitle", { defaultValue: "Bouyon" })}</h2>
              <p>{t("myDrafts.bannerSub", { defaultValue: "Manage and track your video boosts" })}</p>
            </div>
          </div>
          <BarChart3 className="md-banner-art h-24 w-24" aria-hidden />
        </section>

        <div className="md-tabs" role="tablist" aria-label={t("myDrafts.title")}>
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={tab === item.key}
              className={`md-tab ${tab === item.key ? "is-on" : ""}`}
              onClick={() => { setTab(item.key); setMenuFor(null); }}
              data-testid={`my-drafts-tab-${item.key}`}
            >
              {item.label} ({item.count})
            </button>
          ))}
        </div>

        {actionError && <p className="md-error" role="alert">{actionError}</p>}
        {error && tab !== "videoDrafts" && tab !== "boostDrafts" && (
          <div className="md-card md-error">
            {error}
            <button type="button" className="md-btn md-btn-ghost" style={{ marginTop: 12 }} onClick={() => void loadBoosts()}>
              <RefreshCw className="h-4 w-4" /> {t("errors.tryAgain")}
            </button>
          </div>
        )}

        {loading ? (
          <div className="md-card md-loading"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : (
          <>
            {/* ── Video Drafts ── */}
            {tab === "videoDrafts" && (
              ownJobs.length === 0 ? (
                <div className="md-card md-empty">
                  <div className="md-empty-art">
                    <Upload className="h-9 w-9" />
                  </div>
                  <h3>{t("myDrafts.emptyVideoDrafts", { defaultValue: "No video drafts" })}</h3>
                  <p>{t("myDrafts.emptyVideoDraftsHint", { defaultValue: "Uploads in progress or finished videos waiting to be used appear here. Closing the upload bar does not cancel transfers." })}</p>
                  <div className="md-actions">
                    <Link href="/booster/create" className="md-btn md-btn-primary">
                      <Rocket className="h-4 w-4" /> {t("myDrafts.boostAVideo", { defaultValue: "Boost a Video" })}
                    </Link>
                    <Link href="/sell" className="md-btn md-btn-ghost">
                      <Film className="h-4 w-4" /> {t("nav.sell", { defaultValue: "Sell" })}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="md-card" style={{ padding: 10 }}>
                  {ownJobs.map((job) => (
                    <div key={job.id} style={{ marginBottom: 8 }}>
                      <div className="md-meta" style={{ padding: "0 4px 6px" }}>
                        <span className={`md-pill ${job.state === "complete" ? "md-pill-upload" : job.state === "failed" ? "md-pill-warn" : "md-pill-draft"}`}>
                          {uploadStatusLabel(job.state, t)}
                        </span>
                        <span className="md-ends">{new Date(job.updatedAt).toLocaleString()}</span>
                      </div>
                      <VideoUploadJobRow
                        job={job}
                        onActionError={setActionError}
                        onContinue={continueJob}
                      />
                      {(job.state === "failed" || job.state === "waiting_for_connection" || job.state === "paused") && (
                        <button
                          type="button"
                          className="md-btn md-btn-ghost"
                          style={{ width: "100%", marginTop: 6, minHeight: 38 }}
                          onClick={() => retryVideoUpload(job.id)}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          {t("videoUploads.retry", { defaultValue: "Retry upload" })}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )
            )}

            {/* ── Active Boosts ── */}
            {tab === "activeBoosts" && (
              activeBoosts.length === 0 ? (
                <div className="md-card md-empty">
                  <div className="md-empty-art">
                    <Play className="h-9 w-9 fill-current" />
                    <span className="megaphone"><Megaphone className="h-3.5 w-3.5" /></span>
                  </div>
                  <h3>{t("myDrafts.boostAVideo", { defaultValue: "Boost a Video" })}</h3>
                  <p>{t("myDrafts.boostAVideoHint", { defaultValue: "Increase the visibility of your video in Promotional Videos and reach more buyers." })}</p>
                  <div className="md-actions">
                    <Link href="/booster/create" className="md-btn md-btn-primary" data-testid="my-drafts-boost-cta">
                      <Rocket className="h-4 w-4" /> {t("myDrafts.boostAVideo", { defaultValue: "Boost a Video" })}
                    </Link>
                    <Link href="/settings/videos" className="md-btn md-btn-ghost">
                      <Play className="h-4 w-4" /> {t("myDrafts.viewMyVideos", { defaultValue: "View My Videos" })}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="md-card">
                  {activeBoosts.map((b) => {
                    const key = `active-${b.boostId}`;
                    return (
                      <div key={key} className="md-row" data-testid={`my-drafts-active-${b.boostId}`}>
                        <div className="md-thumb">
                          {b.thumbnail ? <img src={b.thumbnail} alt="" /> : <div className="md-thumb-fallback"><Film className="h-5 w-5" /></div>}
                        </div>
                        <div className="md-row-body">
                          <p className="md-row-title">{b.title}</p>
                          <div className="md-meta">
                            <span className="md-pill md-pill-active">{t("myDrafts.boostActive", { defaultValue: "Boost Active" })}</span>
                            <span className="md-ends"><Clock className="h-3 w-3" /> {remainingLabel(b.boostExpiresAt, t)}</span>
                          </div>
                          <div className="md-ends" style={{ marginTop: 4 }}>
                            ${Number(b.budget || 0).toFixed(2)}
                            {typeof b.impressions === "number" ? ` · ${b.impressions} ${t("booster.myBoosts.views", { defaultValue: "views" })}` : ""}
                          </div>
                        </div>
                        <div ref={menuFor === key ? menuRef : undefined}>
                          <button type="button" className="md-menu-btn" aria-label={t("myDrafts.manage", { defaultValue: "Manage" })} onClick={() => setMenuFor(menuFor === key ? null : key)}>
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {menuFor === key && (
                            <div className="md-menu">
                              <Link href={`/listings/${b.listingId}/video`} onClick={() => setMenuFor(null)}>
                                <Eye className="h-3.5 w-3.5" /> {t("myDrafts.viewVideo", { defaultValue: "View Video" })}
                              </Link>
                              <Link href={`/booster/analytics?boostId=${b.boostId}`} onClick={() => setMenuFor(null)}>
                                <BarChart3 className="h-3.5 w-3.5" /> {t("myDrafts.viewAnalytics", { defaultValue: "View Analytics" })}
                              </Link>
                              <Link href="/booster" onClick={() => setMenuFor(null)}>
                                <Pencil className="h-3.5 w-3.5" /> {t("myDrafts.manageBoost", { defaultValue: "Manage Boost" })}
                              </Link>
                              <Link href={`/boost/${b.listingId}`} onClick={() => setMenuFor(null)}>
                                <RefreshCw className="h-3.5 w-3.5" /> {t("myDrafts.renewBoost", { defaultValue: "Renew Boost" })}
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* ── Boost Drafts ── */}
            {tab === "boostDrafts" && (
              boostDrafts.length === 0 ? (
                <div className="md-card md-empty">
                  <div className="md-empty-art"><Layers className="h-9 w-9" /></div>
                  <h3>{t("myDrafts.emptyBoostDrafts", { defaultValue: "No boost drafts" })}</h3>
                  <p>{t("myDrafts.emptyBoostDraftsHint", { defaultValue: "Saved boost setups that are not paid yet appear here. Saving a draft never charges you." })}</p>
                  <div className="md-actions">
                    <Link href="/booster/create" className="md-btn md-btn-primary">
                      <Rocket className="h-4 w-4" /> {t("booster.nav.create", { defaultValue: "Create Boost" })}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="md-card">
                  {boostDrafts.map((c) => {
                    const key = `draft-${c.boostId}`;
                    return (
                      <div key={key} className="md-row">
                        <div className="md-thumb">
                          {c.thumbnail ? <img src={c.thumbnail} alt="" /> : <div className="md-thumb-fallback"><Film className="h-5 w-5" /></div>}
                        </div>
                        <div className="md-row-body">
                          <p className="md-row-title">{c.title}</p>
                          <div className="md-meta">
                            <span className="md-pill md-pill-draft">{t("booster.status.draft", { defaultValue: "Draft" })}</span>
                            <span className="md-ends">${Number(c.budget || 0).toFixed(2)}</span>
                          </div>
                        </div>
                        <div ref={menuFor === key ? menuRef : undefined}>
                          <button type="button" className="md-menu-btn" onClick={() => setMenuFor(menuFor === key ? null : key)}>
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {menuFor === key && (
                            <div className="md-menu">
                              <Link href="/booster/create" onClick={() => setMenuFor(null)}>
                                <Pencil className="h-3.5 w-3.5" /> {t("myDrafts.continueEditing", { defaultValue: "Continue Editing" })}
                              </Link>
                              {c.listingId > 0 && (
                                <Link href={`/listings/${c.listingId}/video`} onClick={() => setMenuFor(null)}>
                                  <Eye className="h-3.5 w-3.5" /> {t("myDrafts.previewVideo", { defaultValue: "Preview Video" })}
                                </Link>
                              )}
                              <Link href="/booster/create" onClick={() => setMenuFor(null)}>
                                <Rocket className="h-3.5 w-3.5" /> {t("myDrafts.submitBoost", { defaultValue: "Submit Boost" })}
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* ── Expired Boosts ── */}
            {tab === "expiredBoosts" && (
              expiredBoosts.length === 0 ? (
                <div className="md-card md-empty">
                  <div className="md-empty-art"><Clock className="h-9 w-9" /></div>
                  <h3>{t("myDrafts.emptyExpired", { defaultValue: "No expired boosts" })}</h3>
                  <p>{t("myDrafts.emptyExpiredHint", { defaultValue: "When a paid boost ends, it leaves the public feed and stays here so you can renew or review analytics." })}</p>
                </div>
              ) : (
                <div className="md-card">
                  {expiredBoosts.map((b) => {
                    const key = `expired-${b.boostId}`;
                    return (
                      <div key={key} className="md-row" data-testid={`my-drafts-expired-${b.boostId}`}>
                        <div className="md-thumb">
                          {b.thumbnail ? <img src={b.thumbnail} alt="" /> : <div className="md-thumb-fallback"><Film className="h-5 w-5" /></div>}
                        </div>
                        <div className="md-row-body">
                          <p className="md-row-title">{b.title}</p>
                          <div className="md-meta">
                            <span className="md-pill md-pill-expired">{t("myDrafts.boostExpired", { defaultValue: "Boost Expired" })}</span>
                            {b.boostExpiresAt && (
                              <span className="md-ends">{new Date(b.boostExpiresAt).toLocaleString()}</span>
                            )}
                          </div>
                          <div className="md-ends" style={{ marginTop: 4 }}>
                            {b.impressions} {t("booster.myBoosts.views", { defaultValue: "views" })} · {b.clicks} {t("booster.analytics.clicks", { defaultValue: "clicks" })}
                          </div>
                        </div>
                        <div ref={menuFor === key ? menuRef : undefined}>
                          <button type="button" className="md-menu-btn" onClick={() => setMenuFor(menuFor === key ? null : key)}>
                            <MoreVertical className="h-4 w-4" />
                          </button>
                          {menuFor === key && (
                            <div className="md-menu">
                              <Link href={`/listings/${b.listingId}/video`} onClick={() => setMenuFor(null)}>
                                <Eye className="h-3.5 w-3.5" /> {t("myDrafts.previewVideo", { defaultValue: "Preview Video" })}
                              </Link>
                              <Link href={`/booster/analytics?boostId=${b.boostId}`} onClick={() => setMenuFor(null)}>
                                <BarChart3 className="h-3.5 w-3.5" /> {t("myDrafts.viewAnalytics", { defaultValue: "View Analytics" })}
                              </Link>
                              <Link href={`/boost/${b.listingId}`} onClick={() => setMenuFor(null)}>
                                <RefreshCw className="h-3.5 w-3.5" /> {t("myDrafts.renewBoost", { defaultValue: "Renew Boost" })}
                              </Link>
                              <Link href="/booster/create" onClick={() => setMenuFor(null)}>
                                <Rocket className="h-3.5 w-3.5" /> {t("myDrafts.createNewBoost", { defaultValue: "Create New Boost" })}
                              </Link>
                              <Link href={`/listings/${b.listingId}`} onClick={() => setMenuFor(null)} className="danger">
                                <Trash2 className="h-3.5 w-3.5" /> {t("myDrafts.openListing", { defaultValue: "Open listing" })}
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </>
        )}

        <div className="md-note">
          <Info />
          <span>
            {t("myDrafts.visibilityNote", {
              defaultValue: "Only videos with an active boost are visible to other users in Promotional Videos. When the boost ends, your video is hidden from the public promo feed and remains available here and in My videos.",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
