import { useState, type FormEvent } from 'react';
import { Modal } from './ui/Modal';
import { Input } from './ui/Input';
import { Button } from './ui/Button';

interface AddManualListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void> | void;
}

export function AddManualListModal({ isOpen, onClose, onCreate }: AddManualListModalProps) {
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
    <Modal isOpen={isOpen} onClose={onClose} title="Nowa Lista Ręczna">
      <form onSubmit={handleSubmit} className="space-y-6">
        <Input 
          autoFocus
          label="Nazwa listy" 
          placeholder="np. Zakupy spożywcze"
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
