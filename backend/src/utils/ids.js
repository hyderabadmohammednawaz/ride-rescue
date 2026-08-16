import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no confusable characters

function randomChars(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const bookingReference = () => `RR-${randomChars(6)}`;
export const orderReference = () => `ORD-${randomChars(6)}`;
export const paymentReference = () => `PAY-${randomChars(8)}`;
export const referralCode = (name) =>
  `${name.replace(/[^a-zA-Z]/g, '').slice(0, 4).toUpperCase() || 'RIDE'}${randomChars(4)}`;
export const qrToken = () => crypto.randomBytes(16).toString('hex');

export const numericCode = (digits = 6) => {
  const max = 10 ** digits;
  return String(crypto.randomInt(0, max)).padStart(digits, '0');
};
