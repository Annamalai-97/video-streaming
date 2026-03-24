import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const filePath = searchParams.get("path");

    if (!filePath) {
        return NextResponse.json({ error: "No path provided" }, { status: 400 });
    }

    const safePath = path.join(process.cwd(), "public", "videos", filePath);
    // console.log("Looking for file at:", safePath);
    // console.log("File exists:", fs.existsSync(safePath));

    if (!fs.existsSync(safePath)) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    const ext = path.extname(safePath);
    const contentType =
        ext === ".m3u8" ? "application/vnd.apple.mpegurl" : "video/MP2T";

    let fileBuffer = fs.readFileSync(safePath);

    if (ext === ".m3u8") {
        let content = fileBuffer.toString("utf-8");
        // Rewrite relative paths to full API paths
        const videoId = filePath.split("/")[0];
        content = content.replace(
            /^(\d+p\/playlist\.m3u8)$/gm,
            `/api/stream?path=${videoId}/$1`
        );
        content = content.replace(
            /^(segment\d+\.ts)$/gm,
            (match) => `/api/stream?path=${filePath.replace("playlist.m3u8", "")}${match}`
        );
        fileBuffer = Buffer.from(content);
    }

    return new NextResponse(fileBuffer, {
        headers: {
            "Content-Type": contentType,
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
        },
    });
}
