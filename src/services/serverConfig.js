// Kendi sunucu listesini Supabase'den çeken servis.
// Kullanıcı Provider URL'i boş bırakırsa, burada listelenen adresler
// öncelik sırasına göre (priority) tek tek denenir.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let cachedServers = null;

export async function getOwnServers() {
    if (cachedServers) return cachedServers;

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.warn('Supabase config missing (.env dosyasını kontrol et)');
        return [];
    }

    try {
        const res = await fetch(
            `${SUPABASE_URL}/rest/v1/servers?active=eq.true&select=url,priority&order=priority.asc`,
            {
                headers: {
                    apikey: SUPABASE_ANON_KEY,
                    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                },
            }
        );
        if (!res.ok) throw new Error('Sunucu listesi alınamadı');
        const data = await res.json();
        cachedServers = data.map((row) => row.url);
        return cachedServers;
    } catch (err) {
        console.error('getOwnServers error:', err);
        return [];
    }
}
