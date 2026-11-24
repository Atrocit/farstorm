import { inspect } from 'node:util';
import { describe, expect, it } from 'vitest';
import { LazyRelationPromise } from '../../src/relations/LazyRelationPromise';

const settle = () => new Promise<void>(resolve => { setTimeout(resolve, 5); });

describe('LazyRelationPromise', () => {
	it('does not load until it is consumed', async () => {
		let loads = 0;
		const promise = new LazyRelationPromise(async () => ++loads);
		await settle();
		expect(loads).toBe(0);

		expect(await promise).toBe(1);
		expect(await promise).toBe(1);
		expect(loads).toBe(1);
	});

	it('stays silent about a failing load nobody asked for', async () => {
		const unhandled: unknown[] = [];
		const listener = (reason: unknown) => unhandled.push(reason);
		process.on('unhandledRejection', listener);

		try {
			const ignored = new LazyRelationPromise(async () => { throw new Error('Unreachable'); });
			const consumed = new LazyRelationPromise(async () => { throw new Error('Failed to load'); });
			await expect(consumed).rejects.toThrowError('Failed to load');
			await settle();
			expect(ignored).toBeInstanceOf(Promise);
		} finally {
			process.off('unhandledRejection', listener);
		}

		expect(unhandled).toEqual([]);
	});

	it('shows its real state when inspected', async () => {
		const promise = new LazyRelationPromise(async () => 'loaded');
		expect(inspect(promise)).toContain('<pending>');

		await promise;
		expect(inspect(promise)).toContain(`'loaded'`);
	});

	it('derives plain promises', () => {
		const promise = new LazyRelationPromise(async () => 'loaded');
		expect(promise.finally(() => {}).constructor).toBe(Promise);
		expect(promise.then(() => {}).constructor).toBe(Promise);
	});

	it('only reports a target for relation promises that have one', () => {
		const target = { entity: 'User', id: '7' };
		expect(LazyRelationPromise.targetOf(new LazyRelationPromise(async () => null, target))).toEqual(target);
		expect(LazyRelationPromise.targetOf(new LazyRelationPromise(async () => null))).toBeNull();
		expect(LazyRelationPromise.targetOf(Promise.resolve(target))).toBeNull();
		expect(LazyRelationPromise.targetOf(target)).toBeNull();
		expect(LazyRelationPromise.targetOf(null)).toBeNull();
		expect(LazyRelationPromise.targetOf(undefined)).toBeNull();
		expect(LazyRelationPromise.targetOf('7')).toBeNull();
	});
});
