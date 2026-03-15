import fs from 'fs';
import path from 'path';
import { DocumentChunk } from './types';

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.md', '.png', '.jpg', '.jpeg']);

export async function readDocument(filePath: string): Promise<DocumentChunk[]> {
  const ext = path.extname(filePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file format: ${ext}`);
  }

  switch (ext) {
    case '.txt':
    case '.md':
      return readTextFile(filePath);
    case '.png':
    case '.jpg':
    case '.jpeg':
      return readImageFile(filePath);
    case '.docx':
      return readDocxFile(filePath);
    case '.pdf':
      return readPdfFile(filePath);
    default:
      throw new Error(`Unsupported file format: ${ext}`);
  }
}

function readTextFile(filePath: string): DocumentChunk[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const sections = splitByHeadings(raw);

  return sections.map((content, i) => ({
    pageNumber: i + 1,
    totalPages: sections.length,
    type: 'text' as const,
    content,
  }));
}

function splitByHeadings(text: string): string[] {
  // Split on top-level markdown headings (# Title)
  const parts = text.split(/(?=^# )/m).filter((s) => s.trim().length > 0);
  if (parts.length === 0) {
    return [text];
  }
  return parts;
}

function readImageFile(filePath: string): DocumentChunk[] {
  const data = fs.readFileSync(filePath);
  const base64 = data.toString('base64');
  const ext = path.extname(filePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';

  return [
    {
      pageNumber: 1,
      totalPages: 1,
      type: 'vision',
      content: base64,
      mimeType,
    },
  ];
}

async function readDocxFile(filePath: string): Promise<DocumentChunk[]> {
  const mammoth = await import('mammoth');
  // convertToMarkdown exists at runtime but is missing from some type definitions
  const result = await (mammoth as any).convertToMarkdown({ path: filePath });
  const sections = splitByHeadings(result.value);

  return sections.map((content, i) => ({
    pageNumber: i + 1,
    totalPages: sections.length,
    type: 'text' as const,
    content,
  }));
}

async function readPdfFile(filePath: string): Promise<DocumentChunk[]> {
  const pdfjs = await import('pdfjs-dist');
  // Suppress worker warnings in Node.js environment
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = '';
  }
  const data = new Uint8Array(fs.readFileSync(filePath));
  const doc = await pdfjs.getDocument({ data }).promise;
  const totalPages = doc.numPages;
  const chunks: DocumentChunk[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const text = textContent.items
      .map((item: any) => item.str)
      .join(' ');

    chunks.push({
      pageNumber: i,
      totalPages,
      type: 'text',
      content: text,
    });
  }

  return chunks;
}
