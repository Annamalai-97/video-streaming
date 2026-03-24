import fs from "fs";
import path from "path";

export async function saveLocally(
  buffer: Buffer,
  relativePath: string
): Promise<string> {
  const basePath = process.env.LOCAL_STORAGE_PATH || "./public/videos";
  const fullPath = path.join(process.cwd(), basePath, relativePath);

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);

  return fullPath;
}

export async function readLocalFile(relativePath: string): Promise<Buffer> {
  const basePath = process.env.LOCAL_STORAGE_PATH || "./public/videos";
  const fullPath = path.join(process.cwd(), basePath, relativePath);
  return fs.readFileSync(fullPath);
}

export function localFileExists(relativePath: string): boolean {
  const basePath = process.env.LOCAL_STORAGE_PATH || "./public/videos";
  const fullPath = path.join(process.cwd(), basePath, relativePath);
  return fs.existsSync(fullPath);
}