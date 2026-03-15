import path from 'path';
import { readDocument } from './document-reader';

const FIXTURES = path.resolve(__dirname, '../../test-fixtures/ingestion');

describe('document-reader', () => {
  describe('TXT files', () => {
    it('splits text files into chunks by headings', async () => {
      const chunks = await readDocument(path.join(FIXTURES, 'sample.txt'));
      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].type).toBe('text');
      expect(chunks[0].pageNumber).toBe(1);
      expect(chunks[0].totalPages).toBe(chunks.length);
    });
  });

  describe('MD files', () => {
    it('reads markdown files as text chunks', async () => {
      const chunks = await readDocument(path.join(FIXTURES, 'sample.md'));
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].type).toBe('text');
      expect(chunks[0].content).toContain('Pain Management');
    });
  });

  describe('unsupported formats', () => {
    it('throws for unsupported file extensions', async () => {
      await expect(readDocument('/fake/file.xyz')).rejects.toThrow('Unsupported');
    });
  });
});
