const LOCAL_ENDPOINT = '/api/n8n/webhook/eb2eca44-bd2e-40fd-ba6c-6a1d30dc6418/floretum/perfil-sonoro';
const PROFILE_RANGES = {
  densidadRitmica: [0, 1],
  duracionCapaSeg: [0.2, 2],
  mezclaAcustica: [0, 1],
};

export async function loadSoundProfile(id, signal) {
  const endpoint = import.meta.env.VITE_SOUND_PROFILE_ENDPOINT
    || (import.meta.env.DEV ? LOCAL_ENDPOINT : '');
  if (!endpoint || !id) return null;

  try {
    const response = await fetch(`${endpoint.replace(/\/$/, '')}/${encodeURIComponent(id)}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
    });
    if (!response.ok) return null;

    const profile = await response.json();
    if (profile?.id_flor !== id) return null;
    const valid = Object.entries(PROFILE_RANGES).every(([field, [min, max]]) => {
      const value = profile[field];
      return Number.isFinite(value) && value >= min && value <= max;
    });
    return valid ? profile : null;
  } catch {
    return null;
  }
}
