const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 200; // Increased to 200ms for reliable camera detection

let track = null;
let useTorch = false;

window.addEventListener('DOMContentLoaded', async () => {
    const desc = document.getElementById('mode-desc');
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            track = stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities();
            
            if (capabilities.torch) {
                useTorch = true;
                if (desc) desc.innerText = "Mode: Phone LED Flashlight Enabled";
                return;
            }
        } catch (e) {}
    }
    if (desc) desc.innerText = "Mode: Screen Flashlight Mode (Laptop/PC)";
});

async function setTorchState(state) {
    if (useTorch && track) {
        try {
            await track.applyConstraints({ advanced: [{ torch: state }] });
        } catch (e) {}
    }
}

function generateToken() {
    const timeBucket = Math.floor(Date.now() / 30000);
    const rawString = SHARED_SECRET + timeBucket;
    
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
        hash |= 0;
    }
    
    return (Math.abs(hash) & 0xFFFF).toString(2).padStart(16, '0');
}

let isTransmitting = false;

async function transmitToken() {
    if (isTransmitting) return;

    const status = document.getElementById('status');
    const btn = document.getElementById('tx-btn');
    const flashBox = document.getElementById('flash-box');
    const flashIcon = document.getElementById('flash-icon');

    isTransmitting = true;
    if (btn) btn.disabled = true;

    const payload = generateToken();
    const fullBitStream = "11" + payload + "0"; // Sync Header (11) + 16-bit Payload + Stop Bit
    
    if (status) status.innerText = `Transmitting: ${payload}`;

    let bitIndex = 0;
    let startTime = performance.now();

    async function step(currentTime) {
        let elapsed = currentTime - startTime;

        if (elapsed >= BIT_DURATION_MS) {
            startTime = currentTime;
            bitIndex++;
        }

        if (bitIndex < fullBitStream.length) {
            const currentBit = fullBitStream[bitIndex];
            const isOn = (currentBit === '1');
            
            if (useTorch) await setTorchState(isOn);
            
            if (flashBox) flashBox.style.backgroundColor = isOn ? "#FFFFFF" : "#000000";
            if (flashIcon) {
                flashIcon.style.color = isOn ? "#ffbb00" : "#222222";
                flashIcon.style.transform = isOn ? "scale(1.2)" : "scale(1)";
            }

            requestAnimationFrame(step);
        } else {
            if (useTorch) await setTorchState(false);
            
            if (flashBox) flashBox.style.backgroundColor = "#111111";
            if (flashIcon) {
                flashIcon.style.color = "#333333";
                flashIcon.style.transform = "scale(1)";
            }
            
            if (status) status.innerText = "Transmission Complete!";
            if (btn) btn.disabled = false;
            isTransmitting = false;
        }
    }

    const firstBitOn = (fullBitStream[0] === '1');
    if (useTorch) await setTorchState(firstBitOn);
    if (flashBox) flashBox.style.backgroundColor = firstBitOn ? "#FFFFFF" : "#000000";
    if (flashIcon) flashIcon.style.color = firstBitOn ? "#ffbb00" : "#222222";
    
    requestAnimationFrame(step);
}
