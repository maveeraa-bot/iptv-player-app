// Cihaz aktivasyon/lisans servisi.
// Her cihaz için benzersiz bir ID üretir, Supabase'deki `activations`
// tablosunu sorgular: trial / active / expired durumunu döner.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const DEVICE_ID_KEY = 'aura_device_id';

// Bu cihaz için kalıcı, benzersiz bir kimlik üretir/okur.
export function getDeviceId() {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id) {
        id = 'dev_' + crypto.randomUUID();
        localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
}

// Supabase'de bu cihaz için bir kayıt var mı diye bakar.
// Yoksa otomatik olarak "trial" (deneme) kaydı oluşturur.
export async function checkActivation() {
    const deviceId = getDeviceId();

    const res = await fetch(
        `${SUPABASE_URL}/rest/v1/activations?device_id=eq.${deviceId}&select=*`,
        { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) throw new Error('Aktivasyon kontrolü başarısız');
    const rows = await res.json();

    if (rows.length === 0) {
        // İlk açılış: 48 saatlik deneme kaydı oluştur
        const trialExpires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
        const createRes = await fetch(`${SUPABASE_URL}/rest/v1/activations`, {
            method: 'POST',
            headers: {
                apikey: SUPABASE_ANON_KEY,
                Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
            },
            body: JSON.stringify({ device_id: deviceId, status: 'trial', expires_at: trialExpires }),
        });
        const created = await createRes.json();
        return created[0];
    }

    const record = rows[0];
    // Süre dolmuş mu kontrol et
    if (record.status !== 'expired' && record.expires_at && new Date(record.expires_at) < new Date()) {
        return { ...record, status: 'expired' };
    }
    return record;
}

export function isUsable(activation) {
    return activation && (activation.status === 'active' || activation.status === 'trial');
}
