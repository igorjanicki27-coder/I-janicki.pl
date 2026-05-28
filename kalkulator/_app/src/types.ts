export type OrderStatus = 'otwarte' | 'zakończone' | 'opłacone' | 'wstrzymano' | 'anulowano';

export type UnitMode = 'standard' | 'custom';

export type StandardUnit = 
  // Linear
  | 'mm' | 'cm' | 'dm' | 'm' | 'km'
  // Area
  | 'mm2' | 'cm2' | 'dm2' | 'm2' | 'km2' | 'a' | 'ha'
  // Volume
  | 'mm3' | 'cm3' | 'dm3' | 'm3' | 'ml' | 'l' | 'kl'
  // Mass
  | 'mg' | 'g' | 'kg' | 't'
  // Time
  | 'ms' | 's' | 'min' | 'h' | 'd'
  | 'rb/h';

export interface SubItem {
  id: string;
  name: string;
}

export interface OrderItem {
  id: string;
  serviceName: string;
  unitMode: UnitMode;
  unit: StandardUnit | string;
  price: number;
  quantity: number;
  total: number;
  children: SubItem[];
}

export type OrderType = 'zlecenie' | 'lista_reczna';

export interface Order {
  id: string;
  name: string;
  type: OrderType;
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  items: OrderItem[];
  total: number;
}
