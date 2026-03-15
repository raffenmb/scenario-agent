import { loadProtocolIndex, readProtocol, discoverSets } from './loader';
import path from 'path';

const PROTOCOL_DIR = path.resolve(__dirname, '../../protocol_docs');

describe('discoverSets', () => {
  it('discovers the MATC set directory', () => {
    const sets = discoverSets(PROTOCOL_DIR);
    expect(sets).toContain('MATC');
  });

  it('ignores files in the root (only returns directories)', () => {
    const sets = discoverSets(PROTOCOL_DIR);
    for (const set of sets) {
      expect(set).not.toContain('.');
    }
  });
});

describe('loadProtocolIndex', () => {
  it('loads protocols from specified sets', () => {
    const index = loadProtocolIndex(PROTOCOL_DIR, ['MATC']);
    expect(index.length).toBeGreaterThanOrEqual(60);
    for (const entry of index) {
      expect(entry.slug).toBeTruthy();
      expect(entry.set).toBe('MATC');
      expect(entry.section).toBeTruthy();
      expect(entry.description).toBeTruthy();
    }
  });

  it('includes known protocol slugs', () => {
    const index = loadProtocolIndex(PROTOCOL_DIR, ['MATC']);
    const slugs = index.map((e) => e.slug);
    expect(slugs).toContain('medical-hypoglycemia');
    expect(slugs).toContain('cv-stroke-tia');
    expect(slugs).toContain('trauma-extremity-hemorrhage');
  });
});

describe('readProtocol', () => {
  it('returns full file content for a valid slug', () => {
    const index = loadProtocolIndex(PROTOCOL_DIR, ['MATC']);
    const content = readProtocol('medical-hypoglycemia', index);
    expect(content).toContain('Hypoglycemia');
  });

  it('returns null for an unknown slug', () => {
    const index = loadProtocolIndex(PROTOCOL_DIR, ['MATC']);
    const content = readProtocol('nonexistent-protocol', index);
    expect(content).toBeNull();
  });
});
