import * as fs from 'fs';
import * as path from 'path';

/** The folders the person added, in the order they added them. Nothing is discovered. */
export class ProjectStore {
  private folders: string[];

  constructor(private readonly file: string) {
    this.folders = this.read();
  }

  list(): string[] {
    return [...this.folders];
  }

  add(folder: string): void {
    const resolved = path.resolve(folder);
    if (this.folders.includes(resolved)) return;
    this.folders.push(resolved);
    this.write();
  }

  remove(folder: string): void {
    this.folders = this.folders.filter((f) => f !== folder);
    this.write();
  }

  private read(): string[] {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, 'utf-8')) as { projects?: unknown };
      return Array.isArray(parsed.projects) ? parsed.projects.filter((p): p is string => typeof p === 'string') : [];
    } catch {
      return [];
    }
  }

  private write(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify({ projects: this.folders }, null, 2)}\n`, 'utf-8');
  }
}
