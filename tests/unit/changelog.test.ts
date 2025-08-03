/**
 * Unit tests for changelog parser
 * Tests the parseChangelog function with various changelog formats and edge cases
 */

import { parseChangelog, isValidSemver, compareVersions, isNewerVersion } from '../../src/changelog';
import { ErrorCode } from '../../src/types/models';
import { WorkerError } from '../../src/types';

describe('parseChangelog', () => {
	describe('Valid changelog formats', () => {
		it('should parse standard semver format (## X.X.X)', () => {
			const markdown = `# Changelog

## 1.2.3
- Added new feature
- Fixed bug

## 1.2.2
- Security patch
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(2);
			expect(result.latestVersion?.version).toBe('1.2.3');
			expect(result.versions[0]).toEqual({
				version: '1.2.3',
				date: 'Unknown',
				changes: ['- Added new feature', '- Fixed bug']
			});
		});

		it('should parse format with v prefix (## vX.X.X)', () => {
			const markdown = `# Changelog

## v2.0.0
- Major release
- Breaking changes

## v1.9.0
- Minor update
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(2);
			expect(result.latestVersion?.version).toBe('2.0.0');
			expect(result.versions[0].version).toBe('2.0.0');
		});

		it('should parse format with brackets and date (## [X.X.X] - YYYY-MM-DD)', () => {
			const markdown = `# Changelog

## [0.5.0] - 2024-12-31
- New Year release
- Performance improvements

## [0.4.9] - 2024-12-25
- Holiday patch
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(2);
			expect(result.latestVersion?.version).toBe('0.5.0');
			expect(result.latestVersion?.date).toBe('2024-12-31');
			expect(result.versions[1].date).toBe('2024-12-25');
		});

		it('should parse format with v prefix and date (## vX.X.X - YYYY-MM-DD)', () => {
			const markdown = `# Changelog

## v3.1.4 - 2025-01-15
- Bug fixes
- Documentation updates

## v3.1.3 - 2025-01-10
- Hotfix
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(2);
			expect(result.latestVersion?.version).toBe('3.1.4');
			expect(result.latestVersion?.date).toBe('2025-01-15');
		});

		it('should parse pre-release versions', () => {
			const markdown = `# Changelog

## 2.0.0-beta.1
- Beta release
- New experimental features

## 2.0.0-alpha.3
- Alpha release
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(2);
			expect(result.latestVersion?.version).toBe('2.0.0-beta.1');
			expect(result.versions[0].version).toBe('2.0.0-beta.1');
			expect(result.versions[1].version).toBe('2.0.0-alpha.3');
		});

		it('should parse versions with build metadata', () => {
			const markdown = `# Changelog

## 1.0.0+build.123
- Release with build metadata

## 1.0.0-rc.1+build.456
- Release candidate with build
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(2);
			expect(result.latestVersion?.version).toBe('1.0.0+build.123');
		});

		it('should handle various bullet formats', () => {
			const markdown = `# Changelog

## 1.0.0
- Dash bullet
* Asterisk bullet
• Unicode bullet
  - Nested dash
  * Nested asterisk
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions[0].changes).toHaveLength(5);
			expect(result.versions[0].changes).toContain('- Dash bullet');
			expect(result.versions[0].changes).toContain('* Asterisk bullet');
			expect(result.versions[0].changes).toContain('• Unicode bullet');
		});

		it('should include subsection headers', () => {
			const markdown = `# Changelog

## 2.0.0
### Added
- New feature X
- New feature Y

### Fixed
- Bug A
- Bug B

### Changed
- Updated dependency
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions[0].changes).toContain('### Added');
			expect(result.versions[0].changes).toContain('### Fixed');
			expect(result.versions[0].changes).toContain('### Changed');
			expect(result.versions[0].changes).toHaveLength(8);
		});

		it('should handle mixed format changelog', () => {
			const markdown = `# My Project Changelog

Some introduction text here.

## [Unreleased]
- Work in progress

## v1.5.0 - 2025-01-20
- Feature A
- Feature B

## 1.4.0
- Feature C

## [1.3.0] - 2024-12-01
- Feature D
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(3); // Unreleased should be skipped
			expect(result.latestVersion?.version).toBe('1.5.0');
			expect(result.versions.map(v => v.version)).toEqual(['1.5.0', '1.4.0', '1.3.0']);
		});

		it('should handle Claude Code specific format', () => {
			const markdown = `# CHANGELOG

## 0.5.3

**Improvements**:
- Added support for multiple directories
- Improved error messages

**Bug fixes**:
- Fixed crash on startup
- Resolved memory leak

## 0.5.2

**Bug fixes**:
- Fixed authentication issue
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(2);
			expect(result.latestVersion?.version).toBe('0.5.3');
			expect(result.versions[0].changes).toHaveLength(4);
		});
	});

	describe('Edge cases', () => {
		it('should throw error for empty markdown', () => {
			expect(() => parseChangelog('')).toThrow(WorkerError);
			expect(() => parseChangelog('')).toThrow('Invalid markdown content provided');
		});

		it('should throw error for null/undefined input', () => {
			expect(() => parseChangelog(null as any)).toThrow(WorkerError);
			expect(() => parseChangelog(undefined as any)).toThrow(WorkerError);
		});

		it('should throw error for non-string input', () => {
			expect(() => parseChangelog(123 as any)).toThrow(WorkerError);
			expect(() => parseChangelog({} as any)).toThrow(WorkerError);
		});

		it('should throw error for changelog without versions', () => {
			const markdown = `# Changelog

This is a changelog without any version entries.

Just some random text.
`;
			expect(() => parseChangelog(markdown)).toThrow(WorkerError);
			expect(() => parseChangelog(markdown)).toThrow('No valid version entries found');
		});

		it('should handle malformed version headers gracefully', () => {
			const markdown = `# Changelog

## Not a version
- Some text

## 1.0.0
- Valid version

## Also not a version v1.2
- More text
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(1);
			expect(result.latestVersion?.version).toBe('1.0.0');
		});

		it('should handle version without changes', () => {
			const markdown = `# Changelog

## 2.0.0
- Has changes

## 1.9.0

## 1.8.0
- Also has changes
`;
			const result = parseChangelog(markdown);
			
			// Version 1.9.0 should be skipped as it has no changes
			expect(result.versions).toHaveLength(2);
			expect(result.versions.map(v => v.version)).toEqual(['2.0.0', '1.8.0']);
		});

		it('should handle very long version strings', () => {
			const markdown = `# Changelog

## 1.2.3-alpha.beta.gamma.delta.epsilon.zeta.eta.theta
- Pre-release with many identifiers

## 1.2.3-beta.1+build.2024.01.15.commit.abc123def456
- Complex version with build metadata
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(2);
			expect(result.versions[0].version).toBe('1.2.3-alpha.beta.gamma.delta.epsilon.zeta.eta.theta');
			expect(result.versions[1].version).toBe('1.2.3-beta.1+build.2024.01.15.commit.abc123def456');
		});

		it('should handle changelog with only one version', () => {
			const markdown = `# Changelog

## 1.0.0
- Initial release
- First version
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(1);
			expect(result.latestVersion?.version).toBe('1.0.0');
			expect(result.versions[0].changes).toHaveLength(2);
		});

		it('should handle special characters in change descriptions', () => {
			const markdown = `# Changelog

## 1.0.0
- Fixed issue with \`code blocks\`
- Updated **bold** and *italic* text
- Added support for ~strikethrough~
- Improved [links](https://example.com)
- Enhanced "quotes" and 'apostrophes'
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions[0].changes).toHaveLength(5);
			expect(result.versions[0].changes[0]).toContain('`code blocks`');
			expect(result.versions[0].changes[1]).toContain('**bold**');
		});

		it('should preserve error details when parsing fails', () => {
			const invalidInput = 123;
			try {
				parseChangelog(invalidInput as any);
				fail('Should have thrown an error');
			} catch (error) {
				expect(error).toBeInstanceOf(WorkerError);
				expect((error as WorkerError).code).toBe(ErrorCode.PARSE_ERROR);
			}
		});

		it('should handle changelog with excessive whitespace', () => {
			const markdown = `# Changelog


## 1.0.0
   - Extra spaces before bullet
- Normal bullet
	- Tab before bullet


## 0.9.0
- Previous version
`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(2);
			expect(result.versions[0].changes).toHaveLength(3);
		});

		it('should handle Windows-style line endings', () => {
			const markdown = `# Changelog\r\n\r\n## 1.0.0\r\n- Windows line ending\r\n- Another change\r\n`;
			const result = parseChangelog(markdown);
			
			expect(result.versions).toHaveLength(1);
			expect(result.latestVersion?.version).toBe('1.0.0');
			expect(result.versions[0].changes).toHaveLength(2);
		});
	});

	describe('Multiple date formats', () => {
		it('should handle ISO date format (YYYY-MM-DD)', () => {
			const markdown = `## [1.0.0] - 2025-01-15\n- Change`;
			const result = parseChangelog(markdown);
			expect(result.latestVersion?.date).toBe('2025-01-15');
		});

		it('should handle date without brackets', () => {
			const markdown = `## 1.0.0 - 2025-01-15\n- Change`;
			const result = parseChangelog(markdown);
			expect(result.latestVersion?.date).toBe('2025-01-15');
		});

		it('should handle missing date gracefully', () => {
			const markdown = `## 1.0.0\n- Change`;
			const result = parseChangelog(markdown);
			expect(result.latestVersion?.date).toBe('Unknown');
		});
	});
});

