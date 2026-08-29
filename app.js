const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 200; // 200ms per bit for stable camera sampling

let track = null;
let useTorch = false;
let isTransmitting = false;

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
                if (desc) desc.innerText = "Hardware LED Torch Enabled";
                return;
            }
        } catch (e) {}
    }
    if (desc) desc.innerText = "Screen Flash Mode Only";
});

async function setTorchState(state) {
    if (useTorch && track) {
        try {
            await track.applyConstraints({ advanced: [{ torch: state }] });
        } catch (e) {}
    }
}

function generateToken(targetLockId) {
    const timeBucket = Math.floor(Date.now() / 30000);
    const rawString = SHARED_SECRET + targetLockId + timeBucket;
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
        hash |= 0;
    }
    return (Math.abs(hash) & 0xFFFFF).toString(2).padStart(20, '0');
}

async function transmitTokenForLock(targetLockId) {
    if (isTransmitting) return;

    const status = document.getElementById('status');
    const btn1 = document.getElementById('tx-btn-1');
    const btn2 = document.getElementById('tx-btn-2');
    const flashBox = document.getElementById('flash-box');
    const flashIcon = document.getElementById('flash-icon');

    isTransmitting = true;
    if (btn1) btn1.disabled = true;
    if (btn2) btn2.disabled = true;

    const payload = generateToken(targetLockId);
    
    // Stream Protocol:
    // 11110000 (Camera exposure warmup) + 11111000 (Robust Preamble) + PAYLOAD (20 bits) + 00 (Trailing Stop)
    const fullBitStream = "1111000011111000" + payload + "00"; 
    
    if (status) status.innerText = `Token: ${payload}`;

    let bitIndex = 0;

    const timer = setInterval(async () => {
        if (bitIndex < fullBitStream.length) {
            const currentBit = fullBitStream[bitIndex];
            const isOn = (currentBit === '1');

            if (useTorch) await setTorchState(isOn);

            if (flashBox) flashBox.style.backgroundColor = isOn ? "#FFFFFF" : "#000000";
            if (flashIcon) {
                flashIcon.style.color = isOn ? "#ffbb00" : "#222222";
                flashIcon.style.transform = isOn ? "scale(1.2)" : "scale(1)";
            }

            bitIndex++;
        } else {
            clearInterval(timer);
            if (useTorch) await setTorchState(false);
            if (flashBox) flashBox.style.backgroundColor = "#111111";
            if (flashIcon) flashIcon.style.color = "#333333";
            
            if (status) status.innerText = `Sent: ${payload}`;
            
            if (btn1) btn1.disabled = false;
            if (btn2) btn2.disabled = false;
            isTransmitting = false;
        }
    }, BIT_DURATION_MS);
}
