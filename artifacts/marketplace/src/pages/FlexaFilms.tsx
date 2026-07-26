/**
 * FlexaFilms — Free multilingual film library.
 *
 * Sources:
 *   archive.org — public-domain classics, direct MP4 streaming (no iframe issues).
 *                 Video plays via native <video> element for full mobile support.
 *   youtube     — modern films, iframe embed (YouTube handles mobile well).
 *
 * Language switching: for silent films, all languages show the same video
 * (intertitles are baked in). For dubbed/subbed YouTube content, the iframe
 * src updates with cc_lang_pref for subtitles.
 */
import { useState, useCallback } from "react";
import { Film, X, ExternalLink, ChevronLeft, Captions } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type LangCode = "en" | "fr" | "ht" | "es" | "de";
type Genre    = "tout" | "klas" | "komedi" | "dram" | "tèrib" | "aksyon" | "ayisyen";

interface FilmLang {
  code: LangCode;
  flag: string;
  label: string;
  /** archive = direct MP4 URL in `src`; youtube = YouTube video ID in `src` */
  type: "archive" | "youtube";
  /** archive.org direct .mp4 URL  OR  YouTube videoId */
  src: string;
  /** true = dubbed audio track; false/undefined = subtitles */
  dubbed?: boolean;
}

interface FilmEntry {
  id: string;
  title: string;
  year: number;
  genre: Genre;
  duration: string;
  desc: string;
  emoji: string;
  gradient: string;
  /** Link to watch on the source site (fallback) */
  externalUrl: string;
  langs: FilmLang[];
}

// ── Film catalogue ────────────────────────────────────────────────────────────
// archive.org direct MP4 URLs verified with HTTP HEAD (all stream via range requests).
// playsInline + preload="metadata" = mobile-safe (only metadata downloaded initially).

