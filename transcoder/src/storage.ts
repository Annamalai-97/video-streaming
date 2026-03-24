import fs from "fs";
import path from "path";

export function saveFile(buffer: Buffer, relativePath: string): string {
  const basePath = process.env.LOCAL_STORAGE_PATH || "../nextjs-app/public/videos";
  const fullPath = path.join(process.cwd(), basePath, relativePath);

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);

  return fullPath;
}

export function ensureDir(relativePath: string): string {
  const basePath = process.env.LOCAL_STORAGE_PATH || "../nextjs-app/public/videos";
  const fullPath = path.join(process.cwd(), basePath, relativePath);

  fs.mkdirSync(fullPath, { recursive: true });

  return fullPath;
}