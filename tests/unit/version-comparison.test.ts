/**
 * Comprehensive unit tests for version comparison logic
 * Tests compareVersions, isNewerVersion, and isValidSemver functions
 * Validates full semver 2.0.0 compliance
 */

import { compareVersions, isNewerVersion, isValidSemver } from '../../src/changelog';
import { WorkerError } from '../../src/types';
import { ErrorCode } from '../../src/types/models';

describe('Version Comparison Logic - Semver 2.0.0 Compliance', () => {
	describe('compareVersions - Core version precedence', () => {
		// Test cases from semver.org specification examples
		const precedenceTests = [
			// Basic version precedence
			['1.0.0', '2.0.0', -1],
			['2.0.0', '1.0.0', 1],
			['1.0.0', '1.1.0', -1],
			['1.1.0', '1.0.0', 1],
			['1.0.0', '1.0.1', -1],
			['1.0.1', '1.0.0', 1],
			
			// Pre-release precedence
			['1.0.0-alpha', '1.0.0', -1],
			['1.0.0', '1.0.0-alpha', 1],
			['1.0.0-alpha', '1.0.0-alpha.1', -1],
			['1.0.0-alpha.1', '1.0.0-alpha', 1],
			['1.0.0-alpha.1', '1.0.0-alpha.beta', -1],
			['1.0.0-alpha.beta', '1.0.0-alpha.1', 1],
			['1.0.0-alpha.beta', '1.0.0-beta', -1],
			['1.0.0-beta', '1.0.0-beta.2', -1],
			['1.0.0-beta.2', '1.0.0-beta.11', -1],
			['1.0.0-beta.11', '1.0.0-rc.1', -1],
			['1.0.0-rc.1', '1.0.0', -1],
			
			// Build metadata (should be ignored)
			['1.0.0+build', '1.0.0', 0],
			['1.0.0+build.1', '1.0.0+build.2', 0],
			['1.0.0-alpha+build.1', '1.0.0-alpha+build.2', 0],
			
			// Complex scenarios
			['1.0.0-alpha.1.2.3', '1.0.0-alpha.1.2.4', -1],
			['1.0.0-alpha.beta.gamma', '1.0.0-alpha.beta.delta', 1], // gamma > delta lexically
			['1.0.0-1.2.3', '1.0.0-1.2.4', -1],
			['1.0.0-alpha.0', '1.0.0-alpha.00', 0], // Numeric comparison, not string
		] as const;

		test.each(precedenceTests)(
			'compareVersions("%s", "%s") should return %i',
			(v1, v2, expected) => {
				expect(compareVersions(v1, v2)).toBe(expected);
			}
		);
	});

	describe('compareVersions - Numeric identifier precedence', () => {
		it('should compare numeric identifiers as numbers, not strings', () => {
			// 2 < 10 numerically, but "10" < "2" lexically
			expect(compareVersions('1.0.0-alpha.2', '1.0.0-alpha.10')).toBe(-1);
			expect(compareVersions('1.0.0-alpha.10', '1.0.0-alpha.2')).toBe(1);
			
			// Leading zeros should be handled correctly
			expect(compareVersions('1.0.0-alpha.01', '1.0.0-alpha.1')).toBe(0);
			expect(compareVersions('1.0.0-alpha.001', '1.0.0-alpha.1')).toBe(0);
		});

		it('should give numeric identifiers lower precedence than non-numeric', () => {
			expect(compareVersions('1.0.0-1', '1.0.0-alpha')).toBe(-1);
			expect(compareVersions('1.0.0-alpha', '1.0.0-1')).toBe(1);
			expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.beta')).toBe(-1);
			expect(compareVersions('1.0.0-alpha.beta', '1.0.0-alpha.1')).toBe(1);
		});
	});

	describe('compareVersions - Pre-release identifier comparison', () => {
		it('should handle empty pre-release identifiers correctly', () => {
			// These should be invalid according to semver, but testing error handling
			expect(() => compareVersions('1.0.0-', '1.0.0')).toThrow(WorkerError);
			expect(() => compareVersions('1.0.0-.alpha', '1.0.0')).toThrow(WorkerError);
		});

		it('should compare pre-release with different number of parts correctly', () => {
			// Fewer parts means lower precedence
			expect(compareVersions('1.0.0-alpha', '1.0.0-alpha.1')).toBe(-1);
			expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.1.2')).toBe(-1);
			expect(compareVersions('1.0.0-alpha.1.2', '1.0.0-alpha.1.2.3')).toBe(-1);
		});

		it('should handle pre-release identifiers with special characters', () => {
			// Semver allows alphanumeric and hyphen
			expect(compareVersions('1.0.0-alpha-1', '1.0.0-alpha-2')).toBe(-1);
			expect(compareVersions('1.0.0-alpha-beta', '1.0.0-alpha-gamma')).toBe(-1);
			expect(compareVersions('1.0.0-x.7.z.92', '1.0.0-x.7.z.93')).toBe(-1);
		});
	});

	describe('compareVersions - Edge cases and special scenarios', () => {
		it('should handle versions with large numbers correctly', () => {
			expect(compareVersions('1.0.0', '1.0.999999999')).toBe(-1);
			expect(compareVersions('999.999.999', '1000.0.0')).toBe(-1);
			expect(compareVersions('1.0.0-alpha.999999', '1.0.0-alpha.1000000')).toBe(-1);
		});

		it('should handle versions with multiple hyphens correctly', () => {
			expect(compareVersions('1.0.0-alpha-beta', '1.0.0-alpha-gamma')).toBe(-1);
			expect(compareVersions('1.0.0-alpha-1-2-3', '1.0.0-alpha-1-2-4')).toBe(-1);
		});

		it('should handle versions with multiple plus signs in build metadata', () => {
			// Only the first + starts build metadata
			expect(compareVersions('1.0.0+build+extra', '1.0.0+build+different')).toBe(0);
			expect(compareVersions('1.0.0+build+++++', '1.0.0')).toBe(0);
		});

		it('should be transitive', () => {
			// If a < b and b < c, then a < c
			const a = '1.0.0-alpha';
			const b = '1.0.0-beta';
			const c = '1.0.0';
			
			expect(compareVersions(a, b)).toBe(-1);
			expect(compareVersions(b, c)).toBe(-1);
			expect(compareVersions(a, c)).toBe(-1);
		});

		it('should be symmetric', () => {
			// If a < b, then b > a
			const versions = [
				['1.0.0', '2.0.0'],
				['1.0.0-alpha', '1.0.0'],
				['1.0.0-alpha.1', '1.0.0-alpha.2'],
			];
			
			versions.forEach(([a, b]) => {
				const result1 = compareVersions(a, b);
				const result2 = compareVersions(b, a);
				expect(result1).toBe(-result2);
			});
		});
	});

	describe('compareVersions - Error handling', () => {
		it('should throw WorkerError for completely invalid versions', () => {
			const invalidVersions = [
				'',
				'1',
				'1.2',
				'1.2.3.4',
				'v1.2.3',
				'1.2.3-',
				'1.2.3+',
				'1.2.3-+',
				'1.2.3--alpha',
				'1.2.3-alpha..beta',
				'not-a-version',
				'🚀',
				null,
				undefined,
				123,
				{},
				[],
			];

			invalidVersions.forEach(version => {
				expect(() => compareVersions(version as any, '1.0.0')).toThrow(WorkerError);
				expect(() => compareVersions('1.0.0', version as any)).toThrow(WorkerError);
			});
		});

		it('should include both versions in error message', () => {
			try {
				compareVersions('invalid', '1.2.3');
				fail('Should have thrown an error');
			} catch (error) {
				expect(error).toBeInstanceOf(WorkerError);
				const workerError = error as WorkerError;
				expect(workerError.code).toBe(ErrorCode.PARSE_ERROR);
				expect(workerError.message).toContain('invalid');
				expect(workerError.message).toContain('1.2.3');
			}
		});

		it('should handle versions with invalid characters', () => {
			const invalidChars = ['1.0.0-alpha!', '1.0.0-alpha@beta', '1.0.0-alpha#1'];
			invalidChars.forEach(version => {
				expect(() => compareVersions(version, '1.0.0')).toThrow(WorkerError);
			});
		});
	});

	describe('isValidSemver - Comprehensive validation', () => {
		describe('Valid semver formats', () => {
			const validVersions = [
				// Basic versions
				'0.0.0',
				'0.0.1',
				'0.1.0',
				'1.0.0',
				'1.2.3',
				'10.20.30',
				'99999.99999.99999',
				
				// Pre-release versions
				'1.0.0-0',
				'1.0.0-alpha',
				'1.0.0-alpha.1',
				'1.0.0-alpha.beta',
				'1.0.0-alpha.beta.gamma',
				'1.0.0-alpha-beta',
				'1.0.0-alpha-beta-gamma',
				'1.0.0-alpha.1.2.3.4.5.6.7.8.9.10',
				'1.0.0-rc.1',
				'1.0.0-x.7.z.92',
				'1.0.0-x-y-z.--',
				
				// Build metadata
				'1.0.0+build',
				'1.0.0+build.123',
				'1.0.0+build.123.abc',
				'1.0.0+20130313144700',
				'1.0.0+exp.sha.5114f85',
				'1.0.0+21AF26D3----117B344092BD',
				
				// Pre-release + build metadata
				'1.0.0-alpha+build',
				'1.0.0-alpha.1+build.123',
				'1.0.0-rc.1+build.123.abc-def',
			];

			test.each(validVersions)('should validate "%s" as valid', (version) => {
				expect(isValidSemver(version)).toBe(true);
			});
		});

		describe('Invalid semver formats', () => {
			const invalidVersions = [
				// Missing parts
				'',
				'1',
				'1.2',
				'1.2.3.4',
				'1.2.3.4.5',
				
				// Invalid characters
				'v1.2.3',
				'V1.2.3',
				'=1.2.3',
				'1.2.3 ',
				' 1.2.3',
				'1.2.3\n',
				'1.2.3\t',
				
				// Invalid format
				'1.2.3-',
				'1.2.3+',
				'1.2.3-+',
				'1.2.3-+build',
				'1.2.3--alpha',
				'1.2.3-alpha..beta',
				'1.2.3-alpha...beta',
				'1.2.3-.alpha',
				'1.2.3-alpha.',
				
				// Non-numeric version parts
				'a.b.c',
				'1.a.3',
				'1.2.c',
				'*.*.*.html',
				
				// Leading zeros (invalid in semver)
				'01.2.3',
				'1.02.3',
				'1.2.03',
				
				// Invalid pre-release
				'1.2.3-',
				'1.2.3-α', // Non-ASCII
				'1.2.3-😀', // Emoji
				
				// Invalid build metadata
				'1.2.3+',
				'1.2.3+α', // Non-ASCII
				'1.2.3+😀', // Emoji
				
				// Other invalid inputs
				null,
				undefined,
				123,
				{},
				[],
				true,
				false,
			];

			test.each(invalidVersions)('should validate %p as invalid', (version) => {
				expect(isValidSemver(version as any)).toBe(false);
			});
		});

		it('should handle versions with leading/trailing whitespace as invalid', () => {
			expect(isValidSemver(' 1.2.3')).toBe(false);
			expect(isValidSemver('1.2.3 ')).toBe(false);
			expect(isValidSemver(' 1.2.3 ')).toBe(false);
			expect(isValidSemver('\t1.2.3')).toBe(false);
			expect(isValidSemver('1.2.3\n')).toBe(false);
		});
	});

	describe('isNewerVersion - Convenience wrapper', () => {
		it('should correctly determine newer versions', () => {
			// Basic comparisons
			expect(isNewerVersion('2.0.0', '1.0.0')).toBe(true);
			expect(isNewerVersion('1.1.0', '1.0.0')).toBe(true);
			expect(isNewerVersion('1.0.1', '1.0.0')).toBe(true);
			
			// Pre-release comparisons
			expect(isNewerVersion('1.0.0', '1.0.0-alpha')).toBe(true);
			expect(isNewerVersion('1.0.0-beta', '1.0.0-alpha')).toBe(true);
			expect(isNewerVersion('1.0.0-alpha.2', '1.0.0-alpha.1')).toBe(true);
		});

		it('should correctly determine older versions', () => {
			expect(isNewerVersion('1.0.0', '2.0.0')).toBe(false);
			expect(isNewerVersion('1.0.0', '1.1.0')).toBe(false);
			expect(isNewerVersion('1.0.0', '1.0.1')).toBe(false);
			expect(isNewerVersion('1.0.0-alpha', '1.0.0')).toBe(false);
		});

		it('should return false for equal versions', () => {
			expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
			expect(isNewerVersion('1.0.0-alpha', '1.0.0-alpha')).toBe(false);
			expect(isNewerVersion('1.0.0+build', '1.0.0+build')).toBe(false);
			expect(isNewerVersion('1.0.0+build.1', '1.0.0+build.2')).toBe(false);
		});

		it('should handle complex version comparisons', () => {
			// From semver.org examples
			expect(isNewerVersion('1.0.0', '1.0.0-rc.1')).toBe(true);
			expect(isNewerVersion('1.0.0-rc.1', '1.0.0-beta.11')).toBe(true);
			expect(isNewerVersion('1.0.0-beta.11', '1.0.0-beta.2')).toBe(true);
			expect(isNewerVersion('1.0.0-beta.2', '1.0.0-beta')).toBe(true);
			expect(isNewerVersion('1.0.0-beta', '1.0.0-alpha.beta')).toBe(true);
			expect(isNewerVersion('1.0.0-alpha.beta', '1.0.0-alpha.1')).toBe(true);
			expect(isNewerVersion('1.0.0-alpha.1', '1.0.0-alpha')).toBe(true);
		});

		it('should propagate errors from compareVersions', () => {
			expect(() => isNewerVersion('invalid', '1.0.0')).toThrow(WorkerError);
			expect(() => isNewerVersion('1.0.0', '')).toThrow(WorkerError);
			expect(() => isNewerVersion(null as any, '1.0.0')).toThrow(WorkerError);
		});
	});

	describe('Semver 2.0.0 specification examples', () => {
		// Test the exact precedence example from semver.org
		const semverPrecedenceExample = [
			'1.0.0-alpha',
			'1.0.0-alpha.1',
			'1.0.0-alpha.beta',
			'1.0.0-beta',
			'1.0.0-beta.2',
			'1.0.0-beta.11',
			'1.0.0-rc.1',
			'1.0.0',
		];

		it('should follow semver.org precedence example exactly', () => {
			for (let i = 0; i < semverPrecedenceExample.length - 1; i++) {
				const current = semverPrecedenceExample[i];
				const next = semverPrecedenceExample[i + 1];
				
				expect(compareVersions(current, next)).toBe(-1);
				expect(compareVersions(next, current)).toBe(1);
				expect(isNewerVersion(next, current)).toBe(true);
				expect(isNewerVersion(current, next)).toBe(false);
			}
		});

		it('should be transitive across the entire precedence chain', () => {
			for (let i = 0; i < semverPrecedenceExample.length; i++) {
				for (let j = i + 1; j < semverPrecedenceExample.length; j++) {
					const lower = semverPrecedenceExample[i];
					const higher = semverPrecedenceExample[j];
					
					expect(compareVersions(lower, higher)).toBe(-1);
					expect(isNewerVersion(higher, lower)).toBe(true);
				}
			}
		});
	});

	describe('Performance and stress tests', () => {
		it('should handle comparison of many versions efficiently', () => {
			const versions = [];
			// Generate 100 random valid versions
			for (let major = 0; major < 10; major++) {
				for (let minor = 0; minor < 10; minor++) {
					versions.push(`${major}.${minor}.0`);
				}
			}

			// Sort using compareVersions
			const sorted = [...versions].sort((a, b) => compareVersions(a, b));
			
			// Verify sorted order
			for (let i = 0; i < sorted.length - 1; i++) {
				expect(compareVersions(sorted[i], sorted[i + 1])).toBeLessThanOrEqual(0);
			}
		});

		it('should handle very long pre-release identifiers', () => {
			const longPrerelease = 'alpha.' + Array(50).fill('beta').join('.');
			const version1 = `1.0.0-${longPrerelease}.1`;
			const version2 = `1.0.0-${longPrerelease}.2`;
			
			expect(compareVersions(version1, version2)).toBe(-1);
			expect(isNewerVersion(version2, version1)).toBe(true);
		});
	});
});