const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const { v4: uuid } = require("uuid");

const app = express();
app.use(express.json());

const TMP_DIR = path.join(__dirname, "tmp");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);

app.post("/render", async (req, res) => {
    const { video_url, template_image_url, text } = req.body;

    if (!video_url || !template_image_url) {
        return res.status(400).json({
            error: "video_url and template_image_url are required"
        });
    }

    const jobId = uuid();
    const videoPath = path.join(TMP_DIR, `${jobId}-input.mp4`);
    const imagePath = path.join(TMP_DIR, `${jobId}-bg.png`);
    const outputPath = path.join(TMP_DIR, `${jobId}-output.mp4`);

    try {
        // Download video
        const videoStream = await axios.get(video_url, { responseType: "stream" });
        await streamToFile(videoStream.data, videoPath);

        // Download image
        const imageStream = await axios.get(template_image_url, { responseType: "stream" });
        await streamToFile(imageStream.data, imagePath);

        // FFmpeg processing
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(videoPath)
                .input(imagePath)
                .complexFilter([
                    {
                        filter: "scale",
                        options: {
                            w: 900,
                            h: 1600,
                            force_original_aspect_ratio: "decrease"
                        }
                    },
                    {
                        filter: "pad",
                        options: {
                            w: 900,
                            h: 1600,
                            x: "(ow-iw)/2",
                            y: "(oh-ih)/2",
                            color: "black"
                        }
                    },
                    {
                        filter: "eq",
                        options: {
                            contrast: 1.15,
                            saturation: 1.25
                        }
                    }
                ])
                .complexFilter([
                    {
                        filter: "overlay",
                        options: {
                            x: "(W-w)/2",
                            y: "(H-h)/2"
                        }
                    }
                ])
                .videoCodec("libx264")
                .audioCodec("aac")
                .outputOptions("-movflags faststart")
                .on("end", resolve)
                .on("error", reject)
                .save(outputPath);
        });

        const outputUrl = `${req.protocol}://${req.get("host")}/output/${path.basename(outputPath)}`;

        res.json({
            success: true,
            output_url: outputUrl
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Processing failed" });
    }
});

// Serve output files
app.use("/output", express.static(TMP_DIR));

app.get("/", (req, res) => {
    res.send("Video Webhook API is running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

function streamToFile(stream, filePath) {
    return new Promise((resolve, reject) => {
        const write = fs.createWriteStream(filePath);
        stream.pipe(write);
        write.on("finish", resolve);
        write.on("error", reject);
    });
}