describe('isValidSemver', () => {
	describe('Valid versions', () => {
		const validVersions = [
			'0.0.0',
			'1.2.3',
			'10.20.30',
			'1.0.0-alpha',
			'1.0.0-alpha.1',
			'1.0.0-alpha.beta',
			'1.0.0-beta.2',
			'1.0.0-beta.11',
			'1.0.0-rc.1',
			'1.0.0+build',
			'1.0.0+build.123',
			'1.0.0-alpha+build',
			'1.0.0-alpha.1+build.123',
			'2.0.0-rc.1+build.123.abc',
		];

		validVersions.forEach(version => {
			it(`should validate "${version}" as valid`, () => {
				expect(isValidSemver(version)).toBe(true);
			});
		});
	});

	describe('Invalid versions', () => {
		const invalidVersions = [
			'',
			'1',
			'1.2',
			'1.2.3.4',
			'v1.2.3',
			'1.2.3-',
			'1.2.3+',
			'1.2.3-+',
			'1.2.3-+build',
			'a.b.c',
			'1.2.a',
			'1.a.3',
			'a.2.3',
			' 1.2.3',
			'1.2.3 ',
			'1.2.3\n',
		];

		invalidVersions.forEach(version => {
			it(`should validate "${version}" as invalid`, () => {
				expect(isValidSemver(version)).toBe(false);
			});
		});
	});
});

