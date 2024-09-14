import callsites from 'callsites';
import { LoggerProxy, type IDataObject, LOG_LEVELS } from 'n8n-workflow';
import { basename } from 'path';
import { Service } from 'typedi';
import { inspect } from 'util';
import winston from 'winston';

import config from '@/config';
import debugModule from 'debug';
import { GlobalConfig } from '@n8n/config';
import { InvalidLogScopeError } from './errors/invalid-log-scope.error';

const noOp = () => {};

const LOG_SCOPES = ['n8n:concurrency', 'n8n:license'] as const;

type LogScope = (typeof LOG_SCOPES)[number];

type ScopedLogger = debugModule.Debugger;

@Service()
export class Logger {
	private logger: winston.Logger;

	private scopedLoggers: Map<LogScope, ScopedLogger> = new Map();

	constructor(private readonly globalConfig: GlobalConfig) {
		const level = config.getEnv('logs.level');

		this.logger = winston.createLogger({
			level,
			silent: level === 'silent',
		});

		// Change all methods with higher log-level to no-op
		for (const levelName of LOG_LEVELS) {
			if (this.logger.levels[levelName] > this.logger.levels[level]) {
				Object.defineProperty(this, levelName, { value: noOp });
			}
		}

		const output = config
			.getEnv('logs.output')
			.split(',')
			.map((line) => line.trim());

		if (output.includes('console')) {
			let format: winston.Logform.Format;
			if (level === 'debug') {
				format = winston.format.combine(
					winston.format.metadata(),
					winston.format.timestamp(),
					winston.format.colorize({ all: true }),

					winston.format.printf(({ level: logLevel, message, timestamp, metadata }) => {
						return `${timestamp} | ${logLevel.padEnd(18)} | ${message}${
							// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
							Object.keys(metadata).length ? ` ${JSON.stringify(inspect(metadata))}` : ''
						}`;
					}),
				);
			} else {
				format = winston.format.printf(({ message }: { message: string }) => message);
			}

			this.logger.add(
				new winston.transports.Console({
					format,
				}),
			);
		}

		if (output.includes('file')) {
			const fileLogFormat = winston.format.combine(
				winston.format.timestamp(),
				winston.format.metadata(),
				winston.format.json(),
			);
			this.logger.add(
				new winston.transports.File({
					filename: config.getEnv('logs.file.location'),
					format: fileLogFormat,
					maxsize: config.getEnv('logs.file.fileSizeMax') * 1048576, // config * 1mb
					maxFiles: config.getEnv('logs.file.fileCountMax'),
				}),
			);
		}

		LoggerProxy.init(this);

		this.setupScopedLoggers();
	}

	private setupScopedLoggers() {
		const { scopes: scopesStr } = this.globalConfig.debug.logging;

		if (scopesStr === '') return;

		if (scopesStr === '*' || scopesStr === 'n8n:*') {
			debugModule.enable(scopesStr);

			for (const scope of LOG_SCOPES) {
				this.scopedLoggers.set(scope, debugModule(scope));
			}

			return;
		}

		const scopes = scopesStr.split(',');

		this.validateScopes(scopes);

		debugModule.enable(scopesStr);

		for (const scope of scopes) {
			this.scopedLoggers.set(scope, debugModule(scope));
		}
	}

	private validateScopes(candidates: string[]): asserts candidates is LogScope[] {
		const invalid = candidates.filter((c) => !LOG_SCOPES.includes(c as LogScope));

		if (invalid.length > 0) throw new InvalidLogScopeError(invalid);
	}

	private log(level: (typeof LOG_LEVELS)[number], message: string, meta: object = {}): void {
		const callsite = callsites();
		// We are using the third array element as the structure is as follows:
		// [0]: this file
		// [1]: Should be Logger
		// [2]: Should point to the caller.
		// Note: getting line number is useless because at this point
		// We are in runtime, so it means we are looking at compiled js files
		const logDetails = {} as IDataObject;
		if (callsite[2] !== undefined) {
			logDetails.file = basename(callsite[2].getFileName() || '');
			const functionName = callsite[2].getFunctionName();
			if (functionName) {
				logDetails.function = functionName;
			}
		}
		this.logger.log(level, message, { ...meta, ...logDetails });
	}

	// Convenience methods below

	error(message: string, meta: object = {}): void {
		this.log('error', message, meta);
	}

	warn(message: string, meta: object = {}): void {
		this.log('warn', message, meta);
	}

	info(message: string, meta: object = {}): void {
		this.log('info', message, meta);
	}

	debug(message: string, meta: object = {}): void {
		this.log('debug', message, meta);
	}

	scopedDebugLog(scope: LogScope, message: string, meta?: object) {
		this.log('debug', message, meta);

		let scopedLogger = this.scopedLoggers.get(scope);

		if (!scopedLogger) {
			scopedLogger = debugModule(scope);
			this.scopedLoggers.set(scope, scopedLogger);
		}

		if (meta) scopedLogger(message, meta);
		else scopedLogger(message);
	}
}
