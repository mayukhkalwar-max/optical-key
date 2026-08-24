const SHARED_SECRET = "MY_SECRET_KEY_123";

// Direct inter-tab communication channel
const channel = new BroadcastChannel('optical_key_channel');

let bitBuffer = "";
const sensor = document.getElementById('sensor');
const signalState = document.getElementById('signal-state');
const bufferVal = document.getElementById('buffer-val');
const decodedKey = document.getElementById('decoded-key');
const lockStatus = document.getElementById('lock-status');

// Generates 20-bit expected hash token
function generateExpectedToken() {
    const timeBucket = Math.floor(Date.now() / 30000);
    const rawString = SHARED_SECRET + timeBucket;
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
        hash |= 0;
    }
    // 0xFFFFF bitmask extracts 20 bits
    return (Math.abs(hash) & 0xFFFFF).toString(2).padStart(20, '0');
}

// Listen for bit pulse events from transmitter
channel.onmessage = (event) => {
    const data = event.data;

    if (data.type === 'PULSE') {
        const bit = data.bit;
        const isOn = (bit === '1');

        // Update sensor visual feedback
        if (sensor) {
            sensor.style.backgroundColor = isOn ? '#ffffff' : '#000000';
            sensor.style.boxShadow = isOn ? '0 0 30px #ffbb00' : '0 0 10px rgba(0,0,0,0.5)';
        }
        if (signalState) signalState.innerText = isOn ? 'HIGH (1)' : 'LOW (0)';

        // Append received bit to stream
        bitBuffer += bit;
        if (bufferVal) bufferVal.innerText = bitBuffer;
    } 
    else if (data.type === 'COMPLETE') {
        if (signalState) signalState.innerText = 'OFF (0)';
        if (sensor) {
            sensor.style.backgroundColor = '#000000';
            sensor.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';
        }

        // Look for Preamble (1100) + 20-bit Payload (requires 24 total bits)
        const preambleIdx = bitBuffer.indexOf("1100");
        if (preambleIdx !== -1 && (bitBuffer.length - preambleIdx) >= 24) {
            const capturedToken = bitBuffer.substring(preambleIdx + 4, preambleIdx + 24);
            const expectedToken = generateExpectedToken();

            if (decodedKey) decodedKey.innerText = capturedToken;

            if (capturedToken === expectedToken) {
                if (lockStatus) {
                    lockStatus.className = "unlocked";
                    lockStatus.innerText = "ACCESS GRANTED! 🔓";
                }
            } else {
                if (lockStatus) {
                    lockStatus.className = "invalid";
                    lockStatus.innerText = "INVALID KEY ❌";
                }
            }
        } else {
            if (lockStatus) {
                lockStatus.className = "invalid";
                lockStatus.innerText = "SIGNAL CORRUPTED ❌";
            }
        }

        // Auto-reset receiver state after 3 seconds
        setTimeout(() => {
            bitBuffer = "";
            if (bufferVal) bufferVal.innerText = "...";
            if (decodedKey) decodedKey.innerText = "NONE";
            if (lockStatus) {
                lockStatus.className = "";
                lockStatus.innerText = "LOCKED 🔒";
            }
        }, 3000);
    }
};