describe('compareVersions', () => {
	describe('Basic version comparison', () => {
		it('should compare major versions correctly', () => {
			expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
			expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
			expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
		});

		it('should compare minor versions correctly', () => {
			expect(compareVersions('1.2.0', '1.1.0')).toBe(1);
			expect(compareVersions('1.1.0', '1.2.0')).toBe(-1);
			expect(compareVersions('1.1.0', '1.1.0')).toBe(0);
		});

		it('should compare patch versions correctly', () => {
			expect(compareVersions('1.1.2', '1.1.1')).toBe(1);
			expect(compareVersions('1.1.1', '1.1.2')).toBe(-1);
			expect(compareVersions('1.1.1', '1.1.1')).toBe(0);
		});
	});

	describe('Pre-release version comparison', () => {
		it('should treat release version as greater than pre-release', () => {
			expect(compareVersions('1.0.0', '1.0.0-alpha')).toBe(1);
			expect(compareVersions('1.0.0-alpha', '1.0.0')).toBe(-1);
		});

		it('should compare pre-release versions alphabetically', () => {
			expect(compareVersions('1.0.0-beta', '1.0.0-alpha')).toBe(1);
			expect(compareVersions('1.0.0-alpha', '1.0.0-beta')).toBe(-1);
			expect(compareVersions('1.0.0-alpha', '1.0.0-alpha')).toBe(0);
		});

		it('should compare numeric pre-release identifiers numerically', () => {
			expect(compareVersions('1.0.0-alpha.2', '1.0.0-alpha.1')).toBe(1);
			expect(compareVersions('1.0.0-alpha.10', '1.0.0-alpha.2')).toBe(1);
			expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.10')).toBe(-1);
		});

		it('should handle mixed numeric and non-numeric identifiers', () => {
			expect(compareVersions('1.0.0-alpha.beta', '1.0.0-alpha.1')).toBe(1);
			expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBe(-1);
		});

		it('should handle pre-release with multiple parts', () => {
			expect(compareVersions('1.0.0-alpha.1.2', '1.0.0-alpha.1')).toBe(1);
			expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.1.2')).toBe(-1);
		});
	});

	describe('Build metadata comparison', () => {
		it('should ignore build metadata in comparison', () => {
			expect(compareVersions('1.0.0+build.123', '1.0.0+build.456')).toBe(0);
			expect(compareVersions('1.0.0+build', '1.0.0')).toBe(0);
			expect(compareVersions('1.0.0', '1.0.0+build')).toBe(0);
		});

		it('should ignore build metadata with pre-release versions', () => {
			expect(compareVersions('1.0.0-alpha+build.1', '1.0.0-alpha+build.2')).toBe(0);
			expect(compareVersions('1.0.0-alpha+build', '1.0.0-alpha')).toBe(0);
		});
	});

	describe('Error handling', () => {
		it('should throw error for invalid version formats', () => {
			expect(() => compareVersions('1.2', '1.2.3')).toThrow(WorkerError);
			expect(() => compareVersions('1.2.3', 'invalid')).toThrow(WorkerError);
			expect(() => compareVersions('', '1.2.3')).toThrow(WorkerError);
		});

		it('should include version details in error message', () => {
			try {
				compareVersions('1.2', '1.2.3');
				fail('Should have thrown an error');
			} catch (error) {
				expect(error).toBeInstanceOf(WorkerError);
				expect((error as WorkerError).message).toContain('1.2');
				expect((error as WorkerError).message).toContain('1.2.3');
			}
		});
	});
});

