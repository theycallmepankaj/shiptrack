/** One-off GPS fix for status updates; resolves null if unavailable/denied (never blocks the action). */
export function getPosition({ timeout = 5000 } = {}) {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 30_000 },
    );
  });
}

export const directionsUrl = ({ lat, lng }) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
export const telUrl = (phone) => `tel:${phone.replace(/[^\d+]/g, '')}`;
