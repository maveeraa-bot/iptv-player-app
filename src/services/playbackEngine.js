// Oynatma motoru seçimi — "her zaman çalışsın" katmanı.
// Prism (github.com/monkzoren/Prism, MIT) projesindeki playback.ts'in
// basitleştirilmiş JS portu.
//
// Strateji:
//  1. .m3u8 / HLS görünen adresler → hls.js (Safari'de native HLS)
//  2. .ts / mpegts görünen adresler → mpegts.js (ham MPEG-TS'i MSE ile oynatır)
//  3. diğerleri → native <video>
//
// Seçilen motor kalıcı (fatal) hatayla başarısız olursa, hatayı kullanıcıya
// göstermeden önce sıradaki motoru dener.

export function candidateEngines(url) {
    const u = (url || '').toLowerCase();
    const path = u.split('?')[0];
    if (path.endsWith('.m3u8') || u.includes('/hls/') || u.includes('type=m3u8')) {
        return ['hls', 'mpegts', 'native'];
    }
    if (path.endsWith('.ts') || path.endsWith('.mts') || u.includes('mpegts')) {
        return ['mpegts', 'hls', 'native'];
    }
    if (path.endsWith('.mp4') || path.endsWith('.webm') || path.endsWith('.mkv')) {
        return ['native', 'hls', 'mpegts'];
    }
    // Uzantısız adresler (IPTV'de çok yaygın) — önce HLS, sonra ham TS.
    return ['hls', 'mpegts', 'native'];
}

/**
 * @param {HTMLVideoElement} video
 * @param {string} url
 * @param {{ onFatalError: (message: string) => void, onEngineChange?: (engine: string) => void }} cb
 * @returns {{ engine: () => string, destroy: () => void }}
 */
export function attachPlaybackEngine(video, url, cb) {
    const chain = candidateEngines(url);
    let idx = 0;
    let current = null;
    let destroyed = false;

    const tryNext = (lastError) => {
        if (destroyed) return;
        current?.cleanup();
        current = null;
        idx += 1;
        if (idx >= chain.length) {
            cb.onFatalError(lastError);
            return;
        }
        void start(chain[idx]);
    };

    const start = async (kind) => {
        if (destroyed) return;
        cb.onEngineChange?.(kind);

        if (kind === 'hls') {
            const { default: Hls } = await import('hls.js');
            if (destroyed) return;
            if (Hls.isSupported()) {
                const hls = new Hls({
                    liveSyncDurationCount: 3,
                    maxBufferLength: 60,
                    maxMaxBufferLength: 120,
                    startFragPrefetch: true,
                    fragLoadingMaxRetry: 4,
                    manifestLoadingMaxRetry: 2,
                });
                let mediaErrorRecoveries = 0;
                hls.on(Hls.Events.ERROR, (_e, data) => {
                    if (!data.fatal) return;
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR && data.details === 'manifestLoadError') {
                        tryNext('Stream is not reachable as HLS');
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        // Sınırlı deneme: kapsız bir recoverMediaError() döngüsü, kod
                        // çözülemeyen (örn. MPEG-2 video / AC-3 ses) yayınlarda sonsuz
                        // "kurtarma" ile sessiz siyah ekrana yol açar. İki deneme, sonra vazgeç.
                        mediaErrorRecoveries += 1;
                        if (mediaErrorRecoveries === 1) {
                            hls.recoverMediaError();
                        } else if (mediaErrorRecoveries === 2) {
                            hls.swapAudioCodec();
                            hls.recoverMediaError();
                        } else {
                            tryNext(`The stream's video or audio format can't be decoded (${data.details})`);
                        }
                    } else {
                        tryNext(`HLS playback failed (${data.details})`);
                    }
                });
                hls.loadSource(url);
                hls.attachMedia(video);
                current = { kind, cleanup: () => hls.destroy() };
                return;
            }
            if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = url;
                const onErr = () => tryNext('Native HLS playback failed');
                video.addEventListener('error', onErr);
                current = {
                    kind,
                    cleanup: () => {
                        video.removeEventListener('error', onErr);
                        video.removeAttribute('src');
                        video.load();
                    },
                };
                return;
            }
            tryNext('HLS is not supported in this browser');
            return;
        }

        if (kind === 'mpegts') {
            const { default: mpegtsLib } = await import('mpegts.js');
            if (destroyed) return;
            if (!mpegtsLib.isSupported()) {
                tryNext('MPEG-TS playback is not supported in this browser');
                return;
            }
            const player = mpegtsLib.createPlayer(
                { type: 'mpegts', isLive: true, url },
                {
                    enableWorker: true,
                    autoCleanupSourceBuffer: true,
                    liveBufferLatencyChasing: true,
                    liveBufferLatencyMaxLatency: 8,
                    liveBufferLatencyMinRemain: 2,
                },
            );
            player.on(mpegtsLib.Events.ERROR, (_type, detail) => {
                tryNext(`MPEG-TS playback failed (${detail})`);
            });
            player.attachMediaElement(video);
            player.load();
            current = {
                kind,
                cleanup: () => {
                    try { player.destroy(); } catch { /* already torn down */ }
                },
            };
            return;
        }

        // native
        video.src = url;
        const onErr = () => tryNext('The browser could not play this stream directly');
        video.addEventListener('error', onErr);
        current = {
            kind,
            cleanup: () => {
                video.removeEventListener('error', onErr);
                video.removeAttribute('src');
                video.load();
            },
        };
    };

    void start(chain[0]);

    return {
        engine: () => current?.kind ?? chain[Math.min(idx, chain.length - 1)],
        destroy: () => {
            destroyed = true;
            current?.cleanup();
            current = null;
        },
    };
}
