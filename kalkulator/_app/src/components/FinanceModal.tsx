import { Modal } from './ui/Modal';
import { Order } from '../types';

interface FinanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: Order[];
}

export function FinanceModal({ isOpen, onClose, orders }: FinanceModalProps) {
  const sumPaid = orders.filter(o => o.status === 'opłacone').reduce((acc, o) => acc + o.total, 0);
  const sumUnpaid = orders.filter(o => o.status === 'zakończone').reduce((acc, o) => acc + o.total, 0);
  const total = sumPaid + sumUnpaid;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Podsumowanie Finansowe" className="max-w-sm pb-2">
      <div className="space-y-4">
        
        <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
          <p className="text-sm font-medium text-purple-400 mb-1 tracking-wide uppercase">Opłacone</p>
          <p className="font-mono text-2xl font-medium text-purple-100">{sumPaid.toLocaleString('pl-PL')} zł</p>
        </div>
        
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-sm font-medium text-emerald-400 mb-1 tracking-wide uppercase">Nieopłacone (Zakończone)</p>
          <p className="font-mono text-2xl font-medium text-emerald-100">{sumUnpaid.toLocaleString('pl-PL')} zł</p>
        </div>

        <div className="p-4 rounded-xl bg-[#111111] border border-white/10 mt-6 shadow-xl">
          <p className="text-sm font-bold text-white/40 mb-1 tracking-wide uppercase">Wartość całkowita</p>
          <p className="font-mono text-3xl font-bold text-emerald-400">{total.toLocaleString('pl-PL')} zł</p>
        </div>

      </div>
    </Modal>
  );
}
