import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

interface ArchivalConfig {
  retentionDays: number;
  compression: boolean;
  archivalDir: string;
}

interface SessionTranscript {
  sessionId: string;
  startedAt: Date;
  endedAt: Date;
  messages: TranscriptMessage[];
  summary?: string;
}

interface TranscriptMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export class ArchivalMemoryStorage {
  private config: ArchivalConfig;

  constructor(config: ArchivalConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    const transcriptsDir = path.join(this.config.archivalDir, 'transcripts');
    await fs.mkdir(transcriptsDir, { recursive: true });
  }

  async archive(transcript: SessionTranscript): Promise<string> {
    const filename = this.generateFilename(transcript.startedAt);
    const filepath = path.join(this.config.archivalDir, 'transcripts', filename);

    const data = JSON.stringify(transcript);

    if (this.config.compression) {
      const compressed = await gzip(Buffer.from(data));
      await fs.writeFile(filepath, compressed);
    } else {
      await fs.writeFile(filepath, data, 'utf-8');
    }

    return filename;
  }

  async retrieve(filename: string): Promise<SessionTranscript | null> {
    const filepath = path.join(this.config.archivalDir, 'transcripts', filename);

    try {
      const content = await fs.readFile(filepath);

      let data: string;
      if (this.config.compression && filename.endsWith('.gz')) {
        const decompressed = await gunzip(content);
        data = decompressed.toString('utf-8');
      } else {
        data = content.toString('utf-8');
      }

      const parsed = JSON.parse(data);
      return {
        ...parsed,
        startedAt: new Date(parsed.startedAt),
        endedAt: new Date(parsed.endedAt),
        messages: parsed.messages.map((m: Record<string, unknown>) => ({
          ...m,
          timestamp: new Date(m.timestamp as string)
        }))
      };
    } catch {
      return null;
    }
  }

  async search(query: string, limit: number = 10): Promise<SearchResult[]> {
    const files = await this.listArchives();
    const results: SearchResult[] = [];

    for (const file of files) {
      if (results.length >= limit) break;

      const transcript = await this.retrieve(file);
      if (!transcript) continue;

      for (const msg of transcript.messages) {
        if (msg.content.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            filename: file,
            sessionId: transcript.sessionId,
            match: msg.content,
            timestamp: msg.timestamp
          });
          break; // One match per file
        }
      }
    }

    return results.slice(0, limit);
  }

  async listArchives(): Promise<string[]> {
    const transcriptsDir = path.join(this.config.archivalDir, 'transcripts');
    try {
      const files = await fs.readdir(transcriptsDir);
      return files.filter(f => f.endsWith('.jsonl.gz') || f.endsWith('.jsonl'))
                  .sort()
                  .reverse(); // Most recent first
    } catch {
      return [];
    }
  }

  async cleanup(): Promise<number> {
    const cutoff = Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000;
    const files = await this.listArchives();
    let deleted = 0;

    for (const file of files) {
      const dateStr = file.split('.')[0]; // YYYY-MM-DD-HH-MM
      const fileDate = this.parseFilename(dateStr);

      if (fileDate && fileDate.getTime() < cutoff) {
        await fs.unlink(path.join(this.config.archivalDir, 'transcripts', file));
        deleted++;
      }
    }

    return deleted;
  }

  private generateFilename(date: Date): string {
    const d = date.toISOString();
    const formatted = d.slice(0, 16).replace('T', '-').replace(':', '-');
    return this.config.compression ? `${formatted}.jsonl.gz` : `${formatted}.jsonl`;
  }

  private parseFilename(str: string): Date | null {
    // YYYY-MM-DD-HH-MM -> Date
    const match = str.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
    if (!match) return null;
    return new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00Z`);
  }
}

interface SearchResult {
  filename: string;
  sessionId: string;
  match: string;
  timestamp: Date;
}

export type { SessionTranscript, TranscriptMessage, SearchResult };