const FILMS: FilmEntry[] = [

  // ─── Public domain classics ───────────────────────────────────────────────
  {
    id: "nosferatu",
    title: "Nosferatu",
    year: 1922,
    genre: "tèrib",
    duration: "1h 34min",
    desc: "Istwa yon òm ki ale vann kay yon mèt vampire — fim drakyula ki orijinal, ki ban ou kè sote toujou.",
    emoji: "🧛",
    gradient: "from-gray-900 via-stone-800 to-black",
    externalUrl: "https://archive.org/details/nosferatu_1922",
    langs: [
      { code: "en", flag: "🇺🇸", label: "English",  type: "archive", src: "https://archive.org/download/nosferatu_1922/nosferatu_1922.mp4" },
      { code: "fr", flag: "🇫🇷", label: "Français",  type: "archive", src: "https://archive.org/download/nosferatu_1922/nosferatu_1922.mp4" },
      { code: "ht", flag: "🇭🇹", label: "Kreyòl",    type: "archive", src: "https://archive.org/download/nosferatu_1922/nosferatu_1922.mp4" },
      { code: "de", flag: "🇩🇪", label: "Deutsch",   type: "archive", src: "https://archive.org/download/nosferatu_1922/nosferatu_1922.mp4" },
    ],
  },
  {
    id: "city-lights",
    title: "City Lights",
    year: 1931,
    genre: "komedi",
    duration: "1h 27min",
    desc: "Chaplin, vagabon ki genyen kè bon, tonbe renmen yon ti fi avèg. Komedi romantik ki touche kè tout moun.",
    emoji: "🌃",
    gradient: "from-slate-800 via-zinc-700 to-slate-900",
    externalUrl: "https://archive.org/details/city-lights-1931",
    langs: [
      { code: "en", flag: "🇺🇸", label: "English",  type: "archive", src: "https://archive.org/download/city-lights-1931/City-lights_1931.mp4" },
      { code: "fr", flag: "🇫🇷", label: "Français",  type: "archive", src: "https://archive.org/download/city-lights-1931/City-lights_1931.mp4" },
      { code: "ht", flag: "🇭🇹", label: "Kreyòl",    type: "archive", src: "https://archive.org/download/city-lights-1931/City-lights_1931.mp4" },
      { code: "es", flag: "🇪🇸", label: "Español",   type: "archive", src: "https://archive.org/download/city-lights-1931/City-lights_1931.mp4" },
    ],
  },
  {
    id: "the-general",
    title: "The General",
    year: 1926,
    genre: "komedi",
    duration: "1h 19min",
    desc: "Buster Keaton kondui yon trenn pandan Lagè Sivil ameriken — fim kòmik ak aksyon ki pou tout tan.",
    emoji: "🚂",
    gradient: "from-amber-900 via-yellow-800 to-amber-950",
    externalUrl: "https://archive.org/details/TheGeneral1926",
    langs: [
      { code: "en", flag: "🇺🇸", label: "English",  type: "archive", src: "https://archive.org/download/TheGeneral1926/The_General_1926_720p_512kb.mp4" },
      { code: "fr", flag: "🇫🇷", label: "Français",  type: "archive", src: "https://archive.org/download/TheGeneral1926/The_General_1926_720p_512kb.mp4" },
      { code: "ht", flag: "🇭🇹", label: "Kreyòl",    type: "archive", src: "https://archive.org/download/TheGeneral1926/The_General_1926_720p_512kb.mp4" },
    ],
  },
  {
    id: "great-dictator",
    title: "The Great Dictator",
    year: 1940,
    genre: "komedi",
    duration: "2h 05min",
    desc: "Chaplin parodye Hitler nan fim satir ki te brave tout diktati mondyal yo. Monològ final la se ikonik.",
    emoji: "🎭",
    gradient: "from-neutral-800 via-stone-700 to-neutral-900",
    externalUrl: "https://archive.org/details/the_great_dictator",
    langs: [
      { code: "en", flag: "🇺🇸", label: "English",  type: "archive", src: "https://archive.org/download/the_great_dictator/the_great_dictator.mp4", dubbed: true },
      { code: "fr", flag: "🇫🇷", label: "Sous-titres", type: "archive", src: "https://archive.org/download/the_great_dictator/the_great_dictator.mp4" },
    ],
  },
  {
    id: "battleship-potemkin",
    title: "Battleship Potemkin",
    year: 1925,
    genre: "dram",
    duration: "1h 15min",
    desc: "Revòlt matlo Risi kont ofisye yo — youn nan pi gwo chèf-dèv sinemà mondyal, avèk sèn eskalye mirak la.",
    emoji: "⚓",
    gradient: "from-blue-900 via-sky-800 to-blue-950",
    externalUrl: "https://archive.org/details/BattleshipPotemkin",
    langs: [
      { code: "en", flag: "🇺🇸", label: "English",  type: "archive", src: "https://archive.org/download/BattleshipPotemkin/Battleship_Potemkin_512kb.mp4" },
      { code: "fr", flag: "🇫🇷", label: "Français",  type: "archive", src: "https://archive.org/download/BattleshipPotemkin/Battleship_Potemkin_512kb.mp4" },
      { code: "de", flag: "🇩🇪", label: "Deutsch",   type: "archive", src: "https://archive.org/download/BattleshipPotemkin/Battleship_Potemkin_512kb.mp4" },
      { code: "es", flag: "🇪🇸", label: "Español",   type: "archive", src: "https://archive.org/download/BattleshipPotemkin/Battleship_Potemkin_512kb.mp4" },
    ],
  },

  // ─── YouTube — modern films (with verified embeddable IDs) ────────────────
  {
    id: "toussaint-louverture",
    title: "Toussaint Louverture",
    year: 2012,
    genre: "ayisyen",
    duration: "2h 42min",
    desc: "Epopé imèse sou ero liberasyon Ayiti — Toussaint Louverture mennen yon revòlt kap chanje istwa.",
    emoji: "✊",
    gradient: "from-red-900 via-red-800 to-black",
    externalUrl: "https://www.youtube.com/results?search_query=Toussaint+Louverture+2012+film",
    langs: [
      { code: "fr", flag: "🇫🇷", label: "Français",  type: "youtube", src: "JoFjTInQDyE", dubbed: true },
      { code: "ht", flag: "🇭🇹", label: "Kreyòl CC",  type: "youtube", src: "JoFjTInQDyE" },
      { code: "en", flag: "🇺🇸", label: "English CC", type: "youtube", src: "JoFjTInQDyE" },
    ],
  },
  {
    id: "ip-man",
    title: "Ip Man",
    year: 2008,
    genre: "aksyon",
    duration: "1h 46min",
    desc: "Istwa mèt arts marsiyal ki antrene Bruce Lee — spektakl konba ki ekstrawòdinè.",
    emoji: "🥋",
    gradient: "from-yellow-900 via-amber-800 to-yellow-950",
    externalUrl: "https://www.youtube.com/results?search_query=Ip+Man+2008+full+movie",
    langs: [
      { code: "en", flag: "🇺🇸", label: "English",  type: "youtube", src: "Il7oXzBFpek", dubbed: true },
      { code: "fr", flag: "🇫🇷", label: "Français CC", type: "youtube", src: "Il7oXzBFpek" },
    ],
  },
  {
    id: "belle",
    title: "Belle",
    year: 2013,
    genre: "dram",
    duration: "1h 39min",
    desc: "Angletè 18yèm syèk — yon jèn fanm milat ap batay pou dwa li kòm yon noblès nwa.",
    emoji: "👑",
    gradient: "from-amber-900 via-yellow-800 to-amber-950",
    externalUrl: "https://www.youtube.com/results?search_query=Belle+2013+film",
    langs: [
      { code: "en", flag: "🇺🇸", label: "English",  type: "youtube", src: "h9yVKECILlY", dubbed: true },
      { code: "fr", flag: "🇫🇷", label: "Français CC", type: "youtube", src: "h9yVKECILlY" },
    ],
  },
];

