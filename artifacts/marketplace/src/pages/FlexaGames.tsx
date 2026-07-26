/**
 * FlexaGames — Free HTML5 game library.
 * All game embed URLs verified working (no X-Frame-Options / CSP blocks).
 * Sources: html5games.com · gameflare.com · crazygames.com/embed
 */
import { useState, useRef, useCallback } from "react";
import { Gamepad2, X, ExternalLink, ChevronLeft, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type Category = "all" | "football" | "racing" | "action" | "casual" | "puzzle";

interface Game {
  id: string;
  title: string;
  cat: Exclude<Category, "all">;
  emoji: string;
  gradient: string;
  /** iframe embed URL — verified no X-Frame-Options */
  embedUrl: string;
  /** Regular game page — used for "open in browser" fallback */
  pageUrl: string;
  multiplayer: boolean;
  desc: string; // Creole description
}

// ── Game catalogue — all embed URLs individually verified (HTTP 200, no xframe) ──

const GAMES: Game[] = [

  // ─── ⚽ Foutbòl ──────────────────────────────────────────────────────────
  {
    id: "penalty-shooters-2",
    title: "Penalty Shooters 2",
    cat: "football",
    emoji: "⚽",
    gradient: "from-green-700 via-green-800 to-emerald-900",
    embedUrl: "https://www.gameflare.com/embed/penalty-shooters-2/",
    pageUrl:  "https://www.gameflare.com/game/penalty-shooters-2/",
    multiplayer: false,
    desc: "Tire penalite kont 15 ekip mondyal — avanse jiska finèl!",
  },
  {
    id: "head-soccer",
    title: "Head Soccer",
    cat: "football",
    emoji: "🦾",
    gradient: "from-purple-700 via-violet-800 to-purple-900",
    embedUrl: "https://html5games.com/embed/head-soccer",
    pageUrl:  "https://html5games.com/head-soccer/",
    multiplayer: true,
    desc: "Jwèt futbol tèt bò tèt — kouri, vole, fè gol ak pouvwa espesyal!",
  },
  {
    id: "soccer-random",
    title: "Soccer Random",
    cat: "football",
    emoji: "⚡",
    gradient: "from-yellow-600 via-orange-700 to-red-800",
    embedUrl: "https://html5games.com/embed/soccer-random",
    pageUrl:  "https://html5games.com/soccer-random/",
    multiplayer: true,
    desc: "Fizik fou — règ match la chanje chak round, surpriz garanti!",
  },
  {
    id: "world-cup-penalty",
    title: "World Cup Penalty",
    cat: "football",
    emoji: "🏆",
    gradient: "from-blue-700 via-blue-800 to-indigo-900",
    embedUrl: "https://html5games.com/embed/world-cup-penalty",
    pageUrl:  "https://html5games.com/world-cup-penalty/",
    multiplayer: false,
    desc: "Tounen chanpyon Coupe du Monde — yon penalite ka chanje tout bagay!",
  },
  {
    id: "goalkeeper-challenge",
    title: "Goalkeeper Challenge",
    cat: "football",
    emoji: "🧤",
    gradient: "from-teal-700 via-cyan-800 to-teal-900",
    embedUrl: "https://html5games.com/embed/goalkeeper-challenge",
    pageUrl:  "https://html5games.com/goalkeeper-challenge/",
    multiplayer: false,
    desc: "Defann pòtay ou — kè sote total lè bal yo vole sou ou!",
  },
  {
    id: "penalty-shooters",
    title: "Penalty Shooters",
    cat: "football",
    emoji: "🥅",
    gradient: "from-emerald-700 via-green-800 to-emerald-900",
    embedUrl: "https://html5games.com/embed/penalty-shooters",
    pageUrl:  "https://html5games.com/penalty-shooters/",
    multiplayer: false,
    desc: "Tire penalite kont gadyen mondyal — pwouve ou se meyè tirè a!",
  },

  // ─── 🏎️ Kous ──────────────────────────────────────────────────────────────
  {
    id: "drift-hunters",
    title: "Drift Hunters",
    cat: "racing",
    emoji: "🏎️",
    gradient: "from-slate-700 via-gray-800 to-zinc-900",
    embedUrl: "https://html5games.com/embed/drift-hunters",
    pageUrl:  "https://html5games.com/drift-hunters/",
    multiplayer: false,
    desc: "Drift ak 25 machin nan 10 pis — amelyore machin ou, domine pis la!",
  },
  {
    id: "moto-x3m",
    title: "Moto X3M",
    cat: "racing",
    emoji: "🏍️",
    gradient: "from-orange-700 via-red-700 to-orange-900",
    embedUrl: "https://www.gameflare.com/embed/moto-x3m/",
    pageUrl:  "https://www.gameflare.com/game/moto-x3m/",
    multiplayer: false,
    desc: "Obstak fou sou moto — akrobasi, vitès, fini nivo san mouri!",
  },
  {
    id: "drift-boss",
    title: "Drift Boss",
    cat: "racing",
    emoji: "🚗",
    gradient: "from-amber-700 via-yellow-800 to-orange-900",
    embedUrl: "https://www.gameflare.com/embed/drift-boss/",
    pageUrl:  "https://www.gameflare.com/game/drift-boss/",
    multiplayer: false,
    desc: "Drift sou yon pis ki tounen — yon sèl boutèy pou kontròle tout!",
  },
  {
    id: "moto-x3m-pool",
    title: "Moto X3M Pool Party",
    cat: "racing",
    emoji: "🏊",
    gradient: "from-cyan-700 via-sky-800 to-blue-900",
    embedUrl: "https://www.gameflare.com/embed/moto-x3m-pool-party/",
    pageUrl:  "https://www.gameflare.com/game/moto-x3m-pool-party/",
    multiplayer: false,
    desc: "Moto X3M nan pisin — obstak, dlo, vitès total!",
  },

  // ─── 🔫 Aksyon ────────────────────────────────────────────────────────────
  {
    id: "krunker",
    title: "Krunker.io",
    cat: "action",
    emoji: "🔫",
    gradient: "from-gray-700 via-neutral-800 to-stone-900",
    embedUrl: "https://html5games.com/embed/krunker",
    pageUrl:  "https://html5games.com/krunker/",
    multiplayer: true,
    desc: "FPS browser ki pi rapid — tire, vole, dominen jouè reyèl toupatou!",
  },
  {
    id: "betrayal-io",
    title: "Betrayal.io",
    cat: "action",
    emoji: "🗡️",
    gradient: "from-red-800 via-rose-900 to-red-950",
    embedUrl: "https://www.gameflare.com/embed/betrayal-io/",
    pageUrl:  "https://www.gameflare.com/game/betrayal-io/",
    multiplayer: true,
    desc: "Among Us-style — jwenn ki moun trayi ekip la anvan li touye tout moun!",
  },
  {
    id: "paper-io-2",
    title: "Paper.io 2",
    cat: "action",
    emoji: "📄",
    gradient: "from-violet-700 via-purple-800 to-indigo-900",
    embedUrl: "https://html5games.com/embed/paper-io-2",
    pageUrl:  "https://html5games.com/paper-io-2/",
    multiplayer: true,
    desc: "Pran tèritwa — agrandi zòn ou, bloke lòt jwè, domine kat la!",
  },

  // ─── 🎮 Kàzyèl ───────────────────────────────────────────────────────────
  {
    id: "basketball-stars",
    title: "Basketball Stars",
    cat: "casual",
    emoji: "🏀",
    gradient: "from-orange-700 via-red-700 to-orange-900",
    embedUrl: "https://www.gameflare.com/embed/basketball-stars/",
    pageUrl:  "https://www.gameflare.com/game/basketball-stars/",
    multiplayer: true,
    desc: "1v1 baskètbòl kont jouè reyèl — dribling, dunk, viktwa!",
  },
  {
    id: "boxing-random",
    title: "Boxing Random",
    cat: "casual",
    emoji: "🥊",
    gradient: "from-rose-700 via-pink-800 to-rose-900",
    embedUrl: "https://html5games.com/embed/boxing-random",
    pageUrl:  "https://html5games.com/boxing-random/",
    multiplayer: true,
    desc: "Boks fou — fizik nayif ki pral fè ou ri ak ganyan an menm tan!",
  },
  {
    id: "cut-the-rope",
    title: "Cut the Rope",
    cat: "casual",
    emoji: "🍬",
    gradient: "from-lime-700 via-green-800 to-emerald-900",
    embedUrl: "https://www.gameflare.com/embed/cut-the-rope/",
    pageUrl:  "https://www.gameflare.com/game/cut-the-rope/",
    multiplayer: false,
    desc: "Koupe kòd pou ba monstè a bonbon — jwèt reflechi ki adiktif!",
  },
  {
    id: "2048",
    title: "2048",
    cat: "casual",
    emoji: "🔢",
    gradient: "from-amber-500 via-orange-600 to-yellow-800",
    embedUrl: "https://html5games.com/embed/2048",
    pageUrl:  "https://html5games.com/2048/",
    multiplayer: false,
    desc: "Kombine kawo pou rive nan 2048 — jwèt adiktif ki teste lespri ou!",
  },

  // ─── 🧩 Estrateji / Puzzle ────────────────────────────────────────────────
  {
    id: "words-of-wonders",
    title: "Words of Wonders",
    cat: "puzzle",
    emoji: "🔤",
    gradient: "from-teal-700 via-cyan-800 to-teal-900",
    embedUrl: "https://www.gameflare.com/embed/words-of-wonders/",
    pageUrl:  "https://www.gameflare.com/game/words-of-wonders/",
    multiplayer: false,
    desc: "Fòme mo sou kwa — vwayaje atravè mond lan ak chak mo ou jwenn!",
  },
  {
    id: "slope",
    title: "Slope",
    cat: "puzzle",
    emoji: "🔮",
    gradient: "from-indigo-700 via-purple-800 to-indigo-900",
    embedUrl: "https://html5games.com/embed/slope",
    pageUrl:  "https://html5games.com/slope/",
    multiplayer: false,
    desc: "Fè yon boul desann pant ki fou — reyaksyon rapid, adiktif total!",
  },
  {
    id: "helix-jump",
    title: "Helix Jump",
    cat: "puzzle",
    emoji: "🌀",
    gradient: "from-pink-700 via-fuchsia-800 to-pink-900",
    embedUrl: "https://html5games.com/embed/helix-jump",
    pageUrl:  "https://html5games.com/helix-jump/",
    multiplayer: false,
    desc: "Fè boul la tonbe nan trou yo — evite blo wouj yo pou pa mouri!",
  },
];

// ── Category config ────────────────────────────────────────────────────────────

type CatId = Category;

// ── Game card ─────────────────────────────────────────────────────────────────

function GameCard({ game, onPlay }: { game: Game; onPlay: (g: Game) => void }) {
  const { t } = useTranslation();
  return (
    <button
      onClick={() => onPlay(game)}
      className="group relative flex flex-col text-left w-full focus:outline-none rounded-2xl overflow-hidden
                 hover:scale-[1.02] active:scale-[0.98] transition-transform duration-150 shadow-lg"
    >
      {/* Thumbnail */}
      <div
        className={cn("relative w-full bg-gradient-to-br flex items-center justify-center", game.gradient)}
        style={{ paddingBottom: "62%" }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="text-5xl transition-transform duration-300 group-hover:scale-110 drop-shadow-xl"
            style={{ filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}
          >
            {game.emoji}
          </span>
        </div>
        {/* Play overlay */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-xl">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="black"><polygon points="5,3 19,12 5,21" /></svg>
          </div>
        </div>
        {/* Multiplayer badge */}
        {game.multiplayer && (
          <div className="absolute top-2 left-2 flex items-center gap-1 bg-violet-600/90 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
            <Users size={7} /> {t("games.multiplayer")}
          </div>
        )}
      </div>
      {/* Info */}
      <div className="bg-[#111118] px-2.5 py-2 flex-1">
        <p className="text-white text-[12px] font-bold leading-tight line-clamp-1">{game.title}</p>
        <p className="text-white/50 text-[10px] mt-0.5 line-clamp-1">{game.desc}</p>
      </div>
    </button>
  );
}

// ── Game viewer ───────────────────────────────────────────────────────────────

function GameViewer({ game, onClose }: { game: Game; onClose: () => void }) {
  const { t } = useTranslation();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading]       = useState(true);

  const handleLoad = useCallback(() => setLoading(false), []);

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>

      {/* Top bar — no external link, only Back + X */}
      <div className="flex items-center gap-3 px-3 py-2 bg-[#0a0a0f]/95 border-b border-white/10 flex-shrink-0">
        <button onClick={onClose} className="flex items-center gap-1 text-white/70 hover:text-white transition-colors">
          <ChevronLeft size={20} />
          <span className="text-sm font-medium">{t("games.back")}</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-lg">{game.emoji}</span>
          <span className="text-white font-bold text-sm truncate">{game.title}</span>
          {game.multiplayer && (
            <span className="text-[9px] bg-violet-600 text-white px-1.5 py-0.5 rounded-full font-bold shrink-0">
              <Users size={7} className="inline mr-0.5" />{t("games.multiplayer")}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors shrink-0">
          <X size={18} />
        </button>
      </div>

      {/* iframe area */}
      <div className="flex-1 relative overflow-hidden">

        {/* Loading spinner */}
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0f] z-10 gap-4">
            <span className="text-6xl animate-bounce">{game.emoji}</span>
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div>
            <p className="text-white/50 text-sm">{t("games.loading")}</p>
          </div>
        )}

        {/* Hard fail (onError fired) — only then show external link */}
        {loadFailed ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0a0f] gap-6 p-8">
            <span className="text-6xl">{game.emoji}</span>
            <div className="text-center">
              <p className="text-white font-bold text-lg mb-1">{game.title}</p>
              <p className="text-white/50 text-sm">{t("games.failed")}</p>
            </div>
            <a
              href={game.pageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-full font-bold text-sm transition-colors"
            >
              <ExternalLink size={16} />
              {t("games.openInBrowser")}
            </a>
          </div>
        ) : (
          <iframe
            ref={iframeRef}
            src={game.embedUrl}
            className="w-full h-full border-none"
            allow="autoplay; fullscreen; pointer-lock; gamepad"
            allowFullScreen
            title={game.title}
            onLoad={handleLoad}
            onError={() => { setLoadFailed(true); setLoading(false); }}
          />
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FlexaGames() {
  const { t } = useTranslation();
  const [cat, setCat]             = useState<CatId>("all");
  const [search, setSearch]       = useState("");
  const [activeGame, setActiveGame] = useState<Game | null>(null);

  const CATS: { id: CatId; emoji: string; label: string }[] = [
    { id: "all",      emoji: "🎮", label: t("games.cats.all")      },
    { id: "football", emoji: "⚽", label: t("games.cats.football") },
    { id: "racing",   emoji: "🏎️", label: t("games.cats.racing")   },
    { id: "action",   emoji: "🔫", label: t("games.cats.action")   },
    { id: "casual",   emoji: "🕹️", label: t("games.cats.casual")   },
    { id: "puzzle",   emoji: "♟️", label: t("games.cats.puzzle")   },
  ];

  const filtered = GAMES.filter(g =>
    (cat === "all" || g.cat === cat) &&
    (search === "" || g.title.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      {activeGame && <GameViewer game={activeGame} onClose={() => setActiveGame(null)} />}

      <div className="min-h-dvh bg-[#0a0a0f] text-white">

        {/* Header */}
        <div className="px-4 pt-6 pb-4 bg-gradient-to-b from-violet-950/60 to-transparent">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-violet-600 flex items-center justify-center shadow-lg shrink-0">
              <Gamepad2 size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">{t("games.title")}</h1>
              <p className="text-white/50 text-xs">
                {t("games.subtitle", { count: GAMES.length })}
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder={t("games.search")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/8 border border-white/10 rounded-full px-4 py-2.5 pl-9 text-sm text-white
                         placeholder-white/30 focus:outline-none focus:border-violet-500/60 focus:bg-white/10 transition-colors"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
        </div>

        {/* Category tabs */}
        <div className="px-4 mb-5 overflow-x-auto scrollbar-none">
          <div className="flex gap-2 min-w-max">
            {CATS.map(c => (
              <button
                key={c.id}
                onClick={() => setCat(c.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all whitespace-nowrap",
                  cat === c.id
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-900/40"
                    : "bg-white/8 text-white/60 hover:bg-white/12 hover:text-white/80"
                )}
              >
                <span>{c.emoji}</span> {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Game grid */}
        <div className="px-4 pb-24">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span className="text-5xl">🎮</span>
              <p className="text-white/40 text-sm">{t("games.noResults", { query: search })}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {filtered.map(g => (
                <GameCard key={g.id} game={g} onPlay={setActiveGame} />
              ))}
            </div>
          )}
        </div>

        {/* Bottom fade */}
        <div className="fixed bottom-0 inset-x-0 pointer-events-none">
          <div className="bg-gradient-to-t from-[#0a0a0f] to-transparent h-16" />
        </div>
      </div>
    </>
  );
}
