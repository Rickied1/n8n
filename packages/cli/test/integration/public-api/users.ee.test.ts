import validator from 'validator';
import { v4 as uuid } from 'uuid';

import { License } from '@/license';

import { mockInstance } from '../../shared/mocking';
import * as utils from '../shared/utils/';
import * as testDb from '../shared/test-db';
import {
	createMemberWithApiKey,
	createOwnerWithApiKey,
	createUser,
	createUserShell,
} from '../shared/db/users';
import type { SuperAgentTest } from '../shared/types';
import { createTeamProject, linkUserToProject } from '@test-integration/db/projects';
import type { User } from '@/databases/entities/user';

mockInstance(License, {
	getUsersLimit: jest.fn().mockReturnValue(-1),
});

const testServer = utils.setupTestServer({ endpointGroups: ['publicApi'] });

beforeEach(async () => {
	await testDb.truncate([
		'ApiKeys',
		'SharedCredentials',
		'SharedWorkflow',
		'Workflow',
		'Credentials',
		'User',
	]);
});

describe('With license unlimited quota:users', () => {
	describe('GET /users', () => {
		test('should fail due to missing API Key', async () => {
			const authOwnerAgent = testServer.publicApiAgentWithApiKey('');
			await authOwnerAgent.get('/users').expect(401);
		});

		test('should fail due to invalid API Key', async () => {
			const authOwnerAgent = testServer.publicApiAgentWithApiKey('invalid-key');
			await authOwnerAgent.get('/users').expect(401);
		});

		test.only('should fail due to member trying to access owner only endpoint', async () => {
			console.log(createUserShell);

			const { apiKey } = await createOwnerWithApiKey();

			const authMemberAgent = testServer.publicApiAgentWithApiKey(apiKey);
			await authMemberAgent.get('/users').expect(403);
		});

		test.only('should return all users', async () => {
			const { apiKey } = await createOwnerWithApiKey();

			const authOwnerAgent = testServer.publicApiAgentWithApiKey(apiKey);

			await createUser();

			const response = await authOwnerAgent.get('/users').expect(200);
			expect(response.body.data.length).toBe(2);
			expect(response.body.nextCursor).toBeNull();

			for (const user of response.body.data) {
				const {
					id,
					email,
					firstName,
					lastName,
					personalizationAnswers,
					role,
					password,
					isPending,
					createdAt,
					updatedAt,
				} = user;

				expect(validator.isUUID(id)).toBe(true);
				expect(email).toBeDefined();
				expect(firstName).toBeDefined();
				expect(lastName).toBeDefined();
				expect(personalizationAnswers).toBeUndefined();
				expect(password).toBeUndefined();
				expect(isPending).toBe(false);
				expect(role).toBeUndefined();
				expect(createdAt).toBeDefined();
				expect(updatedAt).toBeDefined();
			}
		});

		it('should return users filtered by project ID', async () => {
			/**
			 * Arrange
			 */
			const [{ apiKey }, firstMember, secondMember, thirdMember] = await Promise.all([
				createOwnerWithApiKey(),
				createUser({ role: 'global:member' }),
				createUser({ role: 'global:member' }),
				createUser({ role: 'global:member' }),
			]);

			const [firstProject, secondProject] = await Promise.all([
				createTeamProject(),
				createTeamProject(),
			]);

			await Promise.all([
				linkUserToProject(firstMember, firstProject, 'project:admin'),
				linkUserToProject(secondMember, firstProject, 'project:viewer'),
				linkUserToProject(thirdMember, secondProject, 'project:admin'),
			]);

			/**
			 * Act
			 */
			const response = await testServer.publicApiAgentWithApiKey(apiKey).get('/users').query({
				projectId: firstProject.id,
			});

			/**
			 * Assert
			 */
			expect(response.status).toBe(200);
			expect(response.body.data.length).toBe(2);
			expect(response.body.nextCursor).toBeNull();
			expect(response.body.data.map((user: User) => user.id)).toEqual(
				expect.arrayContaining([firstMember.id, secondMember.id]),
			);
		});
	});

	describe('GET /users/:id', () => {
		test('should fail due to missing API Key', async () => {
			const { owner } = await createOwnerWithApiKey();
			const authOwnerAgent = testServer.publicApiAgentWithApiKey('');
			await authOwnerAgent.get(`/users/${owner.id}`).expect(401);
		});

		test('should fail due to invalid API Key', async () => {
			const { owner } = await createOwnerWithApiKey();
			const authOwnerAgent = testServer.publicApiAgentWithApiKey('invalid-key');
			await authOwnerAgent.get(`/users/${owner.id}`).expect(401);
		});

		test('should fail due to member trying to access owner only endpoint', async () => {
			const { member, apiKey } = await createMemberWithApiKey();
			const authMemberAgent = testServer.publicApiAgentWithApiKey(apiKey);
			await authMemberAgent.get(`/users/${member.id}`).expect(403);
		});
		test('should return 404 for non-existing id ', async () => {
			const { apiKey } = await createOwnerWithApiKey();
			const authOwnerAgent = testServer.publicApiAgentWithApiKey(apiKey);
			await authOwnerAgent.get(`/users/${uuid()}`).expect(404);
		});

		test('should return a pending user', async () => {
			const { apiKey } = await createOwnerWithApiKey();

			const { id: memberId } = await createUserShell('global:member');

			const authOwnerAgent = testServer.publicApiAgentWithApiKey(apiKey);
			const response = await authOwnerAgent.get(`/users/${memberId}`).expect(200);

			const {
				id,
				email,
				firstName,
				lastName,
				personalizationAnswers,
				role,
				password,
				isPending,
				createdAt,
				updatedAt,
			} = response.body;

			expect(validator.isUUID(id)).toBe(true);
			expect(email).toBeDefined();
			expect(firstName).toBeDefined();
			expect(lastName).toBeDefined();
			expect(personalizationAnswers).toBeUndefined();
			expect(password).toBeUndefined();
			expect(role).toBeUndefined();
			expect(createdAt).toBeDefined();
			expect(isPending).toBeDefined();
			expect(isPending).toBeTruthy();
			expect(updatedAt).toBeDefined();
		});
	});

	describe('GET /users/:email', () => {
		test('with non-existing email should return 404', async () => {
			const { apiKey } = await createOwnerWithApiKey();
			const authOwnerAgent = testServer.publicApiAgentWithApiKey(apiKey);
			await authOwnerAgent.get('/users/jhondoe@gmail.com').expect(404);
		});

		test('should return a user', async () => {
			const { owner, apiKey } = await createOwnerWithApiKey();
			const authOwnerAgent = testServer.publicApiAgentWithApiKey(apiKey);
			const response = await authOwnerAgent.get(`/users/${owner.email}`).expect(200);

			const {
				id,
				email,
				firstName,
				lastName,
				personalizationAnswers,
				role,
				password,
				isPending,
				createdAt,
				updatedAt,
			} = response.body;

			expect(validator.isUUID(id)).toBe(true);
			expect(email).toBeDefined();
			expect(firstName).toBeDefined();
			expect(lastName).toBeDefined();
			expect(personalizationAnswers).toBeUndefined();
			expect(password).toBeUndefined();
			expect(isPending).toBe(false);
			expect(role).toBeUndefined();
			expect(createdAt).toBeDefined();
			expect(updatedAt).toBeDefined();
		});
	});
});

describe('With license without quota:users', () => {
	let authOwnerAgent: SuperAgentTest;

	beforeEach(async () => {
		mockInstance(License, { getUsersLimit: jest.fn().mockReturnValue(null) });

		const { apiKey } = await createOwnerWithApiKey();
		authOwnerAgent = testServer.publicApiAgentWithApiKey(apiKey);
	});

	test('GET /users should fail due to invalid license', async () => {
		await authOwnerAgent.get('/users').expect(403);
	});

	test('GET /users/:id should fail due to invalid license', async () => {
		await authOwnerAgent.get(`/users/${uuid()}`).expect(403);
	});
});