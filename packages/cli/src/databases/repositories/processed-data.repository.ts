import { Service } from 'typedi';
import { DataSource, Repository } from '@n8n/typeorm';
import { ProcessedData } from '../entities/processed-data';

@Service()
export class ProcessedDataRepository extends Repository<ProcessedData> {
	constructor(dataSource: DataSource) {
		super(ProcessedData, dataSource.manager);
	}
}
