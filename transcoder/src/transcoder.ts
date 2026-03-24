import ffmpeg from "fluent-ffmpeg";
import path from "path";
import fs from "fs";
import { ensureDir } from "./storage";

interface Resolution {
    width: number;
    height: number;
    bitRate: number;
}

const RESOLUTIONS: Resolution[] = [
    { width: 640, height: 360, bitRate: 400 },
    { width: 854, height: 480, bitRate: 500 },
    { width: 1280, height: 720, bitRate: 1000 },
    { width: 1920, height: 1080, bitRate: 2000 },
];

function transcodeResolution(
    inputPath: string,
    outputDir: string,
    resolution: Resolution
): Promise<string> {
    return new Promise((resolve, reject) => {
        const variantDir = path.join(outputDir, `${resolution.height}p`);
        fs.mkdirSync(variantDir, { recursive: true });

        const playlistPath = path.join(variantDir, "playlist.m3u8");

        ffmpeg(inputPath)
            .outputOptions([
                `-vf scale=w=${resolution.width}:h=${resolution.height}`,
                `-b:v ${resolution.bitRate}k`,
                "-codec:v h264_nvenc",
                "-preset p4",
                "-codec:a aac",
                "-hls_time 10",
                "-hls_playlist_type vod",
                `-hls_segment_filename ${variantDir}/segment%03d.ts`,
            ])
            .output(playlistPath)
            .on("start", (cmd) => {
                console.log(`[${resolution.height}p] Starting transcoding...`);
            })
            .on("progress", (progress) => {
                console.log(`[${resolution.height}p] Progress: ${Math.round(progress.percent ?? 0)}%`);
            })
            .on("end", () => {
                console.log(`[${resolution.height}p] Done!`);
                resolve(playlistPath);
            })
            .on("error", (err) => {
                console.error(`[${resolution.height}p] Error:`, err.message);
                reject(err);
            })
            .run();
    });
}

export async function transcodeVideo(
    videoId: string,
    inputPath: string
): Promise<string> {
    const outputDir = ensureDir(videoId);

    console.log(`Starting transcoding for video: ${videoId}`);
    console.log(`Input: ${inputPath}`);
    console.log(`Output: ${outputDir}`);

    // Transcode all resolutions sequentially
    const masterLines: string[] = ["#EXTM3U"];

    for (const resolution of RESOLUTIONS) {
        await transcodeResolution(inputPath, outputDir, resolution);

        const bandwidth = (resolution.bitRate + 128) * 1.25 * 1000;
        masterLines.push(
            `#EXT-X-STREAM-INF:BANDWIDTH=${Math.round(bandwidth)},RESOLUTION=${resolution.width}x${resolution.height}`
        );
        masterLines.push(`${resolution.height}p/playlist.m3u8`);
    }

    // Write master playlist
    const masterPath = path.join(outputDir, "master.m3u8");
    fs.writeFileSync(masterPath, masterLines.join("\n"));

    console.log(`Master playlist written: ${masterPath}`);

    return masterPath;
}