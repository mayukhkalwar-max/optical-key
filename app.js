const SHARED_SECRET = "MY_SECRET_KEY_123";
const BIT_DURATION_MS = 100; // 100ms per bit = 10 Hz transmission

function generateToken() {
    const timeBucket = Math.floor(Date.now() / 30000); // Changes every 30 seconds
    const rawString = SHARED_SECRET + timeBucket;
    
    let hash = 0;
    for (let i = 0; i < rawString.length; i++) {
        hash = ((hash << 5) - hash) + rawString.charCodeAt(i);
        hash |= 0; // Convert to 32-bit integer
    }
    
    // Take lower 16 bits and convert to binary string
    let binaryToken = (Math.abs(hash) & 0xFFFF).toString(2).padStart(16, '0');

    // --- DEBUG LOGS FOR F12 CONSOLE ---
    console.log("-----------------------------------------");
    console.log("Current Time Bucket:", timeBucket);
    console.log("Generated 16-Bit Token:", binaryToken);
    
    return binaryToken;
}

function transmitToken() {
    const flashBox = document.getElementById('flash-box');
    const status = document.getElementById('status');
    
    const payload = generateToken();
    
    // Framing Structure:
    // Preamble: 1 1 0 0 (Sync header to calibrate ESP32 clock)
    // Data: 16-bit binary token
    // Stop Bit: 0 (Solid Black)
    const fullBitStream = "1100" + payload + "0";
    
    console.log("Full Transmission Stream (With Preamble):", fullBitStream);
    status.innerText = `Transmitting Payload: ${payload}`;
    
    let bitIndex = 0;
    
    const interval = setInterval(() => {
        if (bitIndex >= fullBitStream.length) {
            clearInterval(interval);
            flashBox.style.backgroundColor = 'black'; // Reset to black
            status.innerText = "Transmission Complete!";
            console.log("Status: Transmission Finished.");
            return;
        }
        
        const currentBit = fullBitStream[bitIndex];
        flashBox.style.backgroundColor = (currentBit === '1') ? 'white' : 'black';
        
        bitIndex++;
    }, BIT_DURATION_MS);
}