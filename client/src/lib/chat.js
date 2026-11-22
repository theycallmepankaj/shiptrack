// Chat widget helpers (FR-45–52).

/** Unguessable session id: guests prove ownership of their chat with it. */
export function newSessionId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const GUEST_KEY = 'st_chat_guest_session';
export function guestSessionId({ reset = false } = {}) {
  try {
    let id = reset ? null : localStorage.getItem(GUEST_KEY);
    if (!id) {
      id = newSessionId();
      localStorage.setItem(GUEST_KEY, id);
    }
    return id;
  } catch {
    return newSessionId(); // storage blocked: the chat just won't survive a reload
  }
}

/** Suggested questions (§11.4 chatbot widget). */
export function suggestions({ trackingId, signedIn }) {
  return [
    trackingId
      ? { label: `Where is ${trackingId}?`, message: `Where is ${trackingId}?` }
      : { label: 'Track my parcel', message: signedIn ? 'Where is my latest parcel?' : 'Track my parcel' },
    { label: 'What can’t I ship?', message: 'What items can’t I ship?' },
    { label: 'How is the price worked out?', message: 'How is the delivery price calculated?' },
    { label: 'Refunds & cancellations', message: 'What is your refund policy if I cancel?' },
  ];
}
