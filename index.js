import express from "express";
import ffmpeg from "fluent-ffmpeg";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Serve public folder for output videos
app.use("/output", express.static(path.join(__dirname, "public")));

// Ensure public folder exists
const publicDir = path.join(__dirname, "public");
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir);

// POST /render endpoint
app.post("/render", (req, res) => {
    const { video_url, template_image_url } = req.body;

    if (!video_url || !template_image_url) {
        return res.status(400).json({ error: "Missing video_url or template_image_url" });
    }

    // Immediately respond to avoid client timeout
    res.json({ success: true, status: "accepted" });

    (async () => {
        try {
            console.log("Starting video processing...");

            // Download video
            const videoResp = await fetch(video_url);
            const videoBuffer = await videoResp.arrayBuffer();
            const videoPath = path.join(publicDir, "input.mp4");
            fs.writeFileSync(videoPath, Buffer.from(videoBuffer));
            console.log("Video downloaded:", videoPath);

            // Download template image
            const imgResp = await fetch(template_image_url);
            const imgBuffer = await imgResp.arrayBuffer();
            const imgPath = path.join(publicDir, "template.png");
            fs.writeFileSync(imgPath, Buffer.from(imgBuffer));
            console.log("Template image downloaded:", imgPath);

            // Output video path
            const timestamp = Date.now();
            const outputPath = path.join(publicDir, `output-${timestamp}.mp4`);

            console.log("Starting FFmpeg processing...");

            ffmpeg(videoPath)
                .input(imgPath)
                // Overlay template on video (example: top-left corner)
                .complexFilter(["[0:v][1:v] overlay=0:0"])
                .outputOptions("-preset veryfast")
                .on("progress", p => console.log("FFmpeg progress:", p))
                .on("end", () => {
                    console.log("FFmpeg finished:", outputPath);
                    console.log("Output video URL:", `https://video-webhook.onrender.com/output/${path.basename(outputPath)}`);
                })
                .on("error", err => console.error("FFmpeg error:", err))
                .save(outputPath);

        } catch (err) {
            console.error("Processing failed:", err);
        }
    })();
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
