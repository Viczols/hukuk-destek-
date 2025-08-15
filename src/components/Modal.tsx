// src/components/Modal.tsx

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, children }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center"
      onClick={onClose} // Tıklama olursa kapat
    >
      <div
        className="bg-white text-black rounded-xl shadow-2xl w-full max-w-md p-6 relative transition-all"
        onClick={(e) => e.stopPropagation()} // İçeriğe tıklamayı durdur
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-3 text-gray-500 hover:text-red-600 text-xl font-bold"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
