import { authService } from '../services/auth-service.js';
import { showToast } from '../components/toast.js';

export function renderLoginPage() {
    const container = document.createElement('div');
    container.className = 'login-page-container';

    container.innerHTML = `
        <div class="login-card card">
            <div class="login-header">
                <div class="login-banner-box" style="margin-bottom: 1rem;">
                    <img src="banner.png" alt="Burgame Banner" class="login-banner-img" style="width: 100%; max-height: 120px; object-fit: contain; filter: drop-shadow(0 0 15px var(--color-primary-glow));">
                </div>
                <h1 class="login-title">BURGAME ACCESO</h1>
                <p class="login-subtitle">Ingresa tu PIN de operador para iniciar turno</p>
            </div>

            <form id="form-login" class="login-form">
                <div class="form-group">
                    <label for="pin-input">PIN de Acceso (4 Dígitos):</label>
                    <input type="password" id="pin-input" class="pin-display" maxlength="4" placeholder="••••" readonly required>
                </div>

                <!-- Teclado Numérico Arcade -->
                <div class="keypad-grid">
                    <button type="button" class="btn-key" data-val="1">1</button>
                    <button type="button" class="btn-key" data-val="2">2</button>
                    <button type="button" class="btn-key" data-val="3">3</button>
                    <button type="button" class="btn-key" data-val="4">4</button>
                    <button type="button" class="btn-key" data-val="5">5</button>
                    <button type="button" class="btn-key" data-val="6">6</button>
                    <button type="button" class="btn-key" data-val="7">7</button>
                    <button type="button" class="btn-key" data-val="8">8</button>
                    <button type="button" class="btn-key" data-val="9">9</button>
                    <button type="button" class="btn-key btn-key--clear" id="key-clear">⌫</button>
                    <button type="button" class="btn-key" data-val="0">0</button>
                    <button type="submit" class="btn-key btn-key--enter" id="key-enter">OK</button>
                </div>

                <div class="pin-hints">
                    <span>👨‍🍳 PIN Cocina: <strong>1234</strong></span>
                    <span>⚡ PIN Admin/Caja: <strong>8888</strong></span>
                </div>
            </form>
        </div>
    `;

    setupEvents(container);
    return container;
}

function setupEvents(container) {
    const pinInput = container.querySelector('#pin-input');
    const form = container.querySelector('#form-login');

    container.querySelectorAll('.btn-key[data-val]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (pinInput.value.length < 4) {
                pinInput.value += btn.dataset.val;
            }
        });
    });

    container.querySelector('#key-clear')?.addEventListener('click', () => {
        pinInput.value = pinInput.value.slice(0, -1);
    });

    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        const pin = pinInput.value;

        try {
            const session = authService.loginWithPin(pin);
            showToast({
                message: `🎮 Bienvenido ${session.name}`,
                type: 'success'
            });

            if (session.role === 'kitchen') {
                window.location.href = 'cocina.html';
            } else {
                window.location.hash = '#/ventas';
            }
        } catch (err) {
            showToast({ message: err.message, type: 'error' });
            pinInput.value = '';
        }
    });

    // Teclado físico
    window.addEventListener('keydown', (e) => {
        if (document.activeElement.id === 'pin-input' || window.location.hash === '#/login') {
            if (e.key >= '0' && e.key <= '9' && pinInput.value.length < 4) {
                pinInput.value += e.key;
            } else if (e.key === 'Backspace') {
                pinInput.value = pinInput.value.slice(0, -1);
            }
        }
    });
}
