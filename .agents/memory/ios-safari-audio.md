---
name: iOS Safari HTML audio playback pitfalls
description: Known iOS Safari bugs and required workarounds for <audio> playback in a React app
---

## The rules

1. **Call `audio.load()` after every `audio.src` change, before `audio.play()`.**
   Without it, Safari may silently ignore `play()` after a src swap — no error thrown, no events fired, no audio starts.

2. **Listen to `"playing"` (not just `"play"`) to set `playing: true` in state.**
   `"play"` fires immediately when `.play()` is called, before buffering completes; `audio.paused` can still be `true` at that point. `"playing"` fires only when the browser has data and is actually advancing frames — it is the reliable "audio is audible" event on iOS Safari.

3. **Resolve the `play()` promise to confirm playback started.**
   `audio.play()` returns a Promise. When it resolves, playback is confirmed. Set `playing: true` in `.then()` as a final safety net in addition to the event listeners.

4. **Poll `audio.paused` every 250 ms as a reconciliation fallback.**
   iOS Safari throttles `timeupdate` events when the screen is dim or the app is backgrounded. A `setInterval` that mirrors `!audio.paused && !audio.ended` into React state (both `playing` and `currentTime`) keeps the UI accurate even when events are missed. Do NOT add a `readyState >= 2` gate — it can filter out valid playing states on slow connections.

5. **Never swallow the `play()` rejection silently for debugging.**
   `.catch(() => {})` hides autoplay-policy errors. At minimum log the error; only silence it in production after confirming the error is a benign autoplay rejection.

**Why:** iOS Safari's autoplay restrictions and its lazy event dispatch differ substantially from Chrome/desktop. The `"play"` / `"playing"` distinction, the `load()` requirement after src swap, and the throttled `timeupdate` are the three most common sources of a "music audible but UI frozen" bug.

6. **Keep `<audio ref={audioRef}>` in the main (non-loading) return, not only in the loading return.**
   In a component with an early-return loading spinner, placing `<audio>` only in the loading path means it is unmounted as soon as `loading` becomes `false`. After that, `audioRef.current` is permanently `null` and every call to `playTrack` silently bails at `if (!audio) return` — no music, no mini player, no error. The element must appear in **both** returns (or use `style={{ display: "none" }}` in the main return alongside the spinner-path).

**How to apply:** Every time `audio.src` is assigned a new value in `playTrack`, the sequence must be:
```
audio.pause();
audio.src = url;
audio.load();          // ← required on iOS
audio.play().then(() => setState({ playing: true })).catch(err => console.warn(err));
```
And ensure the event listener useEffect registers `"playing"` in addition to `"play"`.
