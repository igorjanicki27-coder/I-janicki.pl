import { useEffect, useRef, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { calculatorOrdersCollection, firestore, isFirebaseReady } from '../lib/firebase';
import { Order, OrderItem, SubItem, OrderStatus, UnitMode, StandardUnit, OrderType } from '../types';

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

function normalizeSubItem(sub: Partial<SubItem> & { id?: unknown }): SubItem {
  return {
    id: typeof sub.id === 'string' && sub.id ? sub.id : crypto.randomUUID(),
    name: typeof sub.name === 'string' ? sub.name : '',
  };
}

function normalizeItem(item: Partial<OrderItem> & { id?: unknown }): OrderItem {
  const price = toNumber(item.price, 0);
  const quantity = toNumber(item.quantity, 0);
  const children = Array.isArray(item.children)
    ? item.children.map((child) => normalizeSubItem(child as Partial<SubItem>))
    : [];
  return {
    id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(),
    serviceName: typeof item.serviceName === 'string' ? item.serviceName : '',
    unitMode: resolveUnitMode(item.unitMode),
    unit: typeof item.unit === 'string' && item.unit ? item.unit : 'm2',
    price,
    quantity,
    total: toNumber(item.total, Number((price * quantity).toFixed(2))),
    children,
  };
}

function normalizeOrderType(value: unknown): OrderType {
  return value === 'lista_reczna' ? 'lista_reczna' : 'zlecenie';
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
    type: normalizeOrderType(data.type),
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
    type: order.type,
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
      total: Number(item.total.toFixed(2)),
      children: item.children.map((child) => ({
        id: child.id,
        name: child.name,
      })),
    })),
  };
}

function cloneOrder(order: Order): Order {
  return {
    ...order,
    items: order.items.map((item) => ({
      ...item,
      children: item.children.map((child) => ({ ...child })),
    })),
  };
}

