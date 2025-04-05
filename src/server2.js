// server.js
const express = require("express");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const { spawn } = require("child_process");

const app = express();
const port = 5000;
const fs = require("fs");
const path = require("path");

const cors = require('cors');
app.use(cors());

// Setup multer for handling incoming video/audio stream
// const upload = multer({ dest: "uploads/" });

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir); // Ensure directory exists
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname)); // Ensure file has an extension
    }
});

const upload = multer({ storage: storage });

const uploadStream = multer({ storage: multer.memoryStorage() }); // Store in memory for direct processing

const allowedMimeTypes = ['video/webm'];

const CLOUDFLARE_RTMP_URL = "rtmps://live.cloudflare.com:443/live/";
const STREAM_KEY = "";  // Get this from your Cloudflare Stream dashboard

app.post("/upload2", upload.single("video"), (req, res) => {
    if (!req.file) {
        console.error("❌ No file received.");
        return res.status(400).send("No file uploaded.");
    }

    const filePath = path.join(__dirname, "uploads", req.file.filename);
    console.log("✅ File received:", filePath);

    // Delay to ensure file is fully written before checking
    setTimeout(() => {
        fs.stat(filePath, (err, stats) => {
            if (err) {
                console.error("❌ File not found:", err);
                return res.status(500).send("File was not saved correctly.");
            }
            console.log("📂 File exists, size:", stats.size, "bytes");
            res.status(200).send("File uploaded successfully.");
        });
    }, 500); // Give filesystem some time to catch up
});

// app.post("/upload", upload.single("video"), async (req, res) => {
//     console.log("Chunk received...")
//
//     if (!allowedMimeTypes.includes(req.file.mimetype)) {
//         console.log('MIME type of uploaded file:', req.file.mimetype);
//         return res.status(400).send('Invalid file type.');
//     }
//
//     const filePath = path.join(__dirname, "uploads", req.file.filename);
//     console.log("✅ File received:", filePath);
//
//     // fs.stat(filePath, (err, stats) => {
//     //     if (err) {
//     //         console.error("❌ File not found or inaccessible:", err);
//     //         return res.status(500).send("File not found.");
//     //     }
//     //     if (stats.size === 0) {
//     //         console.error("❌ File is empty!");
//     //         return res.status(500).send("File is empty.");
//     //     }
//     //     console.log("📂 File size:", stats.size, "bytes");
//     //
//     //     res.status(200).send("File uploaded successfully.");
//     // });
//
//     try {
//         // Make sure we have the file
//         if (!req.file) {
//             return res.status(400).send("No file uploaded.");
//         }
//
//         // Set up the RTMP stream URL
//         const rtmpUrl = `${CLOUDFLARE_RTMP_URL}${STREAM_KEY}`;
//
//         // Use ffmpeg to push the media to Cloudflare Stream RTMPS endpoint
//         const filePath = path.resolve(__dirname, 'uploads', req.file.filename);
//         setTimeout(() => {
//             ffmpeg(filePath)
//         }, 500);
//         console.log('Current working directory:', process.cwd());
//         ffmpeg(filePath)
//             .inputFormat("webm")  // Adjust format depending on your captured file format
//             .videoCodec("libx264")
//             .audioCodec("aac")
//             .format("flv")  // FLV format is needed for RTMP streaming
//             .output(rtmpUrl)
//             .on("start", () => {
//                 console.log("Started streaming to Cloudflare Stream...");
//             })
//             .on("error", (err, stdout, stderr) => {
//                 console.error("FFmpeg error:", err, stderr);
//                 res.status(500).send("Error streaming to Cloudflare.");
//             })
//             .on("end", () => {
//                 console.log("Streaming ended.");
//                 res.status(200).send("Stream successfully sent to Cloudflare.");
//             })
//             .run();
//     } catch (error) {
//         console.error(error);
//         res.status(500).send("Error processing the file.");
//     }
// });

app.post("/stream", uploadStream.single("videoChunk"), (req, res) => {
    console.log("Chunk received");
    if (!req.file) return res.status(400).send("No file received");

    const ffmpeg = spawn("ffmpeg", [
        "-i", "pipe:0", // Read from incoming stream
        "-c:v", "libvpx",
        "-preset", "ultrafast",
        "-f", "webm",
        "rtmps://live.cloudflare.com:443/live/{key}" // Replace with your actual RTMP server
    ]);

    ffmpeg.stdin.write(req.file.buffer);
    ffmpeg.stdin.end();

    ffmpeg.stderr.on("data", (data) => console.log(data.toString())); // Debugging

    ffmpeg.on("close", (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
    });

    res.sendStatus(200);
});

app.post("/stream3", uploadStream.single("videoChunk"), (req, res) => {
    if (!req.file) return res.status(400).send("No file received");

    // Spawn the FFmpeg process
    const ffmpeg = spawn("ffmpeg", [
        "-i", "pipe:0",            // Input from stdin (the stream)
        "-c:v", "libvpx",          // Video codec
        "-f", "webm",              // Output format
        "pipe:1"                   // Output to stdout (pipe for further handling)
    ]);

    // Send the file buffer (video chunk) to FFmpeg's stdin
    ffmpeg.stdin.write(req.file.buffer);
    ffmpeg.stdin.end();

    // Handle output (stdout) of FFmpeg
    ffmpeg.stdout.on("data", (data) => {
        // You can save the output to a file or forward it to another service
        console.log("FFmpeg Output:", data.toString());
    });

    // Handle errors (stderr) from FFmpeg
    ffmpeg.stderr.on("data", (data) => {
        console.error("FFmpeg Error:", data.toString());
    });

    // When FFmpeg finishes processing
    ffmpeg.on("close", (code) => {
        console.log(`FFmpeg process exited with code ${code}`);
    });

    res.sendStatus(200); // Respond once the chunk is processed
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});