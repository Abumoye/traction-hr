// Location helpers for clock-in. The browser can only ask for the person's position; the server checks it.

export class GeoError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const HOW_TO_ALLOW = "Turn location on for this website: tap the lock or settings icon next to the address, choose Site settings, set Location to Allow, then reload the page. If you opened this link inside WhatsApp or another app, open it in Chrome or Safari instead.";

// Asks for the current position. Resolves { lat, lng, accuracy, at } (accuracy in metres, at in milliseconds since 1970).
// Rejects with a GeoError whose message can be shown to the person as it is.
export function getPosition({ timeout = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new GeoError("unsupported", "This browser cannot share a location. Use the latest Chrome or Safari on your phone."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, at: p.timestamp }),
      (e) => {
        if (e.code === 1) reject(new GeoError("denied", "Location is turned off for this website. " + HOW_TO_ALLOW));
        else if (e.code === 3) reject(new GeoError("timeout", "Finding your location took too long. Go outdoors or near a window, make sure location (GPS) is on in your phone settings, and try again."));
        else reject(new GeoError("unavailable", "Your device could not work out where you are. Turn on location (GPS) in your phone settings and try again."));
      },
      // enableHighAccuracy asks for GPS rather than Wi-Fi; maximumAge 0 refuses a reading the phone kept from earlier
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    );
  });
}

// "granted", "denied", "prompt" or "unknown" (some browsers cannot say). Never asks the person anything.
export async function locationPermission() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return "unknown";
    return (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch (e) {
    return "unknown";
  }
}

export { HOW_TO_ALLOW };
