/**
 * Changelog fetching and parsing module
 * Handles retrieving and parsing the Claude Code changelog from GitHub
 */

export interface Version {
  version: string;
  date: string;
  changes: string[];
}

export interface ChangelogData {
  versions: Version[];
  latestVersion: Version | null;
}

/**
 * Fetches the changelog from GitHub
 * @param url - The URL to fetch the changelog from
 * @returns The raw markdown content
 */
export async function fetchChangelog(url: string): Promise<string> {
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to fetch changelog: ${response.status} ${response.statusText}`);
  }
  
  const content = await response.text();
  
  // Check file size limit (1MB)
  if (content.length > 1024 * 1024) {
    throw new Error('Changelog file exceeds 1MB limit');
  }
  
  return content;
}

/**
 * Parses the changelog markdown to extract version information
 * @param markdown - The raw markdown content
 * @returns Parsed changelog data
 */
export function parseChangelog(markdown: string): ChangelogData {
  const versions: Version[] = [];
  
  // Regex to match version headers like ## [1.2.3] - 2024-01-15
  const versionRegex = /^##\s*\[?v?(\d+\.\d+\.\d+)\]?\s*-?\s*(\d{4}-\d{2}-\d{2})/gm;
  
  const lines = markdown.split('\n');
  let currentVersion: Version | null = null;
  let currentChanges: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const versionMatch = line.match(/^##\s*\[?v?(\d+\.\d+\.\d+)\]?\s*-?\s*(\d{4}-\d{2}-\d{2})/);
    
    if (versionMatch) {
      // Save previous version if exists
      if (currentVersion) {
        currentVersion.changes = currentChanges;
        versions.push(currentVersion);
      }
      
      // Start new version
      currentVersion = {
        version: versionMatch[1],
        date: versionMatch[2],
        changes: []
      };
      currentChanges = [];
    } else if (currentVersion && line.trim()) {
      // Collect changes for current version
      if (line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ')) {
        currentChanges.push(line.trim());
      }
    }
  }
  
  // Don't forget the last version
  if (currentVersion) {
    currentVersion.changes = currentChanges;
    versions.push(currentVersion);
  }
  
  return {
    versions,
    latestVersion: versions.length > 0 ? versions[0] : null
  };
}

/**
 * Compares two semantic versions
 * @param v1 - First version
 * @param v2 - Second version
 * @returns 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }
  
  return 0;
}