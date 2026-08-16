import type { Confirmation } from './phoneAuth';

/**
 * Holds the in-flight signup between the register screen and the OTP screen.
 *
 * Firebase's confirmation handle is a live object with methods on it, so it
 * cannot travel through expo-router params (which are serialised to the URL).
 * A module-level store keeps it in memory for the one hop between screens.
 */
export interface PendingSignup {
  confirmation: Confirmation;
  phone: string;
  /** Registration fields, submitted once the number is proven. */
  payload: Record<string, unknown>;
  /** Set when verifying an existing account rather than creating one. */
  loginOnly?: boolean;
}

let pending: PendingSignup | null = null;

export const setPendingSignup = (value: PendingSignup) => {
  pending = value;
};

export const getPendingSignup = () => pending;

export const clearPendingSignup = () => {
  pending = null;
};

/** Replaces just the confirmation handle after a resend. */
export const updateConfirmation = (confirmation: Confirmation) => {
  if (pending) pending = { ...pending, confirmation };
};
