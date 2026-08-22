const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 100; // 100ms per bit = 10 Hz

let track = null;

// Initialize Flashlight hardware via browser camera API
async function initTorch() {
    if (track) return true;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' } // Access rear camera
        });
        track = stream.getVideoTracks()[0];
        
        // Check if device hardware supports Torch
        const capabilities = track.getCapabilities();
        if (!capabilities.torch) {
            alert("Your device flashlight/torch is not accessible via Web browser.");
            return false;
        }
        return true;
    } catch (err) {
        alert("Camera permission denied or torch unavailable: " + err.message);
        return false;
    }
}

async function setTorchState(state) {
    if (track) {
        try {
            await track.applyConstraints({
                advanced: [{ torch: state }]
            });
        } catch (e) {
            console.error("Torch error:", e);
        }
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
    const flashIcon = document.getElementById('flash-icon');

    status.innerText = "Accessing hardware torch...";
    const torchReady = await initTorch();
    if (!torchReady) {
        status.innerText = "Error: Hardware torch unavailable";
        return;
    }

    isTransmitting = true;
    btn.disabled = true;

    const payload = generateToken();
    const fullBitStream = "1100" + payload + "0"; // Preamble (1100) + Data + Stop
    
    status.innerText = `Flashing Token: ${payload}`;

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
            
            await setTorchState(isOn);
            flashIcon.style.transform = isOn ? "scale(1.3)" : "scale(1)";
            flashIcon.style.color = isOn ? "#ffbb00" : "#333333";

            requestAnimationFrame(step);
        } else {
            // Turn flashlight OFF at the end
            await setTorchState(false);
            flashIcon.style.transform = "scale(1)";
            flashIcon.style.color = "#ffbb00";
            
            status.innerText = "Transmission Complete!";
            btn.disabled = false;
            isTransmitting = false;
        }
    }

    // Fire initial bit
    const firstBitOn = (fullBitStream[0] === '1');
    await setTorchState(firstBitOn);
    requestAnimationFrame(step);
}