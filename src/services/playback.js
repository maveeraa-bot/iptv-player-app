import { xtreamApi } from './xtream';

const cleanExtension = (extension, fallback = 'mp4') => {
    const value = String(extension || fallback).trim().toLowerCase().replace(/^\./, '');
    return /^[a-z0-9]+$/.test(value) ? value : fallback;
};

// Bazı IPTV sağlayıcıları /live/... isteklerini geçersiz sertifikalı veya
// düz HTTP bir CDN düğümüne yönlendiriyor — tarayıcı bunu güvenlik
// nedeniyle engelliyor (mixed content / invalid cert). Bu relay, isteği
// sunucu tarafında yapıp sertifika/protokol sorunlarını görmezden gelerek
// veriyi bizim geçerli HTTPS'imiz üzerinden yeniden sunuyor.
const RELAY_BASE = import.meta.env.VITE_STREAM_RELAY_URL;

function wrapWithRelay(url, ext) {
    if (!url || !RELAY_BASE) return url;
    return `${RELAY_BASE}/relay/stream.${ext}?u=${encodeURIComponent(url)}`;
}

export function getPlaybackSources(item, api = xtreamApi) {
    if (!item?.stream_id) return { original: '', compatible: '', nativeCandidates: [] };

    if (item.type === 'live') {
        const hls = api.getLiveStreamUrl(item.stream_id, 'm3u8');
        const transportStream = api.getLiveStreamUrl(item.stream_id, 'ts');
        const original = wrapWithRelay(hls, 'm3u8');
        const compatible = wrapWithRelay(transportStream, 'ts');
        return {
            original,
            compatible,
            nativeCandidates: [...new Set([original, compatible])],
        };
    }

    const extension = cleanExtension(item.extension);
    const buildUrl = item.type === 'series'
        ? api.getSeriesStreamUrl.bind(api)
        : api.getVodStreamUrl.bind(api);
    const original = wrapWithRelay(buildUrl(item.stream_id, extension), extension);
    const compatible = wrapWithRelay(buildUrl(item.stream_id, 'm3u8'), 'm3u8');

    return {
        original,
        compatible,
        nativeCandidates: [...new Set([original, compatible])],
    };
}

export function getWebPlaybackSource(item, useCompatibleSource, api = xtreamApi) {
    const sources = getPlaybackSources(item, api);
    return useCompatibleSource ? sources.compatible : sources.original;
}
