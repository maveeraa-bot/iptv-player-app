import { useEffect, useRef } from 'react';
import { attachPlaybackEngine } from '../services/playbackEngine';

/**
 * Verilen video elementine oynatma motorunu bağlar.
 * `srcs` tek bir URL veya birden fazla aday URL (örn. hem .m3u8 hem .ts
 * adresi) olabilir — Xtream sunucuları bu ikisini gerçekten farklı
 * adreslerde sunduğu için, bir adresin 3 motoruyla (hls/mpegts/native)
 * da başarısız olması durumunda sıradaki adrese geçilir.
 * Tüm adresler ve tüm motorlar tükenince onFatalError çağrılır.
 */
export function usePlaybackEngine(videoRef, srcs, { onFatalError } = {}) {
    const handleRef = useRef(null);

    useEffect(() => {
        const video = videoRef.current;
        const urls = [...new Set((Array.isArray(srcs) ? srcs : [srcs]).filter(Boolean))];
        if (!video || urls.length === 0) return;

        let destroyed = false;
        let urlIdx = 0;

        const tryUrl = () => {
            if (destroyed) return;
            const handle = attachPlaybackEngine(video, urls[urlIdx], {
                onFatalError: (message) => {
                    urlIdx += 1;
                    if (urlIdx < urls.length) {
                        tryUrl();
                    } else {
                        onFatalError?.({ details: message });
                    }
                },
            });
            handleRef.current = handle;
        };

        tryUrl();

        return () => {
            destroyed = true;
            handleRef.current?.destroy();
            handleRef.current = null;
        };
    }, [videoRef, JSON.stringify(srcs), onFatalError]);
}

export default usePlaybackEngine;
