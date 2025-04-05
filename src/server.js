const express = require('express');
const multer = require('multer');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const app = express();
const upload = multer({ dest: 'uploads/' });
const RTMP_SERVER_URL = 'rtmp://your-rtmp-server/live/stream-key';
app.post('/upload', upload.single('video'), (req, res) => {
    console.log("chunk received");
    const videoPath = req.file.path;
// Stream the video to the RTMP server using FFmpeg
    ffmpeg(videoPath)
        .inputFormat('webm')
        .videoCodec('libx264')
        .audioCodec('aac')
        .format('flv')
        .output(RTMP_SERVER_URL)
        .on('start', () => {
            console.log('Streaming started...');
        })
        .on('end', () => {
            console.log('Streaming ended.');
            fs.unlinkSync(videoPath); // Clean up the temporary file
        })
        .on('error', (err) => {
            console.error('Error streaming:', err);
            fs.unlinkSync(videoPath); // Clean up the temporary file
        })
        .run();
    res.sendStatus(200);
});
app.listen(3001, () => {
    console.log('Server is running on http://localhost:3001');
});