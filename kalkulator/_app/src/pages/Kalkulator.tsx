import { useState, useMemo } from 'react';
import { Plus, Search, Coins, FileText, ChevronRight, ClipboardList, ClipboardPen, X, LogOut } from 'lucide-react';
import { useOrders } from '../store/useOrders';
import { Order, OrderStatus } from '../types';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { AddOrderModal } from '../components/AddOrderModal';
import { AddManualListModal } from '../components/AddManualListModal';
import { OrderModal } from '../components/OrderModal';
import { FinanceModal } from '../components/FinanceModal';
import { SearchModal } from '../components/SearchModal';
import logoUrl from '../assets/logo-login.png';

const statusColors: Record<OrderStatus, string> = {
  otwarte: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
  zakończone: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
  opłacone: 'bg-purple-500/15 text-purple-400 border border-purple-500/30',
  wstrzymano: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
  anulowano: 'bg-red-500/15 text-red-400 border border-red-500/30',
};

interface KalkulatorProps {
  activePinLabel: string;
  ordersCollection: string;
  onLogout: () => void;
}

export default function Kalkulator({ activePinLabel, ordersCollection, onLogout }: KalkulatorProps) {
  const { orders, addOrder, updateOrder, updateOrderItems, deleteOrder, isLoading, error } = useOrders(ordersCollection);
  const [activeModal, setActiveModal] = useState<'add' | 'addManual' | 'search' | 'finance' | 'order' | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [showAddChoice, setShowAddChoice] = useState(false);
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<OrderStatus | 'wszystkie'>('wszystkie');

  const filteredOrders = useMemo(() => {
    let result = [...orders].sort((a, b) => b.createdAt - a.createdAt); // Default newest first

    if (filterStatus !== 'wszystkie') {
      result = result.filter(o => o.status === filterStatus);
    }
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(o => 
        o.name.toLowerCase().includes(query) || 
        o.total.toString().includes(query) ||
        o.items.some(item => item.serviceName.toLowerCase().includes(query) || item.children.some(child => child.name.toLowerCase().includes(query)))
      );
    }

    return result;
  }, [orders, searchQuery, filterStatus]);

  const handleCreateOrder = async (name: string) => {
    const newOrder = await addOrder(name, 'zlecenie');
    setActiveModal(null);
    setSelectedOrderId(newOrder.id);
    setActiveModal('order');
  };

  const handleCreateManualList = async (name: string) => {
    const newList = await addOrder(name, 'lista_reczna');
    setActiveModal(null);
    setSelectedOrderId(newList.id);
    setActiveModal('order');
  };

  const handleOpenOrder = (id: string) => {
    setSelectedOrderId(id);
    setActiveModal('order');
  };

  const handleDeleteOrder = async (id: string) => {
    await deleteOrder(id);
    if (selectedOrderId === id) {
      setActiveModal(null);
      setSelectedOrderId(null);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full relative overflow-hidden bg-[#050505] text-white font-sans selection:bg-emerald-500/30">
      {/* Header */}
      <header className="relative z-10 h-16 shrink-0 border-b border-white/5 px-4 sm:px-8 flex items-center justify-between bg-black/40 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <img
            src={logoUrl}
            alt="Logo i-JANICKI"
            className="h-9 w-9 rounded-xl object-contain ring-1 ring-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
          />
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-[0.32em] text-white/35">i-JANICKI</div>
            <div className="text-sm font-semibold text-white">Kalkulator</div>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-sm font-medium">
          <div className="h-10 rounded-[8px] bg-white/5 border border-white/10 px-3 flex items-center justify-center font-mono text-xs font-bold text-white/70">
            PIN {activePinLabel}
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="h-10 rounded-[8px] bg-white/5 border border-white/10 px-3 flex items-center gap-2 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            aria-label="Wyloguj"
          >
            <LogOut className="w-4 h-4" />
            <span>Wyloguj</span>
          </button>
        </div>
      </header>

      {/* Main List */}
      <main className="relative z-10 flex-1 p-4 sm:p-8 overflow-hidden bg-[#050505]">
        <div className="max-w-4xl mx-auto h-full flex flex-col gap-6">
          {error && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
              {error}
            </div>
          )}

          <div className="flex-1 overflow-y-auto pr-2 space-y-4 pb-24">
            {isLoading ? (
              <div className="p-8 text-center border border-white/5 border-dashed rounded-2xl bg-white/[0.02]">
                <p className="text-white/40">Ładowanie z Firestore...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-8 text-center border border-white/5 border-dashed rounded-2xl bg-white/[0.02]">
                <FileText className="w-12 h-12 text-white/20 mx-auto mb-4" />
                <p className="text-white/40">Brak zleceń lub list do wyświetlenia.</p>
                <button 
                  onClick={() => setShowAddChoice(true)}
                  className="mt-4 text-sm text-emerald-400 hover:text-emerald-300 font-bold"
                >
                  Dodaj nowe zlecenie lub listę
                </button>
              </div>
            ) : (
              filteredOrders.map(order => (
                <div 
                  key={order.id}
                  onClick={() => handleOpenOrder(order.id)}
                  className={cn(
                    "group p-5 bg-[#111111] border border-white/10 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between hover:bg-white/[0.03] transition-colors cursor-pointer gap-4",
                    order.status === 'zakończone' && "opacity-70"
                  )}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn(
                        "font-bold text-lg",
                        order.status === 'zakończone' ? "text-white/60" :
                        order.type === 'lista_reczna' ? "text-blue-400" :
                        "text-orange-400"
                      )}>
                        {order.name}
                      </span>

                    </div>
                    <div className="text-white/40 text-xs flex flex-col sm:flex-row sm:gap-4">
                      <span>{order.items.length} pozycji</span>
                      <span className="hidden sm:inline">•</span>
                      <span>Zaktualizowano: {format(order.updatedAt, 'dd.MM.yyyy HH:mm')}</span>
                    </div>
                  </div>
                  
                  <div className="text-left sm:text-right w-full sm:w-auto">
                    <div className={cn(
                      "text-xl font-mono font-bold",
                      order.status === 'otwarte' ? "text-emerald-400" :
                      order.status === 'zakończone' ? "text-white/50" :
                      order.status === 'opłacone' ? "text-purple-400" :
                      order.status === 'wstrzymano' ? "text-amber-500" :
                      "text-red-500"
                    )}>
                      {order.total.toLocaleString('pl-PL')} zł
                    </div>
                    <span className={`px-[10px] py-[4px] rounded-[6px] text-[11px] font-[600] uppercase tracking-[0.03em] mt-1.5 inline-block ${statusColors[order.status]}`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Floating Actions */}
      <div className="fixed bottom-8 right-8 flex flex-col gap-4 z-40">
        <div 
          onClick={() => setActiveModal('finance')}
          className="w-14 h-14 rounded-[18px] flex items-center justify-center bg-white/5 border border-white/10 text-white hover:bg-white/10 shadow-[0_10px_25px_rgba(0,0,0,0.5)] cursor-pointer transition-transform hover:scale-105 active:scale-95"
        >
          <Coins className="w-6 h-6" />
        </div>
        <div 
          onClick={() => setActiveModal('search')}
          className="w-14 h-14 rounded-[18px] flex items-center justify-center bg-white/5 border border-white/10 text-white hover:bg-white/10 shadow-[0_10px_25px_rgba(0,0,0,0.5)] cursor-pointer transition-transform hover:scale-105 active:scale-95"
        >
          <Search className="w-6 h-6" />
        </div>
        <div className="relative">
          {/* Choice Panel */}
          {showAddChoice && (
            <>
              <div 
                className="fixed inset-0 z-30" 
                onClick={() => setShowAddChoice(false)}
              />
              <div className="absolute bottom-0 right-0 mb-0 mr-0 z-40 flex flex-col gap-3 animate-in slide-in-from-bottom-4 fade-in duration-200">
                <div className="flex flex-col gap-3 bg-[#1a1a1a] border border-white/10 rounded-2xl p-4 shadow-2xl min-w-[240px]">
                  <button
                    onClick={() => { setShowAddChoice(false); setActiveModal('add'); }}
                    className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-left group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center shrink-0 group-hover:bg-emerald-600/30 transition-colors">
                      <ClipboardPen className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">Nowe zlecenie</div>
                      <div className="text-[11px] text-white/40 mt-0.5">Usługi, materiały, jednostki</div>
                    </div>
                  </button>
                  <button
                    onClick={() => { setShowAddChoice(false); setActiveModal('addManual'); }}
                    className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-left group"
                  >
                    <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center shrink-0 group-hover:bg-blue-600/30 transition-colors">
                      <ClipboardList className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">Nowa lista ręczna</div>
                      <div className="text-[11px] text-white/40 mt-0.5">Tylko nazwa i cena</div>
                    </div>
                  </button>
                </div>
              </div>
            </>
          )}
          <div 
            onClick={() => setShowAddChoice(!showAddChoice)}
            className="w-14 h-14 rounded-[18px] flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_10px_25px_rgba(0,0,0,0.5)] cursor-pointer transition-transform hover:scale-105 active:scale-95"
          >
            {showAddChoice ? <X className="w-6 h-6" strokeWidth={3} /> : <Plus className="w-7 h-7" strokeWidth={3} />}
          </div>
        </div>
      </div>

      <AddOrderModal 
        isOpen={activeModal === 'add'} 
        onClose={() => setActiveModal(null)} 
        onCreate={handleCreateOrder} 
      />

      <AddManualListModal 
        isOpen={activeModal === 'addManual'} 
        onClose={() => setActiveModal(null)} 
        onCreate={handleCreateManualList} 
      />
      
      <SearchModal 
        isOpen={activeModal === 'search'}
        onClose={() => setActiveModal(null)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        filteredOrders={filteredOrders}
        onOpenOrder={handleOpenOrder}
      />
      
      <FinanceModal 
        isOpen={activeModal === 'finance'}
        onClose={() => setActiveModal(null)}
        orders={orders}
      />

      {selectedOrderId && (
        <OrderModal 
          isOpen={activeModal === 'order'}
          onClose={() => setActiveModal(null)}
          orderId={selectedOrderId}
          orders={orders}
          updateOrder={updateOrder}
          updateOrderItems={updateOrderItems}
          onDeleteOrder={handleDeleteOrder}
        />
      )}
    </div>
  );
}
