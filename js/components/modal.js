export function openModal({ title, content, onConfirm, onCancel, confirmText = 'Aceptar', cancelText = 'Cancelar' }) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 transition-opacity duration-300';
        
        const modal = document.createElement('div');
        modal.className = 'bg-white rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden transform scale-95 transition-transform duration-300';
        
        modal.innerHTML = `
            <div class="px-6 py-4 border-b">
                <h3 class="text-lg font-semibold text-gray-900">${title}</h3>
            </div>
            <div class="px-6 py-4 text-gray-700">
                ${typeof content === 'string' ? content : ''}
            </div>
            <div class="px-6 py-4 bg-gray-50 text-right flex justify-end gap-3">
                ${onCancel ? `<button id="modal-cancel" class="px-4 py-2 text-gray-600 hover:text-gray-800 font-medium">${cancelText}</button>` : ''}
                <button id="modal-confirm" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium">${confirmText}</button>
            </div>
        `;

        if (typeof content !== 'string') {
            modal.querySelector('.text-gray-700').appendChild(content);
        }

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Animate in
        requestAnimationFrame(() => {
            modal.classList.remove('scale-95');
            modal.classList.add('scale-100');
        });

        const cleanup = () => {
            overlay.remove();
            document.removeEventListener('keydown', handleKeydown);
        };

        const handleConfirm = () => {
            if (onConfirm) onConfirm();
            cleanup();
            resolve(true);
        };

        const handleCancel = () => {
            if (onCancel) onCancel();
            cleanup();
            resolve(false);
        };

        const handleKeydown = (e) => {
            if (e.key === 'Escape') handleCancel();
        };

        modal.querySelector('#modal-confirm').addEventListener('click', handleConfirm);
        if (onCancel) {
            modal.querySelector('#modal-cancel').addEventListener('click', handleCancel);
        }
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) handleCancel();
        });
        document.addEventListener('keydown', handleKeydown);
    });
}
