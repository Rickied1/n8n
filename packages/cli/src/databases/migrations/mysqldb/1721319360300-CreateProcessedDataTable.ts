import type { MigrationContext, ReversibleMigration } from '@db/types';

export class CreateProcessedDataTable1721319360300 implements ReversibleMigration {
	async up({ queryRunner, tablePrefix }: MigrationContext) {
		await queryRunner.query(
			`CREATE TABLE ${tablePrefix}processed_data (\`value\` varchar(255) NOT NULL, \`context\` varchar(255) NOT NULL, \`workflowId\` varchar(255) NOT NULL, \`createdAt\` TIMESTAMP(3), \`updatedAt\` TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), CONSTRAINT \`PK_2ee85375a902774232874d314e4\` PRIMARY KEY (\`value\`, \`context\`, \`workflowId\`))`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX \`IDX_${tablePrefix}2ee85375a902774232874d314e\` ON ${tablePrefix}processed_data (\`workflowId\`, \`context\`, \`value\`) `,
		);
	}

	async down({ queryRunner, tablePrefix }: MigrationContext) {
		await queryRunner.query(`DROP TABLE ${tablePrefix}processed_data`);
	}
}
