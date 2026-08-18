/**
 * MusicUploadContext — global background upload manager
 *
 * Uploads files via the Wasabi put-proxy (browser → /api/storage/uploads/put-proxy → Wasabi)
 * using XHR so upload progress is tracked accurately.
 *
 * Flow:
 *   1. POST /api/storage/uploads/request-url  → uploadURL + objectPath
 *   2. XHR PUT audio → /api/storage/uploads/put-proxy/:token  (progress 0–85%)
 *      Response: { url: '/api/storage/wasabi-image?key=<wasabiKey>' }
 *   3. POST /api/storage/uploads/request-url  + PUT cover (85–95%)
 *   4. POST /api/music/register  with storageKey + coverStorageKey  (95–100%)
 *
 * Lives at the App root so uploads survive page navigation.
 */
import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react';
import { CheckCircle, AlertCircle, Music2, X, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type UploadStatus = 'idle' | 'uploading' | 'done' | 'error';

export interface UploadState {
  status:       UploadStatus;
  progress:     number;
  title:        string;
  artist:       string;
  coverPreview: string | null;
  error:        string | null;
  track:        any | null;
}

export interface UploadMeta {
  title:             string;
  artist:            string;
  album?:            string;
  genre?:            string;
  type?:             string;
  monetizationType?: string;
  priceUsd?:         number;
  coverPreview?:     string;
  lyrics?:           string;
}

interface MusicUploadCtx {
  state:   UploadState;
  start:   (audioFile: File, coverFile: File | null, meta: UploadMeta,
            onDone?: (track: any) => void,
            onPlanRequired?: (songCount: number) => void) => void;
  dismiss: () => void;
}

const IDLE: UploadState = {
  status: 'idle', progress: 0, title: '', artist: '',
  coverPreview: null, error: null, track: null,
};

const MusicUploadContext = createContext<MusicUploadCtx>({
  state:   IDLE,
  start:   () => {},
  dismiss: () => {},
});

async function requestUploadUrl(file: File): Promise<{ uploadURL: string; objectPath: string }> {
  const res = await fetch('/api/storage/uploads/request-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type || 'application/octet-stream' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Request-URL failed: HTTP ${res.status}`);
  }
  return res.json();
}

function extractKey(proxyUrl: string): string {
  try {
    const u = new URL(proxyUrl, window.location.origin);
    const k = u.searchParams.get('key');
    if (k) return k;
  } catch { /* fall through */ }
  throw new Error('Server returned an unexpected URL: ' + proxyUrl);
}

function uploadToWasabi(file: File, uploadURL: string, onProgress?: (pct: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadURL);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    if (onProgress) {
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) onProgress(Math.round((ev.loaded / ev.total) * 100));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(extractKey(JSON.parse(xhr.responseText).url)); }
        catch { reject(new Error('Unexpected response: ' + xhr.responseText.slice(0, 200))); }
      } else {
        let msg = `Upload failed: HTTP ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText)?.error ?? msg; } catch { /* ignore */ }
        reject(new Error(msg));
      }
    };
    xhr.onerror  = () => reject(new Error('Network error during upload'));
    xhr.ontimeout = () => reject(new Error('Upload timed out'));
    xhr.send(file);
  });
}

export function MusicUploadProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [state, setState] = useState<UploadState>(IDLE);
  const onDoneRef = useRef<((track: any) => void) | undefined>(undefined);
  const onPlanRef = useRef<((count: number) => void) | undefined>(undefined);

  const dismiss = useCallback(() => setState(IDLE), []);

  const start = useCallback(async (
    audioFile: File,
    coverFile: File | null,
    meta: UploadMeta,
    onDone?: (track: any) => void,
    onPlanRequired?: (songCount: number) => void,
  ) => {
    onDoneRef.current = onDone;
    onPlanRef.current = onPlanRequired;

    setState({ status: 'uploading', progress: 0, title: meta.title, artist: meta.artist,
               coverPreview: meta.coverPreview ?? null, error: null, track: null });

    try {
      const tk = localStorage.getItem('flexamarket_token') ?? '';

      const audioReq = await requestUploadUrl(audioFile);
      const storageKey = await uploadToWasabi(
        audioFile, audioReq.uploadURL,
        (pct) => setState(prev => ({ ...prev, progress: Math.round(pct * 0.85) })),
      );

      setState(prev => ({ ...prev, progress: 85 }));

      let coverStorageKey: string | undefined;
      if (coverFile) {
        const coverReq = await requestUploadUrl(coverFile);
        coverStorageKey = await uploadToWasabi(
          coverFile, coverReq.uploadURL,
          (pct) => setState(prev => ({ ...prev, progress: 85 + Math.round(pct * 0.10) })),
        );
      }

      setState(prev => ({ ...prev, progress: 95 }));

      const regBody: Record<string, string | number> = {
        title: meta.title, artist: meta.artist, storageKey,
        ...(coverStorageKey       ? { coverStorageKey }                          : {}),
        ...(meta.album            ? { album: meta.album }                        : {}),
        ...(meta.genre            ? { genre: meta.genre }                        : {}),
        ...(meta.type             ? { type: meta.type }                          : {}),
        ...(meta.monetizationType ? { monetization_type: meta.monetizationType } : {}),
        ...(meta.priceUsd != null ? { price_usd: meta.priceUsd }                : {}),
        ...(meta.lyrics           ? { lyrics: meta.lyrics }                      : {}),
      };

      const regRes = await fetch('/api/music/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tk}` },
        body: JSON.stringify(regBody),
      });

      if (!regRes.ok) {
        const err = await regRes.json().catch(() => ({}));
        if (err.error === 'ARTIST_PLAN_REQUIRED') {
          onPlanRef.current?.(err.count ?? 0);
          setState(prev => ({ ...prev, status: 'error', error: t('music.planRequired', 'Artist plan required') }));
          return;
        }
        throw new Error(err.error ?? `Register failed: HTTP ${regRes.status}`);
      }

      const { track } = await regRes.json();
      setState(prev => ({ ...prev, status: 'done', progress: 100, track }));
      onDoneRef.current?.(track);

    } catch (err: any) {
      setState(prev => ({ ...prev, status: 'error', error: err?.message ?? 'Upload failed' }));
    }
  }, [t]);

  const showToast = state.status !== 'idle';

  return (
    <MusicUploadContext.Provider value={{ state, start, dismiss }}>
      {children}
      {showToast && (
        <div className='fixed bottom-20 left-4 right-4 z-50 flex items-center gap-3 rounded-xl bg-black/90 p-3 shadow-lg'>
          {state.coverPreview ? (
            <img src={state.coverPreview} alt='' className='h-10 w-10 rounded-md object-cover shrink-0' />
          ) : (
            <div className='flex h-10 w-10 items-center justify-center rounded-md bg-white/10 shrink-0'>
              <Music2 className='h-5 w-5 text-white/70' />
            </div>
          )}
          <div className='min-w-0 flex-1'>
            <p className='truncate text-sm font-semibold text-white'>{state.title || t('music.uploading', 'Uploading…')}</p>
            {state.status === 'uploading' && (
              <div className='mt-1 h-1 w-full overflow-hidden rounded-full bg-white/20'>
                <div className='h-full rounded-full bg-primary transition-all duration-300' style={{ width: `${state.progress}%` }} />
              </div>
            )}
            {state.status === 'done'  && <p className='text-xs text-green-400'>{t('music.uploadDone', 'Upload complete')}</p>}
            {state.status === 'error' && <p className='truncate text-xs text-red-400'>{state.error}</p>}
          </div>
          {state.status === 'uploading' ? <Loader2 className='h-4 w-4 shrink-0 animate-spin text-white/60' />
           : state.status === 'done'    ? <CheckCircle className='h-4 w-4 shrink-0 text-green-400' />
                                        : <AlertCircle className='h-4 w-4 shrink-0 text-red-400' />}
          {state.status !== 'uploading' && (
            <button onClick={dismiss} className='ml-1 shrink-0 text-white/40 hover:text-white'>
              <X className='h-4 w-4' />
            </button>
          )}
        </div>
      )}
    </MusicUploadContext.Provider>
  );
}

export function useMusicUpload(): MusicUploadCtx {
  return useContext(MusicUploadContext);
}