export function useOrders(collectionName = calculatorOrdersCollection) {
  const [orders, setOrders] = useState<Order[]>(EMPTY_ORDERS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pendingWriteIds = useRef<Set<string>>(new Set());
  const ordersRef = useRef<Order[]>(EMPTY_ORDERS);

  // Keep ref in sync whenever orders state changes (via onSnapshot or local setOrders)
  useEffect(() => {
    ordersRef.current = orders;
  }, [orders]);

  useEffect(() => {
    setOrders(EMPTY_ORDERS);
    ordersRef.current = EMPTY_ORDERS;
    pendingWriteIds.current.clear();
    setIsLoading(true);
    setError(null);

    if (!firestore) {
      setError('Brak konfiguracji Firestore.');
      setIsLoading(false);
      return undefined;
    }

    const ordersQuery = query(collection(firestore, collectionName), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const nextOrders = snapshot.docs.map((document) => {
          const rawData = document.data() as Record<string, unknown>;
          const normalized = normalizeOrder(document.id, rawData);
          console.log('[onSnapshot] Odczytano dokument:', { id: document.id, type: normalized.type, itemsCount: normalized.items.length, items: normalized.items.map(i => ({ id: i.id, total: i.total, price: i.price })) });
          return normalized;
        });
        console.log('[onSnapshot] Wszystkie zamówienia:', nextOrders.length);
        if (pendingWriteIds.current.size > 0) {
          console.log('[onSnapshot] Pomijam aktualizację stanu - trwają zapisy:', [...pendingWriteIds.current]);
          return;
        }
        ordersRef.current = nextOrders;
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
  }, [collectionName]);

  const addOrder = async (name: string, type: OrderType = 'zlecenie'): Promise<Order> => {
    const now = Date.now();
    const newOrder: Order = {
      id: crypto.randomUUID(),
      name,
      type,
      status: 'otwarte',
      createdAt: now,
      updatedAt: now,
      items: [],
      total: 0,
    };

    ordersRef.current = [newOrder, ...ordersRef.current];
    setOrders((current) => [newOrder, ...current]);

    if (firestore) {
      const serialized = serializeOrder(newOrder);
      console.log('[addOrder] Tworzenie nowego zamówienia w Firestore:', { id: newOrder.id, name: newOrder.name, type: newOrder.type, serialized });
      try {
        await setDoc(doc(firestore, collectionName, newOrder.id), serialized);
        console.log('[addOrder] Zapisano pomyślnie:', newOrder.id);
      } catch (writeError) {
        console.error('[addOrder] BŁĄD zapisu:', writeError);
        setError('Nie udało się zapisać nowego zlecenia do Firestore.');
      }
    }

    return cloneOrder(newOrder);
  };

  const updateOrder = async (id: string, updates: Partial<Order>) => {
    const currentOrder = ordersRef.current.find(o => o.id === id);
    if (!currentOrder) {
      console.warn('[updateOrder] Nie znaleziono zamówienia:', id);
      return;
    }
    const nextOrder: Order = {
      ...currentOrder,
      ...updates,
      updatedAt: Date.now(),
    };

    ordersRef.current = ordersRef.current.map(o => o.id === id ? nextOrder : o);
    setOrders((current) => current.map(o => o.id === id ? nextOrder : o));

    if (firestore) {
      try {
        await setDoc(doc(firestore, collectionName, id), serializeOrder(nextOrder), { merge: true });
      } catch (writeError) {
        console.error('Nie udało się zaktualizować zlecenia', writeError);
        setError('Nie udało się zaktualizować zlecenia w Firestore.');
      }
    }
  };

  const updateOrderItems = async (id: string, newItems: OrderItem[]) => {
    const total = Number(newItems.reduce((acc, item) => acc + item.total, 0).toFixed(2));

    // Użyj ref (zawsze aktualny) zamiast callbacku setOrders który wykonuje się asynchronicznie
    const currentOrder = ordersRef.current.find(o => o.id === id);
    console.log('[updateOrderItems] Szukam zamówienia:', { 
      id, 
      found: !!currentOrder, 
      availableIds: ordersRef.current.map(o => o.id),
      itemsCount: newItems.length,
      items: newItems.map(i => ({ id: i.id, serviceName: i.serviceName, price: i.price, quantity: i.quantity, total: i.total })),
      orderTotal: total 
    });

    if (!currentOrder) {
      console.error('[updateOrderItems] NIE ZNALEZIONO zamówienia! Pomijam zapis. ID:', id, 'Dostępne:', ordersRef.current.map(o => o.id));
      return;
    }

    const nextOrder: Order = {
      ...currentOrder,
      items: newItems,
      total,
      updatedAt: Date.now(),
    };

    // Natychmiastowa aktualizacja ref
    ordersRef.current = ordersRef.current.map(o => o.id === id ? nextOrder : o);
    // Kolejkujemy React state update
    setOrders((current) => current.map(o => o.id === id ? nextOrder : o));

    if (firestore) {
      const serialized = serializeOrder(nextOrder);
      console.log('[updateOrderItems] Dane do Firestore:', { id, serializedItems: serialized.items.map((i: { id: string; total: number; price: number; quantity: number }) => ({ id: i.id, total: i.total, price: i.price, quantity: i.quantity })), serializedTotal: serialized.total });
      pendingWriteIds.current.add(id);
      try {
        await setDoc(doc(firestore, collectionName, id), serialized, { merge: true });
        console.log('[updateOrderItems] Zapisano pomyślnie do Firestore:', id);
        // Weryfikacja - odczytaj dokument z Firestore
        const verifySnap = await getDoc(doc(firestore, collectionName, id));
        if (verifySnap.exists()) {
          const verifyData = verifySnap.data();
          console.log('[updateOrderItems] Weryfikacja - dane w Firestore:', { 
            itemsCount: Array.isArray(verifyData.items) ? verifyData.items.length : 'nie-array',
            total: verifyData.total 
          });
        } else {
          console.error('[updateOrderItems] Weryfikacja NIEUDANA - dokument nie istnieje!');
        }
      } catch (writeError) {
        console.error('[updateOrderItems] BŁĄD zapisu do Firestore:', writeError);
        setError('Nie udało się zaktualizować pozycji w Firestore.');
      } finally {
        pendingWriteIds.current.delete(id);
      }
    }
  };

  const deleteOrder = async (id: string) => {
    ordersRef.current = ordersRef.current.filter(o => o.id !== id);
    setOrders((current) => current.filter((order) => order.id !== id));

    if (firestore) {
      try {
        await deleteDoc(doc(firestore, collectionName, id));
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
