import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { publishJob } from "@/lib/rabbitmq";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("video") as File;

    if (!file) {
      return NextResponse.json(
        { error: "No video file provided" },
        { status: 400 }
      );
    }

    const videoId = uuidv4();
    const extension = file.name.split(".").pop();
    const fileName = `${videoId}.${extension}`;

    const uploadDir = path.join(process.cwd(), "public", "uploads");
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = path.join(uploadDir, fileName);
    await writeFile(filePath, buffer);

    await publishJob({
      videoId,
      fileName,
      filePath,
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      videoId,
      message: "Video uploaded and queued for transcoding",
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}