// ── Genre config (uses i18n) ──────────────────────────────────────────────────

type GenreKey = Genre;

// ── Build YouTube embed URL ───────────────────────────────────────────────────

function buildYouTubeUrl(lang: FilmLang): string {
  const p = new URLSearchParams({
    autoplay:       "1",
    rel:            "0",
    modestbranding: "1",
    cc_load_policy: "1",
    cc_lang_pref:   lang.code,
    hl:             lang.code,
  });
  return `https://www.youtube.com/embed/${lang.src}?${p}`;
}

// ── Thumbnail URL ─────────────────────────────────────────────────────────────

function thumbUrl(film: FilmEntry): string {
  const arc = film.langs.find(l => l.type === "archive");
  if (arc) {
    // Use archive.org item thumbnail
    const match = arc.src.match(/archive\.org\/download\/([^/]+)\//);
    if (match) return `https://archive.org/services/img/${match[1]}`;
  }
  const yt = film.langs.find(l => l.type === "youtube");
  if (yt) return `https://img.youtube.com/vi/${yt.src}/hqdefault.jpg`;
  return "";
}

// ── Film card ─────────────────────────────────────────────────────────────────

function FilmCard({
  film,
  onPlay,
}: {
  film: FilmEntry;
  onPlay: (film: FilmEntry, lang: FilmLang) => void;
}) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);
  const thumb = thumbUrl(film);

  return (
    <div className="group relative flex flex-col rounded-xl overflow-hidden bg-[#111118] shadow-lg hover:shadow-xl transition-shadow">
      {/* Poster */}
      <div className="relative w-full" style={{ paddingBottom: "150%" }}>
        {thumb && !imgError ? (
          <img
            src={thumb}
            alt={film.title}
            onError={() => setImgError(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className={cn("absolute inset-0 bg-gradient-to-br flex items-center justify-center", film.gradient)}>
            <span className="text-5xl drop-shadow-xl">{film.emoji}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
        <div className="absolute top-2 right-2 bg-black/70 text-white/80 text-[9px] font-bold px-1.5 py-0.5 rounded">
          {film.year}
        </div>
        <div className="absolute bottom-2 left-2 text-white/70 text-[9px] font-medium bg-black/60 rounded px-1.5 py-0.5">
          {film.duration}
        </div>
      </div>

      {/* Info */}
      <div className="px-2.5 pt-2 pb-1.5">
        <p className="text-white text-[12px] font-bold leading-tight line-clamp-1">{film.title}</p>
        <p className="text-white/40 text-[10px] mt-0.5 line-clamp-2 leading-tight">{film.desc}</p>
      </div>

      {/* Language buttons */}
      <div className="px-2 pb-2.5 flex flex-wrap gap-1 mt-0.5">
        {film.langs.map(lang => (
          <button
            key={`${lang.code}-${lang.src}`}
            onClick={() => onPlay(film, lang)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold transition-all",
              "bg-white/8 hover:bg-indigo-600 active:bg-indigo-700 text-white/70 hover:text-white",
              "border border-white/10 hover:border-indigo-500"
            )}
            title={lang.dubbed ? `${t("films.soundLegend")} — ${lang.label}` : `CC — ${lang.label}`}
          >
            <span>{lang.flag}</span>
            <span>{lang.label.split(" ")[0]}</span>
            {lang.dubbed
              ? <span className="text-indigo-300 text-[8px]">🔊</span>
              : <span className="text-white/30"><Captions size={8} /></span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Film player overlay ───────────────────────────────────────────────────────

function FilmPlayer({
  film,
  initialLang,
  onClose,
}: {
  film: FilmEntry;
  initialLang: FilmLang;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [activeLang, setActiveLang] = useState<FilmLang>(initialLang);
  const [loading, setLoading]       = useState(true);
  const [videoKey, setVideoKey]     = useState(0); // force re-mount on lang switch

  const handleLangSwitch = useCallback((lang: FilmLang) => {
    if (lang.code === activeLang.code && lang.src === activeLang.src) return;
    setLoading(true);
    setVideoKey(k => k + 1);
    setActiveLang(lang);
  }, [activeLang]);

  const isArchive  = activeLang.type === "archive";
  const youtubeUrl = !isArchive ? buildYouTubeUrl(activeLang) : "";

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>

      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-[#0a0a0f]/95 border-b border-white/10 shrink-0">
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-white/70 hover:text-white transition-colors shrink-0"
        >
          <ChevronLeft size={20} />
          <span className="text-sm font-medium">{t("films.back")}</span>
        </button>
        <div className="flex items-center gap-1.5 flex-1 min-w-0 mx-1">
          <span className="text-lg shrink-0">{film.emoji}</span>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm leading-tight truncate">{film.title}</p>
            <p className="text-white/40 text-[10px]">{film.year} · {film.duration}</p>
          </div>
        </div>
        <a
          href={film.externalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-white/40 hover:text-indigo-400 transition-colors shrink-0"
          title={t("films.openInBrowser")}
        >
          <ExternalLink size={15} />
        </a>
        <button onClick={onClose} className="text-white/40 hover:text-white transition-colors ml-1 shrink-0">
          <X size={17} />
        </button>
      </div>

      {/* Language tabs */}
      {film.langs.length > 1 && (
        <div className="flex gap-2 px-3 py-2 bg-[#0a0a0f]/80 border-b border-white/8 overflow-x-auto scrollbar-none shrink-0">
          {film.langs.map(lang => (
            <button
              key={`${lang.code}-${lang.src}`}
              onClick={() => handleLangSwitch(lang)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap shrink-0",
                activeLang.code === lang.code && activeLang.src === lang.src
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40"
                  : "bg-white/8 text-white/60 hover:bg-white/15 hover:text-white border border-white/10"
              )}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
              {lang.dubbed
                ? <span className="opacity-70 text-[10px]">🔊</span>
                : <Captions size={10} className="opacity-50" />}
            </button>
          ))}
        </div>
      )}

      {/* Video area */}
      <div className="flex-1 relative bg-black overflow-hidden">

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black">
            <span className="text-6xl animate-bounce">{film.emoji}</span>
            <div className="flex gap-1.5">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"
                     style={{ animationDelay: `${i * 0.18}s` }} />
              ))}
            </div>
            <p className="text-white/40 text-sm">{t("films.loading")}</p>
          </div>
        )}

        {isArchive ? (
          /* ── Native HTML5 video for archive.org MP4s ── */
          <video
            key={videoKey}
            src={activeLang.src}
            controls
            playsInline          /* iOS: keep inside page, don't force fullscreen */
            preload="metadata"   /* Only load first few KB on mobile data */
            className="w-full h-full"
            onCanPlay={() => setLoading(false)}
            onLoadedMetadata={() => setLoading(false)}
            onError={() => setLoading(false)}
            style={{ maxHeight: "100%", objectFit: "contain" }}
          />
        ) : (
          /* ── YouTube iframe ── */
          <iframe
            key={videoKey}
            src={youtubeUrl}
            className="w-full h-full border-none"
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
            allowFullScreen
            title={`${film.title} — ${activeLang.label}`}
            onLoad={() => setLoading(false)}
          />
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FlexaFilms() {
  const { t } = useTranslation();
  const [genre, setGenre]   = useState<GenreKey>("tout");
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<{ film: FilmEntry; lang: FilmLang } | null>(null);

  const GENRES: { id: GenreKey; label: string; emoji: string }[] = [
    { id: "tout",    label: t("films.genres.all"),     emoji: "🎬" },
    { id: "ayisyen", label: t("films.genres.haitian"), emoji: "🇭🇹" },
    { id: "aksyon",  label: t("films.genres.action"),  emoji: "💥" },
    { id: "komedi",  label: t("films.genres.comedy"),  emoji: "😂" },
    { id: "dram",    label: t("films.genres.drama"),   emoji: "🎭" },
    { id: "tèrib",   label: t("films.genres.horror"),  emoji: "👻" },
    { id: "klas",    label: t("films.genres.classic"), emoji: "🎞️" },
  ];

  const filtered = FILMS.filter(f =>
    (genre === "tout" || f.genre === genre) &&
    (search === "" || f.title.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <>
      {active && (
        <FilmPlayer
          film={active.film}
          initialLang={active.lang}
          onClose={() => setActive(null)}
        />
      )}

      <div className="min-h-dvh bg-[#0a0a0f] text-white">

        {/* Header */}
        <div className="px-4 pt-6 pb-3 bg-gradient-to-b from-indigo-950/50 to-transparent">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shrink-0">
              <Film size={22} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">{t("films.title")}</h1>
              <p className="text-white/50 text-xs">
                {t("films.subtitle", { count: FILMS.length })}
              </p>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 mb-3 flex items-center gap-4 text-[11px] text-white/40">
          <span>{t("films.soundLegend")}</span>
          <span>{t("films.ccLegend")}</span>
        </div>

        {/* Search */}
        <div className="px-4 mb-4">
          <div className="relative">
            <input
              type="text"
              placeholder={t("films.search")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/8 border border-white/10 rounded-full px-4 py-2.5 pl-9 text-sm
                         text-white placeholder-white/30 focus:outline-none focus:border-indigo-500/60
                         focus:bg-white/10 transition-colors"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                 width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
        </div>

        {/* Genre tabs */}
        <div className="px-4 mb-5 overflow-x-auto scrollbar-none">
          <div className="flex gap-2 min-w-max">
            {GENRES.map(g => (
              <button
                key={g.id}
                onClick={() => setGenre(g.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all whitespace-nowrap",
                  genre === g.id
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/40"
                    : "bg-white/8 text-white/60 hover:bg-white/12 hover:text-white/80"
                )}
              >
                <span>{g.emoji}</span> {g.label}
              </button>
            ))}
          </div>
        </div>

        {/* Film grid */}
        <div className="px-4 pb-28">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <span className="text-5xl">🎬</span>
              <p className="text-white/40 text-sm">
                {search ? t("films.noResults", { query: search }) : t("films.genres.all")}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map(film => (
                <FilmCard
                  key={film.id}
                  film={film}
                  onPlay={(f, lang) => setActive({ film: f, lang })}
                />
              ))}
            </div>
          )}
        </div>

        {/* Bottom fade */}
        <div className="fixed bottom-0 inset-x-0 h-16 bg-gradient-to-t from-[#0a0a0f] to-transparent pointer-events-none" />
      </div>
    </>
  );
}
