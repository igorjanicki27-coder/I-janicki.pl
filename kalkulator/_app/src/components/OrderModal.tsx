import { useState } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Order, OrderItem, OrderStatus, UnitMode, StandardUnit } from '../types';
import { format } from 'date-fns';
import { Copy, Trash2, Plus, Download } from 'lucide-react';
import { downloadOrderPDF } from '../lib/pdf';

interface OrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  orders: Order[];
  updateOrder: (id: string, updates: Partial<Order>) => void;
  updateOrderItems: (id: string, items: OrderItem[]) => void;
}

const unitGroups: Record<string, StandardUnit[]> = {
  'Wymiary liniowe': ['mm', 'cm', 'dm', 'm', 'km'],
  'Powierzchnia': ['mm2', 'cm2', 'dm2', 'm2', 'km2', 'a', 'ha'],
  'Objętość': ['mm3', 'cm3', 'dm3', 'm3', 'ml', 'l', 'kl'],
  'Masa': ['mg', 'g', 'kg', 't'],
  'Czas': ['ms', 's', 'min', 'h', 'd', 'rb/h']
};

export function OrderModal({ isOpen, onClose, orderId, orders, updateOrder, updateOrderItems }: OrderModalProps) {
  const order = orders.find(o => o.id === orderId);
  if (!order) return null;
  const [showStatusControls, setShowStatusControls] = useState(false);

  const isReadOnly = order.status === 'zakończone' || order.status === 'opłacone' || order.status === 'anulowano';

  const handleItemChange = (index: number, updates: Partial<OrderItem>) => {
    const newItems = [...order.items];
    const item = { ...newItems[index], ...updates };
    // recalculate total for item
    item.total = Number((item.price * item.quantity).toFixed(2));
    newItems[index] = item;
    updateOrderItems(orderId, newItems);
  };

  const addItem = () => {
    const newItem: OrderItem = {
      id: crypto.randomUUID(),
      serviceName: '',
      unitMode: 'standard',
      unit: 'm2',
      price: 0,
      quantity: 1,
      total: 0
    };
    updateOrderItems(orderId, [...order.items, newItem]);
  };

  const duplicateItem = (index: number) => {
    const newItems = [...order.items];
    const itemToDuplicate = { ...newItems[index], id: crypto.randomUUID() };
    newItems.splice(index + 1, 0, itemToDuplicate);
    updateOrderItems(orderId, newItems);
  };

  const removeItem = (index: number) => {
    const newItems = [...order.items];
    newItems.splice(index, 1);
    updateOrderItems(orderId, newItems);
  };

  const downloadPDF = () => {
    downloadOrderPDF(order);
  };

  return (
    <Modal 
      isOpen={isOpen} 
      onClose={onClose} 
      className="max-w-[1000px] w-full border border-white/10 shadow-2xl flex flex-col p-0 bg-[#0f0f0f]"
      contentClassName="p-0 overflow-hidden flex flex-col sm:flex-row h-[94dvh] sm:h-auto max-h-[94dvh] sm:max-h-[90vh] min-h-0"
    >
      {/* Sidebar Summary */}
      <div className="w-full sm:w-[280px] shrink-0 max-h-[34dvh] sm:max-h-none border-b sm:border-b-0 sm:border-r border-white/5 p-3 sm:p-6 space-y-3 sm:space-y-6 bg-black/20 flex flex-col modal-scroll-y overflow-y-auto min-h-0">
        <div>
          <div className="flex items-center gap-3 mb-3 sm:mb-6">
            <h3 className="text-base sm:text-xl font-bold break-words leading-tight">{order.name}</h3>
          </div>
          
          <div className="flex items-center justify-between mb-3">
            <label className="text-[10px] uppercase text-white/40 font-bold tracking-widest block">Status</label>
            <button
              type="button"
              onClick={() => setShowStatusControls((prev) => !prev)}
              className="sm:hidden px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/70 text-xs font-bold"
            >
              {showStatusControls ? 'Ukryj zmianę' : 'Zmień status'}
            </button>
          </div>
          <div className={`${showStatusControls ? 'grid' : 'hidden'} sm:grid grid-cols-2 gap-2`}>
            <button onClick={() => updateOrder(orderId, { status: 'otwarte' })} className={`py-2 rounded-lg text-xs font-bold ${order.status === 'otwarte' ? 'bg-blue-500/10 border border-blue-500/20 text-blue-500' : 'bg-white/5 border border-white/5 text-white/40 hover:bg-white/10'}`}>OTWARTE</button>
            <button onClick={() => updateOrder(orderId, { status: 'zakończone' })} className={`py-2 rounded-lg text-xs font-bold ${order.status === 'zakończone' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-500' : 'bg-white/5 border border-white/5 text-white/40 hover:bg-white/10'}`}>ZAKOŃCZONE</button>
            <button onClick={() => updateOrder(orderId, { status: 'opłacone' })} className={`py-2 rounded-lg text-xs font-bold ${order.status === 'opłacone' ? 'bg-purple-500/10 border border-purple-500/20 text-purple-500' : 'bg-white/5 border border-white/5 text-white/40 hover:bg-white/10'}`}>OPŁACONE</button>
            <button onClick={() => updateOrder(orderId, { status: 'wstrzymano' })} className={`py-2 rounded-lg text-xs font-bold ${order.status === 'wstrzymano' ? 'bg-amber-500/10 border border-amber-500/20 text-amber-500' : 'bg-white/5 border border-white/5 text-white/40 hover:bg-white/10'}`}>WSTRZYMAJ</button>
            <button onClick={() => updateOrder(orderId, { status: 'anulowano' })} className={`py-2 rounded-lg text-xs font-bold col-span-2 ${order.status === 'anulowano' ? 'bg-red-500/10 border border-red-500/20 text-red-500' : 'bg-white/5 border border-white/5 text-white/40 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 text-red-500/50'}`}>ANULOWANE</button>
          </div>
        </div>

        <div className="space-y-3 mt-auto pt-6">
          <div className="bg-white/5 p-4 rounded-xl border border-white/5 mb-3">
             <div className="text-[10px] text-white/40 font-bold uppercase tracking-widest mb-1">Pozycje</div>
             <div className="font-mono text-xl">{order.items.length.toString().padStart(2, '0')}</div>
          </div>
          <button onClick={downloadPDF} className="w-full flex items-center justify-center gap-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors font-bold text-sm bg-emerald-500/5 border border-emerald-500/20 py-3 rounded-xl">
            <Download className="w-4 h-4" /> Pobierz PDF
          </button>
        </div>
      </div>

      {/* Main Editor Pane */}
      <div className="flex-1 flex flex-col relative w-full overflow-hidden min-h-0">
        
        {/* Header summary inside main pane */}
        <div className="p-3 sm:p-6 border-b border-white/5 bg-black/10 shrink-0">
           <div className="text-white/40 text-[11px] font-medium tracking-wide">
             ID: #{order.id.slice(0, 8)} • Zaktualizowano: {format(order.updatedAt, 'dd.MM.yyyy HH:mm')}
           </div>
        </div>

        <div className="flex-1 modal-scroll-y overflow-y-auto p-3 sm:p-6 space-y-3 pb-4 min-h-0">
          <label className="text-[10px] uppercase text-white/40 font-bold tracking-widest block mb-2 sm:mb-4">Pozycje Zlecenia</label>
          {order.items.map((item, index) => (
            <div key={item.id} className="relative group bg-white/5 border border-white/5 rounded-2xl p-3 sm:p-5 transition-colors hover:bg-white/[0.07] flex flex-col gap-3 sm:gap-4">
              {/* Item Actions */}
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity z-10">
                 {!isReadOnly && (
                   <>
                    <button onClick={() => duplicateItem(index)} className="p-2 text-white/40 hover:text-emerald-400 bg-black/40 rounded-lg border border-white/10 shadow-sm" title="Kopiuj">
                      <Copy className="w-3 h-3" />
                    </button>
                    <button onClick={() => removeItem(index)} className="p-2 text-white/40 hover:text-red-400 bg-black/40 rounded-lg border border-white/10 shadow-sm" title="Usuń">
                      <Trash2 className="w-3 h-3" />
                    </button>
                   </>
                 )}
              </div>

              {/* Line 1: Service Name */}
              <div className="flex flex-col gap-3 sm:gap-4 items-start sm:items-end">
                <div className="flex-1">
                   <Input 
                     label="Usługa / Materiał" 
                     value={item.serviceName}
                     onChange={(e) => handleItemChange(index, { serviceName: e.target.value })}
                     disabled={isReadOnly}
                     className="bg-black/20 text-base sm:text-lg font-medium"
                   />
                </div>
              </div>

              {/* Line 2: Unit, Price, Quantity */}
              <div className="grid grid-cols-1 sm:flex gap-2 sm:gap-4 items-end">
                <div className={item.unitMode === 'custom' ? "w-full sm:w-[100px] shrink-0" : "w-full sm:w-[120px] shrink-0"}>
                   <Select 
                     label="J.M."
                     value={item.unitMode === 'custom' ? 'custom' : item.unit}
                     onChange={(e) => {
                       if (e.target.value === 'custom') {
                         handleItemChange(index, { unitMode: 'custom', unit: '' });
                       } else {
                         handleItemChange(index, { unitMode: 'standard', unit: e.target.value });
                       }
                     }}
                     disabled={isReadOnly}
                     className="bg-black/20"
                   >
                     {Object.entries(unitGroups).map(([group, units]) => (
                       <optgroup key={group} label={group} className="bg-zinc-900">
                         {units.map(u => <option key={u} value={u}>{u}</option>)}
                       </optgroup>
                     ))}
                     <option value="custom">Własna...</option>
                   </Select>
                </div>
                
                {item.unitMode === 'custom' && (
                  <div className="w-full sm:w-[100px] shrink-0">
                     <Input 
                       label="Własna" 
                       value={item.unit}
                       onChange={(e) => handleItemChange(index, { unit: e.target.value })}
                       disabled={isReadOnly}
                       placeholder="kpl"
                       className="bg-black/20"
                     />
                  </div>
                )}

                <div className="flex-1">
                   <Input 
                     label="Cena jedn. (zł)" 
                     type="number"
                     min="0"
                     step="any"
                     value={item.price}
                     onChange={(e) => handleItemChange(index, { price: parseFloat(e.target.value) || 0 })}
                     disabled={isReadOnly}
                     className="font-mono bg-black/20"
                   />
                </div>

                <div className="flex-1">
                   <Input 
                     label="Ilość" 
                     type="number"
                     min="0"
                     step="any"
                     value={item.quantity}
                     onChange={(e) => handleItemChange(index, { quantity: parseFloat(e.target.value) || 0 })}
                     disabled={isReadOnly}
                     className="font-mono bg-black/20"
                   />
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 flex items-end justify-between">
                <div className="text-[10px] uppercase text-white/40 font-bold tracking-widest">Suma pozycji</div>
                <div className="font-mono font-bold text-emerald-400 text-lg sm:text-xl">{item.total.toLocaleString('pl-PL')} zł</div>
              </div>
            </div>
          ))}

          {order.items.length === 0 && (
            <div className="text-center p-8 bg-white/5 border border-white/5 rounded-xl mt-4">
              <p className="text-white/30 text-sm font-medium">Brak pozycji w zleceniu.</p>
            </div>
          )}
        </div>
        
        {/* Action Area */}
        <div className="shrink-0 p-3 sm:p-4 border-t border-white/5 bg-[#0f0f0f]/90 backdrop-blur-md">
          <div className="mb-3 sm:mb-4 p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10">
            <div className="text-[10px] uppercase text-emerald-500/60 font-bold tracking-widest mb-1">Wartość całkowita</div>
            <div className="font-mono font-bold text-emerald-400 text-2xl sm:text-3xl">{order.total.toLocaleString('pl-PL')} zł</div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between gap-4 w-full">
            {!isReadOnly ? (
              <button 
                onClick={addItem}
                className="bg-emerald-600 text-white font-bold rounded-xl text-sm hover:bg-emerald-500 px-6 py-3 shrink-0 flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-lg shadow-emerald-900/20"
              >
                <Plus className="w-4 h-4" /> Dodaj Pozycję
              </button>
            ) : (
              <div />
            )}
            
            <div className="flex gap-3 justify-end items-center">
              <button onClick={onClose} className="px-8 py-3 rounded-xl bg-white text-black text-sm font-bold shadow-lg shadow-white/10 hover:bg-white/90 transition-transform active:scale-95 whitespace-nowrap">
                Zamknij / Zapisz
              </button>
            </div>
          </div>
        </div>

      </div>
    </Modal>
  );
}
