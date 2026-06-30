import { useState, type FormEvent } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

interface AddOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
}

export function AddOrderModal({ isOpen, onClose, onCreate }: AddOrderModalProps) {
  const [name, setName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      setIsSubmitting(true);
      try {
        await onCreate(name.trim());
        setName('');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nowe Zlecenie">
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input 
          autoFocus
          label="Nazwa zlecenia" 
          placeholder="np. Remont łazienki ul. Polna"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex justify-end gap-3 pt-4 mt-6 border-t border-white/5">
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Anuluj</Button>
          <Button type="submit" disabled={!name.trim() || isSubmitting}>{isSubmitting ? 'Zapisywanie...' : 'Zapisz'}</Button>
        </div>
      </form>
    </Modal>
  );
}
