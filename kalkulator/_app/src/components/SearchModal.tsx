import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Select } from './ui/Select';
import { Order, OrderStatus } from '../types';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { FileText } from 'lucide-react';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filterStatus: OrderStatus | 'wszystkie';
  setFilterStatus: (status: OrderStatus | 'wszystkie') => void;
  filteredOrders: Order[];
  onOpenOrder: (id: string) => void;
}

const statusColors: Record<OrderStatus, string> = {
  otwarte: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  zakończone: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  opłacone: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  wstrzymano: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  anulowano: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

export function SearchModal({ isOpen, onClose, searchQuery, setSearchQuery, filterStatus, setFilterStatus, filteredOrders, onOpenOrder }: SearchModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Wyszukiwanie i Filtry" className="max-w-xl pb-4">
      <div className="space-y-6 flex flex-col h-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
          <Input 
            autoFocus
            label="Szukaj" 
            placeholder="Nazwa, usługa, kwota..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Select 
            label="Pokaż status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as OrderStatus | 'wszystkie')}
          >
            <option value="wszystkie">Wszystkie statusy</option>
            <option value="otwarte">Otwarte</option>
            <option value="zakończone">Zakończone</option>
            <option value="opłacone">Opłacone</option>
            <option value="wstrzymano">Wstrzymano</option>
            <option value="anulowano">Anulowano</option>
          </Select>
        </div>

        <div className="flex-1 min-h-[300px] max-h-[50vh] overflow-y-auto space-y-3 pr-2">
           <label className="text-[10px] uppercase text-white/40 font-bold tracking-widest mb-3 block">Wyniki Wyszukiwania ({filteredOrders.length})</label>
           
           {filteredOrders.length === 0 ? (
              <div className="p-8 text-center border border-white/5 border-dashed rounded-2xl bg-white/[0.02]">
                <FileText className="w-10 h-10 text-white/20 mx-auto mb-3" />
                <p className="text-white/40 text-sm">Brak zleceń pasujących do kryteriów.</p>
              </div>
           ) : (
             filteredOrders.map(order => (
               <div 
                 key={order.id}
                 onClick={() => {
                   onClose();
                   onOpenOrder(order.id);
                 }}
                 className={cn(
                   "group p-4 bg-white/5 border border-white/10 rounded-xl flex items-center justify-between hover:bg-white/10 transition-colors cursor-pointer gap-4",
                   order.status === 'zakończone' && "opacity-70"
                 )}
               >
                 <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={cn("font-bold text-sm", order.status === 'zakończone' ? "text-white/60" : "text-white")}>
                        {order.name}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider ${statusColors[order.status]}`}>
                        {order.status}
                      </span>
                    </div>
                    <div className="text-white/40 text-[10px]">
                      {format(order.updatedAt, 'dd.MM.yyyy HH:mm')}
                    </div>
                 </div>
                 <div className="text-right">
                    <div className="text-sm font-mono font-bold text-emerald-400">{order.total.toLocaleString('pl-PL')} zł</div>
                 </div>
               </div>
             ))
           )}
        </div>
      </div>
    </Modal>
  );
}
