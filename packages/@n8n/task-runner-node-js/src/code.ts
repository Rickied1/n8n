import { runInNewContext, type Context } from 'node:vm';

import {
	type INode,
	type INodeType,
	type ITaskDataConnections,
	WorkflowDataProxy,
	type WorkflowParameters,
} from 'n8n-workflow';
import {
	type IDataObject,
	type IExecuteData,
	type INodeExecutionData,
	type INodeParameters,
	type IRunExecutionData,
	type IWorkflowDataProxyAdditionalKeys,
	Workflow,
	type WorkflowExecuteMode,
} from 'n8n-workflow';

import type { RunnerMessage } from './runner-types';
import { type Task, TaskRunner } from './task-runner';

interface JSExecSettings {
	code: string;

	// For workflow data proxy
	mode: WorkflowExecuteMode;
}

export interface AllData {
	workflow: Omit<WorkflowParameters, 'nodeTypes'>;
	inputData: ITaskDataConnections;
	node: INode;

	runExecutionData: IRunExecutionData;
	runIndex: number;
	itemIndex: number;
	activeNodeName: string;
	connectionInputData: INodeExecutionData[];
	siblingParameters: INodeParameters;
	mode: WorkflowExecuteMode;
	executeData?: IExecuteData;
	defaultReturnRunIndex: number;
	selfData: IDataObject;
	contextNodeName: string;
}

const getAdditionalKeys = (): IWorkflowDataProxyAdditionalKeys => {
	return {};
};

export class JsTaskRunner extends TaskRunner {
	constructor(taskType: string, wsUrl: string, maxConcurrency: number, name?: string) {
		super(taskType, wsUrl, maxConcurrency, name ?? 'Test Runner');
	}

	async executeTask(task: Task<JSExecSettings>): Promise<RunnerMessage.ToBroker.TaskDone['data']> {
		const allData = await this.requestData<AllData>(task.taskId, 'all');

		const settings = task.settings!;

		const workflowParams = allData.workflow;
		const workflow = new Workflow({
			...workflowParams,
			nodeTypes: {
				getByNameAndVersion() {
					return undefined as unknown as INodeType;
				},
				getByName() {
					return undefined as unknown as INodeType;
				},
				getKnownTypes() {
					return {};
				},
			},
		});

		const dataProxy = new WorkflowDataProxy(
			workflow,
			allData.runExecutionData,
			allData.runIndex,
			allData.itemIndex,
			allData.activeNodeName,
			allData.connectionInputData,
			allData.siblingParameters,
			settings.mode,
			getAdditionalKeys(),
			allData.executeData,
			allData.defaultReturnRunIndex,
			allData.selfData,
			allData.contextNodeName,
		);

		const context: Context = {
			require,
			module: {},

			...dataProxy.getDataProxy(),
			...this.buildRpcCallObject(task.taskId),
		};

		const result = (await runInNewContext(
			`module.exports = async function() {${task.settings!.code}\n}()`,
			context,
		)) as RunnerMessage.ToBroker.TaskDone['data'];

		return result;
	}
}
