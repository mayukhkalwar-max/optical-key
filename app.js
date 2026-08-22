const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 100; // 100ms per bit = 10 Hz

function generateToken() {
    const timeBucket = Math.floor(Date.now() / 30000); // 30-second window
    const rawString = SHARED_SECRET + timeBucket;
    
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
        hash |= 0;
    }
    
    let binaryToken = (Math.abs(hash) & 0xFFFF).toString(2).padStart(16, '0');
    console.log("Time Bucket:", timeBucket, "Token:", binaryToken);
    return binaryToken;
}

let isTransmitting = false;

async function transmitToken() {
    if (isTransmitting) return;
    isTransmitting = true;

    const flashBox = document.getElementById('flash-box');
    const status = document.getElementById('status');
    const btn = document.getElementById('tx-btn');
    
    btn.disabled = true;
    btn.style.opacity = "0.5";
    
    // Request Wake Lock on Mobile so screen doesn't dim
    let wakeLock = null;
    if ('wakeLock' in navigator) {
        try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
    }

    const payload = generateToken();
    const fullBitStream = "1100" + payload + "0"; // Preamble (1100) + Data + Stop Bit
    
    status.innerText = `Transmitting: ${payload}`;
    
    let bitIndex = 0;
    let startTime = performance.now();

    function step(currentTime) {
        let elapsed = currentTime - startTime;

        if (elapsed >= BIT_DURATION_MS) {
            startTime = currentTime;
            bitIndex++;
        }

        if (bitIndex < fullBitStream.length) {
            const currentBit = fullBitStream[bitIndex];
            flashBox.style.backgroundColor = (currentBit === '1') ? '#FFFFFF' : '#000000';
            requestAnimationFrame(step);
        } else {
            // Reset state after completion
            flashBox.style.backgroundColor = '#111111';
            status.innerText = "Transmission Complete!";
            btn.disabled = false;
            btn.style.opacity = "1";
            isTransmitting = false;
            if (wakeLock) wakeLock.release();
        }
    }

    // Set first bit immediately
    flashBox.style.backgroundColor = (fullBitStream[0] === '1') ? '#FFFFFF' : '#000000';
    requestAnimationFrame(step);
}