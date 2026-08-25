import { describe, expect, it } from 'vitest';
import { SchemaValidationError } from '../../src/errors/SchemaValidationError.js';

describe('SchemaValidationError', () => {
	it('includes relation context in its message', () => {
		const error = new SchemaValidationError('ORM-SV-3100', {
			entity: 'User',
			relation: 'profile',
		});

		expect(error.message).toContain("for relation 'User'.'profile'");
	});
});
