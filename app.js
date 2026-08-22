const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 100; // 100ms per bit = 10 Hz

let track = null;
let useTorch = false;

// Generate a random unique Session Salt EVERY TIME the page opens/refreshes
const SESSION_SALT = Math.floor(Math.random() * 65536).toString(16).padStart(4, '0');

// Auto-detect hardware capability on page load
window.addEventListener('DOMContentLoaded', async () => {
    const desc = document.getElementById('mode-desc');
    console.log(`[Unique Session Initialized] Session Salt: ${SESSION_SALT}`);
    
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
            });
            track = stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities();
            
            if (capabilities.torch) {
                useTorch = true;
                desc.innerText = `Mode: Torch Enabled (Session ID: ${SESSION_SALT})`;
                return;
            }
        } catch (e) {}
    }
    
    desc.innerText = `Mode: Screen Flash Mode (Session ID: ${SESSION_SALT})`;
});

async function setTorchState(state) {
    if (useTorch && track) {
        try {
            await track.applyConstraints({ advanced: [{ torch: state }] });
        } catch (e) {}
    }
}

// Token generator now incorporates SHARED_SECRET + Precise Timestamp + Session Salt
function generateToken() {
    // Uses millisecond-level timestamp + unique session salt
    const uniqueSeed = SHARED_SECRET + Date.now().toString() + SESSION_SALT;
    
    let hash = 0;
    for (let i = 0; i < uniqueSeed.length; i++) {
        hash = ((hash << 5) - hash) + uniqueSeed.charCodeAt(i);
        hash |= 0;
    }
    
    const binaryToken = (Math.abs(hash) & 0xFFFF).toString(2).padStart(16, '0');
    console.log(`[Unique Pattern] Seed: ${uniqueSeed} => Token: ${binaryToken}`);
    return binaryToken;
}

let isTransmitting = false;

async function transmitToken() {
    if (isTransmitting) return;

    const status = document.getElementById('status');
    const btn = document.getElementById('tx-btn');
    const flashBox = document.getElementById('flash-box');
    const flashIcon = document.getElementById('flash-icon');

    isTransmitting = true;
    btn.disabled = true;

    // Generates a brand new, unique token for this specific button press
    const payload = generateToken();
    const fullBitStream = "1100" + payload + "0"; // Preamble (1100) + Data + Stop
    
    status.innerText = `Transmitting Unique Token: ${payload}`;

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
            
            flashBox.style.backgroundColor = isOn ? "#FFFFFF" : "#000000";
            flashIcon.style.color = isOn ? "#ffbb00" : "#222222";
            flashIcon.style.transform = isOn ? "scale(1.2)" : "scale(1)";

            requestAnimationFrame(step);
        } else {
            if (useTorch) await setTorchState(false);
            
            flashBox.style.backgroundColor = "#111111";
            flashIcon.style.color = "#333333";
            flashIcon.style.transform = "scale(1)";
            
            status.innerText = "Transmission Complete!";
            btn.disabled = false;
            isTransmitting = false;
        }
    }

    const firstBitOn = (fullBitStream[0] === '1');
    if (useTorch) await setTorchState(firstBitOn);
    
    flashBox.style.backgroundColor = firstBitOn ? "#FFFFFF" : "#000000";
    flashIcon.style.color = firstBitOn ? "#ffbb00" : "#222222";
    
    requestAnimationFrame(step);
}