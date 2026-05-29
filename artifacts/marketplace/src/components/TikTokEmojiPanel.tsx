import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Search, Clock, Smile, PawPrint, Apple, Zap, MapPin, Lightbulb, Heart, Flag } from "lucide-react";

// ─── Emoji dataset ────────────────────────────────────────────────────────────

const EMOJIS: Record<string, string[]> = {
  smileys: [
    "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍","🤩","😘","😗","☺️","😚",
    "😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄",
    "😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","💫","🤯","🤠",
    "🥸","🥳","😎","🤓","🧐","😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢",
    "😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿","💀","☠️","💩","🤡","👹",
    "👺","👻","👽","👾","🤖","💋","💌","💘","💝","💖","💗","💓","💞","💕","💟","❣️","❤️","🧡","💛","💚",
    "💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","✨","⭐","🌟","💫","🎊","🎉","🎈","🎀","🎁","🏆","🥇","🎯",
  ],
  people: [
    "👋","🤚","🖐️","✋","🖖","🤙","💪","🦾","✌️","🤞","🤟","🤘","👈","👉","👆","👇","☝️","👍","👎","✊",
    "👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏","✍️","💅","🤳","💃","🕺","🧑","👶","🧒","👦","👧","👱",
    "🧔","👴","👵","🧓","👮","🕵️","💂","🧑‍⚕️","👨‍⚕️","👩‍⚕️","🧑‍🎓","👨‍🎓","👩‍🎓","🧑‍🏫","🧑‍🍳","👨‍🍳","👩‍🍳","🧑‍🌾","🧑‍🏭","🧑‍💼",
    "🧑‍🎨","🧑‍✈️","🧑‍🚀","🧑‍🚒","👷","🤴","👸","🧙","🧚","🧛","🧜","🧝","🧞","🧟","🦸","🦹","🙍","🙎","🙅","🙆",
    "💁","🙋","🧏","🙇","🤦","🤷","💆","💇","🚶","🧍","🧎","🏃","👫","👬","👭","💑","👨‍👩‍👦","👨‍👩‍👧","👪","🗣️","👤",
  ],
  animals: [
    "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵","🙈","🙉","🙊","🐔","🐧",
    "🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🐛","🦋","🐌","🐞","🐜","🦟","🦗","🕷️","🦂",
    "🐢","🐍","🦎","🦖","🦕","🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆",
    "🦓","🦍","🦧","🐘","🦛","🦏","🐪","🐫","🦒","🦘","🐃","🐂","🐄","🐎","🐖","🐏","🐑","🦙","🐐","🦌",
    "🐕","🐩","🦮","🐕‍🦺","🐈","🐈‍⬛","🐓","🦃","🦚","🦜","🦢","🦩","🕊️","🐇","🦝","🦨","🦡","🦦","🦥","🐁",
    "🐀","🐿️","🦔","🌵","🎄","🌲","🌳","🌴","🌱","🌿","☘️","🍀","🍃","🍂","🍁","🍄","🐚","🌾","💐","🌷",
    "🌹","🥀","🌺","🌸","🌼","🌻","🌞","🌝","🌛","🌜","🌚","🌕","🌙","⭐","🌈","☁️","⛅","⚡","❄️","🌊",
  ],
  food: [
    "🍎","🍊","🍋","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️",
    "🫑","🌽","🥕","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩",
    "🍗","🍖","🌭","🍔","🍟","🍕","🥪","🥙","🧆","🌮","🌯","🫔","🥗","🥘","🍝","🍜","🍲","🍛","🍣","🍱",
    "🥟","🍤","🍙","🍚","🍘","🍥","🥮","🍢","🧁","🎂","🍰","🍮","🍭","🍬","🍫","🍿","🍩","🍪","🌰","🥜",
    "🍯","🧃","🍵","☕","🫖","🍺","🍻","🥂","🍷","🥃","🍹","🧋","🍶","🍾","🧊","🥛","🍼","🧉","🥤","🫗",
  ],
  activities: [
    "⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🏓","🏸","🏒","🏑","🥍","🏏","🪃","🥅","⛳","🪁",
    "🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","⛷️","🏂","🪂","🏋️","🤼","🤸","⛹️","🤺",
    "🏇","🏊","🤽","🚣","🧘","🎠","🎡","🎢","🎪","🤹","🎭","🎨","🎬","🎤","🎧","🎼","🎵","🎶","🎷","🪗",
    "🎸","🎹","🪘","🎺","🎻","🥁","🪄","🎮","🕹️","🎲","♟️","🎯","🎳","🎰","🧩","🪅","🎈","🎉","🎊","🎁",
    "🎀","🎗️","🏆","🥇","🥈","🥉","🏅","🎖️","🎪","🎭","🎬","🎨","🖼️","🎰","🎳","🎯","🎱","🔮","🧿","💡",
  ],
  travel: [
    "🚗","🚕","🚙","🚌","🚎","🏎️","🚓","🚑","🚒","🚐","🛻","🚚","🚛","🚜","🏍️","🛵","🚲","🛴","🛹","🛼",
    "🚏","⛽","🚨","🚥","🛑","🚦","🛸","🚁","⛵","🚤","🛥️","🛳️","⛴️","🚢","✈️","🛩️","🛫","🛬","💺","🚀",
    "🪐","🌍","🌎","🌏","🗺️","🧭","🏔️","⛰️","🌋","🏕️","🏖️","🏜️","🏝️","🏞️","🏟️","🏛️","🏗️","🏘️","🏠","🏡",
    "🏢","🏣","🏤","🏥","🏦","🏨","🏩","🏪","🏫","🏭","🏯","🏰","💒","🗼","🗽","⛪","🕌","🛕","🕍","⛩️",
    "🕋","⛲","⛺","🌁","🌃","🏙️","🌄","🌅","🌆","🌇","🌉","🌌","🌠","🎇","🎆","🌐","🗾","🧭","🌡️","⛱️",
  ],
  objects: [
    "⌚","📱","💻","⌨️","🖥️","🖨️","🖱️","💾","💿","📀","📷","📸","📹","🎥","📽️","🎞️","📞","☎️","📺","📻",
    "🧭","⏱️","⏰","⏲️","⏳","⌛","🕰️","💡","🔦","🕯️","🪔","🧱","💎","💍","👑","💰","💴","💵","💶","💷",
    "💸","💳","🪙","🧾","📊","📈","📉","📋","📌","📍","🗂️","📎","✂️","🗃️","🗳️","🗄️","🗑️","🔐","🔑","🗝️",
    "🔨","🪓","⛏️","🛠️","🔧","🔩","🪛","🔗","⛓️","🪝","🧲","🔫","💉","💊","🩹","🩺","🧰","🪣","🛒","🚪",
    "🛏️","🛋️","🪑","🚽","🚿","🛁","🧴","🧷","🧹","🧺","🧻","🧼","🪥","🪒","🧽","📔","📓","📒","📕","📚",
    "🔬","🔭","📡","🧲","💊","🩻","🪤","🗡️","⚔️","🛡️","🪖","🔮","🪬","🧿","🎎","🎐","🎏","🎑","🧧","🎠",
  ],
  symbols: [
    "❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝",
    "💟","☮️","✝️","☪️","🕉️","✡️","🔯","🕎","☯️","☦️","🛐","♻️","🔱","📛","🔰","⭕","✅","☑️","✔️","❌",
    "❎","➕","➖","➗","✖️","♾️","💲","‼️","⁉️","❓","❔","❕","❗","💯","🔚","🔛","🔜","🔝","🆗","🆕",
    "🆙","🆒","🆓","🆘","🆚","©️","®️","™️","🔴","🟠","🟡","🟢","🔵","🟣","🟤","⚫","⚪","🟥","🟧","🟨",
    "🟩","🟦","🟪","🟫","⬛","⬜","🔶","🔷","🔸","🔹","🔺","🔻","💠","🔘","🔲","🔳","⚡","🌀","🔔","🔕",
    "🎵","🎶","💬","💭","💤","🗯️","♠️","♥️","♦️","♣️","🃏","🀄","🎴","🔈","🔉","🔊","📣","📢","🔔","🔕",
  ],
  flags: [
    "🏳️","🏴","🚩","🎌","🏁","🏳️‍🌈","🏳️‍⚧️","🇭🇹","🇫🇷","🇺🇸","🇩🇴","🇨🇦","🇧🇷","🇲🇽","🇬🇧","🇩🇪","🇪🇸","🇮🇹","🇵🇹","🇳🇱",
    "🇧🇪","🇨🇭","🇦🇹","🇸🇪","🇳🇴","🇩🇰","🇫🇮","🇵🇱","🇷🇺","🇨🇳","🇯🇵","🇰🇷","🇮🇳","🇦🇺","🇿🇦","🇳🇬","🇬🇭","🇸🇳","🇨🇮","🇨🇲",
    "🇨🇩","🇦🇴","🇪🇹","🇰🇪","🇹🇿","🇺🇬","🇲🇦","🇩🇿","🇹🇳","🇪🇬","🇸🇦","🇦🇪","🇶🇦","🇮🇱","🇹🇷","🇮🇷","🇵🇰","🇧🇩","🇻🇳","🇹🇭",
    "🇮🇩","🇲🇾","🇵🇭","🇸🇬","🇦🇷","🇨🇱","🇨🇴","🇵🇪","🇻🇪","🇨🇺","🇵🇷","🇯🇲","🇹🇹","🇧🇧","🇧🇸","🇦🇬","🇱🇨","🇻🇨","🇬🇩","🇩🇲",
  ],
};