describe('isNewerVersion', () => {
	it('should return true when first version is newer', () => {
		expect(isNewerVersion('2.0.0', '1.0.0')).toBe(true);
		expect(isNewerVersion('1.1.0', '1.0.0')).toBe(true);
		expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true);
	});

	it('should return false when first version is older', () => {
		expect(isNewerVersion('1.0.0', '2.0.0')).toBe(false);
		expect(isNewerVersion('1.0.0', '1.1.0')).toBe(false);
		expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false);
	});

	it('should return false when versions are equal', () => {
		expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
		expect(isNewerVersion('1.0.0-alpha', '1.0.0-alpha')).toBe(false);
		expect(isNewerVersion('1.0.0+build', '1.0.0+build')).toBe(false);
	});

	it('should handle pre-release versions correctly', () => {
		expect(isNewerVersion('1.0.0', '1.0.0-alpha')).toBe(true);
		expect(isNewerVersion('1.0.0-beta', '1.0.0-alpha')).toBe(true);
		expect(isNewerVersion('1.0.0-alpha', '1.0.0')).toBe(false);
	});

	it('should throw error for invalid versions', () => {
		expect(() => isNewerVersion('invalid', '1.0.0')).toThrow(WorkerError);
		expect(() => isNewerVersion('1.0.0', 'invalid')).toThrow(WorkerError);
	});
});