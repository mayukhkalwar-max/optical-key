const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 100; // Precision 100ms interval

let track = null;
let useTorch = false;
let isTransmitting = false;

// Inter-tab communication channel for direct simulation
const channel = new BroadcastChannel('optical_key_channel');

// Detect hardware capabilities (LED Flashlight vs Screen Flash) on load
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
        } catch (e) {
            console.log("Hardware torch access unavailable, using screen mode.");
        }
    }
    if (desc) desc.innerText = "Mode: Screen Flashlight Mode (Laptop/PC)";
});

// Controls physical phone LED torch
async function setTorchState(state) {
    if (useTorch && track) {
        try {
            await track.applyConstraints({ advanced: [{ torch: state }] });
        } catch (e) {
            console.error("Torch error:", e);
        }
    }
}

// Generates 20-bit time-bucketed TOTP hash
function generateToken() {
    const timeBucket = Math.floor(Date.now() / 30000);
    const rawString = SHARED_SECRET + timeBucket;
    
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
        hash |= 0;
    }
    
    // 0xFFFFF bitmask extracts 20 bits (padded to 20 binary digits)
    return (Math.abs(hash) & 0xFFFFF).toString(2).padStart(20, '0');
}

// Main transmission sequence
async function transmitToken() {
    if (isTransmitting) return;

    const status = document.getElementById('status');
    const btn = document.getElementById('tx-btn');
    const flashBox = document.getElementById('flash-box');
    const flashIcon = document.getElementById('flash-icon');

    isTransmitting = true;
    if (btn) btn.disabled = true;

    const payload = generateToken();
    const fullBitStream = "1100" + payload + "0"; // Sync Preamble (1100) + 20-Bit Payload + Stop Bit (0)
    
    if (status) status.innerText = `Transmitting: ${payload}`;

    let bitIndex = 0;

    const timer = setInterval(async () => {
        if (bitIndex < fullBitStream.length) {
            const currentBit = fullBitStream[bitIndex];
            const isOn = (currentBit === '1');

            // Send real-time bit event to receiver.js
            channel.postMessage({ type: 'PULSE', bit: currentBit });

            // Toggle hardware torch
            if (useTorch) await setTorchState(isOn);

            // Toggle UI Flash Box
            if (flashBox) flashBox.style.backgroundColor = isOn ? "#FFFFFF" : "#000000";
            if (flashIcon) {
                flashIcon.style.color = isOn ? "#ffbb00" : "#222222";
                flashIcon.style.transform = isOn ? "scale(1.2)" : "scale(1)";
            }

            bitIndex++;
        } else {
            clearInterval(timer);
            
            // Turn off torch & reset UI state
            if (useTorch) await setTorchState(false);

            if (flashBox) flashBox.style.backgroundColor = "#111111";
            if (flashIcon) {
                flashIcon.style.color = "#333333";
                flashIcon.style.transform = "scale(1)";
            }

            if (status) status.innerText = "Transmission Complete!";
            if (btn) btn.disabled = false;
            isTransmitting = false;

            // Signal stream completion to receiver
            channel.postMessage({ type: 'COMPLETE' });
        }
    }, BIT_DURATION_MS);
}
