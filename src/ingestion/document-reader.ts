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
  const pdfParseModule = await import('pdf-parse');
  const pdfParse = (pdfParseModule as any).default || pdfParseModule;
  const buffer = fs.readFileSync(filePath);
  const pdf = await pdfParse(buffer);

  // pdf-parse returns all text concatenated; split by page breaks if present
  // The numpages property gives us the page count
  const totalPages = pdf.numpages;

  // pdf-parse doesn't give per-page text easily, so treat the whole document as chunks
  // Split by form feeds (page breaks) if present, otherwise treat as single chunk
  const pageTexts = pdf.text.split('\f').filter((t: string) => t.trim().length > 0);

  if (pageTexts.length === 0) {
    return [{
      pageNumber: 1,
      totalPages: 1,
      type: 'text',
      content: pdf.text,
    }];
  }

  return pageTexts.map((text: string, i: number) => ({
    pageNumber: i + 1,
    totalPages: pageTexts.length,
    type: 'text' as const,
    content: text.trim(),
  }));
}
