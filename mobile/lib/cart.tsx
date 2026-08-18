import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/**
 * The cart lives on the device, not the server.
 *
 * A cart is a draft — abandoning one should cost nothing and leave nothing
 * behind. It only becomes server state at checkout, and the server recomputes
 * every price then, so nothing here is trusted for money. What is stored is
 * purely a convenience: which parts, how many.
 */

export interface CartLine {
  partId: string;
  name: string;
  price: number;
  image?: string;
  quantity: number;
  stock: number;
}

interface CartValue {
  lines: CartLine[];
  count: number;
  subtotal: number;
  add: (part: { _id: string; name: string; price: number; image?: string; stock: number }, quantity?: number) => void;
  setQuantity: (partId: string, quantity: number) => void;
  remove: (partId: string) => void;
  clear: () => void;
}

const CartContext = createContext<CartValue>({} as CartValue);
const KEY = 'riderescue.cart';

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => {
        if (raw) setLines(JSON.parse(raw));
      })
      .catch(() => {
        // A corrupt cart is not worth surfacing; start empty.
      })
      .finally(() => setHydrated(true));
  }, []);

  // Persist only after hydration, or the first render would write [] over a
  // cart that had not finished loading.
  useEffect(() => {
    if (hydrated) AsyncStorage.setItem(KEY, JSON.stringify(lines)).catch(() => {});
  }, [lines, hydrated]);

  const add: CartValue['add'] = (part, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((l) => l.partId === part._id);
      if (existing) {
        // Never let the cart exceed what the vendor actually has.
        const next = Math.min(existing.quantity + quantity, part.stock);
        return current.map((l) => (l.partId === part._id ? { ...l, quantity: next } : l));
      }
      return [
        ...current,
        {
          partId: part._id,
          name: part.name,
          price: part.price,
          image: part.image,
          quantity: Math.min(quantity, part.stock),
          stock: part.stock,
        },
      ];
    });
  };

  const setQuantity: CartValue['setQuantity'] = (partId, quantity) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.partId !== partId)
        : current.map((l) => (l.partId === partId ? { ...l, quantity: Math.min(quantity, l.stock) } : l))
    );
  };

  const remove: CartValue['remove'] = (partId) =>
    setLines((current) => current.filter((l) => l.partId !== partId));

  const clear = () => setLines([]);

  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const subtotal = lines.reduce((n, l) => n + l.price * l.quantity, 0);

  return (
    <CartContext.Provider value={{ lines, count, subtotal, add, setQuantity, remove, clear }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
