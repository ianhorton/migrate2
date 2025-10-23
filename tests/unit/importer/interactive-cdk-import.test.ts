/**
 * Unit tests for InteractiveCDKImport
 * Sprint 3: Interactive Import & Checkpoints
 */

import { InteractiveCDKImport } from '../../../src/modules/importer/interactive-cdk-import';
import { ImportDefinition, ImportResult } from '../../../src/types/checkpoint';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

// Mock child_process
jest.mock('child_process');
const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;

// Mock fs.promises
jest.mock('fs/promises', () => ({
  access: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn(),
  writeFile: jest.fn()
}));

describe('InteractiveCDKImport', () => {
  let importer: InteractiveCDKImport;
  let mockProcess: any;

  beforeEach(() => {
    importer = new InteractiveCDKImport();

    // Create mock process
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.stdin = {
      write: jest.fn()
    };
    mockProcess.kill = jest.fn();

    mockSpawn.mockReturnValue(mockProcess as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('runImport', () => {
    const cdkProjectPath = '/path/to/cdk/project';
    const importDefinitions: ImportDefinition[] = [
      {
        logicalId: 'UsersTable',
        resourceType: 'AWS::DynamoDB::Table',
        physicalId: 'users-table-dev',
        resourceIdentifier: { TableName: 'users-table-dev' }
      },
      {
        logicalId: 'ApiRole',
        resourceType: 'AWS::IAM::Role',
        physicalId: 'api-role-dev',
        resourceIdentifier: { RoleName: 'api-role-dev' }
      }
    ];

    it('should successfully run CDK import process', async () => {
      // Simulate successful import
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Starting import...'));
        mockProcess.stdout.emit('data', Buffer.from('✅ UsersTable successfully imported'));
        mockProcess.stdout.emit('data', Buffer.from('✅ ApiRole successfully imported'));
        mockProcess.emit('close', 0);
      }, 10);

      const result = await importer.runImport(cdkProjectPath, importDefinitions);

      expect(result.status).toBe('success');
      expect(result.resourcesImported).toBe(2);
      expect(mockSpawn).toHaveBeenCalledWith(
        'npx',
        ['cdk', 'import', '--force'],
        expect.objectContaining({
          cwd: cdkProjectPath,
          stdio: ['pipe', 'pipe', 'pipe']
        })
      );
    });

    it('should handle CDK import prompts and auto-respond', async () => {
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('import with identifier:'));

        // Give time for auto-response
        setTimeout(() => {
          mockProcess.emit('close', 0);
        }, 20);
      }, 10);

      await importer.runImport(cdkProjectPath, importDefinitions);

      expect(mockProcess.stdin.write).toHaveBeenCalledWith(
        expect.stringContaining('TableName=users-table-dev')
      );
    });

    it('should handle import failures', async () => {
      setTimeout(() => {
        mockProcess.stderr.emit('data', Buffer.from('Error: Import failed'));
        mockProcess.emit('close', 1);
      }, 10);

      const result = await importer.runImport(cdkProjectPath, importDefinitions);

      expect(result.status).toBe('failed');
      expect(result.errorCode).toBe(1);
    });

    it('should return dry-run success without spawning process', async () => {
      const result = await importer.runImport(
        cdkProjectPath,
        importDefinitions,
        { dryRun: true }
      );

      expect(result.status).toBe('success');
      expect(result.resourcesImported).toBe(2);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('should handle process errors', async () => {
      setTimeout(() => {
        mockProcess.emit('error', new Error('Process spawn failed'));
      }, 10);

      await expect(
        importer.runImport(cdkProjectPath, importDefinitions)
      ).rejects.toThrow('Process spawn failed');
    });

    it('should track import progress', async () => {
      setTimeout(() => {
        mockProcess.stdout.emit('data', Buffer.from('Line 1'));
        mockProcess.stdout.emit('data', Buffer.from('Line 2'));

        setTimeout(() => {
          const progress = importer.getProgress();
          expect(progress.outputLines).toBeGreaterThan(0);
          expect(progress.isRunning).toBe(true);

          mockProcess.emit('close', 0);
        }, 20);
      }, 10);

      await importer.runImport(cdkProjectPath, importDefinitions);
    });
  });

  describe('handlePrompt', () => {
    it('should return physical ID for physical resource id prompt', async () => {
      const definition: ImportDefinition = {
        logicalId: 'MyTable',
        resourceType: 'AWS::DynamoDB::Table',
        physicalId: 'my-table-dev',
        resourceIdentifier: { TableName: 'my-table-dev' }
      };

      const response = await importer.handlePrompt(
        'Enter physical resource id:',
        definition
      );

      expect(response).toBe('my-table-dev');
    });

    it('should format identifier for identifier prompt', async () => {
      const definition: ImportDefinition = {
        logicalId: 'MyRole',
        resourceType: 'AWS::IAM::Role',
        physicalId: 'my-role',
        resourceIdentifier: { RoleName: 'my-role', Path: '/service/' }
      };

      const response = await importer.handlePrompt(
        'Enter the identifier:',
        definition
      );

      expect(response).toContain('RoleName=my-role');
      expect(response).toContain('Path=/service/');
    });
  });

  describe('abort', () => {
    it('should kill running process', () => {
      mockSpawn.mockReturnValue(mockProcess as any);

      // Start import (don't await to keep process running)
      importer.runImport('/path', []);

      // Abort
      importer.abort();

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle abort when no process is running', () => {
      // Should not throw
      expect(() => importer.abort()).not.toThrow();
    });
  });

  describe('getProgress', () => {
    it('should return progress information', () => {
      const progress = importer.getProgress();

      expect(progress).toHaveProperty('outputLines');
      expect(progress).toHaveProperty('errors');
      expect(progress).toHaveProperty('isRunning');
      expect(progress.isRunning).toBe(false);
    });
  });

  describe('formatImportResponse', () => {
    it('should format multiple identifiers correctly', async () => {
      const definition: ImportDefinition = {
        logicalId: 'TestResource',
        resourceType: 'AWS::Test::Resource',
        physicalId: 'test-id',
        resourceIdentifier: {
          key1: 'value1',
          key2: 'value2',
          key3: 'value3'
        }
      };

      const response = await importer.handlePrompt('Enter identifier:', definition);

      expect(response).toContain('key1=value1');
      expect(response).toContain('key2=value2');
      expect(response).toContain('key3=value3');
    });
  });
});
