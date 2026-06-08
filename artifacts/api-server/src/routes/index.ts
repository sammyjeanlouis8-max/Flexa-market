import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import userBlocksRouter from "./user-blocks";
import categoriesRouter from "./categories";
import listingsRouter from "./listings";
import favoritesRouter from "./favorites";
import messagesRouter from "./messages";
import offersRouter from "./offers";
import reviewsRouter from "./reviews";
import reportsRouter from "./reports";
import adminRouter from "./admin";
import statsRouter from "./stats";
import storageRouter from "./storage";
import boostRouter from "./boost";
import commentsRouter from "./comments";
import notificationsRouter from "./notifications";
import transactionsRouter from "./transactions";
import paymentProvidersRouter from "./payment-providers";
import moncashPayRouter from "./moncash-pay";
import moncashOtpRouter from "./moncash-otp";
import pushRouter from "./push";
import jobsRouter from "./jobs";
import supportRouter from "./support";
import s3UploadRouter from "./s3-upload";
import chatbotRouter from "./chatbot";
import stripeConnectRouter from "./stripeConnect";
import stripeCheckoutRouter from "./stripeCheckout";
import walletRouter from "./wallet";
import fintechRouter from "./fintech";
import cashoutRouter from "./cashout";
import phoneOtpRouter from "./phone-otp";
import sellerPayoutsRouter from "./seller-payouts";
import promoRouter from "./promo";
import subscriptionRouter from "./subscription";
import recoveryRouter from "./recovery";
import videosRouter from "./videos";
import presenceRouter from "./presence";
import deliveryRouter from "./delivery";
import disputesRouter from "./disputes";
import transfersRouter from "./transfers";
import agentsRouter from "./agents";
import auditRouter from "./audit";
import translationRouter from "./translation";
import vehicleImagesRouter from "./vehicle-images";
import tipsRouter from "./tips";
import ratingsRouter from "./ratings";
import loansRouter from "./loans";
import creditScoreRouter from "./credit-score";
import ogRouter from "./og";
import bnplRouter from "./bnpl";
import returnsRouter from "./returns";
import visualSearchRouter from "./visual-search";
import vehicleVerifyRouter from "./vehicle-verify";
import aiGuardianRouter from "./ai-guardian";
import calculatorRouter from "./calculator";
import walletMonitorRouter from "./walletMonitor";
import driverSelfieRouter from "./driverSelfie";
import kycRouter from "./kyc";
import sitemapRouter from "./sitemap";
import referralsRouter from "./referrals";
import fraudRouter from "./fraud";
import shippingRouter from "./shipping";
import { extractToken, verifyToken } from "../lib/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

// ─── Rate Limiters ────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many requests. Please wait 15 minutes and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: "Too many registration attempts from this IP. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: { error: "Too many OTP requests. Please wait 10 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Password recovery / change endpoints — strict per-IP cap to prevent
// brute-force or abusive automation while still allowing legitimate retries.
const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: "Too many password attempts from this IP. Please wait an hour and try again." },
  standardHeaders: true,
  legacyHeaders: false,
});

const EXEMPT_PATHS = [
  /^\/auth\//,
  /^\/healthz$/,
  /^\/categories/,
  /^\/storage\//,
  /^\/users\/\d+$/,
  /^\/fintech\/vendors$/,
];

async function profileCompletionGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  const isExempt = EXEMPT_PATHS.some(p => p.test(req.path));
  if (isExempt) { next(); return; }

  const token = extractToken(req.headers.authorization);
  if (!token) { next(); return; }

  const payload = verifyToken(token);
  if (!payload) { next(); return; }

  const [user] = await db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      avatar: usersTable.avatar,
      country: usersTable.country,
      location: usersTable.location,
      isBanned: usersTable.isBanned,
      isPhoneVerified: usersTable.isPhoneVerified,
    })
    .from(usersTable)
    .where(eq(usersTable.id, payload.userId));

  if (!user || user.isBanned) { next(); return; }

  const profileCompleted = !!(user.name?.trim());
  if (!profileCompleted) {
    res.status(403).json({ error: "Complete your profile to continue", code: "PROFILE_INCOMPLETE" });
    return;
  }

  next();
}

router.use(profileCompletionGuard);

router.use(generalLimiter);
router.use("/auth/register", registerLimiter);
router.use("/auth/send-otp", otpLimiter);
router.use("/auth/verify-otp", otpLimiter);
router.use("/auth/login", authLimiter);
router.use("/auth/logout", authLimiter);
router.use("/auth/me", authLimiter);
router.use("/auth/forgot-password", passwordLimiter);
router.use("/auth/reset-password", passwordLimiter);
router.use("/auth/change-password", passwordLimiter);

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(userBlocksRouter);
router.use(categoriesRouter);
router.use(boostRouter);
router.use(listingsRouter);
router.use(favoritesRouter);
router.use(messagesRouter);
router.use(offersRouter);
router.use(reviewsRouter);
router.use(reportsRouter);
router.use(adminRouter);
router.use(statsRouter);
router.use(storageRouter);
router.use(commentsRouter);
router.use(notificationsRouter);
router.use(transactionsRouter);
router.use(paymentProvidersRouter);
router.use(moncashPayRouter);
router.use(moncashOtpRouter);
router.use(pushRouter);
router.use(jobsRouter);
router.use(supportRouter);
router.use(s3UploadRouter);
router.use(chatbotRouter);
router.use(stripeConnectRouter);
router.use(stripeCheckoutRouter);
router.use(walletRouter);
router.use(fintechRouter);
router.use(cashoutRouter);
router.use(phoneOtpRouter);
router.use(sellerPayoutsRouter);
router.use(promoRouter);
router.use(subscriptionRouter);
router.use("/recovery", otpLimiter);
router.use(recoveryRouter);
router.use(videosRouter);
router.use(presenceRouter);
router.use(deliveryRouter);
router.use(disputesRouter);
router.use(transfersRouter);
router.use(agentsRouter);
router.use(auditRouter);
router.use(translationRouter);
router.use(vehicleImagesRouter);
router.use(tipsRouter);
router.use(ratingsRouter);
router.use(loansRouter);
router.use(creditScoreRouter);
router.use(ogRouter);
router.use(bnplRouter);
router.use(returnsRouter);
router.use(visualSearchRouter);
router.use(vehicleVerifyRouter);
router.use(aiGuardianRouter);
router.use(calculatorRouter);
router.use(walletMonitorRouter);
router.use(driverSelfieRouter);
router.use(kycRouter);
router.use(sitemapRouter);
router.use(fraudRouter);
router.use(shippingRouter);
router.use(referralsRouter);

export default router;
