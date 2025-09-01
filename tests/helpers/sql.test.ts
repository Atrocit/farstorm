import { describe, it, test, expect } from 'vitest';
import { sql } from '../../src/helpers/sql.js';

describe('sql tagged template literal', () => {
	it('should work on no params', () => {
		const result = sql`select * from table`;
		expect(result).toEqual({ sql: 'select * from table', params: [] });
	});

	it('should work on string param', () => {
		const result = sql`select * from table where id = ${'id1'}`;
		expect(result).toEqual({ sql: 'select * from table where id = $1', params: [ 'id1' ] });
	});

	it('should work on number param', () => {
		const result = sql`select * from table where id = ${42}`;
		expect(result).toEqual({ sql: 'select * from table where id = $1', params: [ 42 ] });
	});

	it('should work on Date param', () => {
		const date = new Date();
		const result = sql`select * from table where id = ${date}`;
		expect(result).toEqual({ sql: 'select * from table where id = $1', params: [ date ] });
	});

	it('should work on arbitrary JSON param', () => {
		const result = sql`select * from table where id = ${[ 1, 'a', true ]}`;
		expect(result).toEqual({ sql: 'select * from table where id = $1', params: [ [ 1, 'a', true ] ] });
	});

	it('should work on multiple params', () => {
		const result = sql`select * from table where id = ${42} and name = ${'name'}`;
		expect(result).toEqual({ sql: 'select * from table where id = $1 and name = $2', params: [ 42, 'name' ] });
	});

	it('should work on multiple params with same value', () => {
		const result = sql`select * from table where id = ${42} and name = ${42}`;
		expect(result).toEqual({ sql: 'select * from table where id = $1 and name = $2', params: [ 42, 42 ] });
	});
});
