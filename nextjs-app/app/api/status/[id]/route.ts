import { NextRequest, NextResponse } from "next/server";
import { localFileExists } from "@/lib/storage";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const masterExists = localFileExists(`${id}/master.m3u8`);

  if (masterExists) {
    return NextResponse.json({ status: "COMPLETED", videoId: id });
  }

  return NextResponse.json({ status: "PROCESSING", videoId: id });
} 