import { randomBytes } from 'crypto';

// Excludes vowels and confusable chars (0/O/1/l/i) to keep tokens easy to
// type if a student reads one off WhatsApp on a different device.
const ALPHABET = '23456789bcdfghjkmnpqrstvwxyz';

/** 12-char unguessable token (~57 bits of entropy). */
export function generateToken(length = 12): string {
  // randomBytes(length) gives us length bytes of entropy; we map each into
  // ALPHABET via modulo. This biases very slightly toward earlier letters
  // (256 mod 28 = 4 leftover) — at 12 chars that's negligible for our needs
  // (we collision-check on insert anyway).
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}
