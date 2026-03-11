export interface FilterResult {
  filtered: string;
  hadSensitive: boolean;
}

export class PrivacyFilter {
  private patterns: RegExp[];
  private readonly builtInPatterns: RegExp[] = [
    /\b1[3-9]\d{9}\b/g,
    /\b\d{3}-\d{4}-\d{4}\b/g,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    /\bpassword\s*[:=]\s*\S+/gi,
    /\bapi[_-]?key\s*[:=]\s*['"]?\S+['"]?/gi,
    /\btoken\s*[:=]\s*['"]?\S+['"]?/gi,
    /\bsecret\s*[:=]\s*['"]?\S+['"]?/gi,
    /\b\d{13,19}\b/g,
    /\b\d{3}-\d{2}-\d{4}\b/g,
    /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
  ];

  constructor(customFilters: string[] = []) {
    this.patterns = [
      ...this.builtInPatterns,
      ...customFilters.map(f => {
        try {
          return new RegExp(f, 'gi');
        } catch {
          console.warn(`Invalid regex pattern: ${f}`);
          return null;
        }
      }).filter((p): p is RegExp => p !== null)
    ];
  }

  filter(text: string): FilterResult {
    let filtered = text;
    let hadSensitive = false;

    this.patterns.forEach(pattern => {
      if (pattern.test(filtered)) {
        hadSensitive = true;
        filtered = filtered.replace(pattern, '***');
      }
    });

    return { filtered, hadSensitive };
  }

  addPattern(pattern: string): void {
    try {
      this.patterns.push(new RegExp(pattern, 'gi'));
    } catch (error) {
      throw new Error(`Invalid regex pattern: ${pattern}`);
    }
  }

  removePattern(pattern: string): void {
    this.patterns = this.patterns.filter(p => p.source !== pattern);
  }
}
