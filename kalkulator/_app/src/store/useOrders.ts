import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { calculatorOrdersCollection, firestore, isFirebaseReady } from '../lib/firebase';
import { Order, OrderItem, OrderStatus, UnitMode, StandardUnit } from '../types';

const EMPTY_ORDERS: Order[] = [];

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveStatus(value: unknown): OrderStatus {
  return value === 'zakończone' || value === 'opłacone' || value === 'wstrzymano' || value === 'anulowano'
    ? value
    : 'otwarte';
}

function resolveUnitMode(value: unknown): UnitMode {
  return value === 'custom' ? 'custom' : 'standard';
}

function normalizeItem(item: Partial<OrderItem> & { id?: unknown }): OrderItem {
  const price = toNumber(item.price, 0);
  const quantity = toNumber(item.quantity, 0);
  return {
    id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(),
    serviceName: typeof item.serviceName === 'string' ? item.serviceName : '',
    unitMode: resolveUnitMode(item.unitMode),
    unit: typeof item.unit === 'string' && item.unit ? item.unit : 'm2',
    price,
    quantity,
    total: toNumber(item.total, Number((price * quantity).toFixed(2))),
  };
}

function normalizeOrder(documentId: string, data: Record<string, unknown>): Order {
  const items = Array.isArray(data.items) ? data.items.map((item) => normalizeItem(item as Partial<OrderItem>)) : [];
  const createdAt = toNumber(data.createdAt, Date.now());
  const total = toNumber(
    data.total,
    Number(items.reduce((acc, item) => acc + item.total, 0).toFixed(2))
  );

  return {
    id: typeof data.id === 'string' && data.id ? data.id : documentId,
    name: typeof data.name === 'string' && data.name.trim() ? data.name : 'Bez nazwy',
    status: resolveStatus(data.status),
    createdAt,
    updatedAt: toNumber(data.updatedAt, createdAt),
    items,
    total,
  };
}

function serializeOrder(order: Order) {
  return {
    id: order.id,
    name: order.name,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    total: Number(order.total.toFixed(2)),
    items: order.items.map((item) => ({
      id: item.id,
      serviceName: item.serviceName,
      unitMode: item.unitMode,
      unit: item.unit,
      price: Number(item.price),
      quantity: Number(item.quantity),
      total: Number((item.price * item.quantity).toFixed(2)),
    })),
  };
}

function cloneOrder(order: Order): Order {
  return {
    ...order,
    items: order.items.map((item) => ({ ...item })),
  };
}

export function useOrders() {
  const [orders, setOrders] = useState<Order[]>(EMPTY_ORDERS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firestore) {
      setError('Brak konfiguracji Firestore.');
      setIsLoading(false);
      return undefined;
    }

    const ordersQuery = query(collection(firestore, calculatorOrdersCollection), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const nextOrders = snapshot.docs.map((document) => normalizeOrder(document.id, document.data() as Record<string, unknown>));
        setOrders(nextOrders);
        setError(null);
        setIsLoading(false);
      },
      (snapshotError) => {
        console.error('Firestore calculator sync failed', snapshotError);
        setError('Nie udało się pobrać zleceń z Firestore.');
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const addOrder = async (name: string): Promise<Order> => {
    const now = Date.now();
    const newOrder: Order = {
      id: crypto.randomUUID(),
      name,
      status: 'otwarte',
      createdAt: now,
      updatedAt: now,
      items: [],
      total: 0,
    };

    setOrders((current) => [newOrder, ...current]);

    if (firestore) {
      try {
        await setDoc(doc(firestore, calculatorOrdersCollection, newOrder.id), serializeOrder(newOrder));
      } catch (writeError) {
        console.error('Nie udało się zapisać nowego zlecenia', writeError);
        setError('Nie udało się zapisać nowego zlecenia do Firestore.');
      }
    }

    return cloneOrder(newOrder);
  };

  const updateOrder = async (id: string, updates: Partial<Order>) => {
    let nextOrder: Order | null = null;

    setOrders((current) =>
      current.map((order) => {
        if (order.id !== id) return order;
        nextOrder = {
          ...order,
          ...updates,
          updatedAt: Date.now(),
        };
        return nextOrder;
      })
    );

    if (firestore && nextOrder) {
      try {
        await updateDoc(doc(firestore, calculatorOrdersCollection, id), serializeOrder(nextOrder));
      } catch (writeError) {
        console.error('Nie udało się zaktualizować zlecenia', writeError);
        setError('Nie udało się zaktualizować zlecenia w Firestore.');
      }
    }
  };

  const updateOrderItems = async (id: string, newItems: OrderItem[]) => {
    const total = Number(newItems.reduce((acc, item) => acc + item.total, 0).toFixed(2));
    let nextOrder: Order | null = null;

    setOrders((current) =>
      current.map((order) => {
        if (order.id !== id) return order;
        nextOrder = {
          ...order,
          items: newItems,
          total,
          updatedAt: Date.now(),
        };
        return nextOrder;
      })
    );

    if (firestore && nextOrder) {
      try {
        await updateDoc(doc(firestore, calculatorOrdersCollection, id), serializeOrder(nextOrder));
      } catch (writeError) {
        console.error('Nie udało się zaktualizować pozycji zlecenia', writeError);
        setError('Nie udało się zaktualizować pozycji w Firestore.');
      }
    }
  };

  const deleteOrder = async (id: string) => {
    setOrders((current) => current.filter((order) => order.id !== id));

    if (firestore) {
      try {
        await deleteDoc(doc(firestore, calculatorOrdersCollection, id));
      } catch (writeError) {
        console.error('Nie udało się usunąć zlecenia', writeError);
        setError('Nie udało się usunąć zlecenia z Firestore.');
      }
    }
  };

  return {
    orders,
    addOrder,
    updateOrder,
    updateOrderItems,
    deleteOrder,
    isLoading,
    error,
    isFirebaseReady,
  };
}
