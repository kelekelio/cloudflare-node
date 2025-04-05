const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const { spawn } = require('child_process');


const PORT = 3001;
const RTMP_URL = 'rtmps://live.cloudflare.com:443/live/{key}'; // Replace with your RTMP endpoint

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*', // Match the frontend port
        methods: ['GET', 'POST'],
        credentials: true,
    }
});

app.use(cors({
    origin: '*', // Replace with your React app URL
    methods: ['GET', 'POST'],
    credentials: true,
}));

let ffmpeg;
let isStreaming = false;

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('start-stream', () => {
        if (isStreaming) return;

        console.log('Starting FFmpeg stream to RTMP...');
        ffmpeg = spawn('ffmpeg', [
            '-loglevel', 'error',
            '-i', 'pipe:0',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            "-b:v", "2500k",
            "-maxrate", "2500k",
            "-bufsize", "5000k",
            "-b:a", "128k",
            "-r", "30",
            "-async", "1",
            '-c:a', 'aac',
            '-f', 'flv',
            '-tune', 'zerolatency',
            RTMP_URL,
        ]);

        ffmpeg.on('close', (code) => {
            console.log(`FFmpeg exited with code ${code}`);
            isStreaming = false;
        });

        ffmpeg.stdin.on('error', (e) => {
            console.error('FFmpeg stdin error:', e.message);
        });

        isStreaming = true;
    });

    socket.on('webm-chunk', (chunk) => {
        if (isStreaming && ffmpeg && ffmpeg.stdin.writable) {
            ffmpeg.stdin.write(Buffer.from(chunk));
        }
    });

    socket.on('stop-stream', () => {
        if (ffmpeg) {
            ffmpeg.stdin.end();
            ffmpeg.kill('SIGINT');
        }
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        if (ffmpeg) {
            ffmpeg.stdin.end();
            ffmpeg.kill('SIGINT');
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});