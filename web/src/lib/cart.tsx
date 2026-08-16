'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { SparePart } from './types';

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
  wishlist: string[];
  add: (part: SparePart, quantity?: number) => void;
  setQuantity: (partId: string, quantity: number) => void;
  remove: (partId: string) => void;
  clear: () => void;
  toggleWishlist: (partId: string) => void;
  count: number;
  subtotal: number;
}

const CartContext = createContext<CartValue>({} as CartValue);

const CART_KEY = 'riderescue.cart';
const WISH_KEY = 'riderescue.wishlist';

export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      setLines(JSON.parse(localStorage.getItem(CART_KEY) || '[]'));
      setWishlist(JSON.parse(localStorage.getItem(WISH_KEY) || '[]'));
    } catch {
      /* corrupted storage - start empty */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(CART_KEY, JSON.stringify(lines));
  }, [lines, hydrated]);

  useEffect(() => {
    if (hydrated) localStorage.setItem(WISH_KEY, JSON.stringify(wishlist));
  }, [wishlist, hydrated]);

  const add: CartValue['add'] = (part, quantity = 1) => {
    setLines((current) => {
      const existing = current.find((l) => l.partId === part._id);
      if (existing) {
        return current.map((l) =>
          l.partId === part._id ? { ...l, quantity: Math.min(l.stock, l.quantity + quantity) } : l
        );
      }
      return [
        ...current,
        { partId: part._id, name: part.name, price: part.price, image: part.image, quantity, stock: part.stock },
      ];
    });
  };

  const setQuantity: CartValue['setQuantity'] = (partId, quantity) =>
    setLines((current) =>
      quantity <= 0
        ? current.filter((l) => l.partId !== partId)
        : current.map((l) => (l.partId === partId ? { ...l, quantity: Math.min(l.stock, quantity) } : l))
    );

  const remove = (partId: string) => setLines((c) => c.filter((l) => l.partId !== partId));
  const clear = () => setLines([]);
  const toggleWishlist = (partId: string) =>
    setWishlist((c) => (c.includes(partId) ? c.filter((id) => id !== partId) : [...c, partId]));

  return (
    <CartContext.Provider
      value={{
        lines,
        wishlist,
        add,
        setQuantity,
        remove,
        clear,
        toggleWishlist,
        count: lines.reduce((s, l) => s + l.quantity, 0),
        subtotal: lines.reduce((s, l) => s + l.price * l.quantity, 0),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
