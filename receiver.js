const SHARED_SECRET = "MY_SECRET_KEY_123";

// Create a direct inter-tab communication channel
const channel = new BroadcastChannel('optical_key_channel');

let bitBuffer = "";
let sensor = document.getElementById('sensor');
let signalState = document.getElementById('signal-state');
let bufferVal = document.getElementById('buffer-val');
let decodedKey = document.getElementById('decoded-key');
let lockStatus = document.getElementById('lock-status');

function generateExpectedToken() {
    const timeBucket = Math.floor(Date.now() / 30000);
    const rawString = SHARED_SECRET + timeBucket;
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
        hash |= 0;
    }
    return (Math.abs(hash) & 0xFFFF).toString(2).padStart(16, '0');
}

// Listen to raw bit pulses sent from the transmitter
channel.onmessage = (event) => {
    const data = event.data;

    if (data.type === 'PULSE') {
        const bit = data.bit;
        const isOn = (bit === '1');

        // Update sensor UI state instantly
        sensor.style.backgroundColor = isOn ? '#ffffff' : '#000000';
        sensor.style.boxShadow = isOn ? '0 0 30px #ffbb00' : '0 0 10px rgba(0,0,0,0.5)';
        signalState.innerText = isOn ? 'HIGH (1)' : 'LOW (0)';

        // Append to received stream
        bitBuffer += bit;
        bufferVal.innerText = bitBuffer;
    } 
    else if (data.type === 'COMPLETE') {
        // Evaluate collected bitstream
        signalState.innerText = 'OFF (0)';
        sensor.style.backgroundColor = '#000000';
        sensor.style.boxShadow = '0 0 10px rgba(0,0,0,0.5)';

        // Look for Sync Preamble (1100) + 16-bit Payload
        const preambleIdx = bitBuffer.indexOf("1100");
        if (preambleIdx !== -1 && (bitBuffer.length - preambleIdx) >= 20) {
            const capturedToken = bitBuffer.substring(preambleIdx + 4, preambleIdx + 20);
            const expectedToken = generateExpectedToken();

            decodedKey.innerText = capturedToken;

            if (capturedToken === expectedToken) {
                lockStatus.className = "unlocked";
                lockStatus.innerText = "ACCESS GRANTED! 🔓";
            } else {
                lockStatus.className = "invalid";
                lockStatus.innerText = "INVALID KEY ❌";
            }
        } else {
            lockStatus.className = "invalid";
            lockStatus.innerText = "SIGNAL CORRUPTED ❌";
        }

        // Auto-reset receiver after 3 seconds
        setTimeout(() => {
            bitBuffer = "";
            bufferVal.innerText = "...";
            decodedKey.innerText = "NONE";
            lockStatus.className = "";
            lockStatus.innerText = "LOCKED 🔒";
        }, 3000);
    }
};
