const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mediasoup = require('mediasoup');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// MediaSoup Worker and Router Setup
const mediaConfig = {
    workerOptions: {
        logLevel: 'warn',
        logTags: ['info', 'warn', 'error'],
    },
    routerOptions: {
        mediaCodecs: [
            {
                kind: 'audio',
                mimeType: 'audio/opus',
                clockRate: 48000,
                channels: 2,
            },
            {
                kind: 'video',
                mimeType: 'video/VP8',
                clockRate: 90000,
            },
        ],
    },
};

let worker, router;

async function createMediaSoupWorker() {
    worker = await mediasoup.createWorker(mediaConfig.workerOptions);
    router = await worker.createRouter(mediaConfig.routerOptions);
    console.log('MediaSoup Worker and Router created');
}

createMediaSoupWorker().catch(console.error);

// Socket.IO signaling
io.on('connection', socket => {
    console.log('Client connected: ', socket.id);

    socket.on('offer', async (offer) => {
        // Handle WebRTC offer and set up MediaSoup producer

        // Create transport for sending media to MediaSoup
        const transport = await router.createWebRtcTransport({
            listenIps: ['0.0.0.0'],
            enableTcp: true,
            enableUdp: true,
            preferUdp: true,
        });

        socket.emit('transportParams', transport.options);

        // Set up the peer connection from the offer
        const producer = await transport.produce({
            kind: 'video',
            rtpParameters: offer,
        });

        // Once the producer is set, trigger a function to start converting it to RTMPS
        startRTMPConversion(producer);
    });

    socket.on('candidate', (candidate) => {
        // Handle ICE candidates for WebRTC
        transport.addIceCandidate(candidate);
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });
});

// Start the server
server.listen(5000, () => {
    console.log('Server is running on http://localhost:5000');
});

// Function to convert stream to RTMPS and push to Cloudflare
function startRTMPConversion(producer) {
    const rtmpStreamUrl = 'rtmps://live.cloudflarestream.com/live/your-stream-key';

    // Use FFmpeg to convert the WebRTC stream to RTMPS and push to Cloudflare
    const ffmpegCommand = `ffmpeg -f rawvideo -pix_fmt yuv420p -s 1280x720 -r 30 -i - -c:v libx264 -preset fast -f flv ${rtmpStreamUrl}`;

    const ffmpegProcess = exec(ffmpegCommand, { stdio: ['pipe', process.stdout, process.stderr] });

    // Pipe producer output to FFmpeg
    producer.on('data', (data) => {
        ffmpegProcess.stdin.write(data);
    });

    producer.on('close', () => {
        ffmpegProcess.stdin.end();
    });

    console.log('Started converting WebRTC to RTMPS and pushing to Cloudflare');
}