const RECENT_KEY = "flexa_emoji_recent";
const MAX_RECENT = 24;

function getRecent(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}
function pushRecent(emoji: string) {
  const arr = [emoji, ...getRecent().filter(e => e !== emoji)].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(arr)); } catch { /* noop */ }
}

const CATEGORIES = [
  { id: "recent",     icon: "🕐",   label: "Resan"   },
  { id: "smileys",   icon: "😀",   label: "Souri"   },
  { id: "people",    icon: "👋",   label: "Moun"    },
  { id: "animals",   icon: "🐶",   label: "Bèt"     },
  { id: "food",      icon: "🍔",   label: "Manje"   },
  { id: "activities",icon: "⚽",   label: "Spò"     },
  { id: "travel",    icon: "✈️",   label: "Vwayaj"  },
  { id: "objects",   icon: "💡",   label: "Objè"    },
  { id: "symbols",   icon: "❤️",   label: "Senbòl"  },
  { id: "flags",     icon: "🏳️",   label: "Drapo"   },
];

interface Props {
  onEmojiSelect: (emoji: string) => void;
  visible: boolean;
}

export default function TikTokEmojiPanel({ onEmojiSelect, visible }: Props) {
  const [activeCategory, setActiveCategory] = useState("smileys");
  const [search, setSearch] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) setRecent(getRecent());
  }, [visible]);

  const handleSelect = useCallback((emoji: string) => {
    pushRecent(emoji);
    setRecent(getRecent());
    onEmojiSelect(emoji);
  }, [onEmojiSelect]);

  const searchResults = useMemo(() => {
    if (!search.trim()) return null;
    const all = Object.values(EMOJIS).flat();
    return all.filter(e => e.includes(search));
  }, [search]);

  const displayEmojis = useMemo(() => {
    if (searchResults) return searchResults;
    if (activeCategory === "recent") return recent.length ? recent : EMOJIS.smileys.slice(0, 24);
    return EMOJIS[activeCategory] ?? [];
  }, [searchResults, activeCategory, recent]);

  return (
    <div
      style={{
        overflow: "hidden",
        maxHeight: visible ? 300 : 0,
        transition: "max-height 0.28s cubic-bezier(0.4, 0, 0.2, 1)",
        flexShrink: 0,
      }}
    >
    <div
      className="w-full flex flex-col"
      style={{
        background: "#1a1a1a",
        borderTop: "1px solid rgba(255,255,255,0.08)",
        height: 300,
      }}
    >
      {/* Search bar */}
      <div className="px-3 pt-2.5 pb-1.5 shrink-0">
        <div
          className="flex items-center gap-2 px-3 rounded-xl"
          style={{ background: "rgba(255,255,255,0.10)", height: 36 }}
        >
          <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.4)" }} />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Chache emoji…"
            className="flex-1 bg-transparent border-0 outline-none text-white text-[13px] placeholder:text-white/30"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-white/40 hover:text-white/70 text-xs font-bold"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category tabs */}
      {!search && (
        <div
          className="flex items-center gap-0 shrink-0 overflow-x-auto scrollbar-none px-1"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
        >
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              type="button"
              onClick={() => { setActiveCategory(cat.id); gridRef.current?.scrollTo({ top: 0 }); }}
              className="flex flex-col items-center justify-center shrink-0 px-2 py-1.5 relative transition-all"
              style={{
                minWidth: 40,
                borderBottom: activeCategory === cat.id ? "2px solid #f97316" : "2px solid transparent",
                opacity: activeCategory === cat.id ? 1 : 0.45,
              }}
              aria-label={cat.label}
              title={cat.label}
            >
              <span style={{ fontSize: 20, lineHeight: 1 }}>{cat.icon}</span>
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div
        ref={gridRef}
        className="flex-1 overflow-y-auto overscroll-contain px-1 py-1"
        style={{ scrollbarWidth: "none" }}
      >
        {search && searchResults?.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-white/30 text-sm">Pa jwenn rezilta</p>
          </div>
        )}

        {activeCategory === "recent" && !search && recent.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-1">
            <span style={{ fontSize: 28 }}>🕐</span>
            <p className="text-white/30 text-xs">Pa gen emoji resan ankò</p>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(8, 1fr)",
            gap: 2,
          }}
        >
          {displayEmojis.map((emoji, i) => (
            <button
              key={`${emoji}-${i}`}
              type="button"
              onClick={() => handleSelect(emoji)}
              className="flex items-center justify-center rounded-lg active:scale-90 transition-transform select-none"
              style={{
                aspectRatio: "1",
                fontSize: 26,
                background: "transparent",
                WebkitTapHighlightColor: "transparent",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.10)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
              aria-label={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}
